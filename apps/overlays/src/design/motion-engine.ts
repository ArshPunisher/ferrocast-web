// The motion designer's entrances, text effects, exits, idle loops, particles and impacts
// (API.md §4 Designs, `motion`, 1.1), ported from the approved motion board. The same code
// plays the alert in OBS, in the designer's preview and in the designer's little swatches, so
// what the streamer picks is exactly what goes on stream.
//
// Movement is Web Animations on transform, opacity, filter and clip-path (R-38), sampled from
// springs at 60 fps where a spring is needed; particles share one canvas. Every timer goes
// through a pausable clock, so an alert frozen while OBS hides the source carries on where it
// stopped.

import type {
  Motion,
  MotionIdle,
  MotionIn,
  MotionOut,
  MotionParticles,
  TextAnim,
} from '@ferrocast/api/types'
import {
  PALETTES,
  entranceTiming,
  springOf,
  staggerFor,
  typeStep,
  type Spring,
} from '@ferrocast/api/motion'
import { Particles } from './motion-fx'
import { playImpact, type ImpactSound } from './impact-sound'

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const eo3 = (t: number) => 1 - Math.pow(1 - t, 3)
const eo5 = (t: number) => 1 - Math.pow(1 - t, 5)
const ei2 = (t: number) => t * t
const ei3 = (t: number) => t * t * t
const eio = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const R = Math.random
const rs = (a = 1) => (R() * 2 - 1) * a
/** A small seeded generator, so shards and glitches cut the same way every time. */
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

type Dir = { x: number; y: number }
type DirName = 'top' | 'bottom' | 'left' | 'right'
const DIRS: Record<DirName, Dir> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const ORIG: Record<DirName, string> = {
  top: '50% 100%',
  bottom: '50% 0%',
  left: '100% 50%',
  right: '0% 50%',
}
const axisScale = (d: Dir, along: number, across: number) =>
  d.x ? `scale(${along}, ${across})` : `scale(${across}, ${along})`

// ------------------------------------------------------------------ the view

/** What the engine moves. An alert design and a designer swatch both provide one. */
export interface MotionView {
  /** The logical canvas (800×450 for an alert). */
  readonly W: number
  readonly H: number
  readonly stage: HTMLElement
  /** Zoom punch, shake, placement and idle layers, outside in. */
  readonly punch: HTMLElement
  readonly shk: HTMLElement
  readonly wrap: HTMLElement
  /** The card itself. */
  readonly card: HTMLElement
  /** The headline's letters. */
  chars(): HTMLElement[]
  /** The light band on the card's plate, or null (a card without a plate). */
  readonly sheen: HTMLElement | null
  readonly flash: HTMLElement
  readonly vig: HTMLElement
  readonly fx: Particles
  /** The look's colours, for "Your colours" particles and the effects' glows. */
  readonly colors: { accent: string; highlight: string; text: string }
  /** Swatches: fewer particles, no sound. */
  readonly mini: boolean
  /** A copy of the card for ghosts and shards (no videos, hidden from screen readers). */
  clone(cls: string): HTMLElement
}

/** The wrap's box in canvas units. */
function box(v: MotionView) {
  const s = v.stage.getBoundingClientRect()
  const r = v.wrap.getBoundingClientRect()
  const u = s.width > 0 ? s.width / v.W : 1
  const x = (r.left - s.left) / u
  const y = (r.top - s.top) / u
  const w = r.width / u
  const h = r.height / u
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, W: v.W, H: v.H }
}

// ------------------------------------------------------------------ the clock

/** setTimeout that can be frozen and thawed (OBS hiding the source). */
export class Clock {
  private items = new Set<{
    due: number
    fn: () => void
    h: ReturnType<typeof setTimeout> | null
  }>()
  private pausedAt: number | null = null
  private dead = false

  at(ms: number, fn: () => void): void {
    if (this.dead) return
    const item = {
      due: performance.now() + Math.max(0, ms),
      fn,
      h: null as ReturnType<typeof setTimeout> | null,
    }
    this.items.add(item)
    if (this.pausedAt === null) this.arm(item)
  }

  private arm(item: { due: number; fn: () => void; h: ReturnType<typeof setTimeout> | null }) {
    item.h = setTimeout(
      () => {
        this.items.delete(item)
        if (!this.dead) item.fn()
      },
      Math.max(0, item.due - performance.now()),
    )
  }

  pause(): void {
    if (this.pausedAt !== null) return
    this.pausedAt = performance.now()
    for (const i of this.items) if (i.h) clearTimeout(i.h)
  }

  resume(): void {
    if (this.pausedAt === null) return
    const gap = performance.now() - this.pausedAt
    this.pausedAt = null
    for (const i of this.items) {
      i.due += gap
      this.arm(i)
    }
  }

  kill(): void {
    this.dead = true
    for (const i of this.items) if (i.h) clearTimeout(i.h)
    this.items.clear()
  }
}

// ------------------------------------------------------------------ context

export interface ImpactOpts {
  shake?: number
  flash?: number
  fc?: string
  punch?: number
  fx?: Burst[]
  /** The entrance's own particles ("Match the entrance"); null for none. */
  burst?: Burst | null
  snd?: ImpactSound
}

export type Burst =
  | 'confetti'
  | 'sparks'
  | 'petals'
  | 'coins'
  | 'embers'
  | 'stars'
  | 'dust'
  | 'ring'
  | 'speed'
  | 'pop'

export interface MotionHost {
  /** Every animation the engine starts, so the alert can pause, resume and end them. */
  track(a: Animation): Animation
  clock: Clock
  /** Whether hits may sound (the alert's audio is on and the look wants impact sounds). */
  sound: boolean
  /** The look plays its own sound at the start: skip the entrance's opening hit. */
  ownSound: boolean
  volume: number
  /**
   * Keeps a clean-up (remove a temporary layer, put a letter back) to run when the alert
   * leaves early: an exit or a skip during the entrance must never leave shards or junk
   * letters behind. Each clean-up may run twice; they're all idempotent.
   */
  onEnd?: (fn: () => void) => void
}

export class Ctx {
  readonly sp: Spring
  readonly speed: number
  /** Intensity: bigger amounts hit harder. */
  readonly k: number
  /** Real ms added to every design time (the beat delay). */
  off = 0
  speedDir: Dir | null = null
  /** Swatches force a particle type ("auto" uses the entrance's own). */
  forceParts?: MotionParticles

  constructor(
    readonly v: MotionView,
    readonly m: Motion,
    readonly host: MotionHost,
    k: number,
  ) {
    this.sp = springOf(m.bounce)
    this.speed = Math.min(1.6, Math.max(0.6, m.speed / 100))
    this.k = v.mini ? 1 : k
  }

  dirName(def: DirName): DirName {
    return this.m.direction === 'auto' ? def : this.m.direction
  }

  at(ms: number, fn: () => void): void {
    this.host.clock.at(this.off + ms / this.speed, fn)
  }

  /** Runs `fn` at design time `ms`, or straight away if the alert leaves first. */
  tidy(ms: number, fn: () => void): void {
    this.host.onEnd?.(fn)
    this.at(ms, fn)
  }

  every(from: number, to: number, every: number, fn: (t: number) => void): void {
    for (let t = from; t <= to; t += every) this.at(t, () => fn(t))
  }

