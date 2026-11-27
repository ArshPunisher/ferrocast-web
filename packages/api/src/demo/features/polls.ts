// Stream polls in the demo, matching the engine (`crates/core/src/poll.rs`,
// `crates/engine/src/polls.rs`, `crates/server/src/routes/polls.rs`): native platform
// simulation on Twitch/YouTube when eligible, `!vote N` elsewhere or on fallback,
// optional `duration_s: null` untimed polls, one vote per person, result posted once to
// chat-mode platforms.

import type {
  ChatPlatform,
  FerroEvent,
  PlatformPollCapability,
  PlatformPollStatus,
  PollLimits,
  PollsCapabilities,
  PollSpec,
  PollView,
} from '../../types'
import { POLL_LIMITS } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type DemoHost, type Routed } from './host'

interface Poll {
  id: string
  question: string
  options: string[]
  started_at: number
  ends_at: number | null
  closed: boolean
  platforms: PlatformPollStatus[]
  votes: Map<string, number>
  nativeTallies: Map<ChatPlatform, number[]>
}

const DEFAULT_PLATFORM_LIMITS: PollLimits = {
  min_options: POLL_LIMITS.minOptions,
  max_options: POLL_LIMITS.maxOptions,
  min_duration_s: POLL_LIMITS.minDuration,
  max_duration_s: POLL_LIMITS.maxDuration,
  supports_no_timer: true,
  question_chars: POLL_LIMITS.question,
  option_chars: POLL_LIMITS.option,
}

const TWITCH_LIMITS: PollLimits = {
  min_options: 2,
  max_options: 5,
  min_duration_s: 15,
  max_duration_s: 1800,
  supports_no_timer: true,
  question_chars: 60,
  option_chars: 25,
}

