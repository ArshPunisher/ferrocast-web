// Auto-replies (API.md §4 "Auto-replies"): the bot answers chat that mentions something,
// like "discord" → the invite. Free and local. The types, the dashboard's calls, and a
// TypeScript port of `core::autoreply`'s matching for the demo engine and quick checks.
// The real engine is the judge: the dashboard's "Try it" asks it (`POST /autoreplies/try`).

import type { FerroClient } from './client'
import { ApiError, describeError } from './errors'
import { PLATFORM_LABEL } from './format'
import { Template, TemplateError, type Vars } from './template'
import type { Actor, ChatPlatform } from './types'

export type AutoReplyMatchKind = 'contains' | 'word' | 'starts_with' | 'regex'
export type AutoReplyRole = 'everyone' | 'subs' | 'vips' | 'mods'

export interface AutoReplyMatch {
  kind: AutoReplyMatchKind
  text: string
  case_sensitive: boolean
}

export interface AutoReply {
  id: string
  name: string
  enabled: boolean
  match: AutoReplyMatch
  /** Template: the same variables as command replies. */
  reply: string
  /** Empty = every platform. */
  platforms: ChatPlatform[]
  /** Per rule, per platform chat (at least 5 s). */
  cooldown_s: number
  /** Per viewer. */
  user_cooldown_s: number
  min_role: AutoReplyRole
  only_when_live: boolean
}

/** `POST /api/v1/autoreplies/try`. */
export interface AutoReplyTry {
  matched: boolean
  rule_id: string | null
  rule_name: string | null
  /** Null when nothing matched, or a draft has no reply yet. */
  reply: string | null
}

export const AUTOREPLY_LIMITS = {
  rules: 100,
  replyChars: 500,
  matchChars: 200,
  nameChars: 60,
  cooldownMax: 86_400,
  minGlobalCooldown: 5,
} as const

/** Variables a reply can use (the Insert menu). */
export const AUTOREPLY_VARS: readonly { name: string; hint: string }[] = [
  { name: 'user', hint: 'who wrote it' },
  { name: 'channel', hint: 'your channel' },
  { name: 'platform', hint: 'Twitch, YouTube or Kick' },
  { name: 'game', hint: 'category set in Ferrocast' },
  { name: 'title', hint: 'stream title' },
  { name: 'uptime', hint: '1h 5m' },
  { name: 'uptime_text', hint: 'We’ve been live for…' },
]

export const MATCH_KIND_LABEL: Record<AutoReplyMatchKind, string> = {
  contains: 'Contains',
  word: 'Word',
  starts_with: 'Starts with',
  regex: 'Pattern',
}

export const BLANK_AUTOREPLY: Omit<AutoReply, 'id'> = {
  name: '',
  enabled: true,
  match: { kind: 'word', text: '', case_sensitive: false },
  reply: '',
  platforms: [],
  cooldown_s: 30,
  user_cooldown_s: 120,
  min_role: 'everyone',
  only_when_live: true,
}

/** The examples an empty list offers (core::autoreply::starters). */
export function autoReplyStarters(): Omit<AutoReply, 'id'>[] {
  const s = (
    name: string,
    kind: AutoReplyMatchKind,
    text: string,
    reply: string,
  ): Omit<AutoReply, 'id'> => ({
    ...BLANK_AUTOREPLY,
    name,
    match: { kind, text, case_sensitive: false },
    reply,
  })
  return [
    s('Discord link', 'word', 'discord', 'Join the Discord: discord.gg/yourcode'),
    s('What game', 'contains', 'what game', '@{user} we’re playing {game} right now.'),
    s('Greeting', 'starts_with', 'hello', 'Welcome in, {user}!'),
  ]
}

/** Auto-replies' routes on a dashboard client. */
export function autoRepliesApi(c: FerroClient) {
  const enc = encodeURIComponent
  return {
    list: () => c.request<AutoReply[]>('GET', '/api/v1/autoreplies'),
    create: (r: Omit<AutoReply, 'id'>) => c.request<AutoReply>('POST', '/api/v1/autoreplies', r),
    save: (r: AutoReply) => c.request<AutoReply>('PUT', `/api/v1/autoreplies/${enc(r.id)}`, r),
    remove: (id: string) => c.request<void>('DELETE', `/api/v1/autoreplies/${enc(id)}`),
    reorder: (ids: string[]) => c.request<AutoReply[]>('PUT', '/api/v1/autoreplies/order', { ids }),
    /** With `rule`, only that (unsaved) rule is tried. */
    try: (text: string, rule?: Omit<AutoReply, 'id'> | AutoReply, platform?: ChatPlatform) =>
      c.request<AutoReplyTry>('POST', '/api/v1/autoreplies/try', { text, rule, platform }),
    starters: () => c.request<Omit<AutoReply, 'id'>[]>('GET', '/api/v1/autoreplies/starters'),
  }
}

/**
 * Which field an error is about (`match.text`, `reply`, `name`, …) and the message for it.
 * Covers the 400s, the 413 for a long reply and the 422 for a pattern.
 */
