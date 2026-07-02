// Chat polls in the demo, matching the engine (`crates/core/src/poll.rs`,
// `crates/server/src/routes/polls.rs`): same validation copy, one vote per person,
// changes allowed, nothing after the end, the result posted to chat once.

import type { FerroEvent, PollSpec, PollView } from '../../types'
import { POLL_LIMITS } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type DemoHost, type Routed } from './host'

interface Poll {
  id: string
  question: string
  options: string[]
  started_at: number
  ends_at: number
  closed: boolean
  votes: Map<string, number>
}

const oneLine = (s: string) =>
  s
    .split(/[\s\p{Cc}]+/u)
    .filter(Boolean)
    .join(' ')

/** The engine's checks, in its words. Returns the cleaned spec. */
export function cleanPollSpec(body: unknown): PollSpec {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new HttpError(
      400,
      'invalid',
      'Send the poll as an object: { question, options, duration_s }.',
    )
  const b = body as Record<string, unknown>
  if (typeof b.question !== 'string') throw new HttpError(400, 'invalid', 'question: must be text.')
  if (!Array.isArray(b.options))
    throw new HttpError(400, 'invalid', 'options: must be a list of 2 to 5 answers.')
  if (!b.options.every((o) => typeof o === 'string'))
    throw new HttpError(400, 'invalid', 'options: every answer must be text.')
  let duration = 60
  if (b.duration_s !== undefined && b.duration_s !== null) {
    if (typeof b.duration_s !== 'number')
      throw new HttpError(400, 'invalid', 'duration_s: must be a whole number of seconds.')
    if (!Number.isInteger(b.duration_s) || b.duration_s < 0)
      throw new HttpError(400, 'invalid', 'duration_s: polls run for 10 seconds to 30 minutes.')
    duration = b.duration_s
  }
  const question = oneLine(b.question)
  if (!question || [...question].length > POLL_LIMITS.question)
    throw new HttpError(400, 'invalid', 'question: ask something 1 to 120 characters long.')
  const options = (b.options as string[]).map(oneLine)
  if (options.length < POLL_LIMITS.minOptions || options.length > POLL_LIMITS.maxOptions)
    throw new HttpError(400, 'invalid', 'options: give 2 to 5 answers.')
  options.forEach((o, i) => {
    if (!o || [...o].length > POLL_LIMITS.option)
      throw new HttpError(400, 'invalid', `options: answer ${i + 1} must be 1 to 60 characters.`)
    if (options.slice(0, i).some((p) => p.toLowerCase() === o.toLowerCase()))
      throw new HttpError(400, 'invalid', `options: "${o}" is in the list twice.`)
  })
  if (duration < POLL_LIMITS.minDuration || duration > POLL_LIMITS.maxDuration)
    throw new HttpError(400, 'invalid', 'duration_s: polls run for 10 seconds to 30 minutes.')
  return { question, options, duration_s: duration }
}

/** `!vote 2` → 2. */
export function parseVote(text: string): number | null {
  const m = /^\s*!vote\s+#?(\d{1,2})(?:\s|$)/i.exec(text)
  return m ? Number(m[1]) : null
}

export class DemoPolls {
  private poll: Poll | null = null
  private n = 0

  constructor(private readonly host: DemoHost) {}

  view(): PollView | null {
    const p = this.poll
    if (!p) return null
    const tally = p.options.map(() => 0)
    for (const i of p.votes.values()) tally[i] = (tally[i] ?? 0) + 1
    const total = tally.reduce((a, b) => a + b, 0)
    const top = Math.max(0, ...tally)
    return {
      id: p.id,
      question: p.question,
      options: p.options.map((text, i) => ({ text, votes: tally[i] ?? 0 })),
      total,
      started_at: p.started_at,
      ends_at: p.ends_at,
      closed: p.closed,
      leaders: top === 0 ? [] : tally.flatMap((n, i) => (n === top ? [i] : [])),
    }
  }

  private open(now = Date.now()): boolean {
    return !!this.poll && !this.poll.closed && now < this.poll.ends_at
  }

