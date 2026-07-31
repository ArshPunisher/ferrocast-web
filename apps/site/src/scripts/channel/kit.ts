// Shared pieces for the stations: the palette, DOM chip placement and camera fitting.
import * as THREE from 'three'

export interface Pal {
  ink: string
  molten: string
  arc: string
}
export const PAL: Record<'dark' | 'light', Pal> = {
  dark: { ink: '#eef0f4', molten: '#ffa424', arc: '#33d4ff' },
  light: { ink: '#0e1014', molten: '#cf7400', arc: '#0888b8' },
}
export const PLATFORMS = ['twitch', 'youtube', 'kick'] as const

const pv = new THREE.Vector3()
// chip sizes, measured once per station width (no layout reads in the frame loop)
const sizes = new WeakMap<HTMLElement, { w: number; hw: number; hh: number }>()
/**
 * Place an HTML chip over a world point, in the station's own pixel space. A chip that would
 * not fit fully inside the box is hidden rather than cut off at the edge.
 */
export function placeChip(
  el: HTMLElement | null,
  p: THREE.Vector3,
  camera: THREE.Camera,
  w: number,
  h: number,
  vis = 1,
) {
  if (!el) return
  pv.copy(p).project(camera)
  const x = ((pv.x + 1) / 2) * w,
    y = ((1 - pv.y) / 2) * h
  let m = sizes.get(el)
  if (!m || m.w !== w) {
    m = { w, hw: el.offsetWidth / 2 + 4, hh: el.offsetHeight / 2 + 4 }
    sizes.set(el, m)
  }
  const { hw, hh } = m
  const inside = x > hw && x < w - hw && y > hh && y < h - hh && pv.z < 1
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
  el.style.opacity = inside ? String(vis) : '0'
}

/** Camera distance so a box of world size (ww x wh) fits a viewport with aspect a. */
export function fitDistance(ww: number, wh: number, aspect: number, fov = 35) {
  const k = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))
  return Math.max(ww / (k * aspect), wh / k)
}

export { smooth, mix } from './story'