const YOUTUBE_LIMITS: PollLimits = {
  min_options: 2,
  max_options: 4,
  min_duration_s: 10,
  max_duration_s: 1800,
  supports_no_timer: true,
  question_chars: 100,
  option_chars: 35,
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

  let duration: number | null
  if (b.duration_s === undefined) {
    duration = 60
  } else if (b.duration_s === null) {
    duration = null
  } else {
    if (typeof b.duration_s !== 'number')
      throw new HttpError(400, 'invalid', 'duration_s: must be a whole number of seconds or null.')
    if (!Number.isInteger(b.duration_s) || b.duration_s < 0)
      throw new HttpError(400, 'invalid', 'duration_s: polls run for 10 seconds to 30 minutes.')
    duration = b.duration_s
  }

  let chatFallback = true
  if (b.chat_fallback !== undefined && b.chat_fallback !== null) {
    if (typeof b.chat_fallback !== 'boolean')
      throw new HttpError(400, 'invalid', 'chat_fallback: must be true or false.')
    chatFallback = b.chat_fallback
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
  if (
    duration !== null &&
    (duration < POLL_LIMITS.minDuration || duration > POLL_LIMITS.maxDuration)
  )
    throw new HttpError(400, 'invalid', 'duration_s: polls run for 10 seconds to 30 minutes.')
  return { question, options, duration_s: duration, chat_fallback: chatFallback }
}

function limitReason(spec: PollSpec, limits: PollLimits): string | null {
  if (
    [...spec.question].length > limits.question_chars ||
    spec.options.some((o) => [...o].length > limits.option_chars)
  )
    return 'text_too_long_for_native'
  if (spec.options.length < limits.min_options || spec.options.length > limits.max_options)
    return 'options_count_unsupported_for_native'
  if (spec.duration_s === null && !limits.supports_no_timer)
    return 'no_timer_unsupported_for_native'
  return null
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

  capabilities(): PollsCapabilities {
    const platforms: PlatformPollCapability[] = []
    for (const platform of this.host.connectedChat()) {
      if (platform === 'twitch') {
        const needsScope = this.host.twitchNeedsPollScope?.() ?? false
        platforms.push({
          platform,
          mode: needsScope ? 'reconnect_needed' : 'native',
          reason: needsScope ? 'needs_scope' : null,
          limits: TWITCH_LIMITS,
        })
      } else if (platform === 'youtube') {
        const live = this.host.isLiveOn?.('youtube') ?? this.host.isLive()
        platforms.push({
          platform,
          mode: live ? 'native' : 'chat_fallback',
          reason: live ? null : 'not_live',
          limits: YOUTUBE_LIMITS,
        })
      } else {
        platforms.push({
          platform,
          mode: 'chat_fallback',
          reason: 'platform_unsupported',
          limits: DEFAULT_PLATFORM_LIMITS,
        })
      }
    }
    return { platforms }
  }

  view(): PollView | null {
    const p = this.poll
    if (!p) return null
    const tally = p.options.map(() => 0)
    for (const i of p.votes.values()) tally[i] = (tally[i] ?? 0) + 1
    for (const counts of p.nativeTallies.values()) {
      counts.forEach((n, i) => {
        tally[i] = (tally[i] ?? 0) + n
      })
    }
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
      ...(p.platforms.length > 0 ? { platforms: p.platforms.map((s) => ({ ...s })) } : {}),
    }
  }

  private open(now = Date.now()): boolean {
    return (
      !!this.poll && !this.poll.closed && (this.poll.ends_at === null || now < this.poll.ends_at)
    )
  }

  private chatTargets(p: Poll): ChatPlatform[] | undefined {
    if (p.platforms.length === 0) return undefined
    return p.platforms.filter((s) => s.mode === 'chat').map((s) => s.platform)
  }

  private allowsChatVote(p: Poll, platform: ChatPlatform): boolean {
    if (p.platforms.length === 0) return true
    return p.platforms.some((s) => s.platform === platform && s.mode === 'chat')
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
    for (const s of p.platforms) {
      if (s.state === 'active') s.state = 'ended'
    }
    const v = this.view()!
    this.push()
    const targets = this.chatTargets(p)
    if (targets === undefined) {
      this.host.say(this.result(v))
    } else if (targets.length > 0) {
      this.host.say(this.result(v), targets)
    }
    return v
  }

  /** Counts `!vote N` from live chat on chat-mode platforms (one per person). */
  onChat(e: FerroEvent): void {
    if (e.kind.type !== 'chat_message' || e.origin !== 'live' || !this.open()) return
    const p = this.poll!
    if (e.platform !== 'twitch' && e.platform !== 'youtube' && e.platform !== 'kick') return
    if (!this.allowsChatVote(p, e.platform)) return
    const n = parseVote(e.kind.content.text)
    if (n === null || n < 1 || n > p.options.length) return
    const who = `${e.platform}:${e.kind.actor.id ?? e.kind.actor.display_name}`
    if (p.votes.get(who) === n - 1) return
    p.votes.set(who, n - 1)
    this.push()
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'polls') return NOT_MINE
    if (seg.length === 2 && seg[1] === 'capabilities' && method === 'GET') {
      return this.capabilities()
    }
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
      const caps = this.capabilities()
      const statuses: PlatformPollStatus[] = []
      const chatFallback = spec.chat_fallback !== false

      for (const cap of caps.platforms) {
        if (cap.mode === 'native') {
          const reason = limitReason(spec, cap.limits)
          if (reason) {
            if (chatFallback) {
              statuses.push({
                platform: cap.platform,
                mode: 'chat',
                external_id: null,
                state: 'failed_fallback',
                note: reason,
              })
            }
          } else {
            statuses.push({
              platform: cap.platform,
              mode: 'native',
              external_id: `demo-${id}-${cap.platform}`,
              state: 'active',
            })
          }
        } else if (chatFallback) {
          statuses.push({
            platform: cap.platform,
            mode: 'chat',
            external_id: null,
            state: 'active',
            ...(cap.reason ? { note: cap.reason } : {}),
          })
        }
      }

      if (!chatFallback && statuses.length === 0) {
        throw new HttpError(
          400,
          'invalid',
          'No connected platform supports native polls right now. Enable chat (!vote) fallback or reconnect Twitch.',
        )
      }

      this.poll = {
        id,
        question: spec.question,
        options: spec.options,
        started_at: now,
        ends_at: spec.duration_s === null ? null : now + spec.duration_s * 1000,
        closed: false,
        platforms: statuses,
        votes: new Map(),
        nativeTallies: new Map(),
      }
      this.push()

      const targets = this.chatTargets(this.poll)
      if (targets === undefined || targets.length > 0) {
        const s = spec.duration_s
        const timeText =
          s === null
            ? 'Open until closed.'
            : `You have ${s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`}.`
        this.host.say(
          `Poll: ${spec.question} Type ${spec.options.map((o, i) => `!vote ${i + 1} for ${o}`).join(', ')}. ${timeText}`,
          targets,
        )
      }
      this.simulateVotes(id, spec, statuses)
      if (spec.duration_s !== null) {
        this.host.later(() => {
          if (this.poll?.id === id && !this.poll.closed) this.finish(id)
        }, spec.duration_s * 1000)
      }
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

  /** The demo audience votes on chat platforms (`!vote`) and natively on native platforms. */
  private simulateVotes(id: string, spec: PollSpec, statuses: PlatformPollStatus[]): void {
    const span = (spec.duration_s ?? 20) * 1000 * 0.66
    const chatPlatforms = new Set(statuses.filter((s) => s.mode === 'chat').map((s) => s.platform))
    const nativePlatforms = statuses.filter((s) => s.mode === 'native').map((s) => s.platform)
    const people = this.host
      .knownActors()
      .filter(
        (a) =>
          !(a.roles & 256) &&
          (a.platform === 'twitch' || a.platform === 'youtube' || a.platform === 'kick') &&
          chatPlatforms.has(a.platform),
      )
    const favourite = Math.floor(this.host.random() * spec.options.length)

    people.forEach((a, i) => {
      if (this.host.random() < 0.25) return
      const pick =
        this.host.random() < 0.45 ? favourite : Math.floor(this.host.random() * spec.options.length)
      this.host.later(
        () => {
          if (this.poll?.id !== id || !this.open()) return
          this.host.chat(a, `!vote ${pick + 1}`)
        },
        600 + (span * (i + this.host.random())) / Math.max(1, people.length),
      )
    })

    for (const np of nativePlatforms) {
      const voters = np === 'twitch' ? 12 : 6
      for (let i = 0; i < voters; i++) {
        const pick =
          this.host.random() < 0.5
            ? favourite
            : Math.floor(this.host.random() * spec.options.length)
        this.host.later(
          () => {
            if (!this.poll || this.poll.id !== id || !this.open()) return
            const cur = this.poll.nativeTallies.get(np) ?? spec.options.map(() => 0)
            cur[pick] = (cur[pick] ?? 0) + 1
            this.poll.nativeTallies.set(np, cur)
            this.push()
          },
          700 + (span * (i + this.host.random())) / voters,
        )
      }
    }
  }
}