  /** Samples fn(t) (design ms) at about 60 fps into keyframes. */
  bake(el: Element, T: number, fn: (t: number) => Keyframe, delay = 0): Animation | null {
    const n = Math.max(2, Math.round(T / 16))
    const fr: Keyframe[] = []
    for (let i = 0; i <= n; i++) fr.push(fn((T * i) / n))
    return this.animate(el, fr, {
      duration: T / this.speed,
      delay: this.off + delay / this.speed,
      fill: 'both',
    })
  }

  anim(
    el: Element,
    frames: Keyframe[],
    T: number,
    o: { delay?: number; easing?: string; iterations?: number } = {},
  ): Animation | null {
    return this.animate(el, frames, {
      duration: T / this.speed,
      delay: this.off + (o.delay ?? 0) / this.speed,
      fill: 'both',
      easing: o.easing ?? 'linear',
      iterations: o.iterations ?? 1,
    })
  }

  animate(el: Element, frames: Keyframe[], o: KeyframeAnimationOptions): Animation | null {
    if (typeof (el as HTMLElement).animate !== 'function') return null
    try {
      return this.host.track((el as HTMLElement).animate(frames, o))
    } catch {
      return null
    }
  }

  /** A hit, at the look's volume. `opening` sounds are skipped when the look has its own. */
  sfx(name: ImpactSound, k = this.k, opening = false): void {
    if (this.v.mini || !this.host.sound || (opening && this.host.ownSound)) return
    playImpact(name, k, this.host.volume)
  }

  impact(o: ImpactOpts): void {
    impact(this, o)
  }

  palette(): string[] {
    const m = this.m
    if (m.colors === 'custom')
      return [
        m.custom_color,
        mix(m.custom_color, '#ffffff', 0.45),
        mix(m.custom_color, '#000000', 0.25),
      ]
    if (m.colors === 'brand') {
      const c = this.v.colors
      return [
        c.accent,
        c.highlight,
        c.text,
        mix(c.highlight, '#ffffff', 0.45),
        mix(c.accent, '#000000', 0.25),
      ]
    }
    return [...PALETTES[m.colors]]
  }
}

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    let x = h.replace('#', '')
    if (x.length === 3 || x.length === 4) x = [...x.slice(0, 3)].map((c) => c + c).join('')
    const n = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16))
    return n.every((v) => Number.isFinite(v)) ? n : [255, 255, 255]
  }
  const A = p(a)
  const B = p(b)
  return (
    '#' +
    A.map((v, i) =>
      Math.round(lerp(v, B[i] ?? v, t))
        .toString(16)
        .padStart(2, '0'),
    ).join('')
  )
}

function partsFor(c: Ctx, def: Burst | null): Burst | null {
  const p = c.forceParts ?? c.m.particles
  if (p === 'auto') return def
  if (p === 'none') return null
  return p
}

function impact(c: Ctx, o: ImpactOpts): void {
  const v = c.v
  const k = c.k
  const m = c.m
  if (o.snd) c.sfx(o.snd, k)
  if (o.shake && m.shake) shake(c, o.shake * k)
  if (o.flash && m.flash) {
    const bg = o.fc ?? '#ffffff'
    c.animate(
      v.flash,
      [
        { opacity: 0, background: bg },
        { opacity: Math.min(0.85, o.flash * (0.6 + 0.4 * k)), background: bg, offset: 0.08 },
        { opacity: 0, background: bg },
      ],
      { duration: 420, easing: EASE_OUT },
    )
  }
  if (o.shake && m.vignette)
    c.animate(
      v.vig,
      [{ opacity: 0 }, { opacity: Math.min(1, 0.55 + 0.25 * k), offset: 0.15 }, { opacity: 0 }],
      { duration: 900, easing: 'ease-out' },
    )
  if (o.punch && m.zoom_punch) {
    const z = 1 + 0.03 * o.punch * k
    c.animate(
      v.punch,
      [
        { transform: 'scale(1)' },
        { transform: `scale(${z})`, offset: 0.12 },
        { transform: 'scale(1)' },
      ],
      { duration: 480, easing: EASE_OUT },
    )
  }
  for (const t of o.fx ?? []) burst(c, t)
  if (o.burst !== undefined) {
    const t = partsFor(c, o.burst)
    if (t) {
      burst(c, t)
      if (['coins', 'confetti', 'stars'].includes(t) && o.burst !== t)
        c.sfx(t === 'coins' ? 'coin' : 'sparkle', k)
    }
  }
}

function shake(c: Ctx, amt: number): void {
  const A = c.v.W * 0.012 * amt
  const n = 12
  const fr: Keyframe[] = []
  for (let i = 0; i < n; i++) {
    const d = Math.pow(1 - i / n, 2)
    fr.push({
      transform: `translate(${rs(A * d).toFixed(2)}px, ${rs(A * d).toFixed(2)}px) rotate(${rs(0.9 * amt * d).toFixed(2)}deg)`,
    })
  }
  fr.push({ transform: 'none' })
  c.animate(c.v.shk, fr, { duration: 460 })
}

// ------------------------------------------------------------------ particles

