// Insights (1.4, API.md §4 Smart features / §9.1): the pure parts of the Insights page
// that the screen, the demo and the tests share. Stream history comes from the relay
// (`history.ts`); top supporters from this PC's own event log (local, free).

import type { FerroClient } from './client'
import type { HistoryStream } from './history'
import type { Money, Platform, Recap } from './types'

/** `GET /api/v1/insights/supporters`: this PC's own log for the range. */
export interface Supporters {
  from: number
  to: number
  /** The log had more support events than one answer reads (5,000). */
  truncated: boolean
  totals: Pick<Recap, 'follows' | 'subs' | 'tips' | 'bits' | 'messages' | 'peak_viewers'>
  new_followers: number
  subscribers: { platform: Platform; name: string; months: number; gifts: number }[]
  tippers: { platform: Platform; name: string; amounts: Money[]; bits: number }[]
  raiders: { platform: Platform; name: string; viewers: number }[]
  top_chatters: { platform: Platform; name: string; messages: number }[]
}

export function insightsApi(c: FerroClient) {
  return {
    supporters: (q: { from: number; to?: number }) => {
      const p = new URLSearchParams({ from: String(Math.floor(q.from)) })
      if (q.to !== undefined) p.set('to', String(Math.floor(q.to)))
      return c.request<Supporters>('GET', `/api/v1/insights/supporters?${p.toString()}`)
    },
  }
}

/** What a per-stream chart can show. */
export type StreamMetric = 'viewers' | 'follows' | 'subs' | 'chat' | 'tips'
export const STREAM_METRICS: readonly { value: StreamMetric; label: string }[] = [
  { value: 'viewers', label: 'Viewers' },
  { value: 'follows', label: 'Follows' },
  { value: 'subs', label: 'Subs' },
  { value: 'chat', label: 'Chat' },
  { value: 'tips', label: 'Tips' },
]

/** One stream's value for a metric. Tips count tips in their main currency only (R-32). */
export function metricOf(s: HistoryStream, m: StreamMetric, currency: string | null): number {
  switch (m) {
    case 'viewers':
      return s.avg_viewers
    case 'follows':
      return s.follows
    case 'subs':
      return s.subs
    case 'chat':
      return s.chat_lines
    case 'tips':
      return currency ? (s.tips.find((t) => t.currency === currency)?.minor ?? 0) : 0
  }
}

/** The currency most of the range's tips came in (never converted between currencies). */
export function mainCurrency(streams: HistoryStream[]): string | null {
  const by = new Map<string, number>()
  for (const s of streams) for (const t of s.tips) by.set(t.currency, (by.get(t.currency) ?? 0) + 1)
  let best: string | null = null
  let n = 0
  for (const [c, k] of by)
    if (k > n || (k === n && best !== null && c < best)) {
      best = c
      n = k
    }
  return best
}

/** A start-time slot: a weekday and a four-hour block, in the viewer's own clock. */
export interface TimeSlot {
  /** 0 = Monday … 6 = Sunday. */
  day: number
  /** 0, 4, 8, 12, 16, 20. */
  hour: number
  streams: number
  /** Average viewers of the streams that started in it, weighted by length. */
  avg_viewers: number
  follows: number
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const BLOCKS = [0, 4, 8, 12, 16, 20] as const

/** Every slot (7 × 6), from the streams' start times in `tz` (the browser's by default). */
export function timeSlots(
  streams: HistoryStream[],
  now: number,
  dayHour: (ms: number) => { day: number; hour: number } = localDayHour,
): TimeSlot[] {
  const acc = new Map<
    string,
    { streams: number; weighted: number; minutes: number; follows: number }
  >()
  for (const s of streams) {
    const { day, hour } = dayHour(s.started_at)
    const block = Math.floor(hour / 4) * 4
    const k = `${day}:${block}`
    const a = acc.get(k) ?? { streams: 0, weighted: 0, minutes: 0, follows: 0 }
    const m = Math.max(1, Math.floor(((s.ended_at ?? now) - s.started_at) / 60_000))
    a.streams += 1
    a.weighted += s.avg_viewers * m
    a.minutes += m
    a.follows += s.follows
    acc.set(k, a)
  }
  const out: TimeSlot[] = []
  for (let day = 0; day < 7; day++)
    for (const hour of BLOCKS) {
      const a = acc.get(`${day}:${hour}`)
      out.push({
        day,
        hour,
        streams: a?.streams ?? 0,
        avg_viewers: a && a.minutes ? Math.round(a.weighted / a.minutes) : 0,
        follows: a?.follows ?? 0,
      })
    }
  return out
}

export function localDayHour(ms: number): { day: number; hour: number } {
  const d = new Date(ms)
  return { day: (d.getDay() + 6) % 7, hour: d.getHours() }
}

/**
 * The slot to suggest: the highest average viewers among slots streamed at least twice
 * (one stream proves nothing); `null` with fewer than three streams in all.
 */
export function bestSlot(slots: TimeSlot[]): TimeSlot | null {
  const total = slots.reduce((a, s) => a + s.streams, 0)
  if (total < 3) return null
  const tried = slots.filter((s) => s.streams >= 2)
  const pool = tried.length ? tried : slots.filter((s) => s.streams > 0)
  return pool.reduce<TimeSlot | null>(
    (b, s) =>
      !b ||
      s.avg_viewers > b.avg_viewers ||
      (s.avg_viewers === b.avg_viewers && s.streams > b.streams)
        ? s
        : b,
    null,
  )
}

/** "20:00 to 24:00". */
export function blockLabel(hour: number): string {
  const p = (h: number) => `${String(h).padStart(2, '0')}:00`
  return `${p(hour)} to ${p(hour + 4)}`
}
