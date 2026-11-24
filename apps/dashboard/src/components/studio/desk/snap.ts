// The maths behind snapping with guide lines, spacing, aligning, spacing out and moving or
// sizing a group of picked sources in the preview. All of it is canvas pixels and plain data:
// the page turns pointer positions into them (`stage-edit.ts`) and draws what comes out.
//
// A box is a `Frame`: first corner and the two sides as vectors, so a turned box is no special
// case. What snaps and lines up is a box's bounds on the canvas (`rectOf`), as OBS does.

import { at, boxOf, type Box, type Frame, type Pt } from './stage-edit'

/** A box's bounds on the canvas. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** The sources' bounds, moved by `d`: turned boxes included. */
export function rectOf(f: Frame, d: Pt = { x: 0, y: 0 }): Rect {
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

/**
 * Whether a source has a picture to place: a source whose size isn't known yet (a camera still
 * opening, an empty group) has a frame of zeros, and the engine refuses a box under 1 pixel, so
 * sending it would fail the whole batch for the others.
 */
export function hasSize(f: Frame | undefined): f is Frame {
  return !!f && Math.hypot(f[0], f[1]) >= 1 && Math.hypot(f[2], f[3]) >= 1
}

/**
 * The picked sources that can be moved, sized or lined up: those with a size, and a source of a
 * group only when the group is not picked too (it moves with its group, and the engine refuses
 * both in one batch). `items` are the scene's top-level items, each with its `children`.
 */
export function pickedBoxes<T extends ItemLike>(items: T[], ids: number[]): T[] {
  const picked = new Set(ids)
  const out: T[] = []
  for (const i of items) {
    if (picked.has(i.id)) {
      if (hasSize(i.frame)) out.push(i)
    } else {
      for (const c of i.children as T[]) if (picked.has(c.id) && hasSize(c.frame)) out.push(c)
    }
  }
  return out
}

/** The bounds that hold every one of `rects`; null for none. */
export function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  }
}

/**
 * The frame of box `b` (first corner and side lengths), turned the way `f` is. A box with no
 * side to take a direction from stays upright.
 */
export function frameOfBox(f: Frame, b: Box): Frame {
  const lu = Math.hypot(f[0], f[1])
  const lv = Math.hypot(f[2], f[3])
  const [ux, uy] = lu > 1e-9 ? [f[0] / lu, f[1] / lu] : [1, 0]
  const [vx, vy] = lv > 1e-9 ? [f[2] / lv, f[3] / lv] : [0, 1]
  return [ux * b.w, uy * b.w, vx * b.h, vy * b.h, b.x, b.y]
}

/** How near a snap reaches on the canvas: `px` screen pixels at this scale (canvas to screen). */
export function snapReach(px: number, scale: number): number {
  return px > 0 && scale > 0 ? px / scale : 0
}

/** A source as the editor knows it: only what the maths needs. */
export interface ItemLike {
  id: number
  visible: boolean
  locked: boolean
  frame?: Frame | undefined
  children: ItemLike[]
}

/**
 * The boxes a moving one can line up with: every visible source with a frame (a group and the
 * sources inside it), not the moving ones, not the group a moving source is in (its edges go
 * with it), and not the sources of a moving group. A locked source stays: it's where things
 * line up to, though it never moves itself.
 */
export function snapTargets(items: ItemLike[], moving: number[]): Frame[] {
  const out: Frame[] = []
  const skip = new Set(moving)
  for (const it of items) {
    // A moving source's own group is no target (its edges go with it); its other sources are.
    const holdsMoving = it.children.some((c) => skip.has(c.id))
    if (it.visible && hasSize(it.frame) && !skip.has(it.id) && !holdsMoving) out.push(it.frame)
    // A moving group takes its sources along: none of them is a target. A hidden group hides
    // what is in it, so there is nothing to line up to.
    if (skip.has(it.id) || !it.visible) continue
    for (const c of it.children)
      if (c.visible && hasSize(c.frame) && !skip.has(c.id)) out.push(c.frame)
  }
  return out
}

