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

/** Whether the show is currently running its pre-live countdown. */
export function isCountingDown(show: ShowRun | null | undefined): boolean {
  return !!show && show.phase === 'countdown' && show.countdown_ends_at !== null
}

/** Whole seconds left until `endsAt` (0 once reached); null when no deadline is set. */
export function countdownSecondsLeft(endsAt: number | null, now: number): number | null {
  if (endsAt === null) return null
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/**
 * Fixed-width mono countdown ("04:59", "00:10", or "1:05:09" past an hour) so ticking down
 * never shifts the width of the desk's on-air pill (U4).
 */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(rem)}` : `${pad(m)}:${pad(rem)}`
}

/**
 * Ticking Show countdown for the desk's on-air pill. Runs a 500 ms timer only while the Show is
 * in its `countdown` phase, and invokes `onElapsed` once past the deadline so the desk refreshes
 * even if the live socket is offline.
 */
export function useCountdownLeft(
  show: ShowRun | null | undefined,
  onElapsed?: () => void,
): { counting: boolean; left: number | null; text: string | null } {
  const counting = isCountingDown(show)
  const endsAt = show?.countdown_ends_at ?? null
  const showId = show?.id ?? null
  const [now, setNow] = useState(() => Date.now())
  const onElapsedRef = useRef(onElapsed)
  onElapsedRef.current = onElapsed
  const refreshedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!counting) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [counting, showId])
  useEffect(() => {
    if (!counting || endsAt === null || !showId) return
    if (now >= endsAt + 600 && refreshedFor.current !== showId) {
      refreshedFor.current = showId
      onElapsedRef.current?.()
    }
  }, [counting, endsAt, showId, now])
  if (!counting || endsAt === null) return { counting: false, left: null, text: null }
  const left = countdownSecondsLeft(endsAt, now)
  return { counting: true, left, text: left === null ? null : formatCountdown(left) }
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