  private push(): void {
    const v = this.view()
    this.host.broadcastLive({ v: 1, type: 'poll', data: { poll: clone(v) } })
    this.host.pushOverlayState({ poll: clone(v) })
  }

  private result(v: PollView): string {
    if (v.total === 0) return `Poll closed: ${v.question} Nobody voted.`
    const votes = (n: number) => `${n} vote${n === 1 ? '' : 's'}`
    if (v.leaders.length === 1) {
      const o = v.options[v.leaders[0] ?? 0]!
      return `Poll closed: ${v.question} Winner: ${o.text} with ${votes(o.votes)} (${Math.round((o.votes * 100) / v.total)}%).`
    }
    const names = v.leaders.map((i) => v.options[i]!.text).join(' and ')
    return `Poll closed: ${v.question} It's a tie between ${names} (${votes(v.options[v.leaders[0]!]!.votes)} each).`
  }

  private finish(id: string | null): PollView {
    const p = this.poll
    if (!p || (id !== null && p.id !== id))
      throw new HttpError(
        404,
        'poll_not_found',
        'There’s no poll running.',
        'Start one from Community → Polls.',
      )
    if (p.closed) throw new HttpError(409, 'conflict', 'That poll already ended.')
    p.closed = true
    const v = this.view()!
    this.push()
    this.host.say(this.result(v))
    return v
  }

  /** Counts `!vote N` from live chat, like the engine (one per person). */
  onChat(e: FerroEvent): void {
    if (e.kind.type !== 'chat_message' || e.origin !== 'live' || !this.open()) return
    const n = parseVote(e.kind.content.text)
    const p = this.poll!
    if (n === null || n < 1 || n > p.options.length) return
    const who = `${e.platform}:${e.kind.actor.id ?? e.kind.actor.display_name}`
    if (p.votes.get(who) === n - 1) return
    p.votes.set(who, n - 1)
    this.push()
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'polls') return NOT_MINE
    if (seg.length === 1 && method === 'POST') {
      const spec = cleanPollSpec(body)
      if (this.open())
        throw new HttpError(
          409,
          'conflict',
          'A poll is already running. End it before starting another.',
        )
      const now = Date.now()
      const id = `poll-${now.toString(36)}-${++this.n}`
      this.poll = {
        id,
        question: spec.question,
        options: spec.options,
        started_at: now,
        ends_at: now + spec.duration_s * 1000,
        closed: false,
        votes: new Map(),
      }
      this.push()
      const s = spec.duration_s
      const time =
        s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`
      this.host.say(
        `Poll: ${spec.question} Type ${spec.options.map((o, i) => `!vote ${i + 1} for ${o}`).join(', ')}. You have ${time}.`,
      )
      this.simulateVotes(id, spec)
      this.host.later(() => {
        if (this.poll?.id === id && !this.poll.closed) this.finish(id)
      }, spec.duration_s * 1000)
      return clone(this.view())
    }
    if (seg[1] !== 'current' || seg.length > 3) return NOT_MINE
    if (seg.length === 2 && method === 'GET') return clone(this.view())
    if (seg.length === 3 && seg[2] === 'end' && method === 'POST') return this.finish(null)
    if (seg.length === 2 && method === 'DELETE') {
      if (!this.poll)
        throw new HttpError(
          404,
          'poll_not_found',
          'There’s no poll running.',
          'Start one from Community → Polls.',
        )
      this.poll = null
      this.push()
      return undefined
    }
    return NOT_MINE
  }

  /** The demo audience votes over the poll's first two thirds, leaning to one answer. */
  private simulateVotes(id: string, spec: PollSpec): void {
    const people = this.host.knownActors().filter((a) => !(a.roles & 256))
    const favourite = Math.floor(this.host.random() * spec.options.length)
    const span = spec.duration_s * 1000 * 0.66
    people.forEach((a, i) => {
      if (this.host.random() < 0.25) return
      const pick =
        this.host.random() < 0.45 ? favourite : Math.floor(this.host.random() * spec.options.length)
      this.host.later(
        () => {
          if (this.poll?.id !== id || !this.open()) return
          this.host.chat(a, `!vote ${pick + 1}`)
        },
        600 + (span * (i + this.host.random())) / people.length,
      )
    })
  }
}
