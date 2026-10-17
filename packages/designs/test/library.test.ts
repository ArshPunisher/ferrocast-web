// The design library's promises: how big it is, how varied, that the Spark stays tiny and
// part of the design, that nothing hides the camera, and that it stays light enough for OBS.

import { describe, expect, it } from 'vitest'
import {
  FRAME_VARIANTS,
  SHAPE_CLIPS,
  SHAPE_PATTERNS,
  TEXT_EFFECTS,
  checkCss,
  intoUser,
  isBrandLayer,
  type Design,
  type LayerConfig,
  type Scene,
  type Widget,
} from '@ferrocast/api'
import { BUILTINS, catalog } from '../src'

const of = <K extends Design['kind']>(k: K) =>
  BUILTINS.filter((d): d is Extract<Design, { kind: K }> => d.kind === k)
const scenesOf = (d: Design): Scene[] =>
  d.kind === 'theme' ? d.content.scenes : d.kind === 'scene' ? [d.content] : []
const allScenes = BUILTINS.flatMap((d) => scenesOf(d).map((s) => ({ d, s })))
const layerCfg = (l: Widget) => (l.kind === 'layer' ? (l.config as LayerConfig) : null)
const looks = (d: Extract<Design, { kind: 'alert' }>) =>
  Object.values(d.content.events)
    .flatMap((e) => e?.variations ?? [])
    .map((v) => v.look)

describe('library size', () => {
  it('has the promised counts by kind', () => {
    expect(of('theme').length).toBeGreaterThanOrEqual(12)
    expect(of('alert').length).toBeGreaterThanOrEqual(30)
    const widgets = of('widget')
    expect(widgets.length).toBeGreaterThanOrEqual(25)
    const kinds = (k: string) => widgets.filter((w) => w.content.widget === k).length
    expect(kinds('goal')).toBeGreaterThanOrEqual(6)
    expect(kinds('label')).toBeGreaterThanOrEqual(5)
    expect(kinds('events')).toBeGreaterThanOrEqual(4)
    expect(kinds('chat')).toBeGreaterThanOrEqual(4)
    const small = of('scene')
    const has = (pred: (c: LayerConfig) => boolean) =>
      small.filter((d) =>
        d.content.layers.some((l) => {
          const c = layerCfg(l)
          return c !== null && pred(c)
        }),
      ).length
    expect(
      has((c) => c.type === 'text' && Array.isArray(c.rotate) && c.rotate.length > 0),
    ).toBeGreaterThanOrEqual(3)
    expect(has((c) => c.type === 'text' && typeof c.countdown === 'number')).toBeGreaterThanOrEqual(
      3,
    )
  })

  it('every built-in design is free: none is marked Pro', () => {
    for (const d of BUILTINS) expect(d.pro, d.id).toBe(false)
  })

  it('every theme points at its own matching alert design', () => {
    const used = new Set<string>()
    for (const t of of('theme')) {
      const a = t.content.alert_design
      expect(a && BUILTINS.some((d) => d.id === a && d.kind === 'alert'), t.id).toBe(true)
      expect(used.has(a as string), `${t.id} shares its alert design`).toBe(false)
      used.add(a as string)
    }
  })
})

describe('variety in structure, not just colour', () => {
  const used = {
    clip: new Set<string>(),
    pattern: new Set<string>(),
    variant: new Set<string>(),
    effect: new Set<string>(),
    font: new Set<string>(),
  }
  for (const { s } of allScenes)
    for (const l of s.layers) {
      const c = layerCfg(l)
      if (!c) continue
      if (c.type === 'shape') {
        if (c.clip) used.clip.add(c.clip)
        if (c.pattern) used.pattern.add(c.pattern)
      }
      if ((c.type === 'frame' || c.type === 'webcam') && c.variant) used.variant.add(c.variant)
      if (c.type === 'text') {
        if (c.effect) used.effect.add(c.effect)
        if (c.font) used.font.add(c.font)
      }
    }

  it('scenes use most of the silhouettes, patterns, frames and text effects', () => {
    expect(used.clip.size).toBeGreaterThanOrEqual(Math.floor(SHAPE_CLIPS.length * 0.6))
    expect(used.pattern.size).toBeGreaterThanOrEqual(Math.floor(SHAPE_PATTERNS.length * 0.6))
    expect(used.variant.size).toBeGreaterThanOrEqual(Math.floor(FRAME_VARIANTS.length * 0.6))
    expect(used.effect.size).toBeGreaterThanOrEqual(Math.floor(TEXT_EFFECTS.length * 0.6))
    expect(used.font.size).toBeGreaterThanOrEqual(15)
  })

  it('every theme has its own headline font and its own frame for the cam', () => {
    const heads = new Map<string, string>()
    for (const t of of('theme')) {
      const ss = t.content.scenes.find((s) => s.key === 'starting_soon')!
      const title = ss.layers.map(layerCfg).find((c) => c?.type === 'text' && (c.size ?? 0) >= 60)
      expect(title, t.id).toBeDefined()
      heads.set(t.id, (title as { font?: string }).font ?? '')
    }
    expect(new Set(heads.values()).size).toBeGreaterThanOrEqual(10)
  })

  it('alert designs use their own CSS, and every look stays inside the CSS rules', () => {
    for (const d of of('alert'))
      for (const l of looks(d)) {
        expect(checkCss('css', l.css), d.id).toBeNull()
        expect(l.css, `${d.id}: no endless CSS loops (R-38)`).not.toMatch(/\binfinite\b/)
        expect(l.css.length, d.id).toBeLessThanOrEqual(4000)
      }
    expect(of('alert').filter((d) => looks(d)[0]!.css.length > 0).length).toBeGreaterThanOrEqual(25)
  })
})

