// Decides how the dashboard reaches an engine (API.md §2):
//  1. Desktop window: Tauri injects `window.__FERROCAST__ = { api, token }` before load.
//  2. Browser opened from the app: `/app/#pair=<code>` → POST /session/pair → token.
//  3. Browser reopened later: the token saved for this tab (sessionStorage).
//  4. Anything else (a plain `pnpm dev`, the website preview, screenshots): demo mode with
//     an in-browser engine, clearly labelled.
//  5. A phone through Ferrocast's servers (Pro "Dashboard anywhere", API.md §9.5): the relay
//     injects `window.__FERROCAST__ = { api: "<origin>/r", remote: true }`; the phone pairs
//     once with `#pair=<code>` and keeps its device token in localStorage (30 days from the
//     last use, revocable on the PC). `?remote=owner|mod` (and `&pc=off`) shows it in the demo.
//     While the PC is off and the cloud bot stands in (M10), the phone gets a limited
//     dashboard: chat, bans and history from the relay (`&cloud=on|paused` in the demo).

import {
  ApiError,
  FerroClient,
  cloudCanModerate,
  phoneApi,
  remoteAllowed,
  remoteOfflineGuard,
  type SocketFactory,
} from '@ferrocast/api'
import type { RemoteState } from './store'
import { markUnlockShown } from './pro-status'
import { accountApi, publishAccount } from './account-status'
import {
  cloudApi,
  cloudFetch,
  type AccountPc,
  type CloudSummary,
  type WebAccountApi,
} from '@ferrocast/api'

declare global {
  interface Window {
    __FERROCAST__?: { api: string; token?: string; remote?: boolean; desktop?: boolean }
    /** Demo engine handle for tests (Playwright) and the "simulate" menu. */
    __ferrocastDemo?: import('@ferrocast/api/demo').DemoEngine
  }
}

export type Mode = 'desktop' | 'browser' | 'demo' | 'remote' | 'cloud'

export interface Connection {
  mode: Mode
  client: FerroClient
  socket: SocketFactory
  /** Set when this dashboard reaches the PC through Ferrocast's servers (or the demo acts so). */
  remote?: RemoteState
  /**
   * Cloud mode (1.4, ferrocast docs/CLOUD.md): Ferrocast's servers run it for the signed-in
   * account, no PC needed (`mode: 'cloud'`, or the demo with `?web=cloud`).
   */
  cloud?: true
}

/** Whether this dashboard runs cloud mode (only its screens show). */
export function isCloud(conn: Connection | null | undefined): boolean {
  return !!conn && (conn.mode === 'cloud' || conn.cloud === true)
}

/** The web dashboard remembers whether the streamer picked cloud mode or their PC. */
const WEB_CHOICE_KEY = 'fc-web-choice'

export function chooseWeb(choice: 'cloud' | 'pc'): void {
  try {
    localStorage.setItem(WEB_CHOICE_KEY, choice)
  } catch {
    // private mode: asked again next time
  }
}

function webChoice(): 'cloud' | 'pc' | null {
  try {
    const v = localStorage.getItem(WEB_CHOICE_KEY)
    return v === 'cloud' || v === 'pc' ? v : null
  } catch {
    return null
  }
}

/** The cloud mode client: `<web host>/c`, the account's cookie, its CSRF token on writes. */
function cloudClient(api: string, web: WebAccountApi): FerroClient {
  return new FerroClient({
    base: `${webOrigin(api)}/c`,
    token: null,
    fetch: cloudFetch(() => web.csrfToken?.() ?? null),
  })
}

/**
 * Cloud mode on this web host, if the servers have it: `null` when they don't (404) or can't
 * be asked right now (the PC route stays as it was).
 */
async function cloudHere(api: string, web: WebAccountApi): Promise<CloudSummary | null> {
  try {
    return await cloudApi(cloudClient(api, web)).summary()
  } catch {
    return null
  }
}

/** Whether the web dashboard can offer cloud mode (the gate's "Use cloud mode" button). */
export let cloudOffered = false

const REMOTE_KEY = 'fc-remote'

