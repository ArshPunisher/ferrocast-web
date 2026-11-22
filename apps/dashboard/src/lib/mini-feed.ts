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

/** What was read: every event up to `upTo` (the engine's event numbers, so a phone's or a
 * PC's clock never matters), plus single events by id. */
export interface ReadState {
  upTo: number
  ids: string[]
}

export const MAX_READ_IDS = 400

export function isUnread(r: ReadState, e: FerroEvent): boolean {
  return e.seq > r.upTo && !r.ids.includes(e.id)
}

export function unreadCount(r: ReadState, events: FerroEvent[]): number {
  return events.reduce((n, e) => n + (isUnread(r, e) ? 1 : 0), 0)
}

export function markRead(r: ReadState, id: string): ReadState {
  if (r.ids.includes(id)) return r
  return { upTo: r.upTo, ids: [...r.ids, id].slice(-MAX_READ_IDS) }
}

export function newestSeq(events: FerroEvent[]): number {
  return events.reduce((n, e) => Math.max(n, e.seq), 0)
}

/** Everything seen so far counts as read; the single marks are dropped. */
export function markAllRead(r: ReadState, events: FerroEvent[]): ReadState {
  return { upTo: Math.max(r.upTo, newestSeq(events)), ids: [] }
}

const KEY = 'fc-feed-read-v2'

/** What this browser kept; null the first time (the caller starts from what is already there). */
export function loadRead(): ReadState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ReadState> | null
    if (v && typeof v.upTo === 'number' && Array.isArray(v.ids))
      return { upTo: v.upTo, ids: v.ids.filter((x) => typeof x === 'string') }
  } catch {
    // Blocked or junk: treated as the first time.
  }
  return null
}

export function saveRead(r: ReadState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {
    // Not saved; it still works for this page.
  }
}

const FILTER_KEY = 'fc-feed-filter'

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