export function autoReplyError(err: unknown): { field: string | null; message: string } {
  const d = describeError(err)
  if (err instanceof ApiError && [400, 413, 422].includes(err.status)) {
    const m = /^([a-z_]+(?:\.[a-z_]+)?): (.*)$/s.exec(d.message)
    if (m?.[1] && m[2]) {
      const text = m[2].charAt(0).toUpperCase() + m[2].slice(1)
      return { field: m[1], message: d.hint && err.status === 422 ? `${text} ${d.hint}` : text }
    }
  }
  return { field: null, message: d.hint ? `${d.message} ${d.hint}` : d.message }
}

// ---------------------------------------------------------------- matching (core port)

const MAX_INPUT_CHARS = 2000
const WORD = /^[\p{Alphabetic}\p{N}_]$/u
const SPACE = /^[\s\p{Cc}]$/u

/** NFKC, whitespace runs collapsed, lowercase unless case sensitive (core::autoreply::fold). */
export function foldText(text: string, caseSensitive: boolean): string {
  const nf = Array.from(text).slice(0, MAX_INPUT_CHARS).join('').normalize('NFKC')
  let out = ''
  let space = false
  for (const c of nf) {
    if (SPACE.test(c)) {
      space = out.length > 0
      continue
    }
    if (space) {
      out += ' '
      space = false
    }
    out += caseSensitive ? c : c.toLowerCase()
  }
  return out
}

function hasWord(hay: string, needle: string): boolean {
  if (!needle) return false
  const cs = Array.from(needle)
  const firstWord = WORD.test(cs[0] ?? '')
  const lastWord = WORD.test(cs[cs.length - 1] ?? '')
  let from = 0
  for (;;) {
    const start = hay.indexOf(needle, from)
    if (start < 0) return false
    const end = start + needle.length
    const before = Array.from(hay.slice(0, start)).pop()
    const after = Array.from(hay.slice(end))[0]
    const beforeOk = !firstWord || before === undefined || !WORD.test(before)
    const afterOk = !lastWord || after === undefined || !WORD.test(after)
    if (beforeOk && afterOk) return true
    from = start + ((hay.codePointAt(start) ?? 0) > 0xffff ? 2 : 1)
  }
}

/** What's wrong with a rule, field first ("reply: …"), or null. The engine checks again. */
export function autoReplyProblem(r: Omit<AutoReply, 'id'>): string | null {
  const len = (s: string) => Array.from(s).length
  if (!r.name.trim() || len(r.name.trim()) > AUTOREPLY_LIMITS.nameChars)
    return `name: write 1 to ${AUTOREPLY_LIMITS.nameChars} characters.`
  if (!r.match.text.trim() || len(r.match.text) > AUTOREPLY_LIMITS.matchChars)
    return `match.text: write what to look for, 1 to ${AUTOREPLY_LIMITS.matchChars} characters.`
  if (!r.reply.trim()) return 'reply: write what the bot says.'
  if (len(r.reply) > AUTOREPLY_LIMITS.replyChars)
    return `reply: ${len(r.reply)} characters is too long; replies can be up to ${AUTOREPLY_LIMITS.replyChars}.`
  try {
    Template.parse(r.reply)
  } catch (e) {
    if (e instanceof TemplateError) return `reply: ${e.message}`
    throw e
  }
  if (r.match.kind === 'regex') {
    let re: RegExp
    try {
      re = new RegExp(r.match.text, r.match.case_sensitive ? 'u' : 'iu')
    } catch (e) {
      return `match.text: the pattern has a problem: ${(e as Error).message}.`
    }
    if (re.test('')) return 'match.text: this pattern matches every message. Make it more specific.'
  }
  return null
}

/** Whether the text matches the rule's words (ignores on/off, platform, role, live). */
export function autoReplyMatches(m: AutoReplyMatch, text: string): boolean {
  if (m.kind === 'regex') {
    try {
      const hay = Array.from(text).slice(0, MAX_INPUT_CHARS).join('').normalize('NFKC')
      return new RegExp(m.text, m.case_sensitive ? 'u' : 'iu').test(hay)
    } catch {
      return false
    }
  }
  const needle = foldText(m.text, m.case_sensitive)
  if (!needle) return false
  const hay = foldText(text, m.case_sensitive)
  if (m.kind === 'contains') return hay.includes(needle)
  if (m.kind === 'starts_with') return hay.startsWith(needle)
  return hasWord(hay, needle)
}

/** Whether `role` lets this person in (core::command::Access::allows). */
export function roleAllows(role: AutoReplyRole, roles: number): boolean {
  const is = (bit: number) => (roles & bit) !== 0
  const modUp = is(1) || is(2)
  if (role === 'everyone') return true
  if (role === 'subs') return modUp || is(4) || is(8) || is(16)
  if (role === 'vips') return modUp || is(4)
  return modUp
}

/** The reply as the bot sends it: variables filled, one line, ≤ 500, no `/` or `.` start. */
export function renderAutoReply(
  reply: string,
  platform: ChatPlatform,
  actor: Actor,
  extra: Vars = {},
): string {
  let out: string
  try {
    out = Template.parse(reply).render({
      ...extra,
      user: actor.display_name,
      name: actor.display_name,
      platform: PLATFORM_LABEL[platform],
    })
  } catch {
    out = ''
  }
  let t = Array.from(out)
    .map((c) => (/\p{Cc}/u.test(c) ? ' ' : c))
    .join('')
    .trim()
  while (t.startsWith('/') || t.startsWith('.')) t = t.slice(1).trimStart()
  return Array.from(t).slice(0, AUTOREPLY_LIMITS.replyChars).join('')
}