export function burst(c: Ctx, type: Burst): void {
  const v = c.v
  const fx = v.fx
  const b = box(v)
  if (!b.W || !b.w) return
  const sc = Math.max(0.12, b.W / 900)
  const k = c.k
  const pal = c.palette()
  const pick = () => pal[(R() * pal.length) | 0] ?? '#ffffff'
  const N = (n: number) => Math.max(3, Math.round(n * k * (v.mini ? 0.3 : 1)))
  const sz = (a: number) => Math.max(v.mini ? 1 : 1.5, a * sc)
  switch (type) {
    case 'confetti':
      for (let i = 0; i < N(80); i++) {
        const an = -1.571 + rs(1.15)
        const s = (420 + R() * 680) * sc
        fx.add({
          kind: 'rect',
          x: b.cx + rs(b.w * 0.35),
          y: b.cy,
          vx: Math.cos(an) * s,
          vy: Math.sin(an) * s,
          g: 1200 * sc,
          drag: 0.22,
          size: sz(7 + R() * 7),
          rot: R() * 6,
          vr: rs(12),
          flip: 7 + R() * 10,
          ph: R() * 6,
          sway: 30 * sc,
          sf: 5,
          color: pick(),
          life: 1.5 + R(),
          fp: 3,
        })
      }
      break
    case 'sparks':
      for (let i = 0; i < N(46); i++) {
        const an = R() * 6.283
        const s = (500 + R() * 900) * sc
        fx.add({
          kind: 'line',
          add: true,
          x: b.cx + Math.cos(an) * b.w * 0.3,
          y: b.cy + Math.sin(an) * b.h * 0.3,
          vx: Math.cos(an) * s,
          vy: Math.sin(an) * s,
          g: 700 * sc,
          drag: 0.04,
          size: sz(2.2),
          len: 0.03,
          color: R() < 0.5 ? '#fff4d6' : pick(),
          life: 0.35 + R() * 0.45,
        })
      }
      break
    case 'petals':
      for (let i = 0; i < N(26); i++)
        fx.add({
          kind: 'petal',
          x: b.cx + rs(b.w * 0.8),
          y: b.y - R() * b.h,
          vx: rs(60) * sc,
          vy: (-80 - R() * 120) * sc,
          g: 160 * sc,
          drag: 0.5,
          size: sz(6 + R() * 5),
          rot: R() * 6,
          vr: rs(3),
          flip: 3 + R() * 3,
          ph: R() * 6,
          sway: 70 * sc,
          sf: 2 + R() * 2,
          color: pick(),
          life: 2.2 + R() * 1.2,
          fin: 0.2,
          fp: 3,
        })
      break
    case 'coins':
      for (let i = 0; i < N(24); i++) {
        const an = -1.571 + rs(0.65)
        const s = (600 + R() * 500) * sc
        fx.add({
          kind: 'coin',
          x: b.cx + rs(b.w * 0.2),
          y: b.cy,
          vx: Math.cos(an) * s,
          vy: Math.sin(an) * s,
          g: 1700 * sc,
          drag: 0.6,
          size: sz(7 + R() * 3),
          flip: 10 + R() * 8,
          ph: R() * 6,
          life: 1.4 + R() * 0.5,
          fp: 4,
        })
      }
      break
    case 'embers':
      for (let i = 0; i < N(40); i++)
        fx.add({
          kind: 'glow',
          add: true,
          x: b.x + R() * b.w,
          y: b.y + b.h * (0.5 + R() * 0.5),
          vx: rs(40) * sc,
          vy: (-70 - R() * 220) * sc,
          g: -40 * sc,
          drag: 0.5,
          size: sz(1.6 + R() * 1.8),
          sway: 50 * sc,
          sf: 3 + R() * 3,
          ph: R() * 6,
          color: R() < 0.6 ? '#ffa424' : '#ffd27a',
          life: 1 + R() * 1.3,
          fin: 0.1,
        })
      break
    case 'stars':
      for (let i = 0; i < N(18); i++) {
        const an = R() * 6.283
        const s = (160 + R() * 380) * sc
        fx.add({
          kind: 'star',
          pop: true,
          x: b.cx + Math.cos(an) * b.w * 0.25,
          y: b.cy + Math.sin(an) * b.h * 0.3,
          vx: Math.cos(an) * s,
          vy: Math.sin(an) * s,
          drag: 0.08,
          size: sz(5 + R() * 6),
          rot: R() * 6,
          vr: rs(4),
          color: pick(),
          life: 0.7 + R() * 0.5,
        })
      }
      break
    case 'dust':
      for (let i = 0; i < N(26); i++) {
        const side = R() < 0.5 ? -1 : 1
        fx.add({
          kind: 'dot',
          x: b.cx + side * b.w * (0.15 + R() * 0.35),
          y: b.y + b.h - R() * 4 * sc,
          vx: side * (160 + R() * 420) * sc,
          vy: (-10 - R() * 60) * sc,
          drag: 0.04,
          size: sz(1.5 + R() * 2.5),
          grow: 1.4,
          color: 'rgb(205 215 230 / 0.28)',
          life: 0.45 + R() * 0.4,
        })
      }
      break
    case 'ring':
      fx.add({
        kind: 'ring',
        x: b.cx,
        y: b.cy,
        r0: b.w * 0.3,
        r1: b.w * (0.85 + 0.25 * k),
        flat: 0.42,
        size: sz(6),
        color: '#ffffff',
        life: 0.5,
        fp: 1.2,
      })
      fx.add({
        kind: 'ring',
        x: b.cx,
        y: b.cy,
        r0: b.w * 0.2,
        r1: b.w * 0.65,
        flat: 0.42,
        size: sz(10),
        color: v.colors.accent,
        life: 0.42,
        add: true,
        a0: 0.6,
      })
      break
    case 'speed': {
      const d = c.speedDir ?? { x: 1, y: 0 }
      for (let i = 0; i < N(26); i++) {
        const L = (60 + R() * 160) * sc
        const sp = (1800 + R() * 1400) * sc
        fx.add({
          kind: 'streak',
          x: d.x ? R() * b.W : b.cx + rs(b.w * 0.8),
          y: d.x ? b.cy + rs(b.h * 1.4) : R() * b.H,
          vx: d.x * sp,
          vy: d.y * sp,
          dx: d.x * L,
          dy: d.y * L,
          size: sz(1.4),
          color: 'rgb(220 235 255 / 0.55)',
          life: 0.18 + R() * 0.22,
          fp: 1,
        })
      }
      break
    }
    case 'pop':
      fx.add({
        kind: 'ring',
        x: b.cx,
        y: b.cy,
        r0: 2,
        r1: b.h * 0.9,
        size: sz(5),
        color: '#ffffff',
        life: 0.35,
        add: true,
      })
      break
  }
}

function bolt(c: Ctx, ms: number): void {
  const v = c.v
  const b = box(v)
  if (!b.W || !b.w) return
  const pts: [number, number][] = []
  let x = b.cx + rs(b.w * 0.25)
  let y = -10
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    pts.push([x, y])
    y += (b.cy + 4 + 10) / steps
    x = lerp(x, b.cx, 0.25) + rs(b.w * 0.09)
  }
  const s = ms / 1000 / c.speed
  v.fx.add({
    kind: 'bolt',
    x: 0,
    y: 0,
    pts,
    draw: s,
    size: Math.max(1, (b.W / 900) * 3),
    color: '#8fe6ff',
    life: s + 0.22,
    fp: 4,
    add: true,
  })
}

// ------------------------------------------------------------------ multi-layer helpers

