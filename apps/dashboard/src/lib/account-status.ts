// One shared copy of the Ferrocast account for the sidebar's account bar, Get Pro, the plans
// page and the Account page. In the app it comes from the engine (`/api/v1/pro/account`); on
// the web dashboard from the relay's cookie session. While the app waits for the browser to
// finish signing in, it looks again every 1.5 s. Signed in, it asks again when the window comes
// back and every few minutes while it's shown, so Pro given from the Control Center (or a plan
// bought on the website) shows without restarting (owner, 10 Nov).

import { useEffect, useSyncExternalStore } from 'react'
import {
  appAccountApi,
  webAccountApi,
  type AccountApi,
  type AccountView,
  type WebAccountApi,
} from '@ferrocast/api'
import { useLive } from './store'
import { publishPro } from './pro-status'

let current: AccountView | null = null
let loading: Promise<void> | null = null
let poll: ReturnType<typeof setTimeout> | null = null
const subs = new Set<() => void>()
const PENDING_POLL_MS = 1500
/** While shown, the account is asked again this often… */
const SHOWN_POLL_MS = 3 * 60_000
/** …and when the window comes back, at most this often. */
const BACK_MIN_MS = 20_000

export function publishAccount(v: AccountView | null): void {
  const wasPending = current?.state === 'pending'
  const planBefore =
    current?.state === 'signed_in' ? `${current.plan}:${current.pro?.active}` : null
  current = v
  subs.forEach((f) => f())
  if (poll) clearTimeout(poll)
  poll = null
  if (v?.state === 'pending' && api) poll = setTimeout(() => void reloadAccount(), PENDING_POLL_MS)
  // Signing in, or a plan that changed (Pro given, bought or ended), can change this PC's Pro:
  // ask for the install's Pro again.
  const planChanged =
    planBefore !== null && v?.state === 'signed_in' && planBefore !== `${v.plan}:${v.pro?.active}`
  if ((wasPending || planChanged) && v?.state === 'signed_in' && api?.where === 'app') {
    const c = useLive.getState().conn
    if (c)
      void c.client
        .request<Parameters<typeof publishPro>[0]>('POST', '/api/v1/pro/refresh', {})
        .then(publishPro)
        .catch(() => undefined)
  }
}

/** Test hook. */
export function resetAccount(): void {
  current = null
  loading = null
  api = null
  if (poll) clearTimeout(poll)
  poll = null
  subs.forEach((f) => f())
}

function subscribe(f: () => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

let api: AccountApi | null = null

/** The relay's origin for the web dashboard: the config script's `api` without `/r`. */
function serverOrigin(): string {
  return (window.__FERROCAST__?.api ?? window.location.origin).replace(/\/r\/?$/, '')
}

/** The web dashboard (served by the relay): `window.__FERROCAST__.remote` on a real host. */
export function onWebHost(): boolean {
  return window.__FERROCAST__?.remote === true
}

/** The account API for this dashboard (the app's engine, or the web host's relay). */
export function accountApi(): AccountApi | null {
  if (api) return api
  const conn = useLive.getState().conn
  // The server's address comes from the config script (`<api host>/r`), so the dashboard
  // can live on the website's address while sign-in and data stay on the API host.
  if (onWebHost()) api = webAccountApi(serverOrigin(), undefined, window.location.origin)
  // A phone in the demo acts as a paired phone: its account lives on the web host.
  else if (conn && !conn.remote) api = appAccountApi(conn.client)
  return api
}

/** The web host's API, for checkout and prices (null in the app). */
export function webApi(): WebAccountApi | null {
  const a = accountApi()
  return a?.where === 'web' ? (a as WebAccountApi) : null
}

/** Each ask's number: only the latest one's answer is shown (a slow one can't overwrite it). */
let asking = 0

export async function reloadAccount(fresh = false): Promise<AccountView | null> {
  const a = accountApi()
  if (!a) return null
  const mine = ++asking
  try {
    const v = await a.status(fresh)
    if (mine !== asking) return current
    publishAccount(v)
    return v
  } catch {
    // Quiet: the account bar keeps what it last knew (or stays hidden).
    return current
  }
}

let watching = false
let lastAsked = 0

/** Asks again while the window is shown: when it comes back, and every few minutes. */
export function watchAccount(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  const again = (min: number) => {
    if (document.visibilityState !== 'visible' || current?.state !== 'signed_in') return
    if (Date.now() - lastAsked < min) return
    lastAsked = Date.now()
    void reloadAccount(true)
  }
  const back = () => again(BACK_MIN_MS)
  window.addEventListener('focus', back)
  document.addEventListener('visibilitychange', back)
  setInterval(() => again(SHOWN_POLL_MS - 5_000), SHOWN_POLL_MS)
}

/**
 * The account, loaded once and shared. `null` while it loads, when there's no engine yet, or
 * when it couldn't be read: the sidebar then shows nothing account-related.
 */
export function useAccount(): AccountView | null {
  const conn = useLive((s) => s.conn)
  const v = useSyncExternalStore(subscribe, () => current)
  useEffect(() => {
    if (!conn && !onWebHost()) return
    watchAccount()
    if (current || loading) return
    loading = reloadAccount()
      .then(() => undefined)
      .finally(() => {
        loading = null
      })
  }, [conn])
  return v
}
