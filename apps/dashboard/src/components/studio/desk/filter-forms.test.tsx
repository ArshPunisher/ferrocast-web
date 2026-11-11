import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type EngineOption } from '@ferrocast/api'
import {
  CaptureForm,
  chromaFromGrey,
  clampEdges,
  colourAt,
  edgesOf,
  safeSimilarity,
  startingSimilarity,
} from './filter-forms'
import { RowLook, shownNumber, storedNumber } from './options'
import { bytes } from './kind-settings'
import { recordSizes, sizeText } from './settings'

const size = { w: 2560, h: 1440 }

describe('crop edges', () => {
  it('reads a relative crop as its four edges', () => {
    expect(edgesOf({ relative: true, left: 28, top: 187, right: 0, bottom: 4 }, size)).toEqual({
      l: 28,
      t: 187,
      r: 0,
      b: 4,
    })
  })

  it("reads OBS's absolute crop (a box) as the edges it leaves", () => {
    // Left 100, top 50, then a 2000 × 1000 box: 460 off the right, 390 off the bottom.
    expect(edgesOf({ relative: false, left: 100, top: 50, cx: 2000, cy: 1000 }, size)).toEqual({
      l: 100,
      t: 50,
      r: 460,
      b: 390,
    })
    // A width or height of 0 keeps the rest of the picture.
    expect(edgesOf({ relative: false, left: 10, top: 0, cx: 0, cy: 0 }, size)).toEqual({
      l: 10,
      t: 0,
      r: 0,
      b: 0,
    })
  })

  it('treats missing and negative numbers as no crop', () => {
    expect(edgesOf({ left: -40, top: 'x' }, size)).toEqual({ l: 0, t: 0, r: 0, b: 0 })
  })

  it('always keeps some picture', () => {
    const c = clampEdges({ l: 2000, t: 0, r: 2000, b: 5000 }, size)
    expect(size.w - c.l - c.r).toBeGreaterThanOrEqual(16)
    expect(size.h - c.t - c.b).toBeGreaterThanOrEqual(16)
    expect(c.l).toBe(2000)
  })
})

describe('recording sizes', () => {
  it('works out sizes a minute from the settings', () => {
    const s = recordSizes({ video_kbps: 6000, audio_kbps: 160, width: 2560, height: 1440, fps: 60 })
    expect(Math.round(s.stream)).toBe(46)
    expect(Math.round(s.high)).toBe(299)
    expect(Math.round(s.lossless[0])).toBe(995)
    expect(Math.round(s.lossless[1])).toBe(2986)
  })

  it('grows with the picture', () => {
    const small = recordSizes({
      video_kbps: 6000,
      audio_kbps: 160,
      width: 1280,
      height: 720,
      fps: 30,
    })
    expect(small.high * 8).toBeCloseTo(
      recordSizes({ video_kbps: 6000, audio_kbps: 160, width: 2560, height: 1440, fps: 60 }).high,
    )
  })
})

describe('size text', () => {
  it('reads plainly', () => {
    expect(sizeText(46.2)).toBe('46 MB')
    expect(sizeText(298.6)).toBe('300 MB')
    expect(sizeText(995.3)).toBe('1 GB')
    expect(sizeText(2986)).toBe('3 GB')
    expect(sizeText(2772)).toBe('2.8 GB')
    expect(sizeText(59720)).toBe('60 GB')
  })
})

const opt = (
  o: Partial<EngineOption> & { key: string; kind: EngineOption['kind'] },
): EngineOption => ({
  label: o.key,
  help: '',
  visible: true,
  enabled: true,
  min: null,
  max: null,
  step: null,
  slider: false,
  suffix: '',
  choices: [],
  values: [],
  group: [],
  ...o,
})

const captureForm = [
  opt({
    key: 'type',
    kind: 'list',
    choices: ['Display Capture', 'Window Capture', 'Application Capture'],
    values: [0, 1, 2],
  }),
  opt({
    key: 'display',
    kind: 'list',
    choices: ['BenQ'],
    values: [1],
    shown_when: { key: 'type', values: [0, 2] },
  }),
  opt({
    key: 'window',
    kind: 'list',
    choices: ['Chrome'],
    values: [7],
    shown_when: { key: 'type', values: [1] },
  }),
  opt({
    key: 'application',
    kind: 'list',
    choices: ['Chrome'],
    values: ['com.google.Chrome'],
    shown_when: { key: 'type', values: [2] },
  }),
  opt({ key: 'show_cursor', kind: 'bool' }),
  opt({ key: 'exclude_apps', kind: 'editable_list', shown_when: { key: 'type', values: [0] } }),
]

const drawn = (type: number) =>
  renderToStaticMarkup(
    createElement(CaptureForm, { opts: captureForm, values: { type }, onChange: () => {} }),
  )

