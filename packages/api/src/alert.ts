// TypeScript port of `core::alert` (select, render, validate) for the editor's live preview.
// The engine stays the source of truth; this only answers "what would this look like?".

import { actorOf, majorUnits } from './format'
import { Template, KNOWN_VARS, eventVars, withPlurals } from './template'
import { checkCss, isColor } from './css-check'
import {
  ALERT_KINDS,
  type AlertAnim,
  type AlertRule,
  type BuiltinSound,
  type Condition,
  type CustomField,
  type CustomFieldValue,
  type FerroEvent,
  type PlayableSound,
  type RenderedAlert,
  type Variation,
} from './types'

export const MIN_DURATION_MS = 1000
export const MAX_DURATION_MS = 60_000
export const MAX_IN_MS = 3000
export const MAX_OUT_MS = 3000
export const MAX_TEXT_DELAY_MS = 10_000
export const MAX_CUSTOM_HTML = 20_000
export const MAX_CUSTOM_HTML_BYTES = 80_000
export const MAX_CUSTOM_FIELDS = 32
export const MAX_FIELD_KEY_LEN = 40
export const MAX_FIELD_LABEL_LEN = 80
export const MAX_FIELD_TEXT_LEN = 500
export const MAX_SELECT_OPTIONS = 20

/** Most looks one rule may hold (the engine's MAX_VARIATIONS). */
export const MAX_VARIATIONS = 20

export const ALLOWED_ASSET_HOSTS = [
  'https://static-cdn.jtvnw.net',
  'https://yt3.ggpht.com',
  'https://files.kick.com',
  'https://cdn.ferrocast.com',
  'https://cdn.discordapp.com',
  'https://fonts.gstatic.com',
] as const

export function defaultAlertAnim(): AlertAnim {
  return {
    in: 'fade',
    out: 'fade',
    text: 'none',
    in_ms: 400,
    out_ms: 350,
    text_delay_ms: 150,
  }
}

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

/** A repeatable random source in [0, 1) (mulberry32), so weighted picks can be tested. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One of `tied` by weight. A zero weight is never chosen while another has weight; when all
 * are zero they are equally likely (an alert is never dropped over a weight of 0).
 */
/** Largest weight the editor accepts (core::alert::MAX_WEIGHT). */
export const MAX_WEIGHT = 1000

export function pickWeighted(tied: Variation[], rand: () => number): Variation | null {
  if (tied.length === 0) return null
  if (tied.length === 1) return tied[0] ?? null
  const total = tied.reduce((n, v) => n + Math.max(0, Math.trunc(v.weight ?? 1)), 0)
  if (total === 0) return tied[Math.min(tied.length - 1, Math.floor(rand() * tied.length))] ?? null
  let roll = Math.floor(rand() * total)
  for (const v of tied) {
    const w = Math.max(0, Math.trunc(v.weight ?? 1))
    if (roll < w) return v
    roll -= w
  }
  return tied[tied.length - 1] ?? null
}

/** Among matching conditional looks the highest priority, ties by weight; else the default. */
export function pick(
  rule: AlertRule,
  e: FerroEvent,
  rand: () => number = Math.random,
): Variation | null {
  const matching = rule.variations.filter((v) => v.condition && matches(v.condition, e))
  const top = Math.max(...matching.map((v) => v.priority))
  const chosen = pickWeighted(
    matching.filter((v) => v.priority === top),
    rand,
  )
  return chosen ?? rule.variations.find((v) => v.condition === null) ?? null
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
  rand: () => number = Math.random,
): { rule: AlertRule; variation: Variation } | null {
  if (!mayAlert(e)) return null
  for (const r of rules) {
    if (!appliesTo(r, e)) continue
    const v = pick(r, e, rand)
    if (v) return { rule: r, variation: v }
  }
  return null
}

