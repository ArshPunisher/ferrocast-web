// The stream scheduler (API.md "Stream schedule"): plan a stream, have the platforms that take
// scheduled broadcasts make one, get one reminder before the start. It never goes live by
// itself: Go live is always the streamer's own press.

import type { FerroClient } from './client'
import type { StreamInfo } from './studio'

/** The platforms a plan can name. */
export type SchedulePlatform = 'twitch' | 'youtube' | 'kick' | 'facebook'
export const SCHEDULE_PLATFORMS: readonly SchedulePlatform[] = [
  'twitch',
  'youtube',
  'kick',
  'facebook',
]

/** One platform's part of a plan. */
export interface PlatformBroadcast {
  platform: SchedulePlatform
  /** The platform's id for the scheduled broadcast, when one was made. */
  id?: string
  url?: string
  /** Why there is none: not connected, none to make there, or the platform said no. */
  note?: string
}

export interface ScheduledStream {
  id: string
  info: StreamInfo
  platforms: SchedulePlatform[]
  /** Unix ms. */
  start_ms: number
  remind_minutes: number
  reminded: boolean
  broadcasts: PlatformBroadcast[]
}

export interface NewScheduledStream {
  info: StreamInfo
  platforms: SchedulePlatform[]
  start_ms: number
  /** 1 to 1440, default 10. */
  remind_minutes?: number
}

/** "in 5 minutes", "in 3 hours", "now": when a plan starts, in words. */
export function scheduleStartLabel(startMs: number, now: number): string {
  const mins = Math.ceil((startMs - now) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `in ${days} days`
}

export function scheduleApi(c: FerroClient) {
  return {
    /** Soonest first. */
    list: async () =>
      (await c.request<{ streams: ScheduledStream[] }>('GET', '/api/v1/schedule')).streams,
    create: (n: NewScheduledStream) => c.request<ScheduledStream>('POST', '/api/v1/schedule', n),
    remove: (id: string) =>
      c.request<undefined>('DELETE', `/api/v1/schedule/${encodeURIComponent(id)}`),
  }
}
