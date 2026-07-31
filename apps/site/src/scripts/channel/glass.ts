// The glass studio (site-style study S1): each part of the app is a thick glass card. They
// float apart, one comes forward to be tested on its own, then they lock together into the
// dashboard. Card faces are opaque and depth-tested, so one card can only hide another,
// never show through it.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { APP_DARK, APP_LIGHT, blobTex, canvasTex, paint, type Line } from './paint'
import { follower, mix, plateau, storyTarget, weight } from './story'
import type { Build } from './types'

type Lay = [number, number, number, number, number, number] // x, y, z, rx, ry, scale
interface World {
  scene: THREE.Scene
  setTheme(light: boolean): void
  animate(s: number, t: number): void
}
let shared: World | null = null

const chatLines: Line[] = [
  ['twitch', 'kestrel', 'that clutch was unreal'],
  ['youtube', 'Dana Okafor', 'first time catching you live'],
  ['kick', 'boltrunner', 'GG, raid incoming'],
  ['twitch', 'mirelle_plays', 'hydrate check'],
  ['youtube', 'Tomasz W.', 'what keybind is that?'],
  ['kick', 'nadia.k', 'the overlay looks clean'],
  ['twitch', 'oslo_rook', 'lurking from work'],
]

function buildWorld(renderer: THREE.WebGLRenderer, mobile: boolean): World {
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  let light = false

  // a soft backdrop and two coloured light pools for the glass to bend
  const backdropTex = canvasTex(512, 512, (c, w, h) => {
    const g = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, w * 0.5)
    g.addColorStop(0, light ? '#ffffff' : '#1a1f2b')
    g.addColorStop(1, light ? '#eef0f3' : '#101216')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  })
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ map: backdropTex, toneMapped: false }),
  )
  backdrop.position.z = -6
  scene.add(backdrop)
  const glowTex = blobTex('rgba(255,255,255,1)')
  const orbs = (
    [
      ['molten', [-1.6, 1.4, -4.5], 4.2],
      ['arc', [2.0, -1.2, -4.6], 4.6],
    ] as const
  ).map(([tone, p, r]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    m.scale.setScalar(r)
    m.position.set(p[0], p[1], p[2])
    m.userData = { tone, p }
    scene.add(m)
    return m
  })
  const shadowTex = blobTex('rgba(0,0,0,0.55)')

  // phones: frosted acrylic instead of real transmission (one less render pass per frame)
  const glassMat = () =>
    mobile
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.3,
          transparent: true,
          opacity: 0.38,
          clearcoat: 1,
          clearcoatRoughness: 0.15,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.22,
          transmission: 1,
          thickness: 0.9,
          ior: 1.42,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
        })

  const B = 0.25
  const G: Record<string, [number, number]> = {
    alert: [-1.65, 1.95],
    mod: [-1.65, -0.125],
    goal: [-1.65, -2.075],
    tip: [2.05, 1.85],
    chat: [2.05, -0.975],
  }
  const scatter = (n: string, z: number, rx: number, ry: number, k = 1.12): Lay => [
    G[n]![0] * k * 1.0,
    G[n]![1] * k,
    z,
    rx,
    ry,
    1,
  ]
  const grid = (n: string, z = 0): Lay => [G[n]![0], G[n]![1], z, 0, 0, 1]
  const dock: Record<string, [number, number]> = {
    mod: [-2.65, -1.95],
    goal: [-0.64, -1.95],
    tip: [1.185, -1.95],
    chat: [2.83, -1.95],
  }
  // [entering, floating apart, one card tested, the dashboard]
  const LAY: Record<string, Lay[]> = {
    alert: [scatter('alert', -1.4, 0.2, 0.4, 1.4), scatter('alert', 0.5, 0.1, 0.28), [0, 1.0, 0.6, 0.05, -0.06, 1.45], grid('alert')],
    mod: [scatter('mod', -2.2, -0.1, 0.35, 1.5), scatter('mod', -0.3, -0.06, 0.22), [...dock.mod!, 0, 0.1, 0, 0.45], grid('mod', 0.02)],
    goal: [scatter('goal', -1.8, -0.25, 0.4, 1.4), scatter('goal', 0.2, -0.18, 0.3), [...dock.goal!, 0, 0.1, 0, 0.45], grid('goal')],
    tip: [scatter('tip', -2.0, 0.25, -0.4, 1.45), scatter('tip', -0.4, 0.16, -0.26), [...dock.tip!, 0, 0.1, 0, 0.45], grid('tip')],
    chat: [scatter('chat', -1.6, -0.12, -0.45, 1.4), scatter('chat', 0.1, -0.08, -0.32), [...dock.chat!, 0, 0.1, 0, 0.45], grid('chat')],
  }
  const defs: [string, number, number, keyof typeof paint][] = [
    ['alert', 3.4, 1.05, 'alert'],
    ['mod', 3.4, 1.7, 'mod'],
    ['goal', 3.4, 0.8, 'goal'],
    ['tip', 2.6, 1.25, 'tip'],
    ['chat', 2.6, 3.0, 'chat'],
  ]
  const ui = () => (light ? APP_LIGHT : APP_DARK)
  const tiles = defs.map(([name, w, h, painter], i) => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new RoundedBoxGeometry(w + B * 2, h + B * 2, 0.42, 6, 0.2), glassMat()))
    const t = canvasTex(1024, Math.round(1024 * (h / w)), (c, cw, ch) =>
      (paint[painter] as (c: CanvasRenderingContext2D, w: number, h: number, o: object) => void)(
        c,
        cw,
        ch,
        { ...ui(), lines: chatLines },
      ),
    )
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, toneMapped: false }),
    )
    face.position.z = 0.215
    g.add(face)
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.7, h * 2.0),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    )
    sh.position.set(0.2, -0.4, -0.6)
    g.add(sh)
    g.userData = { lay: LAY[name], phase: i * 1.7, shadow: sh, tex: t }
    scene.add(g)
    return g
  })

  const setTheme = (l: boolean) => {
    light = l
    backdropTex.redraw()
    orbs.forEach((o) => {
      const m = o.material as THREE.MeshBasicMaterial
      m.color.set(o.userData.tone === 'molten' ? (l ? '#e9800c' : '#ffa424') : l ? '#0888b8' : '#33d4ff')
      m.opacity = l ? 0.38 : 0.32
    })
    tiles.forEach((tl) => {
      tl.userData.tex.redraw()
      ;(tl.userData.shadow.material as THREE.MeshBasicMaterial).opacity = l ? 0.22 : 0.55
    })
  }

  const animate = (s: number, t: number) => {
    const i = Math.min(2, Math.floor(s)),
      f = s - i
    const assembled = Math.min(1, Math.max(0, s - 2))
    const float = (1 - assembled * 0.92) * (1 - weight(s, 2) * 0.6)
    tiles.forEach((tl) => {
      const { lay, phase } = tl.userData as { lay: Lay[]; phase: number }
      const a = lay[i]!,
        b = lay[i + 1]!
      tl.position.set(
        mix(a[0], b[0], f) + Math.sin(t * 0.5 + phase) * 0.06 * float,
        mix(a[1], b[1], f) + Math.sin(t * 0.7 + phase) * 0.1 * float,
        mix(a[2], b[2], f),
      )
      tl.rotation.set(
        mix(a[3], b[3], f) + Math.sin(t * 0.4 + phase) * 0.03 * float,
        mix(a[4], b[4], f) + Math.cos(t * 0.35 + phase) * 0.04 * float,
        0,
      )
      tl.scale.setScalar(mix(a[5], b[5], f))
    })
    orbs.forEach((o, j) => {
      const p = o.userData.p as number[]
      o.position.set(
        (p[0] ?? 0) + Math.sin(t * 0.25 + j * 2) * 0.5,
        (p[1] ?? 0) + Math.cos(t * 0.2 + j) * 0.4,
        p[2] ?? 0,
      )
    })
  }
  return { scene, setTheme, animate }
}

export const glass: Build = (el, mobile, renderer) => {
  shared ??= buildWorld(renderer, mobile)
  const world = shared
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
  const pos = follower(4)
  const look = new THREE.Vector2()
  const aim = new THREE.Vector2()
  let target = 0
  return {
    scene: world.scene,
    camera,
    prepare(r) {
      r.toneMapping = THREE.ACESFilmicToneMapping
      r.toneMappingExposure = 1.02
    },
    progress(reduced) {
      target = storyTarget(el, reduced)
      return target
    },
    settled: () => pos.settled(target),
    update({ t, dt, w, h, px, py, reduced }) {
      const s = plateau(Math.min(3, Math.max(0, pos.step(target, dt, reduced))))
      camera.aspect = w / h
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const z = Math.max(6.6 / (2 * tan), 8.6 / (2 * tan * camera.aspect)) + 2
      look.lerp(aim.set(px, py), reduced ? 1 : 1 - Math.exp(-dt * 3))
      camera.position.set(look.x * 0.6, look.y * 0.45, z)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      world.animate(s, t)
    },
    setTheme: world.setTheme,
    dispose() {},
  }
}