/** A guide line to draw: a line across (`x`: at an x, running down) or down (`y`), from
 * `from` to `to` on the other axis. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
  kind: 'canvas' | 'centre' | 'item'
}

export interface GuideOpts {
  /** The canvas's edges. */
  screen: boolean
  /** The canvas's middle lines. */
  centre: boolean
  /** Other sources' edges and middles. */
  others: boolean
}

/** Lined up to this near (canvas pixels) counts as lined up. */
const SAME = 0.5

/**
 * The guide lines a box at `r` lines up with: its edges or middle on the canvas's edges or middle
 * line, or on another source's edge or middle, to within half a pixel (the box has been snapped
 * by then). A line joining two boxes runs from one to the other.
 */
export function guidesFor(
  r: Rect,
  targets: Frame[],
  canvas: { width: number; height: number },
  o: GuideOpts,
): Guide[] {
  const out: Guide[] = []
  // The same line met twice (two boxes on one edge, a source on the canvas's edge or middle) is
  // one line, long enough to reach both; the canvas's own line is what it is called then.
  const rank = { canvas: 0, centre: 1, item: 2 } as const
  const add = (g: Guide) => {
    const same = out.find((x) => x.axis === g.axis && Math.abs(x.at - g.at) <= SAME)
    if (!same) return void out.push(g)
    same.from = Math.min(same.from, g.from)
    same.to = Math.max(same.to, g.to)
    if (rank[g.kind] < rank[same.kind]) {
      same.kind = g.kind
      same.at = g.at
    }
  }
  const mine = {
    x: [r.left, (r.left + r.right) / 2, r.right],
    y: [r.top, (r.top + r.bottom) / 2, r.bottom],
  }
  const across = (axis: 'x' | 'y', line: number, from: number, to: number, kind: Guide['kind']) => {
    if (mine[axis].some((v) => Math.abs(v - line) <= SAME)) {
      const lo = axis === 'x' ? r.top : r.left
      const hi = axis === 'x' ? r.bottom : r.right
      add({ axis, at: line, from: Math.min(from, lo), to: Math.max(to, hi), kind })
    }
  }
  const { width: W, height: H } = canvas
  if (o.screen) {
    across('x', 0, 0, H, 'canvas')
    across('x', W, 0, H, 'canvas')
    across('y', 0, 0, W, 'canvas')
    across('y', H, 0, W, 'canvas')
  }
  if (o.centre) {
    across('x', W / 2, 0, H, 'centre')
    across('y', H / 2, 0, W, 'centre')
  }
  if (o.others) {
    for (const t of targets) {
      const b = rectOf(t)
      for (const line of [b.left, (b.left + b.right) / 2, b.right])
        across('x', line, b.top, b.bottom, 'item')
      for (const line of [b.top, (b.top + b.bottom) / 2, b.bottom])
        across('y', line, b.left, b.right, 'item')
    }
  }
  return out
}

/** The empty space between a box and its nearest neighbour on a side, to say in pixels. */
export interface Gap {
  axis: 'x' | 'y'
  /** Where it runs along its axis, from the box's edge to the neighbour's. */
  from: number
  to: number
  /** Where across: the middle of what the two share. */
  at: number
  px: number
}

/**
 * The gap from `r` to the nearest box on each side that it overlaps across (left and right
 * among those level with it, above and below among those over or under it). A box it
 * overlaps, or one with nothing level with it, gives none.
 */