function shards(v: MotionView, seed: number) {
  const r = rng(seed)
  const C = 5
  const Rw = 2
  const P: [number, number][][] = []
  for (let i = 0; i <= C; i++) {
    const col: [number, number][] = []
    for (let j = 0; j <= Rw; j++) {
      const ex = i === 0 || i === C
      const ey = j === 0 || j === Rw
      col.push([
        (i / C) * 100 + (ex ? 0 : (r() * 2 - 1) * 6),
        (j / Rw) * 100 + (ey ? 0 : (r() * 2 - 1) * 18),
      ])
    }
    P.push(col)
  }
  const out: { el: HTMLElement; cx: number; cy: number; r: number }[] = []
  const at = (i: number, j: number) => (P[i] as [number, number][])[j] as [number, number]
  for (let i = 0; i < C; i++)
    for (let j = 0; j < Rw; j++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c2 = at(i + 1, j + 1)
      const d = at(i, j + 1)
      const tris =
        r() < 0.5
          ? [
              [a, b, c2],
              [a, c2, d],
            ]
          : [
              [a, b, d],
              [b, c2, d],
            ]
      for (const t of tris) {
        const el = v.clone('fa-shard')
        el.style.clipPath = `polygon(${t.map((p) => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`).join(',')})`
        const cx = (t[0]![0] + t[1]![0] + t[2]![0]) / 3
        const cy = (t[0]![1] + t[1]![1] + t[2]![1]) / 3
        el.style.transformOrigin = `${cx}% ${cy}%`
        out.push({ el, cx, cy, r: r() })
      }
    }
  return out
}

const wave = (level: number, t: number, amp: number, n = 12) => {
  const pts = ['0% 100%']
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100
    pts.push(`${x.toFixed(1)}% ${(level + Math.sin(i * 1.1 + t * 0.018) * amp).toFixed(2)}%`)
  }
  pts.push('100% 100%')
  return `polygon(${pts.join(',')})`
}

function layer(v: MotionView, cls: string): HTMLElement {
  const d = document.createElement('div')
  d.className = `fa-tmp ${cls}`
  d.setAttribute('aria-hidden', 'true')
  v.wrap.appendChild(d)
  return d
}

// ------------------------------------------------------------------ entrances

/** Plays an entrance from `c.off`. Returns its length in design ms. */
export function runEntrance(id: MotionIn, c: Ctx): number {
  const v = c.v
  const sp = c.sp
  const { T, hit: H } = entranceTiming(id, sp.dur)
  switch (id) {
    case 'slam':
      c.bake(v.card, T, (t) => {
        if (t < H) {
          const p = ei3(t / H)
          return {
            transform: `scale(${lerp(3.4, 1, p)}) rotate(${lerp(-9, 0, p)}deg)`,
            opacity: clamp(t / 50),
            filter: `blur(${lerp(9, 0, p).toFixed(2)}px)`,
          }
        }
        const s = sp(t - H)
        return {
          transform: `scale(${0.88 + 0.12 * s}) rotate(0deg)`,
          opacity: 1,
          filter: 'blur(0px)',
        }
      })
      c.at(H, () =>
        c.impact({
          shake: 1.2,
          flash: 0.55,
          punch: 1.2,
          fx: ['ring', 'dust'],
          burst: 'sparks',
          snd: 'thud',
        }),
      )
      return T
    case 'elastic': {
      const dn = c.dirName('top')
      const d = DIRS[dn]
      const b = box(v)
      const dist = (d.x ? b.W * 0.6 : b.H * 0.75) || 300
      v.card.style.transformOrigin = ORIG[dn]
      c.bake(v.card, T, (t) => {
        if (t < H) {
          const p = ei2(t / H)
          const st = 1 + 0.32 * p
          return {
            transform: `translate(${d.x * dist * (1 - p)}px, ${d.y * dist * (1 - p)}px) ${axisScale(d, st, 1 / Math.sqrt(st))}`,
            opacity: clamp(t / 60),
          }
        }
        const q = (1 - sp(t - H)) * 0.34
        return { transform: `translate(0px, 0px) ${axisScale(d, 1 - q, 1 + q * 0.8)}`, opacity: 1 }
      })
      c.at(H, () =>
        c.impact({ shake: 0.55, punch: 0.5, fx: ['dust'], burst: 'stars', snd: 'boing' }),
      )
      return T
    }
    case 'bolt':
      c.at(0, () => bolt(c, H))
      c.bake(v.card, T, (t) => {
        if (t < H) return { transform: 'scale(1.14)', opacity: 0, filter: 'brightness(3)' }
        const u = t - H
        return {
          transform: `scale(${1.14 - 0.14 * sp(u)})`,
          opacity: 1,
          filter: `brightness(${(1 + 2 * Math.exp(-u / 90)).toFixed(3)})`,
        }
      })
      c.at(H, () =>
        c.impact({ shake: 1, flash: 0.9, fc: '#d8f6ff', punch: 0.8, burst: 'sparks', snd: 'zap' }),
      )
      return T
    case 'glitch': {
      const r = rng(11)
      const n = 32
      const sc = Math.max(0.3, v.W / 900)
      const fr: Keyframe[] = []
      const gr: Keyframe[] = []
      const gb: Keyframe[] = []
      for (let i = 0; i <= n; i++) {
        const p = i / n
        const live = p < 0.8
        const j = live ? 1 - p : 0
        const top = r() * 85
        const h = 6 + r() * 34
        const band = live && r() < 0.6
        fr.push({
          opacity: live && r() < 0.18 ? 0 : 1,
          clipPath: band
            ? `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - h).toFixed(1)}% 0)`
            : 'inset(0% 0 0% 0)',
          transform: `translateX(${(live ? (r() * 2 - 1) * 26 * sc * j : 0).toFixed(1)}px) skewX(${(live ? (r() * 2 - 1) * 12 * j : 0).toFixed(1)}deg)`,
        })
        gr.push({
          opacity: live ? 0.85 * j + 0.15 : 0,
          transform: `translate(${(-8 - r() * 14) * sc * j}px, ${(r() * 2 - 1) * 3 * sc}px)`,
        })
        gb.push({
          opacity: live ? 0.85 * j + 0.15 : 0,
          transform: `translate(${(8 + r() * 14) * sc * j}px, ${(r() * 2 - 1) * 3 * sc}px)`,
        })
      }
      ;(fr[0] as Keyframe).opacity = 0
      const g1 = v.clone('fa-ghost')
      const g2 = v.clone('fa-ghost')
      g1.style.setProperty('--gc', '#ff2d6f')
      g2.style.setProperty('--gc', '#33d4ff')
      c.anim(v.card, fr, T)
      c.anim(g1, gr, T)
      c.anim(g2, gb, T)
      c.tidy(T, () => (g1.remove(), g2.remove()))
      c.at(0, () => c.sfx('glitch', c.k, true))
      c.at(H, () => c.impact({ flash: 0.18, fc: '#ff2d6f', punch: 0.4 }))
      return T
    }
    case 'portal': {
      const b = box(v)
      const D = Math.max(b.w, b.h) * 1.15
      const ring = layer(v, 'fa-ring')
      ring.style.width = ring.style.height = `${D}px`
      ring.style.marginLeft = ring.style.marginTop = `${-D / 2}px`
      ring.style.setProperty('--ring', v.colors.accent)
      c.bake(ring, 620, (t) => {
        const a = eo5(seg(t, 0, 230))
        const b2 = eo3(seg(t, 230, 620))
        return {
          transform: `scale(${(a * (1 + 0.5 * b2)).toFixed(3)}, ${(a * 0.42 * (1 + 0.5 * b2)).toFixed(3)}) rotate(${t * 0.3}deg)`,
          opacity: t < 230 ? a : 1 - b2,
        }
      })
      c.bake(v.card, T, (t) => {
        const s = sp(Math.max(0, t - 120))
        const cl = eo3(seg(t, 60, 420))
        return {
          clipPath: `ellipse(${(cl * 75).toFixed(2)}% ${(cl * 120).toFixed(2)}% at 50% 50%)`,
          transform: `scale(${0.7 + 0.3 * s}) rotate(${(1 - s) * -14}deg)`,
          opacity: t < 60 ? 0 : 1,
        }
      })
      c.at(0, () => c.sfx('portal', c.k, true))
      c.at(H, () => c.impact({ flash: 0.25, fc: v.colors.accent, punch: 0.5, burst: 'stars' }))
      c.tidy(620, () => ring.remove())
      return T
    }
    case 'shatter': {
      const b = box(v)
      const list = shards(v, 5)
      c.host.onEnd?.(() => list.forEach((s) => s.el.remove()))
      for (const s of list) {
        const dx = ((s.cx - 50) / 50) * b.w * (0.6 + s.r) + rs(b.w * 0.3)
        const dy = ((s.cy - 50) / 50) * b.h * 2.2 + rs(b.h * 1.5)
        c.anim(
          s.el,
          [
            {
              transform: `translate(${dx}px, ${dy}px) rotate(${rs(160)}deg) scale(0.6)`,
              opacity: 0,
            },
            { opacity: 1, offset: 0.35 },
            { transform: 'none', opacity: 1 },
          ],
          340,
          { delay: s.r * 130, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        )
      }
      c.bake(v.card, T, (t) => {
        if (t < H) return { opacity: 0, transform: 'scale(1)', filter: 'brightness(1)' }
        const u = t - H
        return {
          opacity: 1,
          transform: `scale(${1.04 - 0.04 * sp(u)})`,
          filter: `brightness(${(1 + 1.2 * Math.exp(-u / 80)).toFixed(3)})`,
        }
      })
      c.at(H, () => {
        for (const s of list) s.el.remove()
        c.impact({ shake: 0.4, flash: 0.2, punch: 0.6, burst: 'sparks', snd: 'glassIn' })
      })
      return T
    }
    case 'pour': {
      const pour = layer(v, 'fa-pour')
      c.bake(pour, T, (t) => {
        const L = t < H ? lerp(104, -8, eo3(t / H)) : lerp(-8, 104, eio(seg(t, H + 60, T)))
        return { clipPath: wave(L, t, t < H ? 7 : 4), opacity: 1 }
      })
      c.bake(v.card, T, (t) => {
        if (t < H) return { opacity: 0, transform: 'scale(1)', filter: 'brightness(1) saturate(1)' }
        const u = t - H
        const s = sp(u)
        return {
          opacity: 1,
          transform: `scale(${1.03 - 0.03 * s}, ${1.06 - 0.06 * s})`,
          filter: `brightness(${(1 + 0.9 * Math.exp(-u / 220)).toFixed(3)}) saturate(${(1 + 0.6 * Math.exp(-u / 220)).toFixed(3)})`,
        }
      })
      c.at(0, () => c.sfx('sizzle', c.k, true))
      c.at(H, () => c.impact({ punch: 0.5, flash: 0.2, fc: '#ffa424', burst: 'embers' }))
      c.tidy(T, () => pour.remove())
      return T
    }
    case 'flip_shine': {
      const dn = c.dirName('left')
      const d = DIRS[dn]
      const ax = d.x ? 'rotateY' : 'rotateX'
      const sgn = d.x ? d.x : -d.y
      c.bake(v.card, sp.dur, (t) => {
        const s = sp(t)
        return {
          transform: `perspective(900px) ${ax}(${(sgn * (1 - s) * 110).toFixed(2)}deg) scale(${(0.86 + 0.14 * Math.min(1, s)).toFixed(3)})`,
          opacity: clamp(t / 70),
          filter: `brightness(${(0.45 + 0.55 * clamp(s)).toFixed(3)})`,
        }
      })
      sweep(c, H, 560)
      c.at(H, () => c.impact({ punch: 0.4, burst: 'stars', snd: 'chime' }))
      return T
    }
    case 'confetti_pop':
      c.bake(v.card, T, (t) => {
        if (t < H) {
          const p = eo3(t / H)
          return {
            transform: `scale(${lerp(0.3, 1.14, p)}) rotate(${lerp(-12, 3, p)}deg)`,
            opacity: p,
          }
        }
        const s = sp(t - H)
        return { transform: `scale(${1.14 - 0.14 * s}) rotate(${3 - 3 * s}deg)`, opacity: 1 }
      })
      c.at(H, () =>
        c.impact({ punch: 0.7, flash: 0.12, fx: ['pop'], burst: 'confetti', snd: 'pop' }),
      )
      return T
    case 'dash': {
      const dn = c.dirName('left')
      const d = DIRS[dn]
      const b = box(v)
      const dist = (d.x ? b.W * 0.85 : b.H * 0.9) || 400
      const sk = Math.max(16, (d.x ? b.w : b.h) * 0.12)
      const sc = Math.max(0.3, b.W / 900)
      v.card.style.transformOrigin = ORIG[dn]
      c.bake(v.card, T, (t) => {
        if (t < H) {
          const p = 1 - Math.pow(1 - t / H, 1.4)
          const o = (1 - p) * dist
          return {
            transform: `translate(${d.x * o}px, ${d.y * o}px) ${axisScale(d, 1.7, 0.86)} skew(${d.x ? -d.x * 14 : 0}deg, ${d.y ? -d.y * 8 : 0}deg)`,
            opacity: clamp(t / 40),
            filter: `blur(${(7 * sc).toFixed(2)}px)`,
          }
        }
        const u = t - H
        const o = -sk * sp.kick(u) * 1.6
        const e = Math.exp(-u / 70)
        return {
          transform: `translate(${d.x * o}px, ${d.y * o}px) ${axisScale(d, 1 + 0.7 * e, 1 - 0.14 * e)} skew(${d.x ? d.x * 10 * sp.kick(u) : 0}deg, 0deg)`,
          opacity: 1,
          filter: `blur(${(7 * sc * Math.exp(-u / 40)).toFixed(2)}px)`,
        }
      })
      c.speedDir = { x: -d.x, y: -d.y }
      c.at(0, () => {
        burst(c, 'speed')
        c.sfx('whoosh', c.k, true)
      })
      c.at(H, () => c.impact({ shake: 0.4, punch: 0.4, fx: ['dust'], burst: null, snd: 'skid' }))
      return T
    }
    case 'neon': {
      const g = v.colors.accent
      const on = `drop-shadow(0 0 10px ${g}) drop-shadow(0 0 28px ${mix(g, '#000000', 0.3)}) brightness(1.25)`
      const off =
        'drop-shadow(0 0 0px transparent) drop-shadow(0 0 0px transparent) brightness(0.6)'
      const k: [number, number, string][] = [
        [0, 0, off],
        [0.06, 0.85, on],
        [0.09, 0, off],
        [0.22, 0, off],
        [0.24, 1, on],
        [0.28, 0.15, off],
        [0.36, 1, on],
        [0.41, 0.35, off],
        [0.47, 1, on],
        [0.7, 1, on],
        [1, 1, 'drop-shadow(0 0 0px transparent) drop-shadow(0 0 0px transparent) brightness(1)'],
      ]
      c.anim(
        v.card,
        k.map(([o, op, f], i) => ({
          offset: o,
          opacity: op,
          filter: f,
          easing: i < 9 ? 'steps(1, end)' : 'ease-out',
        })),
        T,
      )
      c.at(0, () => c.sfx('buzz', c.k, true))
      c.at(H, () => c.impact({ flash: 0.14, fc: g, punch: 0.3 }))
      return T
    }
  }
}

/** A light band across the plate (or, without a plate, across the letters). */
function sweep(c: Ctx, delay: number, T: number): void {
  const v = c.v
  if (v.sheen) {
    c.anim(
      v.sheen,
      [
        { transform: 'translateX(-130%) skewX(-18deg)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.8 },
        { transform: 'translateX(330%) skewX(-18deg)', opacity: 0 },
      ],
      T,
      { delay, easing: EASE_IN_OUT },
    )
    return
  }
  lettersShine(c, delay, T)
}

function lettersShine(c: Ctx, d0: number, T: number): void {
  const ch = c.v.chars()
  const n = Math.max(1, ch.length)
  ch.forEach((e, i) =>
    c.anim(
      e,
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(2.2)', offset: 0.4 },
        { filter: 'brightness(1)' },
      ],
      T * 0.38,
      { delay: d0 + (i / n) * T * 0.62, easing: 'ease-in-out' },
    ),
  )
}

// ------------------------------------------------------------------ text effects

function colorOf(e: HTMLElement): string {
  try {
    return getComputedStyle(e).color || 'currentColor'
  } catch {
    return 'currentColor'
  }
}

/** Plays a 1.1 text effect (or the Typewriter) from design ms `d0`. Returns its length. */
export function runText(id: TextAnim, c: Ctx, d0: number): number {
  const v = c.v
  const sp = c.sp
  const ch = v.chars()
  const n = Math.max(1, ch.length)
  const stg = staggerFor(c.m, n)
  const col = v.colors
  switch (id) {
    case 'cascade': {
      const r = rng(4)
      ch.forEach((e, i) => {
        const rot = (r() * 2 - 1) * 40
        c.bake(
          e,
          sp.dur,
          (t) => {
            const s = sp(t)
            return {
              transform: `translateY(${((1 - s) * -1.4).toFixed(3)}em) rotate(${((1 - s) * rot).toFixed(2)}deg)`,
              opacity: clamp(t / 90),
            }
          },
          d0 + i * stg,
        )
      })
      return (n - 1) * stg + sp.dur
    }
    case 'pop_wave':
      ch.forEach((e, i) => {
        const own = colorOf(e)
        c.anim(
          e,
          [
            { transform: 'scale(0.2)', opacity: 0, color: col.highlight },
            {
              transform: 'scale(1.55)',
              opacity: 1,
              color: mix(col.highlight, '#ffffff', 0.45),
              offset: 0.35,
            },
            { transform: 'scale(0.92)', color: own, offset: 0.65 },
            { transform: 'scale(1)', opacity: 1, color: own },
          ],
          440,
          { delay: d0 + i * stg * 1.1, easing: EASE_OUT },
        )
      })
      c.at(d0, () => c.sfx('pop', 0.6))
      return (n - 1) * stg * 1.1 + 440
    case 'type': {
      const per = typeStep(c.m, n, 45, 1.6)
      const caret = document.createElement('span')
      caret.className = 'fa-caret'
      caret.setAttribute('aria-hidden', 'true')
      ch.forEach((e, i) =>
        c.anim(e, [{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], 1, {
          delay: d0 + i * per,
        }),
      )
      const first = ch[0]
      c.at(d0, () => first?.before(caret))
      ch.forEach((e, i) =>
        c.at(d0 + i * per, () => {
          e.after(caret)
          c.sfx('click', 0.8)
        }),
      )
      c.tidy(d0 + n * per + 900, () => caret.remove())
      return n * per + 900
    }
    case 'decode': {
      const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=?'
      const per = typeStep(c.m, n, 30, 1.4)
      const lock = (i: number) => d0 + 160 + i * per
      const text = ch.map((e) => e.textContent ?? '')
      ch.forEach((e) =>
        c.anim(e, [{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], 1, { delay: d0 }),
      )
      c.at(d0, () => {
        for (const e of ch) {
          e.style.width = `${e.offsetWidth}px`
          e.style.textAlign = 'center'
        }
      })
      const end = lock(n - 1)
      c.every(d0, end, 45, (now) =>
        ch.forEach((e, i) => {
          if (now < lock(i) && (text[i] ?? '').trim())
            e.textContent = pool[(R() * pool.length) | 0] ?? '#'
        }),
      )
      ch.forEach((e, i) =>
        c.at(lock(i), () => {
          e.textContent = text[i] ?? ''
          c.animate(
            e,
            [
              { textShadow: `0 0 12px ${col.accent}`, filter: 'brightness(1.6)' },
              { textShadow: '0 0 0 transparent', filter: 'brightness(1)' },
            ],
            { duration: 380, easing: 'ease-out' },
          )
          if (i % 2 === 0) c.sfx('tick', 1)
        }),
      )
      c.tidy(end + 20, () => {
        ch.forEach((e, i) => (e.textContent = text[i] ?? ''))
        for (const e of ch) {
          e.style.width = ''
          e.style.textAlign = ''
        }
      })
      return end - d0 + 400
    }
    case 'shine':
      lettersShine(c, d0, 1100)
      return 1100
    case 'neon': {
      const r = rng(9)
      const g = col.accent
      ch.forEach((e, i) => {
        const dl = d0 + i * stg * 0.8 + r() * 160
        c.anim(
          e,
          [
            { opacity: 0, textShadow: '0 0 0 transparent', offset: 0, easing: 'steps(1, end)' },
            { opacity: 1, textShadow: `0 0 14px ${g}`, offset: 0.15, easing: 'steps(1, end)' },
            { opacity: 0.1, offset: 0.25, easing: 'steps(1, end)' },
            { opacity: 1, textShadow: `0 0 18px ${g}`, offset: 0.45, easing: 'ease-out' },
            { opacity: 1, textShadow: '0 0 0 transparent', offset: 1 },
          ],
          700,
          { delay: dl },
        )
      })
      return n * stg * 0.8 + 860
    }
    case 'rgb': {
      const r = rng(21)
      const steps = 14
      ch.forEach((e, i) => {
        const fr: Keyframe[] = []
        for (let j = 0; j <= steps; j++) {
          const p = j / steps
          const a = (1 - p) * 0.16
          fr.push({
            opacity: j === 0 ? 0 : r() < 0.15 * (1 - p) ? 0.2 : 1,
            transform: `translate(${((r() * 2 - 1) * a).toFixed(3)}em, ${((r() * 2 - 1) * a * 0.6).toFixed(3)}em)`,
            textShadow:
              p < 1
                ? `${(a * 0.9).toFixed(3)}em 0 #ff2d6f, ${(-a * 0.9).toFixed(3)}em 0 #6ff0ff`
                : '0 0 0 transparent, 0 0 0 transparent',
          })
        }
        c.anim(e, fr, 460, { delay: d0 + r() * 120 + i * stg * 0.3 })
      })
      c.at(d0, () => c.sfx('glitch', 0.7))
      return 580 + n * stg * 0.3
    }
    case 'stretch':
      ch.forEach((e, i) => {
        e.style.transformOrigin = '0% 70%'
        c.bake(
          e,
          sp.dur,
          (t) => {
            const s = sp(t)
            return {
              transform: `translateX(${((1 - s) * 0.8).toFixed(3)}em) scaleX(${(1 + (1 - s) * 2.4).toFixed(3)}) skewX(${((1 - s) * -20).toFixed(2)}deg)`,
              opacity: clamp(t / 60),
            }
          },
          d0 + i * stg,
        )
      })
      return (n - 1) * stg + sp.dur
    case 'spin':
      ch.forEach((e, i) =>
        c.bake(
          e,
          sp.dur,
          (t) => {
            const s = sp(t)
            return {
              transform: `perspective(300px) rotateY(${((1 - s) * -110).toFixed(2)}deg)`,
              opacity: clamp(t / 80),
            }
          },
          d0 + i * stg,
        ),
      )
      return (n - 1) * stg + sp.dur
    default:
      return 0
  }
}

