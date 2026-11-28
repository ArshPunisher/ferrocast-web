// How the Stats "Frame rate" panel reads the engine's last minute of missed frames: the colour
// it shows and the reason it gives. All the thresholds live here, in FRAME_HEALTH.

import { type EngineStats } from '@ferrocast/api'

type Recent = NonNullable<EngineStats['engine']['missed_recent']>

/**
 * The thresholds, in one place.
 *
 * - Calm (normal colour): no frame missed or skipped in the last 60 s.
 * - A short dip (amber): some were, but at most `stillFrames - 1` in the last `stillSeconds`
 *   seconds, so it is over or nearly so (a window resize, a source starting).
 * - Still happening (red): `stillFrames` or more in the last `stillSeconds` seconds.
 *
 * Old hiccups age out by themselves: a burst more than 60 s ago counts for nothing.
 */
export const FRAME_HEALTH = {
  /** The engine's window, in seconds (`missed_recent.window_s`). */
  windowSeconds: 60,
  /** "Now": this many of the newest seconds. */
  stillSeconds: 10,
  /** This many frames inside "now" is red; fewer is a dip. */
  stillFrames: 3,
  /** Without `missed_recent` (an older engine): the share of all frames since the start that
   * turns the totals red, as before. */
  legacyShare: 0.01,
} as const

export type FrameLevel = 'ok' | 'warn' | 'bad'

/** Why frames were missed, in the order a tie is settled. */
export type MissCause = 'drawing' | 'encoder' | 'upload' | 'resize'

export interface MissRead {
  /** Colour for the panel: from the last 60 s. */
  level: FrameLevel
  /** Missed (drawn late, or the encoder held the loop back) and skipped (an encoder left out)
   * in the last 60 s. */
  missed: number
  skipped: number
  /** The main reason, null when calm. */
  cause: MissCause | null
  /** Every cause with frames behind it, the main one first: for the (i). */
  causes: { cause: MissCause; frames: number }[]
  /** Missed plus skipped each second, oldest first: the sparkline (empty from older engines). */
  perSecond: number[]
  /** False from an older engine: the colours then come from the totals since the start. */
  recent: boolean
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** The level from a minute of per-second counts. */
export function levelFrom(perSecond: number[]): FrameLevel {
  if (sum(perSecond) === 0) return 'ok'
  const now = sum(perSecond.slice(-FRAME_HEALTH.stillSeconds))
  return now >= FRAME_HEALTH.stillFrames ? 'bad' : 'warn'
}

/**
 * The main reason frames were missed in the last minute, from the engine's counters:
 * - Window resize: at least half of the loop's misses happened during a window or divider
 *   resize, and those outnumber the frames an encoder skipped.
 * - Drawing fell behind: `render` (the scene took too long to draw).
 * - Encoder overloaded: `encode` (the encoders held the loop back) plus `skipped` (they left
 *   frames out), while the upload was fine.
 * - Upload too slow: the same, while the upload struggled in the minute (a full upload backs
 *   the encoder up, so the encoder's trouble is the line's).
 */
export function causesOf(r: Recent): { cause: MissCause; frames: number }[] {
  const loop = r.render + r.encode
  const encoderSide = r.encode + r.skipped
  const list: { cause: MissCause; frames: number }[] = [
    { cause: 'drawing', frames: r.render },
    { cause: 'encoder', frames: r.upload_trouble ? 0 : encoderSide },
    { cause: 'upload', frames: r.upload_trouble ? encoderSide : 0 },
  ]
  const sorted = list.filter((c) => c.frames > 0).sort((a, b) => b.frames - a.frames)
  if (r.resize > 0 && r.resize * 2 >= loop && loop >= r.skipped) {
    return [{ cause: 'resize', frames: r.resize }, ...sorted]
  }
  return sorted
}

/** Reads the engine's stats into what the panel shows. */
export function readMisses(e: EngineStats['engine']): MissRead {
  const r = e.missed_recent
  if (!r) {
    const bad = e.frames > 0 && e.lagged / e.frames > FRAME_HEALTH.legacyShare
    const skippedBad =
      (e.encoded ?? 0) > 0 && (e.skipped ?? 0) / (e.encoded ?? 1) > FRAME_HEALTH.legacyShare
    return {
      level: bad || skippedBad ? 'bad' : 'ok',
      missed: e.lagged,
      skipped: e.skipped ?? 0,
      cause: null,
      causes: [],
      perSecond: [],
      recent: false,
    }
  }
  const perSecond = r.per_second.slice(-FRAME_HEALTH.windowSeconds)
  const causes = causesOf(r)
  return {
    level: levelFrom(perSecond),
    missed: r.render + r.encode,
    skipped: r.skipped,
    cause: causes[0]?.cause ?? null,
    causes,
    perSecond,
    recent: true,
  }
}

/** The few words for a cause. */
export const CAUSE_TEXT: Record<MissCause, string> = {
  drawing: 'Drawing fell behind',
  encoder: 'Encoder overloaded',
  upload: 'Upload too slow',
  resize: 'Window resize',
}

/** What to do about it, behind the (i). */
export const CAUSE_FIX: Record<MissCause, string> = {
  drawing: 'The computer drew frames late. Use fewer or smaller sources, or a lower frame rate.',
  encoder: 'The encoder fell behind. Lower the quality or resolution, or use the hardware encoder.',
  upload:
    'The connection could not carry the stream, which backed the encoder up. Lower the bitrate, or turn on Auto quality.',
  resize: 'Resizing the window or a divider holds the picture back for a moment. It passes.',
}

/** The tone a box takes: its own count must be above zero, or it stays normal. */
export function boxLevel(level: FrameLevel, count: number): FrameLevel {
  return count > 0 ? level : 'ok'
}