export function gapsFor(r: Rect, targets: Frame[]): Gap[] {
  const rects = targets.map((t) => rectOf(t))
  const out: Gap[] = []
  const level = (t: Rect) => t.top < r.bottom && t.bottom > r.top
  const over = (t: Rect) => t.left < r.right && t.right > r.left
  const mid = (a0: number, a1: number, b0: number, b1: number) =>
    (Math.max(a0, b0) + Math.min(a1, b1)) / 2
  const left = rects
    .filter((t) => level(t) && t.right <= r.left)
    .sort((a, b) => b.right - a.right)[0]
  if (left)
    out.push({
      axis: 'x',
      from: left.right,
      to: r.left,
      at: mid(r.top, r.bottom, left.top, left.bottom),
      px: r.left - left.right,
    })
  const right = rects
    .filter((t) => level(t) && t.left >= r.right)
    .sort((a, b) => a.left - b.left)[0]
  if (right)
    out.push({
      axis: 'x',
      from: r.right,
      to: right.left,
      at: mid(r.top, r.bottom, right.top, right.bottom),
      px: right.left - r.right,
    })
  const above = rects
    .filter((t) => over(t) && t.bottom <= r.top)
    .sort((a, b) => b.bottom - a.bottom)[0]
  if (above)
    out.push({
      axis: 'y',
      from: above.bottom,
      to: r.top,
      at: mid(r.left, r.right, above.left, above.right),
      px: r.top - above.bottom,
    })
  const below = rects.filter((t) => over(t) && t.top >= r.bottom).sort((a, b) => a.top - b.top)[0]
  if (below)
    out.push({
      axis: 'y',
      from: r.bottom,
      to: below.top,
      at: mid(r.left, r.right, below.left, below.right),
      px: below.top - r.bottom,
    })
  // Boxes that touch have no gap to say (a '0' label sits on the snap line).
  return out.filter((g) => g.px >= 0.5)
}

/** A source the toolbar and the menu can arrange. */
export interface Arrangeable {
  id: number
  frame: Frame
  locked: boolean
}

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'

/** How far each source moves. */
export interface Delta {
  id: number
  dx: number
  dy: number
}

/**
 * How far to move each source to line up with the selection's bounds (the bounds of them all,
 * a locked one's included: it's part of the selection, it just doesn't move). One source has
 * nothing to line up with. Every source that can move is listed, even one that stays.
 */
export function alignDeltas(items: Arrangeable[], how: Align): Delta[] {
  if (items.length < 2) return []
  const sel = union(items.map((i) => rectOf(i.frame)))
  if (!sel) return []
  const out: Delta[] = []
  for (const it of items) {
    if (it.locked) continue
    const r = rectOf(it.frame)
    let dx = 0
    let dy = 0
    if (how === 'left') dx = sel.left - r.left
    else if (how === 'right') dx = sel.right - r.right
    else if (how === 'centre') dx = (sel.left + sel.right) / 2 - (r.left + r.right) / 2
    else if (how === 'top') dy = sel.top - r.top
    else if (how === 'bottom') dy = sel.bottom - r.bottom
    else dy = (sel.top + sel.bottom) / 2 - (r.top + r.bottom) / 2
    out.push({ id: it.id, dx: dx + 0, dy: dy + 0 })
  }
  return out
}

/**
 * How far to move the ones between the first and the last (by their middles) so the gaps
 * between neighbours are all the same, the first and the last staying where they are. Only
 * what moves is listed; a locked one stays; fewer than three has nothing between.
 */
export function distributeDeltas(items: Arrangeable[], axis: 'x' | 'y'): Delta[] {
  if (items.length < 3) return []
  const side = (i: Arrangeable) => {
    const r = rectOf(i.frame)
    return axis === 'x' ? { lo: r.left, hi: r.right } : { lo: r.top, hi: r.bottom }
  }
  const sorted = [...items].sort((a, b) => side(a).lo + side(a).hi - (side(b).lo + side(b).hi))
  // The first and the last stay, and so does any locked one: each is a fixed end of the stretch
  // of movable ones between it and the next, and a stretch is spaced evenly by itself.
  const fixed = (i: number) => i === 0 || i === sorted.length - 1 || sorted[i]!.locked
  const out: Delta[] = []
  let from = 0
  for (let i = 1; i < sorted.length; i++) {
    if (!fixed(i)) continue
    const run = sorted.slice(from + 1, i)
    if (run.length > 0) {
      const a = side(sorted[from]!)
      const b = side(sorted[i]!)
      const total = run.reduce((n, it) => n + (side(it).hi - side(it).lo), 0)
      const gap = (b.lo - a.hi - total) / (run.length + 1)
      let cursor = a.hi + gap
      for (const it of run) {
        const s = side(it)
        const move = cursor - s.lo
        if (Math.abs(move) > 1e-9) {
          out.push(axis === 'x' ? { id: it.id, dx: move, dy: 0 } : { id: it.id, dx: 0, dy: move })
        }
        cursor += s.hi - s.lo + gap
      }
    }
    from = i
  }
  return out
}

