import { describe, expect, it } from 'vitest'
import { scheduleApi, scheduleStartLabel } from '../src/schedule'
import { goliveApi } from '../src/golive'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

function demo() {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client, api: scheduleApi(client), golive: goliveApi(client) }
}

async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected a refusal')
}

const HOUR = 3_600_000

describe('the stream schedule', () => {
  it('starts empty and lists plans soonest first', async () => {
    const { api } = demo()
    expect(await api.list()).toEqual([])
    await api.create({
      info: { title: 'Later' },
      platforms: ['twitch'],
      start_ms: Date.now() + 5 * HOUR,
    })
    await api.create({
      info: { title: 'Sooner' },
      platforms: ['twitch'],
      start_ms: Date.now() + 2 * HOUR,
    })
    expect((await api.list()).map((s) => s.info.title)).toEqual(['Sooner', 'Later'])
  })

  it('names the field when a plan is wrong, as the engine does', async () => {
    const { api } = demo()
    const past = await refusal(
      api.create({ info: { title: 'x' }, platforms: ['twitch'], start_ms: 1000 }),
    )
    expect(past.status).toBe(400)
    expect(past.message).toMatch(/^start/)
    const untitled = await refusal(
      api.create({ info: { title: '' }, platforms: ['twitch'], start_ms: Date.now() + HOUR }),
    )
    expect(untitled.message).toMatch(/^title/)
    const none = await refusal(
      api.create({ info: { title: 'x' }, platforms: [], start_ms: Date.now() + HOUR }),
    )
    expect(none.message).toMatch(/^platforms/)
  })

  it('makes a broadcast where a platform has them and says why not for the rest', async () => {
    const { api } = demo()
    const s = await api.create({
      info: { title: 'Friday show' },
      platforms: ['youtube', 'twitch', 'facebook'],
      start_ms: Date.now() + 2 * HOUR,
    })
    const by = (p: string) => s.broadcasts.find((b) => b.platform === p)
    expect(by('youtube')?.id).toBeTruthy()
    expect(by('twitch')?.note).toMatch(/reminder/)
    expect(by('facebook')?.note).toMatch(/Connect/)
    expect(s.reminded).toBe(false)
  })

  it('deletes a plan and answers 404 for an unknown one', async () => {
    const { api } = demo()
    const s = await api.create({
      info: { title: 'x' },
      platforms: ['kick'],
      start_ms: Date.now() + HOUR,
    })
    await api.remove(s.id)
    expect(await api.list()).toEqual([])
    expect((await refusal(api.remove(s.id))).status).toBe(404)
  })

  it('never goes live by itself', async () => {
    const { api, golive } = demo()
    await api.create({ info: { title: 'x' }, platforms: ['youtube'], start_ms: Date.now() + 1000 })
    expect((await golive.view()).live).toBe(false)
  })

  it('says when a plan starts in plain words', () => {
    const now = Date.UTC(2026, 10, 22, 12, 0)
    expect(scheduleStartLabel(now + 5 * 60_000, now)).toBe('in 5 minutes')
    expect(scheduleStartLabel(now + 60_000, now)).toBe('in 1 minute')
    expect(scheduleStartLabel(now + 3 * HOUR, now)).toBe('in 3 hours')
    expect(scheduleStartLabel(now - 60_000, now)).toBe('now')
  })
})

describe('pasted servers for X, Instagram and Facebook', () => {
  it('keeps the brand and never returns the key', async () => {
    const { golive } = demo()
    const d = await golive.addCustom(
      'Instagram',
      'rtmps://live-upload.instagram.com:443/rtmp/',
      'SECRET',
      'main',
      'instagram',
    )
    expect(d.brand).toBe('instagram')
    expect(JSON.stringify(d)).not.toContain('SECRET')
    const err = await refusal(
      golive.addCustom('T', 'rtmp://a.example/live', 'k', 'main', 'tiktok' as never),
    )
    expect(err.message).toMatch(/^brand/)
  })
})
