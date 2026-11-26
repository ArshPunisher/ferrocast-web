import { describe, expect, it } from 'vitest'
import {
  CLEAN_EXPANDER,
  CLEAN_EXPANDER_FILTER,
  DUCK_FILTER,
  VOICE_STYLES,
  MAX_MIC_GAIN_DB,
  MIC_LEVEL_FILTER,
  VOICE_TARGET_DB,
  cleanMicPlan,
  duckFilter,
  duckMic,
  freeName,
  micGainDb,
  needsCleanMicUpdate,
  voiceUsualPeak,
  voiceStyleOf,
  voiceVerdict,
} from './cleanmic'

describe('clean mic', () => {
  it('adds the whole 4-stage chain (with downward expander before boost) to a bare mic', () => {
    expect(cleanMicPlan([]).map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
  })

  it('builds the measured chain: noise out, expander for pauses, 3:1 from -26 dB with +9, -3 dB ceiling', () => {
    const plan = cleanMicPlan([])
    expect(plan.map((f) => f.name)).toEqual([
      'Remove background noise',
      CLEAN_EXPANDER_FILTER,
      'Even out loud moments',
      'Stop clipping',
    ])
    expect(plan.map((f) => f.settings)).toEqual([
      { method: 'rnnoise' },
      CLEAN_EXPANDER.settings,
      { ratio: 3, threshold: -26, attack_time: 8, release_time: 150, output_gain: 9 },
      { threshold: -3, release_time: 60 },
    ])
  })

  it('puts the mic level step first when the voice is quiet, with the number', () => {
    const plan = cleanMicPlan([], { gainDb: 10 })
    expect(plan.map((f) => f.kind)).toEqual([
      'gain_filter',
      'noise_suppress_filter_v2',
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
    expect(plan[0]).toMatchObject({ name: MIC_LEVEL_FILTER, settings: { db: 10 } })
  })

  it('adds no level step for a voice that is loud enough, unmeasured, or already has one', () => {
    expect(cleanMicPlan([], { gainDb: 0 }).map((f) => f.kind)).not.toContain('gain_filter')
    expect(cleanMicPlan([], { gainDb: null }).map((f) => f.kind)).not.toContain('gain_filter')
    expect(cleanMicPlan(['gain_filter'], { gainDb: 12 }).map((f) => f.kind)).not.toContain(
      'gain_filter',
    )
  })

  it('sets output_gain to 0 and skips Raise a quiet mic when autoBoost is false', () => {
    const plan = cleanMicPlan([], { gainDb: 12, autoBoost: false })
    expect(plan.map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
    const comp = plan.find((f) => f.kind === 'compressor_filter')
    expect(comp?.settings).toMatchObject({ output_gain: 0 })
  })

  it('counts Strong noise removal as the noise step while keeping expander before compressor', () => {
    expect(cleanMicPlan(['ferrocast_deepfilter']).map((f) => f.kind)).toEqual([
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
  })

  it('keeps what the mic has and adds only the rest without conflating gate and noise removal', () => {
    expect(cleanMicPlan(['noise_suppress_filter']).map((f) => f.kind)).toEqual([
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
    expect(cleanMicPlan(['noise_gate_filter']).map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'compressor_filter',
      'limiter_filter',
    ])
    expect(cleanMicPlan(['limiter_filter', 'expander_filter']).map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'compressor_filter',
    ])
    expect(
      cleanMicPlan([
        'noise_suppress_filter_v2',
        'expander_filter',
        'compressor_filter',
        'limiter_filter',
      ]),
    ).toEqual([])
    expect(
      cleanMicPlan([
        'noise_suppress_filter_v2',
        'noise_gate_filter',
        'compressor_filter',
        'limiter_filter',
      ]),
    ).toEqual([])
  })

  it('names a filter so it never clashes', () => {
    expect(freeName('Stop clipping', [])).toBe('Stop clipping')
    expect(freeName('Stop clipping', ['Stop clipping'])).toBe('Stop clipping 2')
    expect(freeName('Stop clipping', ['Stop clipping', 'Stop clipping 2'])).toBe('Stop clipping 3')
  })

  it('detects legacy 3-filter chains that need the safe expander update offer', () => {
    const legacy = [
      { kind: 'noise_suppress_filter_v2', enabled: true },
      { kind: 'compressor_filter', enabled: true },
      { kind: 'limiter_filter', enabled: true },
    ]
    expect(needsCleanMicUpdate(legacy, { output_gain: 9 }, false)).toBe(true)
    expect(needsCleanMicUpdate(legacy, { output_gain: 0 }, false)).toBe(false)
    expect(needsCleanMicUpdate(legacy, null, false)).toBe(false)
    expect(needsCleanMicUpdate(legacy, { output_gain: 9 }, true)).toBe(false)
    expect(
      needsCleanMicUpdate(
        [legacy[0]!, { kind: 'expander_filter', enabled: true }, legacy[1]!, legacy[2]!],
        { output_gain: 9 },
        false,
      ),
    ).toBe(false)
    expect(
      needsCleanMicUpdate(
        [legacy[0]!, { kind: 'noise_gate_filter', enabled: true }, legacy[1]!, legacy[2]!],
        { output_gain: 9 },
        false,
      ),
    ).toBe(false)
    expect(
      needsCleanMicUpdate(
        [legacy[0]!, { kind: 'compressor_filter', enabled: false }, legacy[2]!],
        { output_gain: 9 },
        false,
      ),
    ).toBe(false)
  })
})

describe('the voice level', () => {
  const many = (v: number, n = 20) => Array.from({ length: n }, () => v)

  it('raises a quiet voice so its usual peak sits near -12 dB, at most +15', () => {
    expect(micGainDb(many(-22))).toBe(10)
    expect(micGainDb(many(-12))).toBe(0)
    expect(micGainDb(many(-6))).toBe(0)
    expect(micGainDb(many(-45))).toBe(15)
    expect(voiceUsualPeak(many(-30))).toBe(-30)
  })

  it('does not take a fan for a quiet voice: the captured noisy room asks for at most +15', () => {
    // The S32 capture: most 21 ms blocks were above silence (the fan's peaks near -34 dB), the
    // voice's own near -27 dB on average and up to -14: the middle reading (-31.7) asked for +20
    // and left the fan 11 dB under the voice; the 60th percentile and the cap give +15 or less.
    const fan = many(-35, 60)
    const voice = [...many(-27, 30), ...many(-20, 15), ...many(-14, 10)]
    const noisy = [...fan, ...voice]
    const middle = [...noisy].sort((a, b) => a - b)[Math.floor(noisy.length / 2)] ?? 0
    expect(VOICE_TARGET_DB - middle).toBeGreaterThan(MAX_MIC_GAIN_DB)
    expect(micGainDb(noisy)).toBeLessThanOrEqual(15)
    expect(micGainDb(noisy)).toBe(15)
    // A quiet room (only the voice) is not held back below what it needs.
    expect(micGainDb(voice)).toBe(Math.round(Math.max(0, -12 - (voiceUsualPeak(voice) ?? 0))))
  })

  it('has no number until there has been enough talking', () => {
    expect(micGainDb([])).toBeNull()
    expect(micGainDb(many(-80, 100))).toBeNull()
    expect(micGainDb([...many(-80, 100), ...many(-22, 9)])).toBeNull()
  })

  it('says nothing until there has been enough talking', () => {
    expect(voiceVerdict([])).toBeNull()
    expect(voiceVerdict(many(-80, 100))).toBeNull()
    expect(voiceVerdict([...many(-80, 100), ...many(-12, 9)])).toBeNull()
    expect(voiceVerdict(many(Number.NEGATIVE_INFINITY, 50))).toBeNull()
  })

  it('good, quiet and loud', () => {
    expect(voiceVerdict(many(-12))).toBe('good')
    expect(voiceVerdict(many(-32))).toBe('quiet')
    expect(voiceVerdict([...many(-12), -0.5])).toBe('loud')
  })

  it('silence between words does not make it quiet', () => {
    expect(voiceVerdict([...many(-90, 200), ...many(-14, 20)])).toBe('good')
  })

  it('a few loud words in quiet talking still count as quiet only when most are low', () => {
    expect(voiceVerdict([...many(-30, 18), -10, -10])).toBe('quiet')
    expect(voiceVerdict([...many(-30, 10), ...many(-15, 10)])).toBe('good')
  })
})

describe('voice styles', () => {
  it('reads the style back from the equaliser', () => {
    expect(voiceStyleOf(null)).toBe('natural')
    expect(voiceStyleOf(VOICE_STYLES.radio)).toBe('radio')
    expect(voiceStyleOf(VOICE_STYLES.podcast)).toBe('podcast')
    expect(voiceStyleOf({ low: 1, mid: 1, high: 1 })).toBe('natural')
  })
})

describe('lower it when I talk', () => {
  const mics = new Set(['coreaudio_input_capture', 'wasapi_input_capture'])

  it('ducks under the first mic, never itself', () => {
    const sounds = [
      { name: 'Music', kind: 'ffmpeg_source' },
      { name: 'Mic', kind: 'coreaudio_input_capture' },
      { name: 'Mic 2', kind: 'wasapi_input_capture' },
    ]
    expect(duckMic(sounds, 'Music', mics)).toBe('Mic')
    expect(duckMic(sounds, 'Mic', mics)).toBe('Mic 2')
    expect(duckMic([{ name: 'Music', kind: 'ffmpeg_source' }], 'Music', mics)).toBeNull()
  })

  it('keys OBS’s compressor to that mic', () => {
    const f = duckFilter('Mic')
    expect(f.kind).toBe('compressor_filter')
    expect(f.name).toBe(DUCK_FILTER)
    expect(f.settings).toMatchObject({ sidechain_source: 'Mic', ratio: 20 })
  })
})
