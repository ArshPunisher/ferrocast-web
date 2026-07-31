// The 3D stations. Each one is a scene drawn only inside its own box (never behind text):
// the hero braid, the story stages (desk, deck, glass) and the app icon on the download page.
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { SPARK } from '@ferrocast/ui/brand'
import { createBraid } from './braid'
import { PAL, PLATFORMS, placeChip, fitDistance, smooth, mix } from './kit'
import { desk } from './desk'
import { deck } from './deck'
import { glass } from './glass'
import type { Build } from './types'

const cam = () => new THREE.PerspectiveCamera(35, 1, 0.1, 100)
const chip = (el: HTMLElement, name: string) =>
  el.querySelector<HTMLElement>(`[data-chip="${name}"]`)
function disposeAll(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}

/* ------------------------------------------------------------------ hero: the braid */
const hero: Build = (el, mobile) => {
  const scene = new THREE.Scene(),
    camera = cam()
  const braid = createBraid(mobile)
  scene.add(braid.group)
  const L = braid.layout
  const chips = PLATFORMS.map((n) => chip(el, n))
  const home = chip(el, 'home')
  const at = new THREE.Vector3()
  let light = false
  return {
    scene,
    camera,
    // the camera travels as the hero section scrolls away
    progress() {
      const sec = el.closest<HTMLElement>('[data-hero]')
      return sec ? Math.min(1, Math.max(0, scrollY / Math.max(1, sec.offsetHeight))) : 0
    },
    update({ p, t, w, h, dpr, reduced }) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (reduced) p = 0
      braid.uniforms.uRes.value.set(w, h)
      braid.uniforms.uDpr.value = dpr
      braid.uniforms.uTime.value = t
      braid.uniforms.uAlpha.value = light ? 0.78 : 0.66
      braid.setTheme(light ? 1 : 0)
      const ww = L.start - L.end + 3.4,
        wh = L.Y[0] - L.Y[2] + 2.6
      const D = fitDistance(ww, wh, w / h)
      const cx = (L.start + L.end) / 2
      // scrolling travels the camera down the channel toward the Spark
      const q = smooth(0, 1, p)
      camera.position.set(mix(cx, L.end + 2.2, q * 0.55), 0, D * (1 - q * 0.3))
      camera.lookAt(mix(cx, L.end + 1.6, q * 0.55), 0, 0)
      braid.group.updateMatrixWorld()
      chips.forEach((c, i) => placeChip(c, braid.center(L.badge, i, t, at), camera, w, h))
      placeChip(home, braid.center(L.end, 0, t, at), camera, w, h)
    },
    setTheme(l) {
      light = l
    },
    dispose() {
      braid.dispose()
    },
  }
}

/* ------------------------------------------------------------------ download: the app icon */
const icon: Build = () => {
  const scene = new THREE.Scene(),
    camera = cam()
  const tile = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.15 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.6, 0.5, 6, 0.5), bodyMat)
  tile.add(body)
  const inkMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 })
  const moltenMat = new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.2,
    emissiveIntensity: 0.35,
  })
  const arcMat = new THREE.MeshStandardMaterial({
    roughness: 0.3,
    metalness: 0.2,
    emissiveIntensity: 0.35,
  })
  const svg = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${SPARK.f}"/><path d="${SPARK.boltTop}"/><path d="${SPARK.boltBottom}"/></svg>`,
  )
  const mats = [inkMat, moltenMat, arcMat]
  const mark = new THREE.Group()
  svg.paths.forEach((path, i) => {
    for (const shape of SVGLoader.createShapes(path)) {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: 4,
        bevelEnabled: true,
        bevelThickness: 0.6,
        bevelSize: 0.4,
        bevelSegments: 2,
        curveSegments: 10,
      })
      mark.add(new THREE.Mesh(g, mats[i] ?? inkMat))
    }
  })
  const k = 1.9 / 64
  mark.scale.set(k, -k, k)
  mark.position.set(-32 * k, 32 * k, 0.24)
  tile.add(mark)
  scene.add(tile)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.1)
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(3, 4, 6)
  const rim = new THREE.PointLight(0x33d4ff, 18, 12)
  rim.position.set(-3, -2, 2)
  scene.add(hemi, key, rim)
  const sp = { x: 0, y: 0 }
  return {
    scene,
    camera,
    update({ p, t, w, h, px, py }) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      const D = fitDistance(4.2, 4.2, w / h)
      camera.position.set(0, 0, D)
      camera.lookAt(0, 0, 0)
      sp.x += (px - sp.x) * 0.08
      sp.y += (py - sp.y) * 0.08
      tile.rotation.y = -0.42 + Math.sin(t * 0.5) * 0.12 + sp.x * 0.35 + (p - 0.5) * 0.5
      tile.rotation.x = 0.16 + Math.sin(t * 0.37) * 0.05 - sp.y * 0.22
      tile.position.y = Math.sin(t * 0.8) * 0.06
    },
    setTheme(light) {
      const c = PAL[light ? 'light' : 'dark']
      bodyMat.color.set(light ? '#ffffff' : '#1a1e24')
      inkMat.color.set(c.ink)
      moltenMat.color.set(c.molten)
      moltenMat.emissive.set(c.molten)
      arcMat.color.set(c.arc)
      arcMat.emissive.set(c.arc)
      hemi.intensity = light ? 1.5 : 1.1
      rim.color.set(c.arc)
    },
    dispose() {
      disposeAll(scene)
    },
  }
}

export const STATIONS: Record<string, Build> = { hero, icon, desk, deck, glass }
