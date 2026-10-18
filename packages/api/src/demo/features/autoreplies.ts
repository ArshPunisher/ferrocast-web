// Auto-replies in the demo, matching the engine (`studio/autoreplies.rs`, `core::autoreply`):
// the same routes and statuses (400 field, 404 `autoreply_not_found`, 409 reorder, 413
// `reply_too_long`, 422 `bad_pattern` / `pattern_too_broad` / `too_many_autoreplies`), first
// match wins, cooldowns per rule and per viewer, never for the streamer, bots or commands,
// quiet during panic or with the bot off.

import {
  AUTOREPLY_LIMITS,
  autoReplyMatches,
  autoReplyProblem,
  autoReplyStarters,
  renderAutoReply,
  roleAllows,
  type AutoReply,
  type AutoReplyMatchKind,
  type AutoReplyRole,
  type AutoReplyTry,
} from '../../autoreplies'
import type { Vars } from '../../template'
import type { ChatPlatform, Command, FerroEvent } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type DemoHost, type Routed } from './host'

const KINDS: readonly AutoReplyMatchKind[] = ['contains', 'word', 'starts_with', 'regex']
const ROLES: Record<string, AutoReplyRole> = {
  everyone: 'everyone',
  subs: 'subs',
  subscriber: 'subs',
  vips: 'vips',
  vip: 'vips',
  mods: 'mods',
  mod: 'mods',
}
const KNOWN_BOTS = ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot']

export interface DemoAutoReplyContext {
  botOn: () => boolean
  commands: () => Command[]
  /** The category last set from Ferrocast. */
  game: () => string | null
  title: () => string | null
}

/** A problem with a rule as the engine answers it. */
function refuse(problem: string): HttpError {
  if (problem.startsWith('reply:') && problem.includes('too long'))
    return new HttpError(
      413,
      'reply_too_long',
      problem,
      'Shorten the reply; chat cuts longer messages.',
    )
  if (problem.startsWith('match.text: the pattern'))
    return new HttpError(
      422,
      'bad_pattern',
      problem,
      'Check brackets and put a \\ before special characters like ? . ( or [. Or use Contains instead.',
    )
  if (problem.includes('matches every message'))
    return new HttpError(
      422,
      'pattern_too_broad',
      problem,
      'Look for a word or phrase instead, like discord.',
    )
  return new HttpError(400, 'invalid', problem)
}

/** Reads a rule from a request body with the engine's defaults, or a 400 naming the field. */
function parseRule(
  body: unknown,
  opts: { draft?: boolean } = {},
): Omit<AutoReply, 'id'> & { id?: string } {
  const b = requireObj(body)
  const m = requireObj(b.match ?? {})
  const str = (v: unknown, field: string, fallback?: string): string => {
    if (v === undefined && fallback !== undefined) return fallback
    if (typeof v !== 'string')
      throw new HttpError(400, 'invalid', `A field is missing or wrong: ${field}`)
    return v
  }
  const num = (v: unknown, field: string, fallback: number): number => {
    if (v === undefined) return fallback
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
      throw new HttpError(400, 'invalid', `A field is missing or wrong: ${field}`)
    if (v > AUTOREPLY_LIMITS.cooldownMax)
      throw new HttpError(400, 'invalid', `${field}: use 0 to 86400 seconds.`)
    return v
  }
  const kind = (m.kind ?? 'contains') as AutoReplyMatchKind
  if (!KINDS.includes(kind))
    throw new HttpError(400, 'invalid', 'A field is missing or wrong: match.kind')
  const role = ROLES[String(b.min_role ?? 'everyone')]
  if (!role) throw new HttpError(400, 'invalid', 'A field is missing or wrong: min_role')
  const platforms = (b.platforms ?? []) as ChatPlatform[]
  if (
    !Array.isArray(platforms) ||
    platforms.some((p) => !['twitch', 'youtube', 'kick'].includes(p))
  )
    throw new HttpError(400, 'invalid', 'A field is missing or wrong: platforms')
  return {
    ...(typeof b.id === 'string' ? { id: b.id } : {}),
    name: str(b.name, 'name', opts.draft ? '' : undefined).trim(),
    enabled: b.enabled === undefined ? true : b.enabled === true,
    match: { kind, text: str(m.text, 'match.text'), case_sensitive: m.case_sensitive === true },
    reply: str(b.reply, 'reply', opts.draft ? '' : undefined),
    platforms,
    cooldown_s: num(b.cooldown_s, 'cooldown_s', 30),
    user_cooldown_s: num(b.user_cooldown_s, 'user_cooldown_s', 120),
    min_role: role,
    only_when_live: b.only_when_live === undefined ? true : b.only_when_live === true,
  }
}

