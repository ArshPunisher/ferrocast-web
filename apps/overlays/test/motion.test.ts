// The motion designer's playback (1.1) in the real alert renderer: 1.0 looks play exactly as
// before, the new entrances, text effects, exits and idle loops start, impacts land at the
// hit, freeze while OBS hides the source, follow reduced motion, and impact sounds only play
// when the look asks for them and the alert's sound may play.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MOTION,
  EXIT_MS,
  MOTION_IN,
  MOTION_OUT,
  MOTION_TEXT,
  IDLES,
  SPOTS,
  baseLook,
  newAlertDesign,
  previewAlert,
  type AlertLook,
  type Motion,
  type RenderedAlert,
} from '@ferrocast/api'

const played: { name: string; k: number; volume: number }[] = []
vi.mock('../src/design/impact-sound', async (orig) => {
  const real = await orig<typeof import('../src/design/impact-sound')>()
  return {
    ...real,
    playImpact: (name: string, k: number, volume: number) => played.push({ name, k, volume }),
  }
})

const { buildDesignAlert } = await import('../src/design/alert')

let calls: { kf: Keyframe[]; opts: KeyframeAnimationOptions; el: Element; a: FakeAnim }[]
const realAnimate = Element.prototype.animate
interface FakeAnim {
  state: string
  cancel(): void
  pause(): void
  play(): void
  commitStyles(): void
  readonly playState: string
  effect: unknown
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  calls = []
  played.length = 0
  ;(Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    kf: Keyframe[],
    opts: KeyframeAnimationOptions,
  ) {
    return fakeAnimation(this, kf, opts)
  }
})

function fakeAnimation(target: Element, kf: Keyframe[], opts: KeyframeAnimationOptions): Animation {
  const a: FakeAnim = {
    state: 'running',
    cancel() {
      this.state = 'idle'
    },
    pause() {
      this.state = 'paused'
    },
    play() {
      this.state = 'running'
    },
    commitStyles() {},
    get playState() {
      return this.state
    },
    effect: {
      target,
      getTiming: () => ({ iterations: opts.iterations ?? 1 }),
      getKeyframes: () => kf,
    },
  }
  calls.push({ kf, opts, el: target, a })
  return a as unknown as Animation
}
afterEach(() => {
  vi.useRealTimers()
  ;(Element.prototype as unknown as { animate: unknown }).animate = realAnimate
})

function alertWith(anim: Partial<AlertLook['anim']>, motion?: Partial<Motion>): RenderedAlert {
  const look = baseLook({
    anim: { ...baseLook().anim, ...anim },
    ...(motion ? { motion: { ...DEFAULT_MOTION, ...motion } } : {}),
  })
  if (!motion) delete (look as { motion?: unknown }).motion
  const d = newAlertDesign('Mine', look)
  const a = previewAlert(d, 'tip', { id: 'm1' })
  if (!a) throw new Error('no preview')
  return a
}

function mount(a: RenderedAlert, opts: { lowMotion?: boolean; impactSound?: boolean } = {}) {
  const d = buildDesignAlert(a, {
    lowMotion: opts.lowMotion ?? false,
    impactSound: opts.impactSound ?? false,
  })
  document.body.appendChild(d.host)
  const root = d.host.shadowRoot as ShadowRoot
  return { d, root, card: root.querySelector('.fa') as HTMLElement }
}

const on = (el: Element | null) => calls.filter((c) => c.el === el)

describe('a 1.0 look', () => {
  it('sits in the middle, inside the motion layers, and plays its own keyframes', () => {
    const { d, root, card } = mount(alertWith({ in: 'magnet', out: 'sink', text: 'wave' }))
    expect(root.querySelector('.fa-pos')?.getAttribute('data-spot')).toBe('mc')
    expect(card.parentElement?.className).toBe('fa-wrap')
    d.start()
    const enter = on(card)[0]
    expect(enter?.opts.duration).toBe(650)
    expect(enter?.opts.delay).toBe(0)
    expect(JSON.stringify(enter?.kf)).toContain('translateY(36px)')
    // Nothing a 1.0 alert never had: no canvas, flash, vignette or idle loop.
    vi.advanceTimersByTime(8000)
    expect(root.querySelector('canvas, .fa-flash, .fa-vig')).toBeNull()
    expect(calls.some((c) => c.opts.iterations === Infinity)).toBe(false)
    expect(d.exit()).toBe(450)
    d.destroy()
  })
})

