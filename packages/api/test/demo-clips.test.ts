import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { clipsApi, type ClipJob, type ClipsApi } from '../src/clips'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import type { ApiError } from '../src/errors'

const err = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected an error')
}

let engine: DemoEngine
let client: FerroClient
let api: ClipsApi

beforeEach(() => {
  vi.useFakeTimers()
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  api = clipsApi(client)
})
afterEach(() => {
  engine.dispose()
  vi.useRealTimers()
})

/** Lets a job run to its end. */
async function finish(id: string): Promise<ClipJob> {
  for (let i = 0; i < 60; i++) {
    await vi.advanceTimersByTimeAsync(500)
    const j = await api.job(id)
    if (j.state !== 'queued' && j.state !== 'running') return j
  }
  throw new Error('the job never finished')
}

describe('the demo clips library', () => {
  it('lists, searches, renames, and deletes', async () => {
    const o = await api.list()
    expect(o.ffmpeg_ready).toBe(true)
    expect(o.clips.length).toBeGreaterThanOrEqual(5)
    expect(o.clips.map((c) => c.modified)).toEqual([...o.clips.map((c) => c.modified)].sort((a, b) => b - a))
    expect((await api.list('boss')).clips.map((c) => c.name)).toEqual(['Boss fight'])
    expect((await api.list('zzz')).clips).toEqual([])
    const first = o.clips[0]!
    const renamed = await api.rename(first.id, 'Best play')
    expect(renamed.id).toBe(`Best play.${first.ext}`)
    expect((await err(api.rename(renamed.id, 'Boss fight'))).status).toBe(409) // same extension? mp4 vs mp4
    expect((await err(api.rename(renamed.id, '../x'))).code).toBe('bad_clip_name')
    expect((await err(api.rename('nope.mp4', 'x'))).code).toBe('clip_not_found')
    await api.remove(renamed.id)
    expect((await err(api.remove(renamed.id))).code).toBe('clip_not_found')
  })

  it('gives a picture and the facts of a clip', async () => {
    const id = (await api.list()).clips[0]!.id
    expect((await api.thumbnail(id)).image).toMatch(/^data:image\/svg\+xml/)
    const p = await api.probe(id)
    expect(p.has_video).toBe(true)
    expect((await err(api.thumbnail('nope.mp4'))).code).toBe('clip_not_found')
  })
})

describe('the demo jobs', () => {
  it('trims into a new clip, with progress', async () => {
    const id = (await api.list('Replay 2026-11-22 21')).clips[0]!.id
    const job = await api.trim(id, { start_ms: 5000, end_ms: 15_000 })
    expect(job.state === 'queued' || job.state === 'running').toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    const mid = await api.job(job.id)
    expect(mid.progress).toBeGreaterThan(0)
    expect(mid.progress).toBeLessThan(1)
    const done = await finish(job.id)
    expect(done.state).toBe('done')
    expect(done.output).toBe('Replay 2026-11-22 21-04-12 trimmed.mp4')
    expect((await api.probe(done.output!)).duration_ms).toBe(10_000)
    expect((await err(api.trim(id, { start_ms: 99_000, end_ms: 100_000 }))).code).toBe('bad_trim')
  })

  it('runs one at a time and a cancel stops the one running and the one waiting', async () => {
    const [a, b] = (await api.list()).clips
    const j1 = await api.compile({ clips: [a!.id, b!.id] })
    const j2 = await api.compile({ clips: [b!.id, a!.id], name: 'Second' })
    await vi.advanceTimersByTimeAsync(500)
    expect((await api.job(j1.id)).state).toBe('running')
    expect((await api.job(j2.id)).state).toBe('queued')
    expect((await err(api.dismissJob(j1.id))).status).toBe(409)
    expect((await api.cancelJob(j2.id)).state).toBe('cancelled')
    expect((await api.cancelJob(j1.id)).state).toBe('cancelled')
    await vi.advanceTimersByTimeAsync(5000)
    expect((await api.list('compilation')).clips).toEqual([])
    expect((await api.list('Second')).clips).toEqual([])
    await api.dismissJob(j1.id)
    expect((await err(api.job(j1.id))).code).toBe('job_not_found')
  })

  it('compiles with a crossfade into one clip', async () => {
    const o = await api.list()
    const [a, b] = o.clips.filter((c) => c.kind === 'replay')
    const job = await api.compile({ clips: [a!.id, b!.id], crossfade_s: 1, normalize: true })
    const done = await finish(job.id)
    expect(done.output).toBe('Compilation.mp4')
    expect((await api.probe('Compilation.mp4')).duration_ms).toBe(38_000 + 29_000 - 1000)
    for (const bad of [{ clips: [a!.id] }, { clips: [a!.id, b!.id], crossfade_s: 9 }])
      expect((await err(api.compile(bad))).code).toBe('bad_compile')
    expect((await err(api.compile({ clips: [a!.id, 'nope.mp4'] }))).code).toBe('clip_not_found')
  })

  it('makes, edits and burns captions', async () => {
    const id = (await api.list('Replay 2026-11-22 20')).clips[0]!.id
    expect((await api.captions(id)).cues).toEqual([])
    expect((await err(api.burnCaptions(id))).code).toBe('no_captions')
    const made = await finish((await api.makeCaptions(id)).id)
    expect(made.state).toBe('done')
    const cues = (await api.captions(id)).cues
    expect(cues.length).toBeGreaterThan(0)
    expect((await err(api.makeCaptions(id))).status).toBe(409)
    const edited = [{ ...cues[0]!, text: 'Fixed words' }]
    expect((await api.saveCaptions(id, edited)).cues[0]!.text).toBe('Fixed words')
    expect((await err(api.saveCaptions(id, [{ start_ms: 5, end_ms: 1, text: 'x' }]))).code).toBe('bad_captions')
    const burned = await finish((await api.burnCaptions(id, 'With words')).id)
    expect(burned.output).toBe('With words.mp4')
  })

  it('sends to YouTube privately by default, and says in words when it can not', async () => {
    const id = (await api.list('Boss')).clips[0]!.id
    expect((await err(api.upload(id, { title: '' }))).code).toBe('bad_upload')
    const ok = await finish((await api.upload(id, { title: 'Boss fight' })).id)
    expect(ok.state).toBe('done')
    expect(ok.link).toMatch(/^https:\/\/www\.youtube\.com\//)
    // The demo's trigger for a used-up quota.
    const quota = await finish((await api.upload(id, { title: 'quota please' })).id)
    expect(quota.state).toBe('failed')
    expect(quota.error?.hint).toMatch(/midnight/)
    // A Short must be tall and short.
    expect((await err(api.upload(id, { title: 'x', shorts: true }))).code).toBe('bad_upload')
    const vertical = (await api.list('vertical')).clips[0]!.id
    expect((await finish((await api.upload(vertical, { title: 'x', shorts: true })).id)).link).toContain('/shorts')
    // Not connected: refused before a job starts.
    await client.disconnect('youtube')
    expect((await err(api.upload(id, { title: 'x' }))).code).toBe('youtube_not_connected')
    expect((await api.list()).youtube_connected).toBe(false)
  })
})
