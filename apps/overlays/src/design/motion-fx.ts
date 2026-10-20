// The motion designer's particles: one canvas per alert, one requestAnimationFrame loop
// that only runs while something is flying, nothing else on the page touched (R-38). Sizes
// and positions are in the alert canvas's own units (800×450 for an alert, the swatch's CSS
// pixels for a designer swatch); `fit` maps them to device pixels.

export type ParticleKind =
  'rect' | 'dot' | 'glow' | 'line' | 'streak' | 'sq' | 'coin' | 'petal' | 'star' | 'ring' | 'bolt'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx?: number
  vy?: number
  /** gravity, drag per second (0..1 kept), sway amplitude and frequency */
  g?: number
  drag?: number
  sway?: number
  sf?: number
  ph?: number
  rot?: number
  vr?: number
  flip?: number
  size: number
  color?: string
  life: number
  /** fade power (bigger keeps it opaque longer), fade-in seconds, starting alpha */
  fp?: number
  fin?: number
  a0?: number
  /** additive blending (glows, sparks) */
  add?: boolean
  grow?: number
  len?: number
  dx?: number
  dy?: number
  pop?: boolean
  r0?: number
  r1?: number
  flat?: number
  pts?: [number, number][]
  draw?: number
  /** a custom path instead of physics */
  upd?: (p: Particle) => void
  age?: number
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const eo3 = (t: number) => 1 - Math.pow(1 - t, 3)
const TAU = 6.283

/** The most particles alive at once: a weak PC in OBS must never drop frames for confetti. */
export const MAX_PARTICLES = 900

export class Particles {
  readonly canvas: HTMLCanvasElement
  private g: CanvasRenderingContext2D | null
  private ps: (Particle & { age: number })[] = []
  private raf = 0
  private last = 0
  private paused = false
  /** Logical size (alert canvas units). */
  w: number
  h: number
  private scale = 1

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.canvas = canvas
    this.w = w
    this.h = h
    let g: CanvasRenderingContext2D | null
    try {
      g = canvas.getContext('2d')
    } catch {
      g = null
    }
    this.g = g
  }

  /** `px`: device pixels per logical unit (on-screen scale × devicePixelRatio). */
  fit(px: number): void {
    const s = Math.min(3, Math.max(0.25, Number.isFinite(px) ? px : 1))
    this.scale = s
    this.canvas.width = Math.max(1, Math.round(this.w * s))
    this.canvas.height = Math.max(1, Math.round(this.h * s))
  }

  get count(): number {
    return this.ps.length
  }

  add(p: Particle): void {
    if (!this.g || this.ps.length >= MAX_PARTICLES) return
    this.ps.push({ ...p, age: 0 })
    if (!this.raf && !this.paused) this.start()
  }

  clear(): void {
    this.ps.length = 0
    this.g?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  pause(): void {
    this.paused = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    if (this.ps.length) this.start()
  }

  destroy(): void {
    this.pause()
    this.ps.length = 0
    this.g = null
  }

  private start(): void {
    if (typeof requestAnimationFrame !== 'function') return
    this.last = performance.now()
    this.raf = requestAnimationFrame((t) => this.tick(t))
  }

  private tick(now: number): void {
    this.raf = 0
    const g = this.g
    if (!g || this.paused) return
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
    this.last = now
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    g.clearRect(0, 0, this.w, this.h)
    const ps = this.ps
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as Particle & { age: number }
      p.age += dt
      if (p.age >= p.life) {
        ps[i] = ps[ps.length - 1] as Particle & { age: number }
        ps.pop()
        continue
      }
      if (p.upd) p.upd(p)
      else step(p, dt)
      draw(g, p)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    if (ps.length) this.raf = requestAnimationFrame((t) => this.tick(t))
    else g.clearRect(0, 0, this.w, this.h)
  }
}

function step(p: Particle & { age: number }, dt: number): void {
  if (p.drag) {
    const d = Math.pow(p.drag, dt)
    p.vx = (p.vx ?? 0) * d
    p.vy = (p.vy ?? 0) * d
  }
  p.vy = (p.vy ?? 0) + (p.g ?? 0) * dt
  p.x += (p.vx ?? 0) * dt
  p.y += (p.vy ?? 0) * dt
  if (p.sway) p.x += Math.sin(p.age * (p.sf ?? 1) + (p.ph ?? 0)) * p.sway * dt
  if (p.vr) p.rot = (p.rot ?? 0) + p.vr * dt
}

