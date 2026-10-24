// Motion backgrounds (`layer` type `fx`, the 25 Oct board): game worlds and motion loops drawn on
// a canvas. Each preset paints the whole box in the theme's colours; `beat` (0–1) comes from the
// music OBS hears when the layer is `reactive`, else from a slow pretend pulse. Nothing here
// reads viewer text; every number is clamped by the caller.

import type { FxPreset } from '@ferrocast/api/types'

export type { FxPreset }

export interface Palette {
  /** The main glow (the theme's accent). */
  a: string
  /** A second colour (beams, far lights). */
  b: string
  /** The ground. */
  bg: string
}

export interface Frame {
  g: CanvasRenderingContext2D
  w: number
  h: number
  /** Seconds, scaled by the layer's speed. */
  t: number
  /** 0–1: the music's loudness right now. */
  beat: number
  /** 24 bands, 0–1, for presets that show the music's shape. */
  bands: number[]
  p: Palette
  density: number
}

/** Each preset's own colours (the board's), used for any colour the layer leaves unset. */
export const FX_PALETTE: Record<FxPreset, Palette> = {
  hex: { a: '#ffa424', b: '#33d4ff', bg: '#0a0d14' },
  nightdrive: { a: '#ff3df0', b: '#3a0f4a', bg: '#090418' },
  wasteland: { a: '#e48a3a', b: '#a2471c', bg: '#2b1a12' },
  circuit: { a: '#5dffc0', b: '#33d4ff', bg: '#04110d' },
  tunnel: { a: '#b04dff', b: '#ffd1ff', bg: '#05030d' },
  dunes: { a: '#f2ead2', b: '#4b4a78', bg: '#060a1c' },
  forge: { a: '#ff6a00', b: '#ffd9a8', bg: '#0c0807' },
  arena: { a: '#33d4ff', b: '#ff4fa3', bg: '#05070d' },
  coderain: { a: '#3cff8c', b: '#d7ffe6', bg: '#020806' },
  orbit: { a: '#ffb070', b: '#5a1f4a', bg: '#04040a' },
  sonar: { a: '#50dcff', b: '#a0f0ff', bg: '#010a10' },
}

