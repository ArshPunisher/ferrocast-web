// The streamer's Ferrocast account (ferrocast/docs/ACCOUNTS.md). Optional in the app (the
// engine signs in through the browser and keeps the session); needed on the web dashboard
// (the relay's cookie session). Both give the screens the same `AccountView`.

import type { FerroClient, FetchLike } from './client'
import { ApiError, errorFromResponse, offlineError } from './errors'
import type { ProCheckout, ProPlan } from './pro'

export interface FerroAccount {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at: number
  providers: ('google' | 'email')[]
}

/** The account's best subscription or grant (ACCOUNTS.md §5). */
export interface AccountPro {
  active: boolean
  source: 'subscription' | 'grant' | null
  plan: 'monthly' | 'yearly' | 'comp' | null
  status: string | null
  subscription_id: string | null
  current_end: number | null
  access_until: number | null
  renews: boolean
  cancel_at_period_end: boolean
}

export interface AccountView {
  /**
   * `off`: this relay has no accounts yet (the web dashboard works as before 1.3).
   * `pending`: the app opened the browser and waits for the sign-in.
   */
  state: 'signed_out' | 'pending' | 'signed_in' | 'disabled' | 'off'
  account?: FerroAccount | null
  plan?: 'free' | 'pro'
  pro?: AccountPro | null
  session?: { id: string; kind: 'app' | 'web'; label: string; expires_at: number } | null
  pcs?: number
  /** The app answered from memory (Ferrocast's servers can't be reached). */
  stale?: boolean
  /** Why the last sign-in ended, or why the account is signed out or disabled. */
  error?: { message: string; hint: string | null } | null
  started_at?: number
}

export interface AccountSession {
  id: string
  kind: 'app' | 'web'
  label: string
  created_at: number
  last_used_at: number
  expires_at: number
  current: boolean
}

export interface AccountApi {
  /** Where the account reads from: the app's engine or the web host. */
  readonly where: 'app' | 'web'
  status(): Promise<AccountView>
  /** The page to open in the browser to sign in. */
  signIn(label?: string): Promise<{ url: string }>
  cancelSignIn(): Promise<void>
  signOut(everywhere?: boolean): Promise<void>
  sessions(): Promise<AccountSession[]>
  revoke(id: string): Promise<void>
}

/** True when the account has Pro now. */
export function accountIsPro(v: AccountView | null | undefined): boolean {
  return v?.state === 'signed_in' && !!v.pro?.active
}

/** "Pro, yearly", "Pro, monthly", "Pro" (a grant), or "Free plan". */
export function accountPlanLine(v: AccountView | null | undefined): string {
  if (!accountIsPro(v)) return 'Free plan'
  const p = v?.pro?.plan
  return p === 'yearly' ? 'Pro, yearly' : p === 'monthly' ? 'Pro, monthly' : 'Pro'
}

/** The name to show: the account's name, else the part of the email before the @. */
export function accountName(a: Pick<FerroAccount, 'name' | 'email'> | null | undefined): string {
  const n = a?.name?.trim()
  if (n) return n
  const e = a?.email ?? ''
  return e.split('@')[0] || 'Your account'
}

/** A session's kind and label in words: "Ferrocast app, Studio PC" or "Chrome on macOS". */
export function sessionLine(s: Pick<AccountSession, 'kind' | 'label'>): string {
  return s.kind === 'app'
    ? `Ferrocast app${s.label ? `, ${s.label}` : ''}`
    : s.label || 'Web browser'
}

/** In the app: the engine's routes (`/api/v1/pro/account…`, API.md). */
export function appAccountApi(c: FerroClient): AccountApi {
  return {
    where: 'app',
    status: () => c.request<AccountView>('GET', '/api/v1/pro/account'),
    signIn: (label) =>
      c.request<{ url: string }>('POST', '/api/v1/pro/account/sign-in', label ? { label } : {}),
    cancelSignIn: () => c.request<void>('POST', '/api/v1/pro/account/sign-in/cancel', {}),
    signOut: (everywhere = false) =>
      c.request<void>('POST', '/api/v1/pro/account/sign-out', { everywhere }),
    sessions: () =>
      c
        .request<{ sessions: AccountSession[] }>('GET', '/api/v1/pro/account/sessions')
        .then((r) => r.sessions ?? []),
    revoke: (id) =>
      c.request<void>('DELETE', `/api/v1/pro/account/sessions/${encodeURIComponent(id)}`),
  }
}

