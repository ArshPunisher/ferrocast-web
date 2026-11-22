// Clips and highlights (API.md §4 "Clips and highlights", Phase 3 #23): the recordings folder as
// a library, trims, compilations, captions and sending to YouTube. The same checks as the
// engine (`crates/engine/src/clips`), so the form says what is wrong before a call is made.

import type { FerroClient } from './client'
import type { YoutubePrivacy } from './types'

export type ClipKind = 'recording' | 'replay' | 'vertical' | 'edit'

export interface Clip {
  /** The file name: what every call names a clip by (never a path). */
  id: string
  /** The file name without its extension. */
  name: string
  kind: ClipKind
  ext: string
  size: number
  /** When it was last written (Unix ms). */
  modified: number
  has_captions: boolean
}

export interface ClipsOverview {
  /** Where the clips are (shown, never edited here). */
  folder: string
  /** FFmpeg is here: trims, compilations, pictures and captions need it. */
  ffmpeg_ready: boolean
  /** YouTube is connected: sending a clip needs it. */
  youtube_connected: boolean
  clips: Clip[]
}

export interface ClipProbe {
  duration_ms: number | null
  width: number | null
  height: number | null
  has_audio: boolean
  has_video: boolean
}

export type ClipJobKind = 'trim' | 'compile' | 'captions' | 'burn' | 'upload'
export type ClipJobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface ClipJob {
  id: string
  kind: ClipJobKind
  /** What it is doing, in words ("Trim Replay 21-00"). */
  label: string
  state: ClipJobState
  /** 0 to 1. */
  progress: number
  /** The clip it made (its id). */
  output?: string
  /** A YouTube address, for an upload. */
  link?: string
  error?: { message: string; hint: string }
  started: number
  finished?: number
}

export interface Cue {
  start_ms: number
  end_ms: number
  text: string
}

export interface TrimInput {
  start_ms: number
  end_ms: number
  name?: string
  /** Encode again for an exact cut (slower) instead of cutting at the nearest keyframe. */
  precise?: boolean
}

export interface CompileInput {
  clips: string[]
  /** 0 to 3 seconds (0: a cut). */
  crossfade_s?: number
  /** One loudness for the whole (EBU R128). */
  normalize?: boolean
  name?: string
}

export interface UploadInput {
  title: string
  description?: string
  tags?: string[]
  privacy?: YoutubePrivacy
  category_id?: string
  made_for_kids?: boolean
  shorts?: boolean
}

export const MAX_COMPILE = 20
export const MAX_FADE_S = 3
export const MAX_NAME = 120
export const MAX_CUES = 2000
export const MAX_CUE_CHARS = 300
export const UPLOAD_MAX_TITLE = 100
export const UPLOAD_MAX_DESCRIPTION = 5000
export const MAX_TAGS = 30
export const MAX_TAG_CHARS = 60
/** A trim keeps at least this much (ms). */
export const MIN_TRIM_MS = 200
/**
 * What YouTube allows an app by default: 100 uploads a day (`videos.insert` has its own "Video
 * Uploads" quota bucket, 1 unit a call, apart from the 10,000 units other calls share; the
 * Data API's own page, checked 22 Nov 2026). It was 1,600 of the 10,000 before.
 */
export const DAILY_UPLOADS = 100
/** A Short is square or tall and at most this long (ms). */
export const SHORTS_MAX_MS = 180_000

/** Why this isn't a usable file name, or null. */
export function clipNameProblem(raw: string): string | null {
  const n = raw
  if (!n.trim()) return 'Give it a name.'
  if (n !== n.trim() || n.startsWith('.') || n.endsWith('.'))
    return 'No space or dot at the start or end.'
  if ([...n].length > MAX_NAME) return `Up to ${MAX_NAME} characters.`
  // eslint-disable-next-line no-control-regex
  if (/[/\\:*?"<>|\u0000-\u001f\u007f]/.test(n) || n.includes('..'))
    return 'No / \\ : * ? " < > | or control characters.'
  const stem = n.split('.')[0]?.toUpperCase() ?? ''
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) return 'Windows keeps that name.'
  return null
}

/** Why this part can't be kept, or null. */
export function trimProblem(startMs: number, endMs: number, totalMs: number | null): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Set the start and the end.'
  if (startMs < 0) return 'The start can not be before the clip.'
  if (totalMs !== null && startMs >= totalMs) return 'The start is past the end of the clip.'
  const end = totalMs === null ? endMs : Math.min(endMs, totalMs)
  if (end <= startMs) return 'The end must be after the start.'
  if (end - startMs < MIN_TRIM_MS) return 'Keep at least a fifth of a second.'
  return null
}

