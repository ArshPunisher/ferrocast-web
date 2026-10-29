// Live captions (plan item 7): what the card shows, and the text box that shows them on stream.

import type { EngineCaptions, NewEngineSource } from '@ferrocast/api'

/** The text source the Mac app writes captions into (its name is the link). */
export const CAPTIONS_SOURCE = 'Captions'

/** Which part of the card to show. */
export type CaptionsStep = 'elsewhere' | 'ask' | 'blocked' | 'ready'

export function captionsStep(c: Pick<EngineCaptions, 'access'>): CaptionsStep {
  switch (c.access) {
    case 'allowed':
      return 'ready'
    case 'not_asked':
      return 'ask'
    case 'denied':
    case 'restricted':
      return 'blocked'
    default:
      return 'elsewhere'
  }
}

/** The mic to listen to: the one on now, else the first Pre-flight mic that's here, else any. */
export function pickMic(
  on: string | null,
  mics: string[],
  preferred: string[] = [],
): string | null {
  if (on && mics.includes(on)) return on
  return preferred.find((m) => mics.includes(m)) ?? mics[0] ?? null
}

/**
 * A captions box along the bottom of a `width`×`height` canvas: white, outlined, wrapped
 * at 80% of the width, its top left at 10% in and 80% down.
 */
export function captionsBox(
  width: number,
  height: number,
): { source: NewEngineSource; x: number; y: number } {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  // Big enough to read on a phone: about 1/20 of the short side.
  const size = Math.max(24, Math.round(Math.min(w, h) / 20))
  return {
    source: {
      kind: 'text_ft2_source_v2',
      name: CAPTIONS_SOURCE,
      settings: {
        text: 'Captions show here',
        font: { face: 'Helvetica', style: 'Bold', size, flags: 1 },
        color1: 0xffffffff,
        color2: 0xffffffff,
        outline: true,
        drop_shadow: true,
        word_wrap: true,
        custom_width: Math.round(w * 0.8),
      },
    },
    x: Math.round(w * 0.1),
    y: Math.round(h * 0.8),
  }
}

/** What Whisper is offered in, as the engine accepts them (`WHISPER_LANGUAGES`). */
export const WHISPER_LANGUAGES: { code: string; name: string }[] = [
  { code: 'auto', name: 'Any (it works it out)' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'tr', name: 'Turkish' },
]

/** Whether captions can be switched on with this engine now: the Mac's needs its permission,
 * Whisper its model downloaded. */
export function canListen(
  engine: 'apple' | 'whisper',
  step: CaptionsStep,
  model: { state: string } | undefined,
): boolean {
  return engine === 'apple' ? step === 'ready' : model?.state === 'ready'
}
