import { FRAG, VERT } from './shader'

export interface FerroColors {
  /** Page background, `#rrggbb`. The puddle fades into it. */
  background: string
  /** Rim light, `#rrggbb`. */
  accent: string
  light?: boolean
}

export interface Magnet {
  /** -1..1 across the floor (left to right). */
  x: number
  /** -1..1 into the scene (near to far). */
  z: number
  /** 0 = no magnet, 1 = full strength. */
  strength: number
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1] ?? '000000', 16) : 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Draws the ferrofluid scene into a canvas with WebGL 1. Pure in its inputs: the same time
 * and magnet always give the same frame, so the site, the dashboard and the Remotion videos
 * share one look.
 */
export class Ferrofluid {
  private readonly gl: WebGLRenderingContext
  private readonly prog: WebGLProgram
  private readonly u: Record<string, WebGLUniformLocation | null>
  private colors: { bg: [number, number, number]; accent: [number, number, number]; light: number }
  spike = 1

  static supported(): boolean {
    try {
      const c = document.createElement('canvas')
      return !!c.getContext('webgl')
    } catch {
      return false
    }
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    colors: FerroColors,
    opts: { preserveDrawingBuffer?: boolean } = {},
  ) {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    })
    if (!gl) throw new Error('WebGL is not available')
    this.gl = gl
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) throw new Error('shader')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const prog = gl.createProgram()
    if (!prog) throw new Error('program')
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
    this.prog = prog
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this.u = {}
    for (const name of ['uRes', 'uTime', 'uMag', 'uBg', 'uAccent', 'uSpike', 'uLight'])
      this.u[name] = gl.getUniformLocation(prog, name)
    this.colors = {
      bg: hexToRgb(colors.background),
      accent: hexToRgb(colors.accent),
      light: colors.light ? 1 : 0,
    }
  }

  setColors(c: FerroColors): void {
    this.colors = { bg: hexToRgb(c.background), accent: hexToRgb(c.accent), light: c.light ? 1 : 0 }
  }

  /** Sizes the drawing buffer; `scale` < 1 renders fewer pixels and lets CSS upscale. */
  resize(cssWidth: number, cssHeight: number, scale: number): void {
    const w = Math.max(1, Math.round(cssWidth * scale))
    const h = Math.max(1, Math.round(cssHeight * scale))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  render(timeSec: number, magnet: Magnet): void {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.prog)
    gl.uniform2f(this.u.uRes ?? null, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.u.uTime ?? null, timeSec)
    gl.uniform3f(this.u.uMag ?? null, magnet.x * 1.1, magnet.z * 0.8, magnet.strength)
    gl.uniform3f(this.u.uBg ?? null, ...this.colors.bg)
    gl.uniform3f(this.u.uAccent ?? null, ...this.colors.accent)
    gl.uniform1f(this.u.uSpike ?? null, this.spike)
    gl.uniform1f(this.u.uLight ?? null, this.colors.light)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

export interface InteractiveOptions extends FerroColors {
  /** Start rendering only when visible; stop when scrolled away or the tab is hidden. */
  reducedMotion?: boolean
  /** Fraction of CSS pixels to render (adapts down if frames are slow). */
  scale?: number
  onReady?: () => void
}

/**
 * Runs the scene in a canvas that follows the pointer like a magnet. Pauses when off
 * screen or hidden, adapts resolution to the frame budget, renders one still frame under
 * reduced motion. Returns a cleanup function.
 */
export function mountFerrofluid(canvas: HTMLCanvasElement, opts: InteractiveOptions): () => void {
  let ff: Ferrofluid
  try {
    ff = new Ferrofluid(canvas, opts)
  } catch {
    return () => {}
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  let scale = (opts.scale ?? 0.75) * dpr
  const target: Magnet = { x: 0, z: -0.05, strength: 0.85 }
  const mag: Magnet = { ...target }
  let visible = true
  let raf = 0
  let last = performance.now()
  let slow = 0
  let fast = 0
  const start = last
  let ready = false

  const size = () => {
    const r = canvas.getBoundingClientRect()
    ff.resize(r.width, r.height, scale)
  }
  const frame = (now: number) => {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    const ms = now - last
    last = now
    // Critically damped follow: the field lags the hand a little, like a real fluid.
    const k = 1 - Math.exp(-dt * 4.5)
    mag.x += (target.x - mag.x) * k
    mag.z += (target.z - mag.z) * k
    mag.strength += (target.strength - mag.strength) * k
    ff.render((now - start) / 1000, mag)
    if (!ready) {
      ready = true
      opts.onReady?.()
    }
    if (ms > 24) slow++
    else if (ms < 14) fast++
    if (slow > 20 && scale > 0.35) {
      scale *= 0.8
      slow = fast = 0
      size()
    } else if (fast > 240 && scale < 0.75 * dpr) {
      scale = Math.min(0.75 * dpr, scale * 1.1)
      slow = fast = 0
      size()
    }
    if (visible && !opts.reducedMotion) raf = requestAnimationFrame(frame)
  }
  const kick = () => {
    if (!raf && visible) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  size()
  if (opts.reducedMotion) {
    ff.render(1.2, mag)
    opts.onReady?.()
  } else kick()

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
    target.z = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1.1))
    target.strength = 1
  }
  const onLeave = () => {
    target.x = 0
    target.z = -0.05
    target.strength = 0.85
  }
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((en) => en.isIntersecting) && document.visibilityState === 'visible'
    if (visible && !opts.reducedMotion) kick()
  })
  io.observe(canvas)
  const onVis = () => {
    visible = document.visibilityState === 'visible'
    if (visible && !opts.reducedMotion) kick()
  }
  const ro = new ResizeObserver(() => {
    size()
    if (opts.reducedMotion) ff.render(1.2, mag)
  })
  ro.observe(canvas)
  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', onVis)
  return () => {
    if (raf) cancelAnimationFrame(raf)
    io.disconnect()
    ro.disconnect()
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    document.removeEventListener('visibilitychange', onVis)
    ff.dispose()
  }
}
