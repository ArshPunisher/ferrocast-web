// The overlay page's single WebSocket (R-38): parse every frame, wait for the snapshot,
// drop duplicates, say hello with the last seq after each reconnect, and tell the server
// when OBS hides the source so nothing is sent or animated off screen.

import { helloFrame, parseOverlayFrame, visibilityFrame } from '@ferrocast/api/overlay-protocol'
import { ReconnectingSocket, type ConnectionState, type SocketFactory } from '@ferrocast/api/socket'
import { warnOnce } from './dom'
import type { OverlayRuntime } from './runtime'

/** Close codes that mean "this overlay URL is gone" (docs/API-REQUESTS.md R18). */
export const REVOKED_CLOSE_CODES = new Set([4401, 4404])
/** Acks kept while the socket is down, flushed after the next hello. */
export const MAX_PENDING_ACKS = 20

export interface ConnectOptions {
  url: string
  factory?: SocketFactory
  onState?: (s: ConnectionState) => void
  /** Overrides for tests. */
  tuning?: { baseMs?: number; maxMs?: number; silenceMs?: number }
}

export interface OverlayConnection {
  /** Highest frame seq seen; sent as `since_seq` on reconnect. */
  readonly lastSeq: number
  setVisible(visible: boolean): void
  stop(): void
}

/** Wires a runtime to a socket. The runtime's `send` should call `conn.send` (see main.ts). */
export function connectOverlay(
  runtime: OverlayRuntime,
  opts: ConnectOptions,
  bindSend: (send: (data: string) => boolean) => void,
): OverlayConnection {
  let lastSeq = 0
  let connSeq = -1 // per connection: -1 until this connection's snapshot
  let visible = true
  let pending: string[] = []
  const sock = new ReconnectingSocket({
    url: () => opts.url,
    factory: opts.factory ?? ((u) => new WebSocket(u) as unknown as ReturnType<SocketFactory>),
    tuning: { silenceMs: 0, ...opts.tuning },
    onState: (s) => {
      if (s !== 'open') connSeq = -1
      opts.onState?.(s)
    },
    onOpen: (send) => {
      connSeq = -1
      send(helloFrame(lastSeq))
      if (!visible) send(visibilityFrame(false))
      // Acks from while we were offline: the engine still waits on them.
      const queued = pending
      pending = []
      for (const a of queued) send(a)
    },
    onClose: (code) => {
      if (!REVOKED_CLOSE_CODES.has(code)) return
      // The token is unknown (regenerated while we were offline): same as a revoked frame.
      runtime.apply({ v: 1, seq: lastSeq, type: 'revoked', data: {} })
      return 'stop'
    },
    onMessage: (raw) => {
      const f = parseOverlayFrame(raw)
      if (!f) {
        warnOnce('dropped a malformed or unknown frame')
        return
      }
      if (f.type === 'snapshot') connSeq = f.seq
      else if (f.type === 'revoked') connSeq = Math.max(connSeq, f.seq)
      else if (connSeq < 0)
        return // nothing before this connection's snapshot
      else if (f.seq <= connSeq)
        return // duplicate or replayed frame
      else connSeq = f.seq
      lastSeq = Math.max(lastSeq, f.seq)
      runtime.apply(f)
      // A revoked URL never comes back: stop for good instead of knocking forever.
      if (f.type === 'revoked' || runtime.revoked) sock.stop()
    },
  })
  bindSend((d) => {
    if (sock.send(d)) return true
    if (d.includes('"type":"ack"') && !runtime.revoked) {
      pending.push(d)
      if (pending.length > MAX_PENDING_ACKS) pending.shift()
    }
    return false
  })
  sock.start()
  return {
    get lastSeq() {
      return lastSeq
    },
    setVisible(v) {
      if (v === visible) return
      visible = v
      runtime.setVisible(v)
      sock.send(visibilityFrame(v))
    },
    stop() {
      sock.stop()
    },
  }
}

interface ObsWindow {
  obsstudio?: unknown
}

/**
 * Follows OBS source visibility (`obsSourceVisibleChanged` / `obsSourceActiveChanged`,
 * detail.visible / detail.active) and the page's own visibility. Returns a cleanup.
 */
export function watchVisibility(onChange: (visible: boolean) => void): () => void {
  let obsVisible = true
  let obsActive = true
  const compute = () => onChange(obsVisible && obsActive && document.visibilityState !== 'hidden')
  const onVisible = (e: Event) => {
    const d = (e as CustomEvent<{ visible?: unknown }>).detail
    if (d && typeof d.visible === 'boolean') obsVisible = d.visible
    compute()
  }
  const onActive = (e: Event) => {
    const d = (e as CustomEvent<{ active?: unknown }>).detail
    if (d && typeof d.active === 'boolean') obsActive = d.active
    compute()
  }
  window.addEventListener('obsSourceVisibleChanged', onVisible)
  window.addEventListener('obsSourceActiveChanged', onActive)
  document.addEventListener('visibilitychange', compute)
  if ((window as ObsWindow).obsstudio) compute()
  return () => {
    window.removeEventListener('obsSourceVisibleChanged', onVisible)
    window.removeEventListener('obsSourceActiveChanged', onActive)
    document.removeEventListener('visibilitychange', compute)
  }
}