/** A box for an item, as the batch endpoint takes it. */
export interface BoxFor extends Box {
  id: number
}

/** The boxes after each source moves by its delta. */
export function moved(items: Arrangeable[], deltas: Delta[]): BoxFor[] {
  const out: BoxFor[] = []
  for (const d of deltas) {
    const it = items.find((i) => i.id === d.id)
    if (!it) continue
    const b = boxOf(it.frame)
    out.push({ id: d.id, x: b.x + d.dx, y: b.y + d.dy, w: b.w, h: b.h })
  }
  return out
}

/** The smallest side a source keeps when sized with a group, canvas pixels. */
const LEAST = 4

/**
 * The boxes after the bounds `from` of a group of picked sources become `to`: each source's
 * middle goes where the same place in the group goes, and its sides change by the scale along
 * their own directions (so a turned source stays turned). A locked source is left out.
 */
export function scaleGroup(items: Arrangeable[], from: Rect, to: Rect): BoxFor[] {
  const fw = from.right - from.left
  const fh = from.bottom - from.top
  // Never negative: a box dragged inside out is as small as it can be, not a mirror image.
  const sx = fw > 1e-9 ? Math.max(0, (to.right - to.left) / fw) : 1
  const sy = fh > 1e-9 ? Math.max(0, (to.bottom - to.top) / fh) : 1
  const out: BoxFor[] = []
  for (const it of items) {
    if (it.locked) continue
    const f = it.frame
    const lu = Math.hypot(f[0], f[1])
    const lv = Math.hypot(f[2], f[3])
    const [ux, uy] = lu > 1e-9 ? [f[0] / lu, f[1] / lu] : [1, 0]
    const [vx, vy] = lv > 1e-9 ? [f[2] / lv, f[3] / lv] : [0, 1]
    const c = at(f, 0.5, 0.5)
    const nc = { x: to.left + (c.x - from.left) * sx, y: to.top + (c.y - from.top) * sy }
    // A source turned part of the way can't be sheared, so sizing the group one way would grow it
    // past the new box on the other: it grows evenly, by the smaller of the two. Upright and
    // quarter-turned sources scale each way as asked.
    const along = (a: number, b: number) => Math.abs(a) < 1e-6 || Math.abs(b) < 1e-6
    const partTurn = !(along(uy, vx) || along(ux, vy))
    const [kx, ky] = partTurn ? [Math.min(sx, sy), Math.min(sx, sy)] : [sx, sy]
    const w = Math.max(LEAST, lu * Math.hypot(ux * kx, uy * ky))
    const h = Math.max(LEAST, lv * Math.hypot(vx * kx, vy * ky))
    // The first corner: back from the middle by half of each side.
    out.push({
      id: it.id,
      x: nc.x - (ux * w + vx * h) / 2,
      y: nc.y - (uy * w + vy * h) / 2,
      w,
      h,
    })
  }
  return out
}

/** Whether the rectangle `r` touches the (possibly turned) frame `f`, edges included. */
function touchesFrame(r: Rect, f: Frame): boolean {
  const upright = Math.abs(f[1]) < 1e-9 && Math.abs(f[2]) < 1e-9
  if (upright) return true // its bounds are the source
  const pts = [at(f, 0, 0), at(f, 1, 0), at(f, 1, 1), at(f, 0, 1)]
  // Separating axis test: the rectangle's two axes, and the frame's two.
  const rp = [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.right, y: r.bottom },
    { x: r.left, y: r.bottom },
  ]
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: f[0], y: f[1] },
    { x: f[2], y: f[3] },
  ]
  for (const a of axes) {
    const proj = (ps: Pt[]) => ps.map((p) => p.x * a.x + p.y * a.y)
    const [pa, ra] = [proj(pts), proj(rp)]
    if (Math.max(...pa) < Math.min(...ra) - 1e-9 || Math.max(...ra) < Math.min(...pa) - 1e-9)
      return false
  }
  return true
}

