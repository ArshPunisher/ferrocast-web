// Live meter levels without React: one shared poller per (engine, set of sounds) writes the
// latest levels into a plain object, and one requestAnimationFrame loop draws every meter from
// it with direct style writes. Nothing here sets React state per tick.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { EngineLevel } from '@ferrocast/api'
import type { EngineApi } from './common'

/** Gap between the end of one levels request and the next: about 30 requests a second. */
export const POLL_MS = 33
/** Levels older than this are treated as silence (the engine stopped or stalled). */
export const STALE_MS = 1000
/**
 * A sound whose level has not changed at all for this long while the engine keeps answering is
 * not live: a real signal always moves a little. It is shown as silent and not connected, not as
 * a bar frozen where the device stopped (an unplugged USB sound kept its last level).
 */
export const FROZEN_MS = 5000

export type LevelStatus = 'connecting' | 'connected' | 'disconnected'

export interface LevelFeed {
  get(name: string): EngineLevel | undefined
  status?(name: string): LevelStatus
  /** The engine is answering but this sound is missing or repeating one level: no live signal. */
  lost?(name: string): boolean
  seq?(): number
  busy?(): boolean
  subscribe(fn: () => void): () => void
}

interface Entry {
  feed: LevelFeed
  refs: number
  stop: () => void
}

const feeds = new WeakMap<object, Map<string, Entry>>()

