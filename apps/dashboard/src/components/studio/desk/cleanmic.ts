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