const TAU = Math.PI * 2
/** A seeded random, so a preset draws the same world every frame. */
export const rnd = (seed: number) => {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** `#rrggbb` (or `#rrggbbaa`) with a new alpha. */
export function alpha(hex: string, a: number): string {
  const h = hex.slice(1, 7)
  const v = Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${h}${v}`
}

const fill = (f: Frame) => {
  f.g.fillStyle = f.p.bg
  f.g.fillRect(0, 0, f.w, f.h)
}

const DRAW: Record<FxPreset, (f: Frame) => void> = {
  hex(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    const s = h / (9 * Math.max(0.5, f.density))
    g.lineWidth = Math.max(1, h / 540)
    for (let row = -1; row < h / (s * Math.sqrt(3)) + 1; row++)
      for (let col = -1; col < w / (s * 1.5) + 1; col++) {
        const x = col * s * 1.5
        const y = row * s * Math.sqrt(3) + (col % 2 ? (s * Math.sqrt(3)) / 2 : 0)
        const d = Math.hypot(x - w / 2, y - h / 2)
        const wave = Math.max(0, 1 - Math.abs(d - ((t * 0.09 * w) % (w * 0.8))) / (s * 0.9))
        g.strokeStyle = alpha(p.a, 0.1 + wave * 0.7 + beat * 0.25)
        g.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (k * TAU) / 6
          const px = x + s * 0.92 * Math.cos(a)
          const py = y + s * 0.92 * Math.sin(a)
          if (k) g.lineTo(px, py)
          else g.moveTo(px, py)
        }
        g.closePath()
        g.stroke()
      }
  },
  nightdrive(f) {
    const { g, w, h, t, p, beat } = f
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6)
    sky.addColorStop(0, p.bg)
    sky.addColorStop(1, alpha(p.a, 0.35))
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    const r = rnd(21)
    let x = 0
    while (x < w) {
      const bw = w * (0.006 + r() * 0.016)
      const bh = h * (0.12 + r() * 0.3)
      g.fillStyle = '#0c0616'
      g.fillRect(x, h * 0.6 - bh, bw, bh)
      g.fillStyle = alpha('#ffc85a', 0.6)
      for (let wy = h * 0.6 - bh + h * 0.008; wy < h * 0.58; wy += h * 0.013)
        for (let wx = x + bw * 0.15; wx < x + bw * 0.85; wx += Math.max(4, bw * 0.25))
          if (r() > 0.72) g.fillRect(wx, wy, Math.max(2, w / 960), Math.max(3, h / 360))
      x += bw + w * 0.002
    }
    g.fillStyle = '#05020c'
    g.fillRect(0, h * 0.6, w, h)
    g.strokeStyle = p.a
    g.lineWidth = Math.max(1.5, h / 400) * (1 + beat * 0.6)
    g.shadowColor = p.a
    g.shadowBlur = 8 + beat * 18
    for (let i = -8; i <= 8; i++) {
      g.beginPath()
      g.moveTo(w / 2, h * 0.6)
      g.lineTo(w / 2 + i * w * 0.14, h)
      g.stroke()
    }
    for (let k = 0; k < 9; k++) {
      const q = ((k + ((t * 1.4) % 1)) / 9) ** 2
      g.beginPath()
      g.moveTo(0, h * 0.6 + q * h * 0.4)
      g.lineTo(w, h * 0.6 + q * h * 0.4)
      g.stroke()
    }
    g.shadowBlur = 0
  },
  wasteland(f) {
    const { g, w, h, t, p, bands } = f
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, p.bg)
    sky.addColorStop(0.6, alpha(p.a, 0.75))
    sky.addColorStop(1, p.b)
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    g.fillStyle = alpha(p.b, 0.35)
    g.beginPath()
    g.arc(w * 0.72, h * 0.55, h * 0.16, 0, TAU)
    g.fill()
    // The skyline: still, or (reactive) jumping with the music's bands.
    const r = rnd(7)
    const n = bands.length
    const bw = w / n
    for (let i = 0; i < n; i++) {
      // Kept under the middle of the screen, so titles above stay clear.
      const base = 0.14 + r() * 0.24
      const bh = h * Math.min(0.6, base + (bands[i] ?? 0) * 0.26)
      g.fillStyle = '#1a0f0a'
      g.fillRect(i * bw, h - bh, bw - Math.max(2, w / 960), bh)
      g.fillStyle = alpha('#ffbe6e', 0.5)
      for (let y = h - bh + h * 0.012; y < h - h * 0.012; y += h * 0.022)
        if ((i * 7 + Math.floor(y)) % 3)
          g.fillRect(i * bw + bw * 0.2, y, Math.max(2, bw * 0.12), h * 0.006)
    }
    const a = rnd(3)
    g.fillStyle = alpha('#ffe6c8', 0.6)
    const count = Math.round(90 * f.density)
    for (let i = 0; i < count; i++) {
      const px = (a() * w + t * w * 0.01 * (0.5 + a())) % w
      const py = (a() * h + t * h * 0.008 * (0.5 + a())) % h
      g.fillRect(px, py, Math.max(1.5, w / 1200), Math.max(1.5, w / 1200))
    }
  },
  circuit(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    const r = rnd(31)
    const paths = Array.from({ length: Math.round(22 * f.density) }, () => {
      const pts: [number, number][] = [[r() * w, r() < 0.5 ? 0 : h]]
      for (let k = 0; k < 4; k++) {
        const [x, y] = pts[pts.length - 1] as [number, number]
        pts.push(
          k % 2
            ? [x + (r() - 0.5) * w * 0.4, y]
            : [x, y + ((pts[0] as [number, number])[1] ? -1 : 1) * r() * h * 0.35],
        )
      }
      return pts
    })
    g.lineWidth = Math.max(1.5, h / 540)
    paths.forEach((pts, i) => {
      g.strokeStyle = alpha(p.a, 0.2 + beat * 0.2)
      g.beginPath()
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      const at = ((t * 0.6 + i * 0.13) % 1) * (pts.length - 1)
      const k = Math.floor(at)
      const fr = at - k
      const [ax, ay] = pts[k] as [number, number]
      const [bx, by] = pts[k + 1] as [number, number]
      g.fillStyle = p.b
      g.shadowColor = p.b
      g.shadowBlur = 14
      g.beginPath()
      g.arc(ax + (bx - ax) * fr, ay + (by - ay) * fr, Math.max(2.4, h / 300), 0, TAU)
      g.fill()
      g.shadowBlur = 0
      const [ex, ey] = pts[pts.length - 1] as [number, number]
      g.fillStyle = alpha(p.a, 0.5)
      g.fillRect(ex - h / 180, ey - h / 180, h / 90, h / 90)
    })
  },
  tunnel(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    for (let k = 0; k < 16; k++) {
      const z = (k + ((t * 1.3) % 1)) / 16
      const s = z * z * 1.6
      g.strokeStyle = alpha(k % 2 ? p.a : p.b, Math.min(1, z * 1.6) * (0.55 + beat * 0.45))
      g.lineWidth = (1 + z * 3) * (h / 540)
      g.save()
      g.translate(w / 2, h / 2)
      g.rotate(t * 0.15 + k * 0.05)
      g.strokeRect((-w * s) / 2, (-h * s) / 2, w * s, h * s)
      g.restore()
    }
  },
  dunes(f) {
    const { g, w, h, t, p } = f
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, p.bg)
    sky.addColorStop(0.65, alpha(p.b, 0.6))
    sky.addColorStop(1, alpha(p.b, 0.9))
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    const st = rnd(17)
    for (let i = 0; i < 120 * f.density; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * Math.abs(Math.sin(t * 1.5 + i))})`
      g.fillRect(st() * w, st() * h * 0.55, Math.max(1.4, w / 1300), Math.max(1.4, w / 1300))
    }
    g.fillStyle = p.a
    g.shadowColor = p.a
    g.shadowBlur = 28
    g.beginPath()
    // The moon sits in the top corner, clear of a centred title.
    g.arc(w * 0.88, h * 0.13, h * 0.06, 0, TAU)
    g.fill()
    g.shadowBlur = 0
    ;['#2b2547', '#1d1834', '#120f22'].forEach((c, k) => {
      g.fillStyle = c
      g.beginPath()
      g.moveTo(0, h)
      for (let x = 0; x <= w; x += w / 160)
        g.lineTo(
          x,
          h * (0.68 + k * 0.1) + Math.sin(x * (6 / w) * 2 + k * 2 + t * 0.15 * (k + 1)) * h * 0.06,
        )
      g.lineTo(w, h)
      g.fill()
    })
    const sd = rnd(2)
    g.fillStyle = alpha(p.a, 0.35)
    for (let i = 0; i < 60 * f.density; i++)
      g.fillRect(
        (sd() * w + t * w * 0.02 * (0.5 + sd())) % w,
        h * (0.7 + sd() * 0.3),
        w / 640,
        h / 1080,
      )
  },
  forge(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    const r = rnd(41)
    g.lineWidth = Math.max(2, h / 400)
    for (let i = 0; i < 16; i++) {
      let x = r() * w
      let y = h * (0.55 + r() * 0.45)
      const glow = 0.5 + 0.5 * Math.sin(t * 2 + i)
      g.strokeStyle = alpha(p.a, 0.5 + glow * 0.5 * (0.6 + beat * 0.4))
      g.shadowColor = p.a
      g.shadowBlur = 12
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * w * 0.05
        y += (r() - 0.6) * h * 0.05
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.shadowBlur = 0
    const e = rnd(6)
    for (let i = 0; i < 80 * f.density; i++) {
      const x = e() * w + Math.sin(t + i) * w * 0.006
      const y = h - ((e() * h + t * h * 0.07 * (0.4 + e())) % h)
      g.fillStyle = alpha(p.b, y / h)
      g.fillRect(x, y, w / 900, w / 900)
    }
  },
  arena(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    ;[
      [p.b, 0.15, 0.7],
      [p.a, 0.85, 1.1],
      ['#ffffff', 0.5, 0.5],
    ].forEach(([c, x, sp]) => {
      const a = Math.sin(t * (sp as number)) * 0.5
      g.save()
      g.translate(w * (x as number), 0)
      g.rotate(a)
      const grd = g.createLinearGradient(0, 0, 0, h)
      grd.addColorStop(0, alpha(c as string, 0.22 + beat * 0.15))
      grd.addColorStop(1, alpha(c as string, 0))
      g.fillStyle = grd
      g.beginPath()
      g.moveTo(-w * 0.004, 0)
      g.lineTo(w * 0.004, 0)
      g.lineTo(w * 0.07, h * 1.1)
      g.lineTo(-w * 0.07, h * 1.1)
      g.fill()
      g.restore()
    })
    g.fillStyle = '#0d1120'
    g.beginPath()
    g.ellipse(w / 2, h * 0.95, w * 0.55, h * 0.16, 0, 0, TAU)
    g.fill()
    g.strokeStyle = alpha(p.b, 0.4 + beat * 0.6)
    g.lineWidth = Math.max(2, h / 360)
    g.stroke()
  },
  coderain(f) {
    const { g, w, h, t, p } = f
    fill(f)
    const size = h / 40
    g.font = `600 ${size}px ui-monospace, monospace`
    const cols = Math.floor(w / (size * 0.9))
    const r = rnd(12)
    for (let c = 0; c < cols; c++) {
      const speed = h * (0.06 + r() * 0.12)
      const head = (r() * h + t * speed) % (h + size * 12)
      for (let k = 0; k < 12; k++) {
        const y = head - k * size
        if (y < 0 || y > h) continue
        g.fillStyle = k ? alpha(p.a, 0.6 - k * 0.05) : p.b
        g.fillText(
          String.fromCharCode(0x30a0 + ((c * 7 + k * 13 + Math.floor(t * 4)) % 90)),
          c * size * 0.9,
          y,
        )
      }
    }
    let x = 0
    const b = rnd(5)
    while (x < w) {
      const bw = w * (0.01 + b() * 0.02)
      const bh = h * (0.15 + b() * 0.25)
      g.fillStyle = p.bg
      g.fillRect(x, h - bh, bw, bh)
      x += bw + 2
    }
  },
  orbit(f) {
    const { g, w, h, t, p, beat } = f
    fill(f)
    const st = rnd(9)
    for (let i = 0; i < 140 * f.density; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.min(1, 0.2 + st() * 0.7 + beat * 0.25)})`
      g.fillRect((st() * w + t * w * 0.004) % w, st() * h, w / 1600, w / 1600)
    }
    // Low on the right, clear of the title and the timer; it swells a little with the beat.
    const cx = w * 0.84
    const cy = h * 0.68
    const R = h * 0.22 * (1 + beat * 0.05)
    const pl = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, 2, cx, cy, R)
    pl.addColorStop(0, p.a)
    pl.addColorStop(1, p.b)
    g.strokeStyle = alpha(p.a, 0.6)
    g.lineWidth = Math.max(3, h / 360)
    g.beginPath()
    g.ellipse(cx, cy, R * 1.8, R * 0.45, -0.25, Math.PI, TAU)
    g.stroke()
    g.fillStyle = pl
    g.beginPath()
    g.arc(cx, cy, R, 0, TAU)
    g.fill()
    g.beginPath()
    g.ellipse(cx, cy, R * 1.8, R * 0.45, -0.25, 0, Math.PI)
    g.stroke()
    const a = t * 0.8
    g.fillStyle = '#9fe8ff'
    g.beginPath()
    g.arc(cx + Math.cos(a) * R * 1.8, cy + Math.sin(a) * R * 0.45, Math.max(3, h / 300), 0, TAU)
    g.fill()
  },
  sonar(f) {
    const { g, w, h, t, p, beat } = f
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, alpha(p.b, 0.5))
    bg.addColorStop(1, p.bg)
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    for (let k = 0; k < 4; k++) {
      const q = (t * 0.5 + k / 4) % 1
      g.strokeStyle = alpha(p.a, (1 - q) * (0.5 + beat * 0.4))
      g.lineWidth = Math.max(2, h / 400)
      g.beginPath()
      g.arc(w / 2, h / 2, q * w * 0.6, 0, TAU)
      g.stroke()
    }
    const b = rnd(23)
    for (let i = 0; i < 40 * f.density; i++) {
      const x = b() * w + Math.sin(t * 2 + i) * w * 0.003
      const y = h - ((b() * h + t * h * 0.05 * (0.5 + b())) % h)
      g.strokeStyle = alpha(p.a, 0.5)
      g.beginPath()
      g.arc(x, y, (1.5 + b() * 2) * (h / 540), 0, TAU)
      g.stroke()
    }
  },
}

export function drawFx(preset: FxPreset, f: Frame): void {
  f.g.save()
  DRAW[preset](f)
  f.g.restore()
}

/** Bands for a frame: from the music level when there is one, else a soft pretend shape. */
export function bandsFor(t: number, level: number | null, n = 24): number[] {
  return Array.from({ length: n }, (_, i) => {
    const fr = i / n
    const wobble = 0.5 + 0.5 * Math.sin(t * (1.3 + fr * 5) + i * 0.7)
    return level === null ? 0 : Math.min(1, level * (0.55 + 0.45 * wobble) * (1.1 - fr * 0.4))
  })
}