function draw(g: CanvasRenderingContext2D, p: Particle & { age: number }): void {
  const u = p.age / p.life
  let a = (p.a0 ?? 1) * (1 - Math.pow(u, p.fp ?? 2))
  if (p.fin) a *= clamp(p.age / p.fin)
  if (a <= 0.003) return
  g.globalAlpha = a
  g.globalCompositeOperation = p.add ? 'lighter' : 'source-over'
  const s = p.size
  const color = p.color ?? '#ffffff'
  switch (p.kind) {
    case 'rect':
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot ?? 0)
      g.scale(1, Math.cos(p.age * (p.flip ?? 8) + (p.ph ?? 0)))
      g.fillStyle = color
      g.fillRect(-s / 2, -s * 0.3, s, s * 0.6)
      g.restore()
      break
    case 'dot':
      g.fillStyle = color
      g.beginPath()
      g.arc(p.x, p.y, Math.max(0.3, s * (p.grow ? 1 + u * p.grow : 1)), 0, TAU)
      g.fill()
      break
    case 'glow':
      g.fillStyle = color
      g.globalAlpha = a * 0.25
      g.beginPath()
      g.arc(p.x, p.y, s * 2.6, 0, TAU)
      g.fill()
      g.globalAlpha = a
      g.beginPath()
      g.arc(p.x, p.y, s * 0.8, 0, TAU)
      g.fill()
      break
    case 'line': {
      const L = p.len ?? 0.035
      g.strokeStyle = color
      g.lineWidth = s
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(p.x, p.y)
      g.lineTo(p.x - (p.vx ?? 0) * L, p.y - (p.vy ?? 0) * L)
      g.stroke()
      break
    }
    case 'streak':
      g.strokeStyle = color
      g.lineWidth = s
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(p.x, p.y)
      g.lineTo(p.x - (p.dx ?? 0), p.y - (p.dy ?? 0))
      g.stroke()
      break
    case 'sq':
      g.fillStyle = color
      g.fillRect(p.x - s / 2, p.y - s / 2, s, s)
      break
    case 'coin': {
      const c = Math.cos(p.age * (p.flip ?? 12) + (p.ph ?? 0))
      g.save()
      g.translate(p.x, p.y)
      g.scale(Math.max(0.12, Math.abs(c)), 1)
      g.fillStyle = c > 0 ? '#ffcc4d' : '#e09a24'
      g.beginPath()
      g.arc(0, 0, s, 0, TAU)
      g.fill()
      g.strokeStyle = '#a86a10'
      g.lineWidth = Math.max(0.5, s * 0.18)
      g.stroke()
      g.fillStyle = '#fff2c4'
      g.globalAlpha = a * 0.7
      g.fillRect(-s * 0.15, -s * 0.5, s * 0.3, s)
      g.restore()
      break
    }
    case 'petal':
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot ?? 0)
      g.scale(1, 0.55 + 0.45 * Math.cos(p.age * (p.flip ?? 3)))
      g.fillStyle = color
      g.beginPath()
      g.ellipse(0, 0, s, s * 0.5, 0, 0, TAU)
      g.fill()
      g.restore()
      break
    case 'star': {
      const k = p.pop ? Math.min(1, u * 6) * (1 - u * 0.6) : 1
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot ?? 0)
      g.scale(k, k)
      g.fillStyle = color
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.42 : s
        const an = (i / 10) * TAU - 1.571
        g.lineTo(Math.cos(an) * r, Math.sin(an) * r)
      }
      g.closePath()
      g.fill()
      g.restore()
      break
    }
    case 'ring': {
      const r = lerp(p.r0 ?? 0, p.r1 ?? 0, eo3(u))
      g.strokeStyle = color
      g.lineWidth = Math.max(0.5, s * (1 - u))
      g.beginPath()
      g.ellipse(p.x, p.y, Math.max(0, r), Math.max(0, r * (p.flat ?? 1)), 0, 0, TAU)
      g.stroke()
      break
    }
    case 'bolt': {
      const pts = p.pts ?? []
      const shown = Math.min(pts.length, Math.ceil(pts.length * clamp(p.age / (p.draw || 0.15))))
      const layers: [number, string, number][] = [
        [s * 5, color, 0.25],
        [s * 2, color, 0.6],
        [s * 0.8, '#ffffff', 1],
      ]
      for (const [w, c, al] of layers) {
        g.globalAlpha = a * al * (Math.random() < 0.15 ? 0.4 : 1)
        g.strokeStyle = c
        g.lineWidth = w
        g.lineJoin = 'round'
        g.lineCap = 'round'
        g.beginPath()
        for (let i = 0; i < shown; i++) {
          const pt = pts[i] as [number, number]
          if (i) g.lineTo(pt[0], pt[1])
          else g.moveTo(pt[0], pt[1])
        }
        g.stroke()
      }
      break
    }
  }
}
