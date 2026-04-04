// A reconnecting WebSocket shared by the dashboard live socket and the overlay page.
// Exponential backoff with jitter, a watchdog for silent sockets, and a pluggable socket
// factory so the demo engine and tests can stand in for a real server.

/** The part of the browser WebSocket we use. */
export interface SocketLike {
  readonly readyState: number
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type SocketFactory = (url: string) => SocketLike

export interface ReconnectTuning {
  /** First retry delay. */
  baseMs: number
  /** Longest delay between retries. */
  maxMs: number
  /** Close and reconnect when nothing arrives for this long (0 = off). */
  silenceMs: number
}

export const DEFAULT_TUNING: ReconnectTuning = { baseMs: 500, maxMs: 15_000, silenceMs: 45_000 }

/** Delay before retry `attempt` (0-based): exponential with "full jitter". */
export function backoffDelay(attempt: number, t: ReconnectTuning, rand = Math.random): number {
  const cap = Math.min(t.maxMs, t.baseMs * 2 ** Math.min(attempt, 16))
  return Math.round(t.baseMs / 2 + rand() * (cap - t.baseMs / 2))
}

export type ConnectionState = 'connecting' | 'open' | 'retrying' | 'closed'

export interface ReconnectingOptions {
  url: () => string
  factory: SocketFactory
  onMessage: (data: unknown) => void
  onState?: (state: ConnectionState, attempt: number) => void
  /** Sent right after each (re)connect, e.g. the overlay `hello { since_seq }`. */
  onOpen?: (send: (data: string) => void) => void
  /**
   * Called when the server closes the socket, with the close code (0 when unknown).
   * Return 'stop' to give up for good, e.g. 4404 "this overlay token is gone".
   */
  onClose?: (code: number) => 'stop' | void
  tuning?: Partial<ReconnectTuning>
  /** Injectable clock for tests. */
  timers?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (h: unknown) => void
  }
  random?: () => number
}

export class ReconnectingSocket {
  private sock: SocketLike | null = null
  private attempt = 0
  private retryTimer: unknown = null
  private silenceTimer: unknown = null
  private stopped = false
  private paused = false
  private readonly t: ReconnectTuning
  private readonly timers: NonNullable<ReconnectingOptions['timers']>
  state: ConnectionState = 'connecting'

  constructor(private readonly opts: ReconnectingOptions) {
    this.t = { ...DEFAULT_TUNING, ...opts.tuning }
    this.timers = opts.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    }
  }

  start(): void {
    this.stopped = false
    this.paused = false
    this.open()
  }

  /** Closes for good (page unload, component unmount). */
  stop(): void {
    this.stopped = true
    this.clearTimers()
    this.detach()
    this.setState('closed')
  }

  /** Closes and stays closed until `resume` (OBS hid the source). */
  pause(): void {
    this.paused = true
    this.clearTimers()
    this.detach()
    this.setState('closed')
  }

  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    this.attempt = 0
    this.open()
  }

  send(data: string): boolean {
    if (this.sock && this.sock.readyState === 1) {
      try {
        this.sock.send(data)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  private open(): void {
    if (this.stopped || this.paused) return
    this.setState(this.attempt === 0 ? 'connecting' : 'retrying')
    let s: SocketLike
    try {
      s = this.opts.factory(this.opts.url())
    } catch {
      this.scheduleRetry()
      return
    }
    this.sock = s
    s.onopen = () => {
      if (this.sock !== s) return
      this.attempt = 0
      this.setState('open')
      this.armSilence()
      this.opts.onOpen?.((d) => {
        this.send(d)
      })
    }
    s.onmessage = (ev) => {
      if (this.sock !== s) return
      this.armSilence()
      this.opts.onMessage(ev.data)
    }
    s.onerror = () => {
      // onclose follows; nothing to do here.
    }
    s.onclose = (ev) => {
      if (this.sock !== s) return
      this.sock = null
      const raw = (ev as { code?: unknown } | null)?.code
      if (this.opts.onClose?.(typeof raw === 'number' ? raw : 0) === 'stop') {
        this.stop()
        return
      }
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.paused) return
    this.clearTimers()
    const delay = backoffDelay(this.attempt, this.t, this.opts.random)
    this.attempt += 1
    this.setState('retrying')
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null
      this.open()
    }, delay)
  }

  private armSilence(): void {
    if (this.t.silenceMs <= 0) return
    if (this.silenceTimer !== null) this.timers.clear(this.silenceTimer)
    this.silenceTimer = this.timers.set(() => {
      this.silenceTimer = null
      // A socket that says nothing for this long is probably a zombie (sleep, NAT).
      const s = this.sock
      this.detach()
      if (s) this.scheduleRetry()
    }, this.t.silenceMs)
  }

  private detach(): void {
    const s = this.sock
    this.sock = null
    if (s) {
      s.onopen = s.onclose = s.onerror = null
      s.onmessage = null
      try {
        s.close()
      } catch {
        // already closed
      }
    }
  }

  private clearTimers(): void {
    if (this.retryTimer !== null) this.timers.clear(this.retryTimer)
    if (this.silenceTimer !== null) this.timers.clear(this.silenceTimer)
    this.retryTimer = this.silenceTimer = null
  }

  private setState(s: ConnectionState): void {
    this.state = s
    this.opts.onState?.(s, this.attempt)
  }
}
