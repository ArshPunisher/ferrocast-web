// Clips and highlights in the demo engine, matching the engine (`crates/engine/src/clips`,
// API.md §4 "Clips and highlights"): a pretend recordings folder, thumbnails, trims,
// compilations, captions and a pretend YouTube upload. Jobs run one at a time and move on a
// timer; a cancel stops them. Nothing is ever sent anywhere.
//
// Demo triggers, so every state can be seen: an upload whose title has "quota" fails the way a
// used-up YouTube quota does; "Boss fight" already has captions; YouTube is connected when the
// demo's YouTube is.

import {
  MAX_NAME,
  clipNameProblem,
  compileProblem,
  cuesProblem,
  jobActive,
  trimProblem,
  uploadProblem,
  type Clip,
  type ClipJob,
  type ClipKind,
  type ClipProbe,
  type ClipsOverview,
  type CompileInput,
  type Cue,
  type TrimInput,
  type UploadInput,
} from '../../clips'
import type { ChatPlatform } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type Routed } from './host'

export interface ClipsHost {
  now(): number
  /** Runs `fn` after `ms` (cancelled when the demo is disposed). */
  later(fn: () => void, ms: number): void
  connectedChat(): ChatPlatform[]
}

interface Entry {
  clip: Clip
  probe: ClipProbe
  cues: Cue[]
}

const EXTS = ['mp4', 'mov', 'mkv']
const MIN = 60_000

function refuse(status: number, code: string, message: string, hint: string): HttpError {
  return new HttpError(status, code, message, hint)
}

const noClip = () =>
  refuse(
    404,
    'clip_not_found',
    "That clip isn't in the folder any more.",
    'Reload the list; it may have been moved or deleted.',
  )
const noJob = () =>
  refuse(
    404,
    'job_not_found',
    "That job isn't on the list.",
    'Reload the list; it may have been cleared.',
  )

