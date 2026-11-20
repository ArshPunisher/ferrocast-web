// A show with an ending keeps streaming for `stop_delay_s` after End stream (Full show: its
// ending scene and thank-you play first). Until the engine stops it, the desk says so and
// offers "Stop now" (S18 B1: it read as a stuck stream, 30 s of nothing on screen).

import { useEffect, useRef, useState } from 'react'
import type { ShowRun } from '@ferrocast/api'

/** Whether the show is ending with its stop still waiting, and the stream still on. */
export function isEnding(show: ShowRun | null | undefined, on: boolean): boolean {
  return (
    on &&
    !!show &&
    show.phase === 'ended' &&
    show.steps.some((s) => s.id === 'stop_stream' && s.status === 'waiting')
  )
}

/**
 * Whole seconds left before the engine stops the stream: from when the show ended (the engine's
 * clock) or when this page first saw it end (its own), whichever says less, so a clock that's
 * off never shows more than the delay. Null when the delay isn't known.
 */
export function secondsLeft(
  endedAt: number | null,
  delayS: number | null,
  seenAt: number,
  now: number,
): number | null {
  if (delayS === null) return null
  const deadline = Math.min(seenAt, endedAt ?? seenAt) + delayS * 1000
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

/** The seconds left, ticking, while the show is ending; null when it isn't (or the delay is unknown). */
export function useEndingLeft(
  show: ShowRun | null | undefined,
  on: boolean,
  delayS: number | null,
): { ending: boolean; left: number | null } {
  const ending = isEnding(show, on)
  const seen = useRef<{ id: string; at: number } | null>(null)
  if (ending && show && seen.current?.id !== show.id) seen.current = { id: show.id, at: Date.now() }
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ending) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [ending])
  if (!ending || !show) return { ending: false, left: null }
  return { ending, left: secondsLeft(show.ended_at, delayS, seen.current?.at ?? now, now) }
}
