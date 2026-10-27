// One reader of the Studio's stats for the whole dashboard: the status bar along the window's
// bottom and the Studio's own desk share it, so the engine is asked once a second however
// many parts show them. Reads stop when nothing is listening.

import { useCallback, useSyncExternalStore } from 'react'
import { type EngineStats } from '@ferrocast/api'

export interface EngineReading {
  /** The latest stats, or null while the Studio isn't running. */
  stats: EngineStats | null
  /** Upload in kbit/s, or null when not streaming. */
  kbps: number | null
  /** When the stream went live (ms), or null. */
  since: number | null
  /** When it was read (ms). */
  at: number
}

type Read = () => Promise<EngineStats>

const EMPTY: EngineReading = { stats: null, kbps: null, since: null, at: 0 }
let reading: EngineReading = EMPTY
let read: Read | null = null
let timer = 0
let last: { bytes: number; at: number } | null = null
const listeners = new Set<() => void>()

function publish(next: EngineReading) {
  reading = next
  for (const l of listeners) l()
}

async function tick() {
  const r = read
  if (!r) return
  let v: EngineStats | null = null
  try {
    v = await r()
  } catch {
    // Not running (or not reachable): the bar hides; the next read tries again.
  }
  if (read !== r) return
  const t = Date.now()
  const st = v?.stream ?? null
  let kbps = reading.kbps
  if (st && last && t > last.at) kbps = Math.round(((st.bytes - last.bytes) * 8) / (t - last.at))
  else if (!st) kbps = null
  last = st ? { bytes: st.bytes, at: t } : null
  const since = st?.active ? (reading.since ?? t) : null
  publish({ stats: v, kbps, since, at: t })
}

function start(r: Read) {
  read = r
  window.clearInterval(timer)
  void tick()
  timer = window.setInterval(() => void tick(), 1000)
}

/** Forgets the upload rate (a stream just started or ended). */
export function resetUploadRate(): void {
  last = null
  if (reading.kbps !== null) publish({ ...reading, kbps: null })
}

/**
 * The Studio's stats, read once a second while anything uses them. `get` is the engine's
 * stats call; the latest one passed is used.
 */
export function useEngineReading(get: Read | null): EngineReading {
  const subscribe = useCallback(
    (on: () => void) => {
      listeners.add(on)
      if (get && read !== get) start(get)
      return () => {
        listeners.delete(on)
        // The last one gone: stop reading (after a moment, so a part that re-renders and
        // subscribes again doesn't restart it).
        window.setTimeout(() => {
          if (listeners.size > 0) return
          window.clearInterval(timer)
          read = null
          last = null
          reading = EMPTY
        }, 0)
      }
    },
    [get],
  )
  return useSyncExternalStore(
    subscribe,
    () => reading,
    () => EMPTY,
  )
}
