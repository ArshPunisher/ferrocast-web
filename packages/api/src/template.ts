// TypeScript port of `core::template` so the alert editor previews text exactly as the
// engine renders it. Same grammar: `{var}`, `{var|upper|truncate:20|default:"x"}`, `{{` `}}`.

import { formatMoney, formatValue, PLATFORM_LABEL, tierLabel, unitLabel } from './format'
import { actorOf } from './format'
import type { FerroEvent } from './types'

export type Vars = Record<string, string>

type Filter =
  | { f: 'upper' }
  | { f: 'lower' }
  | { f: 'title' }
  | { f: 'truncate'; n: number }
  | { f: 'default'; text: string }
type Piece = { text: string } | { name: string; filters: Filter[] }

export const MAX_TEMPLATE_CHARS = 2000
export const MAX_OUTPUT_CHARS = 4000

export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateError'
  }
}

const chars = (s: string) => Array.from(s)

export class Template {
  private constructor(private readonly pieces: Piece[]) {}

  static parse(src: string): Template {
    const cs = chars(src)
    if (cs.length > MAX_TEMPLATE_CHARS)
      throw new TemplateError(`the template is longer than ${MAX_TEMPLATE_CHARS} characters`)
    const pieces: Piece[] = []
    let text = ''
    let i = 0
    while (i < cs.length) {
      const c = cs[i]
      if (c === '{' && cs[i + 1] === '{') {
        text += '{'
        i += 2
      } else if (c === '}' && cs[i + 1] === '}') {
        text += '}'
        i += 2
      } else if (c === '{') {
        const rest = cs.slice(i + 1)
        const close = rest.indexOf('}')
        if (close < 0) throw new TemplateError(`a '{' at character ${i} is never closed`)
        const inner = rest.slice(0, close).join('')
        if (text) {
          pieces.push({ text })
          text = ''
        }
        pieces.push(parseVar(inner))
        i += close + 2
      } else {
        text += c
        i += 1
      }
    }
    if (text) pieces.push({ text })
    return new Template(pieces)
  }

  variables(): string[] {
    return this.pieces.flatMap((p) => ('name' in p ? [p.name] : []))
  }

  render(vars: Vars): string {
    let out = ''
    for (const p of this.pieces) {
      if ('text' in p) out += p.text
      else {
        let value = Object.prototype.hasOwnProperty.call(vars, p.name) ? (vars[p.name] ?? '') : ''
        for (const f of p.filters) value = apply(f, value)
        out += value
      }
      if (chars(out).length > MAX_OUTPUT_CHARS)
        return chars(out).slice(0, MAX_OUTPUT_CHARS).join('')
    }
    return out
  }
}

function parseVar(inner: string): Piece {
  const parts = inner.split('|')
  const name = (parts[0] ?? '').trim()
  if (!name || !/^[A-Za-z0-9_.]+$/.test(name))
    throw new TemplateError(`'{${inner}}' isn't a valid variable name`)
  const filters: Filter[] = []
  for (const rawPart of parts.slice(1)) {
    const raw = rawPart.trim()
    const idx = raw.indexOf(':')
    const fname = (idx >= 0 ? raw.slice(0, idx) : raw).trim()
    const arg = idx >= 0 ? raw.slice(idx + 1) : null
    const bad = () =>
      new TemplateError(
        `'${raw}' isn't a known filter (use upper, lower, title, truncate:N or default:text)`,
      )
    if (arg === null && fname === 'upper') filters.push({ f: 'upper' })
    else if (arg === null && fname === 'lower') filters.push({ f: 'lower' })
    else if (arg === null && fname === 'title') filters.push({ f: 'title' })
    else if (arg !== null && fname === 'truncate') {
      const t = arg.trim()
      if (!/^\d+$/.test(t)) throw bad()
      filters.push({ f: 'truncate', n: Number(t) })
    } else if (arg !== null && fname === 'default')
      filters.push({ f: 'default', text: arg.trim().replace(/^"+|"+$/g, '') })
    else throw bad()
  }
  return { name, filters }
}

