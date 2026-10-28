// Picking, moving and resizing sources in the preview, as OBS's own preview does. All of it
// is canvas pixels: the page turns pointer positions into them, the engine draws the outline.

export type Frame = [number, number, number, number, number, number]

export interface Pt {
  x: number
  y: number
}

/** A handle: where on the box (0, 0.5 or 1 across and down), or the whole box to move it. */
export interface Grip {
  u: number
  v: number
}

export const MOVE: Grip = { u: -1, v: -1 }

/** The eight handles, corners first (they win where they overlap a side's). */
export const GRIPS: Grip[] = [
  { u: 0, v: 0 },
  { u: 1, v: 0 },
  { u: 1, v: 1 },
  { u: 0, v: 1 },
  { u: 0.5, v: 0 },
  { u: 1, v: 0.5 },
  { u: 0.5, v: 1 },
  { u: 0, v: 0.5 },
]

/** The point (u, v) of a box (each 0 to 1). */
export function at(f: Frame, u: number, v: number): Pt {
  return { x: f[4] + u * f[0] + v * f[2], y: f[5] + u * f[1] + v * f[3] }
}

/** Where `p` is in the box, as (u, v); null when the box has no area. */
export function local(f: Frame, p: Pt): Grip | null {
  const det = f[0] * f[3] - f[2] * f[1]
  if (Math.abs(det) < 1e-9) return null
  const dx = p.x - f[4]
  const dy = p.y - f[5]
  return { u: (dx * f[3] - dy * f[2]) / det, v: (dy * f[0] - dx * f[1]) / det }
}

export function inside(f: Frame, p: Pt): boolean {
  const l = local(f, p)
  return !!l && l.u >= 0 && l.u <= 1 && l.v >= 0 && l.v <= 1
}

/** The handle of `f` within `reach` canvas pixels of `p`, else MOVE inside it, else null. */
export function gripAt(f: Frame, p: Pt, reach: number): Grip | null {
  for (const g of GRIPS) {
    const h = at(f, g.u, g.v)
    if (Math.hypot(h.x - p.x, h.y - p.y) <= reach) return g
  }
  return inside(f, p) ? MOVE : null
}

/** The CSS cursor for a handle, turned with the box. */
export function cursorFor(f: Frame, g: Grip): string {
  if (g.u < 0) return 'move'
  const c = at(f, 0.5, 0.5)
  const h = at(f, g.u, g.v)
  // Screen y grows down; the angle from the box's middle to the handle picks the arrows.
  const deg = ((Math.atan2(h.y - c.y, h.x - c.x) * 180) / Math.PI + 360) % 180
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize'
  if (deg < 67.5) return 'nwse-resize'
  if (deg < 112.5) return 'ns-resize'
  return 'nesw-resize'
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const len = (x: number, y: number) => Math.hypot(x, y)

/** The box as the engine takes it: first corner and side lengths. */
export function boxOf(f: Frame): Box {
  return { x: f[4], y: f[5], w: len(f[0], f[1]), h: len(f[2], f[3]) }
}

/** What a moved box snaps to (OBS's Snapping settings). */
export interface SnapTo {
  /** The canvas's edges. */
  screen: boolean
  /** The canvas's middle lines. */
  center: boolean
  /** Other sources' edges. */
  others: Frame[]
}

export interface DragOpts {
  /** Corner handles keep the shape unless this is set (Shift held). */
  free?: boolean
  /** Every handle keeps the shape, the sides' too, and Shift doesn't free it (the frame
   * lock in the preview's bar). */
  keep?: boolean
  canvas: { width: number; height: number }
  /** How near snaps, canvas pixels (0 for none). */
  snap: number
  /** The canvas's edges and middle when not given. */
  to?: SnapTo
}

/**
 * Where the box goes after the pointer moved by `d` (canvas pixels) from where the drag
 * started, holding `g`. Sides never get smaller than 4 pixels.
 */
export function drag(f: Frame, g: Grip, d: Pt, o: DragOpts): Box {
  const lu = len(f[0], f[1])
  const lv = len(f[2], f[3])
  if (g.u < 0 || lu === 0 || lv === 0) {
    const moved = { x: f[4] + d.x, y: f[5] + d.y }
    const s = snapMove(f, d, o)
    return { x: moved.x + s.x, y: moved.y + s.y, w: lu, h: lv }
  }
  const ux = f[0] / lu
  const uy = f[1] / lu
  const vx = f[2] / lv
  const vy = f[3] / lv
  const du = d.x * ux + d.y * uy
  const dv = d.x * vx + d.y * vy
  let nu = g.u === 1 ? lu + du : g.u === 0 ? lu - du : lu
  let nv = g.v === 1 ? lv + dv : g.v === 0 ? lv - dv : lv
  const corner = g.u !== 0.5 && g.v !== 0.5
  const shaped = o.keep || (corner && !o.free)
  if (shaped) {
    // The side that moved more (for its length) sets the size; the other keeps the shape.
    // A side handle moves one side only: that one sets it.
    const su = nu / lu
    const sv = nv / lv
    const s = g.v === 0.5 ? su : g.u === 0.5 ? sv : Math.abs(su - 1) >= Math.abs(sv - 1) ? su : sv
    nu = lu * s
    nv = lv * s
  }
  const MIN = 4
  if (shaped && (nu < MIN || nv < MIN)) {
    const s = Math.max(MIN / lu, MIN / lv)
    nu = Math.max(nu, lu * s)
    nv = Math.max(nv, lv * s)
  }
  nu = Math.max(MIN, nu)
  nv = Math.max(MIN, nv)
  // Handles on the first corner's sides move that corner; the far sides stay put.
  let x = f[4]
  let y = f[5]
  if (g.u === 0) {
    x += ux * (lu - nu)
    y += uy * (lu - nu)
  }
  if (g.v === 0) {
    x += vx * (lv - nv)
    y += vy * (lv - nv)
  }
  // A side handle that keeps the shape grows the other way from the middle, so the box
  // stays centred on the line it was pulled along.
  if (shaped && g.u === 0.5) {
    x += (ux * (lu - nu)) / 2
    y += (uy * (lu - nu)) / 2
  }
  if (shaped && g.v === 0.5) {
    x += (vx * (lv - nv)) / 2
    y += (vy * (lv - nv)) / 2
  }
  return { x, y, w: nu, h: nv }
}

/** The box's bounds on the canvas (turned boxes included). */
function bounds(f: Frame, d: Pt = { x: 0, y: 0 }) {
  const pts = [at(f, 0, 0), at(f, 1, 0), at(f, 1, 1), at(f, 0, 1)]
  const xs = pts.map((p) => p.x + d.x)
  const ys = pts.map((p) => p.y + d.y)
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  }
}