describe('the motion designer’s entrances', () => {
  for (const id of MOTION_IN)
    it(`${id} starts and lands without throwing`, () => {
      const { d, card } = mount(alertWith({ in: id, out: 'fade' }, {}))
      expect(() => d.start()).not.toThrow()
      expect(on(card).length).toBeGreaterThan(0)
      expect(() => vi.advanceTimersByTime(3000)).not.toThrow()
      d.destroy()
    })

  it('Slam flashes, shakes and punches at its hit (170 ms), not before', () => {
    const { d, root } = mount(alertWith({ in: 'slam' }, {}))
    d.start()
    vi.advanceTimersByTime(150)
    expect(root.querySelector('.fa-flash')).toBeNull()
    vi.advanceTimersByTime(40)
    const flash = root.querySelector('.fa-flash')
    expect(flash).not.toBeNull()
    expect(on(root.querySelector('.fa-shk')).length).toBe(1)
    expect(on(root.querySelector('.fa-punch')).length).toBe(1)
    d.destroy()
  })

  it('impact switches turn each effect off', () => {
    const { d, root } = mount(
      alertWith({ in: 'slam' }, { shake: false, flash: false, vignette: false, zoom_punch: false }),
    )
    d.start()
    vi.advanceTimersByTime(400)
    expect(on(root.querySelector('.fa-shk'))).toHaveLength(0)
    expect(on(root.querySelector('.fa-punch'))).toHaveLength(0)
    expect(on(root.querySelector('.fa-flash'))).toHaveLength(0)
    d.destroy()
  })

  it('waits for the beat before the entrance', () => {
    const { d, card } = mount(alertWith({ in: 'bolt' }, { beat: true, bpm: 120 }))
    d.start()
    // 120 BPM: a beat is 500 ms; the hit (150 ms) lands on beat 2 at 1000 ms.
    expect(on(card)[0]?.opts.delay).toBeCloseTo(850)
    d.destroy()
  })

  it('freezes while hidden and carries on when shown', () => {
    const { d, root } = mount(alertWith({ in: 'slam' }, {}))
    d.start()
    d.pause()
    vi.advanceTimersByTime(1000)
    expect(root.querySelector('.fa-flash')).toBeNull()
    d.resume()
    vi.advanceTimersByTime(400)
    expect(root.querySelector('.fa-flash')).not.toBeNull()
    d.destroy()
  })
})

describe('text effects', () => {
  for (const id of MOTION_TEXT)
    it(`${id} runs with a 1.1 and a 1.0 entrance`, () => {
      for (const enter of ['slam', 'fade'] as const) {
        const { d } = mount(alertWith({ in: enter, text: id }, {}))
        expect(() => d.start()).not.toThrow()
        expect(() => vi.advanceTimersByTime(4000)).not.toThrow()
        d.destroy()
      }
    })

  it('Decode puts every letter back', () => {
    const a = alertWith({ in: 'slam', text: 'decode' }, {})
    const { d, root } = mount(a)
    const before = root.querySelector('.fa-title')?.textContent
    d.start()
    vi.advanceTimersByTime(6000)
    expect(root.querySelector('.fa-title')?.textContent).toBe(before)
    d.destroy()
  })

  it('the Typewriter cursor goes away', () => {
    const { d, root } = mount(alertWith({ in: 'fade', text: 'type' }, {}))
    d.start()
    // A 1.0 entrance: the text starts at 35% of 650 ms plus the 300 ms delay.
    vi.advanceTimersByTime(700)
    expect(root.querySelector('.fa-caret')).not.toBeNull()
    vi.advanceTimersByTime(4000)
    expect(root.querySelector('.fa-caret')).toBeNull()
    d.destroy()
  })
})

describe('exits and idle loops', () => {
  for (const id of MOTION_OUT)
    it(`${id} plays and reports its length`, () => {
      const { d } = mount(alertWith({ in: 'slam', out: id }, {}))
      d.start()
      vi.advanceTimersByTime(2000)
      const ms = d.exit()
      expect(ms).toBe(EXIT_MS[id])
      expect(() => vi.advanceTimersByTime(ms + 100)).not.toThrow()
      d.destroy()
    })

  for (const id of IDLES.filter((i) => i !== 'none'))
    it(`${id} loops while it holds and ends before the exit`, () => {
      const { d } = mount(alertWith({ in: 'slam', out: 'fade' }, { idle: id }))
      d.start()
      vi.advanceTimersByTime(2000)
      const loops = calls.filter((c) => c.opts.iterations === Infinity)
      expect(loops.length).toBeGreaterThan(0)
      d.exit()
      for (const l of loops) expect(l.a.playState).toBe('idle')
      d.destroy()
    })

  it('speed shortens the exit', () => {
    const { d } = mount(alertWith({ in: 'slam', out: 'shatter' }, { speed: 160 }))
    d.start()
    expect(d.exit()).toBe(Math.round(1000 / 1.6))
    d.destroy()
  })
})

