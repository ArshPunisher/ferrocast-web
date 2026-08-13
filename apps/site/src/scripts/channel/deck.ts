// The control deck (site-style study S2): tactile hardware for going live, hotkeys and panic
// mode. Scrolling flips the ON AIR lever, presses keycaps, then hits the big PANIC button.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { APP_DARK, PLAT, canvasTex, font, paint, rr, type Plat } from './paint'
import { easeOut, follower, mix, plateau, smooth, storyTarget } from './story'
import type { Build } from './types'

interface World {
  scene: THREE.Scene
  setTheme(light: boolean): void
  animate(s: number, t: number, dt: number, reduced: boolean): void
}
let shared: World | null = null
const PLATFORMS: [Plat, string][] = [
  ['twitch', 'Twitch'],
  ['youtube', 'YouTube'],
  ['kick', 'Kick'],
]

function buildWorld(renderer: THREE.WebGLRenderer, mobile: boolean): World {
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 0.6)
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(-4, 9, 5)
  key.castShadow = true
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 })
  key.shadow.radius = 6
  key.shadow.bias = -0.0004
  scene.add(hemi, key)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.3 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.31
  ground.receiveShadow = true
  scene.add(ground)

  let light = false
  const deck = new THREE.Group()
  deck.rotation.x = 0.06
  scene.add(deck)

  const shell = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.35 })
  const plate = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.15 })
  const capMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 })
  const molten = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.1 })
  const groove = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.9 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.25 })
  const cast = <T extends THREE.Mesh>(m: T) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  deck.add(cast(new THREE.Mesh(new RoundedBoxGeometry(7.8, 0.62, 4.8, 6, 0.24), shell)))
  const top = cast(new THREE.Mesh(new RoundedBoxGeometry(7.4, 0.06, 4.4, 4, 0.03), plate))
  top.position.y = 0.32
  deck.add(top)

  /* ---- display, tilted toward the viewer */
  const screenGroup = new THREE.Group()
  screenGroup.position.set(-1.25, 1.25, -1.85)
  screenGroup.rotation.x = -0.32
  deck.add(screenGroup)
  screenGroup.add(cast(new THREE.Mesh(new RoundedBoxGeometry(4.7, 2.55, 0.34, 6, 0.14), shell)))
  let screenBeat = -1
  const screenTex = canvasTex(1024, 512, (c, w, h) => drawScreen(c, w, h, Math.max(0, screenBeat)))
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.15), screenMat)
  screen.position.z = 0.175
  screenGroup.add(screen)
  const stand = cast(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.3), shell))
  stand.position.set(-1.25, 0.6, -2.0)
  deck.add(stand)

  function drawScreen(c: CanvasRenderingContext2D, w: number, h: number, beat: number) {
    c.fillStyle = '#0a0c10'
    c.fillRect(0, 0, w, h)
    c.save()
    if (beat <= 1) {
      const on = beat === 1
      c.fillStyle = on ? '#ffa424' : '#2a2f3a'
      rr(c, 60, 66, on ? 150 : 196, 54, 27)
      c.fill()
      c.fillStyle = on ? '#16110a' : '#9aa1ad'
      c.font = font(30, 800)
      c.fillText(on ? 'LIVE' : 'OFF AIR', 92, 104)
      c.fillStyle = '#eef0f4'
      c.font = font(72, 700, true)
      c.fillText(on ? "You're on air" : 'Ready when you are', 60, 232)
      c.fillStyle = '#9aa1ad'
      c.font = font(32, 500)
      c.fillText(on ? 'Connected to three platforms' : 'Signed in to three platforms', 60, 290)
      PLATFORMS.forEach(([k, n], i) => {
        const x = 60 + i * 230
        c.fillStyle = PLAT[k]
        rr(c, x, 370, 14, 44, 5)
        c.fill()
        c.fillStyle = '#eef0f4'
        c.font = font(34, 650)
        c.fillText(n, x + 30, 405)
      })
    } else if (beat === 2) {
      c.translate(60, 70)
      paint.alert(c, w - 120, 270, { ...APP_DARK, radius: 40 })
      c.restore()
      c.save()
      c.fillStyle = '#9aa1ad'
      c.font = font(30, 600)
      c.fillText('Test alert, from a hotkey', 60, 420)
    } else {
      c.fillStyle = '#ffa424'
      rr(c, 60, 56, 270, 54, 27)
      c.fill()
      c.fillStyle = '#16110a'
      c.font = font(28, 800)
      c.fillText('PANIC MODE ON', 84, 93)
      c.fillStyle = '#eef0f4'
      c.font = font(56, 700, true)
      c.fillText('Chat is locked down', 60, 196)
      PLATFORMS.forEach(([k, n], i) => {
        const y = 278 + i * 66
        c.fillStyle = PLAT[k]
        rr(c, 60, y - 34, 14, 44, 5)
        c.fill()
        c.fillStyle = '#eef0f4'
        c.font = font(32, 650)
        c.fillText(n, 94, y)
        c.fillStyle = '#9aa1ad'
        c.font = font(30, 500)
        c.fillText('followers-only, slow mode', 300, y)
      })
    }
    c.restore()
  }

  /* ---- keypad: 3 x 2 keycaps with printed legends */
  const legends = ['Test', 'Replay', 'Skip', 'Pause', 'Mute', 'Clear']
  const legendTex: ReturnType<typeof canvasTex>[] = []
  const keys = legends.map((label, i) => {
    const col = i % 3,
      row = Math.floor(i / 3)
    const g = new THREE.Group()
    g.position.set(-3.0 + col * 1.08, 0.35, 0.35 + row * 1.08)
    const cap = cast(
      new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.34, 0.9, 5, 0.12), i === 0 ? molten : capMat),
    )
    cap.position.y = 0.17
    g.add(cap)
    const lt = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h)
      c.fillStyle = i === 0 ? '#16110a' : light ? '#2a2f38' : '#d9dde5'
      c.font = font(52, 700)
      c.textAlign = 'center'
      c.fillText(label, w / 2, h / 2 + 18)
    })
    legendTex.push(lt)
    const legend = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: lt, transparent: true, toneMapped: false }),
    )
    legend.rotation.x = -Math.PI / 2
    legend.position.y = 0.345
    g.add(legend)
    deck.add(g)
    return g
  })

  /* ---- three channel faders, one per platform */
  const faders = PLATFORMS.map(([p], i) => {
    const x = 0.55 + i * 0.62
    const slot = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.04, 2.0, 2, 0.02), groove)
    slot.position.set(x, 0.35, 0.75)
    deck.add(slot)
    const knob = cast(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.3, 0.3, 4, 0.08), capMat))
    knob.position.set(x, 0.5, 1.5)
    deck.add(knob)
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.02, 0.08),
      new THREE.MeshBasicMaterial({ color: PLAT[p], toneMapped: false }),
    )
    led.position.set(x, 0.351, -0.42)
    deck.add(led)
    return knob
  })

  /* ---- ON AIR lever */
  const liveG = new THREE.Group()
  liveG.position.set(3.05, 0.35, -1.25)
  deck.add(liveG)
  const liveBase = cast(new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.18, 1.3, 4, 0.06), shell))
  liveBase.position.y = 0.09
  liveG.add(liveBase)
  const lever = new THREE.Group()
  lever.position.y = 0.18
  const stick = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 16), steel))
  stick.position.y = 0.4
  const tipBall = cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), capMat))
  tipBall.position.y = 0.82
  lever.add(stick, tipBall)
  liveG.add(lever)
  const ledMat = new THREE.MeshBasicMaterial({ toneMapped: false })
  const liveLed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), ledMat)
  liveLed.position.set(-0.75, 0.05, -0.35)
  liveG.add(liveLed)

  /* ---- the big PANIC button under a guard ring */
  const banG = new THREE.Group()
  banG.position.set(3.05, 0.35, 1.0)
  deck.add(banG)
  const ring = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.2, 48), shell))
  ring.position.y = 0.1
  banG.add(ring)
  const banCap = cast(
    new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), molten),
  )
  banCap.scale.y = 0.55
  banCap.position.y = 0.2
  banG.add(banCap)

  const labelTex = (text: string) =>
    canvasTex(256, 96, (c, w, h) => {
      c.clearRect(0, 0, w, h)
      c.fillStyle = light ? '#4f5561' : '#9aa1ad'
      c.font = font(40, 700)
      c.textAlign = 'center'
      c.fillText(text, w / 2, h / 2 + 14)
    })
  const labels = [
    ['ON AIR', liveG, 0.92],
    ['PANIC', banG, 1.0],
  ].map(([text, g, z]) => {
    const t = labelTex(text as string)
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.36),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(0, 0.01, z as number)
    ;(g as THREE.Group).add(m)
    return t
  })

  const setTheme = (l: boolean) => {
    light = l
    shell.color.set(l ? '#d4d7dc' : '#22262e')
    plate.color.set(l ? '#c7cbd1' : '#191c22')
    capMat.color.set(l ? '#f4f5f7' : '#2c313b')
    molten.color.set(l ? '#e9800c' : '#f58a12')
    molten.envMapIntensity = 0.5
    ;(ground.material as THREE.ShadowMaterial).opacity = l ? 0.16 : 0.45
    hemi.intensity = l ? 0.9 : 0.55
    scene.environmentIntensity = l ? 0.8 : 0.6
    legendTex.forEach((t) => t.redraw())
    labels.forEach((t) => t.redraw())
  }

  let arrived = -1,
    pressT = 9,
    liveOn = 0
  const animate = (s: number, t: number, dt: number, reduced: boolean) => {
    const nearest = Math.round(s)
    const at = Math.abs(s - nearest) < 0.06 ? nearest : -1
    if (at !== -1 && at !== arrived) {
      arrived = at
      pressT = 0
    }
    // the screen changes at the halfway point of each move, so it always matches the lever
    const beat = nearest
    if (beat !== screenBeat) {
      screenBeat = beat
      screenTex.redraw()
    }
    pressT += dt
    const press = reduced ? 0 : Math.max(0, Math.sin(Math.min(1, pressT / 0.32) * Math.PI))
    // the lever flips once the first beat arrives and stays on
    const wantLive = s > 0.7 ? 1 : 0
    liveOn = reduced ? wantLive : liveOn + (wantLive - liveOn) * Math.min(1, dt * 6)
    lever.rotation.x = mix(0.5, -0.5, easeOut(liveOn))
    ledMat.color.set(liveOn > 0.5 ? (light ? '#e9800c' : '#ffa424') : light ? '#9aa0a8' : '#3a3f48')
    // hotkeys: on their beat the keys press in turn, one at a time
    const hk = smooth(1.6, 2, s) * (1 - smooth(2.4, 2.8, s))
    const cur = Math.floor(t / 1.1) % keys.length
    const kp = reduced ? 0 : Math.max(0, Math.sin(Math.min(1, (t % 1.1) / 0.3) * Math.PI)) * hk
    keys.forEach((g, i) => {
      const d = i === cur ? kp * 0.16 : 0
      g.children[0]!.position.y = 0.17 - d
      g.children[1]!.position.y = 0.345 - d
    })
    const up = smooth(0.6, 1.2, s)
    faders.forEach((k, j) => (k.position.z = mix(1.5, 0.15 + j * 0.06, up)))
    banCap.position.y = 0.2 - (arrived === 3 ? press * 0.12 : 0)
  }

  return { scene, setTheme, animate }
}

