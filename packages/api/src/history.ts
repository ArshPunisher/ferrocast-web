// Pro stream history (API.md §9.1): one row per stream per platform, uploaded by the engine
// when a stream ends, read back here with weekly totals. The relay does the work; these are
// the types, the dashboard's calls and the small pure helpers the screen and demo share.

import type { FerroClient } from './client'

export type HistoryPlatform = 'twitch' | 'youtube' | 'kick'
export const HISTORY_PLATFORMS: readonly HistoryPlatform[] = ['twitch', 'youtube', 'kick']

export interface HistoryStream {
  platform: HistoryPlatform
  /** The engine's id for it: "<platform>:<started_at>". */
  key: string
  started_at: number
  /** null while live. */
  ended_at: number | null
  title: string | null
  category: string | null
  peak_viewers: number
  avg_viewers: number
  chat_lines: number
  chatters: number
  new_chatters: number
  follows: number
  subs: number
  /** Per currency, minor units, never converted. */
  tips: { currency: string; minor: number }[]
  /** Bits, KICKs, Jewels. */
  platform_value: { unit: string; amount: number }[]
  updated_at: number
}

export interface HistoryWeek {
  /** Monday 00:00 UTC. */
  week_start: number
  streams: number
  by_platform: Record<HistoryPlatform, number>
  minutes: number
  peak_viewers: number
  /** Weighted by each stream's length. */
  avg_viewers: number
  follows: number
  subs: number
  chat_lines: number
}

export interface HistoryView {
  from: number
  to: number
  /** Newest first, at most 2,000. */
  streams: HistoryStream[]
  truncated: boolean
  /** Every week in the range, empty ones too, oldest first. */
  weekly: HistoryWeek[]
}

export interface HistoryQuery {
  from?: number
  to?: number
  platform?: HistoryPlatform
}

/** The range chips on `#/history`. */
export type HistoryRange = '4w' | '3m' | '1y'
export const HISTORY_RANGES: readonly { value: HistoryRange; label: string; days: number }[] = [
  { value: '4w', label: '4 weeks', days: 28 },
  { value: '3m', label: '3 months', days: 91 },
  { value: '1y', label: '1 year', days: 365 },
]

const DAY = 86_400_000
const WEEK = 7 * DAY

/** `from`/`to` for a chip, ending now. */
export function historyRange(r: HistoryRange, now: number): { from: number; to: number } {
  const days = HISTORY_RANGES.find((x) => x.value === r)?.days ?? 28
  return { from: now - days * DAY, to: now }
}

function query(q: HistoryQuery): string {
  const p = new URLSearchParams()
  if (q.from !== undefined) p.set('from', String(Math.floor(q.from)))
  if (q.to !== undefined) p.set('to', String(Math.floor(q.to)))
  if (q.platform) p.set('platform', q.platform)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Stream history's routes on a dashboard client. */
export function historyApi(c: FerroClient) {
  return {
    list: (q: HistoryQuery = {}) => c.request<HistoryView>('GET', `/api/v1/pro/history${query(q)}`),
    /** The CSV to save (`ferrocast-history.csv`). */
    exportCsv: (q: HistoryQuery = {}) =>
      c.downloadFile(`/api/v1/pro/history/export.csv${query(q)}`),
  }
}

/** Monday 00:00 UTC of the week `ms` is in (same as the relay). */
export function weekStart(ms: number): number {
  const day = Math.floor(ms / DAY)
  return (day - ((((day + 3) % 7) + 7) % 7)) * DAY
}

/** Minutes live (a live stream counts up to `now`). */
export function streamMinutes(s: HistoryStream, now: number): number {
  return Math.max(0, Math.floor(((s.ended_at ?? now) - s.started_at) / 60_000))
}

/** Weekly totals like the relay's: every week from `from`'s to `to`'s, oldest first. */
export function weeklyTotals(
  streams: HistoryStream[],
  from: number,
  to: number,
  now: number,
): HistoryWeek[] {
  const first = weekStart(from)
  const last = weekStart(Math.max(to - 1, from))
  const weeks: (HistoryWeek & { weighted: number })[] = []
  for (let w = first; w <= last; w += WEEK)
    weeks.push({
      week_start: w,
      streams: 0,
      by_platform: { twitch: 0, youtube: 0, kick: 0 },
      minutes: 0,
      peak_viewers: 0,
      avg_viewers: 0,
      follows: 0,
      subs: 0,
      chat_lines: 0,
      weighted: 0,
    })
  for (const s of streams) {
    const w = weeks[(weekStart(s.started_at) - first) / WEEK]
    if (!w) continue
    const m = streamMinutes(s, now)
    w.streams += 1
    w.by_platform[s.platform] += 1
    w.minutes += m
    w.peak_viewers = Math.max(w.peak_viewers, s.peak_viewers)
    w.follows += s.follows
    w.subs += s.subs
    w.chat_lines += s.chat_lines
    w.weighted += s.avg_viewers * Math.max(m, 1)
  }
  return weeks.map(({ weighted, ...w }) => {
    const total = Math.max(w.minutes, w.streams)
    return { ...w, avg_viewers: total > 0 ? Math.round(weighted / total) : 0 }
  })
}

/** The range's headline numbers. */
export interface HistorySummary {
  streams: number
  hours: number
  avg_viewers: number
  peak_viewers: number
  follows: number
  subs: number
  by_platform: Record<HistoryPlatform, number>
}

export function historySummary(streams: HistoryStream[], now: number): HistorySummary {
  let minutes = 0
  let weighted = 0
  const s: HistorySummary = {
    streams: streams.length,
    hours: 0,
    avg_viewers: 0,
    peak_viewers: 0,
    follows: 0,
    subs: 0,
    by_platform: { twitch: 0, youtube: 0, kick: 0 },
  }
  for (const x of streams) {
    const m = streamMinutes(x, now)
    minutes += m
    weighted += x.avg_viewers * Math.max(m, 1)
    s.peak_viewers = Math.max(s.peak_viewers, x.peak_viewers)
    s.follows += x.follows
    s.subs += x.subs
    s.by_platform[x.platform] += 1
  }
  s.hours = Math.round(minutes / 6) / 10
  const total = Math.max(minutes, streams.length)
  s.avg_viewers = total > 0 ? Math.round(weighted / total) : 0
  return s
}