function resolveCustomFields(v: Variation): Record<string, CustomFieldValue> {
  const out: Record<string, CustomFieldValue> = Object.create(null)
  const fields = Array.isArray(v.fields) ? v.fields : []
  const overrides = v.field_values ?? {}
  for (const f of fields) {
    out[f.key] = Object.prototype.hasOwnProperty.call(overrides, f.key)
      ? (overrides[f.key] as CustomFieldValue)
      : f.default
  }
  return { ...out }
}

export type NormalizedVariation = Variation & {
  anim: AlertAnim
  custom_enabled: boolean
  html: string
  fields: CustomField[]
  field_values: Record<string, CustomFieldValue>
}

export function normalizeVariation(v: Variation): NormalizedVariation {
  const baseAnim = defaultAlertAnim()
  return {
    ...v,
    weight: v.weight ?? 1,
    css: v.css ?? '',
    anim: v.anim ? { ...baseAnim, ...v.anim } : baseAnim,
    custom_enabled: v.custom_enabled === true,
    html: typeof v.html === 'string' ? v.html : '',
    fields: Array.isArray(v.fields) ? v.fields : [],
    field_values: v.field_values && typeof v.field_values === 'object' ? v.field_values : {},
  }
}

export function render(
  alertId: string,
  rule: AlertRule,
  v: Variation,
  e: FerroEvent,
): RenderedAlert {
  const norm = normalizeVariation(v)
  const baseVars = eventVars(e)
  const resolvedFields = resolveCustomFields(norm)
  const templateVars: Record<string, string> = { ...baseVars }
  for (const [k, val] of Object.entries(resolvedFields)) {
    if (!Object.prototype.hasOwnProperty.call(templateVars, k)) templateVars[k] = String(val)
  }
  const fill = (src: string) => {
    try {
      return Template.parse(withPlurals(src)).render(templateVars)
    } catch {
      return src
    }
  }
  const body = fill(norm.body)
  return {
    alert_id: alertId,
    event_id: e.id,
    rule_id: rule.id,
    variation_id: norm.id,
    kind: e.kind.type,
    platform: e.platform,
    title: fill(norm.title),
    body,
    image: norm.image,
    sound: norm.sound,
    volume: Math.min(Math.max(norm.volume, 0), 100),
    duration_ms: Math.min(Math.max(norm.duration_ms, MIN_DURATION_MS), MAX_DURATION_MS),
    layout: norm.layout,
    css: norm.css,
    tts_text: norm.tts && body.trim() !== '' ? body : null,
    tts_audio: null,
    test: e.origin === 'test',
    anim: norm.anim,
    ...(norm.custom_enabled
      ? {
          custom: {
            html: norm.html ?? '',
            css: norm.css ?? '',
            fields: resolvedFields,
            vars: baseVars,
          },
        }
      : {}),
  }
}

const KNOWN_VAR_SET = new Set<string>(KNOWN_VARS)

export function isValidFieldKey(key: string): boolean {
  if (!key || key.length > MAX_FIELD_KEY_LEN) return false
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return false
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
  return !KNOWN_VAR_SET.has(key)
}

function validateFieldValue(varName: string, f: CustomField, val: unknown): string | null {
  const prefix = `Variation '${varName}': field '${f.key}'`
  switch (f.type) {
    case 'text':
      if (typeof val !== 'string') return `${prefix}: expected text.`
      if (Array.from(val).length > MAX_FIELD_TEXT_LEN)
        return `${prefix}: text can be up to ${MAX_FIELD_TEXT_LEN} characters.`
      return null
    case 'number':
      if (typeof val !== 'number' || !Number.isFinite(val))
        return `${prefix}: expected a finite number.`
      if (f.min !== undefined && val < f.min) return `${prefix}: value must be at least ${f.min}.`
      if (f.max !== undefined && val > f.max) return `${prefix}: value must be at most ${f.max}.`
      return null
    case 'color':
      if (!isColor(val)) return `${prefix}: use #rrggbb or transparent.`
      return null
    case 'toggle':
      if (typeof val !== 'boolean') return `${prefix}: expected true or false.`
      return null
    case 'select':
      if (typeof val !== 'string' || !f.options?.includes(val))
        return `${prefix}: value must be one of its options.`
      return null
    default:
      return `${prefix}: unknown field type '${String((f as { type?: unknown }).type)}'.`
  }
}

