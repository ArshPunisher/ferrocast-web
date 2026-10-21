import { afterEach, describe, expect, it } from 'vitest'
import { bestSlot, mainCurrency, metricOf, timeSlots } from '../src/insights'
import { historyApi, type HistoryStream } from '../src/history'
import { insightsApi } from '../src/insights'
import { smartApi } from '../src/smart'
import { webAccountApi } from '../src/account'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

const DAY = 86_400_000
const s = (over: Partial<HistoryStream> = {}): HistoryStream => ({
  platform: 'twitch',
  key: 'twitch:1',
  started_at: 0,
  ended_at: 3_600_000,
  title: null,
  category: null,
  peak_viewers: 150,
  avg_viewers: 100,
  chat_lines: 10,
  chatters: 3,
  new_chatters: 1,
  follows: 2,
  subs: 1,
  tips: [],
  platform_value: [],
  updated_at: 0,
  ...over,
})

describe('insights helpers', () => {
  it('slots by weekday and four-hour block, weighted by length', () => {
    const dh = (ms: number) => ({
      day: Math.floor(ms / DAY) % 7,
      hour: Math.floor((ms % DAY) / 3_600_000),
    })
    const at = (day: number, hour: number) => day * DAY + hour * 3_600_000
    const list = [
      s({ key: 'a', started_at: at(4, 20), ended_at: at(4, 22), avg_viewers: 80 }),
      s({ key: 'b', started_at: at(4, 21), ended_at: at(4, 22), avg_viewers: 50 }),
      s({ key: 'c', started_at: at(1, 9), ended_at: at(1, 10), avg_viewers: 200 }),
    ]
    const slots = timeSlots(list, at(6, 0), dh)
    expect(slots).toHaveLength(42)
    const fri = slots.find((x) => x.day === 4 && x.hour === 20)
    expect(fri).toMatchObject({ streams: 2, avg_viewers: 70 }) // (80×120 + 50×60) / 180
    // One stream proves nothing: the best slot is one streamed at least twice.
    expect(bestSlot(slots)).toMatchObject({ day: 4, hour: 20 })
    expect(bestSlot(timeSlots(list.slice(0, 2), 0, dh))).toBeNull()
  })

  it('tips are counted in one currency, never converted', () => {
    const list = [
      s({ tips: [{ currency: 'INR', minor: 500 }] }),
      s({
        tips: [
          { currency: 'INR', minor: 100 },
          { currency: 'USD', minor: 300 },
        ],
      }),
    ]
    expect(mainCurrency(list)).toBe('INR')
    expect(metricOf(list[1]!, 'tips', 'INR')).toBe(100)
    expect(metricOf(list[1]!, 'chat', null)).toBe(10)
    expect(mainCurrency([s()])).toBeNull()
  })
})

describe('free accounts, samples, supporters and smart features in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => engine?.dispose())
  const client = (e: DemoEngine) =>
    new FerroClient({ base: e.base, token: DEMO_TOKEN, fetch: e.fetch })
  const fails = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      if (e instanceof ApiError) return e
    }
    throw new Error('expected an ApiError')
  }

  it('a signed-in free account keeps 30 days; neither Pro nor an account is a 403', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, pro: { features: true } })
    const e = await fails(historyApi(client(engine)).list())
    expect([e.status, e.code]).toEqual([403, 'account_required'])
    engine.dispose()
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { features: true },
      account: 'signed_in',
    })
    const now = Date.now()
    const v = await historyApi(client(engine)).list({ from: now - 365 * DAY })
    expect([v.plan, v.keep_days, v.limited]).toEqual(['free', 30, true])
    expect(v.streams.every((x) => x.started_at >= now - 31 * DAY)).toBe(true)
    const first = v.streams[0]!
    const samples = await historyApi(client(engine)).samples(first.platform, first.key)
    expect(samples.samples.length).toBeGreaterThan(5)
    expect(samples.samples.every((x) => x.viewers <= first.peak_viewers)).toBe(true)
    const nf = await fails(historyApi(client(engine)).samples('twitch', 'twitch:1'))
    expect([nf.status, nf.code]).toEqual([404, 'stream_not_found'])
  })

  it('supporters check their range', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const now = Date.now()
    const sup = await insightsApi(client(engine)).supporters({ from: now - 30 * DAY })
    expect(sup.subscribers.length).toBeGreaterThan(0)
    const bad = await fails(insightsApi(client(engine)).supporters({ from: now, to: now - 1 }))
    expect([bad.status, bad.code]).toEqual([422, 'invalid_range'])
  })

  it('smart settings, approval, actions and the recap gate', async () => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { active: true, features: true },
    })
    const api = smartApi(client(engine))
    let v = await api.view()
    expect(v.active).toBe(true)
    expect((await fails(api.save({ act_timeout_s: 2 }))).status).toBe(400)
    v = await api.save({ about: 'Live at 9pm.' })
    expect(v.about_approved).toBe(false)
    expect((await fails(api.approve('Live at 10pm.'))).code).toBe('about_changed')
    expect((await api.approve('Live at 9pm.')).about_approved).toBe(true)
    const log = await api.log()
    const del = log.items.find((x) => x.action === 'delete' && x.state === 'suggested')!
    expect((await api.apply(del.id)).state).toBe('done')
    expect((await fails(api.undo(del.id))).code).toBe('cant_undo')
    const done = log.items.find((x) => x.state === 'done')!
    expect((await api.undo(done.id)).state).toBe('undone')
    expect((await fails(api.dismiss('nope'))).status).toBe(404)
    engine.setPro({ active: false })
    expect((await fails(api.writeRecap())).code).toBe('pro_required')
  })
})

describe('YouTube from the cloud on the web host', () => {
  it('calls the relay with the CSRF token and passes its answers', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const f = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      if (url.endsWith('/v1/account'))
        return new Response(
          JSON.stringify({ state: 'signed_in', csrf_token: 'tok', account: { id: 'ac_1' } }),
          { status: 200 },
        )
      if (url.endsWith('/r/v1/pro/youtube/connect'))
        return new Response(
          JSON.stringify({
            error: { code: 'pro_required', message: 'Part of Pro.', hint: 'See Plans.' },
          }),
          { status: 402 },
        )
      return new Response(
        JSON.stringify({ available: true, pro: true, bot_on: true, channel: null, quota: null }),
        { status: 200 },
      )
    }
    const web = webAccountApi('https://remote.example', f as never)
    await web.status()
    expect((await web.youtubeBot(true)).bot_on).toBe(true)
    const put = calls.find((c) => c.url.endsWith('/r/v1/pro/youtube/bot'))!
    expect(put.init.method).toBe('PUT')
    expect((put.init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok')
    let err: unknown
    try {
      await web.youtubeConnect()
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('pro_required')
  })
})
