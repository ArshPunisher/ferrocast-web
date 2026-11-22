// The stream scheduler in the demo, matching the engine (`crates/engine/src/schedule.rs`): the
// same routes, 400 field errors, scheduled broadcasts only where a platform has them (YouTube,
// Facebook, when connected), one reminder before the start, and never a go-live.

import { SCHEDULE_PLATFORMS, scheduleStartLabel } from '../../schedule'
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
    if (seg.length === 1 && method === 'GET')
      return { streams: clone([...this.plans].sort((a, b) => a.start_ms - b.start_ms)) }
    if (seg.length === 1 && method === 'POST') return this.create(body)
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
    const b = requireObj(body) as Partial<NewScheduledStream> & Record<string, unknown>
    const start = typeof b.start_ms === 'number' ? b.start_ms : 0
    if (start <= Date.now())
      throw new HttpError(400, 'invalid', 'start: pick a time in the future.')
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
    const title = typeof info.title === 'string' ? info.title.trim() : ''
    if (!title) throw new HttpError(400, 'invalid', 'title: give the stream a title.')
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
    this.host.broadcastLive({
      v: 1,
      type: 'notice',
      data: {
        key: `schedule:${id}`,
        level: 'info',
        message: `“${plan.info.title ?? ''}” starts ${scheduleStartLabel(plan.start_ms, Date.now())}.`,
      },
    })
  }
}