describe('placement', () => {
  for (const spot of SPOTS)
    it(`puts the card at ${spot}`, () => {
      const { root } = mount(alertWith({}, { position: spot }))
      expect(root.querySelector('.fa-pos')?.getAttribute('data-spot')).toBe(spot)
    })
})

describe('reduced motion', () => {
  it('turns a 1.1 entrance and exit into short fades with no impacts', () => {
    const { d, root, card } = mount(
      alertWith({ in: 'slam', out: 'shatter', text: 'cascade' }, {}),
      {
        lowMotion: true,
      },
    )
    d.start()
    expect(on(card)[0]?.opts.duration).toBe(240)
    vi.advanceTimersByTime(2000)
    expect(root.querySelector('.fa-flash, canvas')).toBeNull()
    expect(root.querySelector('.ch') && on(root.querySelector('.ch'))).toHaveLength(0)
    expect(d.exit()).toBe(220)
    d.destroy()
  })
})

describe('impact sounds', () => {
  it('stay silent unless the look switches them on (off by default)', () => {
    const { d } = mount(alertWith({ in: 'slam' }, {}), { impactSound: true })
    d.start()
    vi.advanceTimersByTime(2000)
    expect(played).toHaveLength(0)
    d.destroy()
  })

  it('stay silent where the alert’s own sound may not play', () => {
    const { d } = mount(alertWith({ in: 'slam' }, { impact_sounds: true }), { impactSound: false })
    d.start()
    vi.advanceTimersByTime(2000)
    expect(played).toHaveLength(0)
    d.destroy()
  })

  it('land with the hit at the look’s volume, without doubling the opening sound', () => {
    const a = alertWith({ in: 'portal' }, { impact_sounds: true })
    const { d } = mount(a, { impactSound: true })
    d.start()
    vi.advanceTimersByTime(2000)
    // The look has its own sound (a chime), so the portal's opening whoosh is skipped.
    expect(played.map((p) => p.name)).not.toContain('portal')
    expect(played.every((p) => p.volume === a.design?.look.sound.volume)).toBe(true)
    d.destroy()
    played.length = 0
    const quiet = alertWith({ in: 'slam' }, { impact_sounds: true })
    if (quiet.design) quiet.design.look.sound.builtin = 'none'
    const m = mount(quiet, { impactSound: true })
    m.d.start()
    vi.advanceTimersByTime(300)
    expect(played.map((p) => p.name)).toContain('thud')
    m.d.destroy()
  })
})

describe('leaving early (review fixes)', () => {
  it('a skip during Shatter in leaves no shards behind', () => {
    const { d, root } = mount(alertWith({ in: 'shatter', out: 'fade' }, {}))
    d.start()
    vi.advanceTimersByTime(100)
    expect(root.querySelectorAll('.fa-shard').length).toBeGreaterThan(0)
    d.exit()
    expect(root.querySelectorAll('.fa-shard')).toHaveLength(0)
    d.destroy()
  })

  it('a skip during Decode puts the name back', () => {
    const { d, root } = mount(alertWith({ in: 'slam', text: 'decode' }, {}))
    const before = root.querySelector('.fa-title')?.textContent
    d.start()
    vi.advanceTimersByTime(400)
    d.exit()
    expect(root.querySelector('.fa-title')?.textContent).toBe(before)
    for (const ch of Array.from(root.querySelectorAll<HTMLElement>('.ch')))
      expect(ch.style.width).toBe('')
    d.destroy()
  })

  it('a 1.0 Typewriter types without the new cursor', () => {
    const { d, root } = mount(alertWith({ in: 'fade', text: 'type' }))
    d.start()
    vi.advanceTimersByTime(700)
    expect(root.querySelector('.fa-caret')).toBeNull()
    d.destroy()
  })

  it('reduced motion still skips an opening hit when the look has its own sound', () => {
    const { d } = mount(alertWith({ in: 'portal' }, { impact_sounds: true }), {
      lowMotion: true,
      impactSound: true,
    })
    d.start()
    vi.advanceTimersByTime(500)
    expect(played.map((p) => p.name)).not.toContain('portal')
    d.destroy()
  })
})
