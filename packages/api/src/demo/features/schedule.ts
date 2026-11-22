// The stream scheduler in the demo, matching the engine (`crates/engine/src/schedule.rs`): the
// same routes, 400 field errors, scheduled broadcasts only where a platform has them (YouTube,
// Facebook, when connected), one reminder before the start, and never a go-live.

import { SCHEDULE_PLATFORMS } from '../../schedule'
import type { NewScheduledStream, PlatformBroadcast, ScheduledStream } from '../../schedule'
import type { SchedulePlatform } from '../../schedule'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type DemoHost, type Routed } from './host'

const MAX_PLANS = 50
const LABEL: Record<SchedulePlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  facebook: 'Facebook',
}
/** A plan this long past its start is dropped (the engine's `KEEP_AFTER_START_MS`). */
const KEEP_AFTER_START_MS = 24 * 3_600_000
/** Past this long after its start a reminder is not said any more. */
const STALE_REMINDER_MS = 30 * 60_000
/** A plan can start at most this far ahead. */
const MAX_AHEAD_MS = 366 * 24 * 3_600_000
/** A title is at most this long (Twitch's limit). */
const MAX_TITLE = 140
/** `setTimeout` can't wait longer than this. */
const MAX_DELAY = 2_000_000_000

export class DemoSchedule implements DemoFeature {
  private plans: ScheduledStream[] = []
  private seq = 0

  constructor(
    private readonly host: Pick<DemoHost, 'later' | 'broadcastLive'>,
    private readonly connected: (p: SchedulePlatform) => boolean,
  ) {}

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'schedule') return NOT_MINE
    if (seg.length === 1 && method === 'GET') {
      // Old plans go when the list is read, as the engine's tick drops them.
      this.plans = this.plans.filter((p) => Date.now() < p.start_ms + KEEP_AFTER_START_MS)
      return { streams: clone([...this.plans].sort((a, b) => a.start_ms - b.start_ms)) }
    }
    if (seg.length === 1 && method === 'POST') {
      // Created: 201, as the engine answers.
      return new Response(JSON.stringify(this.create(body)), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (seg.length === 2 && method === 'DELETE') {
      const before = this.plans.length
      this.plans = this.plans.filter((p) => p.id !== seg[1])
      if (this.plans.length === before)
        throw new HttpError(404, 'not_found', 'scheduled stream not found')
      return undefined
    }
    return NOT_MINE
  }

  private create(body: unknown): ScheduledStream {
    // Plans a day past their start are gone: they don't count toward the limit.
    this.plans = this.plans.filter((p) => Date.now() < p.start_ms + KEEP_AFTER_START_MS)
    const b = requireObj(body) as Partial<NewScheduledStream> & Record<string, unknown>
    const start = typeof b.start_ms === 'number' ? b.start_ms : 0
    if (!Number.isFinite(start) || start <= Date.now())
      throw new HttpError(400, 'invalid', 'start: pick a time in the future.')
    if (start > Date.now() + MAX_AHEAD_MS)
      throw new HttpError(400, 'invalid', 'start: at most a year ahead.')
    const platforms = Array.isArray(b.platforms) ? b.platforms : []
    if (
      platforms.length === 0 ||
      platforms.some((p) => !SCHEDULE_PLATFORMS.includes(p as SchedulePlatform))
    )
      throw new HttpError(
        400,
        'invalid',
        'platforms: pick at least one of twitch, youtube, kick, facebook.',
      )
    const remind = b.remind_minutes ?? 10
    if (!Number.isInteger(remind) || remind < 1 || remind > 1440)
      throw new HttpError(400, 'invalid', 'remind_minutes: 1 to 1440.')
    const info = requireObj(b.info ?? {})
    // As the engine: control characters become spaces, then it is trimmed.
    const title =
      typeof info.title === 'string'
        ? [...info.title]
            .map((c) => ((c.codePointAt(0) ?? 0) < 0x20 || c === '\u007f' ? ' ' : c))
            .join('')
            .trim()
        : ''
    if (!title) throw new HttpError(400, 'invalid', 'title: give the stream a title.')
    if ([...title].length > MAX_TITLE)
      throw new HttpError(
        400,
        'invalid',
        `title: ${MAX_TITLE} characters at most (Twitch’s limit).`,
      )
    if (this.plans.length >= MAX_PLANS)
      throw new HttpError(
        409,
        'conflict',
        `You can plan up to ${MAX_PLANS} streams. Delete one that’s done.`,
      )
    const unique = [...new Set(platforms as SchedulePlatform[])]
    const id = `s_${(++this.seq).toString(16).padStart(12, '0')}`
    const plan: ScheduledStream = {
      id,
      info: { ...(info as object), title } as ScheduledStream['info'],
      platforms: unique,
      start_ms: start,
      remind_minutes: remind,
      reminded: false,
      broadcasts: unique.map((p) => this.broadcastFor(p, id)),
    }
    this.plans.push(plan)
    const wait = start - remind * 60_000 - Date.now()
    if (wait < MAX_DELAY) this.host.later(() => this.remind(id), Math.max(0, wait))
    return clone(plan)
  }

  private broadcastFor(p: SchedulePlatform, planId: string): PlatformBroadcast {
    if (!this.connected(p))
      return {
        platform: p,
        note: `Connect ${LABEL[p]} in Settings, Accounts to schedule it there. You’ll still get a reminder.`,
      }
    if (p === 'youtube' || p === 'facebook')
      return {
        platform: p,
        id: `${p}-${planId}`,
        url:
          p === 'youtube'
            ? `https://www.youtube.com/watch?v=demo${planId}`
            : 'https://www.facebook.com/demo/videos/1',
      }
    return {
      platform: p,
      note: `${LABEL[p]} has no scheduled broadcasts to make here: you’ll get a reminder, and go live as usual.`,
    }
  }

  /** The one reminder (a notice), never a go-live. */
  private remind(id: string): void {
    const plan = this.plans.find((p) => p.id === id)
    if (!plan || plan.reminded) return
    plan.reminded = true
    const now = Date.now()
    // Long past the start (the computer slept): marked done, nothing said (as the engine).
    if (now > plan.start_ms + STALE_REMINDER_MS) return
    const title = plan.info.title ?? ''
    const mins = Math.ceil((plan.start_ms - now) / 60_000)
    const message =
      now >= plan.start_ms
        ? `Time to stream: "${title}" was planned for now.`
        : `"${title}" starts in ${mins} minute${mins === 1 ? '' : 's'}.`
    this.host.broadcastLive({
      v: 1,
      type: 'notice',
      data: { key: `schedule:${id}`, level: 'info', message },
    })
  }
}
