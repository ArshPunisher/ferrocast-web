import { describe, expect, it } from 'vitest'
import type { FerroEvent } from '@ferrocast/api'
import {
  FEED_FILTERS,
  MAX_READ_IDS,
  filterEvents,
  isUnread,
  loadFilter,
  loadRead,
  markAllRead,
  markRead,
  queueStatus,
  saveFilter,
  saveRead,
  unreadCount,
} from './mini-feed'

const ev = (id: string, type: string, at: number): FerroEvent =>
  ({ id, seq: at, received_at: at, kind: { type } }) as unknown as FerroEvent

const events = [
  ev('a', 'follow', 10),
  ev('b', 'tip', 20),
  ev('c', 'raid', 30),
  ev('d', 'subscription', 40),
]

describe('mini feed filters', () => {
  it('all shows everything, each type only its kinds', () => {
    expect(filterEvents(events, 'all')).toHaveLength(4)
    expect(filterEvents(events, 'follows').map((e) => e.id)).toEqual(['a'])
    expect(filterEvents(events, 'tips').map((e) => e.id)).toEqual(['b'])
    expect(filterEvents(events, 'raids').map((e) => e.id)).toEqual(['c'])
    expect(filterEvents(events, 'subs').map((e) => e.id)).toEqual(['d'])
    expect(filterEvents(events, 'rewards')).toEqual([])
  })
  it('every filter id is unique', () => {
    expect(new Set(FEED_FILTERS.map((f) => f.id)).size).toBe(FEED_FILTERS.length)
  })
})

describe('read state', () => {
  it('counts events newer than the marker that are not marked', () => {
    const r = { before: 15, ids: [] as string[] }
    expect(unreadCount(r, events)).toBe(3)
    expect(isUnread(markRead(r, 'b'), events[1]!)).toBe(false)
    expect(unreadCount(markRead(r, 'b'), events)).toBe(2)
  })
  it('marking twice changes nothing', () => {
    const r = markRead({ before: 0, ids: [] }, 'a')
    expect(markRead(r, 'a')).toBe(r)
  })
  it('mark all clears the count and the single marks', () => {
    const r = markAllRead(events, 5)
    expect(r).toEqual({ before: 40, ids: [] })
    expect(unreadCount(r, events)).toBe(0)
    expect(unreadCount(r, [...events, ev('e', 'follow', 41)])).toBe(1)
  })
  it('keeps at most MAX_READ_IDS single marks', () => {
    let r = { before: 0, ids: [] as string[] }
    for (let i = 0; i < MAX_READ_IDS + 20; i++) r = markRead(r, `x${i}`)
    expect(r.ids).toHaveLength(MAX_READ_IDS)
    expect(r.ids.at(-1)).toBe(`x${MAX_READ_IDS + 19}`)
  })
  it('first visit counts what is already there as read; storage round-trips; junk is ignored', () => {
    localStorage.clear()
    expect(loadRead(99)).toEqual({ before: 99, ids: [] })
    saveRead({ before: 5, ids: ['q'] })
    expect(loadRead(99)).toEqual({ before: 5, ids: ['q'] })
    localStorage.setItem('fc-feed-read', '{oops')
    expect(loadRead(7)).toEqual({ before: 7, ids: [] })
    localStorage.setItem('fc-feed-read', JSON.stringify({ before: 'x', ids: 3 }))
    expect(loadRead(8)).toEqual({ before: 8, ids: [] })
  })
  it('remembers the filter and ignores an unknown one', () => {
    localStorage.clear()
    expect(loadFilter()).toBe('all')
    saveFilter('raids')
    expect(loadFilter()).toBe('raids')
    localStorage.setItem('fc-feed-filter', 'bogus')
    expect(loadFilter()).toBe('all')
  })
})

describe('queue status line', () => {
  it('says nothing when idle, and names pause, waiting and mute', () => {
    expect(queueStatus({ paused: false, muted: false, waiting: 3 })).toBeNull()
    expect(queueStatus({ paused: true, muted: false, waiting: 0 })).toBe('Alerts paused')
    expect(queueStatus({ paused: true, muted: true, waiting: 2 })).toBe(
      'Alerts paused, 2 waiting. Alert sounds muted',
    )
    expect(queueStatus({ paused: false, muted: true, waiting: 0 })).toBe('Alert sounds muted')
  })
})
