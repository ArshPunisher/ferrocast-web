// The 24/7 cloud bot (Pro) in the demo, like the engine and relay (`crates/relay/src/bot`,
// `crates/engine/src/cloud_bot.rs`): 402 without Pro, Twitch ready and Kick not connected to
// start, Connect hands back a sign-in link and the account shows up on the next look (the demo
// can't open Twitch), Twitch's second step ("Allow it in your channel"), 422 `no_platform` to
// switch on without a ready channel, the PC "going quiet" for tests (`duty: cloud`), Twitch
// unreachable with Try again, and a dropped reply. YouTube (M12, a beta): one step through
// Google, a units-per-day budget (`quota`), and the budget used up (`youtube: 'quota'`).

import {
  CLOUD_BOT_LIMITS,
  type CloudBotChannel,
  type CloudBotQuota,
  type CloudBotPlatform,
  type CloudBotView,
} from '../../cloud-bot'
import type { ProView } from '../../pro'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

export const DEMO_TWITCH_BOT = { id: '903218447', login: 'AshaBot' }
export const DEMO_TWITCH_CHANNEL = { id: '141981764', login: 'Asha_Live' }
export const DEMO_KICK_CHANNEL = { id: '4739102', login: 'asha_live' }
export const DEMO_YOUTUBE_CHANNEL = { id: 'UCq8mX3vB2rT5nWk1yLp0aZw', login: 'Asha Live' }
/** YouTube units a subscription may use a day (the relay's default). */
export const DEMO_YOUTUBE_UNITS = 1_500

export interface DemoCloudBotState {
  /** Start with nothing connected. */
  empty?: boolean
  /** The PC went quiet: the cloud is on duty. */
  onDuty?: boolean
  /** Twitch signed the bot out (blocking: connect again). */
  twitchError?: boolean
  /** Twitch couldn't be reached (retryable: Try again clears it). */
  twitchUnreachable?: boolean
  /** Twitch didn't show the last reply (AutoMod). */
  dropped?: boolean
  /** Another of the streamer's PCs is the one answering. */
  otherPc?: boolean
  /** Kick connected in Accounts (needed to connect it here). */
  kickLinked?: boolean
  /** YouTube connected for the cloud bot (`ready`), with its daily units used up (`quota`). */
  youtube?: 'ready' | 'quota' | 'none'
  /** YouTube connected in Accounts (needed to connect it here). */
  youtubeLinked?: boolean
}

/** The next midnight Pacific (YouTube's quota day), roughly: 07:00 or 08:00 UTC. */
function nextPacificMidnight(now: number): number {
  const d = new Date(now)
  const utc7 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 7)
  return utc7 > now ? utc7 : utc7 + 86_400_000
}

export class DemoCloudBot implements DemoFeature {
  private enabled = true
  private channels: CloudBotChannel[] = []
  private onDuty = false
  private kickLinked = true
  private youtubeLinked = true
  private otherPc = false
  private since = Date.now() - 42 * 60_000
  /** Connect pressed: the account shows up on the next look. */
  private pending: {
    platform: CloudBotPlatform
    account: 'bot' | 'channel'
    moderation: boolean
  } | null = null

  /** `free`: cloud mode (`?web=cloud`), where the bot is part of the free cloud (CLOUD.md §6). */
  constructor(
    private readonly pro: () => ProView,
    private readonly free: () => boolean = () => false,
  ) {
    this.channels = [this.twitchReady()]
  }

  setState(s: DemoCloudBotState): void {
    if (s.empty) {
      this.channels = []
      this.enabled = false
    }
    if (s.onDuty !== undefined) {
      this.onDuty = s.onDuty
      this.since = Date.now() - 42 * 60_000
    }
    if (s.kickLinked !== undefined) this.kickLinked = s.kickLinked
    if (s.youtubeLinked !== undefined) this.youtubeLinked = s.youtubeLinked
    if (s.youtube !== undefined) {
      this.channels = this.channels.filter((c) => c.platform !== 'youtube')
      if (s.youtube !== 'none') this.channels.push(this.youtubeReady(s.youtube === 'quota'))
    }
    if (s.otherPc !== undefined) this.otherPc = s.otherPc
    const tw = this.channels.find((c) => c.platform === 'twitch')
    if (tw && s.twitchUnreachable !== undefined)
      tw.error = s.twitchUnreachable
        ? {
            code: 'twitch_unavailable',
            message: 'Couldn’t reach Twitch to start the cloud bot.',
            hint: 'Ferrocast tries again within the hour, or press Try again.',
            at: Date.now() - 300_000,
            retry: true,
          }
        : null
    if (tw && s.dropped !== undefined)
      tw.last_drop = s.dropped
        ? { reason: 'Your message is being checked by mods', at: Date.now() - 60_000 }
        : null
    if (s.twitchError !== undefined) {
      const t = this.channels.find((c) => c.platform === 'twitch')
      if (t) {
        t.state = s.twitchError ? 'error' : 'ready'
        t.error = s.twitchError
          ? {
              code: 'twitch_signed_out',
              message: 'Twitch signed the bot account out.',
              hint: 'Disconnect Twitch here and connect it again.',
              at: Date.now() - 600_000,
              retry: false,
            }
          : null
      }
    }
  }

