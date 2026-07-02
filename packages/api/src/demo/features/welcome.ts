// First-time chatter marks and the welcome setting in the demo, matching the engine
// (`crates/core/src/welcome.rs`, `crates/engine/src/welcome.rs`).

import type { FerroEvent, WelcomeConfig } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, isWhole, requireObj, type DemoHost, type Routed } from './host'

export const DEFAULT_WELCOME: WelcomeConfig = {
  enabled: false,
  template: "Welcome to the stream, {user}! Glad you're here.",
  returning_badge: true,
  returning_days: 30,
}

export class DemoWelcome {
  config: WelcomeConfig = clone(DEFAULT_WELCOME)
  private readonly seen = new Set<string>()
  private lastWelcome = 0

  constructor(private readonly host: DemoHost) {}

  private armed = false
  /** Seeded regulars who can "come back" once each. */
  private readonly regulars = new Set<string>()

  /** After the seeded history: everyone in it has chatted before. */
  arm(history: FerroEvent[]): void {
    // The demo's first-time chatter (Twitch's first-message flag) stays new.
    for (const e of history)
      if (e.kind.type === 'chat_message' && !(e.kind.actor.roles & 512))
        this.seen.add(`${e.platform}:${e.kind.actor.id}`)
    for (const k of this.seen) this.regulars.add(k)
    this.armed = true
  }

  onChat(e: FerroEvent): void {
    if (!this.armed || e.kind.type !== 'chat_message' || e.origin !== 'live') return
    const a = e.kind.actor
    if (!a.id || a.id === 'me') return
    const key = `${e.platform}:${a.id}`
    if (!this.seen.has(key)) {
      this.seen.add(key)
      this.host.broadcastLive({ v: 1, type: 'chatter', data: { event_id: e.id, kind: 'first' } })
      const now = Date.now()
      if (this.config.enabled && now - this.lastWelcome >= 10_000) {
        this.lastWelcome = now
        // One pass, so a name like "$'" or "{platform}" stays exactly what it is.
        this.host.say(
          this.config.template.replace(/\{(user|name|platform)\}/g, (_m, k: string) =>
            k === 'platform' ? e.platform : a.display_name,
          ),
        )
      }
      return
    }
    // Now and then someone the demo "hasn't seen in a while" comes back.
    if (this.config.returning_badge && this.regulars.has(key) && this.host.random() < 0.04) {
      this.regulars.delete(key)
      this.host.broadcastLive({
        v: 1,
        type: 'chatter',
        data: {
          event_id: e.id,
          kind: 'returning',
          days: this.config.returning_days + Math.floor(this.host.random() * 60),
        },
      })
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'welcome' || seg.length !== 1) return NOT_MINE
    if (method === 'GET') return clone(this.config)
    if (method !== 'PUT') return NOT_MINE
    const patch = requireObj(body)
    const next = { ...this.config }
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in next)) continue
      const cur = next[k as keyof WelcomeConfig]
      if (typeof cur === 'boolean' && typeof v !== 'boolean')
        throw new HttpError(400, 'invalid', `${k}: must be true or false.`)
      if (typeof cur === 'number' && !(isWhole(v) && v >= 0))
        throw new HttpError(400, 'invalid', `${k}: must be a whole number of 0 or more.`)
      if (typeof cur === 'string' && typeof v !== 'string')
        throw new HttpError(400, 'invalid', `${k}: must be text.`)
      ;(next as Record<string, unknown>)[k] = v
    }
    next.template = next.template.trim()
    if (!next.template || [...next.template].length > 300)
      throw new HttpError(400, 'invalid', 'template: write a welcome of 1 to 300 characters.')
    if ((next.template.match(/{/g) ?? []).length !== (next.template.match(/}/g) ?? []).length)
      throw new HttpError(400, 'invalid', 'template: a "{" is never closed.')
    if (next.returning_days < 7 || next.returning_days > 365)
      throw new HttpError(400, 'invalid', 'returning_days: must be between 7 and 365 days.')
    this.config = next
    return clone(this.config)
  }
}
