// Display helpers that must match the engine (core::money, core::event labels) so a preview
// in the dashboard reads exactly like the alert the overlay will show.

import type { Actor, FerroEvent, Money, Platform, PlatformValue, Tier, ValueUnit } from './types'

const ZERO = new Set([
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
])
const THREE = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD'])
const SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  BRL: 'R$',
  AUD: 'A$',
  CAD: 'C$',
  KRW: '₩',
  TRY: '₺',
  PHP: '₱',
}

/** Minor-unit digits (ISO 4217), as `core::money::exponent`. */
export function exponent(currency: string): number {
  if (ZERO.has(currency)) return 0
  if (THREE.has(currency)) return 3
  return 2
}

function group(n: bigint): string {
  const s = n.toString()
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return out
}

/** `₹500`, `$4.99`, `10.50 SEK`: identical to `Money::display` in Rust. */
export function formatMoney(m: Money): string {
  const cur = m.currency.toUpperCase()
  const digits = exponent(cur)
  const minor = Number.isSafeInteger(m.minor) ? BigInt(m.minor) : BigInt(Math.trunc(m.minor || 0))
  const neg = minor < 0n
  const abs = neg ? -minor : minor
  const scale = 10n ** BigInt(digits)
  const whole = abs / scale
  const frac = abs % scale
  const number =
    digits === 0 || frac === 0n
      ? group(whole)
      : `${group(whole)}.${frac.toString().padStart(digits, '0')}`
  const sign = neg ? '-' : ''
  const sym = SYMBOLS[cur]
  return sym ? `${sign}${sym}${number}` : `${sign}${number} ${cur}`
}

/** Amount in major units, for display and conditions only. */
export function majorUnits(m: Money): number {
  return m.minor / 10 ** exponent(m.currency.toUpperCase())
}

export function unitLabel(unit: ValueUnit, amount: number): string {
  const one = amount === 1
  if (typeof unit === 'object') return unit.other
  switch (unit) {
    case 'bits':
      return one ? 'bit' : 'bits'
    case 'kicks':
      return one ? 'KICK' : 'KICKs'
    case 'jewels':
      return one ? 'jewel' : 'jewels'
  }
}

export function formatValue(v: PlatformValue): string {
  return `${group(BigInt(Math.max(0, Math.trunc(v.amount))))} ${unitLabel(v.unit, v.amount)}`
}

export function formatCount(n: number): string {
  return group(BigInt(Math.max(0, Math.trunc(n))))
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tips: 'Tips',
  ferrocast: 'Ferrocast',
}

export function tierLabel(t: Tier): string {
  switch (t.type) {
    case 'prime':
      return 'Prime'
    case 'tier1':
      return 'Tier 1'
    case 'tier2':
      return 'Tier 2'
    case 'tier3':
      return 'Tier 3'
    case 'level':
      return t.name
  }
}

/** The person an event is about (core::EventKind::actor). */
export function actorOf(e: FerroEvent): Actor | null {
  const k = e.kind
  switch (k.type) {
    case 'chat_message':
    case 'follow':
    case 'subscription':
    case 'platform_gift':
    case 'paid_message':
    case 'tip':
    case 'reward_redemption':
      return k.actor
    case 'gift_batch':
      return k.gifter
    case 'raid':
      return k.from
    case 'user_messages_cleared':
    case 'ban':
    case 'unban':
      return k.target
    default:
      return null
  }
}

/** Kinds an alert box can show (core::EventKind::is_alertable). */
export function isAlertable(e: FerroEvent): boolean {
  const k = e.kind
  switch (k.type) {
    case 'follow':
    case 'raid':
    case 'subscription':
    case 'gift_batch':
    case 'platform_gift':
    case 'paid_message':
    case 'reward_redemption':
      return true
    case 'tip':
      return k.status === 'captured'
    default:
      return false
  }
}

/** One line for feeds: "followed", "subscribed for 6 months", "tipped ₹500". */
export function describeEvent(e: FerroEvent): { title: string; detail: string | null } {
  const k = e.kind
  switch (k.type) {
    case 'follow':
      return { title: 'followed', detail: null }
    case 'subscription':
      if (k.gifted_by)
        return {
          title: `got a gifted sub from ${k.gifted_by.display_name}`,
          detail: tierLabel(k.tier),
        }
      return {
        title: k.months > 1 ? `subscribed for ${k.months} months` : 'subscribed',
        detail: k.message?.text ?? tierLabel(k.tier),
      }
    case 'gift_batch':
      return {
        title: `gifted ${k.count} ${k.count === 1 ? 'sub' : 'subs'}`,
        detail: tierLabel(k.tier),
      }
    case 'platform_gift':
      return { title: `sent ${formatValue(k.value)}`, detail: k.message?.text ?? null }
    case 'paid_message':
      return { title: `sent ${formatMoney(k.money)}`, detail: k.content?.text ?? null }
    case 'tip':
      return {
        title: k.status === 'captured' ? `tipped ${formatMoney(k.money)}` : `tip ${k.status}`,
        detail: k.message,
      }
    case 'raid':
      return { title: `raided with ${formatCount(k.viewers)} viewers`, detail: null }
    case 'reward_redemption':
      return { title: `redeemed ${k.reward}`, detail: k.input }
    case 'chat_message':
      return { title: 'said', detail: k.content.text }
    case 'ban':
      return { title: 'was banned', detail: k.reason }
    case 'unban':
      return { title: 'was unbanned', detail: null }
    case 'stream_online':
      return { title: 'Stream went live', detail: k.title }
    case 'stream_offline':
      return { title: 'Stream ended', detail: null }
    case 'viewer_count':
      return { title: `${formatCount(k.count)} watching`, detail: null }
    case 'connector':
      return { title: `Connection ${k.state.replace(/_/g, ' ')}`, detail: null }
    case 'message_deleted':
      return { title: 'Message deleted', detail: null }
    case 'user_messages_cleared':
      return { title: 'messages cleared', detail: null }
    case 'mode_changed':
      return { title: `${k.mode.replace(/_/g, ' ')} ${k.enabled ? 'on' : 'off'}`, detail: null }
    case 'ad_break':
      return { title: `Ad break, ${k.seconds}s`, detail: null }
    case 'reversal':
      return { title: `Payment ${k.reason}`, detail: null }
    case 'unknown':
      return { title: `Unknown event (${k.name})`, detail: null }
    default:
      // A newer engine may send kinds this dashboard doesn't know yet.
      return {
        title: `New kind of event (${String((k as { type?: unknown }).type ?? 'unknown')})`,
        detail: null,
      }
  }
}

/** "now", "12s", "4m", "2h", "3d" */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 5) return 'now'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** Strips characters that can wreck a layout (zalgo stacks, bidi overrides) for labels. */
export function tameText(s: string, maxCombining = 2): string {
  let out = ''
  let combining = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    // Bidi embedding/override/isolate controls: drop them so a name can't flip the line.
    if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) continue
    const isMark = /\p{M}/u.test(ch)
    if (isMark) {
      combining++
      if (combining > maxCombining) continue
    } else combining = 0
    out += ch
  }
  return out
}
