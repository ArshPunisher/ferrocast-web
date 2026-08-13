// Home banner only: a star field of soft points, in the manner of the ClearCraft Labs hero.
//
// On every load of the home page the points start as a loose cloud, pull together into the
// Spark (the f in ink, the upper shard Molten, the lower shard Arc), hold for a beat, then
// burst out into a field around the banner while the braid fades in. After that the field
// drifts and tilts toward the cursor. It lives in the hero section only and stops when the
// hero is off screen or the tab is hidden. Under reduced motion it is one still frame of
// the finished field.
import * as THREE from 'three'
import { gsap } from 'gsap'
import { SPARK } from '@ferrocast/ui/brand'

const CAM_Z = 7

const VERT = /* glsl */ `
  attribute vec3 aChaos;
  attribute vec3 aField;
  attribute float aSeed;
  attribute float aPart;  // 0 the f, 1 the Molten shard, 2 the Arc shard
  attribute float aTone;  // field colour: 0 ink, 1 Molten, 2 Arc
  uniform float uAssemble;
  uniform float uScatter;
  uniform float uTime;
  uniform float uSize;
  uniform vec3 uInk;
  uniform vec3 uMolten;
  uniform vec3 uArc;
  varying vec3 vColor;
  varying float vSeed;
  vec3 tone(float k) { return k < 0.5 ? uInk : (k < 1.5 ? uMolten : uArc); }
  void main() {
    vec3 p = mix(aChaos, position, uAssemble);
    p = mix(p, aField, uScatter);
    float drift = 0.02 + 0.16 * (1.0 - uAssemble) + 0.2 * uScatter;
    float t = uTime * (0.35 + aSeed * 0.5);
    p += vec3(sin(t + aSeed * 6.28), cos(t * 0.8 + aSeed * 12.0), sin(t * 0.6 + aSeed * 3.0)) * drift;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // the mark is drawn with slightly larger points so its shape reads clearly
    float big = mix(1.0, 1.35, uAssemble * (1.0 - uScatter));
    gl_PointSize = uSize * big * (0.5 + aSeed) / -mv.z;
    vColor = mix(tone(aPart), tone(aTone), uScatter);
    vSeed = aSeed;
  }
`
const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * uOpacity * (0.55 + 0.45 * vSeed));
  }