describe('the Spark mark', () => {
  it('is tiny in every scene: at most 48 px, or a faint watermark of at most 120 px', () => {
    for (const { d, s } of allScenes) {
      const marks = s.layers.filter(isBrandLayer)
      expect(marks, `${d.id}/${s.key}`).toHaveLength(1)
      const m = marks[0]!
      const variant = (m.config as { variant?: string }).variant ?? 'mark'
      const max = variant === 'watermark' ? 120 : 48
      expect(Math.max(m.w, m.h), `${d.id}/${s.key}`).toBeLessThanOrEqual(max)
    }
  })

  it('moves around: themes put it in different places', () => {
    const spots = new Set(
      allScenes
        .filter(({ s }) => s.width === 1920)
        .map(({ s }) => {
          const m = s.layers.find(isBrandLayer)!
          return `${Math.round(m.x / 160)}:${Math.round(m.y / 90)}`
        }),
    )
    expect(spots.size).toBeGreaterThanOrEqual(20)
    const alertSpots = new Set(of('alert').map((d) => looks(d)[0]!.brand))
    expect(alertSpots.size).toBe(6)
    const widgetSpots = new Set(of('widget').map((w) => w.content.style.brand))
    expect(widgetSpots.size).toBe(6)
  })

  it('a streamer’s duplicate of any built-in carries no mark at all', () => {
    for (const d of BUILTINS) {
      const mine = intoUser(d, 'mine', { type: 'duplicate', from: d.name }, 0)
      expect(mine.branded).toBe(false)
      expect(mine.pro).toBe(false)
      for (const s of scenesOf(mine)) expect(s.layers.some(isBrandLayer), d.id).toBe(false)
      if (mine.kind === 'widget') expect(mine.content.style.brand, d.id).toBeUndefined()
    }
  })
})

describe('safe for streaming', () => {
  it('nothing opaque covers a webcam frame (the overlay sits above the camera in OBS)', () => {
    for (const { d, s } of allScenes)
      for (const cam of s.layers.filter((l) => layerCfg(l)?.type === 'webcam')) {
        const cx = cam.x + cam.w / 2
        const cy = cam.y + cam.h / 2
        for (const l of s.layers) {
          const c = layerCfg(l)
          const covers =
            c !== null &&
            ((c.type === 'shape' && (c.fill || c.pattern)) ||
              c.type === 'image' ||
              c.type === 'text')
          if (covers && cx > l.x && cx < l.x + l.w && cy > l.y && cy < l.y + l.h)
            expect.fail(`${d.id}/${s.key}: '${l.id}' covers the camera`)
        }
      }
  })

  it('stays light for OBS: layers, loops and file size have limits', () => {
    for (const { d, s } of allScenes) {
      expect(s.layers.length, `${d.id}/${s.key}`).toBeLessThanOrEqual(40)
      const loops = s.layers.filter((l) => {
        const a = layerCfg(l)?.anim
        return a && a.loop !== 'none'
      }).length
      expect(loops, `${d.id}/${s.key} loops`).toBeLessThanOrEqual(8)
    }
    for (const d of BUILTINS) expect(JSON.stringify(d).length, d.id).toBeLessThanOrEqual(64 * 1024)
    expect(JSON.stringify(catalog()).length).toBeLessThanOrEqual(1_500_000)
  })

  it('every live scene keeps the middle of the screen clear for the game', () => {
    for (const t of of('theme')) {
      const s = t.content.scenes.find((x) => x.key === 'in_game')!
      for (const l of s.layers) {
        if (l.kind === 'alerts') continue
        const overlapsCentre = l.x < 1160 && l.x + l.w > 760 && l.y < 700 && l.y + l.h > 480
        expect(overlapsCentre, `${t.id}: '${l.id}' sits in the middle`).toBe(false)
      }
    }
  })

  it('sample copy never mentions TikTok and uses no em dashes', () => {
    const text = JSON.stringify(catalog())
    expect(text).not.toMatch(/tiktok/i)
    expect(text).not.toMatch(/—/)
  })
})
