import type * as THREE from 'three'

export interface Frame {
  /** Scroll position for this station (its own meaning per station). */
  p: number
  /** Animation clock in seconds; frozen while paused and under reduced motion. */
  t: number
  /** Real frame time in seconds (camera easing keeps working while paused). */
  dt: number
  w: number
  h: number
  dpr: number
  px: number
  py: number
  reduced: boolean
}
export interface Station {
  scene: THREE.Scene
  camera: THREE.Camera
  update(f: Frame): void
  setTheme(light: boolean): void
  /** Renderer state this scene needs (tone mapping, exposure). */
  prepare?(r: THREE.WebGLRenderer): void
  /** Custom scroll position (read before any drawing in a frame). */
  progress?(reduced: boolean): number
  /** False while the camera is still easing toward its target. */
  settled?(): boolean
  dispose(): void
}
export type Build = (el: HTMLElement, mobile: boolean, renderer: THREE.WebGLRenderer) => Station