`

const PAINT = {
  dark: { ink: '#eef0f4', molten: '#ffa424', arc: '#33d4ff', mark: 0.95, field: 0.62 },
  light: { ink: '#1a1e25', molten: '#cf7400', arc: '#0888b8', mark: 0.9, field: 0.4 },
}
const isLight = () => {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t === 'light'
  return matchMedia('(prefers-color-scheme: light)').matches
}

/** Points spread over the Spark's shapes, centred on 0 with a height of 1. */
function sampleSpark(count: number) {
  const ctx = document.createElement('canvas').getContext('2d')
  const pos = new Float32Array(count * 3)
  const part = new Float32Array(count)
  if (!ctx) return { pos, part }
  const shapes = [new Path2D(SPARK.f), new Path2D(SPARK.boltTop), new Path2D(SPARK.boltBottom)]
  const { x, y, width, height } = SPARK.box
  // the shards are smaller than the f: give each shape a share by its rough area
  const share = [0.62, 0.19, 0.19]
  let i = 0
  for (let s = 0; s < 3; s++) {
    const want = s === 2 ? count - i : Math.round(count * share[s]!)
    let got = 0,
      guard = 0
    while (got < want && guard++ < want * 200) {
      const px = x + Math.random() * width
      const py = y + Math.random() * height
      if (!ctx.isPointInPath(shapes[s]!, px, py)) continue
      pos[i * 3] = (px - (x + width / 2)) / height
      pos[i * 3 + 1] = -(py - (y + height / 2)) / height
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.06
      part[i] = s
      i++
      got++
    }
  }
  return { pos, part }
}

export function mountHeroField(hero: HTMLElement, stage: HTMLElement, opts: { intro: boolean }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-field'
  canvas.setAttribute('aria-hidden', 'true')
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    })
  } catch {
    return null
  }
  hero.prepend(canvas)
  const small = innerWidth < 900
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, CAM_Z)
  const root = new THREE.Group() // moved by scroll
  const rig = new THREE.Group() // pointer tilt and idle float
  root.add(rig)
  scene.add(root)

  const COUNT = Math.round(4200 * (small ? 0.5 : 1) * (weak ? 0.6 : 1))
  const { pos, part } = sampleSpark(COUNT)
  const basePos = pos.slice()
  const chaos = new Float32Array(COUNT * 3)
  const field = new Float32Array(COUNT * 3)
  const seed = new Float32Array(COUNT)
  const toneArr = new Float32Array(COUNT)
  const dir = new THREE.Vector3()
  for (let i = 0; i < COUNT; i++) {
    chaos.set(
      [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6],
      i * 3,
    )
    seed[i] = Math.random()
    const r = Math.random()
    toneArr[i] = r > 0.92 ? 1 : r > 0.86 ? 2 : 0 // ~14% accent, split Molten / Arc
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aChaos', new THREE.BufferAttribute(chaos, 3))
  geo.setAttribute('aField', new THREE.BufferAttribute(field, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1))
  geo.setAttribute('aTone', new THREE.BufferAttribute(toneArr, 1))
  const uniforms = {
    uAssemble: { value: 0 },
    uScatter: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 26 * renderer.getPixelRatio() },
    uOpacity: { value: 0 },
    uInk: { value: new THREE.Color() },
    uMolten: { value: new THREE.Color() },
    uArc: { value: new THREE.Color() },
  }
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
    }),
  )
  points.frustumCulled = false
  rig.add(points)

  let paint = PAINT.dark
  const setTheme = () => {
    paint = PAINT[isLight() ? 'light' : 'dark']
    uniforms.uInk.value.set(paint.ink)
    uniforms.uMolten.value.set(paint.molten)
    uniforms.uArc.value.set(paint.arc)
  }

  // The mark sits over the braid's box; the field is a wide shell around the whole banner.
  // Both are written into the point positions, so the shader only has to blend.
  const place = () => {
    const w = hero.clientWidth,
      h = hero.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * CAM_Z
    const halfW = halfH * camera.aspect
    const hr = hero.getBoundingClientRect(),
      sr = stage.getBoundingClientRect()
    const cx = ((sr.left + sr.width / 2 - hr.left) / w) * 2 - 1
    const cy = -(((sr.top + sr.height / 2 - hr.top) / h) * 2 - 1)
    const size = Math.min((sr.height / h) * 2 * halfH * 0.62, (sr.width / w) * 2 * halfW * 0.7)
    // size and place the mark over the braid (basePos holds it in unit size)
    const baked = geo.getAttribute('position') as THREE.BufferAttribute
    const src = basePos
    for (let i = 0; i < COUNT; i++) {
      baked.setXYZ(
        i,
        src[i * 3]! * size + cx * halfW,
        src[i * 3 + 1]! * size + cy * halfH,
        src[i * 3 + 2]! * size,
      )
    }
    baked.needsUpdate = true
    // the field: a shell from just outside the mark to past the banner's edges
    const r0 = size * 0.9,
      r1 = Math.max(halfW, halfH) * 1.5
    for (let i = 0; i < COUNT; i++) {
      dir.randomDirection()
      const r = r0 + Math.pow(Math.random(), 0.7) * (r1 - r0)
      field.set([dir.x * r * 1.3 + cx * halfW * 0.5, dir.y * r * 0.8, dir.z * r * 0.6 - 1], i * 3)
    }
    ;(geo.getAttribute('aField') as THREE.BufferAttribute).needsUpdate = true
  }

  // pointer: the whole field tilts toward it
  const target = { x: 0, y: 0 }
  const ac = new AbortController()
  if (!reduce)
    addEventListener(
      'pointermove',
      (e) => {
        target.x = (e.clientX / innerWidth) * 2 - 1
        target.y = (e.clientY / innerHeight) * 2 - 1
      },
      { passive: true, signal: ac.signal },
    )

  let running = false,
    visible = true,
    raf = 0
  const t0 = performance.now()
  const render = () => renderer.render(scene, camera)
  const tick = () => {
    raf = 0
    if (!running) return
    const t = (performance.now() - t0) / 1000
    uniforms.uTime.value = t
    rig.rotation.y += (target.x * 0.35 + Math.sin(t * 0.4) * 0.12 - rig.rotation.y) * 0.05
    rig.rotation.x += (target.y * 0.22 + Math.cos(t * 0.3) * 0.06 - rig.rotation.x) * 0.05
    rig.position.y = Math.sin(t * 0.8) * 0.05
    // the field tips back as the banner scrolls away
    const p = Math.min(1, scrollY / Math.max(1, hero.offsetHeight))
    root.rotation.x = p * 0.6
    root.position.y = p * 1.2
    render()
    raf = requestAnimationFrame(tick)
  }
  const setRunning = (on: boolean) => {
    if (reduce) return
    if (on && !running) {
      running = true
      if (!raf) raf = requestAnimationFrame(tick)
    } else if (!on) {
      // drop the frame already queued, so a hide/show never leaves two loops running
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting
    setRunning(visible && !document.hidden)
  })
  io.observe(hero)
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden), {
    signal: ac.signal,
  })
  let rT = 0
  const ro = new ResizeObserver(() => {
    clearTimeout(rT)
    rT = window.setTimeout(() => {
      place()
      if (!running) render()
    }, 120)
  })
  ro.observe(hero)
  const onTheme = () => {
    setTheme()
    uniforms.uOpacity.value = Math.min(uniforms.uOpacity.value, paint.field)
    if (uniforms.uScatter.value >= 1) uniforms.uOpacity.value = paint.field
    if (!running) render()
  }
  document.addEventListener('fc-theme', onTheme, { signal: ac.signal })
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', onTheme, {
    signal: ac.signal,
  })

  setTheme()
  place()

  // the burst: points fly out into the field and the braid fades in with them
  const done = () => document.documentElement.classList.add('hero-burst')
  if (reduce || !opts.intro) {
    uniforms.uAssemble.value = 1
    uniforms.uScatter.value = 1
    uniforms.uOpacity.value = paint.field
    done()
    if (reduce) render()
    else setRunning(visible && !document.hidden)
    return { canvas }
  }
  setRunning(visible && !document.hidden)
  const tl = gsap.timeline()
  tl.to(uniforms.uOpacity, { value: paint.mark, duration: 0.6, ease: 'power1.out' }, 0)
    .to(uniforms.uAssemble, { value: 1, duration: 1.6, ease: 'power3.inOut' }, 0)
    .add(done, 2.4)
    .to(uniforms.uScatter, { value: 1, duration: 2.2, ease: 'power2.inOut' }, 1.9)
    .to(uniforms.uOpacity, { value: () => paint.field, duration: 2.2 }, 1.9)
  // any scroll, click or key skips straight to the field
  const skip = () => {
    if (tl.progress() >= 1) return
    tl.progress(1)
  }
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown'])
    addEventListener(ev, skip, { passive: true, once: true, signal: ac.signal })
  return { canvas }
}