function validateCustomFields(
  varName: string,
  fields: CustomField[],
  values: Record<string, CustomFieldValue>,
): { keys?: Set<string>; err?: string } {
  if (fields.length > MAX_CUSTOM_FIELDS)
    return { err: `Variation '${varName}': can have at most ${MAX_CUSTOM_FIELDS} custom fields.` }
  const keys = new Set<string>()
  const byKey = new Map<string, CustomField>()
  for (const f of fields) {
    if (!f || typeof f !== 'object')
      return { err: `Variation '${varName}': field definition must be an object.` }
    if (typeof f.key !== 'string' || !isValidFieldKey(f.key)) {
      return {
        err: `Variation '${varName}': field key '${String(f.key)}' must start with lowercase a-z, use a-z/0-9/_ (up to ${MAX_FIELD_KEY_LEN} chars), and not collide with built-in tokens.`,
      }
    }
    if (keys.has(f.key))
      return { err: `Variation '${varName}': duplicate custom field key '${f.key}'.` }
    keys.add(f.key)
    const labelLen = typeof f.label === 'string' ? Array.from(f.label.trim()).length : 0
    if (labelLen === 0 || labelLen > MAX_FIELD_LABEL_LEN) {
      return {
        err: `Variation '${varName}': field '${f.key}' label must be 1 to ${MAX_FIELD_LABEL_LEN} characters.`,
      }
    }
    if (f.type === 'number') {
      if (f.min !== undefined && (typeof f.min !== 'number' || !Number.isFinite(f.min)))
        return { err: `Variation '${varName}': field '${f.key}' min must be finite.` }
      if (f.max !== undefined && (typeof f.max !== 'number' || !Number.isFinite(f.max)))
        return { err: `Variation '${varName}': field '${f.key}' max must be finite.` }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        return { err: `Variation '${varName}': field '${f.key}' min cannot exceed max.` }
    }
    if (f.type === 'select') {
      if (
        !Array.isArray(f.options) ||
        f.options.length === 0 ||
        f.options.length > MAX_SELECT_OPTIONS
      ) {
        return {
          err: `Variation '${varName}': field '${f.key}' select fields need 1 to ${MAX_SELECT_OPTIONS} options.`,
        }
      }
      const optSeen = new Set<string>()
      for (const opt of f.options) {
        const n = typeof opt === 'string' ? Array.from(opt.trim()).length : 0
        if (n === 0 || n > MAX_FIELD_LABEL_LEN || optSeen.has(opt)) {
          return {
            err: `Variation '${varName}': field '${f.key}' options must be unique and 1 to ${MAX_FIELD_LABEL_LEN} characters.`,
          }
        }
        optSeen.add(opt)
      }
    }
    const defErr = validateFieldValue(varName, f, f.default)
    if (defErr) return { err: defErr }
    byKey.set(f.key, f)
  }
  for (const [k, val] of Object.entries(values)) {
    const f = byKey.get(k)
    if (!f) return { err: `Variation '${varName}': unknown custom field value '${k}'.` }
    const valErr = validateFieldValue(varName, f, val)
    if (valErr) return { err: valErr }
  }
  return { keys }
}

const BANNED_TAGS = new Set([
  'script',
  'meta',
  'base',
  'form',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'applet',
  'noscript',
  'noembed',
  'noframes',
  'xmp',
  'plaintext',
  'textarea',
  'title',
  'template',
  'math',
  'foreignobject',
  'use',
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'input',
  'button',
  'select',
  'audio',
  'video',
  'source',
  'track',
])
const URL_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'poster',
  'data',
  'background',
  'srcset',
  'cite',
  'longdesc',
  'manifest',
  'icon',
])
const BANNED_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'http-equiv', 'ping'])

