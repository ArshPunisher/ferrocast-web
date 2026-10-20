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
/** Redeem these in the demo: 14 days of free Pro, or 20% off the monthly plan. */
export const DEMO_GRANT_CODE = 'DEMO-FREE'
export const DEMO_DISCOUNT_CODE = 'DEMO-SAVE20'
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
  /** The checkout opened earlier was paid (Razorpay's webhook reached the "relay"). */
  paid?: boolean
  /** An owner's test grant (`comp_…`, no Razorpay): running, or ended. */
  testGrant?: 'active' | 'ended'
  /** A live sale: 30% off monthly, ending in 5 days. */
  sale?: boolean
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
    if (s.sale) {
      this.state.list_prices = { currency: 'INR', monthly: 19_900, yearly: 199_900 }
      this.state.prices = { currency: 'INR', monthly: 13_900, yearly: 199_900 }
      this.state.sale = {
        name: 'Diwali',
        headline: '30% off Pro monthly for Diwali',
        message: null,
        ends_at: Date.now() + 5 * 86_400_000,
        percent_off: 30,
        was: { monthly: 19_900 },
      }
    }
    if (s.features !== undefined) {
      const on = s.features
      this.state.features = Object.fromEntries(
        Object.keys(NO_PRO_FEATURES).map((k) => [k, on]),
      ) as unknown as ProFeatures
    }
    if (s.paid && this.pendingCheckout) {
      const { id, plan } = this.pendingCheckout
      this.pendingCheckout = null
      this.activate(id, plan)
    }
    if (s.testGrant) {
      const now = Date.now()
      const end = s.testGrant === 'active' ? now + 14 * 86_400_000 : now - 86_400_000
      Object.assign(this.state, {
        active: s.testGrant === 'active',
        pro: s.testGrant === 'active',
        status: s.testGrant === 'active' ? 'active' : 'cancelled',
        // The relay says "comp" for a test grant's plan.
        plan: 'comp' as unknown as null,
        subscription_id: 'comp_DemoGrant01',
        current_end: end,
        access_until: end,
        cancel_at_period_end: true,
        installs: 1,
      })
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

  /** The last checkout made while on sale, until it's paid. */
  private pendingCheckout: { id: string; plan: 'monthly' | 'yearly' } | null = null

  private activate(id: string, plan: 'monthly' | 'yearly' = 'monthly'): void {
    const end = Date.now() + (plan === 'yearly' ? 365 : 30) * 86_400_000
    Object.assign(this.state, {
      active: true,
      pro: true,
      status: 'active',
      plan,
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
    if (sub === 'redeem') {
      const b = requireObj(body)
      const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
      if (!code) throw new HttpError(422, 'invalid_code', 'Type the code first.')
      if (code === DEMO_DISCOUNT_CODE) {
        const list = this.state.list_prices ?? this.state.prices
        const m = list?.monthly ?? 19_900
        const y = list?.yearly ?? 199_900
        const now = this.state.prices?.monthly ?? m
        const off = Math.floor((m * 0.8) / 100) * 100
        return {
          kind: 'discount',
          code,
          percent_off: 20,
          applies_period: 'monthly',
          prices: {
            monthly: { list: m, amount: Math.min(off, now), code_applies: off < now },
            yearly: { list: y, amount: this.state.prices?.yearly ?? y, code_applies: false },
          },
        }
      }
      if (code !== DEMO_GRANT_CODE)
        throw new HttpError(
          404,
          'code_not_found',
          'That code isn’t valid.',
          'Check the spelling; codes are letters, digits and dashes.',
        )
      if (this.state.active && !this.state.subscription_id?.startsWith('comp_'))
        throw new HttpError(409, 'already_pro', 'This install already pays for Pro.')
      const until = Date.now() + 14 * 86_400_000
      Object.assign(this.state, {
        active: true,
        pro: true,
        status: 'active',
        plan: 'comp' as unknown as null,
        subscription_id: 'comp_DemoCode01',
        current_end: until,
        access_until: until,
        cancel_at_period_end: true,
        installs: 1,
      })
      return {
        kind: 'grant',
        status: this.view(),
        redeemed: { code, days: 14, until, extended: false },
      }
    }
    if (sub === 'checkout') {
      if (!this.state.sales_open)
        throw new HttpError(409, 'pro_not_on_sale', 'Ferrocast Pro isn’t on sale yet.', LAUNCH)
      if (this.state.active)
        throw new HttpError(
          409,
          'already_pro',
          'This install already has Pro.',
          'Press Check again in Settings › Pro to see it.',
        )
      const b = requireObj(body)
      const plan = b.plan
      if (plan !== 'monthly' && plan !== 'yearly')
        throw new HttpError(422, 'invalid_plan', 'plan: pick monthly or yearly.')
      const email = typeof b.email === 'string' ? b.email.trim() : ''
      if (!EMAIL.test(email))
        throw new HttpError(
          422,
          'invalid_email',
          'That email address doesn’t look right.',
          'Use the address where you want Razorpay’s receipts.',
        )
      const id = `sub_DemoCheckout${plan === 'yearly' ? 'Y' : 'M'}`
      this.pendingCheckout = { id, plan }
      this.state.status = 'created'
      const prices = this.state.prices ?? {
        currency: 'INR' as const,
        monthly: 19_900,
        yearly: 199_900,
      }
      return {
        checkout_url: 'https://ferrocast.clearcraftlabs.com/pricing/',
        subscription_id: id,
        plan,
        amount: plan === 'yearly' ? prices.yearly : prices.monthly,
        currency: 'INR',
      }
    }
    if (sub === 'manage') {
      if (this.state.subscription_id?.startsWith('comp_'))
        throw new HttpError(
          409,
          'test_grant',
          'This is a test grant, so there’s nothing to manage.',
          'It ends by itself. Buy Pro in Settings › Pro to keep it after that.',
        )
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
