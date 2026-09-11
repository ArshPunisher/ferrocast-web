// Render tests for every built-in design: each alert look for each event, each theme scene
// and each widget design, through the real overlay runtime. They pin the structure (frame,
// layout, highlights, the mark and where it sits) so a change that breaks a look fails here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_KEYS,
  intoUser,
  isBrandLayer,
  previewAlert,
  type Design,
  type RenderedAlert,
  type Widget,
} from '@ferrocast/api'
import { BUILTINS } from '@ferrocast/designs'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { buildAlert } from '../src/widgets/alerts'
import { XSS, alert, deepAll, deepText, frame, overlay, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime
let calls: { kf: Keyframe[]; opts: KeyframeAnimationOptions; el: Element }[]
const realAnimate = Element.prototype.animate

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
  calls = []
  // Record what would play instead of running happy-dom's animations.
  ;(Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    kf: Keyframe[],
    opts: KeyframeAnimationOptions,
  ) {
    calls.push({ kf, opts, el: this })
    return {
      cancel() {},
      pause() {},
      play() {},
      playState: 'running',
      effect: { getTiming: () => ({ iterations: opts.iterations ?? 1 }) },
    } as unknown as Animation
  }
  rt = createOverlay(root, { send: () => undefined, audio: false })
})
afterEach(() => {
  rt.destroy()
  vi.useRealTimers()
  ;(Element.prototype as unknown as { animate: unknown }).animate = realAnimate
})

const alertDesigns = BUILTINS.filter(
  (d): d is Extract<Design, { kind: 'alert' }> => d.kind === 'alert',
)
const themes = BUILTINS.filter((d): d is Extract<Design, { kind: 'theme' }> => d.kind === 'theme')
const sceneDesigns = BUILTINS.filter(
  (d): d is Extract<Design, { kind: 'scene' }> => d.kind === 'scene',
)
const widgetDesigns = BUILTINS.filter(
  (d): d is Extract<Design, { kind: 'widget' }> => d.kind === 'widget',
)

function play(a: RenderedAlert): Element {
  rt.apply(snapshot())
  rt.apply(frame('alert', a))
  const card = deepAll(root, '.fa')[0]
  expect(card, 'the design card renders').toBeDefined()
  return card as Element
}

