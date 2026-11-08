import { describe, expect, it } from 'vitest'
import { loadHint, sourceRates } from './source-load'

const l = (name: string, sent: number, width = 1920, height = 1080) => ({
  name,
  sent,
  width,
  height,
})

describe('what keeps the engine busiest', () => {
  it('works out each source’s rate between two reads, heaviest first', () => {
    const r = sourceRates(
      [l('Cam', 100), l('Screen', 50, 3840, 2160), l('Logo', 1, 200, 200)],
      [l('Cam', 160), l('Screen', 80, 3840, 2160), l('Logo', 1, 200, 200)],
      1000,
    )
    expect(r.map((x) => x.name)).toEqual(['Screen', 'Cam'])
    expect(r[0]?.fps).toBe(30)
    expect(Math.round(r[0]?.mpix ?? 0)).toBe(249)
    expect(r[1]?.fps).toBe(60)
  })

  it('skips sources that are new, restarted or have no picture yet', () => {
    expect(sourceRates([], [l('New', 10)], 1000)).toEqual([])
    expect(sourceRates([l('Cam', 500)], [l('Cam', 3)], 1000)).toEqual([])
    expect(sourceRates([l('Cam', 0, 0, 0)], [l('Cam', 30, 0, 0)], 1000)).toEqual([])
    expect(sourceRates([l('Cam', 0)], [l('Cam', 30)], 0)).toEqual([])
  })

  it('says when a source is bigger than the picture, or simply heavy', () => {
    const canvas = { width: 1920, height: 1080 }
    const big = sourceRates([l('Cam', 0, 3840, 2160)], [l('Cam', 30, 3840, 2160)], 1000)[0]
    expect(loadHint(big, canvas)).toMatch(/Cam sends 3840×2160, bigger than your 1920×1080/)
    const fast = sourceRates([l('Cam', 0)], [l('Cam', 60)], 1000)[0]
    expect(loadHint(fast, canvas)).toMatch(/Cam sends the most \(1920×1080 at 60 fps\)/)
    const light = sourceRates([l('Cam', 0)], [l('Cam', 30)], 1000)[0]
    expect(loadHint(light, canvas)).toBeNull()
    expect(loadHint(undefined, canvas)).toBeNull()
  })
})
