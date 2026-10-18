// The Ferrocast bot in Discord (Pro, API.md §9.6): go-live posts from Ferrocast's servers and
// roles for subscribers, members and tippers. Viewers link their own Discord account from a
// page the streamer shares (never posted by Ferrocast); the relay keeps only the ids it needs.

import type { FerroClient } from './client'

export type DiscordRuleKind = 'sub' | 'sub_tier' | 'member' | 'tip_min'
export type DiscordPlatform = 'twitch' | 'youtube' | 'kick'

export interface DiscordRule {
  /** `dr_` + 12 hex. */
  id: string
  kind: DiscordRuleKind
  /** `null`: any platform. A `member` rule is always YouTube. */
  platform: DiscordPlatform | null
  /** `sub_tier`: "1" | "2" | "3" (that tier or higher, Prime counts as 1). `member`: a YouTube level name, or null for any level. */
  tier: string | null
  /** `tip_min`: minor units (paise, cents), 1 or more. */
  min_minor: number | null
  /** `tip_min`: three capitals ("INR"). */
  currency: string | null
  /** The Discord role (snowflake). */
  role_id: string
  /** 0 to 366; 0 keeps the role for good. */
  keep_days: number
  created_at: number
}

/** A rule as the dashboard sends it (`PUT /pro/discord/rules[/{id}]`). */
export type DiscordRuleInput = Omit<DiscordRule, 'id' | 'created_at'>

export interface DiscordChannel {
  id: string
  name: string
}

export interface DiscordRole {
  id: string
  name: string
  /** 0xRRGGBB, 0 = no colour. */
  color: number
  /** Below Ferrocast's own highest role, not managed, not @everyone. */
  assignable: boolean
}

export interface DiscordProView {
  connected: boolean
  guild: { id: string; name: string; icon_url: string | null } | null
  channel_id: string | null
  /** Text and announcement channels; empty when not connected or Discord couldn't be reached. */
  channels: DiscordChannel[]
  /** Highest first; @everyone and managed roles left out. */
  roles: DiscordRole[]
  go_live: { enabled: boolean; message: string | null }
  /** Oldest first. */
  rules: DiscordRule[]
  /** Discord members who linked at least one account. */
  linked: number
  /** The page viewers open to link their account; null when not connected. */
  link_url: string | null
  limits: { guilds: number; rules: number; links: number }
  warning: string | null
  /** The last time roles couldn't be given (cleared when that rule works again). */
  perk_issue: DiscordPerkIssue | null
  /** Which Ferrocast PC added the bot (its code, never its id); null when not connected. */
  connected_by: { pc_code: string; this_pc: boolean; at: number } | null
  /** This PC's code, as the "Ferrocast is in your server" page shows it ("7F3A-90C2"). */
  pc_code: string
}

export interface DiscordPerkIssue {
  /** The rule whose role couldn't be given. */
  rule_id: string
  code: 'missing_permission' | 'role_missing' | 'guild_missing'
  message: string
  hint: string
  at: number
}

export interface DiscordConnect {
  invite_url: string
  expires_at: number
}

export const DISCORD_MAX_RULES = 10
export const DISCORD_MAX_LINKS = 5_000
export const DISCORD_GO_LIVE_MAX = 300
export const DISCORD_KEEP_DAYS_DEFAULT = 31
export const DISCORD_KEEP_DAYS_MAX = 366
/** The relay's hint for Discord's 50013 (and a role above Ferrocast's). */
export const DISCORD_ROLE_HINT =
  'Move Ferrocast’s role above the perk roles in Server Settings › Roles.'

export const DISCORD_RULE_KINDS: { value: DiscordRuleKind; label: string }[] = [
  { value: 'sub', label: 'Subscriber' },
  { value: 'sub_tier', label: 'Subscriber, tier or higher' },
  { value: 'member', label: 'YouTube member' },
  { value: 'tip_min', label: 'Tip of at least' },
]

const PLATFORM: Record<DiscordPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
}

/**
 * Minor-unit digits (ISO 4217), exactly as the engine's `exponent()` in
 * `ferrocast/crates/core/src/money.rs`: keep the two lists in step (a test checks them).
 * Rules store `min_minor` in these units, so a mismatch would show the wrong amount.
 */
export const CURRENCY_DIGITS_0 = [
  'JPY',
  'KRW',
  'VND',
  'CLP',
  'ISK',
  'UGX',
  'XAF',
  'XOF',
  'PYG',
  'RWF',
  'KMF',
  'GNF',
  'VUV',
  'XPF',
  'DJF',
  'BIF',
] as const
export const CURRENCY_DIGITS_3 = ['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD'] as const

/** Digits after the point for a currency: 0, 3, or 2 for the rest. */
export function moneyExponent(currency: string): number {
  if ((CURRENCY_DIGITS_0 as readonly string[]).includes(currency)) return 0
  if ((CURRENCY_DIGITS_3 as readonly string[]).includes(currency)) return 3
  return 2
}

const digits = moneyExponent

/** 50000 INR → "₹500", 1250 USD → "$12.50". */
export function formatMinor(minor: number, currency: string): string {
  const d = digits(currency)
  const value = minor / 10 ** d
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : d,
      maximumFractionDigits: d,
    }).format(value)
  } catch {
    return `${value.toFixed(d)} ${currency}`
  }
}

