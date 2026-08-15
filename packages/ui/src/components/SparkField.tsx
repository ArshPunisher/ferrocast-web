// The Spark, drawn in points: the same opening as the website banner, for the app. A cloud of
// soft points pulls together into the mark (the f in ink, the upper shard Molten, the lower
// shard Arc), holds, then most of them drift out into a quiet star field while the mark stays
// lit. The whole field tilts a little toward the pointer.
//
// Plain 2D canvas (no WebGL), capped pixel ratio, paused when hidden. Under reduced motion it
// draws the finished mark once.
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { SPARK } from '../brand'
import { cx } from '../cx'

interface Pt {
  // mark position (unit box), chaos start, field position (unit box)
  mx: number
  my: number
  cx: number
  cy: number
  fx: number
  fy: number
  z: number
  seed: number
  part: 0 | 1 | 2 // f, Molten shard, Arc shard
  stay: boolean // stays in the mark after the burst
}

const PAINT = {
  dark: { ink: '#eef0f4', molten: '#ffa424', arc: '#33d4ff', alpha: 0.9 },
  light: { ink: '#1a1e25', molten: '#cf7400', arc: '#0888b8', alpha: 0.85 },
}

function sample(count: number): Pt[] {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return []
  const shapes = [new Path2D(SPARK.f), new Path2D(SPARK.boltTop), new Path2D(SPARK.boltBottom)]
  const { x, y, width, height } = SPARK.box
  const share = [0.6, 0.2, 0.2]
  const out: Pt[] = []
  for (let s = 0; s < 3; s++) {
    const want = Math.round(count * share[s]!)
    let got = 0,
      guard = 0
    while (got < want && guard++ < want * 300) {
      const px = x + Math.random() * width
      const py = y + Math.random() * height
      if (!ctx.isPointInPath(shapes[s]!, px, py)) continue
      const a = Math.random() * Math.PI * 2
      const r = 0.55 + Math.pow(Math.random(), 0.6) * 1.6
      out.push({
        mx: (px - (x + width / 2)) / height,
        my: (py - (y + height / 2)) / height,
        cx: (Math.random() - 0.5) * 4,
        cy: (Math.random() - 0.5) * 3,
        fx: Math.cos(a) * r * 1.4,
        fy: Math.sin(a) * r,
        z: Math.random(),
        seed: Math.random(),
        part: s as 0 | 1 | 2,
        stay: Math.random() < 0.58,
      })
      got++
    }
  }
  return out
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (t: number) => Math.min(1, Math.max(0, t))

export function SparkField({
  className,
  light = false,
  label,
}: {
  className?: string
  light?: boolean
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const paint = PAINT[light ? 'light' : 'dark']
    const colors = [paint.ink, paint.molten, paint.arc]
    let W = 1,
      H = 1,
      dpr = 1,
      pts: Pt[] = []
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!pts.length) pts = sample(Math.round(Math.min(2600, (W * H) / 140)))
    }
    resize()

    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2
      tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    if (!reduce) window.addEventListener('pointermove', onMove, { passive: true })

    const draw = (time: number) => {
      // 0-1.8 s: pull together; 1.8-2.4 s: hold; 2.4-4.4 s: most drift out into the field
      const assemble = reduce ? 1 : ease(clamp(time / 1.8))
      const scatter = reduce ? 1 : ease(clamp((time - 2.4) / 2))
      tilt.x += (tilt.tx - tilt.x) * 0.05
      tilt.y += (tilt.ty - tilt.y) * 0.05
      ctx.clearRect(0, 0, W, H)
      const size = Math.min(W * 0.42, H * 0.36)
      const ox = W / 2,
        oy = H * 0.4
      for (const p of pts) {
        const out = p.stay ? 0 : scatter
        let x = p.cx + (p.mx - p.cx) * assemble
        let y = p.cy + (p.my - p.cy) * assemble
        x += (p.fx - x) * out
        y += (p.fy - y) * out
        const drift = reduce ? 0 : 0.006 + 0.04 * (1 - assemble) + 0.03 * out
        const t = time * (0.35 + p.seed * 0.5)
        x += Math.sin(t + p.seed * 6.28) * drift
        y += Math.cos(t * 0.8 + p.seed * 12) * drift
        // a little depth: near points move more with the pointer
        const depth = 0.3 + p.z * 0.7
        const sx = ox + x * size + tilt.x * 14 * depth
        const sy = oy + y * size + tilt.y * 10 * depth
        const inMark = 1 - out
        const r = (0.6 + p.z * 1.1) * (1 + 0.35 * inMark * assemble)
        const tone = inMark > 0.5 || p.seed > 0.86 ? p.part : 0
        ctx.globalAlpha = paint.alpha * (0.35 + 0.65 * depth) * (0.5 + 0.5 * Math.max(inMark, 0.4))
        ctx.fillStyle = colors[tone]!
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      raf = 0
      if (document.hidden) return
      draw((now - t0) / 1000)
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => {
      resize()
      kick()
    })
    ro.observe(canvas)
    document.addEventListener('visibilitychange', kick)
    kick()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', kick)
      window.removeEventListener('pointermove', onMove)
    }
  }, [light, reduce])

  return (
    <canvas
      ref={ref}
      className={cx('block', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