function apply(f: Filter, value: string): string {
  switch (f.f) {
    case 'upper':
      return value.toUpperCase()
    case 'lower':
      return value.toLowerCase()
    case 'title': {
      let out = ''
      let start = true
      for (const c of value) {
        out += start ? c.toUpperCase() : c
        start = /\s/.test(c)
      }
      return out
    }
    case 'truncate': {
      const cs = chars(value)
      if (cs.length > f.n) return cs.slice(0, Math.max(f.n - 1, 0)).join('') + '…'
      return value
    }
    case 'default':
      return value.trim() === '' ? f.text : value
  }
}

/** "1 month", "12 months" (core::template::plural: the plain number, no grouping). */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Templates written as "{months} months" (the old default, and what most people type) read
 * "1 months" for a first sub. Like the engine (core::template::with_plurals), each pair is
 * rewritten to its `_text` variable before rendering, so saved templates read right.
 */
const COUNTED_WORDS: readonly [string, string][] = [
  ['{months} months', '{months_text}'],
  ['{count} subs', '{count_text}'],
  ['{viewers} viewers', '{viewers_text}'],
]

export function withPlurals(src: string): string {
  let out = src
  for (const [from, to] of COUNTED_WORDS) out = out.split(from).join(to)
  return out
}

/** Every variable an event can set, for the editor's autocomplete (core::KNOWN_VARS). */
export const KNOWN_VARS = [
  'name',
  'user',
  'platform',
  'amount',
  'currency',
  'message',
  'months',
  'months_text',
  'tier',
  'gifter',
  'count',
  'count_text',
  'value',
  'unit',
  'viewers',
  'viewers_text',
  'reward',
  'cost',
] as const

/** The standard variables for an event (core::template::event_vars). */
export function eventVars(e: FerroEvent): Vars {
  const v: Vars = { platform: PLATFORM_LABEL[e.platform] }
  const actor = actorOf(e)
  if (actor) {
    v.name = actor.display_name
    v.user = actor.login ?? actor.display_name
  }
  const k = e.kind
  switch (k.type) {
    case 'subscription':
      v.months = String(k.months)
      v.months_text = counted(k.months, 'month', 'months')
      v.tier = tierLabel(k.tier)
      if (k.message) v.message = k.message.text
      if (k.gifted_by) v.gifter = k.gifted_by.display_name
      break
    case 'gift_batch':
      v.count = String(k.count)
      v.count_text = counted(k.count, 'sub', 'subs')
      v.amount = String(k.count)
      v.tier = tierLabel(k.tier)
      break
    case 'platform_gift':
      v.amount = String(k.value.amount)
      v.value = formatValue(k.value)
      v.unit = unitLabel(k.value.unit, k.value.amount)
      if (k.message) v.message = k.message.text
      break
    case 'paid_message':
      v.amount = formatMoney(k.money)
      v.currency = k.money.currency
      if (k.content) v.message = k.content.text
      break
    case 'tip':
      v.amount = formatMoney(k.money)
      v.currency = k.money.currency
      if (k.message !== null) v.message = k.message
      break
    case 'raid':
      v.viewers = String(k.viewers)
      v.viewers_text = counted(k.viewers, 'viewer', 'viewers')
      v.amount = String(k.viewers)
      break
    case 'reward_redemption':
      v.reward = k.reward
      v.cost = String(k.cost)
      if (k.input !== null) v.message = k.input
      break
    case 'chat_message':
      v.message = k.content.text
      break
    default:
      break
  }
  return v
}

/** Parses without throwing: the editor shows the message under the field. */
export function checkTemplate(
  src: string,
): { ok: true; vars: string[] } | { ok: false; error: string } {
  try {
    const t = Template.parse(src)
    return { ok: true, vars: t.variables() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
