import { describe, expect, it } from 'vitest'
import { estimateBpm, onsetEnvelope } from './tempo'

const SR = 8000

/** A click track: a short decaying burst on every beat. */
function clicks(bpm: number, seconds: number, jitter = 0): Float32Array {
  const out = new Float32Array(SR * seconds)
  const beat = (60 / bpm) * SR
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let b = 0; b * beat < out.length; b++) {
    const at = Math.round(b * beat + (rand() * 2 - 1) * jitter * SR)
    for (let i = 0; i < 400 && at + i < out.length; i++)
      if (at + i >= 0) out[at + i] = Math.exp(-i / 60) * (b % 4 === 0 ? 1 : 0.6)
  }
  return out
}

describe('tempo', () => {
  for (const bpm of [72, 90, 120, 128, 150, 168])
    it(`finds ${bpm} BPM in a click track`, () => {
      const got = estimateBpm(clicks(bpm, 12), SR)
      expect(got).not.toBeNull()
      expect(Math.abs((got as number) - bpm)).toBeLessThanOrEqual(2)
    })

  it('copes with a little timing jitter', () => {
    const got = estimateBpm(clicks(110, 15, 0.004), SR)
    expect(Math.abs((got as number) - 110)).toBeLessThanOrEqual(2)
  })

  it('says null for silence, noise-free short sounds and nonsense rates', () => {
    expect(estimateBpm(new Float32Array(SR * 10), SR)).toBeNull()
    expect(estimateBpm(clicks(120, 1), SR)).toBeNull()
    expect(estimateBpm(clicks(120, 10), 0)).toBeNull()
    expect(estimateBpm(clicks(120, 10), Number.NaN)).toBeNull()
  })

  it('makes 100 onset frames a second', () => {
    expect(onsetEnvelope(new Float32Array(SR * 2), SR)).toHaveLength(200)
  })
})