describe('screen capture form', () => {
  it('shows the three ways as buttons, the picked one checked', () => {
    const html = drawn(1)
    expect(html.match(/role="radio"/g)).toHaveLength(3)
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?One window/)
  })

  it('shows only the picker the way needs', () => {
    expect(drawn(1)).toContain('>Window<')
    expect(drawn(1)).not.toContain('>Screen<')
    expect(drawn(1)).not.toContain('>App<')
    expect(drawn(0)).toContain('>Screen<')
    expect(drawn(0)).not.toContain('>Window<')
    expect(drawn(2)).toContain('>Screen<')
    expect(drawn(2)).toContain('>App<')
    for (const t of [0, 1, 2]) expect(drawn(t)).toContain('Show the pointer')
  })
})

describe('colour picked off the picture', () => {
  // A 3 × 3 picture: green all round, one white pixel of noise in the middle.
  const px = new Uint8ClampedArray(3 * 3 * 4)
  for (let i = 0; i < 9; i++) px.set(i === 4 ? [255, 255, 255, 255] : [0, 180, 60, 255], i * 4)

  it('averages the pixels round the click', () => {
    // (8 × green + white) / 9.
    expect(colourAt(px, 3, 3, 0.5, 0.5)).toBe('#1cbc52')
  })

  it('stays inside the picture at its edges', () => {
    expect(colourAt(px, 3, 3, 0, 0)).toMatch(/^#[0-9a-f]{6}$/)
    expect(colourAt(px, 3, 3, 1, 1)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('numbers as percentages', () => {
  const similarity = opt({
    key: 'similarity',
    kind: 'int',
    min: 1,
    max: 1000,
    step: 1,
    slider: true,
  })
  const contrast = opt({
    key: 'contrast',
    kind: 'float',
    min: -4,
    max: 4,
    step: 0.01,
    slider: true,
  })
  const opacity = opt({ key: 'opacity', kind: 'float', min: 0, max: 1, step: 0.0001, slider: true })
  const gain = opt({
    key: 'db',
    kind: 'float',
    min: -30,
    max: 30,
    step: 0.1,
    slider: true,
    suffix: ' dB',
  })

  it('shows a range without a unit as a share of it', () => {
    expect(shownNumber(similarity, 400)).toBe(40)
    expect(shownNumber(opacity, 1)).toBe(100)
    expect(shownNumber(contrast, 0)).toBe(0)
    expect(shownNumber(contrast, -4)).toBe(-100)
    expect(shownNumber(contrast, 2)).toBe(50)
  })

  it('keeps a number with a unit as it is', () => {
    expect(shownNumber(gain, -6.5)).toBe(-6.5)
    expect(storedNumber(gain, 99)).toBe(30)
  })

  it('goes back to OBS values on their steps, inside the range', () => {
    expect(storedNumber(similarity, 40)).toBe(401)
    expect(storedNumber(similarity, 0)).toBe(1)
    expect(storedNumber(similarity, 250)).toBe(1000)
    expect(storedNumber(contrast, 50)).toBeCloseTo(2)
    expect(storedNumber(contrast, -25)).toBeCloseTo(-1)
    expect(storedNumber(opacity, 75)).toBeCloseTo(0.75)
  })
})

describe('green screen strength and greys', () => {
  it('measures how far a key colour is from grey', () => {
    expect(chromaFromGrey('#00ff00')).toBeCloseTo(0.523, 2)
    expect(chromaFromGrey('#0099ff')).toBeCloseTo(0.366, 2)
    expect(chromaFromGrey('#91ff3d')).toBeCloseTo(0.331, 2)
    expect(chromaFromGrey('#808080')).toBeCloseTo(0, 2)
  })

  it('picks a strength that keeps black, white and greys', () => {
    // A lime green screen: OBS's 400 would take greys (0.331 < 0.4).
    expect(safeSimilarity('#91ff3d')).toBe(232)
    expect(safeSimilarity('#0099ff')).toBe(256)
    // Never above OBS's default, never so low it removes nothing.
    expect(safeSimilarity('#00ff00')).toBe(366)
    expect(safeSimilarity('#7f8080')).toBe(40)
  })
})

describe('each key colour starts at its own strength', () => {
  it('green at OBS 40%, blue and picked colours lower', () => {
    expect(startingSimilarity('#00ff00')).toBe(400)
    expect(startingSimilarity('#0099ff')).toBe(256)
    expect(startingSimilarity('#91ff3d')).toBe(232)
  })
})

describe('screen capture in the drawer (design A)', () => {
  const lined = (values: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(
        RowLook.Provider,
        { value: 'lined' },
        createElement(CaptureForm, { opts: captureForm, values, onChange: () => {} }),
      ),
    )

  it('leaves apps out of a whole screen, named as people know them', () => {
    const html = lined({ type: 0, exclude_apps: ['com.google.Chrome'] })
    expect(html).toContain('>Leave out<')
    expect(html).toContain('>Chrome<')
    expect(html).toContain('aria-label="Show Chrome again"')
    // An app already left out isn't offered again.
    expect(html).not.toMatch(/<option value="com.google.Chrome">/)
  })

  it('has no Leave out for one window', () => {
    expect(lined({ type: 1 })).not.toContain('>Leave out<')
  })
})

describe('a file size as people read it', () => {
  it('rounds to the unit that fits', () => {
    expect(bytes(512)).toBe('512 B')
    expect(bytes(48_200_000)).toBe('48 MB')
    expect(bytes(1_234_000_000)).toBe('1.2 GB')
  })
})
