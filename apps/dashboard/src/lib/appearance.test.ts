import { afterEach, describe, expect, it } from 'vitest'
import {
  COLORBLIND,
  DEFAULT_APPEARANCE,
  applyAppearance,
  meterColors,
  parseAppearance,
} from './appearance'

afterEach(() => {
  const r = document.documentElement
  r.removeAttribute('style')
  r.removeAttribute('data-density')
  r.removeAttribute('data-reduce-motion')
})

describe('parseAppearance', () => {
  it('takes the defaults for nothing or nonsense', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance('x')).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance({ scale: 'big', density: 'huge', select: 'red', meters: 4 })).toEqual(
      DEFAULT_APPEARANCE,
    )
  })

  it('keeps the size in range and on the steps', () => {
    expect(parseAppearance({ scale: 500 }).scale).toBe(130)
    expect(parseAppearance({ scale: 10 }).scale).toBe(90)
    expect(parseAppearance({ scale: 112 }).scale).toBe(110)
  })

  it('keeps only real hex colours', () => {
    const a = parseAppearance({
      meters: 'custom',
      custom: { ok: '#112233', warn: 'url(x)', clip: '#ABCDEF' },
      select: '#ff0000',
    })
    expect(a.custom).toEqual({
      ok: '#112233',
      warn: DEFAULT_APPEARANCE.custom.warn,
      clip: '#ABCDEF',
    })
    expect(a.select).toBe('#ff0000')
  })
})

describe('applyAppearance', () => {
  it('sets the size, density and motion on the root, and takes them off again', () => {
    const root = document.documentElement
    applyAppearance({ ...DEFAULT_APPEARANCE, scale: 120, density: 'compact', reduceMotion: true })
    expect(root.style.fontSize).toBe('120%')
    expect(root.dataset.density).toBe('compact')
    expect(root.dataset.reduceMotion).toBe('true')
    applyAppearance(DEFAULT_APPEARANCE)
    expect(root.style.fontSize).toBe('')
    expect(root.dataset.reduceMotion).toBeUndefined()
  })

  it('the colour-blind preset sets the meters and the selection; normal clears them', () => {
    const root = document.documentElement
    applyAppearance({ ...DEFAULT_APPEARANCE, meters: 'colorblind' })
    expect(root.style.getPropertyValue('--fc-meter-ok')).toBe(COLORBLIND.ok)
    expect(root.style.getPropertyValue('--fc-meter-clip')).toBe(COLORBLIND.clip)
    expect(root.style.getPropertyValue('--fc-pick')).toBe(COLORBLIND.select)
    applyAppearance(DEFAULT_APPEARANCE)
    expect(root.style.getPropertyValue('--fc-meter-ok')).toBe('')
    expect(root.style.getPropertyValue('--fc-pick')).toBe('')
  })

  it('a picked selection colour wins over the preset’s', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, meters: 'colorblind', select: '#123456' })
    expect(document.documentElement.style.getPropertyValue('--fc-pick')).toBe('#123456')
  })

  it('the colour-blind colours are three well separated colours', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const far = (x: string, y: string) => Math.hypot(...rgb(x).map((v, i) => v - (rgb(y)[i] ?? 0)))
    const m = meterColors({ ...DEFAULT_APPEARANCE, meters: 'colorblind' })!
    expect(far(m.ok, m.warn)).toBeGreaterThan(150)
    expect(far(m.warn, m.clip)).toBeGreaterThan(150)
    expect(far(m.ok, m.clip)).toBeGreaterThan(150)
  })
})