export class DemoAutoReplies implements DemoFeature {
  rules: AutoReply[] = []
  private nextId = 1
  /** `rule:platform` and `rule:platform:user` → last answer (ms). */
  private last = new Map<string, number>()
  private sent: { platform: string; text: string; at: number }[] = []

  constructor(
    private readonly host: DemoHost,
    private readonly ctx: DemoAutoReplyContext,
  ) {}

  private find(id: string): number {
    const i = this.rules.findIndex((r) => r.id === id)
    if (i < 0)
      throw new HttpError(
        404,
        'autoreply_not_found',
        'That auto-reply doesn’t exist.',
        'Reload the Bot page; it may have been deleted.',
      )
    return i
  }

  private check(r: Omit<AutoReply, 'id'>) {
    const problem = autoReplyProblem(r)
    if (problem) throw refuse(problem)
  }

  private vars(platform: ChatPlatform): Vars {
    return {
      channel: 'novaplays',
      game: this.ctx.game() ?? 'something fun',
      title: this.ctx.title() ?? '',
      uptime: this.host.isLive() ? '1h 12m' : '',
      uptime_text: this.host.isLive() ? 'We’ve been live for 1h 12m.' : 'We’re not live right now.',
      platform,
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'autoreplies') return NOT_MINE
    const [, b] = seg
    if (seg.length === 1 && method === 'GET') return clone(this.rules)
    if (seg.length === 1 && method === 'POST') {
      const r = parseRule(body)
      if (r.id && this.rules.some((x) => x.id === r.id))
        throw new HttpError(409, 'conflict', 'An auto-reply with that id already exists.')
      if (this.rules.length >= AUTOREPLY_LIMITS.rules)
        throw new HttpError(
          422,
          'too_many_autoreplies',
          `You have ${AUTOREPLY_LIMITS.rules} auto-replies, the most Ferrocast keeps.`,
          'Delete or merge some first: one rule can look for several words with a pattern.',
        )
      this.check(r)
      const saved: AutoReply = { ...r, id: r.id || `ar-${this.nextId++}` }
      this.rules.push(saved)
      return clone(saved)
    }
    if (seg.length === 2 && b === 'order' && method === 'PUT') {
      const ids = requireObj(body).ids
      const have = this.rules.map((r) => r.id).sort()
      const want = Array.isArray(ids) ? [...new Set(ids.map(String))].sort() : []
      if (!Array.isArray(ids) || ids.length !== want.length || want.join('\n') !== have.join('\n'))
        throw new HttpError(
          409,
          'conflict',
          'ids: list every auto-reply exactly once (the list changed; reload it).',
        )
      this.rules = (ids as string[]).map((id) => this.rules[this.find(id)]!)
      return clone(this.rules)
    }
    if (seg.length === 2 && b === 'starters' && method === 'GET') return autoReplyStarters()
    if (seg.length === 2 && b === 'try' && method === 'POST') return this.tryIt(body)
    if (seg.length === 2 && b && method === 'PUT') {
      const i = this.find(b)
      const r = parseRule(body)
      this.check(r)
      const saved: AutoReply = { ...r, id: b }
      this.rules[i] = saved
      for (const k of [...this.last.keys()]) if (k.startsWith(`${b}:`)) this.last.delete(k)
      return clone(saved)
    }
    if (seg.length === 2 && b && method === 'DELETE') {
      this.rules.splice(this.find(b), 1)
      return undefined
    }
    return NOT_MINE
  }