export interface WebAccountApi extends AccountApi {
  /** `POST /r/v1/pro/checkout {plan, code?}`: Razorpay's page, for the signed-in account. */
  checkout(plan: ProPlan, code?: string): Promise<ProCheckout>
  /** `GET /v1/pro/prices` (no sign-in needed). */
  prices(): Promise<{ currency: 'INR'; monthly: number; yearly: number } | null>
  /** `GET /r/v1/pcs`: the account's signed-in PCs (ACCOUNTS.md §7). */
  pcs(): Promise<AccountPc[]>
  /** `POST /r/v1/pcs/{id}/connect`: this browser becomes an owner device of that PC. */
  connectPc(
    id: string,
  ): Promise<{ token: string; device_id: string; role: 'owner'; name: string; expires_at: number }>
  /** The CSRF token from the last `status()`, for the relay's other writes (`/r/v1/pair`). */
  csrfToken(): string | null
  /** `GET /r/v1/pro/youtube`: YouTube from the cloud for this account (Pro, API.md §9.7). */
  youtube(): Promise<YoutubeCloudView>
  /** `POST /r/v1/pro/youtube/connect`: Google's consent page to open in this tab. */
  youtubeConnect(moderation?: boolean): Promise<{ flow: 'browser'; url: string }>
  /** `PUT /r/v1/pro/youtube/bot {enabled}`: the cloud bot's switch. */
  youtubeBot(enabled: boolean): Promise<YoutubeCloudView>
  /** `DELETE /r/v1/pro/youtube`: unbound and revoked at Google. */
  youtubeDisconnect(): Promise<YoutubeCloudView>
}

/** YouTube from the cloud (no PC) for the signed-in account. */
export interface YoutubeCloudView {
  /** The relay has the YouTube client and the vault set up. */
  available: boolean
  pro: boolean
  bot_on: boolean
  channel: {
    id: string | null
    title: string | null
    moderation: boolean
    error: { code: string; message: string; hint?: string } | null
    live: boolean
    from_web: boolean
    connected_at: number
  } | null
  /** Today's YouTube units (Pacific day), cut to a fair share on busy days. */
  quota: {
    used: number
    limit: number
    reset_at: number
    exhausted: boolean
    fair_share?: boolean
    sharing_today?: number
  } | null
}

export interface AccountPc {
  id: string
  label: string
  pc_online: boolean
  pro: boolean
  last_seen_at: number
}

/**
 * On the web dashboard: the relay's own `/v1/account…` with the cookie session. Every write
 * sends the CSRF token from the last `status()` (ACCOUNTS.md §1).
 */
export function webAccountApi(
  origin: string,
  f: FetchLike = (i, init) => fetch(i, init),
): WebAccountApi {
  const base = origin.replace(/\/+$/, '')
  let csrf: string | null = null

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      if (csrf) headers['X-CSRF-Token'] = csrf
    }
    let res: Response
    try {
      const init: RequestInit = { method, headers, credentials: 'same-origin' }
      if (method !== 'GET') init.body = JSON.stringify(body ?? {})
      res = await f(`${base}${path}`, init)
    } catch {
      throw offlineError()
    }
    if (!res.ok) throw await errorFromResponse(res)
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    where: 'web',
    async status() {
      try {
        const v = await call<AccountView & { csrf_token?: string }>('GET', '/v1/account')
        csrf = v.csrf_token ?? null
        const { csrf_token: _drop, ...rest } = v
        return { ...rest, state: 'signed_in', stale: false }
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) return { state: 'signed_out' }
          if (e.status === 403 && e.code === 'account_disabled')
            return { state: 'disabled', error: { message: e.message, hint: e.hint } }
          if (e.status === 404) return { state: 'off' }
        }
        throw e
      }
    },
    signIn: async () => ({ url: `${base}/login?next=${encodeURIComponent('/app/')}` }),
    cancelSignIn: async () => undefined,
    signOut: (everywhere = false) => call<void>('POST', '/v1/account/logout', { everywhere }),
    sessions: () =>
      call<{ sessions: AccountSession[] }>('GET', '/v1/account/sessions').then(
        (r) => r.sessions ?? [],
      ),
    revoke: (id) => call<void>('DELETE', `/v1/account/sessions/${encodeURIComponent(id)}`),
    checkout: (plan, code) =>
      call<ProCheckout>('POST', '/r/v1/pro/checkout', code ? { plan, code } : { plan }),
    pcs: () => call<{ pcs: AccountPc[] }>('GET', '/r/v1/pcs').then((r) => r.pcs ?? []),
    connectPc: (id) => call('POST', `/r/v1/pcs/${encodeURIComponent(id)}/connect`, {}),
    csrfToken: () => csrf,
    youtube: () => call<YoutubeCloudView>('GET', '/r/v1/pro/youtube'),
    youtubeConnect: (moderation = false) =>
      call<{ flow: 'browser'; url: string }>('POST', '/r/v1/pro/youtube/connect', { moderation }),
    youtubeBot: (enabled) => call<YoutubeCloudView>('PUT', '/r/v1/pro/youtube/bot', { enabled }),
    youtubeDisconnect: () => call<YoutubeCloudView>('DELETE', '/r/v1/pro/youtube'),
    prices: () =>
      call<{ prices?: { currency: 'INR'; monthly: number; yearly: number } }>(
        'GET',
        '/v1/pro/prices',
      ).then((r) => r?.prices ?? null),
  }
}