/** Why this compilation can't be made, or null. `lengths`: each picked clip's length in ms. */
export function compileProblem(input: CompileInput, lengths: (number | null)[]): string | null {
  if (input.clips.length < 2 || input.clips.length > MAX_COMPILE)
    return `Pick 2 to ${MAX_COMPILE} clips.`
  const fade = input.crossfade_s ?? 0
  if (!Number.isFinite(fade) || fade < 0 || fade > MAX_FADE_S)
    return `A crossfade is 0 to ${MAX_FADE_S} seconds.`
  if (fade > 0 && lengths.some((l) => l !== null && l < fade * 2000))
    return 'A clip is shorter than twice the crossfade. Use a shorter fade.'
  if (input.name !== undefined && input.name.trim() !== '') return clipNameProblem(input.name)
  return null
}

/** Why this can't be sent as it is, or null. */
export function uploadProblem(i: UploadInput): string | null {
  const title = i.title.trim()
  if (!title) return 'Give the video a title.'
  if ([...title].length > UPLOAD_MAX_TITLE)
    return `The title is up to ${UPLOAD_MAX_TITLE} characters.`
  if (/[<>]/.test(i.title) || /[<>]/.test(i.description ?? ''))
    return 'YouTube does not accept < or >.'
  // The engine counts bytes, and a Short gets "\n\n#Shorts" (9 bytes) added unless it has one.
  const description = i.description ?? ''
  const tagged = /#shorts/i.test(title) || /#shorts/i.test(description)
  const room = i.shorts && !tagged ? 9 : 0
  if (new TextEncoder().encode(description).length + room > UPLOAD_MAX_DESCRIPTION)
    return `The description is up to ${UPLOAD_MAX_DESCRIPTION} characters.`
  const tags = i.tags ?? []
  if (tags.length > MAX_TAGS) return `Up to ${MAX_TAGS} tags.`
  if (tags.some((t) => [...t].length > MAX_TAG_CHARS || /[,<>]/.test(t)))
    return `A tag is up to ${MAX_TAG_CHARS} characters, with no comma or < >.`
  return null
}

/** Why this clip can't go up as a Short, or null. */
export function shortsProblem(p: ClipProbe | undefined): string | null {
  if (!p) return null
  if (p.width !== null && p.height !== null && p.height < p.width)
    return 'A Short is square or tall. Make a vertical copy first.'
  if (p.duration_ms !== null && p.duration_ms > SHORTS_MAX_MS)
    return 'A Short is at most 3 minutes. Trim the clip first.'
  return null
}

/** Whether a call is told the cues are fine, or why not (the engine's checks). */
export function cuesProblem(cues: Cue[]): string | null {
  if (cues.length > MAX_CUES) return `There can be up to ${MAX_CUES} captions.`
  for (const [i, c] of cues.entries()) {
    const n = i + 1
    if (!Number.isInteger(c.start_ms) || !Number.isInteger(c.end_ms) || c.start_ms < 0)
      return `Caption ${n} needs a start and an end, in whole milliseconds, not before 0.`
    if (c.end_ms <= c.start_ms) return `Caption ${n} ends before it starts.`
    if (c.end_ms > 24 * 3_600_000) return `Caption ${n} is past 24 hours.`
    const t = c.text.trim()
    if (!t || [...t].length > MAX_CUE_CHARS)
      return `Caption ${n} needs 1 to ${MAX_CUE_CHARS} characters.`
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(t) || t.includes('\n\n'))
      return `Caption ${n} has a character that can't be in it.`
    const prev = cues[i - 1]
    if (prev && c.start_ms < prev.start_ms) return `Caption ${n} starts before the one above it.`
  }
  return null
}

