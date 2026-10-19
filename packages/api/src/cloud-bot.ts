// The 24/7 cloud bot (Pro, API.md §9.7): Ferrocast's servers answer the streamer's own
// commands, counters, timers and auto-replies on Twitch and Kick while their PC is off. The
// PC answers while it's on (the cloud stands by), the cloud takes over after 90 s of silence
// and hands back when the PC returns. Chat is never stored.

import type { FerroClient } from './client'
import { ApiError } from './errors'

export type CloudBotPlatform = 'twitch' | 'kick'

export interface CloudBotAccount {
  id: string
  login: string
}

export interface CloudBotIssue {
  code: string
  message: string
  hint: string
  at: number
  /** "Try again" can fix it (Twitch unreachable, a refusal); otherwise connect again. */
  retry?: boolean
}

/** A message the platform took but didn't show (AutoMod, slow mode, too long). Not an error. */
export interface CloudBotDrop {
  reason: string
  at: number
}

export interface CloudBotChannel {
  platform: CloudBotPlatform
  /** `needs_channel`: Twitch's bot account is in, the channel hasn't allowed it yet. */
  state: 'needs_channel' | 'ready' | 'error'
  /** Who answers this channel now (the lease is per platform). */
  duty?: 'off' | 'desktop' | 'cloud'
  /** The channel is live (kept on the relay, so it survives a restart). */
  live?: boolean
  /** The account that speaks. */
  bot: CloudBotAccount | null
  /** Whose chat it is. */
  channel: CloudBotAccount | null
  /** Moderator scopes were granted (opt-in). */
  moderation: boolean
  connected_at: number
  last_reply_at: number | null
  error: CloudBotIssue | null
  last_drop?: CloudBotDrop | null
}

export interface CloudBotDuty {
  who: 'off' | 'desktop' | 'cloud'
  since: number | null
  desktop_seen_at: number | null
  /** The last `bot_seen` came from this PC (false: another of the streamer's PCs). */
  this_pc?: boolean
}

export interface CloudBotSync {
  state: 'off' | 'pending' | 'synced' | 'error'
  version: number
  synced_at: number | null
  error: { code: string; message: string; hint: string } | null
}

export interface CloudBotLimits {
  commands: number
  timers: number
  config_bytes: number
  messages_per_minute: number
  channels_per_platform: number
  takeover_after_s: number
}

/** `GET /api/v1/pro/bot`: the relay's view plus the engine's `available` and `sync`. */
export interface CloudBotView {
  enabled: boolean
  duty: CloudBotDuty
  version: number
  config_updated_at: number | null
  counts: { commands: number; timers: number; counters: number; auto_replies: number }
  /** At most one per platform. */
  channels: CloudBotChannel[]
  available: { twitch: boolean; kick: boolean }
  limits: CloudBotLimits
  /** This PC's short code ("7F3A-90C2"), the same one the sign-in pages show. */
  pc_code?: string
  /**
   * Engine: Pro active and the relay has the feature. API.md §9.7 calls this `available`
   * too, which clashes with the relay's per-platform `available`; the engine sends it as
   * `pro_available`.
   */
  pro_available?: boolean
  sync: CloudBotSync
}

/** `POST /api/v1/pro/bot/{platform}/connect` → 201: open `auth_url` in the browser (10 minutes). */
export type CloudBotConnect = { auth_url: string; expires_at: number }

export interface CloudBotConnectOptions {
  /** Twitch: `bot` (the account that speaks, default) or `channel` (the streamer allows it). */
  account?: 'bot' | 'channel'
  moderation?: boolean
}

export const CLOUD_BOT_LIMITS: CloudBotLimits = {
  commands: 500,
  timers: 50,
  config_bytes: 262_144,
  messages_per_minute: 20,
  channels_per_platform: 1,
  takeover_after_s: 90,
}

export const CLOUD_BOT_PLATFORMS: readonly CloudBotPlatform[] = ['twitch', 'kick']

