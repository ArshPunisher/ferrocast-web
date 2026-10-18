// The Ferrocast bot (Pro) in the demo, like the engine and relay (`crates/relay/src/discord`):
// 402 without Pro, a server "connected" on the next look after Connect (the demo can't open
// Discord), the same rule checks and limits, and one role above Ferrocast's own so the
// missing-permission answer can be seen.

import {
  DISCORD_GO_LIVE_MAX,
  DISCORD_MAX_LINKS,
  DISCORD_MAX_RULES,
  DISCORD_ROLE_HINT,
  validateRuleDraft,
  type DiscordChannel,
  type DiscordProView,
  type DiscordRole,
  type DiscordRule,
  type DiscordRuleInput,
} from '../../discord-pro'
import type { ProView } from '../../pro'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

export const DEMO_GUILD = { id: '1187254436981133312', name: 'Asha’s Lounge', icon_url: null }
export const DEMO_LINK_URL = 'https://ferrocast-relay.clearcraftlabs.com/d/k7m2qx4p/link'
export const DEMO_LINKED = 42
export const DEMO_PC_CODE = '7F3A-90C2'

export const DEMO_CHANNELS: DiscordChannel[] = [
  { id: '1187254437555752990', name: 'announcements' },
  { id: '1187254437555752991', name: 'going-live' },
  { id: '1187254437555752992', name: 'general' },
  { id: '1187254437555752993', name: 'clips' },
]

export const DEMO_ROLES: DiscordRole[] = [
  { id: '1187254438000000001', name: 'Mods', color: 0xe67e22, assignable: false },
  { id: '1187254438000000002', name: 'VIP', color: 0xf1c40f, assignable: true },
  { id: '1187254438000000003', name: 'Subscriber', color: 0x9b59b6, assignable: true },
  { id: '1187254438000000004', name: 'Member', color: 0xe74c3c, assignable: true },
  { id: '1187254438000000005', name: 'Supporter', color: 0x1abc9c, assignable: true },
  { id: '1187254438000000006', name: 'Regulars', color: 0, assignable: true },
]

const gone = () =>
  new HttpError(
    409,
    'not_connected',
    'No Discord server is connected.',
    'Press Connect server first.',
  )

export class DemoDiscordPro implements DemoFeature {
  private connected = false
  private pending = false
  private channelId: string | null = null
  private goLive = { enabled: false, message: null as string | null }
  private rules: DiscordRule[] = []
  private n = 0
  /** Tests: Discord can't be reached (channels and roles empty, a warning). */
  private discordDown = false
  /** Tests: the first rule's role couldn't be given (Ferrocast's role is below it). */
  private perkBlocked = false
  private connectedAt = 0

  constructor(private readonly pro: () => ProView) {}

  /** Tests: start connected (with a channel and one rule), or Discord unreachable. */
  setState(s: { connected?: boolean; discordDown?: boolean; perkBlocked?: boolean }): void {
    if (s.perkBlocked !== undefined) this.perkBlocked = s.perkBlocked
    if (s.connected !== undefined) {
      this.connected = s.connected
      this.pending = false
      if (s.connected) {
        this.connectedAt = Date.now()
        this.channelId = DEMO_CHANNELS[1]!.id
        this.goLive = { enabled: true, message: null }
        if (!this.rules.length) this.rules.push(this.make(this.subRule()))
      } else this.reset()
    }
    if (s.discordDown !== undefined) this.discordDown = s.discordDown
  }

  /** The bot posts go-live instead of the free webhook (Pro on, go-live on, a channel). */
  proGoLive(): boolean {
    return this.on() && this.connected && this.goLive.enabled && this.channelId !== null
  }

  private subRule(): DiscordRuleInput {
    return {
      kind: 'sub',
      platform: 'twitch',
      tier: null,
      min_minor: null,
      currency: null,
      role_id: DEMO_ROLES[2]!.id,
      keep_days: 31,
    }
  }

  private reset(): void {
    this.connected = false
    this.channelId = null
    this.goLive = { enabled: false, message: null }
    this.rules = []
    this.perkBlocked = false
  }

