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
  'panic',
  'resync',
  'poll',
  'giveaway',
  'chatter',
])

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
  return f as LiveFrame
}

export interface LiveOptions {
  url: (sinceSeq: number | undefined) => string
  factory: SocketFactory
  onFrames: (frames: LiveFrame[]) => void
  onState?: (state: ConnectionState, attempt: number) => void
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
