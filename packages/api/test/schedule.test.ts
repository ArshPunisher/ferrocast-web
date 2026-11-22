import { describe, expect, it } from 'vitest'
import { scheduleApi, scheduleStartLabel } from '../src/schedule'
import { goliveApi } from '../src/golive'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { DemoSchedule } from '../src/demo/features/schedule'

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

describe('the demo schedule is the engine’s', () => {
  it('refuses a start that is not a sane time, a long title, and tidies control characters', async () => {
    const { api } = demo()
    for (const start_ms of [1e20, Date.now() + 367 * 24 * HOUR]) {
      const e = await refusal(api.create({ info: { title: 'x' }, platforms: ['twitch'], start_ms }))
      expect(e.message, String(start_ms)).toMatch(/^start/)
    }
    const long = await refusal(
      api.create({
        info: { title: 'x'.repeat(141) },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      }),
    )
    expect(long.message).toMatch(/^title.*140/)
    const tidy = await api.create({
      info: { title: '  Hello\u0007World\n ' },
      platforms: ['twitch'],
      start_ms: Date.now() + HOUR,
    })
    expect(tidy.info.title).toBe('Hello World')
  })

  function direct(connected = false) {
    const later: { fn: () => void; ms: number }[] = []
    const frames: { data: { message: string } }[] = []
    const s = new DemoSchedule(
      {
        later: (fn: () => void, ms: number) => later.push({ fn, ms }),
        broadcastLive: (f: unknown) => frames.push(f as { data: { message: string } }),
      },
      () => connected,
    )
    const call = (m: string, seg: string[], body?: unknown) => s.route(m, seg, body) as never
    return { later, frames, call }
  }

  it('says its reminder in the engine’s words', () => {
    const { later, frames, call } = direct()
    call('POST', ['schedule'], {
      info: { title: 'Friday' },
      platforms: ['twitch'],
      start_ms: Date.now() + 2 * HOUR,
      remind_minutes: 10,
    })
    const realNow = Date.now
    const start = Date.now() + 2 * HOUR
    // The reminder fires 10 minutes before the start.
    Date.now = () => start - 10 * 60_000
    try {
      later[0]!.fn()
    } finally {
      Date.now = realNow
    }
    expect(frames[0]!.data.message).toBe('"Friday" starts in 10 minutes.')
  })

  it('drops a plan a day past its start when the list is read', () => {
    const { call } = direct()
    const made = call('POST', ['schedule'], {
      info: { title: 'Old' },
      platforms: ['twitch'],
      start_ms: Date.now() + HOUR,
    }) as { start_ms: number }
    expect((call('GET', ['schedule']) as { streams: unknown[] }).streams).toHaveLength(1)
    const realNow = Date.now
    Date.now = () => made.start_ms + 25 * HOUR
    try {
      expect((call('GET', ['schedule']) as { streams: unknown[] }).streams).toHaveLength(0)
    } finally {
      Date.now = realNow
    }
  })

  it('checks the 50-plan limit before it builds anything', () => {
    const { call } = direct()
    for (let i = 0; i < 50; i++)
      call('POST', ['schedule'], {
        info: { title: `S${i}` },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      })
    expect(() =>
      call('POST', ['schedule'], {
        info: { title: 'one more' },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      }),
    ).toThrow(/50/)
  })
})

describe('connecting a platform again', () => {
  it('signs in again, as the engine does, instead of refusing', async () => {
    const { engine } = demo()
    const post = () =>
      engine.fetch(`${engine.base}/api/v1/accounts/facebook/connect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${DEMO_TOKEN}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
    expect((await post()).status).toBe(200)
    // Let the demo sign-in finish, so the platform shows connected, then connect once more.
    await new Promise((r) => setTimeout(r, 2700))
    expect((await post()).status).toBe(200)
  })
})

describe('what review found in the demo schedule', () => {
  it('answers a created plan with 201, as the engine does', async () => {
    const { engine } = demo()
    const res = await engine.fetch(`${engine.base}/api/v1/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DEMO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        info: { title: 'x' },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      }),
    })
    expect(res.status).toBe(201)
  })

  it('counts only plans that have not expired toward the limit of 50', async () => {
    const { api } = demo()
    for (let i = 0; i < 50; i++)
      await api.create({
        info: { title: `S${i}` },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      })
    const realNow = Date.now
    // A day and a bit later all 50 have expired: a new plan is not refused for their sake.
    Date.now = () => realNow() + 26 * HOUR
    try {
      const made = await api.create({
        info: { title: 'new' },
        platforms: ['twitch'],
        start_ms: Date.now() + HOUR,
      })
      expect(made.info.title).toBe('new')
    } finally {
      Date.now = realNow
    }
  })
})
