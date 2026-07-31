// Runs every station on the page with ONE WebGL renderer. The renderer draws offscreen and
// each visible station copies its pixels into its own canvas, which sits in the page flow
// inside a box reserved for it: 3D never draws behind text, and it scrolls with the page
// exactly (no fixed layer lagging behind the scroll).
//
// Performance: only stations near the viewport render; the loop stops in hidden tabs and
// when nothing is visible; a paused station redraws only while its camera still moves; pixel
// ratio is capped and drops when frames run slow; phones get lighter scenes. Under reduced
// motion nothing moves by itself: a station redraws only when scrolling changes its view.
import * as THREE from 'three'
import { STATIONS } from './scenes'
import type { Station } from './types'

interface Slot {
  el: HTMLElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  kind: string
  st: Station | null
  visible: boolean
  w: number
  h: number
  t: number
  lastP: number
  drawn: boolean
  pointer: { x: number; y: number }
}

const isLight = () => {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t === 'light'
  return matchMedia('(prefers-color-scheme: light)').matches
}

export function mountChannel(els: HTMLElement[]) {
  const root = document.documentElement
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile || devicePixelRatio < 2,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(1)
  renderer.setScissorTest(true)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const gl = renderer.domElement
  const maxDpr = mobile ? 1.75 : 2
  let dpr = Math.min(devicePixelRatio || 1, maxDpr)
  let bufW = 1,
    bufH = 1
  let light = isLight()

  const slots: Slot[] = []
  for (const el of els) {
    const canvas = el.querySelector<HTMLCanvasElement>('canvas.st-canvas')
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) continue
    slots.push({
      el,
      canvas,
      ctx,
      kind: el.dataset.station ?? '',
      st: null,
      visible: false,
      w: 1,
      h: 1,
      t: 3,
      lastP: -1,
      drawn: false,
      pointer: { x: 0, y: 0 },
    })
  }

  const ensure = (s: Slot) => {
    if (s.st) return s.st
    const build = STATIONS[s.kind]
    if (!build) return null
    s.st = build(s.el, mobile, renderer)
    s.st.setTheme(light)
    s.el.classList.add('live')
    return s.st
  }

  const size = (s: Slot) => {
    const r = s.canvas.getBoundingClientRect()
    s.w = Math.max(1, Math.round(r.width))
    s.h = Math.max(1, Math.round(r.height))
    const pw = Math.round(s.w * dpr),
      ph = Math.round(s.h * dpr)
    if (s.canvas.width !== pw || s.canvas.height !== ph) {
      s.canvas.width = pw
      s.canvas.height = ph
      s.drawn = false
    }
  }

  // how far the box has travelled through the viewport, unless the station has its own measure
  const progress = (s: Slot) => {
    const st = ensure(s)
    if (st?.progress) return st.progress(reduce.matches)
    const r = s.el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)))
  }

  const draw = (s: Slot, p: number, dt: number) => {
    const st = ensure(s)
    if (!st) return
    const pw = s.canvas.width,
      ph = s.canvas.height
    if (pw > bufW || ph > bufH) {
      bufW = Math.max(bufW, pw)
      bufH = Math.max(bufH, ph)
      renderer.setSize(bufW, bufH, false)
    }
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1
    st.prepare?.(renderer)
    st.update({
      p,
      t: s.t,
      dt,
      w: s.w,
      h: s.h,
      dpr,
      px: s.pointer.x,
      py: s.pointer.y,
      reduced: reduce.matches,
    })
    renderer.setViewport(0, 0, pw, ph)
    renderer.setScissor(0, 0, pw, ph)
    renderer.render(st.scene, st.camera)
    s.ctx.clearRect(0, 0, pw, ph)
    s.ctx.drawImage(gl, 0, bufH - ph, pw, ph, 0, 0, pw, ph)
  }

  /* ---------- loop ---------- */
  let raf = 0,
    last = 0,
    slow = 0,
    sampled = 0,
    lost = false
  const paused = (s: Slot) => s.el.dataset.paused === 'true'
  const tick = (now: number) => {
    raf = 0
    const live = slots.filter((s) => s.visible)
    if (!live.length || document.hidden || lost) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    const raw = last ? now - last : 16
    last = now
    const still = reduce.matches
    // read every box first, then draw: no layout reads between writes
    const ps = live.map(progress)
    live.forEach((s, i) => {
      const p = ps[i] ?? 0.5
      // paused or reduced motion: redraw only while scrolling still moves the camera
      const frozen = still || paused(s)
      const settled = s.st?.settled ? s.st.settled() : true
      if (frozen && s.drawn && settled && Math.abs(p - s.lastP) < 1e-4) return
      if (!frozen) s.t += dt
      s.lastP = p
      s.drawn = true
      draw(s, p, dt)
    })
    sampled++
    if (raw > 22) slow++
    if (sampled >= 90) {
      if (slow > 40 && dpr > 1.01) {
        dpr = Math.max(1, dpr - 0.25)
        slots.forEach(size)
      }
      sampled = slow = 0
    }
    raf = requestAnimationFrame(tick)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    if (lost) return
    if (!document.hidden) raf = requestAnimationFrame(tick)
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = slots.find((x) => x.el === e.target)
        if (!s) continue
        s.visible = e.isIntersecting
        if (s.visible) size(s)
      }
      run()
    },
    { rootMargin: '80px 0px' },
  )
  slots.forEach((s) => io.observe(s.el))

  let rT = 0
  const ro = new ResizeObserver(() => {
    clearTimeout(rT)
    rT = window.setTimeout(() => {
      slots.forEach(size)
      run()
    }, 100)
  })
  slots.forEach((s) => ro.observe(s.el))

  // pointer tilt for the stations that use it (the app icon)
  for (const s of slots) {
    s.el.addEventListener(
      'pointermove',
      (e) => {
        const r = s.el.getBoundingClientRect()
        s.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
        s.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
      },
      { passive: true },
    )
    s.el.addEventListener('pointerleave', () => {
      s.pointer.x = s.pointer.y = 0
    })
    s.el.addEventListener('station-pause', run)
  }

  const onTheme = () => {
    light = isLight()
    slots.forEach((s) => {
      s.st?.setTheme(light)
      s.drawn = false
    })
    run()
  }
  document.addEventListener('fc-theme', onTheme)
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', onTheme)
  document.addEventListener('visibilitychange', run)
  reduce.addEventListener('change', () => {
    slots.forEach((s) => (s.drawn = false))
    run()
  })

  gl.addEventListener('webglcontextlost', () => {
    lost = true
    cancelAnimationFrame(raf)
    root.classList.add('no-webgl')
    slots.forEach((s) => s.el.classList.remove('live'))
  })

  root.classList.add('channel-ready')
  run()
}
