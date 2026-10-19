// Pro "Dashboard anywhere" (API.md §9.5): the desktop pairs phones and mods, the relay
// serves this same dashboard on its remote host and proxies the API to the PC through a
// tunnel. These are the types, the desktop's calls, the phone's pairing calls, a copy of
// the role rules (`crates/server/src/routes/remote_scope.rs`, kept equal by a test) and the
// words the audit log is shown in.

import type { FerroClient, FetchLike } from './client'
import { errorFromResponse, offlineError } from './errors'

export type RemoteRole = 'owner' | 'mod'

export interface RemoteDevice {
  id: string
  name: string
  role: RemoteRole
  created_at: number
  last_used_at: number
  /** 30 days after the last use. */
  expires_at: number
}

export interface RemoteAuditLine {
  device_id: string
  device_name: string
  /** `POST /mod/ban`, `PAIR device`, `REVOKE device`… */
  action: string
  status: number
  at: number
}

export interface RemoteTunnel {
  state: 'off' | 'connecting' | 'connected' | 'retrying'
  detail: string | null
  since: number | null
}

/** `GET /api/v1/pro/remote`. */
export interface RemoteView {
  devices: RemoteDevice[]
  audit: RemoteAuditLine[]
  limits: { owner: number; mod: number }
  pc_online: boolean
  tunnel: RemoteTunnel
  /** Pro active and the relay has the feature. */
  available: boolean
}

/** `POST /api/v1/pro/remote/codes` → a one-time link (10 minutes). */
export interface RemoteLink {
  code: string
  /** `https://remote.clearcraftlabs.com/app/#pair=<code>` */
  url: string
  expires_at: number
  /** Seconds left when the relay answered: count down from then, not from `expires_at`. */
  expires_in?: number
  role: RemoteRole
  name: string
}

export const REMOTE_LIMITS = { owner: 5, mod: 10 } as const
export const REMOTE_CODE_TTL_MS = 10 * 60_000

/** The desktop's routes for Settings › Dashboard anywhere. */
export function remoteApi(c: FerroClient) {
  return {
    view: () => c.request<RemoteView>('GET', '/api/v1/pro/remote'),
    link: (role: RemoteRole, name?: string) =>
      c.request<RemoteLink>('POST', '/api/v1/pro/remote/codes', name ? { role, name } : { role }),
    revoke: (id: string) =>
      c.request<void>('DELETE', `/api/v1/pro/remote/devices/${encodeURIComponent(id)}`),
  }
}

// ---------------------------------------------------------------- the phone's side

/** What the relay's `/r/v1/me` says about this phone. */
export interface RemoteMe {
  device_id: string
  name: string
  role: RemoteRole
  expires_at: number
  pc_online: boolean
}

/** Close codes on a phone's live socket (the relay's `proxy.rs`). */
export const REMOTE_CLOSE = {
  /** Removed on the PC, or the pairing expired: pair again. */
  revoked: 4401,
  /** The streamer's Pro is paused: stays paired, nothing to do here. */
  proPaused: 4402,
  /** Fell behind: reconnect and refetch. */
  lagged: 4408,
  /** Opened in more tabs than the relay keeps (3): this one closed. */
  elsewhere: 4409,
} as const

/** `POST /api/v1/pro/remote/codes` adds `expires_in` (seconds from now); older relays don't. */
export function linkSecondsLeft(link: { expires_in?: number }, gotAt: number, now: number): number {
  const total = typeof link.expires_in === 'number' ? link.expires_in : REMOTE_CODE_TTL_MS / 1000
  return Math.max(0, Math.ceil(total - (now - gotAt) / 1000))
}

export interface RemotePaired {
  token: string
  device_id: string
  role: RemoteRole
  name: string
  expires_at: number
}

async function relayJson<T>(f: FetchLike, url: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await f(url, init)
  } catch {
    throw offlineError()
  }
  if (!res.ok) throw await errorFromResponse(res)
  return (await res.json()) as T
}