  private on(): boolean {
    const p = this.pro()
    return p.active && p.features.discord
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

  private view(): DiscordProView {
    const c = this.connected
    const reach = c && !this.discordDown
    return clone({
      connected: c,
      guild: c ? DEMO_GUILD : null,
      channel_id: c ? this.channelId : null,
      channels: reach ? DEMO_CHANNELS : [],
      roles: reach ? DEMO_ROLES : [],
      go_live: this.goLive,
      rules: this.rules,
      linked: c ? DEMO_LINKED : 0,
      link_url: c ? DEMO_LINK_URL : null,
      limits: { guilds: 1, rules: DISCORD_MAX_RULES, links: DISCORD_MAX_LINKS },
      warning:
        c && this.discordDown
          ? 'Discord couldn’t be reached, so channels and roles may be missing.'
          : null,
      perk_issue:
        c && this.perkBlocked && this.rules[0]
          ? {
              rule_id: this.rules[0].id,
              code: 'missing_permission',
              message: 'Some roles couldn’t be given: Ferrocast’s role is below them.',
              hint: DISCORD_ROLE_HINT,
              at: Date.now() - 3_600_000,
            }
          : null,
      connected_by: c ? { pc_code: DEMO_PC_CODE, this_pc: true, at: this.connectedAt } : null,
      pc_code: DEMO_PC_CODE,
    })
  }

  private make(r: DiscordRuleInput, id?: string): DiscordRule {
    return {
      ...r,
      id: id ?? `dr_${(++this.n).toString(16).padStart(12, '0')}`,
      created_at: Date.now(),
    }
  }

  private parseRule(body: unknown): DiscordRuleInput {
    const b = requireObj(body)
    const str = (k: string): string | null => {
      const v = b[k]
      if (v === undefined || v === null) return null
      if (typeof v !== 'string') throw new HttpError(400, 'invalid', `${k}: must be text.`)
      return v
    }
    const num = (k: string): number | null => {
      const v = b[k]
      if (v === undefined || v === null) return null
      if (typeof v !== 'number' || !Number.isInteger(v))
        throw new HttpError(400, 'invalid', `${k}: must be a whole number.`)
      return v
    }
    const draft = {
      kind: str('kind') ?? '',
      platform: str('platform'),
      tier: str('tier'),
      min_minor: num('min_minor'),
      currency: str('currency'),
      role_id: str('role_id') ?? '',
      keep_days: num('keep_days') ?? 31,
    } as DiscordRuleInput
    if (draft.platform !== null && !['twitch', 'youtube', 'kick'].includes(draft.platform))
      throw new HttpError(422, 'invalid_rule', 'platform: pick Twitch, YouTube or Kick.')
    const role = DEMO_ROLES.find((r) => r.id === draft.role_id)
    if (draft.role_id && !role)
      throw new HttpError(
        404,
        'role_not_found',
        'That role isn’t in the server any more.',
        'Pick another role.',
      )
    if (role && !role.assignable)
      throw new HttpError(
        403,
        'missing_permission',
        `Ferrocast can’t give @${role.name}: it’s above Ferrocast’s own role.`,
        DISCORD_ROLE_HINT,
      )
    const v = validateRuleDraft(draft, DEMO_ROLES)
    if (!v.ok) throw new HttpError(422, 'invalid_rule', `${v.field}: ${v.message}`)
    return v.rule
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'discord') return NOT_MINE
    const rest = seg.slice(2)
    this.gate()
    if (rest.length === 0 && method === 'GET') {
      if (this.pending) {
        this.pending = false
        this.connected = true
        this.connectedAt = Date.now()
      }
      return this.view()
    }
    if (rest.length === 0 && method === 'DELETE') {
      if (!this.connected) throw gone()
      this.reset()
      return undefined
    }
    if (rest[0] === 'connect' && rest.length === 1 && method === 'POST') {
      if (this.connected)
        throw new HttpError(
          409,
          'already_connected',
          'A Discord server is already connected.',
          'Disconnect it first to connect another one.',
        )
      this.pending = true
      return {
        invite_url:
          'https://discord.com/oauth2/authorize?client_id=1561463863197835294&scope=bot+applications.commands&permissions=268454912&state=demo',
        expires_at: Date.now() + 600_000,
      }
    }
    if (rest[0] === 'channel' && rest.length === 1 && method === 'PUT') {
      if (!this.connected) throw gone()
      const b = requireObj(body)
      const id = typeof b.channel_id === 'string' ? b.channel_id : ''
      if (!DEMO_CHANNELS.some((c) => c.id === id))
        throw new HttpError(
          404,
          'channel_not_found',
          'That channel isn’t in the server any more.',
          'Pick another channel.',
        )
      this.channelId = id
      return this.view()
    }
    if (rest[0] === 'go-live' && rest.length === 1 && method === 'PUT') {
      if (!this.connected) throw gone()
      const b = requireObj(body)
      if (typeof b.enabled !== 'boolean')
        throw new HttpError(400, 'invalid', 'enabled: must be true or false.')
      let message: string | null = null
      if (b.message !== undefined && b.message !== null) {
        if (typeof b.message !== 'string')
          throw new HttpError(400, 'invalid', 'message: must be text.')
        message = b.message.trim() || null
        if (message && [...message].length > DISCORD_GO_LIVE_MAX)
          throw new HttpError(
            400,
            'invalid',
            `message: keep it to ${DISCORD_GO_LIVE_MAX} characters.`,
          )
      }
      if (b.enabled && !this.channelId)
        throw new HttpError(422, 'no_channel', 'Pick a channel for go-live posts first.')
      this.goLive = { enabled: b.enabled, message }
      return this.view()
    }
    if (rest[0] === 'rules') {
      if (!this.connected) throw gone()
      if (rest.length === 1 && method === 'PUT') {
        if (this.rules.length >= DISCORD_MAX_RULES)
          throw new HttpError(
            409,
            'too_many_rules',
            `Up to ${DISCORD_MAX_RULES} perk rules.`,
            'Delete one to add another.',
          )
        this.rules.push(this.make(this.parseRule(body)))
        return this.view()
      }
      if (rest.length === 2) {
        const i = this.rules.findIndex((r) => r.id === rest[1])
        if (i < 0) throw new HttpError(404, 'rule_not_found', 'That rule doesn’t exist any more.')
        if (i === 0) this.perkBlocked = false
        if (method === 'PUT') {
          this.rules[i] = {
            ...this.make(this.parseRule(body), this.rules[i]!.id),
            created_at: this.rules[i]!.created_at,
          }
          return this.view()
        }
        if (method === 'DELETE') {
          this.rules.splice(i, 1)
          return undefined
        }
      }
    }
    return NOT_MINE
  }
}