  private tryIt(body: unknown): AutoReplyTry {
    const o = requireObj(body)
    if (typeof o.text !== 'string')
      throw new HttpError(400, 'invalid', 'A field is missing or wrong: text')
    const p = (o.platform ?? 'twitch') as ChatPlatform
    if (!['twitch', 'youtube', 'kick'].includes(p))
      throw new HttpError(
        400,
        'invalid',
        `"${String(o.platform)}" isn't a platform; use twitch, youtube or kick.`,
      )
    let rules = this.rules.filter((r) => r.enabled)
    let hasReply = true
    if (o.rule !== undefined && o.rule !== null) {
      const draft = parseRule(o.rule, { draft: true })
      hasReply = draft.reply.trim() !== ''
      const checked = { ...draft, name: draft.name || 'Draft', reply: hasReply ? draft.reply : '-' }
      this.check(checked)
      rules = [{ ...checked, id: draft.id ?? 'draft' }]
    }
    const hit = rules.find((r) => autoReplyMatches(r.match, o.text as string))
    if (!hit) return { matched: false, rule_id: null, rule_name: null, reply: null }
    const viewer = {
      platform: p,
      id: null,
      login: 'viewer',
      display_name: 'viewer',
      avatar_url: null,
      color: null,
      roles: 0,
      badges: [],
      anonymous: false,
    }
    return {
      matched: true,
      rule_id: hit.id,
      rule_name: hit.name,
      reply: hasReply ? renderAutoReply(hit.reply, p, viewer, this.vars(p)) : null,
    }
  }

  onChat(e: FerroEvent): void {
    if (e.kind.type !== 'chat_message' || e.origin !== 'live' || !this.rules.length) return
    if (!this.ctx.botOn()) return
    const a = e.kind.actor
    const text = e.kind.content.text
    const p = e.platform as ChatPlatform
    // Loop guard: the streamer's own account is the bot (R-28), bots, and echoes.
    if (a.id === 'me' || (a.roles & 1) !== 0 || (a.roles & 256) !== 0) return
    if (KNOWN_BOTS.includes((a.login ?? a.display_name).toLowerCase())) return
    const now = Date.now()
    this.sent = this.sent.filter((s) => now - s.at < 120_000)
    if (this.sent.some((s) => s.platform === p && s.text === text.trim())) return
    // Commands win.
    const word = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (word.startsWith('!') && word.length > 1) {
      if (
        this.ctx
          .commands()
          .some(
            (c) => c.name.toLowerCase() === word || c.aliases.some((x) => x.toLowerCase() === word),
          )
      )
        return
    }
    const live = this.host.isLive()
    const rule = this.rules.find(
      (r) =>
        r.enabled &&
        (r.platforms.length === 0 || r.platforms.includes(p)) &&
        roleAllows(r.min_role, a.roles) &&
        (live || !r.only_when_live) &&
        autoReplyMatches(r.match, text),
    )
    if (!rule) return
    const user = a.id ?? a.display_name.toLowerCase()
    const gKey = `${rule.id}:${p}`
    const uKey = `${rule.id}:${p}:${user}`
    const global = Math.max(rule.cooldown_s, AUTOREPLY_LIMITS.minGlobalCooldown) * 1000
    if (now - (this.last.get(gKey) ?? -Infinity) < global) return
    if (now - (this.last.get(uKey) ?? -Infinity) < rule.user_cooldown_s * 1000) return
    const reply = renderAutoReply(rule.reply, p, a, this.vars(p))
    if (!reply) return
    this.last.set(gKey, now)
    this.last.set(uKey, now)
    this.sent.push({ platform: p, text: reply, at: now })
    this.host.later(() => this.host.say(reply), 500)
  }
}