function tokenAttrOk(name: string): boolean {
  return (
    ['alt', 'title', 'aria-label', 'aria-description', 'aria-valuetext'].includes(name) ||
    name.startsWith('data-')
  )
}

/** `{token}` names in `text` (a `{{` is a literal brace). */
function tokensIn(text: string): string[] {
  const out: string[] = []
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '{') continue
    if (chars[i + 1] === '{') {
      i += 1
      continue
    }
    const end = chars.indexOf('}', i + 1)
    if (end === -1) break
    const raw = (
      chars
        .slice(i + 1, end)
        .join('')
        .split('|')[0] ?? ''
    ).trim()
    if (raw && /^[A-Za-z0-9_:]+$/.test(raw)) out.push(raw)
    i = end
  }
  return out
}

function urlAttrOk(value: string): boolean {
  const v = value.trim().toLowerCase()
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\]/.test(v)) return false
  // Entities (&#106;avascript:) only matter where a scheme could hide; a picture host's
  // signed links legitimately carry & in their query.
  if (v.includes('&') && !v.startsWith('https://')) return false
  if (v.startsWith('#')) return true
  if (/^data:image\/(png|jpeg|gif|webp|avif);/.test(v)) return true
  if (v.startsWith('https://')) {
    const host = v.slice(8).split(/[/?#]/)[0] ?? ''
    return ALLOWED_ASSET_HOSTS.some((h) => h === `https://${host}`)
  }
  return false
}

/**
 * Reads custom HTML the way a browser splits it into tags, text and <style> blocks, and
 * refuses what could run code, navigate, fetch or break out of a token's context (the engine's
 * `check_custom_html`; the overlay's sandbox page enforces the same on the parsed document).
 */
export function checkCustomHtml(
  varName: string,
  html: string,
  customKeys: Iterable<string> = [],
): string | null {
  const keys = new Set(customKeys)
  const fail = (reason: string) => `Variation '${varName}': custom HTML ${reason}.`
  const tokenErr = (tok: string) =>
    !KNOWN_VAR_SET.has(tok) && !keys.has(tok)
      ? `Variation '${varName}': unknown token '{${tok}}'.`
      : null
  // UTF-16 units, so indexes into `html` and into these arrays are the same numbers.
  const chars = html.split('')
  const lower = chars.map((c) => (c >= 'A' && c <= 'Z' ? c.toLowerCase() : c))
  const lowerStr = lower.join('')
  let text = ''
  const flush = (): string | null => {
    for (const tok of tokensIn(text)) {
      const e = tokenErr(tok)
      if (e) return e
    }
    text = ''
    return null
  }
  let i = 0
  while (i < chars.length) {
    if (chars[i] !== '<') {
      text += chars[i]
      i += 1
      continue
    }
    const here = lower.slice(i, i + 4).join('')
    if (here === '<!--') {
      const end = lowerStr.indexOf('-->', i + 4)
      if (end === -1) return fail('has a comment that never closes')
      i = end + 3
      continue
    }
    if (here.startsWith('<!') || here.startsWith('<?')) {
      const end = lowerStr.indexOf('>', i)
      if (end === -1) return fail('has markup that never closes')
      i = end + 1
      continue
    }
    const next = chars[i + 1] ?? ' '
    const isLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c)
    if (!(isLetter(next) || (next === '/' && isLetter(chars[i + 2])))) {
      text += '<'
      i += 1
      continue
    }
    const flushed = flush()
    if (flushed) return flushed
    const closing = next === '/'
    i += closing ? 2 : 1
    const start = i
    while (i < chars.length && !/[\s/>]/.test(chars[i]!)) i += 1
    const tag = lower.slice(start, i).join('')
    if (tag.includes('{')) return fail("can't put a {token} in a tag name")
    if (BANNED_TAGS.has(tag)) return fail(`can't use <${tag}>: custom alerts are HTML and CSS only`)
    const attrs: [string, string][] = []
    for (;;) {
      while (i < chars.length && /[\s/]/.test(chars[i]!)) i += 1
      if (i >= chars.length) return fail('has a tag that never closes')
      if (chars[i] === '>') {
        i += 1
        break
      }
      const astart = i
      while (i < chars.length && !/[\s=>/]/.test(chars[i]!)) i += 1
      const aname = lower.slice(astart, i).join('')
      if (!aname || aname.includes('{'))
        return fail("can't put a {token} where an attribute name goes")
      while (i < chars.length && /\s/.test(chars[i]!)) i += 1
      let value = ''
      if (chars[i] === '=') {
        i += 1
        while (i < chars.length && /\s/.test(chars[i]!)) i += 1
        const q = chars[i]
        if (q === '"' || q === "'") {
          i += 1
          const vstart = i
          while (i < chars.length && chars[i] !== q) i += 1
          if (i >= chars.length) return fail('has an attribute that never closes')
          value = chars.slice(vstart, i).join('')
          i += 1
        } else {
          const vstart = i
          while (i < chars.length && !/[\s>]/.test(chars[i]!)) i += 1
          value = chars.slice(vstart, i).join('')
        }
      }
      attrs.push([aname, value])
    }
    if (closing) continue
    for (const [aname, value] of attrs) {
      if (aname.startsWith('on') || BANNED_ATTRS.has(aname))
        return fail(`can't use the "${aname}" attribute`)
      if (URL_ATTRS.has(aname)) {
        if (tokensIn(value).length > 0) return fail(`can't put a {token} in "${aname}"`)
        if (!urlAttrOk(value))
          return fail(
            `"${aname}" can only be a #anchor, a data:image/ picture or an allowed picture host`,
          )
        continue
      }
      if (aname === 'style') {
        if (tokensIn(value).length > 0) return fail("can't put a {token} in a style attribute")
        const cssErr = checkCss(`variation '${varName}' style attribute`, `x{${value}}`)
        if (cssErr) return cssErr
        continue
      }
      for (const tok of tokensIn(value)) {
        if (!tokenAttrOk(aname))
          return fail(
            `can only put a {token} in text or in alt, title, aria-label and data-* (not "${aname}")`,
          )
        const e = tokenErr(tok)
        if (e) return e
      }
    }
    if (tag === 'style') {
      const close = lowerStr.indexOf('</style', i)
      const end = close === -1 ? chars.length : close
      const cssErr = checkCss(`variation '${varName}' <style>`, chars.slice(i, end).join(''))
      if (cssErr) return cssErr
      i = end
    }
  }
  return flush()
}

