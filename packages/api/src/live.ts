// The dashboard live socket (API.md §5): frames arrive one by one, the UI gets them in
// batches every ~80 ms so a hype moment doesn't re-render the app hundreds of times (R-54).

import type { LiveFrame } from './types'
import {
  ReconnectingSocket,
  type ConnectionState,
  type ReconnectTuning,
  type SocketFactory,
} from './socket'

const LIVE_TYPES = new Set([
  'hello',
  'event',
  'status',
  'queue',
  'tts_pending',
  'notice',
  'goals',
  'held',
  'held_resolved',
  'panic',
  'resync',
  'poll',
  'giveaway',
  'chatter',
  // App updates (the sidebar's "Update available" and its progress).
  'update',
  // Dashboard anywhere: the relay says whether the streaming PC is reachable (remote.ts).
  'remote',
  // Studio (studio.ts)
  'lane',
  'marker',
  'counter',
  'show',
  'obs_health',
  'brb',
  // Go live everywhere (golive.ts)
  'golive',
])

const UPDATE_PHASES = new Set(['idle', 'downloading', 'installing', 'ready', 'failed'])

/** Parses one frame; returns null for anything malformed or from a future protocol. */
export function parseLiveFrame(raw: unknown): LiveFrame | null {
  if (typeof raw !== 'string' || raw.length > 1_000_000) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const f = v as { v?: unknown; type?: unknown; data?: unknown }
  if (f.v !== 1 || typeof f.type !== 'string' || !LIVE_TYPES.has(f.type)) return null
  if (typeof f.data !== 'object' || f.data === null) return null
  if (f.type === 'event') {
    const e = f.data as { id?: unknown; seq?: unknown; kind?: unknown }
    if (typeof e.id !== 'string' || typeof e.seq !== 'number') return null
    if (typeof e.kind !== 'object' || e.kind === null) return null
    if (typeof (e.kind as { type?: unknown }).type !== 'string') return null
  }
  // Community frames: the dashboard renders these directly, so their shape is checked.
  const d = f.data as Record<string, unknown>
  if (f.type === 'poll') {
    const p = d.poll as Record<string, unknown> | null | undefined
    if (
      p !== null &&
      !(typeof p === 'object' && typeof p.id === 'string' && Array.isArray(p.options))
    )
      return null
  }
  if (f.type === 'giveaway') {
    const g = d.giveaway as Record<string, unknown> | null | undefined
    if (
      g !== null &&
      !(
        typeof g === 'object' &&
        typeof g.id === 'string' &&
        Array.isArray(g.entrants) &&
        Array.isArray(g.winners)
      )
    )
      return null
  }
  if (f.type === 'chatter') {
    if (typeof d.event_id !== 'string') return null
    if (d.kind !== 'first' && !(d.kind === 'returning' && typeof d.days === 'number')) return null
  }
  if (f.type === 'update') {
    if (typeof d.current !== 'string' || (d.latest !== null && typeof d.latest !== 'string'))
      return null
    if (d.notes !== undefined && d.notes !== null && typeof d.notes !== 'string') return null
    const i = d.install as Record<string, unknown> | undefined
    if (i !== undefined) {
      if (typeof i !== 'object' || i === null) return null
      if (!UPDATE_PHASES.has(i.phase as string) || typeof i.downloaded !== 'number') return null
      if (i.error !== null && i.error !== undefined && typeof i.error !== 'object') return null
    }
  }
  // Studio frames the dashboard renders directly.
  if (f.type === 'lane' && !Array.isArray(d.items)) return null
  if (f.type === 'obs_health' && !Array.isArray(d.warnings)) return null
  if (f.type === 'show' && d.show !== null && typeof d.show !== 'object') return null
  if (f.type === 'counter' && (typeof d.name !== 'string' || typeof d.value !== 'number'))
    return null
  if (f.type === 'golive' && (typeof d.live !== 'boolean' || !Array.isArray(d.destinations)))
    return null
  return f as LiveFrame
}

export interface LiveOptions {
  /** May be fetched first (a phone's single-use ticket, `FerroClient.liveSocketUrl`). */
  url: (sinceSeq: number | undefined) => string | Promise<string>
  factory: SocketFactory
  onFrames: (frames: LiveFrame[]) => void
  onState?: (state: ConnectionState, attempt: number) => void
  /**
   * The server closed the socket with this code (0 when unknown). Return 'stop' to stop
   * reconnecting: a phone's 4401 (removed), 4402 (Pro paused), 4409 (opened elsewhere).
   */
  onClose?: (code: number) => 'stop' | void
  flushMs?: number
  tuning?: Partial<ReconnectTuning>
}

export class LiveConnection {
  private readonly sock: ReconnectingSocket
  private buffer: LiveFrame[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private lastSeq: number | undefined
  private readonly seen = new Set<string>()
  private readonly seenOrder: string[] = []

  constructor(private readonly opts: LiveOptions) {
    this.sock = new ReconnectingSocket({
      url: () => opts.url(this.lastSeq),
      factory: opts.factory,
      onMessage: (d) => this.receive(d),
      ...(opts.onState ? { onState: opts.onState } : {}),
      ...(opts.onClose ? { onClose: opts.onClose } : {}),
      ...(opts.tuning ? { tuning: opts.tuning } : {}),
    })
  }

  start(): void {
    this.sock.start()
  }

  stop(): void {
    this.sock.stop()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.flush()
  }

  private receive(raw: unknown): void {
    const frame = parseLiveFrame(raw)
    if (!frame) return
    if (frame.type === 'event') {
      // Reconnects can replay events we already have; drop repeats by id.
      if (this.seen.has(frame.data.id)) return
      this.seen.add(frame.data.id)
      this.seenOrder.push(frame.data.id)
      if (this.seenOrder.length > 2000) {
        const old = this.seenOrder.shift()
        if (old !== undefined) this.seen.delete(old)
      }
      this.lastSeq = Math.max(this.lastSeq ?? 0, frame.data.seq)
    } else if (frame.type === 'hello') {
      this.lastSeq = Math.max(this.lastSeq ?? 0, frame.data.seq)
    }
    this.buffer.push(frame)
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, this.opts.flushMs ?? 80)
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return
    const frames = this.buffer
    this.buffer = []
    this.opts.onFrames(frames)
  }
}
