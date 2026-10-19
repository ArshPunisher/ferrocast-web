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
  /** Paise. */
  prices: { currency: 'INR'; monthly: number; yearly: number } | null
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
export function proPanelState(p: ProView | null, feature?: ProFeature): 'hidden' | 'locked' | 'open' {
  if (!p) return 'hidden'
  if (feature && !p.features[feature]) return 'hidden'
  if (p.active) return 'open'
  return p.sales_open ? 'locked' : 'hidden'
}

export interface ProCheckout {
  checkout_url: string
  subscription_id: string
  plan: ProPlan
  amount: number
  currency: 'INR'
}

/** Pro's routes on a dashboard client. */
export function proApi(c: FerroClient) {
  return {
    status: () => c.request<ProView>('GET', '/api/v1/pro'),
    refresh: () => c.request<ProView>('POST', '/api/v1/pro/refresh', {}),
    checkout: (plan: ProPlan, email: string) =>
      c.request<ProCheckout>('POST', '/api/v1/pro/checkout', { plan, email }),
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
