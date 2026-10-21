// Cloud mode (1.4, ferrocast docs/CLOUD.md): Ferrocast running from Ferrocast's servers for a
// signed-in account, free, with no PC. The web dashboard talks to `https://<web host>/c` with
// the engine's own paths (`/c/api/v1/*`), the account's cookie and its CSRF token, so its
// screens work unchanged. Only some screens exist in the cloud (alerts, designs, overlays,
// chat to read, the bot); the rest need the app on a PC.

import type { FetchLike } from './client'
import type { FerroClient } from './client'

export type CloudPlatform = 'twitch' | 'kick' | 'youtube'

export interface CloudProblem {
  code: string
  message: string
  hint: string
}

export interface CloudChannel {
  platform: CloudPlatform
  login: string
  name: string | null
  avatar_url: string | null
  connected_at: number
  /** Why the cloud can't use it right now (signed out, Twitch unreachable), with what to do. */
  error: CloudProblem | null
}

export interface CloudUsage {
  bytes: number
  bytes_limit: number
  overlays: number
  rules: number
  designs: number
}

export interface CloudLimits {
  bytes: number
  file_bytes: number
  overlays: number
  rules: number
  designs: number
  history_days: number
  sleep_after_days: number
}

/** `GET /c/v1/cloud` (CLOUD.md §9.1). */
export interface CloudSummary {
  enabled: boolean
  /** Not used for 30 days: alerts stopped until the next sign-in or dashboard visit. */
  sleeping: boolean
  enabled_at: number | null
  /** Where overlay URLs live (never the web host). */
  overlay_origin: string
  usage: CloudUsage | null
  limits: CloudLimits
  channels: CloudChannel[]
  /** Which platforms the servers can connect (YouTube in the cloud is Pro). */
  features: Record<CloudPlatform, boolean>
}

/** Screens a cloud mode dashboard shows; anything else opens the Cloud page. */
export const CLOUD_SCREENS = [
  'cloud',
  'chat',
  'alerts',
  'overlays',
  'overlay',
  'designs',
  'designer',
  'bot',
  'account',
] as const

export const CLOUD_HOME = 'cloud'

export function cloudScreenAllowed(name: string): boolean {
  return (CLOUD_SCREENS as readonly string[]).includes(name)
}

/**
 * The cloud's own calls (outside `/api/v1`): the summary and turning it on. `client` is the
 * cloud mode client (base `<web host>/c`), or the demo's.
 */
export function cloudApi(client: FerroClient) {
  return {
    summary: () => client.request<CloudSummary>('GET', '/v1/cloud'),
    enable: () => client.request<CloudSummary>('POST', '/v1/cloud/enable', {}),
  }
}

/**
 * The cloud mode client's fetch: the account's cookie goes with every call (same origin), and
 * writes carry the CSRF token (ACCOUNTS.md §1).
 */
export function cloudFetch(
  csrf: () => string | null,
  inner: FetchLike = (i, init) => fetch(i, init),
): FetchLike {
  return (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    headers.delete('Authorization')
    const token = csrf()
    if (method !== 'GET' && method !== 'HEAD' && token) headers.set('X-CSRF-Token', token)
    return inner(input, { ...init, headers, credentials: 'same-origin' })
  }
}

/** "120 MB of 200 MB" style figures for the usage meter. */
export function cloudBytes(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10} MB`.replace('.0 MB', ' MB')
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`
  return `${n} bytes`
}

/** A channel's line on the Cloud page. */
export function cloudChannelLine(ch: CloudChannel | undefined, platform: CloudPlatform): string {
  const label = platform === 'twitch' ? 'Twitch' : platform === 'kick' ? 'Kick' : 'YouTube'
  if (!ch) return `${label} isn’t connected.`
  if (ch.error) return ch.error.message
  return `Alerts and chat from ${ch.name ?? ch.login} come in here.`
}
