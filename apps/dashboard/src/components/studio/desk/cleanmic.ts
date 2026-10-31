// One-click "clean mic" (plan item 5, 29 Oct): the filters a voice usually needs, in the order
// they work best (noise out, then the level evened, then a ceiling), set up together; and a
// plain verdict on the level while talking, read from the live meter.

import type { NewEngineSource } from '@ferrocast/api'

/** The chain, each with the kinds that already count as it (OBS's older noise filter too). */
export const CLEAN_MIC: { as: string[]; add: NewEngineSource }[] = [
  {
    as: ['noise_suppress_filter_v2', 'noise_suppress_filter', 'noise_gate_filter'],
    add: {
      kind: 'noise_suppress_filter_v2',
      name: 'Remove background noise',
      settings: { method: 'rnnoise' },
    },
  },
  {
    as: ['compressor_filter', 'expander_filter', 'upward_compressor_filter'],
    add: {
      kind: 'compressor_filter',
      name: 'Even out loud moments',
      // A voice's usual: 4:1 from -20 dB, quick to catch a shout, back up for the next word.
      settings: { ratio: 4, threshold: -20, attack_time: 6, release_time: 60, output_gain: 2 },
    },
  },
  {
    as: ['limiter_filter'],
    add: {
      kind: 'limiter_filter',
      name: 'Stop clipping',
      settings: { threshold: -3, release_time: 60 },
    },
  },
]

/** The filters still to add, in order (the ones it has already stay as they are). */
export function cleanMicPlan(has: readonly string[]): NewEngineSource[] {
  return CLEAN_MIC.filter((c) => !c.as.some((k) => has.includes(k))).map((c) => c.add)
}

/** A name that isn't taken yet ("Stop clipping 2"). */
export function freeName(name: string, taken: readonly string[]): string {
  let n = name
  for (let i = 2; taken.includes(n); i++) n = `${name} ${i}`
  return n
}

export type Verdict = 'quiet' | 'good' | 'loud'

/** Below this it's silence between words, not talking. */
const TALKING_DB = -50

/**
 * How the voice sits, from recent peak readings (dB): too loud once it nears 0 dB (it clips),
 * too quiet when most of the talking (its middle reading) stays under -24 dB, otherwise good. Null until there's
 * been enough talking to tell (silence doesn't count).
 */
export function voiceVerdict(peaks: readonly number[]): Verdict | null {
  const talk = peaks.filter((p) => Number.isFinite(p) && p > TALKING_DB).sort((a, b) => a - b)
  if (talk.length < 10) return null
  if ((talk[talk.length - 1] ?? -Infinity) > -1) return 'loud'
  const middle = talk[Math.floor(talk.length / 2)] ?? -Infinity
  return middle < -24 ? 'quiet' : 'good'
}

export const VERDICT_WORDS: Record<Verdict, string> = {
  quiet: 'Too quiet: raise the volume or move closer to the mic.',
  good: 'Sounds good.',
  loud: 'Too loud: it clips. Lower the volume or the mic’s gain.',
}

/** A voice's colour: one equaliser ("Voice style") set three ways; Natural takes it off. */
export type VoiceStyle = 'natural' | 'radio' | 'podcast'

export const VOICE_FILTER = 'Voice style'

/** Bass, middle and treble in dB (OBS's 3-band equaliser). */
export const VOICE_STYLES: Record<
  Exclude<VoiceStyle, 'natural'>,
  { low: number; mid: number; high: number }
> = {
  // Fuller and warmer, like a radio host close to the mic.
  radio: { low: 4, mid: 2, high: -1 },
  // Less boom, more clarity on the words.
  podcast: { low: -2, mid: 1, high: 3 },
}

/** Which style the equaliser's values are (natural when there's none or they match no style). */
export function voiceStyleOf(eq: { low?: number; mid?: number; high?: number } | null): VoiceStyle {
  if (!eq) return 'natural'
  for (const [style, v] of Object.entries(VOICE_STYLES) as [
    VoiceStyle,
    typeof VOICE_STYLES.radio,
  ][])
    if (eq.low === v.low && eq.mid === v.mid && eq.high === v.high) return style
  return 'natural'
}

/** "Lower it when I talk": OBS's compressor keyed to the mic, so music or a game drops while
 * you speak and comes back after. */
export const DUCK_FILTER = 'Lower when I talk'

export function duckFilter(mic: string): NewEngineSource {
  return {
    kind: 'compressor_filter',
    name: DUCK_FILTER,
    // Strong and quick to drop (20:1 from -32 dB, 10 ms), slow to come back (0.6 s) so it
    // doesn't pump between words.
    settings: {
      ratio: 20,
      threshold: -32,
      attack_time: 10,
      release_time: 600,
      output_gain: 0,
      sidechain_source: mic,
    },
  }
}

/** The mic to duck under: the first microphone among the sounds, never the sound itself. */
export function duckMic(
  sounds: readonly { name: string; kind: string }[],
  self: string,
  micKinds: ReadonlySet<string>,
): string | null {
  return sounds.find((s) => s.name !== self && micKinds.has(s.kind))?.name ?? null
}
