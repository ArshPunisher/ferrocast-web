// TypeScript port of `core::alert` (select, render, validate) for the editor's live preview.
// The engine stays the source of truth; this only answers "what would this look like?".

import { actorOf, majorUnits } from './format'
import { Template, eventVars, withPlurals } from './template'
import {
  ALERT_KINDS,
  type AlertRule,
  type BuiltinSound,
  type Condition,
  type FerroEvent,
  type PlayableSound,
  type RenderedAlert,
  type Variation,
} from './types'

export const MIN_DURATION_MS = 1000
export const MAX_DURATION_MS = 60_000

function tierRank(e: FerroEvent): number | null {
  const k = e.kind
  if (k.type !== 'subscription' && k.type !== 'gift_batch') return null
  switch (k.tier.type) {
    case 'tier2':
      return 2
    case 'tier3':
      return 3
    default:
      return 1
  }
}

export function amountOf(e: FerroEvent, currency: string | null): number | null {
  const k = e.kind
  const moneyOk = (c: string) => currency === null || currency.toUpperCase() === c.toUpperCase()
  switch (k.type) {
    case 'tip':
    case 'paid_message':
      return moneyOk(k.money.currency) ? majorUnits(k.money) : null
    case 'platform_gift':
      return currency === null ? k.value.amount : null
    case 'gift_batch':
      return currency === null ? k.count : null
    case 'raid':
      return currency === null ? k.viewers : null
    case 'subscription':
      return currency === null ? k.months : null
    case 'reward_redemption':
      return currency === null ? k.cost : null
    default:
      return null
  }
}

function messageOf(e: FerroEvent): string | null {
  const k = e.kind
  switch (k.type) {
    case 'subscription':
    case 'platform_gift':
      return k.message?.text ?? null
    case 'paid_message':
      return k.content?.text ?? null
    case 'tip':
      return k.message
    case 'reward_redemption':
      return k.input
    default:
      return null
  }
}

export function matches(c: Condition, e: FerroEvent): boolean {
  switch (c.type) {
    case 'amount_at_least': {
      const a = amountOf(e, c.currency)
      return a !== null && a >= c.value
    }
    case 'amount_below': {
      const a = amountOf(e, c.currency)
      return a !== null && a < c.value
    }
    case 'tier_at_least': {
      const r = tierRank(e)
      return r !== null && r >= c.tier
    }
    case 'months_at_least':
      return e.kind.type === 'subscription' && e.kind.months >= c.months
    case 'platform_is':
      return e.platform === c.platform
    case 'is_gifted':
      return (
        (e.kind.type === 'subscription' && e.kind.gifted_by !== null) ||
        e.kind.type === 'gift_batch'
      )
    case 'has_message': {
      const m = messageOf(e)
      return m !== null && m.trim() !== ''
    }
    case 'message_contains': {
      const needle = c.text.toLowerCase()
      const m = messageOf(e)
      return needle !== '' && m !== null && m.toLowerCase().includes(needle)
    }
    case 'all':
      return c.of.every((x) => matches(x, e))
    case 'any':
      return c.of.some((x) => matches(x, e))
  }
}

export function mayAlert(e: FerroEvent): boolean {
  if (!['live', 'replay', 'test'].includes(e.origin)) return false
  const k = e.kind
  if (k.type === 'tip') return k.status === 'captured'
  return (ALERT_KINDS as readonly string[]).includes(k.type)
}

export function pick(rule: AlertRule, e: FerroEvent): Variation | null {
  let best: Variation | null = null
  for (const v of rule.variations) {
    if (v.condition && matches(v.condition, e)) {
      // max_by_key keeps the LAST of equal maxima, like Rust's Iterator::max_by_key.
      if (best === null || v.priority >= best.priority) best = v
    }
  }
  return best ?? rule.variations.find((v) => v.condition === null) ?? null
}

export function appliesTo(rule: AlertRule, e: FerroEvent): boolean {
  return (
    rule.enabled &&
    rule.kinds.includes(e.kind.type) &&
    (rule.platforms.length === 0 || rule.platforms.includes(e.platform))
  )
}

export function select(
  rules: AlertRule[],
  e: FerroEvent,
): { rule: AlertRule; variation: Variation } | null {
  if (!mayAlert(e)) return null
  for (const r of rules) {
    if (!appliesTo(r, e)) continue
    const v = pick(r, e)
    if (v) return { rule: r, variation: v }
  }
  return null
}

