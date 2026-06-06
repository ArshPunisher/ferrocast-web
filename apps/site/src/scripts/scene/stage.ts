// The persistent 3D background shared by every page: a camera that flies down a tunnel of
// guide rings as the page scrolls, with stream cards (alerts, chat, tips, overlays) floating
// in depth. The home page also gets the hero braid at the start of the path.
//
// Performance: one renderer, one draw call per card, pause in background tabs, capped and
// adaptive pixel ratio, fewer cards on phones and on calm pages (docs, legal), and a single
// still frame under prefers-reduced-motion.
import * as THREE from 'three'
import { paint, DECKS, MARGIN, PAL, FONTS, type Kind, type Theme } from './cards'
import { createBraid, type Braid } from './braid'

export type Mode = 'home' | 'page' | 'calm'
export interface StageOptions { canvas: HTMLCanvasElement; mode: Mode; deck: string }

const theme = (): Theme => {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const CARD_W: Record<Kind, number> = { obs: 1.9, alert: 1.75, chat: 1.3, tip: 1.05, goal: 1.6, log: 1.7, download: 1.45, stat: 0.9, mod: 1.6 }

const VERT = /* glsl */ `varying vec2 vUv; varying float vZ;
  void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`
const FRAG = /* glsl */ `
  uniform sampler2D map; uniform float uFocus, uBlurK, uNear, uFar, uOpacity, uFocusTol, uClear, uClearAmt; uniform vec2 uTexel, uRes;
  varying vec2 vUv; varying float vZ;
  void main() {
    float blur = clamp((abs(vZ - uFocus) - uFocusTol) * uBlurK, 0.0, 1.0);
    float bias = blur * 3.2;
    vec2 o = uTexel * (1.0 + blur * 9.0);
    vec4 c = texture2D(map, vUv, bias) * 0.36
      + 0.16 * (texture2D(map, vUv + vec2(o.x, o.y), bias) + texture2D(map, vUv + vec2(-o.x, o.y), bias)
              + texture2D(map, vUv + vec2(o.x, -o.y), bias) + texture2D(map, vUv + vec2(-o.x, -o.y), bias));
    float fade = smoothstep(uNear, uNear + 2.4, vZ) * (1.0 - smoothstep(uFar - 14.0, uFar, vZ));
    // keep the content column calm: cards fade where text usually sits
    float nx = abs(gl_FragCoord.x / uRes.x * 2.0 - 1.0);
    float clear = mix(1.0 - uClearAmt, 1.0, smoothstep(uClear * 0.9, uClear * 1.02, nx));
    gl_FragColor = c * fade * clear * uOpacity;
  }`

interface Card { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; tex: THREE.CanvasTexture; kind: Kind; index: number; side: number; fx: number; fy: number; z: number; rz: number; seed: number }

export async function mountStage(opts: StageOptions) {
  const { canvas, mode } = opts
  const root = document.documentElement
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760
  const calm = mode === 'calm'
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 14, 40)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  const FOCUS = 8

  try {
    await Promise.all([`600 18px ${FONTS.d}`, `400 14px ${FONTS.b}`, `600 14px ${FONTS.b}`, `500 11px ${FONTS.m}`].map((f) => document.fonts.load(f)))
  } catch { /* draw with fallbacks */ }

  /* ---------- guide lines: rings down the tunnel and an Arc spiral ---------- */
  const lineMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, fog: true, depthWrite: false })
  const arcMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, fog: true, depthWrite: false })
  const lines = new THREE.Group()
  scene.add(lines)

  /* ---------- cards ---------- */
  const shared = {
    uFocus: { value: FOCUS }, uBlurK: { value: calm ? 0.26 : 0.2 }, uNear: { value: 1.6 }, uFar: { value: 30 },
    uFocusTol: { value: 2.4 }, uOpacity: { value: 1 }, uClear: { value: 0.8 }, uClearAmt: { value: 0.75 },
    uRes: { value: new THREE.Vector2(1, 1) },
  }
  const cards: Card[] = []
  const deck = DECKS[opts.deck] ?? DECKS[mode === 'home' ? 'home' : calm ? 'calm' : 'page'] ?? []
  function makeCard(kind: Kind, index: number) {
    const s = paint(kind, index, theme())
    const tex = new THREE.CanvasTexture(s.c)
    tex.premultiplyAlpha = true
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 4
    const w = CARD_W[kind] * (mobile ? 0.62 : 1)
    const fw = (w * (s.w + 2 * MARGIN)) / s.w, fh = (fw * s.c.height) / s.c.width
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, map: { value: tex }, uTexel: { value: new THREE.Vector2(1 / s.c.width, 1 / s.c.height) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), mat)
    scene.add(mesh)
    return { mesh, mat, tex }
  }

  /* ---------- hero braid (home) ---------- */
  let braid: Braid | null = null
  const hero = document.querySelector<HTMLElement>('[data-hero]')
  const chipEls = ['twitch', 'youtube', 'kick'].map((n) => document.querySelector<HTMLElement>(`[data-braid-chip="${n}"]`))
  const homeChip = document.querySelector<HTMLElement>('[data-braid-home]')
  if (mode === 'home' && hero) {
    braid = createBraid(mobile)
    scene.add(braid.group)
  }

  /* ---------- layout (depends on page length and viewport) ---------- */
  const state = { w: 1, h: 1, dpr: 1, length: 20, z0: 10, themeMix: theme() === 'light' ? 1 : 0, themeTo: theme() === 'light' ? 1 : 0, t: 0 }
  const maxDpr = mobile ? 1.5 : 1.75
  state.dpr = Math.min(devicePixelRatio || 1, maxDpr)
  // seeded per route, so each page gets its own arrangement but it never jumps on reload
  const seed0 = [...location.pathname].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2147483646, 7) + 1
  const rnd = (() => { let s = seed0; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()

  function build() {
    // rings
    lines.children.forEach((m) => (m as THREE.Mesh).geometry.dispose())
    lines.clear()
    const docH = document.documentElement.scrollHeight, vh = innerHeight
    state.length = Math.min(90, Math.max(14, (docH / vh) * (calm ? 4 : 6)))
    const halfH = Math.tan(THREE.MathUtils.degToRad(20)) * FOCUS
    const halfW = halfH * (state.w / state.h)
    const ringR = Math.max(halfH * 1.05, Math.min(halfW, halfH * 1.9) * 0.92)
    const tube = mobile ? 0.014 : 0.01
    const ringCount = Math.ceil((state.length + 20) / 6.5)
    for (let k = 0; k < ringCount; k++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(ringR * (k % 2 ? 1.18 : 1), tube, 4, 180), lineMat)
      m.position.z = state.z0 - 4 - k * 6.5
      lines.add(m)
    }
    if (!calm) {
      const pts: THREE.Vector3[] = []
      const turns = (state.length + 24) / 9, R = ringR * 0.72
      for (let i = 0; i <= 700; i++) {
        const t = i / 700, a = t * Math.PI * 2 * turns
        pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * 0.8, state.z0 + 2 - t * (state.length + 24)))
      }
      lines.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 1100, tube, 4, false), arcMat))
    }
    // cards: one per ~1.7 units of path, fewer on phones and calm pages
    const want = deck.length === 0 ? 0 : Math.round(Math.min(mobile ? 18 : calm ? 14 : 44, (state.length + 12) / (mobile ? 2.6 : calm ? 3 : 1.6)))
    while (cards.length < want) {
      const i = cards.length
      const kind = deck[i % deck.length] as Kind
      const { mesh, mat, tex } = makeCard(kind, i * 3 + 1)
      cards.push({ mesh, mat, tex, kind, index: i * 3 + 1, side: i % 2 ? 1 : -1, fx: rnd(), fy: rnd(), z: 0, rz: (rnd() - 0.5) * 0.14, seed: rnd() * 10 })
    }
    while (cards.length > want) {
      const c = cards.pop() as Card
      scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mat.dispose(); c.tex.dispose()
    }
    place()
  }
  function place() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(20)) * FOCUS
    const halfW = halfH * (state.w / state.h)
    // keep the content column clear on wide screens: cards live in the side bands
    const contentHalf = Math.min(1, 620 / (state.w / 2))
    const n = cards.length
    cards.forEach((c, i) => {
      // home: the hero stretch belongs to the braid, cards start after it
      const startZ = state.z0 - (mode === 'home' ? 13 : 5)
      c.z = startZ - ((i + 0.5) / n) * (state.length + 6) + (c.fy - 0.5) * 1.2
      let x: number, y: number
      if (mobile || contentHalf > 0.9) {
        x = (c.fx - 0.5) * 2 * halfW * 1.05
        y = (c.fy - 0.5) * 2 * halfH * 0.95
      } else {
        const band0 = Math.min(1, contentHalf + 0.03), band1 = Math.max(band0 + 0.12, 1.08)
        // inner edge of the card starts at the column edge, not its centre
        const half = ((c.mesh.geometry as THREE.PlaneGeometry).parameters.width / 2) * 0.82
        x = c.side * ((band0 + c.fx * (band1 - band0)) * halfW + half)
        y = (c.fy - 0.5) * 2 * halfH * 0.9
      }
      c.mesh.position.set(x, y, c.z)
      c.mesh.userData.by = y
      c.mesh.rotation.set(0, -x * 0.03, c.rz)
    })
    // calm pages and phones keep cards quiet behind text
    shared.uOpacity.value = calm ? 0.5 : mobile ? 0.42 : contentHalf > 0.9 ? 0.7 : 1
    shared.uNear.value = mobile ? 4.2 : 1.6
    shared.uClear.value = Math.min(1, contentHalf + 0.02)
    shared.uClearAmt.value = mobile ? 0.35 : calm ? 0.9 : 0.85
  }

  function applyTheme() {
    const t = theme()
    state.themeTo = t === 'light' ? 1 : 0
    const p = PAL[t]
    scene.fog?.color.set(p.bg as string)
    ;(lineMat.color as THREE.Color).set(p.guide as string)
    lineMat.opacity = (t === 'light' ? 0.5 : 0.36) * (calm ? 0.6 : 1)
    arcMat.color.set(p.arc as string)
    arcMat.opacity = t === 'light' ? 0.4 : 0.34
    for (const c of cards) {
      c.tex.image = paint(c.kind, c.index, t).c
      c.tex.needsUpdate = true
    }
  }

  function resize() {
    // a 0-size window (minimised, hidden iframe) would make the aspect NaN
    state.w = Math.max(1, innerWidth)
    state.h = Math.max(1, innerHeight)
    renderer.setPixelRatio(state.dpr)
    renderer.setSize(state.w, state.h, false)
    shared.uRes.value.set(state.w * state.dpr, state.h * state.dpr)
    camera.aspect = state.w / state.h
    camera.updateProjectionMatrix()
    if (braid) {
      braid.uniforms.uRes.value.set(state.w, state.h)
      braid.uniforms.uDpr.value = state.dpr
      // anchor the braid to the hero's visual column (measured), so it follows the real
      // layout at every width: the channel ends at the column's left edge on wide screens
      // and the platform streams run off the right edge; on phones it centres in the column
      const col = hero?.querySelector<HTMLElement>('.braid-fallback')?.parentElement ?? hero ?? document.body
      const r = col.getBoundingClientRect()
      const top = r.top + scrollY
      const wide = state.w >= 900
      const visW = Math.max(220, r.width)
      const unitPx = wide ? visW / 5.2 : Math.min(visW, state.w) / 7.4
      const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(20)) * state.z0) / state.h
      const L = braid.layout
      const ox = wide ? r.left + 34 + -L.end * unitPx : r.left + r.width / 2 + 0.25 * unitPx
      const oy = top + Math.max(80, Math.min(r.height, state.h - top)) / 2
      braid.group.scale.setScalar(unitPx * worldPerPx)
      braid.group.position.set((ox - state.w / 2) * worldPerPx, -(oy - state.h / 2) * worldPerPx, 0)
    }
    build()
  }

  /* ---------- loop ---------- */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = -((e.clientY / innerHeight) * 2 - 1); wake() }, { passive: true })
  addEventListener('scroll', () => wake(), { passive: true })
  addEventListener('keydown', () => wake(), { passive: true })
  addEventListener('touchstart', () => wake(), { passive: true })
  let sp = 0, last = 0, raf = 0, frames = 0, fpsT = 0, slow = 0, sampled = 0, chipsShown = true
  // WCAG 2.2.2 and battery: the drift stops 5 s after the last scroll, pointer or key input
  // and wakes on the next one (scrolling itself is user-driven motion)
  const IDLE_MS = 20_000
  let lastInput = performance.now()
  const v = new THREE.Vector3()
  const chipAt = new THREE.Vector3()
  function placeChip(el: HTMLElement | null, p: THREE.Vector3, vis: number) {
    if (!el) return
    v.copy(p).applyMatrix4(braid!.group.matrixWorld).project(camera)
    el.style.transform = `translate3d(${(((v.x + 1) / 2) * state.w).toFixed(1)}px, ${(((1 - v.y) / 2) * state.h).toFixed(1)}px, 0)`
    el.style.opacity = String(vis)
  }
  const scrollProgress = () => {
    const docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    return Math.min(1, Math.max(0, scrollY / docMax))
  }
  function frame(dt: number) {
    const p = scrollProgress()
    sp += (p - sp) * (dt ? 1 - Math.exp(-dt * 4.5) : 1)
    const k = dt ? 1 - Math.exp(-dt * 5) : 1
    pointer.sx += (pointer.x - pointer.sx) * k
    pointer.sy += (pointer.y - pointer.sy) * k
    state.themeMix += (state.themeTo - state.themeMix) * (dt ? 1 - Math.exp(-dt * 7) : 1)
    const z = state.z0 - sp * state.length
    const x = Math.sin(sp * 5.2) * 0.35 + pointer.sx * 0.45
    const y = Math.cos(sp * 3.7) * 0.25 + pointer.sy * 0.3
    camera.position.set(x, y, z)
    camera.lookAt(x * 0.25, y * 0.25, z - 12)
    for (const c of cards) {
      c.mesh.position.y = (c.mesh.userData.by as number) + Math.sin(state.t * 0.6 + c.seed) * 0.05
      c.mesh.rotation.z = c.rz + Math.sin(state.t * 0.4 + c.seed) * 0.02
    }
    if (braid && hero) {
      const hp = Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight)))
      const vis = 1 - Math.min(1, Math.max(0, (hp - 0.15) / 0.55))
      const shown = vis > 0.01
      braid.group.visible = shown
      braid.uniforms.uTime.value = state.t
      braid.uniforms.uAlpha.value = 0.62 * vis
      braid.setTheme(state.themeMix)
      // once the hero has scrolled away the chips are hidden: skip projecting them
      if (shown || chipsShown) {
        braid.group.updateMatrixWorld()
        chipEls.forEach((el, i) => placeChip(el, braid!.center(braid!.layout.badge, i, state.t, chipAt), shown ? vis : 0))
        placeChip(homeChip, braid.center(braid.layout.end, 0, state.t, chipAt), shown ? vis : 0)
        chipsShown = shown
      }
    }
    renderer.render(scene, camera)
  }
  function tick(now: number) {
    if (now - lastInput > IDLE_MS && Math.abs(scrollProgress() - sp) < 1e-4) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(tick)
    const dtRaw = last ? (now - last) / 1000 : 1 / 60
    last = now
    const dt = Math.min(dtRaw, 1 / 20)
    state.t += dt
    frame(dt)
    frames++
    fpsT += dtRaw
    if (fpsT >= 1) {
      ;(window as unknown as { __fcFps?: number[] }).__fcFps ??= []
      const log = (window as unknown as { __fcFps: number[] }).__fcFps
      log.push(Math.round(frames / fpsT))
      if (log.length > 60) log.shift()
      frames = 0
      fpsT = 0
    }
    sampled++
    if (dtRaw * 1000 > 19) slow++
    if (sampled >= 90) {
      if (slow > 45 && state.dpr > 1.01) {
        state.dpr = Math.max(1, state.dpr - 0.25)
        renderer.setPixelRatio(state.dpr)
        renderer.setSize(state.w, state.h, false)
        shared.uRes.value.set(state.w * state.dpr, state.h * state.dpr)
        if (braid) braid.uniforms.uDpr.value = state.dpr
      }
      sampled = 0
      slow = 0
    }
  }
  function still() {
    // reduced motion: one calm frame, no drift, no scroll flight
    state.t = 4
    state.themeMix = state.themeTo
    pointer.x = pointer.y = pointer.sx = pointer.sy = 0
    sp = 0
    frame(0)
  }
  function run() {
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    if (lost) return
    if (reduce.matches) { still(); return }
    if (!document.hidden) raf = requestAnimationFrame(tick)
  }
  /** Input: restart the loop if it went idle. Reduced motion has no loop to wake. */
  function wake() {
    lastInput = performance.now()
    if (lost || reduce.matches) return
    if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(tick) }
  }
  /** Layout or theme change: redraw the still frame, or wake the loop. */
  function refresh() {
    if (reduce.matches) { if (!lost) still() } else wake()
  }
  // context loss (GPU reset, too many contexts): stop drawing and show the static fallback
  let lost = false
  canvas.addEventListener('webglcontextlost', () => {
    lost = true
    cancelAnimationFrame(raf)
    raf = 0
    canvas.classList.remove('ready')
    root.classList.add('no-webgl')
  })

  root.dataset.scene = mode
  resize()
  applyTheme()
  run()
  canvas.classList.add('ready')

  let rT = 0
  addEventListener('resize', () => { clearTimeout(rT); rT = window.setTimeout(() => { resize(); refresh() }, 120) })
  document.addEventListener('visibilitychange', run)
  reduce.addEventListener('change', run)
  const onTheme = () => { applyTheme(); refresh() }
  document.addEventListener('fc-theme', onTheme)
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', onTheme)
  // reduced motion: no loop, but the still frame must drop the braid once the hero is gone
  if (hero) {
    new IntersectionObserver(() => { if (reduce.matches && !lost) still() }, { threshold: [0, 0.15, 0.4, 0.7, 1] }).observe(hero)
  }
  // page height (and the hero column the braid anchors to) can change after fonts and
  // images settle; resize() re-measures both and rebuilds
  // its own timer: sharing rT let this observer (which fires on every width change too)
  // cancel the pending window resize, leaving the canvas at the old size
  let bT = 0
  new ResizeObserver(() => { clearTimeout(bT); bT = window.setTimeout(() => { resize(); refresh() }, 200) }).observe(document.body)
}