export const CLOUD_BOT_LABEL: Record<CloudBotPlatform, string> = { twitch: 'Twitch', kick: 'Kick' }

/** The platform's channel, if connected. */
export function cloudChannel(
  v: Pick<CloudBotView, 'channels'>,
  p: CloudBotPlatform,
): CloudBotChannel | null {
  return v.channels.find((c) => c.platform === p) ?? null
}

/** Whether the switch may go on: at least one channel is ready. */
export function cloudBotCanEnable(v: Pick<CloudBotView, 'channels'>): boolean {
  return v.channels.some((c) => c.state === 'ready')
}

/** The viewer's own clock format ("21:40", "9:40 PM"). */
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)

const list = (ps: CloudBotPlatform[]) => ps.map((p) => CLOUD_BOT_LABEL[p]).join(' and ')

/**
 * The headline: who answers chat right now. `phone`: seen through Ferrocast's servers, so
 * "this PC" is the streamer's PC, not the device in hand.
 */
export function dutyLine(
  v: Pick<CloudBotView, 'enabled' | 'duty'> & Partial<Pick<CloudBotView, 'channels'>>,
  opts: { phone?: boolean } = {},
): {
  tone: 'off' | 'standby' | 'duty'
  title: string
  detail: string
} {
  const pc = opts.phone ? 'Your PC' : 'This PC'
  if (!v.enabled || v.duty.who === 'off')
    return {
      tone: 'off',
      title: 'Off',
      detail: opts.phone ? 'Only your PC answers chat.' : 'Only this PC answers chat.',
    }
  const answering = opts.phone || v.duty.this_pc !== false ? pc : 'Another of your PCs'
  if (v.duty.who === 'desktop')
    return {
      tone: 'standby',
      title: 'Standing by',
      detail: `${answering} is answering. Ferrocast steps in 90 s after it goes quiet.`,
    }
  const chans = v.channels ?? []
  const cloud = chans.filter((c) => c.duty === 'cloud').map((c) => c.platform)
  const desk = chans.filter((c) => c.duty === 'desktop').map((c) => c.platform)
  return {
    tone: 'duty',
    title: v.duty.since ? `On duty since ${hhmm(v.duty.since)}` : 'On duty',
    detail:
      cloud.length && desk.length
        ? `Ferrocast’s servers answer ${list(cloud)}. ${answering} answers ${list(desk)}.`
        : 'No PC is answering, so Ferrocast’s servers answer chat.',
  }
}

/** "Not shown at 21:40: slow mode" when the platform dropped a message since the last reply. */
export function dropLine(c: Pick<CloudBotChannel, 'last_drop' | 'last_reply_at'>): string | null {
  const d = c.last_drop
  if (!d || (c.last_reply_at && c.last_reply_at > d.at)) return null
  return `A reply wasn’t shown at ${hhmm(d.at)}: ${d.reason}`
}

