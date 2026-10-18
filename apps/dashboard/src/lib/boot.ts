// Decides how the dashboard reaches an engine (API.md §2):
//  1. Desktop window: Tauri injects `window.__FERROCAST__ = { api, token }` before load.
//  2. Browser opened from the app: `/app/#pair=<code>` → POST /session/pair → token.
//  3. Browser reopened later: the token saved for this tab (sessionStorage).
//  4. Anything else (a plain `pnpm dev`, the website preview, screenshots): demo mode with
//     an in-browser engine, clearly labelled.

import { FerroClient, type SocketFactory } from '@ferrocast/api'

declare global {
  interface Window {
    __FERROCAST__?: { api: string; token: string }
    /** Demo engine handle for tests (Playwright) and the "simulate" menu. */
    __ferrocastDemo?: import('@ferrocast/api/demo').DemoEngine
  }
}

export type Mode = 'desktop' | 'browser' | 'demo'

export interface Connection {
  mode: Mode
  client: FerroClient
  socket: SocketFactory
}

const TOKEN_KEY = 'fc-session'

function readSession(): { api: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { api?: unknown; token?: unknown }
    return typeof v.api === 'string' && typeof v.token === 'string'
      ? { api: v.api, token: v.token }
      : null
  } catch {
    return null
  }
}

export function saveSession(api: string, token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ api, token }))
  } catch {
    // private mode: the session just won't survive a reload
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

const wsFactory: SocketFactory = (url) => new WebSocket(url) as unknown as ReturnType<SocketFactory>

/** The engine origin when the dashboard is served by it (`/app/`), else an explicit override. */
function engineBase(): string | null {
  const q = new URLSearchParams(location.search).get('engine')
  if (q && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) return q
  if (/\/app\/?/.test(location.pathname) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname))
    return location.origin
  return null
}

export function pairCodeFromHash(): string | null {
  const m = /[#&]pair=([A-Za-z0-9]{4,12})/.exec(location.hash)
  return m ? (m[1] ?? null) : null
}

/** True when a real engine answers at `base` (it replies 401 with the documented body). */
async function engineAnswers(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/v1/status`, { headers: { Accept: 'application/json' } })
    if (r.status !== 401) return false
    const body = (await r.json()) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string'
  } catch {
    return false
  }
}

export async function connect(): Promise<
  Connection | { pairing: { base: string; code: string } } | { unpaired: { base: string } }
> {
  const injected = window.__FERROCAST__
  if (injected && typeof injected.api === 'string' && typeof injected.token === 'string') {
    return {
      mode: 'desktop',
      client: new FerroClient({ base: injected.api, token: injected.token }),
      socket: wsFactory,
    }
  }
  const base = engineBase()
  const code = pairCodeFromHash()
  if (base && code) return { pairing: { base, code } }
  const saved = readSession()
  if (saved && (!base || saved.api === base)) {
    return {
      mode: 'browser',
      client: new FerroClient({ base: saved.api, token: saved.token }),
      socket: wsFactory,
    }
  }
  // Served by a real engine but not linked yet: ask for a link, don't fake a stream.
  if (base && (await engineAnswers(base))) return { unpaired: { base } }
  return demo()
}

export async function demo(opts: { setupDone?: boolean } = {}): Promise<Connection> {
  const [{ DemoEngine, DEMO_TOKEN }, { BUILTINS }] = await Promise.all([
    import('@ferrocast/api/demo'),
    import('@ferrocast/designs'),
  ])
  const params = new URLSearchParams(location.search)
  const setupDone = opts.setupDone ?? params.get('firstrun') === null
  window.__ferrocastDemo?.dispose()
  const engine = new DemoEngine({
    setupDone,
    autoplay: params.get('autoplay') !== '0',
    ...(params.has('latency') ? { latencyMs: Number(params.get('latency')) } : {}),
    // `?tips=empty` starts with no tip page saved; `?relay=0` is a build without a relay.
    ...(params.get('tips') === 'empty' ? { tips: 'empty' as const } : {}),
    ...(params.get('relay') === '0' ? { relay: false } : {}),
    // Pro starts off sale with no features, like the relay today. `?pro=open` puts it on
    // sale, `?pro=active` makes this install Pro, `?pro_features=on` switches every feature on.
    pro: {
      salesOpen: params.get('pro') === 'open',
      active: params.get('pro') === 'active',
      features: params.get('pro_features') === 'on',
    },
    designs: BUILTINS,
  })
  window.__ferrocastDemo = engine
  return {
    mode: 'demo',
    client: new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
    socket: engine.socket,
  }
}

/** Exchanges a one-time pairing code for a session (API.md §2). */
export async function pair(base: string, code: string): Promise<Connection> {
  const client = new FerroClient({ base, token: null })
  const { token } = await client.pair(code)
  client.setToken(token)
  saveSession(base, token)
  history.replaceState(null, '', location.pathname + location.search + '#/home')
  return { mode: 'browser', client, socket: wsFactory }
}
