// "What's slowing my stream?": how many pictures each source sends the engine a second, and how
// big they are, from two reads of the Studio's stats. The heaviest source gets one plain hint.

import { type EngineStats } from '@ferrocast/api'

type Load = NonNullable<EngineStats['sources']>[number]

export interface SourceRate {
  name: string
  fps: number
  width: number
  height: number
  /** Millions of pixels a second it hands the engine. */
  mpix: number
}

/** Each source's rate between two reads `ms` apart, the heaviest first (still ones left out). */
export function sourceRates(prev: readonly Load[], cur: readonly Load[], ms: number): SourceRate[] {
  if (ms <= 0) return []
  const before = new Map(prev.map((l) => [l.name, l.sent]))
  const out: SourceRate[] = []
  for (const l of cur) {
    const was = before.get(l.name)
    // New since the last read, or started again (its count went back): next time.
    if (was === undefined || l.sent < was) continue
    const fps = ((l.sent - was) * 1000) / ms
    if (fps < 0.5 || !l.width || !l.height) continue
    out.push({ ...l, fps, mpix: (fps * l.width * l.height) / 1e6 })
  }
  return out.sort((a, b) => b.mpix - a.mpix)
}

/** About 1080p at 60 fps: above this one source alone is a real load. */
const HEAVY_MPIX = 120

/** One short line about the heaviest source when it's worth saying, else null. Stats names
 *  the source above it, so the line doesn't (owner's pick W1, 11 Nov). */
export function loadHint(
  top: SourceRate | undefined,
  canvas: { width: number; height: number },
): string | null {
  if (!top) return null
  const size = `${top.width}×${top.height}`
  if (top.width * top.height > canvas.width * canvas.height * 1.5)
    return `It sends ${size}, bigger than your ${canvas.width}×${canvas.height} picture: set it to ${canvas.width}×${canvas.height}.`
  if (top.mpix > HEAVY_MPIX) return 'Lower its size or frame rate if the stream stutters.'
  return null
}
