// Ferrocast Pro in Settings › Pro (API.md §4 "Ferrocast Pro"). The engine asks the relay;
// Razorpay takes the money on its own page. Pro is never needed for anything free.

import type { FerroClient } from './client'

export type ProPlan = 'monthly' | 'yearly'

/** Which Pro features the relay has, built and configured (API.md §9). All false until each ships. */
export interface ProFeatures {
  cloud_bot: boolean
  remote: boolean
  tts: boolean
  discord: boolean
  backups: boolean
  tip_brand: boolean
  history: boolean
  weekly_email: boolean
  /** The tip page on the streamer's own subdomain (Cloudflare for SaaS on the relay). */
  tip_domain: boolean
  /** Smart moderation, smart replies and the written recap (a free-tier model is set up). */
  smart: boolean
}
export type ProFeature = keyof ProFeatures

export const NO_PRO_FEATURES: ProFeatures = {
  cloud_bot: false,
  remote: false,
  tts: false,
  discord: false,
  backups: false,
  tip_brand: false,
  history: false,
  weekly_email: false,
  tip_domain: false,
  smart: false,
}

/** One of the subscription's usage counters (API.md §9). */
export interface ProQuota {
  used: number
  limit: number
  /** UTC calendar periods. */
  period: 'day' | 'month'
  /** When it starts again (ms). */
  reset_at: number
}

export interface ProView {
  /** Pro right now, offline grace included. Use this, not `pro`. */
  active: boolean
  pro: boolean
  status:
    | 'none'
    | 'created'
    | 'authenticated'
    | 'active'
    | 'pending'
    | 'halted'
    | 'paused'
    | 'cancelled'
    | 'completed'
    | 'expired'
  plan: ProPlan | null
  subscription_id: string | null
  current_end: number | null
  access_until: number | null
  cancel_at_period_end: boolean
  refunded: boolean
  installs: number
  sales_open: boolean
  /** Paise, as a buyer pays them now (a live sale applied). */
  prices: { currency: 'INR'; monthly: number; yearly: number } | null
  /** Paise without the sale. Missing from older relays. */
  list_prices?: { currency: 'INR'; monthly: number; yearly: number } | null
  /** The live sale, if one is on. Missing from older relays. */
  sale?: ProSale | null
  checked_at: number
  stale: boolean
  offline_grace_days: number
  launch_note: string
  warning: string | null
  features: ProFeatures
  /** By counter name; empty without a subscription. */
  quotas: Record<string, ProQuota>
}

/**
 * How a Pro feature's panel shows (API.md §9): hidden unless the feature is on this relay
 * and Pro is active or on sale; one calm line when it's only on sale; the feature when Pro.
 * `feature` left out: only the Pro and sale state count.
 */
export function proPanelState(
  p: ProView | null,
  feature?: ProFeature,
): 'hidden' | 'locked' | 'open' {
  if (!p) return 'hidden'
  if (feature && !p.features[feature]) return 'hidden'
  if (p.active) return 'open'
  return p.sales_open ? 'locked' : 'hidden'
}

/** A timed sale on Pro (the relay's `sale`). */
export interface ProSale {
  name: string
  headline: string
  message: string | null
  /** When it ends (ms), or null until stopped. */
  ends_at: number | null
  percent_off: number
  /** The price before the sale, for the plans it lowers (paise). */
  was: Partial<Record<ProPlan, number>>
}

export interface ProCheckout {
  checkout_url: string
  subscription_id: string
  plan: ProPlan
  /** What is charged each period (paise). */
  amount: number
  list_amount?: number
  currency: 'INR'
  /** The discount code was used (false when the sale was already cheaper). */
  code_applied?: boolean
}

/** What redeeming a code did: free Pro (grant) or a price to pass to checkout (discount). */
export type ProRedeem =
  | {
      kind: 'grant'
      status: ProView
      redeemed: { code: string; days: number; until: number; extended: boolean }
    }
  | {
      kind: 'discount'
      code: string
      percent_off: number
      applies_period: ProPlan | null
      prices: Record<ProPlan, { list: number; amount: number; code_applies: boolean }>
    }

/** Pro's routes on a dashboard client. */
export function proApi(c: FerroClient) {
  return {
    status: () => c.request<ProView>('GET', '/api/v1/pro'),
    refresh: () => c.request<ProView>('POST', '/api/v1/pro/refresh', {}),
    checkout: (plan: ProPlan, email: string, code?: string) =>
      c.request<ProCheckout>(
        'POST',
        '/api/v1/pro/checkout',
        code ? { plan, email, code } : { plan, email },
      ),
    redeem: (code: string) => c.request<ProRedeem>('POST', '/api/v1/pro/redeem', { code }),
    manage: () => c.request<{ url: string; expires_at: number }>('POST', '/api/v1/pro/manage', {}),
    cancel: () => c.request<ProView>('POST', '/api/v1/pro/cancel', {}),
    restore: (subscription_id: string, email: string) =>
      c.request<ProView>('POST', '/api/v1/pro/restore', { subscription_id, email }),
  }
}

/** "₹199" from paise, or "₹199.50" when it isn't a whole rupee. */
export function rupeesFromPaise(paise: number): string {
  const whole = paise % 100 === 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100)
}