describe('built-in alert designs', () => {
  for (const d of alertDesigns)
    for (const key of EVENT_KEYS) {
      it(`${d.name} draws its ${key} look`, () => {
        const a = previewAlert(d, key, { id: `${d.id}-${key}` })
        expect(a?.design, 'the design dresses the alert').toBeDefined()
        if (!a?.design) return
        const card = play(a)
        const look = a.design.look
        expect(card.classList.contains(`f-${look.frame}`)).toBe(true)
        expect(card.classList.contains(`lay-${look.layout}`)).toBe(true)
        const title = deepAll(root, '.fa-title')[0] as HTMLElement
        expect(title.textContent?.replace(/\s+/g, ' ').trim()).toBe(
          a.title.replace(/\s+/g, ' ').trim(),
        )
        expect(deepAll(root, '.fa-title .hl').length, 'the name is highlighted').toBeGreaterThan(0)
        // The mark sits where this design puts it, once.
        const marks = deepAll(root, '.fa-spark')
        expect(marks).toHaveLength(1)
        if (look.brand === 'divider') expect(deepAll(root, '.fa-divider .fa-spark')).toHaveLength(1)
        else expect(marks[0]?.getAttribute('class')).toContain(`spot-${look.brand}`)
        expect(marks[0]?.getAttribute('class')).toContain('al-spikes')
        // An entrance played, with the look's timing.
        const entrance = calls.find((c) => c.el === card)
        expect(entrance?.opts.duration).toBe(look.anim.in === 'none' ? undefined : look.anim.in_ms)
      })
    }

  it('the streamer’s own copy of a built-in shows no mark anywhere', () => {
    for (const d of alertDesigns) {
      const mine = intoUser(d, 'mine', { type: 'duplicate', from: d.name }, 0)
      rt.destroy()
      root.replaceChildren()
      rt = createOverlay(root, { send: () => undefined, audio: false })
      const a = previewAlert(mine, 'tip')
      expect(a?.design?.branded).toBe(false)
      play(a as RenderedAlert)
      expect(deepAll(root, '.fa-spark, .al-spikes'), d.id).toHaveLength(0)
    }
  })

  it('viewer names stay text inside every design', () => {
    for (const d of alertDesigns.slice(0, 3)) {
      const a = previewAlert(d, 'tip') as RenderedAlert
      const view = a.design!
      for (const bad of XSS) {
        rt.destroy()
        root.replaceChildren()
        rt = createOverlay(root, { send: () => undefined, audio: false })
        play({
          ...a,
          alert_id: `x-${bad}`,
          design: {
            ...view,
            title_parts: [
              { text: bad, hl: true },
              { text: ' tipped', hl: false },
            ],
          },
        })
        expect(deepAll(root, 'script, iframe, img[onerror], svg[onload]')).toHaveLength(0)
        expect(deepText(root)).toContain(bad.slice(0, 10))
      }
    }
  })

  it('reduced motion turns movement into a fade and drops the text animation', () => {
    rt.destroy()
    root.replaceChildren()
    rt = createOverlay(root, { send: () => undefined, audio: false, lowMotion: true })
    const d = alertDesigns.find((x) => x.id === 'builtin.comic-burst')!
    const card = play(previewAlert(d, 'follow') as RenderedAlert)
    const entrance = calls.find((c) => c.el === card)
    expect(entrance?.kf).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(entrance?.opts.duration).toBe(200)
    expect(
      calls.filter((c) => c.el.classList.contains('ch')),
      'no letter animations',
    ).toHaveLength(0)
  })

  it('looping text animations are finite (R-38)', () => {
    for (const d of alertDesigns) {
      calls = []
      rt.destroy()
      root.replaceChildren()
      rt = createOverlay(root, { send: () => undefined, audio: false })
      play(previewAlert(d, 'tip') as RenderedAlert)
      for (const c of calls) expect(c.opts.iterations ?? 1, d.id).not.toBe(Infinity)
    }
  })

  it('the exit uses the look’s out time, then acks finished', () => {
    const sent: string[] = []
    rt.destroy()
    root.replaceChildren()
    rt = createOverlay(root, { send: (s) => sent.push(s), audio: false })
    const d = alertDesigns[0]!
    const a = {
      ...(previewAlert(d, 'follow') as RenderedAlert),
      alert_id: 'out-1',
      duration_ms: 3000,
    }
    play(a)
    vi.advanceTimersByTime(3000)
    expect(sent.some((s) => s.includes('"finished"'))).toBe(false)
    vi.advanceTimersByTime(a.design!.look.anim.out_ms + 5)
    expect(sent.some((s) => s.includes('"finished"'))).toBe(true)
    expect(deepAll(root, '.fa')).toHaveLength(0)
  })

  it('a broken design falls back to the classic look instead of failing the alert', () => {
    const a = {
      ...alert('broken'),
      design: { nonsense: true } as unknown as NonNullable<RenderedAlert['design']>,
    }
    rt.apply(snapshot())
    rt.apply(frame('alert', a))
    expect(deepAll(root, '.al')).toHaveLength(1)
    expect(deepAll(root, '.al-spikes'), 'a broken design never brings the mark back').toHaveLength(
      0,
    )
  })

  it('custom CSS that tries to load files is skipped', () => {
    const d = structuredClone(alertDesigns[0]!)
    const a = previewAlert(d, 'follow') as RenderedAlert
    a.design!.look.css = '.fa{background:url(https://tracker.test/p.gif)}'
    play(a)
    expect(deepAll(root, 'style').some((s) => s.textContent?.includes('tracker.test'))).toBe(false)
  })
})