// ------------------------------------------------------------------ exits

/** Plays an exit now. Returns how long until the card and its dust are gone, real ms. */
export function runExit(id: MotionOut, c: Ctx): number {
  const v = c.v
  const card = v.card
  const radius = (() => {
    try {
      return getComputedStyle(card).borderRadius || '0px'
    } catch {
      return '0px'
    }
  })()
  let T = 0
  switch (id) {
    case 'dissolve': {
      T = 820
      const b = box(v)
      const sc = Math.max(0.12, b.W / 900)
      const cols = [
        '#2a2f37',
        '#3a414c',
        v.colors.accent,
        v.colors.text,
        v.colors.highlight,
        '#1d2127',
      ]
      c.bake(card, T, (t) => ({
        clipPath: `inset(0 0 0 ${(eio(t / T) * 100).toFixed(2)}% round ${radius})`,
        opacity: 1,
      }))
      c.at(0, () => c.sfx('dissolve'))
      c.every(0, T, 32, (t) => {
        const x = b.x + b.w * eio(t / T)
        const n = v.mini ? 3 : 14
        for (let i = 0; i < n; i++)
          v.fx.add({
            kind: 'sq',
            x: x - R() * 8 * sc,
            y: b.y + R() * b.h,
            vx: (40 + R() * 200) * sc,
            vy: (-30 - R() * 120) * sc,
            g: -30 * sc,
            drag: 0.6,
            sway: 40 * sc,
            sf: 4 + R() * 4,
            ph: R() * 6,
            size: Math.max(1, (2 + R() * 3) * sc),
            color: cols[(R() * cols.length) | 0] ?? '#ffffff',
            life: 0.6 + R() * 0.7,
            fp: 1.5,
          })
      })
      return (T + 300) / c.speed
    }
    case 'black_hole': {
      T = 600
      c.bake(card, T, (t) => {
        if (t < 110) {
          const p = eo3(t / 110)
          return {
            transform: `scale(${1 + 0.07 * p}) rotate(0deg) skewX(0deg)`,
            opacity: 1,
            filter: 'brightness(1)',
          }
        }
        const p = Math.pow(seg(t, 110, 540), 2.2)
        return {
          transform: `scale(${lerp(1.07, 0.02, p)}) rotate(${(p * 280).toFixed(1)}deg) skewX(${(p * -24).toFixed(1)}deg)`,
          opacity: t > 540 ? 0 : 1,
          filter: `brightness(${1 + 1.8 * p})`,
        }
      })
      const b = box(v)
      const sc = Math.max(0.12, b.W / 900)
      c.every(110, 480, 40, () => {
        for (let i = 0; i < (v.mini ? 2 : 9); i++) {
          const an = R() * 6.283
          const r0 = b.w * (0.5 + R() * 0.5)
          const sx = b.cx + Math.cos(an) * r0
          const sy = b.cy + Math.sin(an) * r0 * 0.6
          v.fx.add({
            kind: 'dot',
            x: sx,
            y: sy,
            size: Math.max(0.8, (1.2 + R() * 1.8) * sc),
            color: R() < 0.5 ? v.colors.accent : v.colors.text,
            life: 0.4,
            add: true,
            fin: 0.08,
            upd: (q) => {
              const k2 = Math.min(1, (q.age ?? 0) / q.life)
              q.x = lerp(sx, b.cx, ei2(k2))
              q.y = lerp(sy, b.cy, ei2(k2))
            },
          })
        }
      })
      c.at(110, () => c.sfx('suck'))
      c.at(560, () => c.impact({ fx: ['pop'], flash: 0.12, fc: v.colors.accent, snd: 'blip' }))
      return 800 / c.speed
    }
    case 'zip': {
      T = 460
      const dn = c.dirName('right')
      const e = c.m.direction === 'auto' ? { x: 1, y: 0 } : DIRS[dn]
      const b = box(v)
      const dist = (e.x ? b.W : b.H) * 1.1 || 600
      const sc = Math.max(0.3, b.W / 900)
      card.style.transformOrigin = '50% 50%'
      const back = -0.07 * (e.x ? b.w : b.h)
      c.bake(card, T, (t) => {
        if (t < 140) {
          const p = eo3(t / 140)
          const o = back * p
          return {
            transform: `translate(${e.x * o}px, ${e.y * o}px) ${axisScale(e, 1 - 0.05 * p, 1 + 0.03 * p)}`,
            opacity: 1,
            filter: 'blur(0px)',
          }
        }
        const p = ei3(seg(t, 140, T))
        const o = lerp(back, dist, p)
        return {
          transform: `translate(${e.x * o}px, ${e.y * o}px) ${axisScale(e, 1 + 0.9 * p, 1 - 0.15 * p)}`,
          opacity: 1 - seg(p, 0.75, 1),
          filter: `blur(${(10 * sc * p).toFixed(2)}px)`,
        }
      })
      c.speedDir = e
      c.at(150, () => {
        burst(c, 'speed')
        c.sfx('whooshOut')
      })
      return T / c.speed
    }
    case 'fold':
      T = 560
      card.style.transformOrigin = '50% 0%'
      c.bake(card, T, (t) => {
        if (t < 100) {
          const p = eo3(t / 100)
          return {
            transform: `perspective(700px) translateY(0px) rotateX(0deg) scale(${1 - 0.03 * p}, ${1 - 0.06 * p})`,
            opacity: 1,
            filter: 'brightness(1)',
          }
        }
        const p = eio(seg(t, 100, T))
        return {
          transform: `perspective(700px) translateY(${(-p * 10).toFixed(2)}px) rotateX(${(-p * 96).toFixed(2)}deg) scale(${0.97 + 0.03 * p}, ${0.94 + 0.06 * p})`,
          opacity: 1 - seg(p, 0.85, 1),
          filter: `brightness(${(1 - 0.65 * p).toFixed(3)})`,
        }
      })
      c.at(90, () => c.sfx('flap'))
      return T / c.speed
    case 'shatter': {
      T = 1000
      const H = 80
      const b = box(v)
      const g = (b.H || 400) * 3.2
      c.anim(
        card,
        [
          { opacity: 1, filter: 'brightness(1)' },
          { opacity: 1, filter: 'brightness(2.4)', offset: 0.9 },
          { opacity: 0, filter: 'brightness(2.4)' },
        ],
        H,
      )
      const list = shards(v, 8)
      for (const s of list) s.el.style.opacity = '0'
      c.at(H, () => {
        for (const s of list) {
          s.el.style.opacity = ''
          const vx = ((s.cx - 50) / 50) * b.w * (0.9 + s.r * 0.8) + rs(b.w * 0.25)
          const vy = -b.h * (1.5 + s.r * 2.5) + ((s.cy - 50) / 50) * b.h * 2
          const vr = rs(420)
          c.bake(
            s.el,
            T - H,
            (t) => {
              const u = t / 1000
              return {
                transform: `translate(${(vx * u).toFixed(1)}px, ${(vy * u + 0.5 * g * u * u).toFixed(1)}px) rotate(${(vr * u).toFixed(1)}deg)`,
                opacity: 1 - seg(t, (T - H) * 0.55, T - H),
                filter: `brightness(${(1 + 1.2 * Math.exp(-t / 90)).toFixed(3)})`,
              }
            },
            H,
          )
        }
        c.impact({ shake: 0.5, flash: 0.25, burst: 'sparks', snd: 'glass' })
      })
      c.tidy(T, () => list.forEach((s) => s.el.remove()))
      return T / c.speed
    }
    case 'tv_off':
      T = 440
      c.bake(card, T, (t) => {
        if (t < 150) {
          const p = ei2(t / 150)
          return {
            transform: `scale(${lerp(1, 1.1, p)}, ${lerp(1, 0.02, p)})`,
            opacity: 1,
            filter: `brightness(${1 + 2.5 * p})`,
          }
        }
        if (t < 300) {
          const p = ei3(seg(t, 150, 300))
          return {
            transform: `scale(${lerp(1.1, 0.012, p)}, 0.02)`,
            opacity: 1,
            filter: 'brightness(3.5)',
          }
        }
        return {
          transform: 'scale(0.012, 0.02)',
          opacity: 1 - seg(t, 300, T),
          filter: 'brightness(3.5)',
        }
      })
      c.at(0, () => c.sfx('crt'))
      c.at(300, () => c.impact({ fx: ['pop'] }))
      return T / c.speed
    case 'fall': {
      T = 720
      const b = box(v)
      const hop = b.h * 0.3
      const fallD = (b.H || 400) * 1.1
      card.style.transformOrigin = '30% 50%'
      c.bake(card, T, (t) => {
        if (t < 160) {
          const p = eo3(t / 160)
          return {
            transform: `translateY(${(-hop * p).toFixed(1)}px) rotate(${(-3 * p).toFixed(2)}deg)`,
            opacity: 1,
          }
        }
        const u = seg(t, 160, T)
        return {
          transform: `translateY(${(-hop + ei2(u) * (fallD + hop)).toFixed(1)}px) rotate(${(-3 + 24 * ei2(u)).toFixed(2)}deg)`,
          opacity: 1 - seg(u, 0.75, 1),
        }
      })
      c.at(160, () => c.sfx('fall'))
      return T / c.speed
    }
    case 'iris':
      T = 500
      c.bake(card, T, (t) => {
        const p = eio(t / T)
        return {
          clipPath: `circle(${lerp(80, 0, p).toFixed(2)}% at 50% 50%)`,
          transform: `scale(${(1 - 0.12 * p).toFixed(3)}) rotate(${(p * 10).toFixed(2)}deg)`,
          opacity: 1,
        }
      })
      c.at(0, () => c.sfx('whooshOut', 0.7))
      c.at(T - 30, () => c.impact({ fx: ['pop'], snd: 'blip' }))
      return (T + 120) / c.speed
    case 'glitch': {
      T = 420
      const r = rng(31)
      const n = 26
      const sc = Math.max(0.3, v.W / 900)
      const fr: Keyframe[] = []
      for (let i = 0; i <= n; i++) {
        const p = i / n
        const top = r() * 85
        const h = 8 + r() * 30 * (1 - p)
        fr.push({
          opacity: i === n ? 0 : r() < 0.25 * p ? 0 : 1,
          clipPath:
            r() < 0.3 + 0.6 * p
              ? `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - h).toFixed(1)}% 0)`
              : 'inset(0% 0 0% 0)',
          transform: `translateX(${((r() * 2 - 1) * 30 * sc * p).toFixed(1)}px) skewX(${((r() * 2 - 1) * 14 * p).toFixed(1)}deg)`,
        })
      }
      const g1 = v.clone('fa-ghost')
      g1.style.setProperty('--gc', '#ff2d6f')
      c.anim(card, fr, T)
      c.anim(
        g1,
        [
          { opacity: 0, transform: 'translateX(0)' },
          { opacity: 0.8, transform: `translateX(${-14 * sc}px)`, offset: 0.4 },
          { opacity: 0, transform: `translateX(${-26 * sc}px)` },
        ],
        T,
      )
      c.at(0, () => c.sfx('glitch'))
      c.tidy(T, () => g1.remove())
      return T / c.speed
    }
  }
}