function readRemote(api: string): string | null {
  try {
    const raw = localStorage.getItem(REMOTE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { api?: unknown; token?: unknown }
    return v.api === api && typeof v.token === 'string' ? v.token : null
  } catch {
    return null
  }
}

function saveRemote(api: string, token: string): void {
  try {
    localStorage.setItem(REMOTE_KEY, JSON.stringify({ api, token }))
  } catch {
    // private mode: pair again next time
  }
}

export function clearRemote(): void {
  try {
    localStorage.removeItem(REMOTE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Why a phone can't show the dashboard (the App shows it with the strip): not paired (or
 * removed), the PC is off, the streamer's Pro is paused (still paired), or it's open in more
 * tabs than the relay keeps.
 */
export type RemoteProblem =
  | 'unpaired'
  /** The web dashboard needs an account: on the way to the sign-in page. */
  | 'signing_in'
  | 'account_disabled'
  /** Signed in, with more than one PC to open (or none signed in yet). */
  | 'choose_pc'
  | 'no_pcs'
  | 'pc_offline'
  /** The PC is off and the cloud bot is connected but switched off (an owner can switch it on). */
  | 'cloud_paused'
  | 'pro_paused'
  | 'elsewhere'

/**
 * Whether a phone's PC is reachable and, while it's off, whether the cloud bot stands in
 * (M10). Set at connect and by the relay's `remote` frames (`store.ts`); a phone's client
 * reads it on every call.
 */
export interface RemoteLink {
  pcOnline: boolean
  cloud: boolean
  /** For the 503's words: what still works depends on the role and the opt-in. */
  role?: 'owner' | 'mod'
  canBan?: boolean
}

let remoteLink: RemoteLink = { pcOnline: true, cloud: false }

export function setRemoteLink(link: RemoteLink): void {
  remoteLink = { ...link }
}

/** The link for a phone's state (`store.ts` keeps it current from the `remote` frames). */
export function linkOf(r: RemoteState): RemoteLink {
  return {
    pcOnline: r.pcOnline,
    cloud: r.cloud === true,
    role: r.role,
    canBan: cloudCanModerate(r.cloudModeration),
  }
}

/** While the PC is off, only what the relay answers itself goes out (the rest: 503 here). */
function phoneGuard(method: string, path: string): ApiError | null {
  if (remoteLink.pcOnline) return null
  return remoteOfflineGuard(
    remoteLink.cloud,
    remoteLink.role ?? 'owner',
    remoteLink.canBan ?? true,
  )(method, path)
}

/** A phone's client: role-checked calls, and tickets instead of the token in URLs. */
export function remoteClient(api: string, token: string, role: 'owner' | 'mod'): FerroClient {
  const phone = phoneApi(api)
  return new FerroClient({
    base: api,
    token,
    // The relay checks the account's cookie too; the dashboard may be on the website.
    fetch: (i, init) => fetch(i, { ...init, credentials: 'include' }),
    allow: (method, path) => remoteAllowed(role, method, path),
    guard: phoneGuard,
    ticket: (kind) => phone.ticket(token, kind),
  })
}

/** The phone's own client for the "PC is off" screen (switching the cloud bot back on). */
export function savedRemoteClient(role: 'owner' | 'mod'): FerroClient | null {
  const api = window.__FERROCAST__?.remote === true ? window.__FERROCAST__.api : null
  const token = api ? readRemote(api) : null
  return api && token ? remoteClient(api, token, role) : null
}

async function remoteConnect(
  api: string,
): Promise<
  | Connection
  | { remoteProblem: RemoteProblem; api: string }
  | { remotePairing: { api: string; code: string } }
> {
  // Accounts (1.3): the web dashboard needs a signed-in account. A relay without accounts
  // answers 404 (`off`) and everything works as before.
  const web = accountApi() as WebAccountApi | null
  const account = web ? await web.status().catch(() => null) : null
  if (account) publishAccount(account)
  if (account?.state === 'signed_out') {
    // The sign-in page lives with the dashboard (the website, or this relay's own pages).
    window.location.assign(`${window.location.origin}/login/?next=${encodeURIComponent('/app/')}`)
    return { remoteProblem: 'signing_in', api }
  }
  if (account?.state === 'disabled') return { remoteProblem: 'account_disabled', api }
  const code = pairCodeFromHash()
  if (code) return { remotePairing: { api, code } }
  let token = readRemote(api)
  // Cloud mode (1.4): picked before, asked for (`#/cloud`), or the account has no PC to open.
  const cloud = web && account?.state === 'signed_in' ? await cloudHere(api, web) : null
  cloudOffered = cloud !== null
  if (cloud && web) {
    const choice = webChoice()
    const asked = /^#\/cloud/.test(location.hash)
    let noPc = false
    if (!asked && choice === null && !token) {
      const pcs = await web.pcs().catch(() => [] as AccountPc[])
      accountPcs = pcs
      noPc = pcs.length === 0
    }
    if (asked || choice === 'cloud' || noPc) {
      return { mode: 'cloud', client: cloudClient(api, web), socket: wsFactory, cloud: true }
    }
  }
  if (!token && web && account?.state === 'signed_in') {
    // No device token yet: open the account's PC (one online PC opens by itself).
    const pcs = await web.pcs().catch(() => [] as AccountPc[])
    accountPcs = pcs
    const online = pcs.filter((p) => p.pc_online)
    const only = online.length === 1 ? online[0] : pcs.length === 1 ? pcs[0] : undefined
    if (!pcs.length) return { remoteProblem: 'no_pcs', api }
    if (!only) return { remoteProblem: 'choose_pc', api }
    const c = await web.connectPc(only.id)
    saveRemote(api, c.token)
    token = c.token
  }
  if (!token) return { remoteProblem: 'unpaired', api }
  try {
    const me = await phoneApi(api).me(token)
    if (!me.pc_online && !me.cloud) {
      setRemoteLink({ pcOnline: false, cloud: false })
      return {
        remoteProblem: me.cloud_paused && me.role === 'owner' ? 'cloud_paused' : 'pc_offline',
        api,
      }
    }
    // The PC is off but the cloud bot stands in: the limited dashboard (chat, bans, history).
    const limited = !me.pc_online
    const remote: RemoteState = {
      role: me.role,
      name: me.name,
      pcOnline: me.pc_online,
      cloud: me.cloud === true,
      cloudPaused: me.cloud_paused === true,
      cloudModeration: me.cloud_moderation ?? {},
      history: me.history === true,
    }
    setRemoteLink(linkOf(remote))
    const client = remoteClient(api, token, me.role)
    // Previews need their ticket before they render; they still work without one (no image).
    if (!limited) await client.refreshMediaTicket().catch(() => {})
    return { mode: 'remote', client, socket: wsFactory, remote }
  } catch (e) {
    // Removed (401): forget the token. Pro paused (402): keep it, it works again later.
    if (e instanceof ApiError && e.status === 401) {
      clearRemote()
      return { remoteProblem: 'unpaired', api }
    }
    if (e instanceof ApiError && e.status === 402) return { remoteProblem: 'pro_paused', api }
    throw e
  }
}

/**
 * A quiet look at this phone's state (the "PC is off" screen polls it): `online` once the PC
 * is back, the problem otherwise, `null` when the relay can't be reached right now.
 */
export async function checkRemote(): Promise<RemoteProblem | 'online' | null> {
  const api = window.__FERROCAST__?.remote === true ? window.__FERROCAST__.api : null
  if (!api) return null
  const token = readRemote(api)
  if (!token) return 'unpaired'
  try {
    const me = await phoneApi(api).me(token)
    // The cloud bot standing in counts as "back": the limited dashboard opens.
    if (me.pc_online || me.cloud) return 'online'
    return me.cloud_paused && me.role === 'owner' ? 'cloud_paused' : 'pc_offline'
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return 'unpaired'
    if (e instanceof ApiError && e.status === 402) return 'pro_paused'
    return null
  }
}

/** The account's PCs from the last connect, for the "choose a PC" screen. */
export let accountPcs: AccountPc[] = []

/** `https://remote.example` from the injected `https://remote.example/r`. */
export function webOrigin(api: string): string {
  return api.replace(/\/r\/?$/, '')
}

/** Opens one of the account's PCs in this browser (the "choose a PC" screen). */
export async function connectAccountPc(api: string, id: string): Promise<void> {
  const web = accountApi() as WebAccountApi | null
  if (!web) throw new Error('No account here.')
  const c = await web.connectPc(id)
  saveRemote(api, c.token)
}

/** Trades a one-time code from the PC for this phone's device token, then connects. */
export async function pairRemote(api: string, code: string): Promise<void> {
  const web = accountApi() as WebAccountApi | null
  const paired = await phoneApi(api).pair(code, web?.csrfToken?.() ?? null)
  saveRemote(api, paired.token)
  history.replaceState(null, '', location.pathname + location.search + '#/')
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

export type ConnectResult =
  | Connection
  | { pairing: { base: string; code: string } }
  | { unpaired: { base: string } }
  | { remoteProblem: RemoteProblem; api: string }
  | { remotePairing: { api: string; code: string } }

export async function connect(): Promise<ConnectResult> {
  const injected = window.__FERROCAST__
  if (injected?.remote === true && typeof injected.api === 'string')
    return remoteConnect(injected.api)
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
  // `?web=cloud|cloud-off|cloud-sleeping`: the web dashboard in cloud mode (CLOUD.md).
  const web = new URLSearchParams(location.search).get('web')
  const cloudMode =
    web === 'cloud'
      ? 'on'
      : web === 'cloud-off'
        ? 'off'
        : web === 'cloud-sleeping'
          ? 'sleeping'
          : null
  const [{ DemoEngine, DEMO_TOKEN, DEMO_PRO_SUBSCRIPTION }, { BUILTINS }] = await Promise.all([
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
    // `?account=signed_in|disabled`: the Ferrocast account on this PC (signed out by default).
    ...(params.get('account') === 'signed_in' || params.get('account') === 'disabled'
      ? { account: params.get('account') as 'signed_in' | 'disabled' }
      : {}),
    ...(cloudMode ? { cloudMode: cloudMode as 'on' | 'off' | 'sleeping' } : {}),
    // `?history=empty`: Pro stream history with no streams yet.
    ...(params.get('history') === 'empty' ? { history: 'empty' as const } : {}),
    // `?remote=owner|mod&pc=off`: this dashboard as a paired phone, the PC on or off;
    // `&cloud=on|paused`: with the PC off, the cloud bot stands in or is switched off (M10).
    ...(params.get('remote') === 'owner' || params.get('remote') === 'mod'
      ? {
          remote: {
            role: params.get('remote') as 'owner' | 'mod',
            pcOnline: params.get('pc') !== 'off',
            cloud: demoCloud(params),
            // `&cloud_mod=off`: the cloud bot without the moderation opt-in.
            moderation: params.get('cloud_mod') !== 'off',
          },
        }
      : {}),
    // `?cloud=empty|new-pc`: Pro cloud backups with none yet, or as a fresh install.
    ...(params.get('cloud') === 'empty' || params.get('cloud') === 'new-pc'
      ? { cloudBackups: params.get('cloud') as 'empty' | 'new-pc' }
      : {}),
    // Pro starts off sale with no features, like the relay today. `?pro=open` puts it on
    // sale, `?pro=active` makes this install Pro, `?pro_features=on` switches every feature on.
    pro: {
      salesOpen: params.get('pro') === 'open',
      // `?pro_sale=on`: a live sale (30% off monthly).
      sale: params.get('pro_sale') === 'on',
      active: params.get('pro') === 'active',
      features: params.get('pro_features') === 'on',
    },
    designs: BUILTINS,
  })
  window.__ferrocastDemo = engine
  // `?pro=active` is a PC that was already Pro, so the one-time unlock doesn't cover the
  // screen under test; `&unlock=1` plays it.
  if (params.get('pro') === 'active' && params.get('unlock') !== '1')
    markUnlockShown({ subscription_id: DEMO_PRO_SUBSCRIPTION })
  const role = params.get('remote')
  const remote: RemoteState | undefined =
    role === 'owner' || role === 'mod'
      ? {
          role,
          name: role === 'mod' ? 'Meera (mod)' : 'Pixel 8',
          pcOnline: params.get('pc') !== 'off',
          cloud: demoCloud(params) === 'on',
          cloudPaused: demoCloud(params) === 'paused',
          cloudModeration: engine.cloudModeration(),
          history: role === 'owner',
        }
      : undefined
  if (remote) setRemoteLink(linkOf(remote))
  return {
    mode: 'demo',
    client: new FerroClient({
      base: engine.base,
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      // As a phone, skip what the role can't call, like the real one.
      ...(remote
        ? { allow: (m: string, p: string) => remoteAllowed(remote.role, m, p), guard: phoneGuard }
        : {}),
    }),
    socket: engine.socket,
    ...(remote ? { remote } : {}),
    ...(cloudMode ? { cloud: true as const } : {}),
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

/** `&cloud=on|paused` with a phone's PC off in the demo (`empty` and `new-pc` are backups'). */
function demoCloud(params: URLSearchParams): 'on' | 'paused' | 'off' {
  const c = params.get('cloud')
  return c === 'on' || c === 'paused' ? c : 'off'
}
