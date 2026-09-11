// Decorative pieces for scene layers (API-REQUESTS R20): silhouettes a shape is cut to,
// particle fields (stars, confetti, snow, string lights…) and the extra pieces richer
// frames draw. Everything is created elements with checked inline values (no HTML strings,
// no files), and particles only move when the layer asks for a loop (R-38).

import type { FrameVariant, ShapeClip, ShapePattern } from '@ferrocast/api/types'
import { PARTICLE_PATTERNS } from '@ferrocast/api/design'
import { el } from '../dom'

type Pt = readonly [number, number]

const r2 = (n: number) => Math.round(n * 100) / 100
const poly = (pts: readonly Pt[]) =>
  `polygon(${pts.map(([x, y]) => `${r2(x)}% ${r2(y)}%`).join(',')})`

/** Points on a closed curve, `f(t)` for t in [0, 1). */
function curve(n: number, f: (t: number) => Pt): Pt[] {
  return Array.from({ length: n }, (_, i) => f(i / n))
}

function starPts(points: number, inner: number, rot = -90): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot + (i * 180) / points) * Math.PI) / 180
    const r = i % 2 === 0 ? 50 : 50 * inner
    out.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)])
  }
  return out
}

const heart = curve(48, (t) => {
  const a = t * Math.PI * 2
  const x = 16 * Math.sin(a) ** 3
  const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)
  return [50 + x * 3, 46 - y * 3.1]
})

// A flame or drop: pointed top, round bottom.
const drop = curve(40, (t) => {
  const a = t * Math.PI * 2
  const x = Math.sin(a) * Math.sin(a / 2) ** 1.2
  return [50 + x * 48, 50 - Math.cos(a) * 48]
})

// A leaf: pointed at both ends, a little fuller on one side.
const leaf = (() => {
  const pts: Pt[] = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    pts.push([50 + 46 * Math.sin(Math.PI * t) ** 0.85, 2 + 96 * t])
  }
  for (let i = 19; i >= 1; i--) {
    const t = i / 20
    pts.push([50 - 40 * Math.sin(Math.PI * t) ** 0.9, 2 + 96 * t])
  }
  return pts
})()

// An organic blob, fixed (no randomness) so it renders the same every time.
const blob = curve(48, (t) => {
  const a = t * Math.PI * 2
  const r = 44 + 4 * Math.sin(3 * a + 0.6) + 2.5 * Math.cos(5 * a)
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a) * 0.98]
})

const cloud = (() => {
  // Bumps along the top, a flat-ish bottom.
  const pts: Pt[] = []
  const bumps: [number, number, number][] = [
    [18, 62, 16],
    [36, 40, 20],
    [60, 34, 24],
    [82, 56, 16],
  ]
  pts.push([6, 82])
  for (const [cx, cy, r] of bumps)
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a) * 1.25])
    }
  pts.push([96, 82], [92, 92], [10, 92])
  return pts
})()

// A crescent: the outer circle's left half, back up along a smaller circle's left side.
const moon = (() => {
  const pts: Pt[] = []
  for (let i = 0; i <= 28; i++) {
    const a = 1.5 * Math.PI - (i / 28) * Math.PI
    pts.push([50 + 48 * Math.cos(a), 50 + 48 * Math.sin(a)])
  }
  for (let i = 0; i <= 28; i++) {
    const a = 0.5 * Math.PI + (i / 28) * Math.PI
    pts.push([64 + 40 * Math.cos(a), 50 + 44 * Math.sin(a)])
  }
  return pts
})()

const wave = (() => {
  const pts: Pt[] = [
    [0, 100],
    [100, 100],
  ]
  for (let i = 0; i <= 24; i++) {
    const x = 100 - (i / 24) * 100
    pts.push([x, 10 + 8 * Math.sin((x / 100) * Math.PI * 4)])
  }
  return pts
})()

const torn = (() => {
  const pts: Pt[] = [
    [0, 0],
    [100, 0],
  ]
  const ys = [94, 99, 92, 97, 90, 98, 93, 100, 91, 96, 94, 99, 92]
  ys.forEach((y, i) => pts.push([100 - (i / (ys.length - 1)) * 100, y]))
  return pts
})()

const ticket = (() => {
  // Round bites out of the middle of each short side.
  const pts: Pt[] = [
    [0, 0],
    [100, 0],
    [100, 36],
  ]
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 - (i / 10) * Math.PI
    pts.push([100 + 6 * Math.cos(a), 50 - 14 * Math.sin(a)])
  }
  pts.push([100, 64], [100, 100], [0, 100], [0, 64])
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 - (i / 10) * Math.PI
    pts.push([0 + 6 * Math.cos(a), 50 + 14 * Math.sin(a)])
  }
  pts.push([0, 36])
  return pts
})()