// ------------------------------------------------------------------ idle loops

const IDLE_FRAMES: Record<
  Exclude<MotionIdle, 'none' | 'shimmer' | 'glow'>,
  { kf: Keyframe[]; P: number; easing: string }
> = {
  breathe: {
    P: 1600,
    easing: 'cubic-bezier(0.37, 0, 0.63, 1)',
    kf: [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }],
  },
  float: {
    P: 2400,
    easing: 'cubic-bezier(0.37, 0, 0.63, 1)',
    kf: [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-5%) rotate(-0.8deg)', offset: 0.5 },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
  },
  jelly: {
    P: 1700,
    easing: 'ease-in-out',
    kf: [
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.06, 0.94)', offset: 0.1 },
      { transform: 'scale(0.96, 1.04)', offset: 0.2 },
      { transform: 'scale(1.02, 0.98)', offset: 0.3 },
      { transform: 'scale(1, 1)', offset: 0.4 },
      { transform: 'scale(1, 1)' },
    ],
  },
  heartbeat: {
    P: 1200,
    easing: 'ease-out',
    kf: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.07)', offset: 0.12 },
      { transform: 'scale(1)', offset: 0.26 },
      { transform: 'scale(1.045)', offset: 0.38 },
      { transform: 'scale(1)', offset: 0.56 },
      { transform: 'scale(1)' },
    ],
  },
}