/** The editor's save check (core::AlertRule::validate). Returns the message or null. */
export function validateRule(r: AlertRule): string | null {
  if (r.kinds.length === 0) return 'The rule needs at least one event type.'
  const bad = r.kinds.find((k) => !(ALERT_KINDS as readonly string[]).includes(k))
  if (bad) return `'${bad}' isn't an event type that can show an alert.`
  if (r.variations.length > MAX_VARIATIONS) return `A rule can have up to ${MAX_VARIATIONS} looks.`
  if (!r.variations.some((v) => v.condition === null))
    return 'The rule needs a default look (a variation without a condition).'
  for (const rawV of r.variations) {
    const loose = rawV as unknown as Record<string, unknown>
    if (loose.custom_enabled !== undefined && typeof loose.custom_enabled !== 'boolean')
      return `Variation '${rawV.name}': custom_enabled must be true or false.`
    if (loose.html !== undefined && typeof loose.html !== 'string')
      return `Variation '${rawV.name}': html must be text.`
    if (loose.fields !== undefined && !Array.isArray(loose.fields))
      return `Variation '${rawV.name}': fields must be a list.`
    const fv = loose.field_values
    if (fv !== undefined && (typeof fv !== 'object' || fv === null || Array.isArray(fv)))
      return `Variation '${rawV.name}': field_values must be an object keyed by field.`
    const v = normalizeVariation(rawV)
    for (const [label, n] of [
      ['volume', v.volume],
      ['duration', v.duration_ms],
      ['entrance timing', v.anim?.in_ms],
      ['exit timing', v.anim?.out_ms],
      ['text delay', v.anim?.text_delay_ms],
    ] as const)
      if (!Number.isInteger(n)) return `Variation '${v.name}': ${label} must be a whole number.`
    if (v.volume < 0 || v.volume > 100) return `Variation '${v.name}': volume must be 0 to 100.`
    if (v.duration_ms < MIN_DURATION_MS || v.duration_ms > MAX_DURATION_MS)
      return `Variation '${v.name}': duration must be 1 to 60 seconds.`
    if (!Number.isInteger(v.weight) || v.weight < 0 || v.weight > MAX_WEIGHT)
      return `Variation '${v.name}': weight must be 0 to 1000.`
    const anim = v.anim!
    if (!Number.isFinite(anim.in_ms) || anim.in_ms < 0 || anim.in_ms > MAX_IN_MS)
      return `Variation '${v.name}': entrance timing must be 0 to ${MAX_IN_MS} ms.`
    if (!Number.isFinite(anim.out_ms) || anim.out_ms < 0 || anim.out_ms > MAX_OUT_MS)
      return `Variation '${v.name}': exit timing must be 0 to ${MAX_OUT_MS} ms.`
    if (
      !Number.isFinite(anim.text_delay_ms) ||
      anim.text_delay_ms < 0 ||
      anim.text_delay_ms > MAX_TEXT_DELAY_MS
    )
      return `Variation '${v.name}': text delay must be 0 to ${MAX_TEXT_DELAY_MS} ms.`
    if (anim.in_ms + anim.out_ms >= v.duration_ms)
      return `Variation '${v.name}': entrance plus exit must be shorter than total alert duration.`
    if (anim.text_delay_ms >= v.duration_ms)
      return `Variation '${v.name}': text effect delay must start before the alert ends.`
    const html = v.html ?? ''
    if (
      new TextEncoder().encode(html).length > MAX_CUSTOM_HTML_BYTES ||
      Array.from(html).length > MAX_CUSTOM_HTML
    )
      return `Variation '${v.name}': custom HTML can be up to ${MAX_CUSTOM_HTML} characters.`
    if (typeof (v.css ?? '') !== 'string') return `Variation '${v.name}': css must be text.`
    const cssErr = checkCss(`variation '${v.name}'.css`, v.css ?? '')
    if (cssErr) return cssErr
    const { keys: customKeys, err: schemaErr } = validateCustomFields(
      v.name,
      v.fields ?? [],
      v.field_values ?? {},
    )
    if (schemaErr || !customKeys) return schemaErr ?? 'Invalid custom fields.'
    for (const src of [v.title, v.body]) {
      try {
        const parsed = Template.parse(src)
        for (const tok of parsed.variables()) {
          if (!KNOWN_VAR_SET.has(tok) && !customKeys.has(tok)) {
            return `Variation '${v.name}': unknown token '{${tok}}'.`
          }
        }
      } catch (e) {
        return `Variation '${v.name}': ${e instanceof Error ? e.message : String(e)}`
      }
    }
    const htmlErr = checkCustomHtml(v.name, html, customKeys)
    if (htmlErr) return htmlErr
  }
  return null
}

export function newVariation(id: string, title: string): Variation {
  return {
    id,
    name: 'Default',
    condition: null,
    priority: 0,
    weight: 1,
    title,
    body: '{message}',
    image: null,
    sound: null,
    volume: 70,
    duration_ms: 7000,
    tts: false,
    layout: 'stack',
    css: '',
    anim: defaultAlertAnim(),
    custom_enabled: false,
    html: '',
    fields: [],
    field_values: {},
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
    interrupt: false,
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