const CAM = (
  [
    [[0.12, 0.75, 1], [0, 0.6, -0.2], 9.6, 7.6],
    [[0.2, 0.85, 1], [0.2, 0.7, -0.4], 9.8, 6.6],
    [[-0.2, 0.85, 1], [-0.8, 0.6, -0.2], 8.4, 5.6],
    [[0.3, 0.8, 1], [0.6, 0.6, -0.1], 8.2, 5.6],
  ] as const
).map(([d, t, w, h]) => ({
  dir: new THREE.Vector3(...d).normalize(),
  at: new THREE.Vector3(...t),
  w,
  h,
}))

export const deck: Build = (el, mobile, renderer) => {
  shared ??= buildWorld(renderer, mobile)
  const world = shared
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200)
  const pos = follower(4)
  let target = 0
  const dir = new THREE.Vector3(),
    at = new THREE.Vector3()
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
    update({ t, dt, w, h, reduced }) {
      const s = plateau(Math.min(3, Math.max(0, pos.step(target, dt, reduced))), 0.3)
      const i = Math.min(2, Math.floor(s)),
        f = s - i
      const a = CAM[i]!,
        b = CAM[i + 1]!
      dir.copy(a.dir).lerp(b.dir, f).normalize()
      at.copy(a.at).lerp(b.at, f)
      const aspect = w / h
      camera.aspect = aspect
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const dist = Math.max(mix(a.w, b.w, f) / (2 * tan * aspect), mix(a.h, b.h, f) / (2 * tan))
      camera.position.copy(at).addScaledVector(dir, dist)
      camera.lookAt(at)
      camera.updateProjectionMatrix()
      world.animate(s, t, dt, reduced)
    },
    setTheme: world.setTheme,
    dispose() {},
  }
}
