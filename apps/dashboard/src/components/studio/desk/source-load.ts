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

/** Kinds with a size and frame rate of their own in their settings (cameras). */
const SIZED_KINDS = new Set([
  'av_capture_input',
  'av_capture_input_v2',
  'macos-avcapture',
  'macos-avcapture-fast',
  'dshow_input',
  'v4l2_input',
])

/** True when the source's own settings can make it smaller or slower. */
export function hasSizeSetting(kind: string | undefined): boolean {
  return !!kind && SIZED_KINDS.has(kind)
}

/** One short line about the heaviest source, only while the Studio is actually struggling
 *  (frames missed or skipped, or drawing near its budget): a big source on a Studio that
 *  keeps up is fine, and a warning then only worries (owner, 12 Nov). Stats names the source
 *  above it, so the line doesn't (owner's pick W1, 11 Nov). */
export function loadHint(
  top: SourceRate | undefined,
  canvas: { width: number; height: number },
  struggling: boolean,
  kind?: string,
): string | null {
  if (!top || !struggling) return null
  const sized = hasSizeSetting(kind)
  const size = `${top.width}×${top.height}`
  if (top.width * top.height > canvas.width * canvas.height * 1.5)
    return sized
      ? `It sends ${size}, bigger than your ${canvas.width}×${canvas.height} picture: pick a smaller size in its settings.`
      : `It sends ${size}, bigger than your ${canvas.width}×${canvas.height} picture: hide it while you don't need it.`
  if (top.mpix > HEAVY_MPIX)
    return sized
      ? 'Pick a smaller size or frame rate in its settings.'
      : 'Make it smaller on screen, or hide it while you don’t need it.'
  return null
}