function startFeed(api: EngineApi, list: string[]): { feed: LevelFeed; stop: () => void } {
  let latest: Record<string, EngineLevel> = {}
  let at = 0
  let hasData = false
  let settled = false
  let seq = 0
  let erroredWhileStale = false
  const subs = new Set<() => void>()
  let alive = true
  let busy = false
  let timer = 0
  const isStale = () => !hasData || performance.now() - at > STALE_MS
  // When each sound's numbers last changed, to tell a live level from one the engine repeats.
  const moved = new Map<string, { sig: string; since: number }>()
  const frozen = (name: string): boolean => {
    const m = moved.get(name)
    const l = latest[name]
    if (!m || !l) return false
    // Digital silence is legitimately constant.
    if (Math.max(l.peak[0], l.peak[1]) <= -90) return false
    return at - m.since >= FROZEN_MS
  }
  const feed: LevelFeed = {
    get: (name) => (isStale() || frozen(name) ? undefined : latest[name]),
    status: (name) => {
      if (!settled && !hasData) return 'connecting'
      if (isStale()) return 'disconnected'
      if (frozen(name)) return 'disconnected'
      return Object.prototype.hasOwnProperty.call(latest, name) ? 'connected' : 'disconnected'
    },
    lost: (name) =>
      hasData &&
      !isStale() &&
      (!Object.prototype.hasOwnProperty.call(latest, name) || frozen(name)),
    seq: () => seq,
    busy: () => busy,
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
  const notify = () => subs.forEach((f) => f())
  const next = () => {
    if (alive && !document.hidden) timer = window.setTimeout(() => void tick(), POLL_MS)
  }
  const tick = async () => {
    if (!alive || document.hidden || busy) return
    busy = true
    try {
      const v = await api.levels(list, 'fast')
      if (alive) {
        settled = true
        hasData = true
        seq++
        erroredWhileStale = false
        latest = v
        at = performance.now()
        for (const [name, l] of Object.entries(v)) {
          const sig = `${l.peak[0]},${l.peak[1]},${l.magnitude[0]},${l.magnitude[1]},${l.input_peak?.[0]},${l.input_peak?.[1]}`
          const was = moved.get(name)
          if (!was || was.sig !== sig) moved.set(name, { sig, since: at })
        }
        for (const name of [...moved.keys()]) if (!(name in v)) moved.delete(name)
        notify()
      }
    } catch {
      // Stopped or busy: the next tick tries again; notify once when transitioning disconnected.
      if (alive) {
        settled = true
        if (isStale() && !erroredWhileStale) {
          erroredWhileStale = true
          notify()
        }
      }
    } finally {
      busy = false
      next()
    }
  }
  const onVisible = () => {
    clearTimeout(timer)
    if (!document.hidden && alive) void tick()
  }
  document.addEventListener('visibilitychange', onVisible)
  if (!document.hidden) void tick()
  return {
    feed,
    stop: () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}

/** The shared feed for these sounds (a stable object while the list is the same). */
export function useLevelFeed(api: EngineApi, names: string[]): LevelFeed {
  const key = names.join('\n')
  const idle = useMemo<LevelFeed>(
    () => ({
      get: () => undefined,
      status: () => 'connecting',
      subscribe: () => () => {},
    }),
    [],
  )
  const [feed, setFeed] = useState<LevelFeed>(idle)
  useEffect(() => {
    if (!key) {
      setFeed(idle)
      return
    }
    let byKey = feeds.get(api)
    if (!byKey) feeds.set(api, (byKey = new Map()))
    let e = byKey.get(key)
    if (!e) {
      const s = startFeed(api, key.split('\n'))
      byKey.set(key, (e = { feed: s.feed, refs: 0, stop: s.stop }))
    }
    e.refs++
    setFeed(e.feed)
    const mine = e
    return () => {
      if (--mine.refs === 0) {
        mine.stop()
        byKey.delete(key)
      }
    }
  }, [api, key, idle])
  return feed
}

/** Subscribes to connection state transitions for a single source without re-rendering per sample. */
export function useLevelStatus(feed: LevelFeed, name: string | null): LevelStatus {
  const get = useCallback<() => LevelStatus>(
    () =>
      name
        ? feed.status
          ? feed.status(name)
          : feed.get(name)
            ? 'connected'
            : 'connecting'
        : 'connecting',
    [feed, name],
  )
  return useSyncExternalStore(feed.subscribe, get, get)
}

/** Whether this sound has no live signal while the others do (not plugged in, or frozen). */
export function useSourceLost(feed: LevelFeed, name: string | null): boolean {
  const get = useCallback<() => boolean>(
    () => (name && feed.lost ? feed.lost(name) : false),
    [feed, name],
  )
  return useSyncExternalStore(feed.subscribe, get, get)
}

// ---- Ballistics (pure, so they can be tested) ----

export const FLOOR = -100
/** Release time constant at OBS's "fast" decay; slower decays scale it up. */
export const RELEASE_MS = 300
/** The attack: close to instant, but not a one-frame jump. */
export const ATTACK_MS = 25
/** The peak tick holds this long, then falls at HOLD_FALL dB/s. */
export const HOLD_MS = 1500
export const HOLD_FALL = 20

export interface MeterState {
  level: number
  hold: number
  holdAt: number
}
export const initialMeter = (): MeterState => ({ level: FLOOR, hold: FLOOR, holdAt: 0 })

/** One frame: fast attack, exponential release (`rate` is the dB/s setting, `fastRate` its fast
 * value, so a slower setting releases proportionally slower), a peak tick that holds then decays. */
export function stepMeter(
  s: MeterState,
  target: number,
  dtMs: number,
  nowMs: number,
  rate: number,
  fastRate: number,
): MeterState {
  const dt = Math.max(0, Math.min(dtMs, 250))
  let level = s.level
  if (target > level) {
    level += (target - level) * (1 - Math.exp(-dt / ATTACK_MS))
    if (target - level < 0.1) level = target
  } else {
    const tau = RELEASE_MS * (fastRate / Math.max(1, rate))
    level = target + (level - target) * Math.exp(-dt / tau)
    if (level - target < 0.1) level = target
  }
  let { hold, holdAt } = s
  if (target >= hold) {
    hold = target
    holdAt = nowMs
  } else if (nowMs - holdAt > HOLD_MS) {
    hold = Math.max(target, hold - (HOLD_FALL * dt) / 1000)
  }
  return { level, hold, holdAt }
}

// ---- One animation loop for every meter ----

const frames = new Set<(now: number) => void>()
let raf = 0
function loop(now: number) {
  raf = 0
  frames.forEach((f) => f(now))
  if (frames.size) raf = requestAnimationFrame(loop)
}
/** Calls `fn` every animation frame until the returned function is called. */
export function onFrame(fn: (now: number) => void): () => void {
  frames.add(fn)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => {
    frames.delete(fn)
    if (!frames.size && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}

/** How many frame callbacks are registered (for tests). */
export const activeMeters = (): number => frames.size

export function useLatest<T>(v: T): { current: T } {
  const r = useRef(v)
  r.current = v
  return r
}
