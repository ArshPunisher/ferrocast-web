// The stream doctor's one-click fixes (29 Oct): the status bar already says why the stream is
// struggling (late frames, a busy encoder, an upload that can't keep up); each cause offers the
// lightest change that helps, worked out here from the Studio's settings.

import type { StudioSettings } from '@ferrocast/api'

export type Strain = 'render' | 'encode' | 'network'

export interface Fix {
  /** The button's words. A new bitrate reaches the stream on air at once; the encoder and
   * its size wait for the next start, and the words say so. */
  label: string
  patch: Partial<StudioSettings>
  /** Said once it's done. */
  done: string
}

/** Below this the picture breaks up: never stepped lower by a fix. */
export const LOWEST_KBPS = 2500

/** A quarter less, in steps of 250 kbps, never below the lowest that still looks right. */
export function lighterKbps(kbps: number): number | null {
  if (!Number.isFinite(kbps) || kbps <= LOWEST_KBPS) return null
  return Math.max(LOWEST_KBPS, Math.floor((kbps * 0.75) / 250) * 250)
}

/** 720p: the short side 720 (720×1280 for a tall picture), the same shape, even sides
 * (encoders need them). */
export function lighterScale(canvas: { width: number; height: number }): [number, number] | null {
  const short = Math.min(canvas.width, canvas.height)
  if (!(short > 0) || short <= 720) return null
  const even = (v: number) => Math.round((v * 720) / short / 2) * 2
  return [even(canvas.width), even(canvas.height)]
}

/**
 * The fix for what's straining, or null when there's nothing lighter to offer (the words in
 * the status bar then say what to do by hand). `live`: the canvas (frame rate) can't change
 * while live or recording, so render trouble has no fix then.
 */
export function doctorFix(
  what: Strain,
  s: StudioSettings,
  canvas: { width: number; height: number },
  live: boolean,
): Fix | null {
  if (what === 'network') {
    const k = lighterKbps(s.video_kbps)
    return k === null
      ? null
      : { label: 'Lower bitrate', patch: { video_kbps: k }, done: `Bitrate lowered to ${k} kbps.` }
  }
  if (what === 'encode') {
    if (s.encoder === 'software')
      return {
        label: 'Use the graphics card',
        patch: { encoder: 'hardware' },
        done: 'Encoding moves to the graphics card when the stream next starts.',
      }
    const scale = s.scale ? null : lighterScale(canvas)
    if (scale)
      return {
        label: 'Send 720p',
        patch: { scale },
        done: `The stream is sent at ${scale[0]}×${scale[1]} when it next starts.`,
      }
    const k = lighterKbps(s.video_kbps)
    return k === null
      ? null
      : { label: 'Lower bitrate', patch: { video_kbps: k }, done: `Bitrate lowered to ${k} kbps.` }
  }
  if (live || s.fps <= 30) return null
  return { label: 'Use 30 fps', patch: { fps: 30 }, done: 'The picture runs at 30 fps.' }
}
