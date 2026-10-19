// Pro's weekly email in the demo, like the relay (`crates/relay/src/mail`): 402 without Pro,
// 422 for an address that isn't one, 3 confirm emails a day (429), 409 for the address that
// already gets them, and the double opt-in: a confirmed address keeps going while a new one
// waits. The demo can't receive email, so a confirm link "clicked" is a test hook
// (`confirm()`), and saving `bounce@…` shows the paused state.

import type { ProView } from '../../pro'
import {
  WEEKLY_EMAIL_CONFIRMS_PER_DAY,
  addressHint,
  looksLikeEmail,
  nextReportAt,
  type WeeklyEmailView,
} from '../../weekly-email'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

const DAY = 86_400_000

/** What tests can set: `status` with `address` sets the confirmed (`on`/`paused`) or the
 * pending address; `pending` adds a new one next to it. */
export interface DemoWeeklyEmailState {
  status?: WeeklyEmailView['status']
  address?: string
  pending?: string | null
  pausedReason?: 'rejected' | 'unreadable'
  /** The relay couldn't read the address: no hint. */
  noHint?: boolean
  sentToday?: number
  expired?: boolean
}

export class DemoWeeklyEmail implements DemoFeature {
  /** The confirmed address (`on`) or the refused one (`paused`). */
  private active: string | null = null
  private activeStatus: 'on' | 'paused' | null = null
  private pausedReason: 'rejected' | 'unreadable' = 'rejected'
  private pending: string | null = null
  private expires: number | null = null
  private noHint = false
  private sentToday = 0
  private lastSent: number | null = null

  constructor(private readonly pro: () => ProView) {}

  /** Tests: the state set directly. */
  setState(s: DemoWeeklyEmailState): void {
    if (s.sentToday !== undefined) this.sentToday = s.sentToday
    if (s.noHint !== undefined) this.noHint = s.noHint
    if (s.pausedReason !== undefined) this.pausedReason = s.pausedReason
    if (s.status === 'none') {
      this.active = null
      this.activeStatus = null
      this.pending = null
    } else if (s.status === 'pending') {
      this.active = null
      this.activeStatus = null
      this.pending = s.address ?? this.pending ?? 'asha@gmail.com'
    } else if (s.status === 'on' || s.status === 'paused') {
      this.active = s.address ?? this.active ?? 'asha@gmail.com'
      this.activeStatus = s.status
      this.pending = null
      if (s.status === 'on') this.lastSent = Date.now() - 3 * DAY
    }
    if (s.pending !== undefined) this.pending = s.pending
    if (this.pending) this.expires = s.expired ? Date.now() - 60_000 : Date.now() + DAY
  }

  /** Tests: the pending address's confirm link pressed. */
  confirm(): void {
    if (!this.pending) return
    this.active = this.pending
    this.activeStatus = 'on'
    this.pending = null
    this.expires = null
  }

  private gate(): void {
    const p = this.pro()
    if (!p.active)
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
    if (!p.features.weekly_email)
      throw new HttpError(
        503,
        'mail_unavailable',
        'Weekly emails aren’t switched on on Ferrocast’s servers yet.',
        'Nothing to do on your side; try again later. Your history is still kept.',
      )
  }

  private hint(a: string | null): string | null {
    return a && !this.noHint ? addressHint(a) : null
  }

  private view(): WeeklyEmailView {
    const status: WeeklyEmailView['status'] =
      this.activeStatus ?? (this.pending ? 'pending' : 'none')
    return clone({
      status,
      address_hint: this.hint(status === 'pending' ? this.pending : this.active),
      pending_hint: this.hint(this.pending),
      expires_at: this.pending ? this.expires : null,
      // The demo's day is Monday.
      day: 'Monday',
      next_at: status === 'on' ? nextReportAt('Monday', Date.now()) : null,
      last_sent_at: this.lastSent,
      paused_reason: status === 'paused' ? this.pausedReason : null,
    })
  }

  private save(body: unknown): WeeklyEmailView {
    this.gate()
    const b = requireObj(body)
    if (typeof b.address !== 'string')
      throw new HttpError(400, 'invalid', 'The request needs an address.')
    const raw = b.address.trim()
    if (!looksLikeEmail(raw))
      throw new HttpError(
        422,
        'invalid_email',
        'That email address doesn’t look right.',
        'Check it for typos, or use another address.',
      )
    const at = raw.lastIndexOf('@')
    const address = `${raw.slice(0, at)}@${raw.slice(at + 1).toLowerCase()}`
    if (this.activeStatus === 'on' && this.active?.toLowerCase() === address.toLowerCase())
      throw new HttpError(
        409,
        'already_on',
        'Weekly emails already go to that address.',
        'Nothing to do. To use another address, type it and press Save.',
      )
    if (this.sentToday >= WEEKLY_EMAIL_CONFIRMS_PER_DAY)
      throw new HttpError(
        429,
        'mail_rate',
        `That’s ${WEEKLY_EMAIL_CONFIRMS_PER_DAY} confirm emails today, the most we send.`,
        'Look in your spam folder for the last one, or try again tomorrow (UTC).',
        3600,
      )
    this.sentToday += 1
    if (address.startsWith('bounce@')) {
      // The mail server refused it: shown as paused.
      this.active = address
      this.activeStatus = 'paused'
      this.pausedReason = 'rejected'
      this.pending = null
      return this.view()
    }
    // A confirmed address keeps going; a paused one is dropped (saving again starts over).
    if (this.activeStatus === 'paused') {
      this.active = null
      this.activeStatus = null
    }
    this.pending = address
    this.expires = Date.now() + DAY
    return this.view()
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg.length !== 3 || seg[0] !== 'pro' || seg[1] !== 'history' || seg[2] !== 'email')
      return NOT_MINE
    if (method === 'GET') {
      this.gate()
      return this.view()
    }
    if (method === 'PUT')
      return new Response(JSON.stringify(this.save(body)), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    if (method === 'DELETE') {
      const p = this.pro()
      if (!p.active && !p.subscription_id)
        throw new HttpError(
          402,
          'pro_required',
          'This runs on Ferrocast’s servers and is part of Pro.',
        )
      this.active = null
      this.activeStatus = null
      this.pending = null
      this.expires = null
      return undefined
    }
    return NOT_MINE
  }
}