/** Starts the loop that runs while the alert holds. Returns its animations (to end them). */
export function runIdle(id: MotionIdle, c: Ctx): Animation[] {
  const v = c.v
  const out: Animation[] = []
  const add = (a: Animation | null) => a && out.push(a)
  if (id === 'none') return out
  if (id === 'shimmer') {
    const kf: Keyframe[] = [
      { transform: 'translateX(-130%) skewX(-18deg)', opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 1, offset: 0.3 },
      { transform: 'translateX(330%) skewX(-18deg)', opacity: 0, offset: 0.38 },
      { transform: 'translateX(330%) skewX(-18deg)', opacity: 0 },
    ]
    if (v.sheen)
      add(c.animate(v.sheen, kf, { duration: 2000, iterations: Infinity, easing: EASE_IN_OUT }))
    else {
      const ch = v.chars()
      const n = Math.max(1, ch.length)
      ch.forEach((e, i) =>
        add(
          c.animate(
            e,
            [
              { filter: 'brightness(1)' },
              { filter: 'brightness(1)', offset: (i / n) * 0.3 },
              { filter: 'brightness(1.9)', offset: (i / n) * 0.3 + 0.04 },
              { filter: 'brightness(1)', offset: (i / n) * 0.3 + 0.1 },
              { filter: 'brightness(1)' },
            ],
            { duration: 2000, iterations: Infinity },
          ),
        ),
      )
    }
    return out
  }
  if (id === 'glow') {
    const g = v.colors.highlight
    add(
      c.animate(
        v.wrap,
        [
          { filter: 'drop-shadow(0 0 0px transparent)' },
          { filter: `drop-shadow(0 0 18px ${g})` },
          { filter: 'drop-shadow(0 0 0px transparent)' },
        ],
        { duration: 1400, iterations: Infinity, easing: 'ease-in-out' },
      ),
    )
    return out
  }
  const f = IDLE_FRAMES[id]
  add(c.animate(v.wrap, f.kf, { duration: f.P, iterations: Infinity, easing: f.easing }))
  return out
}