/** A picture for a clip: a gradient from its name, with a play mark. */
export function demoThumb(name: string, vertical = false): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  const [w, ht] = vertical ? [180, 320] : [320, 180]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h} 55% 38%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 60% 18%)"/></linearGradient></defs>` +
    `<rect width="${w}" height="${ht}" fill="url(#g)"/>` +
    `<circle cx="${w / 2}" cy="${ht / 2}" r="22" fill="rgba(255,255,255,.2)"/>` +
    `<path d="M${w / 2 - 7} ${ht / 2 - 11}L${w / 2 + 12} ${ht / 2}L${w / 2 - 7} ${ht / 2 + 11}Z" fill="#fff"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export class DemoClips {
  private entries: Entry[] = []
  private jobs: ClipJob[] = []
  private seq = 0
  /** The job being worked on, if any. */
  private running: string | null = null
  private readonly payloads = new Map<string, () => void>()
  private readonly stepMs: number

  constructor(
    private readonly host: ClipsHost,
    /** ms between a job's steps (tests make it small). */
    stepMs?: number,
  ) {
    this.stepMs = stepMs ?? 450
    const t = host.now()
    const seed = (
      name: string,
      ext: string,
      kind: ClipKind,
      ago: number,
      ms: number,
      mb: number,
      size: [number, number] = [1920, 1080],
      cues: Cue[] = [],
    ) =>
      this.entries.push({
        clip: {
          id: `${name}.${ext}`,
          name,
          kind,
          ext,
          size: mb * 1024 * 1024,
          modified: t - ago,
          has_captions: cues.length > 0,
        },
        probe: {
          duration_ms: ms,
          width: size[0],
          height: size[1],
          has_audio: true,
          has_video: true,
        },
        cues,
      })
    seed('Replay 2026-11-22 21-04-12', 'mp4', 'replay', 4 * MIN, 38_000, 24)
    seed('Replay 2026-11-22 20-31-55', 'mp4', 'replay', 37 * MIN, 29_000, 19)
    seed('Clutch round vertical', 'mp4', 'vertical', 52 * MIN, 41_000, 12, [1080, 1920])
    seed('Stream 2026-11-22 20-00', 'mkv', 'recording', 70 * MIN, 62 * MIN, 3100)
    seed(
      'Boss fight',
      'mp4',
      'recording',
      26 * 60 * MIN,
      4 * MIN + 12_000,
      310,
      [1920, 1080],
      [
        { start_ms: 800, end_ms: 3200, text: 'Okay, this is the one.' },
        { start_ms: 3400, end_ms: 6100, text: 'Watch the left side!' },
        { start_ms: 6400, end_ms: 9000, text: 'And that is how you do it.' },
      ],
    )
  }

  private find(id: string): Entry {
    const e = this.entries.find((x) => x.clip.id === id)
    if (!e) throw noClip()
    return e
  }

  private overview(q: string | null): ClipsOverview {
    const needle = (q ?? '').trim().toLowerCase()
    const clips = this.entries
      .map((e) => e.clip)
      .filter((c) => !needle || c.name.toLowerCase().includes(needle))
      .sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id))
    return {
      folder: '/Users/demo/Movies/Ferrocast',
      ffmpeg_ready: true,
      youtube_connected: this.host.connectedChat().includes('youtube'),
      clips: clone(clips),
    }
  }

  private freeName(stem: string, ext: string): string {
    for (let n = 1; n < 1000; n++) {
      const s = n === 1 ? stem : `${stem} ${n}`
      if (!this.entries.some((e) => e.clip.id === `${s}.${ext}`)) return s
    }
    return stem
  }

  private add(stem: string, kind: ClipKind, probe: ClipProbe): string {
    const name = this.freeName(stem, 'mp4')
    const ms = probe.duration_ms ?? 0
    this.entries.push({
      clip: {
        id: `${name}.mp4`,
        name,
        kind,
        ext: 'mp4',
        size: Math.round((ms / 1000) * 0.6 * 1024 * 1024),
        modified: this.host.now(),
        has_captions: false,
      },
      probe,
      cues: [],
    })
    return `${name}.mp4`
  }

  /** What a vertical-or-not clip is, by its size. */
  thumbOf(id: string): string {
    const e = this.find(id)
    return demoThumb(e.clip.name, (e.probe.height ?? 0) > (e.probe.width ?? 0))
  }

  // ------------------------------------------------------------ jobs

  private start(kind: ClipJob['kind'], label: string, work: (job: ClipJob) => void): ClipJob {
    const job: ClipJob = {
      id: `job-${++this.seq}`,
      kind,
      label,
      state: 'queued',
      progress: 0,
      started: this.host.now(),
    }
    this.jobs.unshift(job)
    if (this.jobs.length > 50)
      this.jobs = this.jobs
        .filter((j) => jobActive(j))
        .concat(this.jobs.filter((j) => !jobActive(j)).slice(0, 40))
    this.payloads.set(job.id, () => work(job))
    this.next()
    return clone(job)
  }

  /** The oldest waiting job runs when none does. */
  private next(): void {
    if (this.running) return
    const job = [...this.jobs].reverse().find((j) => j.state === 'queued')
    if (!job) return
    this.running = job.id
    job.state = 'running'
    const step = () => {
      if (job.state !== 'running') return
      job.progress = Math.min(0.97, job.progress + 0.16 + (this.host.now() % 5) / 100)
      if (job.progress < 0.9) return void this.host.later(step, this.stepMs)
      this.payloads.get(job.id)?.()
      this.payloads.delete(job.id)
      if (job.state === 'running') {
        job.state = 'done'
        job.progress = 1
        job.finished = this.host.now()
      }
      this.running = null
      this.next()
    }
    this.host.later(step, this.stepMs)
  }

  private job(id: string): ClipJob {
    const j = this.jobs.find((x) => x.id === id)
    if (!j) throw noJob()
    return j
  }

  private cancel(id: string): ClipJob {
    const j = this.job(id)
    if (jobActive(j)) {
      const wasRunning = j.state === 'running'
      j.state = 'cancelled'
      j.finished = this.host.now()
      this.payloads.delete(id)
      if (wasRunning) {
        this.running = null
        this.next()
      }
    }
    return clone(j)
  }

  // ------------------------------------------------------------ calls

  private rename(id: string, body: unknown): Clip {
    const e = this.find(id)
    const name =
      typeof (body as { name?: unknown })?.name === 'string'
        ? (body as { name: string }).name
        : null
    if (name === null) throw refuse(400, 'invalid', 'Send { name }.', 'Give the clip a name.')
    const bad = clipNameProblem(name)
    if (bad)
      throw refuse(
        400,
        'bad_clip_name',
        `That isn't a usable file name: ${bad}`,
        'Use letters, numbers, spaces, - and _.',
      )
    const nextId = `${name}.${e.clip.ext}`
    if (nextId === e.clip.id) return clone(e.clip)
    if (this.entries.some((x) => x.clip.id === nextId))
      throw refuse(
        409,
        'clip_name_taken',
        'A clip with that name is already there.',
        'Pick another name.',
      )
    e.clip = { ...e.clip, id: nextId, name }
    return clone(e.clip)
  }

  private trim(id: string, body: unknown): ClipJob {
    const e = this.find(id)
    const b = body as Partial<TrimInput>
    const total = e.probe.duration_ms
    const bad = trimProblem(Number(b.start_ms), Number(b.end_ms), total)
    if (bad) throw refuse(400, 'bad_trim', bad, 'Pick a part inside the clip.')
    const start = Number(b.start_ms)
    const end = Math.min(Number(b.end_ms), total ?? Number(b.end_ms))
    const named =
      typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `${e.clip.name} trimmed`
    const nameBad = clipNameProblem(named)
    if (nameBad)
      throw refuse(
        400,
        'bad_clip_name',
        `That isn't a usable file name: ${nameBad}`,
        'Pick another name.',
      )
    return this.start('trim', `Trim ${e.clip.name}`, (job) => {
      job.output = this.add(named, 'edit', { ...e.probe, duration_ms: end - start })
    })
  }

  private compile(body: unknown): ClipJob {
    const b = body as Partial<CompileInput>
    const ids = Array.isArray(b.clips) ? b.clips.map(String) : []
    const entries = ids.map((i) => this.find(i))
    const input: CompileInput = {
      clips: ids,
      crossfade_s: b.crossfade_s ?? 0,
      normalize: !!b.normalize,
      ...(b.name ? { name: b.name } : {}),
    }
    const bad = compileProblem(
      input,
      entries.map((e) => e.probe.duration_ms),
    )
    if (bad) throw refuse(400, 'bad_compile', bad, 'Pick the clips to put together.')
    const fade = input.crossfade_s ?? 0
    const total =
      entries.reduce((s, e) => s + (e.probe.duration_ms ?? 0), 0) -
      fade * 1000 * (entries.length - 1)
    const first = entries[0]?.probe
    return this.start('compile', `Compile ${entries.length} clips`, (job) => {
      job.output = this.add(b.name?.trim() || 'Compilation', 'edit', {
        ...(first as ClipProbe),
        duration_ms: Math.round(total),
      })
    })
  }

  private captions(id: string): { cues: Cue[] } {
    return { cues: clone(this.find(id).cues) }
  }

  private saveCaptions(id: string, body: unknown): { cues: Cue[] } {
    const e = this.find(id)
    const cues = (body as { cues?: unknown })?.cues
    if (!Array.isArray(cues))
      throw refuse(400, 'invalid', 'Send { cues }.', 'Send the captions to save.')
    const list = cues as Cue[]
    const bad = cuesProblem(list)
    if (bad) throw refuse(400, 'bad_captions', bad, 'Fix that caption and save again.')
    e.cues = clone(list)
    e.clip.has_captions = list.length > 0
    return { cues: clone(e.cues) }
  }

  private makeCaptions(id: string): ClipJob {
    const e = this.find(id)
    if (e.cues.length)
      throw new HttpError(409, 'conflict', 'That clip has captions already: edit them instead.')
    return this.start('captions', `Captions for ${e.clip.name}`, () => {
      const len = e.probe.duration_ms ?? 9000
      e.cues = [
        { start_ms: 400, end_ms: Math.min(3000, len), text: 'This is what was said first.' },
        {
          start_ms: Math.min(3200, len - 1),
          end_ms: Math.min(6200, len),
          text: 'And then a little more of it.',
        },
      ].filter((c) => c.end_ms > c.start_ms)
      e.clip.has_captions = e.cues.length > 0
    })
  }

  private burn(id: string, body: unknown): ClipJob {
    const e = this.find(id)
    if (!e.cues.length)
      throw refuse(
        422,
        'no_captions',
        'That clip has no captions yet.',
        'Make them first, then burn them in.',
      )
    const named =
      typeof (body as { name?: unknown })?.name === 'string' &&
      (body as { name: string }).name.trim()
        ? (body as { name: string }).name.trim()
        : `${e.clip.name} captioned`
    const bad = clipNameProblem(named)
    if (bad)
      throw refuse(
        400,
        'bad_clip_name',
        `That isn't a usable file name: ${bad}`,
        'Pick another name.',
      )
    return this.start('burn', `Burn captions into ${e.clip.name}`, (job) => {
      job.output = this.add(named, 'edit', { ...e.probe })
    })
  }

  private upload(id: string, body: unknown): ClipJob {
    const e = this.find(id)
    const b = body as Partial<UploadInput>
    const input: UploadInput = {
      title: typeof b.title === 'string' ? b.title : '',
      description: typeof b.description === 'string' ? b.description : '',
      tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
      privacy: b.privacy ?? 'private',
      shorts: b.shorts === true,
    }
    const bad = uploadProblem(input)
    if (bad) throw refuse(400, 'bad_upload', bad, 'Fix the details and try again.')
    if (!['private', 'unlisted', 'public'].includes(input.privacy ?? ''))
      throw refuse(
        400,
        'bad_upload',
        'Privacy is private, unlisted or public.',
        'Pick one of the three.',
      )
    if (!this.host.connectedChat().includes('youtube'))
      throw refuse(
        422,
        'youtube_not_connected',
        "YouTube isn't connected.",
        'Open Settings, Accounts, and connect YouTube.',
      )
    if (b.shorts) {
      if ((e.probe.height ?? 0) < (e.probe.width ?? 0))
        throw refuse(
          400,
          'bad_upload',
          'A Short is square or tall.',
          'Make a vertical copy first, then send that.',
        )
      if ((e.probe.duration_ms ?? 0) > 180_000)
        throw refuse(400, 'bad_upload', 'A Short is at most 3 minutes.', 'Trim the clip first.')
    }
    const quota = /quota/i.test(input.title)
    return this.start('upload', `Upload ${e.clip.name}`, (job) => {
      if (quota) {
        job.state = 'failed'
        job.finished = this.host.now()
        job.error = {
          message: "YouTube's daily limit for uploads is used up.",
          hint: 'It resets after midnight Pacific time (in about 7 hours). Try again then.',
        }
        return
      }
      job.link = `https://www.youtube.com/${b.shorts ? 'shorts/' : 'watch?v='}demo${job.id.replace('job-', '')}`
    })
  }

  route(method: string, seg: string[], body: unknown, url: URL): Routed {
    if (seg[0] !== 'clips') return NOT_MINE
    const [, a, b, c] = seg
    const n = seg.length
    if (n === 1 && method === 'GET') return this.overview(url.searchParams.get('q'))
    if (n === 2 && a === 'compile' && method === 'POST') return this.compile(body)
    if (a === 'jobs') {
      if (n === 2 && method === 'GET') return { jobs: clone(this.jobs) }
      if (n === 3 && b && method === 'GET') return clone(this.job(b))
      if (n === 4 && b && c === 'cancel' && method === 'POST') return this.cancel(b)
      if (n === 3 && b && method === 'DELETE') {
        const j = this.job(b)
        if (jobActive(j))
          throw new HttpError(409, 'conflict', 'That job is still running: cancel it first.')
        this.jobs = this.jobs.filter((x) => x.id !== j.id)
        return undefined
      }
      return NOT_MINE
    }
    if (!a) return NOT_MINE
    if (n === 2) {
      if (method === 'GET') return clone(this.find(a).probe)
      if (method === 'PUT') return this.rename(a, body)
      if (method === 'DELETE') {
        this.find(a)
        this.entries = this.entries.filter((x) => x.clip.id !== a)
        return undefined
      }
    }
    if (n === 3 && method === 'GET' && b === 'thumbnail') return { image: this.thumbOf(a) }
    if (n === 3 && method === 'POST' && b === 'trim') return this.trim(a, body)
    if (n === 3 && b === 'captions') {
      if (method === 'GET') return this.captions(a)
      if (method === 'PUT') return this.saveCaptions(a, body)
      if (method === 'POST') return this.makeCaptions(a)
    }
    if (n === 3 && method === 'POST' && b === 'upload') return this.upload(a, body)
    if (n === 4 && method === 'POST' && b === 'captions' && c === 'burn') return this.burn(a, body)
    return NOT_MINE
  }
}

export { EXTS as DEMO_CLIP_EXTS, MAX_NAME as DEMO_MAX_NAME }
