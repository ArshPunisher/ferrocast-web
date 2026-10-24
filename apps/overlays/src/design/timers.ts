// The timers on this page, so a sound element can tick in the last ten seconds and play its
// sound at zero. A countdown text layer reports when it ends while it runs on air, and takes
// itself out when it stops; one overlay page is one screen, so "a timer on this screen" is
// any timer here.

const ends = new Map<string, number>()

/** A countdown on this page ends at `at` (ms), or no longer runs (`null`). */
export function reportTimer(id: string, at: number | null): void {
  if (at === null || !Number.isFinite(at)) ends.delete(id)
  else ends.set(id, at)
}

/**
 * The end of the timer to follow: the next one still to come, else the one that ended last
 * (so zero can still be heard a moment after it), else null.
 */
export function timerEnd(now = Date.now()): number | null {
  let next: number | null = null
  let last: number | null = null
  for (const at of ends.values()) {
    if (at > now) next = next === null ? at : Math.min(next, at)
    else last = last === null ? at : Math.max(last, at)
  }
  return next ?? last
}

/** Tests start from an empty page. */
export function clearTimers(): void {
  ends.clear()
}
