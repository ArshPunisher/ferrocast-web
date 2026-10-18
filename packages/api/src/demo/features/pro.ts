// Ferrocast Pro in the demo, matching the engine and relay (`crates/engine/src/pro.rs`,
// `crates/relay/src/billing`): not on sale (409 with the relay's hint), nothing to manage
// until Pro is restored, and Restore works with the demo's own subscription id.
// Honest by default: no Pro feature exists yet, so `features` are all off. `DemoProSetup`
// (`?pro=open|active&pro_features=on` in the dashboard) switches each part on for tests.

import { NO_PRO_FEATURES, type ProFeatures, type ProView } from '../../pro'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

/** Restore with this id (any valid email) to see an active Pro in the demo. */
export const DEMO_PRO_SUBSCRIPTION = 'sub_DemoPro00001'
const LAUNCH =
  'Ferrocast Pro launches after version 1. Everything Ferrocast does today is free, and stays free.'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What the demo's Pro starts as (all off by default, like the real relay today). */
export interface DemoProSetup {
  /** `PRO_SALES_OPEN` on. */
  salesOpen?: boolean
  /** An active subscription (the restored demo one). */
  active?: boolean
  /** Every Pro feature built and configured on the "relay". */
  features?: boolean
}

export class DemoPro {
  private state: ProView = {
    active: false,
    pro: false,
    status: 'none',
    plan: null,
    subscription_id: null,
    current_end: null,
    access_until: null,
    cancel_at_period_end: false,
    refunded: false,
    installs: 0,
    sales_open: false,
    prices: { currency: 'INR', monthly: 19_900, yearly: 199_900 },
    checked_at: Date.now(),
    stale: false,
    offline_grace_days: 7,
    launch_note: LAUNCH,
    warning: null,
    features: { ...NO_PRO_FEATURES },
    quotas: {},
  }

  constructor(setup: DemoProSetup = {}) {
    this.setup(setup)
  }

  /** Switches the demo's Pro state (tests, `?pro=` in the dashboard). */
  setup(s: DemoProSetup): void {
    if (s.salesOpen !== undefined) this.state.sales_open = s.salesOpen
    if (s.features !== undefined) {
      const on = s.features
      this.state.features = Object.fromEntries(
        Object.keys(NO_PRO_FEATURES).map((k) => [k, on]),
      ) as unknown as ProFeatures
    }
    if (s.active) this.activate(DEMO_PRO_SUBSCRIPTION)
    else if (s.active === false)
      Object.assign(this.state, {
        active: false,
        pro: false,
        status: 'none',
        plan: null,
        subscription_id: null,
        current_end: null,
        access_until: null,
        installs: 0,
      })
  }

  private activate(id: string): void {
    const end = Date.now() + 30 * 86_400_000
    Object.assign(this.state, {
      active: true,
      pro: true,
      status: 'active',
      plan: 'monthly',
      subscription_id: id,
      current_end: end,
      access_until: end + 3 * 86_400_000,
      installs: 1,
    })
  }

  private view(): ProView {
    return clone({ ...this.state, checked_at: Date.now() })
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro') return NOT_MINE
    const sub = seg[1]
    if (!sub && method === 'GET') return this.view()
    if (method !== 'POST') return NOT_MINE
    if (sub === 'refresh') return this.view()
    if (sub === 'checkout') {
      throw new HttpError(409, 'pro_not_on_sale', 'Ferrocast Pro isn’t on sale yet.', LAUNCH)
    }
    if (sub === 'manage') {
      if (!this.state.subscription_id)
        throw new HttpError(
          404,
          'no_subscription',
          'This install has no Pro subscription to manage.',
          'Buy Pro, or restore it with your subscription id, in Settings › Pro.',
        )
      return {
        url: 'https://ferrocast.clearcraftlabs.com/pricing/',
        expires_at: Date.now() + 1_800_000,
      }
    }
    if (sub === 'cancel') {
      if (this.state.status !== 'active')
        throw new HttpError(404, 'no_subscription', 'This install has no Pro subscription.')
      if (this.state.cancel_at_period_end)
        throw new HttpError(409, 'already_cancelled', 'Pro is already set to end with this period.')
      this.state.cancel_at_period_end = true
      this.state.access_until = this.state.current_end
      return this.view()
    }
    if (sub === 'restore') {
      const b = requireObj(body)
      const id = typeof b.subscription_id === 'string' ? b.subscription_id.trim() : ''
      const email = typeof b.email === 'string' ? b.email.trim() : ''
      if (!/^sub_[A-Za-z0-9]+$/.test(id))
        throw new HttpError(
          422,
          'invalid_subscription',
          'That isn’t a subscription id.',
          'It starts with sub_ and is in Razorpay’s emails about your Pro subscription.',
        )
      if (!EMAIL.test(email))
        throw new HttpError(422, 'invalid_email', 'That email address doesn’t look right.')
      if (id !== DEMO_PRO_SUBSCRIPTION)
        throw new HttpError(
          404,
          'not_found',
          'We couldn’t find Ferrocast Pro with that subscription id and email.',
          'Check the id (sub_…) in Razorpay’s email, and use the email you gave at checkout.',
        )
      this.activate(id)
      return this.view()
    }
    return NOT_MINE
  }
}