/** How far to nudge a moved box so its edge or middle lands on a line it snaps to. */
function snapMove(f: Frame, d: Pt, o: DragOpts): Pt {
  if (o.snap <= 0) return { x: 0, y: 0 }
  const to = o.to ?? { screen: true, center: true, others: [] }
  const { left, right, top, bottom } = bounds(f, d)
  const { width: W, height: H } = o.canvas
  const lx: number[] = []
  const ly: number[] = []
  if (to.screen) {
    lx.push(0, W)
    ly.push(0, H)
  }
  if (to.center) {
    lx.push(W / 2)
    ly.push(H / 2)
  }
  for (const other of to.others) {
    // Edge to edge, both sides: beside it or lined up with it.
    const b = bounds(other)
    lx.push(b.left, b.right)
    ly.push(b.top, b.bottom)
  }
  const best = (vals: number[], lines: number[]) => {
    let out = 0
    let gap = o.snap
    for (const v of vals)
      for (const l of lines) {
        if (Math.abs(l - v) <= gap) {
          gap = Math.abs(l - v)
          out = l - v
        }
      }
    return out
  }
  return {
    x: best([left, right, (left + right) / 2], lx),
    y: best([top, bottom, (top + bottom) / 2], ly),
  }
}

/** The topmost item under `p` (items come top first), skipping hidden ones. */
export function pick<T extends { visible: boolean; frame?: Frame | undefined }>(
  items: T[],
  p: Pt,
): T | null {
  for (const it of items) if (it.visible && it.frame && inside(it.frame, p)) return it
  return null
}

/** The canvas fitted inside the preview box, as the engine draws it (letterboxed). */
export function fit(
  box: { width: number; height: number },
  canvas: { width: number; height: number },
): { scale: number; ox: number; oy: number } {
  const scale = Math.min(box.width / canvas.width, box.height / canvas.height)
  return {
    scale,
    ox: (box.width - canvas.width * scale) / 2,
    oy: (box.height - canvas.height * scale) / 2,
  }
}

/** The "pick one more" modifier: ⌘ on a Mac (where Ctrl-click is a right-click), Ctrl
 * elsewhere, as OBS does. */
export function addsToPick(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return mac ? e.metaKey : e.ctrlKey
}

/** A source's crop (its own pixels from each side) and full size. */
export interface Crop {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The crop after dragging grip `g` by `d` (canvas pixels) with Alt held, as OBS's preview
 * does: the side under the grip moves in or out, the rest of the picture stays put. `size` is
 * the source's own size. At least 2 pixels stay each way.
 */
export function cropDrag(
  f: Frame,
  g: Grip,
  d: Pt,
  from: Crop,
  size: { width: number; height: number },
): Crop {
  const lu = len(f[0], f[1])
  const lv = len(f[2], f[3])
  const seenW = size.width - from.left - from.right
  const seenH = size.height - from.top - from.bottom
  if (g.u < 0 || lu === 0 || lv === 0 || seenW <= 0 || seenH <= 0) return { ...from }
  // Canvas pixels per source pixel along each side.
  const ku = lu / seenW
  const kv = lv / seenH
  const du = (d.x * f[0] + d.y * f[1]) / lu / ku
  const dv = (d.x * f[2] + d.y * f[3]) / lv / kv
  let { left, top, right, bottom } = from
  if (g.u === 0) left = Math.min(Math.max(0, left + du), size.width - right - 2)
  if (g.u === 1) right = Math.min(Math.max(0, right - du), size.width - left - 2)
  if (g.v === 0) top = Math.min(Math.max(0, top + dv), size.height - bottom - 2)
  if (g.v === 1) bottom = Math.min(Math.max(0, bottom - dv), size.height - top - 2)
  return {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(right),
    bottom: Math.round(bottom),
  }
}