/** "Last reply 5 min ago" / "No replies yet". */
export function lastReplyLine(at: number | null, now = Date.now()): string {
  if (!at) return 'No replies yet'
  const mins = Math.max(0, Math.round((now - at) / 60_000))
  if (mins < 1) return 'Last reply just now'
  if (mins < 60) return `Last reply ${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `Last reply ${h} h ago`
  return `Last reply ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(at)}`
}

/** The sync line under the switch. */
export function syncLine(s: CloudBotSync): string {
  switch (s.state) {
    case 'off':
      return 'Settings aren’t sent while the cloud bot is off.'
    case 'pending':
      return 'Sending your bot settings…'
    case 'synced':
      return s.synced_at ? `Settings sent at ${hhmm(s.synced_at)}` : 'Settings sent'
    case 'error':
      return s.error?.message ?? 'Your bot settings couldn’t be sent.'
  }
}

/** Fallback words for the cloud bot's codes, for answers that came without a hint. */
const HINTS: Record<string, { message: string; hint: string }> = {
  stale_version: {
    message: 'The bot settings changed on another PC.',
    hint: 'Ferrocast sends yours again by itself.',
  },
  too_many_commands: {
    message: 'The cloud bot takes up to 500 commands.',
    hint: 'Turn off or delete some commands.',
  },
  too_many_timers: {
    message: 'The cloud bot takes up to 50 timers.',
    hint: 'Delete a few timers.',
  },
  invalid_config: {
    message: 'One of your bot settings couldn’t be sent.',
    hint: 'Fix the item named above, then it sends by itself.',
  },
  platform_not_found: {
    message: 'Ferrocast doesn’t know that platform.',
    hint: 'Update Ferrocast.',
  },
  platform_unavailable: {
    message: 'That platform isn’t set up on Ferrocast’s servers yet.',
    hint: 'Try again later. This PC keeps answering chat.',
  },
  already_connected: {
    message: 'That platform is already connected.',
    hint: 'Disconnect it first to use another account.',
  },
  kick_not_linked: {
    message: 'Connect Kick in Accounts first.',
    hint: 'Kick’s chat reaches the cloud through that connection.',
  },
  no_platform: {
    message: 'Connect Twitch or Kick for the cloud bot first.',
    hint: 'Then switch it on.',
  },
  bot_rate: { message: 'Too many changes at once.', hint: 'Wait a minute and try again.' },
  twitch_not_linked: {
    message: 'Connect Twitch in Accounts on this PC first.',
    hint: 'The cloud bot speaks in the channel this PC is signed in to.',
  },
  wrong_twitch_app: {
    message: 'That Twitch sign-in isn’t from Ferrocast on this PC.',
    hint: 'Connect Twitch in Accounts again, then try again.',
  },
  twitch_unreachable: {
    message: 'Couldn’t reach Twitch.',
    hint: 'Try again in a minute.',
  },
  connect_again: {
    message: 'This sign-in has to be made again.',
    hint: 'Disconnect it here and connect it again.',
  },
  not_connected: { message: 'Connect it first.', hint: 'Press Connect next to the platform.' },
  vault_unavailable: {
    message: 'This Pro feature isn’t switched on on Ferrocast’s servers yet.',
    hint: 'Nothing to do on your side; try again later.',
  },
  relay_unreachable: {
    message: 'Couldn’t reach Ferrocast’s servers.',
    hint: 'Check your internet connection. This PC keeps answering chat.',
  },
  pro_required: {
    message: 'This runs on Ferrocast’s servers and is part of Pro.',
    hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
  },
}

/** A cloud bot error as words: the answer's own message and hint, else the fallback. */
export function describeCloudBotError(err: unknown): { message: string; hint: string | null } {
  if (err instanceof ApiError) {
    const f = HINTS[err.code]
    return {
      message: err.message || f?.message || 'That didn’t work.',
      hint: err.hint || f?.hint || null,
    }
  }
  return { message: 'Something went wrong.', hint: 'Try again in a moment.' }
}

export function cloudBotHint(code: string): { message: string; hint: string } | null {
  return HINTS[code] ?? null
}

/** The cloud bot's routes on a dashboard client. */
export function cloudBotApi(c: FerroClient) {
  return {
    get: () => c.request<CloudBotView>('GET', '/api/v1/pro/bot'),
    setEnabled: (enabled: boolean) =>
      c.request<CloudBotView>('PUT', '/api/v1/pro/bot/enabled', { enabled }),
    connect: (platform: CloudBotPlatform, opts: CloudBotConnectOptions = {}) =>
      c.request<CloudBotConnect>(
        'POST',
        `/api/v1/pro/bot/${encodeURIComponent(platform)}/connect`,
        opts,
      ),
    /** Tries a connected channel's retryable error again (Twitch: subscribes again). */
    retry: (platform: CloudBotPlatform) =>
      c.request<CloudBotView>('POST', `/api/v1/pro/bot/${encodeURIComponent(platform)}/connect`, {
        retry: true,
      }),
    disconnect: (platform: CloudBotPlatform) =>
      c.request<void>('DELETE', `/api/v1/pro/bot/${encodeURIComponent(platform)}`),
  }
}