/** "1:02", or "1:02:03" past an hour. */
export function clipLength(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–'
  const s = Math.max(0, Math.round(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return h > 0
    ? `${h}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
    : `${Math.floor(s / 60)}:${p(s % 60)}`
}

/** "12.3 MB" (the space can't break the line). */
export function clipSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00a0B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}\u00a0${units[i]}`
}

/** A time as typed: "1:02.5", "62.5", "0:00:01.250" → ms, or null when it isn't a time. */
export function parseClock(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d+(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(t)) return null
  const [main = '', frac = ''] = t.split('.')
  const parts = main.split(':').map(Number)
  let secs = 0
  for (const p of parts) secs = secs * 60 + p
  if (parts.length > 1 && parts.slice(1).some((p) => p > 59)) return null
  return secs * 1000 + (frac ? Number(frac.padEnd(3, '0')) : 0)
}

/** ms → "1:02.500" (what `parseClock` reads back). */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const s = Math.floor(total / 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const h = Math.floor(s / 3600)
  const body = `${p(Math.floor(s / 60) % 60)}:${p(s % 60)}.${p(total % 1000, 3)}`
  return h > 0 ? `${h}:${body}` : `${Math.floor(s / 60)}:${p(s % 60)}.${p(total % 1000, 3)}`
}

/** The cues as the text of an .srt file (what the engine writes). */
export function renderSrt(cues: Cue[]): string {
  const t = (ms: number) => {
    const p = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
  }
  return cues
    .map((c, i) => `${i + 1}\n${t(c.start_ms)} --> ${t(c.end_ms)}\n${c.text.trim()}\n\n`)
    .join('')
}

/** A job still waiting or running. */
export const jobActive = (j: Pick<ClipJob, 'state'>): boolean =>
  j.state === 'queued' || j.state === 'running'

/** The Clips calls on a dashboard client. */
export function clipsApi(c: FerroClient) {
  const enc = encodeURIComponent
  const get = <T>(p: string) => c.request<T>('GET', `/api/v1${p}`)
  const post = <T>(p: string, b: unknown = {}) => c.request<T>('POST', `/api/v1${p}`, b)
  const put = <T>(p: string, b: unknown) => c.request<T>('PUT', `/api/v1${p}`, b)
  const del = (p: string) => c.request<void>('DELETE', `/api/v1${p}`)
  return {
    list: (q?: string) => get<ClipsOverview>(q ? `/clips?q=${enc(q)}` : '/clips'),
    probe: (id: string) => get<ClipProbe>(`/clips/${enc(id)}`),
    /** A small JPEG as a data URL. */
    thumbnail: (id: string) => get<{ image: string }>(`/clips/${enc(id)}/thumbnail`),
    rename: (id: string, name: string) => put<Clip>(`/clips/${enc(id)}`, { name }),
    /** To the Trash. */
    remove: (id: string) => del(`/clips/${enc(id)}`),
    trim: (id: string, b: TrimInput) => post<ClipJob>(`/clips/${enc(id)}/trim`, b),
    compile: (b: CompileInput) => post<ClipJob>('/clips/compile', b),
    captions: (id: string) => get<{ cues: Cue[] }>(`/clips/${enc(id)}/captions`),
    saveCaptions: (id: string, cues: Cue[]) =>
      put<{ cues: Cue[] }>(`/clips/${enc(id)}/captions`, { cues }),
    makeCaptions: (id: string) => post<ClipJob>(`/clips/${enc(id)}/captions`),
    burnCaptions: (id: string, name?: string) =>
      post<ClipJob>(`/clips/${enc(id)}/captions/burn`, name ? { name } : {}),
    upload: (id: string, b: UploadInput) => post<ClipJob>(`/clips/${enc(id)}/upload`, b),
    jobs: () => get<{ jobs: ClipJob[] }>('/clips/jobs'),
    job: (id: string) => get<ClipJob>(`/clips/jobs/${enc(id)}`),
    cancelJob: (id: string) => post<ClipJob>(`/clips/jobs/${enc(id)}/cancel`),
    dismissJob: (id: string) => del(`/clips/jobs/${enc(id)}`),
  }
}

export type ClipsApi = ReturnType<typeof clipsApi>