/** The ids of the sources a dragged box touches: visible ones only, a group as one. */
export function marqueeHits(items: ItemLike[], rect: Rect): number[] {
  const r: Rect = {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    top: Math.min(rect.top, rect.bottom),
    bottom: Math.max(rect.top, rect.bottom),
  }
  const hits: number[] = []
  for (const it of items) {
    if (!it.visible || !it.frame) continue
    const b = rectOf(it.frame)
    // The bounds first (cheap, and all of it for an upright source); then, for a turned one,
    // the source itself: a marquee in the corner of a diamond's bounds doesn't touch it.
    if (!(b.left <= r.right && b.right >= r.left && b.top <= r.bottom && b.bottom >= r.top))
      continue
    if (touchesFrame(r, it.frame)) hits.push(it.id)
  }
  return hits
}

/** The picks after a marquee: it replaces them, adds to them (Shift) or toggles (⌘ or Ctrl). */
export function pickWith(
  current: number[],
  hits: number[],
  how: 'replace' | 'add' | 'toggle',
): number[] {
  if (how === 'replace') return [...hits]
  if (how === 'add') return [...current, ...hits.filter((h) => !current.includes(h))]
  return [...current.filter((c) => !hits.includes(c)), ...hits.filter((h) => !current.includes(h))]
}

/**
 * The boxes that put every source of a drag back where it was picked up: Escape, a second
 * finger starting a pinch. A group handle drag restores the group's sources; a drag of several
 * the held one and the others.
 */
export function revertBoxes(h: {
  id: number
  from: Frame
  others: { id: number; from: Frame }[]
  group?: { items: { id: number; frame: Frame }[] } | undefined
}): BoxFor[] {
  const boxFor = (id: number, f: Frame): BoxFor => ({ id, ...boxOf(f) })
  if (h.group) return h.group.items.map((i) => boxFor(i.id, i.frame))
  return [boxFor(h.id, h.from), ...h.others.map((o) => boxFor(o.id, o.from))]
}

/**
 * The sources named in requests still waiting to be sent, single or batch: an answer to an
 * earlier request must not overwrite where these are now (the screen already shows them moved).
 */
export function queuedIds(
  next: Map<unknown, { id?: number | undefined; boxes?: { id: number }[] | undefined }>,
): Set<number> {
  const out = new Set<number>()
  for (const j of next.values()) {
    if (j.id !== undefined) out.add(j.id)
    for (const b of j.boxes ?? []) out.add(b.id)
  }
  return out
}

/**
 * The picked sources the box round them is made of, and that box: those that are shown, have a
 * size, can move and aren't inside a picked group; two or more make a group. Drawing the box and
 * grabbing its handles both use this, so they never differ.
 */
export function pickedGroup<T extends ItemLike>(
  items: T[],
  ids: number[],
): { members: T[]; rect: Rect | null } {
  const members = pickedBoxes(items, ids).filter((i) => i.visible && !i.locked && hasSize(i.frame))
  const rect = members.length >= 2 ? union(members.map((i) => rectOf(i.frame as Frame))) : null
  return { members, rect }
}

/** The crop or transform an Alt-drag started with, to put back when cancelled (null: none read yet). */
export function revertCrop<T>(crop: { from: T } | null | 'reading'): T | null {
  return crop && crop !== 'reading' ? crop.from : null
}

/**
 * Puts a request in the queue. A newer request for the same key replaces the older and keeps its
 * save; but it goes to the end when a request made after the older one is for some of the same
 * sources, so those go out in the order they were made (A+B, A, A+B must end with A+B's newest).
 */
export function enqueueJob<
  J extends { save: boolean; id?: number | undefined; boxes?: { id: number }[] | undefined },
>(next: Map<string, J>, key: string, job: J): void {
  const prev = next.get(key)
  const merged = { ...job, save: job.save || !!prev?.save }
  if (prev) {
    const mine = new Set<number>(
      job.boxes ? job.boxes.map((b) => b.id) : job.id !== undefined ? [job.id] : [],
    )
    let later = false
    let overlaps = false
    for (const [k, j] of next) {
      if (k === key) {
        later = true
        continue
      }
      const ids = j.boxes ? j.boxes.map((b) => b.id) : j.id !== undefined ? [j.id] : []
      if (later && ids.some((id) => mine.has(id))) overlaps = true
    }
    if (overlaps) next.delete(key)
  }
  next.set(key, merged)
}