/** `api` is the injected base (`<origin>/r`). */
export function phoneApi(api: string, f: FetchLike = (i, init) => fetch(i, init)) {
  const base = api.replace(/\/+$/, '')
  return {
    pair: (code: string) =>
      relayJson<RemotePaired>(f, `${base}/v1/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code }),
      }),
    me: (token: string) =>
      relayJson<RemoteMe>(f, `${base}/v1/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }),
    /** A short-lived ticket for a URL: `live` (one socket, 60 s) or `media` (5 minutes). */
    ticket: (token: string, kind: 'live' | 'media') =>
      relayJson<{ ticket: string; expires_in: number }>(f, `${base}/v1/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ for: kind }),
      }),
    forget: async (token: string) => {
      try {
        await f(`${base}/v1/forget`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // Gone from this phone either way.
      }
    },
  }
}

// ---------------------------------------------------------------- the role rules

type Rule = readonly [method: string, pattern: string]

/** Everything a mod may do (the server's `MOD_ALLOWED`). */
export const MOD_ALLOWED: readonly Rule[] = [
  ['GET', '/status'],
  ['GET', '/chat'],
  ['POST', '/mod/delete'],
  ['POST', '/mod/timeout'],
  ['POST', '/mod/ban'],
  ['POST', '/mod/unban'],
  ['GET', '/mod/bans'],
  ['GET', '/mod/held'],
  ['POST', '/mod/held/*/release'],
  ['POST', '/mod/held/*/drop'],
  ['GET', '/mod/panic'],
  ['POST', '/mod/panic'],
  ['GET', '/viewers/*/*'],
  ['GET', '/viewers/*/*/note'],
]

/**
 * What an owner's phone may do although `OWNER_DENIED` would refuse it (the server's
 * `OWNER_ALLOWED`, checked first): look at the cloud bot and switch it on or off (API.md §9.7).
 */
export const OWNER_ALLOWED: readonly Rule[] = [
  ['GET', '/pro/bot'],
  ['PUT', '/pro/bot/enabled'],
  // The weekly email's state (the address only as a hint); changing it stays on the PC.
  ['GET', '/pro/history/email'],
]

/** What an owner's phone may never do (the server's `OWNER_DENIED`). */
export const OWNER_DENIED: readonly Rule[] = [
  ['*', '/accounts'],
  ['*', '/accounts/**'],
  ['*', '/session/**'],
  ['*', '/pro'],
  ['*', '/pro/**'],
  ['PUT', '/tips'],
  ['DELETE', '/tips'],
  ['*', '/discord'],
  ['*', '/discord/**'],
  ['PUT', '/obs'],
  ['*', '/obs/detect'],
  ['*', '/export'],
  ['*', '/import'],
  ['*', '/import/**'],
  ['*', '/designs/import'],
  ['*', '/designs/*/export'],
  ['*', '/backups/*/restore'],
  ['POST', '/media'],
  ['*', '/tips/brand/*'],
  ['*', '/updates/install'],
  ['*', '/live'],
]

const SEGMENT_CHARS = /^[A-Za-z0-9\-_.~:@!$&'()*+,;=%]+$/

function segmentOk(s: string): boolean {
  if (!s || s === '.' || s === '..' || s.length > 200 || !SEGMENT_CHARS.test(s)) return false
  for (let i = s.indexOf('%'); i !== -1; i = s.indexOf('%', i + 1)) {
    const hex = s.slice(i + 1, i + 3)
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return false
    const v = parseInt(hex, 16)
    if (v < 0x20 || v === 0x2f || v === 0x5c || v === 0x2e || v === 0x7f) return false
  }
  return true
}

function matches(pattern: string, segs: string[]): boolean {
  const pat = pattern.replace(/^\//, '').split('/')
  if (pat[pat.length - 1] === '**') {
    const fixed = pat.slice(0, -1)
    return segs.length > fixed.length && fixed.every((p, i) => p === '*' || p === segs[i])
  }
  return pat.length === segs.length && pat.every((p, i) => p === '*' || p === segs[i])
}

/** Whether `role` may call `method path` (relative to `/api/v1`, no query). */
export function remoteAllowed(role: RemoteRole, method: string, path: string): boolean {
  if (!path.startsWith('/') || path.length < 2 || path.length > 512) return false
  const segs = path.slice(1).split('/')
  if (!segs.every(segmentOk)) return false
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return false
  const is = (m: string) => m === '*' || m === method
  if (role === 'mod') return MOD_ALLOWED.some(([m, p]) => is(m) && matches(p, segs))
  if (OWNER_ALLOWED.some(([m, p]) => is(m) && matches(p, segs))) return true
  return !OWNER_DENIED.some(([m, p]) => is(m) && matches(p, segs))
}

/** Dashboard screens each role sees on a phone (hidden, never greyed). */
export const REMOTE_SCREENS: Record<RemoteRole, readonly string[] | 'all-but'> = {
  mod: ['chat', 'moderation'],
  owner: 'all-but',
}
/** Screens an owner's phone doesn't get (everything in them needs the PC itself). */
export const OWNER_HIDDEN_SCREENS: readonly string[] = ['import']
/** Settings sections an owner's phone doesn't get. */
export const OWNER_HIDDEN_SETTINGS: readonly string[] = [
  'accounts',
  'obs',
  'discord',
  'data',
  'pro',
  'advanced',
  'remote',
]

export function remoteScreenAllowed(role: RemoteRole, screen: string): boolean {
  const s = REMOTE_SCREENS[role]
  return s === 'all-but' ? !OWNER_HIDDEN_SCREENS.includes(screen) : s.includes(screen)
}

/** Where a phone lands when the screen it asked for isn't its role's. */
export function remoteHome(role: RemoteRole): string {
  return role === 'mod' ? 'chat' : 'home'
}

// ---------------------------------------------------------------- the audit log, in words

const ACTIONS: Record<string, string> = {
  'PAIR device': 'Paired',
  'REVOKE device': 'Removed',
  'FORGET device': 'Signed out',
  'POST /mod/ban': 'Banned someone',
  'POST /mod/unban': 'Unbanned someone',
  'POST /mod/timeout': 'Timed someone out',
  'POST /mod/delete': 'Deleted a message',
  'POST /mod/held/{event_id}/release': 'Approved a held message',
  'POST /mod/held/{event_id}/drop': 'Removed a held message',
  'POST /mod/panic': 'Switched panic mode',
  'POST /chat/send': 'Sent a chat message',
  'PUT /settings': 'Changed settings',
  'POST /test': 'Sent a test alert',
  'POST /queue/pause': 'Paused alerts',
  'POST /queue/resume': 'Resumed alerts',
  'POST /queue/skip': 'Skipped an alert',
  'POST /obs/scene': 'Switched the OBS scene',
  'POST /stream-info/apply': 'Changed the stream title',
}

/** "Banned someone", or a plain fallback for anything not listed ("Changed: /goals/{id}"). */
export function auditLabel(line: Pick<RemoteAuditLine, 'action' | 'status'>): string {
  const known = ACTIONS[line.action]
  const base =
    known ?? (line.action.includes(' /') ? `Changed ${line.action.split(' ')[1]}` : line.action)
  if (line.status === 403) return `Tried: ${base.toLowerCase()} (not allowed)`
  if (line.status >= 400) return `${base} (failed)`
  return base
}

/** Event kinds a mod's live socket gets (the server's `MOD_EVENT_KINDS`). */
export const MOD_EVENT_KINDS = ['chat_message', 'message_deleted', 'user_messages_cleared', 'ban']
/** Live frame types a mod gets (the server's `MOD_FRAMES`); owners get every frame. */
export const MOD_FRAMES = [
  'hello',
  'resync',
  'status',
  'event',
  'held',
  'held_resolved',
  'panic',
  'chatter',
]

/** Whether a live frame may go to `role` (the demo applies it like the PC and the relay). */
export function remoteLiveAllowed(
  role: RemoteRole,
  frame: { type?: unknown; data?: unknown },
): boolean {
  if (role === 'owner') return true
  const d = (frame.data ?? {}) as { kind?: { type?: unknown }; key?: unknown }
  if (frame.type === 'event') return MOD_EVENT_KINDS.includes(String(d.kind?.type))
  if (frame.type === 'notice') return d.key === 'panic'
  if (frame.type === 'remote') return true
  return MOD_FRAMES.includes(String(frame.type))
}