describe('classic alerts and branding', () => {
  it('keeps the Spark on classic built-in themes and can leave it off', () => {
    const wrap = (h: HTMLElement) => {
      const d = document.createElement('div')
      d.appendChild(h)
      return d
    }
    expect(deepAll(wrap(buildAlert(alert('c1'), 'molten', false)), '.al-spikes')).toHaveLength(1)
    expect(
      deepAll(wrap(buildAlert(alert('c2'), 'molten', false, false)), '.al-spikes'),
    ).toHaveLength(0)
  })
})

function scenePage(layers: Widget[]): void {
  rt.apply(
    snapshot({}, { ...overlay(layers), design: { id: 'x', scene: 'in_game', branded: true } }),
  )
  rt.apply(
    frame('state', {
      labels: Object.fromEntries(
        layers.filter((l) => l.kind === 'label').map((l) => [l.id, 'Latest: NeelaMoth']),
      ),
    }),
  )
}

describe('built-in themes', () => {
  for (const t of themes)
    for (const s of t.content.scenes) {
      it(`${t.name}: ${s.name} renders every layer and its mark`, () => {
        scenePage(s.layers)
        const layers = s.layers.filter((l) => l.kind === 'layer')
        expect(deepAll(root, '.fc-w-layer')).toHaveLength(layers.length)
        expect(deepAll(root, '.fc-brand')).toHaveLength(s.layers.filter(isBrandLayer).length)
        for (const l of layers)
          if (l.kind === 'layer' && l.config.type === 'text') {
            if (typeof l.config.countdown === 'number')
              expect(deepText(root)).toMatch(/\d{1,2}:\d{2}/)
            else expect(deepText(root)).toContain(l.config.text.slice(0, 12))
          }
        for (const l of s.layers.filter((x) => x.kind !== 'layer'))
          expect(deepAll(root, `.fc-w-${l.kind}`).length, `${l.kind} widget`).toBeGreaterThan(0)
        // Styled widgets carry their variant.
        for (const l of s.layers)
          if (l.kind !== 'layer' && (l.config as { style?: { variant?: string } }).style?.variant)
            expect(
              deepAll(
                root,
                `[data-variant="${(l.config as { style: { variant: string } }).style.variant}"]`,
              ).length,
            ).toBeGreaterThan(0)
      })
    }

  it('the streamer’s copy of a theme has no mark layer', () => {
    for (const t of themes) {
      const mine = intoUser(t, 'mine', { type: 'duplicate', from: t.name }, 0)
      if (mine.kind !== 'theme') continue
      for (const s of mine.content.scenes) expect(s.layers.some(isBrandLayer)).toBe(false)
    }
  })

  it('a hidden layer stays in the page but is not shown; rotation and opacity apply', () => {
    const s = themes[0]!.content.scenes[2]!
    const layers = s.layers.map((l, i) =>
      i === 1 ? { ...l, hidden: true, rotation: 12, opacity: 0.5 } : l,
    )
    scenePage(layers)
    const el = deepAll(root, '.fc-w-layer')[1] as HTMLElement
    expect(el.classList.contains('is-user-hidden')).toBe(true)
    expect(el.style.rotate).toBe('12deg')
    expect(el.style.opacity).toBe('0.5')
  })
})

