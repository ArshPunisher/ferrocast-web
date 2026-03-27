// TypeScript port of `core::queue::AlertQueue` used by the demo engine, so the demo behaves
// like the real thing: one alert at a time, priority order, deadline when an overlay goes
// quiet, gap between alerts, stale alerts folded after an outage, forged acks ignored.

import type { AckPhase, Queue, RenderedAlert } from './types'

export interface QueueTuning {
  ack_grace_ms: number
  gap_ms: number
  stale_after_ms: number
  max_waiting: number
}

export const DEFAULT_QUEUE_TUNING: QueueTuning = {
  ack_grace_ms: 5000,
  gap_ms: 600,
  stale_after_ms: 180_000,
  max_waiting: 200,
}

export type QueueAction =
  | { type: 'show'; alert: RenderedAlert }
  | { type: 'hide'; alert_id: string }
  | { type: 'folded'; alert_ids: string[] }

interface Waiting {
  alert: RenderedAlert
  priority: number
  enqueued_at: number
}
interface Playing {
  alert: RenderedAlert
  started_at: number
  deadline: number
  acknowledged: boolean
}

export class AlertQueue {
  private waiting: Waiting[] = []
  private playing: Playing | null = null
  private paused = false
  private nextAt = 0

  constructor(readonly tuning: QueueTuning = DEFAULT_QUEUE_TUNING) {}

  enqueue(alert: RenderedAlert, priority: number, now: number): QueueAction[] {
    if (this.contains(alert.alert_id)) return []
    let pos = this.waiting.findIndex((w) => w.priority < priority)
    if (pos < 0) pos = this.waiting.length
    this.waiting.splice(pos, 0, { alert, priority, enqueued_at: now })
    return [...this.enforceCap(), ...this.tick(now)]
  }

  tick(now: number): QueueAction[] {
    const actions: QueueAction[] = []
    if (this.playing && now >= this.playing.deadline) {
      actions.push({ type: 'hide', alert_id: this.playing.alert.alert_id })
      this.finish(now)
    }
    if (this.playing || this.paused || now < this.nextAt) return actions
    if (this.tuning.stale_after_ms > 0) {
      const cutoff = now - this.tuning.stale_after_ms
      const stale = this.waiting.filter((w) => w.enqueued_at < cutoff)
      if (stale.length) {
        this.waiting = this.waiting.filter((w) => w.enqueued_at >= cutoff)
        actions.push({ type: 'folded', alert_ids: stale.map((w) => w.alert.alert_id) })
      }
    }
    const next = this.waiting.shift()
    if (next) {
      actions.push({ type: 'show', alert: next.alert })
      this.playing = {
        alert: next.alert,
        started_at: now,
        deadline: now + next.alert.duration_ms + this.tuning.ack_grace_ms,
        acknowledged: false,
      }
    }
    return actions
  }

  ack(alertId: string, phase: AckPhase, now: number): QueueAction[] {
    const p = this.playing
    if (!p || p.alert.alert_id !== alertId) return []
    if (phase === 'started') {
      if (!p.acknowledged) {
        p.acknowledged = true
        p.deadline = now + p.alert.duration_ms + this.tuning.ack_grace_ms
      }
      return []
    }
    this.finish(now)
    return this.tick(now)
  }

  skip(now: number): QueueAction[] {
    if (!this.playing) return []
    const actions: QueueAction[] = [{ type: 'hide', alert_id: this.playing.alert.alert_id }]
    this.finish(now)
    return [...actions, ...this.tick(now)]
  }

  pause(): void {
    this.paused = true
  }

  resume(now: number): QueueAction[] {
    this.paused = false
    return this.tick(now)
  }

  clearWaiting(): string[] {
    const ids = this.waiting.map((w) => w.alert.alert_id)
    this.waiting = []
    return ids
  }

  remove(alertId: string): boolean {
    const before = this.waiting.length
    this.waiting = this.waiting.filter((w) => w.alert.alert_id !== alertId)
    return before !== this.waiting.length
  }

  get isPaused(): boolean {
    return this.paused
  }

  get current(): Playing | null {
    return this.playing
  }

  get length(): number {
    return this.waiting.length + (this.playing ? 1 : 0)
  }

  /** When `tick` should run next, if anything is pending. */
  nextWake(): number | null {
    if (this.playing) return this.playing.deadline
    if (this.waiting.length && !this.paused) return this.nextAt
    return null
  }

  /** The API shape (API.md: GET /api/v1/queue). */
  snapshot(): Queue {
    return {
      paused: this.paused,
      playing: this.playing
        ? { alert: this.playing.alert, started_at: this.playing.started_at }
        : null,
      waiting: this.waiting.map((w) => ({ ...w })),
    }
  }

  private contains(id: string): boolean {
    return this.playing?.alert.alert_id === id || this.waiting.some((w) => w.alert.alert_id === id)
  }

  private finish(now: number): void {
    this.playing = null
    this.nextAt = now + this.tuning.gap_ms
  }

  private enforceCap(): QueueAction[] {
    const folded: string[] = []
    while (this.waiting.length > Math.max(this.tuning.max_waiting, 1)) {
      const lowest = Math.min(...this.waiting.map((w) => w.priority))
      const idx = this.waiting.findIndex((w) => w.priority === lowest)
      const [w] = this.waiting.splice(idx, 1)
      if (w) folded.push(w.alert.alert_id)
    }
    return folded.length ? [{ type: 'folded', alert_ids: folded }] : []
  }
}
