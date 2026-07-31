// The isometric streamer room (site-style study S3). The camera starts on the whole room as
// the story scrolls in, then flies to the monitor (alerts), the portrait screen (merged chat)
// and the phone (tips). Models are bevelled and lit by a soft room environment plus one
// shadow-casting key light, so edges catch light and corners darken like ambient occlusion.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { APP_DARK, blobTex, canvasTex, font, paint, rr, type Line } from './paint'
import { easeOut, follower, mix, plateau, storyTarget, weight } from './story'
import type { Build } from './types'

type MatName =
  | 'floor'
  | 'wallA'
  | 'wallB'
  | 'desk'
  | 'deskEdge'
  | 'device'
  | 'mid'
  | 'soft'
  | 'chair'
  | 'chairDark'
  | 'plant'
  | 'pot'
  | 'rug'
  | 'foam'
  | 'metal'

interface World {
  scene: THREE.Scene
  setTheme(light: boolean): void
  animate(s: number, t: number, reduced: boolean): void
  sun: THREE.DirectionalLight
}

const DY = 1.5 // desk height
let shared: World | null = null

function buildWorld(renderer: THREE.WebGLRenderer, mobile: boolean): World {
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 0.5)
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(5, 11, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 })
  sun.shadow.radius = 6
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  const ringLight = new THREE.PointLight(0xffa424, 5, 6, 1.6)
  const screenLight = new THREE.PointLight(0x33d4ff, 2.2, 5, 1.8)
  screenLight.position.set(0.1, 2.8, -2.4)
  scene.add(hemi, sun, ringLight, screenLight)

  const M = {} as Record<MatName, THREE.MeshStandardMaterial>
  const names: MatName[] = [
    'floor',
    'wallA',
    'wallB',
    'desk',
    'deskEdge',
    'device',
    'mid',
    'soft',
    'chair',
    'chairDark',
    'plant',
    'pot',
    'rug',
    'foam',
    'metal',
  ]
  for (const n of names) M[n] = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 })
  M.device.roughness = 0.45
  M.metal.metalness = 0.85
  M.metal.roughness = 0.3
  M.plant.flatShading = true
  M.rug.roughness = 1
  M.foam.roughness = 0.95
  const glow = new THREE.MeshBasicMaterial({ toneMapped: false })
  const arcGlow = new THREE.MeshBasicMaterial({ toneMapped: false })

  const room = new THREE.Group()
  scene.add(room)
  const shadowed = (m: THREE.Mesh, cast = true) => {
    m.castShadow = cast
    m.receiveShadow = true
    return m
  }
  const rbox = (w: number, h: number, d: number, r: number, seg = 3) =>
    new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999)
  function box(
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    r = 0.03,
    parent: THREE.Object3D = room,
  ) {
    const mesh = shadowed(new THREE.Mesh(rbox(w, h, d, r), m))
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  function cyl(
    rt: number,
    rb: number,
    h: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    seg = 24,
    parent: THREE.Object3D = room,
  ) {
    const mesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m))
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  // Soft dark pools under objects: cheap contact shadows that read as ambient occlusion.
  const aoTex = blobTex('rgba(0,0,0,0.55)')
  const aoMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    color: 0x000000,
  })
  const ao = (x: number, y: number, z: number, w: number, d: number, o = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat.clone())
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y + 0.004, z)
    ;(m.material as THREE.MeshBasicMaterial).opacity = o
    room.add(m)
    return m
  }

  /* ---- room shell: a floor island and two walls, all softly bevelled */
  box(9, 0.5, 9, M.floor, 0, -0.25, 0, 0.16)
  box(9, 4.4, 0.3, M.wallA, 0, 2.2, -4.35, 0.08)
  box(0.3, 4.4, 9, M.wallB, -4.35, 2.2, 0, 0.08)
  box(8.4, 0.05, 0.05, arcGlow, 0.15, 4.12, -4.18, 0.02) // LED strip
  // acoustic panels on the back wall
  ;[
    [-2.6, 2.9],
    [-1.75, 2.9],
    [2.0, 2.95],
    [2.85, 2.95],
    [2.0, 2.1],
    [2.85, 2.1],
  ].forEach(([x, y]) => box(0.74, 0.74, 0.08, M.foam, x as number, y as number, -4.16, 0.05))
  // ambient occlusion where walls meet the floor
  ao(0, 0, -4.05, 9, 0.9, 0.5)
  ao(-4.05, 0, 0, 0.9, 9, 0.5)

  /* ---- shelf with books */
  box(2.3, 0.08, 0.5, M.desk, -2.55, 3.55, -3.95, 0.02)
  const bookCols = [M.soft, M.mid, M.foam, M.soft, M.chair]
  ;[0.42, 0.5, 0.36, 0.46, 0.4].forEach((h, i) =>
    box(0.12, h, 0.36, bookCols[i] as THREE.Material, -3.45 + i * 0.15, 3.59 + h / 2, -3.95, 0.015),
  )
  cyl(0.15, 0.13, 0.3, M.pot, -1.85, 3.74, -3.95)

  /* ---- desk */
  box(5.6, 0.14, 2.2, M.desk, 0.2, DY, -3.0, 0.05)
  box(5.62, 0.03, 2.22, M.deskEdge, 0.2, DY - 0.08, -3.0, 0.012)
  box(0.12, DY - 0.07, 2.0, M.device, -2.45, (DY - 0.07) / 2, -3.0, 0.04)
  box(0.12, DY - 0.07, 2.0, M.device, 2.85, (DY - 0.07) / 2, -3.0, 0.04)
  ao(0.2, 0, -3.0, 6.6, 3.2, 0.7)
  box(2.7, 0.02, 1.0, M.mid, 0.2, DY + 0.08, -2.45, 0.01) // desk mat

  /* ---- keyboard: a bevelled base and real keycaps (one instanced draw call) */
  box(1.9, 0.06, 0.62, M.device, 0.1, DY + 0.12, -2.45, 0.03)
  const capGeo = rbox(0.104, 0.05, 0.104, 0.022, 2)
  const caps = new THREE.InstancedMesh(capGeo, M.soft, 4 * 14 + 1)
  const dummy = new THREE.Object3D()
  let n = 0
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 14; c++) {
      dummy.position.set(0.1 - 0.82 + c * 0.126, DY + 0.17, -2.68 + r * 0.128)
      dummy.updateMatrix()
      caps.setMatrixAt(n++, dummy.matrix)
    }
  dummy.position.set(0.1, DY + 0.17, -2.68 + 4 * 0.128 - 0.01)
  dummy.scale.set(5.5, 1, 1)
  dummy.updateMatrix()
  caps.setMatrixAt(n++, dummy.matrix)
  caps.castShadow = true
  caps.receiveShadow = true
  room.add(caps)
  // mouse: a soft pebble
  const mouse = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), M.device))
  mouse.scale.set(0.13, 0.07, 0.21)
  mouse.position.set(1.48, DY + 0.1, -2.4)
  room.add(mouse)

  /* ---- main monitor with the game and the alert overlay */
  const mon = new THREE.Group()
  mon.position.set(0.1, DY + 1.27, -3.35)
  room.add(mon)
  box(2.94, 1.74, 0.1, M.device, 0, 0, 0, 0.05, mon)
  box(0.18, 0.86, 0.08, M.device, 0.1, DY + 0.46, -3.47, 0.03)
  const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 40), M.device))
  foot.scale.z = 0.6
  foot.position.set(0.1, DY + 0.09, -3.4)
  room.add(foot)
  const gameTex = canvasTex(1024, 576, drawGame)
  const monScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.6),
    new THREE.MeshBasicMaterial({ map: gameTex, toneMapped: false }),
  )
  monScreen.position.z = 0.052
  mon.add(monScreen)
  const ALERTS = [
    { kicker: 'New subscriber', title: 'mirelle_plays', detail: 'Tier 1, 7 months' },
    { kicker: 'Raid', title: 'boltrunner', detail: '48 viewers incoming' },
    { kicker: 'New follower', title: 'kestrel', detail: 'Welcome in' },
  ]
  const alertTexes = ALERTS.map((a) =>
    canvasTex(1024, 300, (c, w, h) => paint.alert(c, w, h, { ...APP_DARK, ...a })),
  )
  const alertMat = new THREE.MeshBasicMaterial({
    map: alertTexes[0],
    transparent: true,
    toneMapped: false,
  })
  const alertPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), alertMat)
  alertPlane.position.set(0, 0.32, 0.06)
  mon.add(alertPlane)
  // speakers either side
  for (const x of [-1.85, 2.05]) {
    box(0.42, 0.7, 0.42, M.device, x, DY + 0.42, -3.45, 0.06)
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), M.mid)
    cone.position.set(x, DY + 0.36, -3.235)
    room.add(cone)
  }
  // webcam
  box(0.34, 0.14, 0.16, M.device, 0.1, DY + 2.2, -3.33, 0.06)
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), arcGlow)
  lens.position.set(0.1, DY + 2.2, -3.248)
  room.add(lens)

  /* ---- portrait screen with merged chat, angled in */
  const side = new THREE.Group()
  side.position.set(-2.0, DY + 1.32, -3.05)
  side.rotation.y = 0.5
  room.add(side)
  box(1.1, 1.9, 0.09, M.device, 0, 0, 0, 0.04, side)
  box(0.12, 0.62, 0.08, M.device, -2.06, DY + 0.32, -3.15, 0.03)
  const chatLines: Line[] = [
    ['twitch', 'kestrel', 'that clutch!'],
    ['youtube', 'Dana O.', 'first time here'],
    ['kick', 'boltrunner', 'raid incoming'],
    ['twitch', 'oslo_rook', 'lurking'],
    ['youtube', 'Tomasz W.', 'keybind?'],
    ['kick', 'nadia.k', 'clean overlay'],
    ['twitch', 'mirelle', 'hydrate check'],
    ['youtube', 'Priya S.', 'hi from Pune'],
    ['kick', 'vexa', 'GG'],
  ]
  const chatTex = canvasTex(512, 1536, (c, w, h) => {
    c.fillStyle = '#0d1016'
    c.fillRect(0, 0, w, h)
    paint.chat(c, w, h, { ...APP_DARK, transparent: true, lines: chatLines })
  })
  chatTex.wrapT = THREE.RepeatWrapping
  chatTex.repeat.set(1, 0.6)
  const sideScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 1.8),
    new THREE.MeshBasicMaterial({ map: chatTex, toneMapped: false }),
  )
  sideScreen.position.z = 0.047
  side.add(sideScreen)

  /* ---- phone on a stand, showing the tip page */
  const phone = new THREE.Group()
  phone.position.set(2.15, DY + 0.58, -2.55)
  phone.rotation.set(-0.32, -0.35, 0)
  room.add(phone)
  box(0.64, 1.22, 0.07, M.device, 0, 0, 0, 0.08, phone)
  box(0.5, 0.06, 0.42, M.mid, 2.15, DY + 0.1, -2.47, 0.02)
  const phoneTex = canvasTex(400, 780, drawTipPage)
  const phoneScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 1.14),
    new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }),
  )
  phoneScreen.position.z = 0.037
  phone.add(phoneScreen)
  const badgeTex = canvasTex(640, 160, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    c.fillStyle = '#ffa424'
    rr(c, 0, 0, w, h, h / 2)
    c.fill()
    c.fillStyle = '#16110a'
    c.font = font(58, 750)
    c.textAlign = 'center'
    c.fillText('₹250 to you', w / 2, h / 2 + 20)
  })
  const badgeMat = new THREE.MeshBasicMaterial({
    map: badgeTex,
    transparent: true,
    toneMapped: false,
  })
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.22), badgeMat)
  badge.position.set(0, 0.85, 0.12)
  phone.add(badge)

  /* ---- desk mic on a short stand, beside the keyboard and clear of every close-up */
  const micBase = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 32), M.device))
  micBase.position.set(1.95, DY + 0.09, -3.0)
  room.add(micBase)
  cyl(0.025, 0.025, 0.36, M.metal, 1.95, DY + 0.28, -3.0, 12)
  const mic = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 8, 20), M.soft))
  mic.position.set(1.95, DY + 0.6, -2.98)
  mic.rotation.set(0.25, 0, -0.15)
  room.add(mic)
  ao(1.95, DY + 0.08, -3.0, 0.6, 0.6, 0.5)

  /* ---- ring light */
  cyl(0.035, 0.035, 2.9, M.metal, 3.4, 1.45, -1.3, 12)
  const tri = cyl(0.42, 0.42, 0.05, M.device, 3.4, 0.03, -1.3, 3)
  tri.rotation.y = 0.4
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.075, 16, 64), glow)
  ring.position.set(3.4, 3.1, -1.3)
  ring.rotation.y = -0.9
  room.add(ring)
  const ringBack = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 12, 64), M.device))
  ringBack.position.set(3.43, 3.1, -1.33)
  ringBack.rotation.y = -0.9
  room.add(ringBack)
  ringLight.position.set(3.0, 3.0, -1.6)

  /* ---- chair: its own materials, so it can fade away as the camera flies in past it */
  const chairMats = [M.chair, M.chairDark, M.metal, M.device].map((m) => {
    const c = m.clone()
    c.transparent = true
    return c
  })
  const [cSeat, cDark, cMetal, cDevice] = chairMats as [
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial,
  ]
  const chair = new THREE.Group()
  chair.position.set(0.2, 0, -1.15)
  chair.rotation.y = 0.12
  room.add(chair)
  box(1.15, 0.2, 1.05, cSeat, 0, 1.0, 0, 0.09, chair)
  box(1.1, 1.35, 0.18, cSeat, 0, 1.82, 0.5, 0.09, chair)
  box(0.6, 0.3, 0.16, cDark, 0, 2.62, 0.52, 0.08, chair)
  box(0.12, 0.12, 0.8, cDark, -0.6, 1.3, 0.05, 0.05, chair)
  box(0.12, 0.12, 0.8, cDark, 0.6, 1.3, 0.05, 0.05, chair)
  cyl(0.06, 0.06, 0.78, cMetal, 0, 0.52, 0, 16, chair)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const leg = box(0.55, 0.06, 0.09, cDark, Math.cos(a) * 0.27, 0.12, Math.sin(a) * 0.27, 0.03, chair)
    leg.rotation.y = -a
    const wheel = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), cDevice))
    wheel.position.set(Math.cos(a) * 0.52, 0.06, Math.sin(a) * 0.52)
    chair.add(wheel)
  }
  const chairAo = ao(0.2, 0, -1.15, 1.8, 1.8, 0.8)

  /* ---- plant */
  cyl(0.38, 0.3, 0.62, M.pot, -3.6, 0.31, -3.5, 32)
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 10, 40), M.pot))
  rim.rotation.x = Math.PI / 2
  rim.position.set(-3.6, 0.62, -3.5)
  room.add(rim)
  ;[
    [0, 1.0, 0, 0.5],
    [0.25, 1.45, 0.1, 0.38],
    [-0.2, 1.4, -0.15, 0.36],
    [0.05, 1.82, 0, 0.3],
  ].forEach(([x, y, z, r]) => {
    const leaf = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(r as number, 1), M.plant))
    leaf.position.set(-3.6 + (x as number), y as number, -3.5 + (z as number))
    room.add(leaf)
  })
  ao(-3.6, 0, -3.5, 1.4, 1.4, 0.8)

  /* ---- rug */
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.025, 72), M.rug)
  rug.position.set(0.3, 0.013, -1.0)
  rug.receiveShadow = true
  room.add(rug)

  function drawGame(c: CanvasRenderingContext2D, w: number, h: number) {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#1b2a44')
    g.addColorStop(1, '#0c1220')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#22385c'
    for (let i = 0; i < 7; i++) {
      c.beginPath()
      c.moveTo(i * 170 - 60, h)
      c.lineTo(i * 170 + 40, h * 0.5 + (i % 3) * 40)
      c.lineTo(i * 170 + 150, h)
      c.fill()
    }
    c.fillStyle = '#ffa424'
    c.beginPath()
    c.arc(w * 0.9, h * 0.17, 40, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.88)'
    c.font = font(26, 700)
    c.fillText('LIVE', 28, 46)
  }
  function drawTipPage(c: CanvasRenderingContext2D, w: number, h: number) {
    c.fillStyle = '#0d1016'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#9aa1ad'
    c.font = font(26, 600)
    c.fillText('Tip mirelle_plays', 30, 72)
    c.fillStyle = '#eef0f4'
    c.font = font(64, 700, true)
    c.fillText('₹250', 30, 160)
    ;['₹100', '₹250', '₹500'].forEach((a, i) => {
      const x = 30 + i * 116,
        on = i === 1
      c.fillStyle = on ? '#2a2f3a' : '#171b24'
      rr(c, x, 200, 104, 64, 14)
      c.fill()
      c.strokeStyle = on ? '#ffa424' : '#3a404b'
      c.lineWidth = 3
      c.stroke()
      c.fillStyle = '#eef0f4'
      c.font = font(28, 650)
      c.textAlign = 'center'
      c.fillText(a, x + 52, 243)
      c.textAlign = 'left'
    })
    c.fillStyle = '#9aa1ad'
    c.font = font(24, 500)
    c.fillText('Message', 30, 318)
    c.fillStyle = '#171b24'
    rr(c, 30, 334, w - 60, 110, 14)
    c.fill()
    c.fillStyle = '#eef0f4'
    c.font = font(26, 500)
    c.fillText('love the stream!', 52, 380)
    c.fillStyle = '#ffa424'
    rr(c, 30, 480, w - 60, 78, 39)
    c.fill()
    c.fillStyle = '#16110a'
    c.font = font(30, 750)
    c.textAlign = 'center'
    c.fillText('Pay with UPI', w / 2, 530)
    c.textAlign = 'left'
    c.fillStyle = '#9aa1ad'
    c.font = font(22, 500)
    c.fillText('Paid to the streamer directly.', 30, 610)
  }

  const setTheme = (light: boolean) => {
    const pick: Record<MatName, [string, string]> = {
      floor: ['#2a303c', '#dfe2e7'],
      wallA: ['#222834', '#f3f4f6'],
      wallB: ['#1c212b', '#e8eaee'],
      desk: ['#3b4250', '#cfd3da'],
      deskEdge: ['#2a2f3a', '#b9bec7'],
      device: ['#14171d', '#2b303a'],
      mid: ['#323946', '#c3c8d0'],
      soft: ['#c9ced8', '#f7f8fa'],
      chair: ['#1f5c78', '#0a6f96'],
      chairDark: ['#173f52', '#0a4f6b'],
      plant: ['#3f7d5c', '#5c9a72'],
      pot: ['#d6dae1', '#ffffff'],
      rug: ['#313847', '#d3d7de'],
      foam: ['#283a4d', '#cfe3ec'],
      metal: ['#9aa1ad', '#b9bec7'],
    }
    for (const nm of names) M[nm].color.set(pick[nm][light ? 1 : 0])
    chairMats.forEach((c, i) => c.color.copy([M.chair, M.chairDark, M.metal, M.device][i]!.color))
    glow.color.set(light ? '#ffb347' : '#ffa424')
    arcGlow.color.set(light ? '#0888b8' : '#33d4ff')
    hemi.intensity = light ? 0.9 : 0.45
    hemi.groundColor.set(light ? '#b8bec8' : '#283040')
    sun.intensity = light ? 2.0 : 1.1
    ringLight.intensity = light ? 2.5 : 6
    screenLight.intensity = light ? 0.8 : 2.4
    scene.environmentIntensity = light ? 0.75 : 0.4
    aoMat.opacity = 1
  }

  let alertIx = 0
  const animate = (s: number, t: number, reduced: boolean) => {
    // the chair would stand between the camera and the desk in the close-ups
    const show = 1 - Math.min(1, Math.max(0, (s - 0.2) / 0.45))
    chairMats.forEach((c) => {
      c.opacity = show
      c.depthWrite = show > 0.98
    })
    chair.visible = show > 0.01
    chair.traverse((o) => (o.castShadow = show > 0.5))
    ;(chairAo.material as THREE.MeshBasicMaterial).opacity = 0.8 * show
    // an alert drops onto the monitor while the alerts beat shows, then the next one
    const wA = weight(s, 1)
    const cycle = reduced ? 0 : t / 4.2
    const ix = Math.floor(cycle) % ALERTS.length
    if (ix !== alertIx) {
      alertIx = ix
      alertMat.map = alertTexes[ix] ?? null
      alertMat.needsUpdate = true
    }
    const ph = reduced ? 0.5 : cycle - Math.floor(cycle)
    const inOut = Math.min(1, ph / 0.12) * Math.min(1, (1 - ph) / 0.1)
    const k = easeOut(Math.min(1, Math.max(0, wA * 1.6 - 0.2))) * easeOut(inOut)
    alertPlane.position.y = mix(0.62, 0.32, k)
    alertMat.opacity = k
    alertPlane.visible = k > 0.01
    // chat keeps flowing on the portrait screen
    chatTex.offset.y = reduced ? 0.4 : 0.4 - ((t * 0.03) % 0.4)
    // the tip lands: a badge rises from the phone
    const m = easeOut(Math.min(1, Math.max(0, weight(s, 3) * 1.5 - 0.3)))
    badge.position.y = mix(0.5, 0.86, m)
    badgeMat.opacity = m
    badge.visible = m > 0.01
  }

  return { scene, setTheme, animate, sun }
}