  private twitchReady(): CloudBotChannel {
    return {
      platform: 'twitch',
      state: 'ready',
      bot: { ...DEMO_TWITCH_BOT },
      channel: { ...DEMO_TWITCH_CHANNEL },
      moderation: false,
      connected_at: Date.now() - 6 * 86_400_000,
      last_reply_at: Date.now() - 9 * 60_000,
      error: null,
    }
  }

  private youtubeReady(spent = false): CloudBotChannel {
    const reset = nextPacificMidnight(Date.now())
    const quota: CloudBotQuota = spent
      ? { used: 1_486, limit: DEMO_YOUTUBE_UNITS, reset_at: reset, exhausted: true }
      : { used: 212, limit: DEMO_YOUTUBE_UNITS, reset_at: reset, exhausted: false }
    return {
      platform: 'youtube',
      state: 'ready',
      bot: { ...DEMO_YOUTUBE_CHANNEL },
      channel: { ...DEMO_YOUTUBE_CHANNEL },
      moderation: false,
      connected_at: Date.now() - 2 * 86_400_000,
      last_reply_at: Date.now() - 31 * 60_000,
      error: spent
        ? {
            code: 'youtube_quota',
            message: 'YouTube’s daily limit for the cloud bot is used up; it’s back at 07:00 UTC.',
            hint: 'The bot on your PC isn’t affected. The cloud bot answers again after that.',
            at: Date.now() - 20 * 60_000,
            reset_at: reset,
            retry: true,
          }
        : null,
      beta: true,
      quota,
    }
  }

  private on(): boolean {
    if (this.free()) return true
    const p = this.pro()
    return p.active && p.features.cloud_bot
  }

  private gate(): void {
    if (!this.on())
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
  }

  private ready(): boolean {
    return this.channels.some((c) => c.state === 'ready')
  }

  private view(): CloudBotView {
    const on = this.enabled && this.ready()
    const who = on ? (this.onDuty ? 'cloud' : 'desktop') : 'off'
    return clone({
      enabled: this.enabled,
      duty: {
        who,
        since: on ? (this.onDuty ? this.since : Date.now() - 3 * 3_600_000) : null,
        desktop_seen_at: this.onDuty ? this.since - 90_000 : Date.now() - 12_000,
        this_pc: !this.otherPc,
      },
      pc_code: '7F3A-90C2',
      version: 14,
      config_updated_at: Date.now() - 3_600_000,
      counts: { commands: 12, timers: 3, counters: 2, auto_replies: 4 },
      channels: this.channels.map((c) => ({ ...c, duty: c.state === 'ready' ? who : 'off' })),
      available: { twitch: true, kick: true, youtube: true },
      limits: { ...CLOUD_BOT_LIMITS, youtube_daily_units: DEMO_YOUTUBE_UNITS },
      pro_available: true,
      sync: this.enabled
        ? { state: 'synced', version: 14, synced_at: Date.now() - 3_600_000, error: null }
        : { state: 'off', version: 14, synced_at: null, error: null },
    } satisfies CloudBotView)
  }