/** "500" in INR → 50000; null when it isn't a positive amount. */
export function parseAmount(text: string, currency: string): number | null {
  const t = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const d = digits(currency)
  const [whole, frac = ''] = t.split('.')
  if (frac.length > d) return null
  const n = Number(whole) * 10 ** d + Number(frac.padEnd(d, '0') || '0')
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

/** "Twitch sub" / "Sub, tier 2+" / "YouTube member (Gold)" / "Tip of ₹500+". */
export function ruleWhat(
  r: Pick<DiscordRule, 'kind' | 'platform' | 'tier' | 'min_minor' | 'currency'>,
): string {
  const on = r.platform ? `${PLATFORM[r.platform]} ` : ''
  switch (r.kind) {
    case 'sub':
      return r.platform ? `${on}sub` : 'Sub on any platform'
    case 'sub_tier':
      return `${r.platform ? `${on}sub` : 'Sub'}, tier ${r.tier ?? '1'}+`
    case 'member':
      return r.tier ? `YouTube member (${r.tier})` : 'YouTube member'
    case 'tip_min':
      return `${r.platform ? `${on}tip` : 'Tip'} of ${formatMinor(r.min_minor ?? 0, r.currency ?? 'INR')}+`
  }
}

/** "31 days" / "Keeps it". */
export function keepLabel(days: number): string {
  if (days <= 0) return 'Keeps it'
  return days === 1 ? '1 day' : `${days} days`
}

/** "Twitch sub, tier 2+ → @VIP, 31 days". */
export function ruleSummary(r: DiscordRule, roles: readonly DiscordRole[]): string {
  const role = roles.find((x) => x.id === r.role_id)
  return `${ruleWhat(r)} → @${role?.name ?? 'deleted role'}, ${keepLabel(r.keep_days)}`
}

/** A new rule's starting values. */
export function emptyRuleDraft(roles: readonly DiscordRole[]): DiscordRuleInput {
  return {
    kind: 'sub',
    platform: null,
    tier: null,
    min_minor: null,
    currency: null,
    role_id: roles.find((r) => r.assignable)?.id ?? '',
    keep_days: DISCORD_KEEP_DAYS_DEFAULT,
  }
}

/**
 * The relay's checks, run before sending so the form can point at the field. Returns the
 * cleaned rule (fields that don't apply to its kind set to null), or the field and message.
 */
export function validateRuleDraft(
  d: DiscordRuleInput,
  roles: readonly DiscordRole[],
): { ok: true; rule: DiscordRuleInput } | { ok: false; field: string; message: string } {
  const bad = (field: string, message: string) => ({ ok: false as const, field, message })
  const rule: DiscordRuleInput = {
    kind: d.kind,
    platform: d.kind === 'member' ? 'youtube' : d.platform,
    tier: null,
    min_minor: null,
    currency: null,
    role_id: d.role_id,
    keep_days: d.keep_days,
  }
  if (!DISCORD_RULE_KINDS.some((k) => k.value === d.kind))
    return bad('kind', 'Pick what earns the role.')
  if (d.kind === 'sub_tier') {
    if (!['1', '2', '3'].includes(d.tier ?? '')) return bad('tier', 'Pick tier 1, 2 or 3.')
    if (rule.platform === 'youtube') return bad('platform', 'YouTube has members, not sub tiers.')
    rule.tier = d.tier
  }
  if (d.kind === 'sub' && rule.platform === 'youtube')
    return bad('platform', 'For YouTube, pick “YouTube member”.')
  if (d.kind === 'member') {
    const level = (d.tier ?? '').trim()
    if ([...level].length > 100) return bad('tier', 'Keep the level name under 100 characters.')
    rule.tier = level || null
  }
  if (d.kind === 'tip_min') {
    const cur = (d.currency ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(cur)) return bad('currency', 'Use a three-letter currency, like INR.')
    if (!Number.isSafeInteger(d.min_minor) || (d.min_minor ?? 0) < 1)
      return bad('min_minor', 'Enter an amount above zero.')
    rule.currency = cur
    rule.min_minor = d.min_minor
  }
  const role = roles.find((r) => r.id === d.role_id)
  if (!role) return bad('role_id', 'Pick a role.')
  if (!role.assignable)
    return bad('role_id', `Ferrocast can’t give @${role.name}. ${DISCORD_ROLE_HINT}`)
  if (!Number.isInteger(d.keep_days) || d.keep_days < 0 || d.keep_days > DISCORD_KEEP_DAYS_MAX)
    return bad('keep_days', `Enter 0 to ${DISCORD_KEEP_DAYS_MAX} days (0 keeps the role).`)
  return { ok: true, rule }
}

/** "#rrggbb" for a role colour, null for none. */
export function roleColor(color: number): string | null {
  return color > 0 ? `#${color.toString(16).padStart(6, '0').slice(-6)}` : null
}

/** The Ferrocast bot's routes on a dashboard client. */
export function discordProApi(c: FerroClient) {
  return {
    get: () => c.request<DiscordProView>('GET', '/api/v1/pro/discord'),
    connect: () => c.request<DiscordConnect>('POST', '/api/v1/pro/discord/connect', {}),
    setChannel: (channel_id: string) =>
      c.request<DiscordProView>('PUT', '/api/v1/pro/discord/channel', { channel_id }),
    setGoLive: (enabled: boolean, message: string | null) =>
      c.request<DiscordProView>('PUT', '/api/v1/pro/discord/go-live', { enabled, message }),
    addRule: (rule: DiscordRuleInput) =>
      c.request<DiscordProView>('PUT', '/api/v1/pro/discord/rules', rule),
    updateRule: (id: string, rule: DiscordRuleInput) =>
      c.request<DiscordProView>('PUT', `/api/v1/pro/discord/rules/${encodeURIComponent(id)}`, rule),
    deleteRule: (id: string) =>
      c.request<void>('DELETE', `/api/v1/pro/discord/rules/${encodeURIComponent(id)}`),
    disconnect: () => c.request<void>('DELETE', '/api/v1/pro/discord'),
  }
}