describe('built-in widget designs', () => {
  for (const d of widgetDesigns)
    it(`${d.name} styles its ${d.content.widget} widget and carries the mark`, () => {
      const w = {
        id: 'styled',
        kind: d.content.widget,
        x: 100,
        y: 100,
        w: d.content.w,
        h: d.content.h,
        config: { ...d.content.config, style: d.content.style, design_id: d.id, branded: true },
      } as Widget
      scenePage([w])
      const el = deepAll(root, `.fc-w-${d.content.widget}`)[0] as HTMLElement
      expect(el.dataset.variant).toBe(d.content.style.variant)
      expect(el.classList.contains('is-styled')).toBe(true)
      expect(deepAll(el, '.fc-w-brand')).toHaveLength(1)
      if (d.content.style.accent)
        expect(el.style.getPropertyValue('--t-accent')).toBe(d.content.style.accent)
      // Without the branded flag (the streamer's own copy): no mark.
      rt.apply(
        frame('config', overlay([{ ...w, config: { ...w.config, branded: false } } as Widget])),
      )
      expect(deepAll(root, '.fc-w-brand')).toHaveLength(0)
    })

  it('bad style values never reach CSS', () => {
    const w = {
      id: 'evil',
      kind: 'label',
      x: 0,
      y: 0,
      w: 300,
      h: 60,
      config: {
        source: 'latest_follower',
        template: '{value}',
        theme: 'molten',
        style: { accent: 'url(https://x.test/a)', font: "a';}", variant: 'Big Bar' },
      },
    } as unknown as Widget
    scenePage([w])
    const el = deepAll(root, '.fc-w-label')[0] as HTMLElement
    expect(el.style.getPropertyValue('--t-accent')).toBe('')
    expect(el.dataset.variant).toBeUndefined()
    expect(el.getAttribute('style') ?? '').not.toContain('x.test')
  })
})

describe('built-in scene designs (rotators, timers, now playing)', () => {
  for (const d of sceneDesigns)
    it(`${d.name} renders every layer and its mark, and a copy has none`, () => {
      scenePage(d.content.layers)
      const layers = d.content.layers.filter((l) => l.kind === 'layer')
      expect(deepAll(root, '.fc-w-layer')).toHaveLength(layers.length)
      expect(deepAll(root, '.fc-brand')).toHaveLength(1)
      const mine = intoUser(d, 'mine', { type: 'duplicate', from: d.name }, 0)
      if (mine.kind !== 'scene') return
      rt.apply(frame('config', overlay(mine.content.layers)))
      expect(deepAll(root, '.fc-brand')).toHaveLength(0)
    })
})

const layer = (id: string, config: Record<string, unknown>, box = [100, 100, 600, 200]): Widget =>
  ({ id, kind: 'layer', x: box[0], y: box[1], w: box[2], h: box[3], config }) as unknown as Widget