  /** Back from the sign-in tab: the account it was for is now in. */
  private settle(): void {
    const p = this.pending
    if (!p) return
    this.pending = null
    const now = Date.now()
    // The moderation opt-in signed the bot in again: same channel, moderator scopes on.
    const again = this.channels.find(
      (c) => c.platform === p.platform && c.state !== 'needs_channel',
    )
    if (again && p.moderation && p.account === 'bot') {
      again.moderation = true
      return
    }
    if (p.platform === 'youtube') {
      const y = this.youtubeReady()
      y.connected_at = now
      y.last_reply_at = null
      y.moderation = p.moderation
      if (y.quota) y.quota.used = 1
      this.channels.push(y)
      return
    }
    if (p.platform === 'kick') {
      this.channels.push({
        platform: 'kick',
        state: 'ready',
        bot: { ...DEMO_KICK_CHANNEL },
        channel: { ...DEMO_KICK_CHANNEL },
        moderation: p.moderation,
        connected_at: now,
        last_reply_at: null,
        error: null,
      })
      return
    }
    const t = this.channels.find((c) => c.platform === 'twitch')
    if (p.account === 'bot' && !t)
      this.channels.unshift({
        platform: 'twitch',
        state: 'needs_channel',
        bot: { ...DEMO_TWITCH_BOT },
        channel: null,
        moderation: p.moderation,
        connected_at: now,
        last_reply_at: null,
        error: null,
      })
    else if (p.account === 'channel' && t && t.state === 'needs_channel') {
      t.state = 'ready'
      t.channel = { ...DEMO_TWITCH_CHANNEL }
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'bot') return NOT_MINE
    const rest = seg.slice(2)
    this.gate()
    if (rest.length === 0 && method === 'GET') {
      this.settle()
      return this.view()
    }
    if (rest.length === 1 && rest[0] === 'enabled' && method === 'PUT') {
      const b = requireObj(body)
      if (typeof b.enabled !== 'boolean')
        throw new HttpError(400, 'invalid', 'enabled: must be true or false.')
      if (b.enabled && !this.ready())
        throw new HttpError(
          422,
          'no_platform',
          'Connect Twitch or Kick for the cloud bot first.',
          'Then switch it on.',
        )
      this.enabled = b.enabled
      return this.view()
    }
    const platform = rest[0] ?? ''
    const known = ['twitch', 'kick', 'youtube'].includes(platform)
    if (rest.length === 2 && rest[1] === 'connect' && method === 'POST') {
      if (!known)
        throw new HttpError(404, 'platform_not_found', 'Ferrocast doesn’t know that platform.')
      if (body && typeof body === 'object' && (body as { retry?: unknown }).retry === true) {
        const have = this.channels.find(
          (c) => c.platform === platform && c.state !== 'needs_channel',
        )
        if (!have)
          throw new HttpError(
            409,
            'not_connected',
            'Connect it for the cloud bot first.',
            'Press Connect next to the platform.',
          )
        if (have.state === 'error')
          throw new HttpError(
            409,
            'connect_again',
            'This sign-in has to be made again.',
            'Disconnect it here and connect it again.',
          )
        have.error = null
        return this.view()
      }
      const b = body === undefined || body === null ? {} : requireObj(body)
      const account = b.account === 'channel' ? 'channel' : 'bot'
      const moderation = b.moderation === true
      const have = this.channels.find((c) => c.platform === platform)
      // The moderation opt-in (M10) signs the bot account in again over a connected channel.
      const upgrade = account === 'bot' && moderation && !!have && !have.moderation
      if (upgrade) {
        // falls through to the sign-in link
      } else if (platform === 'youtube') {
        if (have)
          throw new HttpError(
            409,
            'already_connected',
            'YouTube is already connected for the cloud bot.',
            'Disconnect it first to use another account.',
          )
        if (!this.youtubeLinked)
          throw new HttpError(
            409,
            'youtube_not_linked',
            'Connect YouTube in Accounts on this PC first.',
            'Connect YouTube in Accounts on this PC, then try again: the cloud bot speaks in that channel.',
          )
      } else if (platform === 'kick') {
        if (have)
          throw new HttpError(
            409,
            'already_connected',
            'Kick is already connected.',
            'Disconnect it first.',
          )
        if (!this.kickLinked)
          throw new HttpError(
            409,
            'kick_not_linked',
            'Connect Kick in Accounts first.',
            'Kick’s chat reaches the cloud through that connection.',
          )
      } else if (account === 'bot' ? have : have?.state !== 'needs_channel')
        throw new HttpError(
          409,
          'already_connected',
          account === 'bot'
            ? 'A Twitch bot account is already connected.'
            : 'Connect the bot account first.',
          'Disconnect Twitch first to use another account.',
        )
      this.pending = { platform: platform as CloudBotPlatform, account, moderation }
      const url =
        platform === 'youtube'
          ? 'https://accounts.google.com/o/oauth2/v2/auth?client_id=demo.apps.googleusercontent.com&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.force-ssl&access_type=offline&prompt=consent&state=demo'
          : platform === 'kick'
            ? `https://id.kick.com/oauth/authorize?client_id=demo&scope=user%3Aread+chat%3Awrite${
                moderation ? '+moderation%3Aban+moderation%3Achat_message%3Amanage' : ''
              }&state=demo`
            : `https://id.twitch.tv/oauth2/authorize?client_id=demo&scope=${
                account === 'bot'
                  ? `user%3Abot+user%3Aread%3Achat+user%3Awrite%3Achat${
                      moderation
                        ? '+moderator%3Amanage%3Abanned_users+moderator%3Amanage%3Achat_messages'
                        : ''
                    }`
                  : 'channel%3Abot'
              }&force_verify=true&state=demo`
      return { auth_url: url, expires_at: Date.now() + 600_000 }
    }
    if (rest.length === 1 && method === 'DELETE') {
      if (!known)
        throw new HttpError(404, 'platform_not_found', 'Ferrocast doesn’t know that platform.')
      this.channels = this.channels.filter((c) => c.platform !== platform)
      if (!this.ready()) this.enabled = false
      return undefined
    }
    throw new HttpError(404, 'not_found', 'That doesn’t exist.')
  }
}