/** Ends idle loops without a jump: a moving card eases back from where it is. */
export function endIdle(list: Animation[], c: Ctx): void {
  for (const a of list) {
    const effect = a.effect as KeyframeEffect | null
    const el = effect?.target as HTMLElement | null
    const frames = effect?.getKeyframes?.() ?? []
    const moves = frames.length > 0 && frames.every((f) => f.opacity === undefined)
    if (!el || !moves) {
      a.cancel()
      continue
    }
    try {
      a.commitStyles()
    } catch {
      a.cancel()
      continue
    }
    a.cancel()
    const from: Keyframe = {}
    const to: Keyframe = {}
    if (el.style.transform) {
      from.transform = el.style.transform
      to.transform = 'none'
    }
    if (el.style.filter) {
      from.filter = el.style.filter
      to.filter = 'none'
    }
    el.style.transform = ''
    el.style.filter = ''
    if (Object.keys(from).length) c.animate(el, [from, to], { duration: 180, easing: EASE_OUT })
  }
}

/** Entrances whose sound opens them (at the start, where the look's own sound plays). */
export const OPENING_IN: ReadonlySet<MotionIn> = new Set(['glitch', 'portal', 'pour', 'neon'])

/** Each entrance's and exit's own hit, for reduced motion (the fade keeps the sound). */
export const ENTRANCE_SOUND: Record<MotionIn, ImpactSound> = {
  slam: 'thud',
  elastic: 'boing',
  bolt: 'zap',
  glitch: 'glitch',
  portal: 'portal',
  shatter: 'glassIn',
  pour: 'sizzle',
  flip_shine: 'chime',
  confetti_pop: 'pop',
  dash: 'skid',
  neon: 'buzz',
}
export const EXIT_SOUND: Record<MotionOut, ImpactSound> = {
  dissolve: 'dissolve',
  black_hole: 'suck',
  zip: 'whooshOut',
  fold: 'flap',
  shatter: 'glass',
  tv_off: 'crt',
  fall: 'fall',
  iris: 'whooshOut',
  glitch: 'glitch',
}
