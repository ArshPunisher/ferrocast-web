// Stream history in the demo, like the relay (`crates/relay/src/history`): Pro keeps a year,
// a signed-in free account the last 30 days, neither gets 403 `account_required`; the same
// range checks and errors, weekly totals, one stream's viewer samples, and a CSV export. The streams are a
// believable year of a small streamer (Twitch most nights, Kick simulcast, YouTube now and
// then), made from a fixed seed so tests and screenshots are stable.

import {
  HISTORY_PLATFORMS,
  weeklyTotals,
  type HistoryPlatform,
  type HistoryStream,
  type HistoryView,
} from '../../history'
import type { ProView } from '../../pro'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type Routed } from './host'

const DAY = 86_400_000
const MAX_RANGE = 400 * DAY
export const FREE_KEEP_DAYS = 30
export const PRO_KEEP_DAYS = 365

const TITLES = [
  'Ranked grind to Diamond',
  'Chill Sunday, chat and coffee',
  'First look: Hollow Pines',
  'Viewer games night',
  'No-death run, attempt 4',
  'Late night lofi build',
  'Subathon warm-up',
  'Answering your questions',
]
const CATEGORIES = ['VALORANT', 'Just Chatting', 'Minecraft', 'Hollow Pines', 'Elden Ring', null]

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** About 14 months of streams ending `now`, newest first. */
export function demoStreams(now: number, seed = 20261019): HistoryStream[] {
  const r = rng(seed)
  const out: HistoryStream[] = []
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const today = midnight.getTime()
  for (let d = 420; d >= 1; d--) {
    // Five or so nights a week, a little less a year ago.
    const growth = 1 - d / 520
    if (r() > 0.55 + growth * 0.25) continue
    const start =
      today - d * DAY + (18 + Math.floor(r() * 4)) * 3_600_000 + Math.floor(r() * 50) * 60_000
    const minutes = 70 + Math.floor(r() * 200)
    const title = TITLES[Math.floor(r() * TITLES.length)] ?? null
    const category = CATEGORIES[Math.floor(r() * CATEGORIES.length)] ?? null
    const base = Math.round(18 + growth * 70 + r() * 25)
    const platforms: HistoryPlatform[] = ['twitch']
    if (r() < 0.6) platforms.push('kick')
    if (r() < 0.18) platforms.push('youtube')
    for (const p of platforms) {
      const share = p === 'twitch' ? 1 : p === 'kick' ? 0.45 : 0.3
      const avg = Math.max(1, Math.round(base * share * (0.8 + r() * 0.4)))
      const peak = Math.round(avg * (1.3 + r() * 0.6))
      const chatters = Math.round(avg * (0.9 + r() * 0.8))
      const tips =
        r() < 0.35 ? [{ currency: 'INR', minor: (1 + Math.floor(r() * 8)) * 10_000 }] : []
      if (r() < 0.08) tips.push({ currency: 'USD', minor: (2 + Math.floor(r() * 9)) * 100 })
      const value =
        p === 'twitch' && r() < 0.5
          ? [{ unit: 'bits', amount: (1 + Math.floor(r() * 12)) * 100 }]
          : p === 'kick' && r() < 0.4
            ? [{ unit: 'kicks', amount: (1 + Math.floor(r() * 5)) * 50 }]
            : []
      out.push({
        platform: p,
        key: `${p}:${start}`,
        started_at: start,
        ended_at: start + minutes * 60_000,
        title,
        category,
        peak_viewers: peak,
        avg_viewers: avg,
        chat_lines: Math.round(chatters * (8 + r() * 14)),
        chatters,
        new_chatters: Math.round(chatters * (0.08 + r() * 0.15)),
        follows: Math.round(avg * (0.05 + r() * 0.15)),
        subs: p === 'youtube' ? Math.floor(r() * 2) : Math.floor(r() * (avg / 12 + 1)),
        tips,
        platform_value: value,
        updated_at: start + minutes * 60_000,
      })
    }
  }
  return out.sort((a, b) => b.started_at - a.started_at || a.platform.localeCompare(b.platform))
}

/** A believable viewer curve every five minutes: a climb, a plateau with noise, a dip. */
export function demoSamples(s: HistoryStream, now: number): { at: number; viewers: number }[] {
  const end = s.ended_at ?? now
  const r = rng(s.started_at % 2_147_483_647)
  const out: { at: number; viewers: number }[] = []
  const n = Math.max(1, Math.floor((end - s.started_at) / 300_000))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const shape = t < 0.2 ? 0.55 + t * 2.25 : t > 0.85 ? 1 - (t - 0.85) * 2.4 : 1
    const v = Math.round(s.avg_viewers * shape * (0.88 + r() * 0.24))
    out.push({ at: s.started_at + i * 300_000, viewers: Math.max(0, Math.min(v, s.peak_viewers)) })
  }
  return out
}

const NO_DECIMALS = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX']

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function field(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replaceAll('"', '""')}"`
}

