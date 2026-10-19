// Pro's weekly email (API.md §9.8): a short report of the week's streams, sent by the relay
// from the stored history. Double opt-in: saving an address sends a confirm email whose page
// button turns it on; a confirmed address keeps getting the report while a new one waits.
// The relay keeps the addresses sealed; the dashboard only ever sees hints.

import type { FerroClient } from './client'

export type WeeklyEmailStatus = 'none' | 'pending' | 'on' | 'paused'

export interface WeeklyEmailView {
  /** `on`/`paused`: the confirmed address; `pending`: only a new one waiting. */
  status: WeeklyEmailStatus
  /** "a•••@gmail.com" of the address `status` is about; null without one (or unreadable). */
  address_hint: string | null
  /** A new address waiting for its confirm link, also next to `on`; null without one. */
  pending_hint: string | null
  /** When the pending address's confirm link stops working (ms). */
  expires_at: number | null
  /** This subscription's day ("Monday"): the report goes then at 04:00 UTC. */
  day: string
  /** The next report moment (on only, ms). */
  next_at: number | null
  last_sent_at: number | null
  /** Why it stopped (paused only): the mail provider refused the address, or the relay
   * couldn't read it. */
  paused_reason: 'rejected' | 'unreadable' | null
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MS = 86_400_000
/** The relay sends at 04:00 UTC on each subscription's day. */
export const WEEKLY_EMAIL_SEND_HOUR_UTC = 4

/** The next 04:00 UTC on the relay's `day` (UTC weekday) after `now`; null for an unknown day. */
export function nextReportAt(day: string, now: number): number | null {
  const i = DAYS.indexOf(day)
  if (i < 0) return null
  const jsDay = (i + 1) % 7 // getUTCDay: 0 = Sunday
  const d = new Date(now)
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WEEKLY_EMAIL_SEND_HOUR_UTC)
  while (new Date(t).getUTCDay() !== jsDay || t <= now) t += DAY_MS
  return t
}

/** When the report arrives in the viewer's own time zone: the weekday and time of `next_at`
 * (or of the next moment on `day`), so a Monday 04:00 UTC report reads "Sunday, 21:00" in
 * Los Angeles. `timeZone` is for tests. */
export function reportSchedule(
  v: Pick<WeeklyEmailView, 'day' | 'next_at'>,
  now: number,
  timeZone?: string,
): { at: number; weekday: string; time: string } | null {
  const at = v.next_at ?? nextReportAt(v.day, now)
  if (at === null) return null
  const tz = timeZone ? { timeZone } : {}
  return {
    at,
    weekday: new Date(at).toLocaleDateString(undefined, { weekday: 'long', ...tz }),
    time: new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', ...tz }),
  }
}

/** Confirm emails per subscription per UTC day (resends included). */
export const WEEKLY_EMAIL_CONFIRMS_PER_DAY = 3

const PATH = '/api/v1/pro/history/email'

export function weeklyEmailApi(c: FerroClient) {
  return {
    get: () => c.request<WeeklyEmailView>('GET', PATH),
    /** Saves the address and sends its confirm email (also Resend). */
    save: (address: string) => c.request<WeeklyEmailView>('PUT', PATH, { address }),
    /** No more emails; the address is deleted on the relay. */
    stop: () => c.request<void>('DELETE', PATH),
  }
}

/** The relay's own check (one `@`, a dot in the domain, no spaces), so typos show at once. */
export function looksLikeEmail(raw: string): boolean {
  const e = raw.trim()
  const at = e.indexOf('@')
  if (at < 1 || at !== e.lastIndexOf('@') || e.length < 3 || e.length > 254) return false
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  if (local.length > 64) return false
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false
  return !/[\s\p{Cc}]/u.test(e)
}

/** `a•••@gmail.com`, as the relay shows it. */
export function addressHint(address: string): string {
  const e = address.trim()
  const at = e.lastIndexOf('@')
  const local = at >= 0 ? e.slice(0, at) : e
  const domain = at >= 0 ? e.slice(at + 1).toLowerCase() : ''
  return `${[...local][0] ?? ''}•••@${domain}`
}