/** Every silhouette as a clip-path value (percent points, so it fits any box). */
export const CLIP_PATH: Record<ShapeClip, string> = {
  chevron: poly([
    [0, 0],
    [70, 0],
    [100, 50],
    [70, 100],
    [0, 100],
    [30, 50],
  ]),
  arrow: poly([
    [0, 30],
    [64, 30],
    [64, 6],
    [100, 50],
    [64, 94],
    [64, 70],
    [0, 70],
  ]),
  hexagon: poly([
    [25, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [25, 100],
    [0, 50],
  ]),
  octagon: poly([
    [30, 0],
    [70, 0],
    [100, 30],
    [100, 70],
    [70, 100],
    [30, 100],
    [0, 70],
    [0, 30],
  ]),
  diamond: poly([
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ]),
  star: poly(starPts(5, 0.45)),
  burst: poly(starPts(14, 0.72)),
  ticket: poly(ticket),
  ribbon: poly([
    [0, 0],
    [100, 0],
    [92, 50],
    [100, 100],
    [0, 100],
    [8, 50],
  ]),
  tag: poly([
    [0, 0],
    [86, 0],
    [100, 50],
    [86, 100],
    [0, 100],
  ]),
  parallelogram: poly([
    [12, 0],
    [100, 0],
    [88, 100],
    [0, 100],
  ]),
  cut: poly([
    [8, 0],
    [100, 0],
    [100, 76],
    [92, 100],
    [0, 100],
    [0, 24],
  ]),
  shield: poly([
    [0, 0],
    [100, 0],
    [100, 56],
    [50, 100],
    [0, 56],
  ]),
  wave: poly(wave),
  torn: poly(torn),
  cloud: poly(cloud),
  blob: poly(blob),
  heart: poly(heart),
  drop: poly(drop),
  leaf: poly(leaf),
  moon: poly(moon),
  bolt: poly([
    [58, 0],
    [12, 56],
    [44, 56],
    [34, 100],
    [88, 40],
    [54, 40],
    [70, 0],
  ]),
  pennant: poly([
    [0, 0],
    [100, 0],
    [50, 100],
  ]),
  trapezoid: poly([
    [14, 0],
    [86, 0],
    [100, 100],
    [0, 100],
  ]),
  steps: poly([
    [8, 0],
    [92, 0],
    [92, 8],
    [100, 8],
    [100, 92],
    [92, 92],
    [92, 100],
    [8, 100],
    [8, 92],
    [0, 92],
    [0, 8],
    [8, 8],
  ]),
  sparkle: poly(starPts(4, 0.22)),
  cross: poly([
    [36, 0],
    [64, 0],
    [64, 36],
    [100, 36],
    [100, 64],
    [64, 64],
    [64, 100],
    [36, 100],
    [36, 64],
    [0, 64],
    [0, 36],
    [36, 36],
  ]),
  bat: poly([
    [50, 30],
    [56, 18],
    [60, 34],
    [72, 22],
    [100, 30],
    [88, 44],
    [84, 66],
    [72, 56],
    [62, 70],
    [50, 92],
    [38, 70],
    [28, 56],
    [16, 66],
    [12, 44],
    [0, 30],
    [28, 22],
    [40, 34],
    [44, 18],
  ]),
}

/** A small deterministic random source, so a layer looks the same on every render. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const isParticles = (p: ShapePattern) => (PARTICLE_PATTERNS as readonly string[]).includes(p)

const BASE_COUNT: Partial<Record<ShapePattern, number>> = {
  stars: 36,
  sparkles: 14,
  confetti: 30,
  bokeh: 12,
  snow: 40,
  embers: 26,
  rain: 40,
  petals: 22,
  leaves: 14,
  lights: 18,
  bubbles: 16,
  fireflies: 18,
  pixels: 20,
  eq: 9,
  shimmer: 1,
}

/**
 * Particles for a pattern: small spans positioned in percent, with their own timing as
 * custom properties on themselves (never driven from the parent). `colors` are the layer's
 * fill and fill2; the scale changes how many there are (8 to 48).
 */
export function particles(
  pattern: ShapePattern,
  seed: string,
  box: { w: number; h: number },
  colors: [string, string],
  scale: number,
): HTMLElement {
  const wrap = el('div', `fc-pf fc-pf-${pattern}`)
  const rnd = seeded(`${seed}:${pattern}`)
  const base = BASE_COUNT[pattern] ?? 20
  const n =
    pattern === 'shimmer'
      ? 1
      : Math.round(Math.min(48, Math.max(pattern === 'eq' ? 3 : 8, base * scale)))
  const range = (lo: number, hi: number) => lo + (hi - lo) * rnd()
  wrap.style.setProperty('--fall', `${Math.round(box.h + 80)}px`)
  wrap.style.setProperty('--span', `${Math.round(box.w + 120)}px`)
  for (let i = 0; i < n; i++) {
    const p = el('span', 'fc-pt')
    const s = p.style
    const c = rnd() < 0.62 ? colors[0] : colors[1]
    const set = (k: string, v: string) => s.setProperty(k, v)
    set('--c', c)
    set('--d', `${r2(-range(0, 12))}s`)
    switch (pattern) {
      case 'eq': {
        const w = 100 / n
        s.left = `${r2(i * w + w * 0.15)}%`
        s.width = `${r2(w * 0.7)}%`
        set('--t', `${r2(range(0.7, 1.4))}s`)
        set('--lo', String(r2(range(0.15, 0.4))))
        set('--d', `${r2(-range(0, 1.4))}s`)
        break
      }
      case 'lights': {
        // Bulbs hang along a sagging wire, alternating colours.
        const x = (i + 0.5) / n
        s.left = `${r2(x * 100)}%`
        s.top = `${r2(8 + 64 * 4 * x * (1 - x) * 0.5)}%`
        set('--c', i % 2 === 0 ? colors[0] : colors[1])
        set('--t', `${r2(range(1.6, 3.2))}s`)
        set('--d', `${r2(-range(0, 3))}s`)
        break
      }
      case 'shimmer':
        set('--t', '5.5s')
        set('--d', '0s')
        break
      default: {
        s.left = `${r2(range(0, 100))}%`
        s.top = `${r2(range(0, 100))}%`
        const size =
          pattern === 'bokeh'
            ? range(40, 140)
            : pattern === 'stars'
              ? range(2, 5)
              : pattern === 'sparkles'
                ? range(10, 26)
                : pattern === 'snow'
                  ? range(4, 11)
                  : pattern === 'rain'
                    ? range(1.5, 2.5)
                    : pattern === 'bubbles'
                      ? range(10, 30)
                      : pattern === 'fireflies'
                        ? range(4, 8)
                        : pattern === 'embers'
                          ? range(3, 7)
                          : pattern === 'pixels'
                            ? Math.round(range(2, 5)) * 4
                            : pattern === 'leaves'
                              ? range(16, 30)
                              : pattern === 'petals'
                                ? range(10, 18)
                                : range(8, 14)
        s.width = `${r2(size)}px`
        s.height = `${r2(pattern === 'rain' ? size * 14 : pattern === 'confetti' ? size * 0.45 : pattern === 'petals' ? size * 0.62 : size)}px`
        set('--r', `${Math.round(range(0, 360))}deg`)
        set('--x', `${Math.round(range(-60, 60))}px`)
        set(
          '--t',
          `${r2(
            pattern === 'rain'
              ? range(0.7, 1.2)
              : pattern === 'snow'
                ? range(7, 14)
                : pattern === 'confetti' || pattern === 'petals' || pattern === 'leaves'
                  ? range(6, 11)
                  : pattern === 'embers' || pattern === 'bubbles' || pattern === 'pixels'
                    ? range(6, 12)
                    : range(2.4, 6),
          )}s`,
        )
        set('--o', String(r2(range(0.45, 1))))
      }
    }
    wrap.appendChild(p)
  }
  if (pattern === 'lights') wrap.prepend(el('span', 'fc-pf-wire'))
  return wrap
}

/** The extra pieces a frame variant draws (brackets, tape, sprockets, bulbs…). */
export function frameDecor(
  variant: FrameVariant,
  seed: string,
  box: { w: number; h: number },
): HTMLElement[] {
  const span = (cls: string) => el('span', cls)
  switch (variant) {
    case 'hud':
      return [
        ...['tl', 'tr', 'bl', 'br'].map((k) => span(`fv-br fv-br-${k}`)),
        span('fv-ticks'),
        span('fv-side fv-side-l'),
        span('fv-side fv-side-r'),
      ]
    case 'sketch':
    case 'brush':
      return [span('fv-line fv-line-a'), span('fv-line fv-line-b')]
    case 'tape':
      return [span('fv-tape fv-tape-l'), span('fv-tape fv-tape-r')]
    case 'film':
      return [span('fv-holes fv-holes-t'), span('fv-holes fv-holes-b')]
    case 'chevron':
      return [span('fv-chev fv-chev-l'), span('fv-chev fv-chev-r')]
    case 'vhs':
      return [span('fv-rec'), span('fv-scan')]
    case 'deco':
      return ['tl', 'tr', 'bl', 'br'].map((k) => span(`fv-fan fv-fan-${k}`))
    case 'holo':
    case 'gold': {
      // The gradient ring is masked to the border; the sheen and the spin live inside it.
      const ring = span('fv-ring')
      ring.appendChild(span(variant === 'holo' ? 'fv-spin' : 'fv-sheen'))
      return [ring]
    }
    case 'bulbs': {
      // Bulbs evenly around the edge.
      const per = 64
      const across = Math.max(3, Math.round(box.w / per))
      const down = Math.max(2, Math.round(box.h / per))
      const out: HTMLElement[] = []
      const rnd = seeded(seed)
      const add = (x: number, y: number) => {
        const b = span('fv-bulb')
        b.style.left = `${r2(x)}%`
        b.style.top = `${r2(y)}%`
        b.style.setProperty('--d', `${r2(-rnd() * 3)}s`)
        out.push(b)
      }
      for (let i = 0; i <= across; i++) {
        add((i / across) * 100, 0)
        add((i / across) * 100, 100)
      }
      for (let j = 1; j < down; j++) {
        add(0, (j / down) * 100)
        add(100, (j / down) * 100)
      }
      return out.slice(0, 60)
    }
    default:
      return []
  }
}