/** Same columns as the relay's export. */
export function historyCsv(streams: HistoryStream[], now: number): string {
  const head =
    'platform,started_utc,ended_utc,minutes,title,category,peak_viewers,avg_viewers,chat_lines,chatters,new_chatters,follows,subs,tips,platform_value\r\n'
  const rows = [...streams].reverse().map((s) => {
    const minutes = Math.max(0, Math.floor(((s.ended_at ?? now) - s.started_at) / 60_000))
    const tips = s.tips
      .map((m) =>
        NO_DECIMALS.includes(m.currency)
          ? `${m.currency} ${m.minor}`
          : `${m.currency} ${Math.floor(m.minor / 100)}.${String(m.minor % 100).padStart(2, '0')}`,
      )
      .join('; ')
    const value = s.platform_value.map((v) => `${v.amount} ${v.unit}`).join('; ')
    return [
      s.platform,
      iso(s.started_at),
      s.ended_at === null ? '' : iso(s.ended_at),
      minutes,
      field(s.title ?? ''),
      field(s.category ?? ''),
      s.peak_viewers,
      s.avg_viewers,
      s.chat_lines,
      s.chatters,
      s.new_chatters,
      s.follows,
      s.subs,
      field(tips),
      field(value),
    ].join(',')
  })
  return head + rows.map((r) => `${r}\r\n`).join('')
}

export class DemoHistory {
  private streams: HistoryStream[] | null = null

  /** `pro` reads the demo's Pro view (the gate); `empty` starts with no streams at all. */
  constructor(
    private readonly pro: () => ProView,
    private empty = false,
    private readonly signedIn: () => boolean = () => false,
  ) {}

  /** Tests: no streams yet (the first-stream empty state), or the demo year back. */
  setEmpty(on: boolean): void {
    this.empty = on
  }

  private all(now: number): HistoryStream[] {
    if (this.empty) return []
    this.streams ??= demoStreams(now)
    return this.streams
  }

  /** Pro keeps a year, a signed-in free account 30 days; neither: 403. */
  private gate(): { pro: boolean; keepDays: number } {
    const p = this.pro()
    if (!p.features.history)
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
    if (p.active) return { pro: true, keepDays: PRO_KEEP_DAYS }
    if (this.signedIn()) return { pro: false, keepDays: FREE_KEEP_DAYS }
    throw new HttpError(
      403,
      'account_required',
      'Stream history needs a free Ferrocast account on this PC.',
      'Sign in to Ferrocast on this PC (the account bar in the sidebar). Free accounts keep 30 days of stream history, Pro keeps a year.',
    )
  }

  private filter(url: URL, now: number, defaultFrom: number) {
    const num = (k: string): number | undefined => {
      const v = url.searchParams.get(k)
      if (v === null || v.trim() === '') return undefined
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0)
        throw new HttpError(400, 'invalid', `${k}: a time in milliseconds.`)
      return n
    }
    const to = num('to') ?? now
    const from = num('from') ?? defaultFrom
    const platform = url.searchParams.get('platform') || undefined
    if (platform && !HISTORY_PLATFORMS.includes(platform as HistoryPlatform))
      throw new HttpError(
        400,
        'invalid',
        `"${platform}" isn't a platform; use twitch, youtube or kick.`,
      )
    if (to <= from)
      throw new HttpError(422, 'invalid_range', 'from must be before to.', 'Pick a range again.')
    if (to - from > MAX_RANGE)
      throw new HttpError(
        422,
        'invalid_range',
        'A range can be up to 400 days.',
        'Pick a shorter range.',
      )
    const streams = this.all(now).filter(
      (s) => s.started_at >= from && s.started_at < to && (!platform || s.platform === platform),
    )
    return { from, to, streams }
  }

  route(method: string, seg: string[], _body: unknown, url: URL): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'history' || method !== 'GET') return NOT_MINE
    const now = Date.now()
    if (seg.length === 2) {
      const plan = this.gate()
      const asked = this.filter(url, now, now - 28 * DAY)
      const earliest = now - plan.keepDays * DAY
      const from = Math.max(asked.from, earliest)
      const streams = asked.streams.filter((s) => s.started_at >= earliest)
      const view: HistoryView = {
        from,
        to: asked.to,
        streams: streams.slice(0, 2000),
        truncated: streams.length > 2000,
        weekly: weeklyTotals(streams, Math.min(from, asked.to - 1), asked.to, now),
        plan: plan.pro ? 'pro' : 'free',
        keep_days: plan.keepDays,
        earliest,
        limited: asked.from < earliest,
      }
      return clone(view)
    }
    if (seg.length === 3 && seg[2] === 'samples') {
      const plan = this.gate()
      const platform = url.searchParams.get('platform') ?? ''
      const key = url.searchParams.get('key') ?? ''
      if (!HISTORY_PLATFORMS.includes(platform as HistoryPlatform))
        throw new HttpError(
          422,
          'invalid_platform',
          'platform: use twitch, youtube or kick.',
          'Pick the stream again.',
        )
      if (!/^[A-Za-z0-9:_.-]{1,64}$/.test(key))
        throw new HttpError(
          422,
          'invalid_key',
          'key: the stream’s key from the list.',
          'Pick the stream again.',
        )
      const earliest = now - plan.keepDays * DAY
      const s = this.all(now).find(
        (x) => x.platform === platform && x.key === key && x.started_at >= earliest,
      )
      if (!s)
        throw new HttpError(
          404,
          'stream_not_found',
          'That stream isn’t in your history.',
          'It may be older than your history keeps. Pick another stream.',
        )
      return { platform, key, samples: demoSamples(s, now) }
    }
    if (seg.length === 3 && seg[2] === 'export.csv') {
      const plan = this.gate()
      const earliest = now - plan.keepDays * DAY
      const { streams: all } = this.filter(url, now, now - MAX_RANGE)
      const streams = all.filter((s) => s.started_at >= earliest)
      return new Response(historyCsv(streams, now), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ferrocast-history.csv"',
        },
      })
    }
    return NOT_MINE
  }
}