// Camera beats: [view direction, target, width to fit, height to fit]
const CAM = (
  [
    [[1, 0.82, 1], [-0.1, 1.5, -1.2], 10.4, 9.4],
    [[0.35, 0.3, 1], [0.1, 2.75, -3.25], 3.7, 2.7],
    [[0.75, 0.3, 1], [-2.0, 2.8, -3.0], 2.5, 2.7],
    [[0.2, 0.55, 1], [2.12, 2.18, -2.5], 2.3, 2.5],
  ] as const
).map(([d, t, w, h]) => ({
  dir: new THREE.Vector3(...d).normalize(),
  at: new THREE.Vector3(...t),
  w,
  h,
}))

export const desk: Build = (el, mobile, renderer) => {
  shared ??= buildWorld(renderer, mobile)
  const world = shared
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200)
  const pos = follower(3.5)
  let target = 0
  const dir = new THREE.Vector3(),
    at = new THREE.Vector3()
  return {
    scene: world.scene,
    camera,
    prepare(r) {
      r.toneMapping = THREE.ACESFilmicToneMapping
      r.toneMappingExposure = 1
    },
    progress(reduced) {
      target = storyTarget(el, reduced)
      return target
    },
    settled: () => pos.settled(target),
    update({ t, dt, w, h, reduced }) {
      const raw = pos.step(target, dt, reduced)
      const s = plateau(Math.min(3, Math.max(0, raw)), 0.22)
      const i = Math.min(2, Math.floor(s)),
        f = s - i
      const a = CAM[i]!,
        b = CAM[i + 1]!
      // pull back a little mid-flight so the move reads as travelling through the room
      const arc = Math.sin(f * Math.PI) * 0.3
      dir.copy(a.dir).lerp(b.dir, f).normalize()
      at.copy(a.at).lerp(b.at, f)
      const fw = mix(a.w, b.w, f) * (1 + arc),
        fh = mix(a.h, b.h, f) * (1 + arc)
      const aspect = w / h
      const viewH = Math.max(fh, fw / aspect)
      camera.left = (-viewH * aspect) / 2
      camera.right = (viewH * aspect) / 2
      camera.top = viewH / 2
      camera.bottom = -viewH / 2
      camera.position.copy(at).addScaledVector(dir, 30)
      camera.lookAt(at)
      camera.updateProjectionMatrix()
      world.animate(s, t, reduced)
    },
    setTheme: world.setTheme,
    dispose() {},
  }
}
