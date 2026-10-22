// The Ferrocast account in the demo, matching the engine's `/pro/account…` routes
// (`crates/engine/src/ferro_account.rs`): signed out by default; Sign in "opens the browser"
// and comes back signed in a moment later. Pro on the account follows the demo's Pro.

import type { AccountSession, AccountView } from '../../account'
import type { ProView } from '../../pro'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoHost, type Routed } from './host'

export type DemoAccountSetup = 'signed_out' | 'signed_in' | 'disabled'

/** How long the demo's browser takes to come back. */
const BROWSER_MS = 1200

export class DemoAccount {
  private state: DemoAccountSetup | 'pending' = 'signed_out'
  private sessions: AccountSession[] = []
  private error: { message: string; hint: string | null } | null = null

  constructor(
    private readonly host: DemoHost,
    private readonly pro: () => ProView,
    setup: DemoAccountSetup = 'signed_out',
  ) {
    this.setup(setup)
  }

  setup(s: DemoAccountSetup): void {
    this.state = s
    this.error =
      s === 'disabled'
        ? { message: 'This account is turned off.', hint: 'Write to support@clearcraftlabs.com.' }
        : null
    const now = Date.now()
    this.sessions =
      s === 'signed_in'
        ? [
            {
              id: 'se_this',
              kind: 'app',
              label: 'MacBook Pro',
              created_at: now - 9 * 86_400_000,
              last_used_at: now,
              expires_at: now + 180 * 86_400_000,
              current: true,
            },
            {
              id: 'se_studio',
              kind: 'app',
              label: 'Streaming PC',
              created_at: now - 30 * 86_400_000,
              last_used_at: now - 3 * 3_600_000,
              expires_at: now + 170 * 86_400_000,
              current: false,
            },
            {
              id: 'se_phone',
              kind: 'web',
              label: 'Safari on iPhone',
              created_at: now - 4 * 86_400_000,
              last_used_at: now - 26 * 3_600_000,
              expires_at: now + 26 * 86_400_000,
              current: false,
            },
          ]
        : []
  }

  view(): AccountView {
    if (this.state === 'pending') return { state: 'pending', started_at: Date.now() }
    if (this.state !== 'signed_in') return { state: this.state, error: this.error }
    const p = this.pro()
    return {
      state: 'signed_in',
      stale: false,
      account: {
        id: 'ac_demo',
        email: 'kabir.sethi.live@gmail.com',
        name: 'Kabir Sethi',
        avatar_url: null,
        created_at: Date.now() - 40 * 86_400_000,
        providers: ['google'],
      },
      plan: p.active ? 'pro' : 'free',
      pro: p.active
        ? {
            active: true,
            source: p.subscription_id?.startsWith('comp_') ? 'grant' : 'subscription',
            plan: p.plan,
            status: p.status,
            subscription_id: p.subscription_id,
            current_end: p.current_end,
            access_until: p.access_until,
            renews: !p.cancel_at_period_end,
            cancel_at_period_end: p.cancel_at_period_end,
          }
        : null,
      session: {
        id: 'se_this',
        kind: 'app',
        label: 'MacBook Pro',
        expires_at: Date.now() + 180 * 86_400_000,
      },
      pcs: 2,
      error: null,
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'account') return NOT_MINE
    const rest = seg.slice(2)
    const is = (m: string, ...parts: string[]) =>
      method === m &&
      rest.length === parts.length &&
      parts.every((x, i) => x === '*' || x === rest[i])
    if (is('GET')) return this.view()
    if (is('POST', 'sign-in')) {
      if (this.state === 'signed_in')
        throw new HttpError(
          409,
          'conflict',
          'This PC is already signed in. Sign out first to switch accounts.',
        )
      this.state = 'pending'
      this.error = null
      this.host.later(() => {
        if (this.state === 'pending') this.setup('signed_in')
      }, BROWSER_MS)
      return {
        url: 'https://ferrocast.clearcraftlabs.com/login/?flow=af_demo',
        expires_at: Date.now() + 600_000,
      }
    }
    if (is('POST', 'sign-in', 'cancel')) {
      if (this.state === 'pending') this.state = 'signed_out'
      return undefined
    }
    if (is('POST', 'sign-out')) {
      requireObj(body ?? {})
      this.setup('signed_out')
      return undefined
    }
    if (this.state !== 'signed_in')
      throw new HttpError(
        401,
        'signed_out',
        'This PC isn’t signed in to a Ferrocast account.',
        'Press Sign in first.',
      )
    if (is('GET', 'sessions')) return { sessions: clone(this.sessions) }
    if (is('DELETE', 'sessions', '*')) {
      const id = rest[1] ?? ''
      if (!this.sessions.some((s) => s.id === id))
        throw new HttpError(404, 'not_found', 'That device is already signed out.')
      this.sessions = this.sessions.filter((s) => s.id !== id)
      return undefined
    }
    return NOT_MINE
  }
}
