import { afterEach, describe, expect, it } from 'vitest'
import {
  historyApi,
  historyRange,
  historySummary,
  weekStart,
  weeklyTotals,
  type HistoryStream,
} from '../src/history'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { demoStreams, historyCsv } from '../src/demo/features/history'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

const DAY = 86_400_000
const MONDAY = Date.UTC(2026, 9, 19) // 2026-10-19 00:00 UTC, a Monday

const s = (over: Partial<HistoryStream> = {}): HistoryStream => ({
  platform: 'twitch',
  key: 'twitch:1',
  started_at: MONDAY + DAY,
  ended_at: MONDAY + DAY + 60 * 60_000,
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

describe('history helpers', () => {
  it('weeks start on Monday UTC, like the relay', () => {
    expect(weekStart(MONDAY + 12 * 3_600_000)).toBe(MONDAY)
    expect(weekStart(MONDAY + 6 * DAY + 23 * 3_600_000)).toBe(MONDAY)
    expect(weekStart(MONDAY - 1)).toBe(MONDAY - 7 * DAY)
  })

  it('weekly totals cover every week and weight the average by length', () => {
    const streams = [
      s(),
      s({
        platform: 'kick',
        key: 'kick:1',
        ended_at: MONDAY + DAY + 180 * 60_000,
        avg_viewers: 20,
        peak_viewers: 30,
      }),
      s({
        platform: 'youtube',
        started_at: MONDAY - 12 * DAY,
        ended_at: MONDAY - 12 * DAY + 30 * 60_000,
      }),
    ]
    const w = weeklyTotals(streams, MONDAY - 14 * DAY, MONDAY + 3 * DAY, MONDAY + 3 * DAY)
    expect(w.map((x) => x.streams)).toEqual([1, 0, 2])
    expect(w[2]).toMatchObject({
      week_start: MONDAY,
      minutes: 240,
      peak_viewers: 150,
      avg_viewers: 40,
    })
    expect(w[2]?.by_platform).toEqual({ twitch: 1, kick: 1, youtube: 0 })
  })

  it('sums a range and picks chip ranges', () => {
    const sum = historySummary([s(), s({ platform: 'kick', follows: 5 })], 0)
    expect(sum).toMatchObject({ streams: 2, hours: 2, avg_viewers: 100, follows: 7, subs: 2 })
    expect(historySummary([], 0).avg_viewers).toBe(0)
    expect(historyRange('3m', 1000 * DAY)).toEqual({ from: 909 * DAY, to: 1000 * DAY })
  })

  it('the CSV matches the relay: quoted, formulas defused, money in major units', () => {
    const csv = historyCsv(
      [
        s({
          title: '=HYPERLINK("x")',
          tips: [
            { currency: 'INR', minor: 50_050 },
            { currency: 'JPY', minor: 500 },
          ],
        }),
      ],
      0,
    )
    const [head, row] = csv.split('\r\n')
    expect(head).toMatch(/^platform,started_utc,ended_utc,minutes,title/)
    expect(row).toBe(
      'twitch,2026-10-20 00:00,2026-10-20 01:00,60,"\'=HYPERLINK(""x"")","",150,100,10,3,1,2,1,"INR 500.50; JPY 500",""',
    )
  })

  it('the demo year is stable and believable', () => {
    const a = demoStreams(MONDAY)
    expect(a).toEqual(demoStreams(MONDAY))
    expect(a.length).toBeGreaterThan(300)
    for (const x of a) {
      expect(x.avg_viewers).toBeLessThanOrEqual(x.peak_viewers)
      expect(x.new_chatters).toBeLessThanOrEqual(x.chatters)
      expect(x.ended_at).toBeGreaterThan(x.started_at)
    }
  })
})

describe('demo history', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const api = (e: DemoEngine) =>
    historyApi(new FerroClient({ base: e.base, token: DEMO_TOKEN, fetch: e.fetch }))
  const fails = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return e as ApiError
    }
    throw new Error('expected an error')
  }

  it('is 402 without Pro, like the relay', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, pro: { salesOpen: true } })
    const e = await fails(api(engine).list())
    expect([e.status, e.code]).toEqual([402, 'pro_required'])
    engine.setPro({ active: true })
    expect((await fails(api(engine).list())).status).toBe(402) // the relay hasn't got it
  })

  it('lists streams with weekly totals, filters, and refuses bad ranges', async () => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { active: true, features: true },
    })
    const now = Date.now()
    const four = await api(engine).list(historyRange('4w', now))
    expect(four.streams.length).toBeGreaterThan(10)
    expect(four.weekly.length).toBeGreaterThanOrEqual(4)
    const year = await api(engine).list({ ...historyRange('1y', now), platform: 'kick' })
    expect(year.streams.every((x) => x.platform === 'kick')).toBe(true)
    expect(year.weekly.length).toBeGreaterThanOrEqual(52)
    expect((await fails(api(engine).list({ from: 10, to: 5 }))).code).toBe('invalid_range')
    expect((await fails(api(engine).list({ from: 0, to: now }))).code).toBe('invalid_range')
    const csv = await (await api(engine).exportCsv(historyRange('4w', now))).text()
    expect(csv.split('\r\n').filter(Boolean).length).toBe(four.streams.length + 1)
  })

  it('can start with no streams yet', async () => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      history: 'empty',
      pro: { active: true, features: true },
    })
    const v = await api(engine).list()
    expect(v.streams).toEqual([])
    expect(v.weekly.every((w) => w.streams === 0)).toBe(true)
  })
})
