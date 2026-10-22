// One shared copy of the Ferrocast account for the sidebar's account bar, Get Pro, the plans
// page and the Account page. In the app it comes from the engine (`/api/v1/pro/account`); on
// the web dashboard from the relay's cookie session. While the app waits for the browser to
// finish signing in, it looks again every 1.5 s.

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

export function publishAccount(v: AccountView | null): void {
  const wasPending = current?.state === 'pending'
  current = v
  subs.forEach((f) => f())
  if (poll) clearTimeout(poll)
  poll = null
  if (v?.state === 'pending' && api) poll = setTimeout(() => void reloadAccount(), PENDING_POLL_MS)
  // Signing in can bring the account's Pro to this PC: ask for the install's Pro again.
  if (wasPending && v?.state === 'signed_in' && api?.where === 'app') {
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

export async function reloadAccount(): Promise<AccountView | null> {
  const a = accountApi()
  if (!a) return null
  try {
    const v = await a.status()
    publishAccount(v)
    return v
  } catch {
    // Quiet: the account bar keeps what it last knew (or stays hidden).
    return current
  }
}

/**
 * The account, loaded once and shared. `null` while it loads, when there's no engine yet, or
 * when it couldn't be read: the sidebar then shows nothing account-related.
 */
export function useAccount(): AccountView | null {
  const conn = useLive((s) => s.conn)
  const v = useSyncExternalStore(subscribe, () => current)
  useEffect(() => {
    if ((!conn && !onWebHost()) || current || loading) return
    loading = reloadAccount()
      .then(() => undefined)
      .finally(() => {
        loading = null
      })
  }, [conn])
  return v
}
