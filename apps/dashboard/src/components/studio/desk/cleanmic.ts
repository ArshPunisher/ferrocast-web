// One-click "clean mic" (plan item 5, 29 Oct): the filters a voice usually needs, in the order
// they work best (noise out, then the level evened, then a ceiling), set up together; and a
// plain verdict on the level while talking, read from the live meter.

import type { NewEngineSource } from '@ferrocast/api'

/** Where a voice's loudest moments should sit after the mic level step (dB below full scale). */
export const VOICE_TARGET_DB = -12

/**
 * The most the mic level step ever adds. OBS's Gain goes to +30 dB, but a step that big on a
 * mic in a noisy room (a fan counted as talking) left the fan 11 dB under the voice (S32: +20 dB
 * gave pauses at -25.8 dBFS, +10 dB at -43.3), so it stops at +15.
 */
export const MAX_MIC_GAIN_DB = 15

export const MIC_LEVEL_FILTER = 'Raise a quiet mic'

/**
 * The chain, each with the kinds that already count as it (OBS's older noise filter too).
 * The numbers are measured (S31/S32, 20 Nov, a voice captured from a mic through each chain): at a
 * normal level the old 4:1 from -20 dB with +2 dB never touched speech (-19.7 LUFS); 3:1 from -26
 * dB with +9 dB gives -16.3 LUFS and -2.4 dBFS in the file. The noise step stays as it was: at
 * strength 40 (what it means) it took 14 dB off a fan, 25 only 10 dB, and neither cost normal
 * speech more than the other; a noise gate after it cut soft words completely.
 */
export const CLEAN_MIC: { as: string[]; add: NewEngineSource }[] = [
  {
    as: [
      'noise_suppress_filter_v2',
      'noise_suppress_filter',
      'noise_gate_filter',
      'ferrocast_deepfilter',
    ],
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
      // 3:1 from -26 dB (it acts on speech at a normal level), quick to catch a shout, 150 ms
      // back up for the next word, and +9 dB to bring the evened voice to about -16 LUFS.
      settings: { ratio: 3, threshold: -26, attack_time: 8, release_time: 150, output_gain: 9 },
    },
  },
  {
    as: ['limiter_filter'],
    add: {
      kind: 'limiter_filter',
      name: 'Stop clipping',
      // -3 dB, not higher: the recording's AAC overshot a -1.5 dB ceiling by 2.9 dB.
      settings: { threshold: -3, release_time: 60 },
    },
  },
]

/**
 * Where a voice's peaks usually sit while it talked (dB): the 60th percentile of the readings
 * above silence, or null until there's been enough talking. Not the middle: in a noisy room the
 * fan's low peaks count as talking and drag a median down (a captured voice read -31.7 dB against
 * the voice's own -27), so the step asked for too much.
 */
export function voiceUsualPeak(peaks: readonly number[]): number | null {
  const talk = peaks.filter((p) => Number.isFinite(p) && p > TALKING_DB).sort((a, b) => a - b)
  if (talk.length < 10) return null
  return talk[Math.min(talk.length - 1, Math.floor(talk.length * 0.6))] ?? null
}

/**
 * How many dB the mic level step adds so the voice's usual peak sits at -12 dB: nothing when it
 * already does or is louder, at most +15. Null until there's been enough talking to tell.
 */
export function micGainDb(peaks: readonly number[]): number | null {
  const usual = voiceUsualPeak(peaks)
  if (usual === null) return null
  return Math.round(Math.min(MAX_MIC_GAIN_DB, Math.max(0, VOICE_TARGET_DB - usual)))
}

/** The filters still to add, in order (the ones it has already stay as they are). */
export function cleanMicPlan(
  has: readonly string[],
  opts: { gainDb?: number | null } = {},
): NewEngineSource[] {
  const plan = CLEAN_MIC.filter((c) => !c.as.some((k) => has.includes(k))).map((c) => c.add)
  const gain = opts.gainDb ?? 0
  if (gain >= 1 && !has.includes('gain_filter')) {
    // First in the chain (the caller moves it to the top): the level the rest works on.
    plan.unshift({ kind: 'gain_filter', name: MIC_LEVEL_FILTER, settings: { db: gain } })
  }
  return plan
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