describe('library layers', () => {
  it('a rotator shows its lines in turn, as text, and stops when hidden', () => {
    scenePage([
      layer('rot', {
        type: 'text',
        text: 'twitch.tv/me',
        rotate: ['youtube @me', XSS[0]],
        rotate_s: 3,
      }),
    ])
    const t = () => (deepAll(root, '.fc-lt')[0] as HTMLElement).textContent
    expect(t()).toBe('twitch.tv/me')
    // Without Web Animations the lines swap straight away.
    ;(Element.prototype as unknown as { animate: unknown }).animate = undefined
    vi.advanceTimersByTime(3000)
    expect(t()).toBe('youtube @me')
    vi.advanceTimersByTime(3000)
    expect(t()).toBe(XSS[0])
    rt.setVisible(false)
    const before = t()
    vi.advanceTimersByTime(9000)
    expect(t()).toBe(before)
    expect(deepAll(root, 'img, script, svg[onload]')).toHaveLength(0)
  })

  it('a countdown counts down from when it shows, then says it is done', () => {
    scenePage([
      layer('cd', {
        type: 'text',
        text: 'Live in {time}',
        countdown: 65,
        countdown_done: 'Live now',
      }),
    ])
    const t = () => (deepAll(root, '.fc-lt')[0] as HTMLElement).textContent
    expect(t()).toBe('Live in 01:05')
    vi.advanceTimersByTime(6000)
    expect(t()).toBe('Live in 00:59')
    vi.advanceTimersByTime(60_000)
    expect(t()).toBe('Live now')
  })

  it('draws silhouettes, patterns, frame variants and text effects; bad values are ignored', () => {
    scenePage([
      layer('clip', { type: 'shape', shape: 'rect', fill: '#ff0000', clip: 'star' }),
      layer('tile', {
        type: 'shape',
        shape: 'rect',
        fill: '#ffffff',
        pattern: 'grid',
        pattern_scale: 2,
      }),
      layer('parts', {
        type: 'shape',
        shape: 'rect',
        fill: '#ffffff',
        pattern: 'confetti',
        pattern_scale: 4,
      }),
      layer('frame', { type: 'frame', style: 'line', variant: 'hud', color: '#d4ff2a' }),
      layer('fx', { type: 'text', text: 'Hello', effect: 'glitch', color2: '#00ffff' }),
      layer('bad', {
        type: 'shape',
        clip: 'url(x)',
        pattern: 'evil();',
        fill: 'red;}',
        variant: '<b>',
      }),
      layer('badtext', { type: 'text', text: 'x', effect: 'javascript:1', split: 'nope' }),
    ])
    const shapes = deepAll(root, '.fc-shape') as HTMLElement[]
    expect(shapes[0]!.style.clipPath).toContain('polygon(')
    expect(deepAll(root, '.fc-pat-grid')).toHaveLength(1)
    const pts = deepAll(root, '.fc-pf-confetti .fc-pt')
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.length).toBeLessThanOrEqual(48)
    expect(deepAll(root, '.fv-hud .fv-br')).toHaveLength(4)
    expect(deepAll(root, '.fx-glitch')).toHaveLength(1)
    expect((deepAll(root, '.fx-glitch .fc-lt')[0] as HTMLElement).dataset.text).toBe('Hello')
    const bad = shapes[3]!
    expect(bad.style.clipPath).toBe('')
    expect(bad.getAttribute('style') ?? '').not.toMatch(/url|evil|red;/)
    expect(deepAll(root, '[class*="fx-javascript"]')).toHaveLength(0)
  })

  it('particles only drift when the layer loops, and never in low motion', () => {
    const moving = layer('snow', {
      type: 'shape',
      fill: '#ffffff',
      pattern: 'snow',
      anim: { in: 'fade', delay_ms: 0, loop: 'float' },
    })
    scenePage([moving])
    expect((deepAll(root, '.fc-w-layer')[0] as HTMLElement).classList.contains('is-moving')).toBe(
      true,
    )
    rt.destroy()
    root.replaceChildren()
    rt = createOverlay(root, { send: () => undefined, audio: false, lowMotion: true })
    scenePage([moving])
    expect((deepAll(root, '.fc-w-layer')[0] as HTMLElement).classList.contains('is-moving')).toBe(
      false,
    )
  })

  it('letters enter one by one when a title is split, as created text only', () => {
    scenePage([
      layer('t', {
        type: 'text',
        text: 'Hi there',
        split: 'letters',
        anim: { in: 'rise', delay_ms: 0, loop: 'none' },
      }),
    ])
    expect(deepAll(root, '.fc-layer-text .ch')).toHaveLength(7)
    expect(calls.filter((c) => c.el.classList.contains('ch')).length).toBe(7)
  })

  it('every built-in scene renders without errors in low motion too', () => {
    const errors = vi.spyOn(console, 'warn')
    for (const d of [...themes, ...sceneDesigns])
      for (const s of d.kind === 'theme' ? d.content.scenes : [d.content]) {
        rt.destroy()
        root.replaceChildren()
        rt = createOverlay(root, { send: () => undefined, audio: false, lowMotion: true })
        scenePage(s.layers)
        expect(deepAll(root, '.is-moving'), `${d.id}/${s.key}`).toHaveLength(0)
      }
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('library alerts', () => {
  it('every alert look plays in low motion with the CSS guard in place', () => {
    rt.destroy()
    root.replaceChildren()
    rt = createOverlay(root, { send: () => undefined, audio: false, lowMotion: true })
    for (const d of alertDesigns) {
      play(previewAlert(d, 'raid', { id: `low-${d.id}` }) as RenderedAlert)
      expect(deepAll(root, '.fa-stage.low').length, d.id).toBeGreaterThan(0)
    }
  })
})