export function render(
  alertId: string,
  rule: AlertRule,
  v: Variation,
  e: FerroEvent,
): RenderedAlert {
  const vars = eventVars(e)
  const fill = (src: string) => {
    try {
      return Template.parse(withPlurals(src)).render(vars)
    } catch {
      return src
    }
  }
  const body = fill(v.body)
  return {
    alert_id: alertId,
    event_id: e.id,
    rule_id: rule.id,
    variation_id: v.id,
    kind: e.kind.type,
    platform: e.platform,
    title: fill(v.title),
    body,
    image: v.image,
    sound: v.sound,
    volume: Math.min(Math.max(v.volume, 0), 100),
    duration_ms: Math.min(Math.max(v.duration_ms, MIN_DURATION_MS), MAX_DURATION_MS),
    layout: v.layout,
    css: v.css,
    tts_text: v.tts && body.trim() !== '' ? body : null,
    tts_audio: null,
    test: e.origin === 'test',
  }
}

/** The editor's save check (core::AlertRule::validate). Returns the message or null. */
export function validateRule(r: AlertRule): string | null {
  if (r.kinds.length === 0) return 'The rule needs at least one event type.'
  const bad = r.kinds.find((k) => !(ALERT_KINDS as readonly string[]).includes(k))
  if (bad) return `'${bad}' isn't an event type that can show an alert.`
  if (!r.variations.some((v) => v.condition === null))
    return 'The rule needs a default look (a variation without a condition).'
  for (const v of r.variations) {
    for (const src of [v.title, v.body]) {
      try {
        Template.parse(src)
      } catch (e) {
        return `Variation '${v.name}': ${e instanceof Error ? e.message : String(e)}`
      }
    }
    if (v.volume < 0 || v.volume > 100) return `Variation '${v.name}': volume must be 0 to 100.`
    if (v.duration_ms < MIN_DURATION_MS || v.duration_ms > MAX_DURATION_MS)
      return `Variation '${v.name}': duration must be 1 to 60 seconds.`
  }
  return null
}

export function newVariation(id: string, title: string): Variation {
  return {
    id,
    name: 'Default',
    condition: null,
    priority: 0,
    title,
    body: '{message}',
    image: null,
    sound: null,
    volume: 70,
    duration_ms: 7000,
    tts: false,
    layout: 'stack',
    css: '',
  }
}

/**
 * A rule's sound can be a built-in sound instead of a library file: `builtin:<id>`
 * (core::alert::BUILTIN_SOUND_PREFIX). The overlay plays the built-in file.
 */
export const BUILTIN_SOUND_PREFIX = 'builtin:'
/** The built-in sound a rule's `sound` names, or null for a library file or none. */
export function ruleBuiltinSound(sound: string | null | undefined): BuiltinSound | null {
  if (!sound?.startsWith(BUILTIN_SOUND_PREFIX)) return null
  const id = sound.slice(BUILTIN_SOUND_PREFIX.length)
  return /^[a-z_]{1,32}$/.test(id) ? (id as BuiltinSound) : null
}
/**
 * What each alert kind starts with on a new install (the sound board's pre-matched sounds,
 * core::alert::default_sound). Saved rules never change.
 */
export const DEFAULT_KIND_SOUND: Record<string, PlayableSound> = {
  follow: 'glint',
  subscription: 'cascade',
  gift_batch: 'bloom',
  platform_gift: 'tally',
  paid_message: 'tally',
  tip: 'tally',
  raid: 'lift',
  reward_redemption: 'pebble',
}

/** core::alert::default_rules */
export function defaultRules(): AlertRule[] {
  const rule = (id: string, name: string, kind: string, title: string): AlertRule => ({
    id,
    name,
    enabled: true,
    kinds: [kind],
    platforms: [],
    variations: [
      {
        ...newVariation(`${id}-default`, title),
        sound: DEFAULT_KIND_SOUND[kind]
          ? `${BUILTIN_SOUND_PREFIX}${DEFAULT_KIND_SOUND[kind]}`
          : null,
      },
    ],
  })
  return [
    rule('follow', 'Follows', 'follow', '{name} followed!'),
    rule('sub', 'Subscriptions', 'subscription', '{name} subscribed for {months_text}!'),
    rule('gift', 'Gifted subs', 'gift_batch', '{name} gifted {count_text}!'),
    rule('bits', 'Bits and KICKs', 'platform_gift', '{name} sent {value}!'),
    rule('superchat', 'Super Chats', 'paid_message', '{name} sent {amount}!'),
    rule('tip', 'Tips', 'tip', '{name} tipped {amount}!'),
    rule('raid', 'Raids', 'raid', '{name} is raiding with {viewers_text}!'),
    rule('redeem', 'Channel points', 'reward_redemption', '{name} redeemed {reward}'),
  ]
}

export { actorOf }
