import { describe, expect, it } from 'vitest'
import {
  DUCK_FILTER,
  VOICE_STYLES,
  cleanMicPlan,
  duckFilter,
  duckMic,
  freeName,
  voiceStyleOf,
  voiceVerdict,
} from './cleanmic'

describe('clean mic', () => {
  it('adds the whole chain to a bare mic, in order', () => {
    expect(cleanMicPlan([]).map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'compressor_filter',
      'limiter_filter',
    ])
  })

  it('keeps what the mic has and adds only the rest', () => {
    expect(cleanMicPlan(['noise_suppress_filter']).map((f) => f.kind)).toEqual([
      'compressor_filter',
      'limiter_filter',
    ])
    expect(cleanMicPlan(['limiter_filter', 'expander_filter']).map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
    ])
    expect(
      cleanMicPlan(['noise_suppress_filter_v2', 'compressor_filter', 'limiter_filter']),
    ).toEqual([])
  })

  it('names a filter so it never clashes', () => {
    expect(freeName('Stop clipping', [])).toBe('Stop clipping')
    expect(freeName('Stop clipping', ['Stop clipping'])).toBe('Stop clipping 2')
    expect(freeName('Stop clipping', ['Stop clipping', 'Stop clipping 2'])).toBe('Stop clipping 3')
  })
})

describe('the voice level', () => {
  const many = (v: number, n = 20) => Array.from({ length: n }, () => v)

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
