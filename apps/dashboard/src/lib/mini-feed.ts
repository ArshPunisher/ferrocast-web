// Mini Feed helpers: which events a filter shows, and which ones are still unread.
// Read state is kept per browser (localStorage); the alert queue's pause and mute live in the engine.

import type { FerroEvent } from '@ferrocast/api'

export type FeedFilter = 'all' | 'follows' | 'subs' | 'tips' | 'raids' | 'rewards'

export const FEED_FILTERS: { id: FeedFilter; label: string; kinds: readonly string[] }[] = [
  { id: 'all', label: 'All', kinds: [] },
  { id: 'follows', label: 'Follows', kinds: ['follow'] },
  { id: 'subs', label: 'Subs', kinds: ['subscription', 'gift_batch'] },
  { id: 'tips', label: 'Tips and bits', kinds: ['tip', 'paid_message', 'platform_gift'] },
  { id: 'raids', label: 'Raids', kinds: ['raid'] },
  { id: 'rewards', label: 'Rewards', kinds: ['reward_redemption'] },
]

export function filterEvents(events: FerroEvent[], filter: FeedFilter): FerroEvent[] {
  const f = FEED_FILTERS.find((x) => x.id === filter)
  if (!f || f.kinds.length === 0) return events
  return events.filter((e) => f.kinds.includes(e.kind.type))
}

/** What was read: everything received up to `before`, plus single events by id. */
export interface ReadState {
  before: number
  ids: string[]
}

export const MAX_READ_IDS = 400

export function isUnread(r: ReadState, e: FerroEvent): boolean {
  return e.received_at > r.before && !r.ids.includes(e.id)
}

export function unreadCount(r: ReadState, events: FerroEvent[]): number {
  return events.reduce((n, e) => n + (isUnread(r, e) ? 1 : 0), 0)
}

export function markRead(r: ReadState, id: string): ReadState {
  if (r.ids.includes(id)) return r
  return { before: r.before, ids: [...r.ids, id].slice(-MAX_READ_IDS) }
}

/** Everything up to the newest event (or now) counts as read; the single marks are dropped. */
export function markAllRead(events: FerroEvent[], now: number): ReadState {
  return { before: Math.max(now, ...events.map((e) => e.received_at)), ids: [] }
}

const KEY = 'fc-feed-read'
const FILTER_KEY = 'fc-feed-filter'

export function loadRead(now: number): ReadState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ReadState> | null
    if (v && typeof v.before === 'number' && Array.isArray(v.ids))
      return { before: v.before, ids: v.ids.filter((x) => typeof x === 'string') }
  } catch {
    // Blocked or junk: fall through to a fresh state.
  }
  // First time here: what is already in the feed counts as read, only new events are unread.
  return { before: now, ids: [] }
}

export function saveRead(r: ReadState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {
    // Not saved; it still works for this page.
  }
}

export function loadFilter(): FeedFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    if (FEED_FILTERS.some((f) => f.id === v)) return v as FeedFilter
  } catch {
    // ignore
  }
  return 'all'
}

export function saveFilter(f: FeedFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, f)
  } catch {
    // ignore
  }
}

/** The line under the controls: what the alert queue is doing, in plain words. */
export function queueStatus(q: {
  paused: boolean
  muted: boolean
  waiting: number
}): string | null {
  const parts: string[] = []
  if (q.paused) parts.push(q.waiting > 0 ? `Alerts paused, ${q.waiting} waiting` : 'Alerts paused')
  if (q.muted) parts.push('Alert sounds muted')
  return parts.length ? parts.join('. ') : null
}
