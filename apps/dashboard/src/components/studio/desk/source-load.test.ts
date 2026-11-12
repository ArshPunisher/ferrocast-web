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

  it('says when a source is bigger than the picture, or simply heavy, only while struggling', () => {
    const canvas = { width: 1920, height: 1080 }
    const big = sourceRates([l('Cam', 0, 3840, 2160)], [l('Cam', 30, 3840, 2160)], 1000)[0]
    expect(loadHint(big, canvas, true, 'av_capture_input')).toBe(
      'It sends 3840×2160, bigger than your 1920×1080 picture: pick a smaller size in its settings.',
    )
    expect(loadHint(big, canvas, true, 'screen_capture')).toBe(
      "It sends 3840×2160, bigger than your 1920×1080 picture: hide it while you don't need it.",
    )
    const fast = sourceRates([l('Cam', 0)], [l('Cam', 60)], 1000)[0]
    expect(loadHint(fast, canvas, true, 'dshow_input')).toBe(
      'Pick a smaller size or frame rate in its settings.',
    )
    expect(loadHint(fast, canvas, true, 'screen_capture')).toBe(
      'Make it smaller on screen, or hide it while you don’t need it.',
    )
    // A big window at 60 fps on a Studio that keeps up: no warning (owner, 12 Nov).
    expect(loadHint(fast, canvas, false, 'screen_capture')).toBeNull()
    expect(loadHint(big, canvas, false, 'av_capture_input')).toBeNull()
    const light = sourceRates([l('Cam', 0)], [l('Cam', 30)], 1000)[0]
    expect(loadHint(light, canvas, true)).toBeNull()
    expect(loadHint(undefined, canvas, true)).toBeNull()
  })
})
