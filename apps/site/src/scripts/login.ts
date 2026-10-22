// Sign-in on the website (plan §9). The server keeps the proven flow (a login cookie, a form
// token derived from it, an emailed link and code, Google, the desktop app's sign-in); this
// talks to its JSON endpoints on the API host with the cookie (same site, another address).

export interface LoginState {
  /** The form token for this browser's login cookie. */
  csrf: string
  google: boolean
  /** Signing in for the desktop app (a flow it started), not for the web dashboard. */
  app: boolean
  signed_in: boolean
  /** Where the web dashboard opens after signing in (a path under /app). */
  next: string
}

export interface Done {
  /** `web`: go to `next`; `app`: tell them to go back to the app. */
  done: 'web' | 'app'
  next: string
}

export class LoginError extends Error {
  constructor(
    message: string,
    readonly hint: string | null,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function loginApi(api: string) {
  let csrf = ''
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
      headers['X-CSRF-Token'] = csrf
    }
    let res: Response
    try {
      res = await fetch(`${api}${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw new LoginError(
        'Ferrocast’s server can’t be reached.',
        'Check your internet connection, then try again.',
        'offline',
        0,
      )
    }
    const data = (await res.json().catch(() => null)) as
      (T & { error?: { code?: string; message?: string; hint?: string | null } }) | null
    if (!res.ok || !data) {
      const e = data?.error
      throw new LoginError(
        e?.message ?? 'Signing in didn’t work.',
        // The server's own hint when it gives one; a generic one only when it said nothing.
        e ? (e.hint ?? null) : 'Try again in a moment.',
        e?.code ?? 'unknown',
        res.status,
      )
    }
    return data
  }
  return {
    async start(flow: string | null, next: string | null): Promise<LoginState> {
      const q = new URLSearchParams()
      if (flow) q.set('flow', flow)
      if (next) q.set('next', next)
      const s = await call<LoginState>('GET', `/v1/login?${q}`)
      csrf = s.csrf
      return s
    },
    email: (email: string, flow: string | null, next: string) =>
      call<{ magic_id: string }>('POST', '/v1/login/email', { email, flow, next }),
    code: (magic_id: string, code: string) =>
      call<Done>('POST', '/v1/login/code', { magic_id, code }),
    link: (t: string) => call<Done>('POST', '/v1/login/link', { t }),
    google: (flow: string | null, next: string) =>
      call<{ url: string }>('POST', '/v1/login/google', { flow, next }),
  }
}

/**
 * Where a finished sign-in goes: the dashboard path on this site, or for the desktop app its
 * own address on this computer (it picks the sign-in up there); anything else: the done page.
 */
export function afterSignIn(d: Done): string {
  if (d.done === 'app')
    return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(d.next) ? d.next : '/login/done/'
  return safeNext(d.next)
}

/** `abcd efgh` or `ABCD-EFGH` → `ABCDEFGH`, letters and digits only. */
export function normalCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Only paths under /app on this site: nothing that could leave it. */
export function safeNext(raw: string | null): string {
  const n = (raw ?? '').trim()
  const ok =
    (n === '/app' || n.startsWith('/app/')) &&
    n.length <= 512 &&
    !n.includes('//') &&
    !n.includes('\\') &&
    !/[\s\p{Cc}]/u.test(n)
  return ok ? n : '/app/'
}
