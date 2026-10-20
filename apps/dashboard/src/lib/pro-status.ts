// One shared copy of this install's Pro status for the parts of the app that look different
// once Pro is on (the sidebar seam, the Pro mark, the account chip, Home's welcome strip and
// the one-time unlock). Settings › Pro publishes every fresh answer here, so paying in the
// browser turns the whole app Pro without a reload.

import { useEffect, useSyncExternalStore } from 'react'
import { proApi, type ProView } from '@ferrocast/api'
import { useLive } from './store'

let current: ProView | null = null
let loading: Promise<void> | null = null
const subs = new Set<() => void>()

/** Settings › Pro (and the loader below) hand every new status here. */
export function publishPro(v: ProView | null): void {
  current = v
  subs.forEach((f) => f())
}

/** Test hook: forget the shared status. */
export function resetProStatus(): void {
  current = null
  loading = null
  subs.forEach((f) => f())
}

function subscribe(f: () => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/**
 * This install's Pro status, loaded once and shared. `null` while it loads, on a phone
 * (Pro's status stays on the PC) or when the check failed: nothing Pro shows then (R-01).
 */
export function useProStatus(): ProView | null {
  const conn = useLive((s) => s.conn)
  const remote = useLive((s) => s.remote)
  const v = useSyncExternalStore(subscribe, () => current)
  useEffect(() => {
    if (!conn || remote || current || loading) return
    loading = proApi(conn.client)
      .status()
      .then((p) => publishPro(p))
      .catch(() => undefined)
      .finally(() => {
        loading = null
      })
  }, [conn, remote])
  return remote ? null : v
}

/** A test grant (`comp_…`, made by the owner on the relay): Pro without Razorpay. */
export function isTestGrant(p: Pick<ProView, 'subscription_id'>): boolean {
  return !!p.subscription_id?.startsWith('comp_')
}

/** "Pro, yearly" for the account chip ("Pro, test" for a test grant). */
export function proPlanLine(p: ProView): string {
  if (isTestGrant(p)) return 'Pro, test grant'
  if (p.plan === 'yearly') return 'Pro, yearly'
  if (p.plan === 'monthly') return 'Pro, monthly'
  return 'Pro'
}

/** "NP" for NovaPlays or noor_plays, "M" for Meera. */
export function accountInitials(name: string): string {
  const words = name
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const [a, b] = words
  return (([...(a ?? '')][0] ?? '') + ([...(b ?? '')][0] ?? '')).toUpperCase() || 'FC'
}

// The unlock plays once per subscription: the id it last played for is kept here.
const SHOWN_KEY = 'fc-pro-unlock-shown'
const WELCOME_KEY = 'fc-pro-welcome-dismissed'

function read(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function write(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    // Private window or blocked storage: the moment may play again next time, no harm.
  }
}

/** The key the unlock is remembered by: the subscription, or one key for an id-less Pro. */
function proKey(p: Pick<ProView, 'subscription_id'>): string {
  return p.subscription_id ?? 'pro'
}

export function unlockShown(p: ProView): boolean {
  return read(SHOWN_KEY) === proKey(p)
}
export function markUnlockShown(p: Pick<ProView, 'subscription_id'>): void {
  write(SHOWN_KEY, proKey(p))
}
export function welcomeDismissed(p: ProView): boolean {
  return read(WELCOME_KEY) === proKey(p)
}
export function dismissWelcome(p: ProView): void {
  write(WELCOME_KEY, proKey(p))
}

/** Fired when the unlock closes, so the sidebar seam and Home's strip can arrive once. */
export const PRO_UNLOCKED_EVENT = 'fc-pro-unlocked'
