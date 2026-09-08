// Ferrocast Pro in Settings › Pro (API.md §4 "Ferrocast Pro"). The engine asks the relay;
// Razorpay takes the money on its own page. Pro is never needed for anything free.

import type { FerroClient } from './client'

export type ProPlan = 'monthly' | 'yearly'

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
