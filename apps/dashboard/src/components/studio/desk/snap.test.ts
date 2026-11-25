import { describe, expect, it } from 'vitest'
import {
  alignDeltas,
  distributeDeltas,
  enqueueJob,
  frameOfBox,
  pickedGroup,
  revertCrop,
  hasSize,
  pickedBoxes,
  queuedIds,
  revertBoxes,
  gapsFor,
  guidesFor,
  marqueeHits,
  pickWith,
  rectOf,
  scaleGroup,
  union,
  type Rect,
  snapReach,
  snapTargets,
  type ItemLike,
} from './snap'
import type { Frame } from './stage-edit'

/** An upright box: first corner and size. */
const box = (x: number, y: number, w: number, h: number): Frame => [w, 0, 0, h, x, y]
/** The same box turned `deg` degrees about its first corner (clockwise on screen). */
const turned = (x: number, y: number, w: number, h: number, deg: number): Frame => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [w * c, w * s, -h * s, h * c, x, y]
}
const item = (id: number, frame: Frame | undefined, more: Partial<ItemLike> = {}): ItemLike => ({
  id,
  visible: true,
  locked: false,
  frame,
  children: [],
  ...more,
})
const canvas = { width: 1920, height: 1080 }
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe('the bounds of a box', () => {
  it('are its own sides when it is upright', () => {
    expect(rectOf(box(10, 20, 100, 50))).toEqual({ left: 10, top: 20, right: 110, bottom: 70 })
  })
  it('follow a turn: a quarter turn swaps the sides, 45 degrees grows them', () => {
    const q = rectOf(turned(100, 100, 100, 50, 90))
    near(q.left, 50)
    near(q.right, 100)
    near(q.top, 100)
    near(q.bottom, 200)
    const d = rectOf(turned(0, 0, 100, 100, 45))
    near(d.right - d.left, 141.4213562373095)
    near(d.bottom - d.top, 141.4213562373095)
  })
  it('can be moved by an offset without making a new frame', () => {
    expect(rectOf(box(0, 0, 10, 10), { x: 5, y: -5 })).toEqual({
      left: 5,
      top: -5,
      right: 15,
      bottom: 5,
    })
  })
  it('of a box with no size are a point, never NaN', () => {
    const p = rectOf(box(30, 40, 0, 0))
    expect(p).toEqual({ left: 30, top: 40, right: 30, bottom: 40 })
  })
  it('can be turned back into a frame that keeps the turn', () => {
    const f = turned(100, 100, 100, 50, 30)
    const g = frameOfBox(f, { x: 10, y: 20, w: 200, h: 100 })
    near(Math.hypot(g[0], g[1]), 200)
    near(Math.hypot(g[2], g[3]), 100)
    near(Math.atan2(g[1], g[0]), (30 * Math.PI) / 180)
    expect([g[4], g[5]]).toEqual([10, 20])
    // A box with no side keeps upright axes (nothing to take a direction from).
    expect(frameOfBox(box(0, 0, 0, 0), { x: 1, y: 2, w: 3, h: 4 })).toEqual([3, 0, 0, 4, 1, 2])
  })
})

describe('the reach of a snap', () => {
  it('is in canvas pixels: the same screen distance reaches further on a scaled-down canvas', () => {
    expect(snapReach(10, 1)).toBe(10)
    expect(snapReach(10, 0.25)).toBe(40)
    expect(snapReach(0, 0.25)).toBe(0)
    expect(snapReach(10, 0)).toBe(0)
  })
})

describe('guide lines', () => {
  const opts = { screen: true, centre: true, others: true }
  it('show the canvas edges and middle a box lines up with', () => {
    const g = guidesFor(rectOf(box(0, 100, 200, 100)), [], canvas, opts)
    expect(g.map((l) => `${l.axis}${l.at}`)).toContain('x0')
    const mid = guidesFor(rectOf(box(860, 440, 200, 200)), [], canvas, opts)
    expect(mid.map((l) => `${l.axis}${l.at}`).sort()).toEqual(['x960', 'y540'])
    expect(mid.every((l) => l.kind === 'centre')).toBe(true)
  })
  it('show another source edges and its middle', () => {
    const other = box(500, 300, 200, 100) // left 500, middle 600, right 700; top 300, middle 350
    // Left edges lined up, middles lined up on y.
    const g = guidesFor(rectOf(box(500, 325, 80, 50)), [other], canvas, opts)
    const has = (axis: string, at: number) => g.some((l) => l.axis === axis && l.at === at)
    expect(has('x', 500)).toBe(true)
    expect(has('y', 350)).toBe(true)
    // The line spans both boxes, so it is seen joining them.
    const x = g.find((l) => l.axis === 'x' && l.at === 500)
    expect(x && [x.from, x.to]).toEqual([300, 400])
  })
  it('join every box on a shared line: one line, reaching the farthest of them', () => {
    // Two boxes share the left edge x 500, one high up (y 0-20) and one low (y 300-400).
    const hi = box(500, 0, 100, 20)
    const lo = box(500, 300, 100, 100)
    const g = guidesFor(rectOf(box(500, 100, 80, 100)), [hi, lo], canvas, opts).filter(
      (l) => l.axis === 'x' && l.at === 500,
    )
    expect(g.length).toBe(1)
    expect([g[0]!.from, g[0]!.to]).toEqual([0, 400])
  })
  it('only show what is lined up, within half a pixel', () => {
    const other = box(500, 300, 200, 100)
    expect(
      guidesFor(rectOf(box(503, 0, 80, 50)), [other], canvas, opts).filter((l) => l.axis === 'x'),
    ).toEqual([])
    expect(
      guidesFor(rectOf(box(500.4, 0, 80, 50)), [other], canvas, opts).some((l) => l.axis === 'x'),
    ).toBe(true)
  })
  it('follow the switches: no canvas edges, no middle, no other sources', () => {
    const other = box(500, 300, 200, 100)
    const r = rectOf(box(0, 300, 200, 100))
    expect(guidesFor(r, [other], canvas, { screen: false, centre: true, others: false })).toEqual(
      [],
    )
    const m = rectOf(box(860, 440, 200, 200))
    expect(guidesFor(m, [], canvas, { screen: true, centre: false, others: true })).toEqual([])
    expect(
      guidesFor(r, [other], canvas, { screen: true, centre: true, others: false }).map(
        (l) => l.kind,
      ),
    ).toEqual(['canvas'])
  })
  it('work for a turned box through its bounds, and for a box with no size', () => {
    // A box turned 90 degrees about (100,100): its bounds run from x 50 to 100, y 100 to 200.
    const r = rectOf(turned(100, 100, 100, 50, 90))
    const g = guidesFor(r, [box(50, 500, 10, 10)], canvas, opts)
    expect(g.some((l) => l.axis === 'x' && l.at === 50)).toBe(true)
    const zero = guidesFor(rectOf(box(960, 540, 0, 0)), [], canvas, opts)
    expect(zero.map((l) => `${l.axis}${l.at}`).sort()).toEqual(['x960', 'y540'])
    expect(JSON.stringify(zero)).not.toContain('null')
  })
  it('work on a tall canvas', () => {
    const tall = { width: 1080, height: 1920 }
    const g = guidesFor(rectOf(box(440, 860, 200, 200)), [], tall, opts)
    expect(g.map((l) => `${l.axis}${l.at}`).sort()).toEqual(['x540', 'y960'])
  })
})

describe('the gap to the nearest neighbour', () => {
  const left = box(0, 100, 100, 100) // right edge at 100
  const right = box(400, 120, 100, 50) // left edge at 400
  it('is measured on each side to the nearest box it overlaps across', () => {
    const r = rectOf(box(200, 110, 100, 100))
    const g = gapsFor(r, [left, right, box(0, 0, 10, 10)])
    const h = g.filter((x) => x.axis === 'x')
    expect(h.map((x) => [x.from, x.to, x.px])).toEqual([
      [100, 200, 100],
      [300, 400, 100],
    ])
    // The far box that doesn't overlap vertically is no neighbour.
    expect(g.some((x) => x.px === 0)).toBe(false)
  })
  it('picks the nearer of two on one side', () => {
    const r = rectOf(box(300, 0, 50, 50))
    const g = gapsFor(r, [box(0, 0, 50, 50), box(200, 10, 50, 30)])
    expect(g.filter((x) => x.axis === 'x').map((x) => x.px)).toEqual([50])
  })
  it('measures down and up too, and says nothing when nothing is near', () => {
    const r = rectOf(box(10, 200, 100, 50))
    const g = gapsFor(r, [box(0, 0, 200, 100), box(20, 400, 40, 40)])
    expect(g.filter((x) => x.axis === 'y').map((x) => x.px)).toEqual([100, 150])
    expect(gapsFor(rectOf(box(1000, 1000, 10, 10)), [])).toEqual([])
  })
  it('does not count a box it overlaps', () => {
    expect(gapsFor(rectOf(box(0, 0, 100, 100)), [box(50, 50, 100, 100)])).toEqual([])
  })
})

describe('what a box can snap to', () => {
  const group = item(10, box(0, 0, 400, 400), {
    children: [item(11, box(10, 10, 100, 100)), item(12, box(200, 200, 100, 100))],
  })
  const list = [
    item(1, box(500, 0, 50, 50)),
    group,
    item(2, box(600, 0, 50, 50), { visible: false }),
  ]
  it('are the visible sources, a group and its sources', () => {
    expect(snapTargets(list, [1]).length).toBe(3)
  })
  it('leave out the box itself, and hidden ones', () => {
    const t = snapTargets(list, [1])
    expect(t).toContainEqual(group.frame)
    expect(t).not.toContainEqual(box(500, 0, 50, 50))
    expect(t).not.toContainEqual(box(600, 0, 50, 50))
  })
  it('leave out the group a moving source is in (its edges move with it)', () => {
    const t = snapTargets(list, [11])
    expect(t).not.toContainEqual(group.frame)
    expect(t).toContainEqual(box(200, 200, 100, 100))
  })
  it('leave out the sources of a moving group', () => {
    const t = snapTargets(list, [10])
    expect(t).toEqual([box(500, 0, 50, 50)])
  })
  it('leave out the sources of a hidden group (the picture does not show them)', () => {
    const hidden = item(20, box(0, 0, 400, 400), {
      visible: false,
      children: [item(21, box(10, 10, 100, 100))],
    })
    expect(snapTargets([hidden, item(1, box(500, 0, 50, 50))], [])).toEqual([box(500, 0, 50, 50)])
  })
  it('keep a locked source as a place to line up with, and skip one with no frame yet', () => {
    const t = snapTargets([item(1, box(0, 0, 10, 10), { locked: true }), item(2, undefined)], [])
    expect(t).toEqual([box(0, 0, 10, 10)])
  })
})

describe('aligning', () => {
  const a = { id: 1, frame: box(100, 50, 200, 100), locked: false } // x 100-300, y 50-150
  const b = { id: 2, frame: box(400, 300, 100, 50), locked: false } // x 400-500, y 300-350
  const c = { id: 3, frame: box(250, 500, 40, 60), locked: false } // x 250-290, y 500-560
  const by = (list: { id: number; dx: number; dy: number }[]) =>
    Object.fromEntries(list.map((d) => [d.id, [d.dx, d.dy]]))
  it('lines up the left, right, top and bottom edges with the selection', () => {
    expect(by(alignDeltas([a, b, c], 'left'))).toEqual({ 1: [0, 0], 2: [-300, 0], 3: [-150, 0] })
    expect(by(alignDeltas([a, b, c], 'right'))).toEqual({ 1: [200, 0], 2: [0, 0], 3: [210, 0] })
    expect(by(alignDeltas([a, b, c], 'top'))).toEqual({ 1: [0, 0], 2: [0, -250], 3: [0, -450] })
    expect(by(alignDeltas([a, b, c], 'bottom'))).toEqual({ 1: [0, 410], 2: [0, 210], 3: [0, 0] })
  })
  it('centres on the middle of the selection, across and down', () => {
    // The selection spans x 100-500 (middle 300) and y 50-560 (middle 305).
    expect(by(alignDeltas([a, b, c], 'centre'))).toEqual({ 1: [100, 0], 2: [-150, 0], 3: [30, 0] })
    expect(by(alignDeltas([a, b, c], 'middle'))).toEqual({ 1: [0, 205], 2: [0, -20], 3: [0, -225] })
  })
  it('does nothing for one source, and never moves a locked one', () => {
    expect(alignDeltas([a], 'left')).toEqual([])
    const locked = { ...b, locked: true }
    const moved = by(alignDeltas([a, locked, c], 'left'))
    expect(moved[2]).toBeUndefined()
    // The locked one still counts in where the selection's edge is: it is part of the selection.
    expect(moved[1]).toEqual([0, 0])
    // Only locked ones: nothing to move.
    expect(alignDeltas([locked, { ...a, locked: true }], 'left')).toEqual([])
  })
  it('works by the bounds of a turned box', () => {
    // Turned 90 degrees about its corner: its bounds begin at x = 100 - 50 = 50.
    const t = { id: 9, frame: turned(100, 100, 100, 50, 90), locked: false }
    expect(by(alignDeltas([a, t], 'left'))).toEqual({ 1: [-50, 0], 9: [0, 0] })
  })
  it('keeps a box with no size where its edge is', () => {
    const z = { id: 5, frame: box(70, 70, 0, 0), locked: false }
    expect(by(alignDeltas([a, z], 'left'))).toEqual({ 1: [-30, 0], 5: [0, 0] })
  })
})

describe('spacing out', () => {
  const at = (id: number, x: number, w: number, y = 0, h = 10) => ({
    id,
    frame: box(x, y, w, h),
    locked: false,
  })
  const by = (list: { id: number; dx: number; dy: number }[]) =>
    Object.fromEntries(list.map((d) => [d.id, [d.dx, d.dy]]))
  it('makes the gaps between three equal, the two at the ends staying put', () => {
    // 0-100, 150-200, 500-600: 350 of gap to share, 175 each (the middle goes from 150 to 275).
    const d = by(distributeDeltas([at(1, 0, 100), at(2, 150, 50), at(3, 500, 100)], 'x'))
    expect(d).toEqual({ 2: [125, 0] })
  })
  it('does not depend on the order they come in', () => {
    const d = by(distributeDeltas([at(3, 500, 100), at(1, 0, 100), at(2, 150, 50)], 'x'))
    expect(d).toEqual({ 2: [125, 0] })
  })
  it('works down as well, with four of different sizes', () => {
    const list = [
      at(1, 0, 10, 0, 100),
      at(2, 0, 10, 130, 40),
      at(3, 0, 10, 200, 10),
      at(4, 0, 10, 600, 100),
    ]
    // Spans 0-700, boxes 100+40+10+100 = 250 tall, 450 of gap over 3: 150 each.
    const d = by(distributeDeltas(list, 'y'))
    expect(d).toEqual({ 2: [0, 120], 3: [0, 240] })
  })
  it('needs three or more, and leaves a locked one where it is', () => {
    expect(distributeDeltas([at(1, 0, 10), at(2, 100, 10)], 'x')).toEqual([])
    expect(distributeDeltas([], 'x')).toEqual([])
    const l = { ...at(2, 150, 50), locked: true }
    expect(distributeDeltas([at(1, 0, 100), l, at(3, 500, 100)], 'x')).toEqual([])
  })
  it('is still tidy when boxes overlap', () => {
    // 0-100, 50-150, 400-500: a negative gap is still equalised: (400 - 150... total 500 - 100-100-100 = 200, 100 each).
    const d = by(distributeDeltas([at(1, 0, 100), at(2, 50, 100), at(3, 400, 100)], 'x'))
    expect(d).toEqual({ 2: [150, 0] })
  })
})

describe('moving and sizing a group of picked sources', () => {
  const items = [
    { id: 1, frame: box(100, 100, 100, 50), locked: false },
    { id: 2, frame: box(300, 200, 100, 100), locked: false },
  ]
  const from = { left: 100, top: 100, right: 400, bottom: 300 }
  it('scales every source from the corner that stays', () => {
    // Twice as big about the top left: positions and sizes double from (100,100).
    const b = scaleGroup(items, from, { left: 100, top: 100, right: 700, bottom: 500 })
    expect(b).toEqual([
      { id: 1, x: 100, y: 100, w: 200, h: 100 },
      { id: 2, x: 500, y: 300, w: 200, h: 200 },
    ])
  })
  it('moves a group by a plain offset when its size stays', () => {
    const b = scaleGroup(items, from, { left: 150, top: 80, right: 450, bottom: 280 })
    expect(b.map((x) => [x.id, x.x, x.y, x.w, x.h])).toEqual([
      [1, 150, 80, 100, 50],
      [2, 350, 180, 100, 100],
    ])
  })
  it('keeps a turned source turned, resizing it along its own sides', () => {
    const t = [{ id: 7, frame: turned(200, 100, 100, 50, 90), locked: false }]
    const f = rectOf(t[0]!.frame)
    const b = scaleGroup(t, f, {
      left: f.left,
      top: f.top,
      right: f.left + (f.right - f.left) * 2,
      bottom: f.bottom,
    })
    // Its bounds are 50 wide and 100 tall; twice as wide on the canvas, the box's own sides
    // (which run down and across) change by the scale along each.
    expect(b[0]!.w).toBeCloseTo(100, 6)
    expect(b[0]!.h).toBeCloseTo(100, 6)
  })
  it('never makes a source smaller than 4 pixels, and never NaN for a group with no size', () => {
    const tiny = scaleGroup(items, from, { left: 100, top: 100, right: 100, bottom: 100 })
    expect(tiny.every((x) => x.w >= 4 && x.h >= 4)).toBe(true)
    const none = { left: 5, top: 5, right: 5, bottom: 5 }
    const same = scaleGroup([{ id: 1, frame: box(5, 5, 0, 0), locked: false }], none, {
      left: 5,
      top: 5,
      right: 50,
      bottom: 50,
    })
    expect(JSON.stringify(same)).not.toContain('null')
  })
  it('leaves a locked source out', () => {
    const b = scaleGroup([items[0]!, { ...items[1]!, locked: true }], from, {
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
    })
    expect(b.map((x) => x.id)).toEqual([1])
  })
})

describe('the box dragged on empty canvas', () => {
  const list = [
    item(1, box(0, 0, 100, 100)),
    item(2, box(150, 0, 100, 100)),
    item(3, box(400, 400, 50, 50), { visible: false }),
    item(4, box(50, 50, 100, 100), { locked: true }),
    item(5, box(80, 300, 100, 100), { children: [item(6, box(90, 310, 20, 20))] }),
  ]
  it('picks every visible source it touches, a group as one', () => {
    expect(marqueeHits(list, { left: 90, top: 40, right: 160, bottom: 60 })).toEqual([1, 2, 4])
    expect(marqueeHits(list, { left: 85, top: 305, right: 95, bottom: 315 })).toEqual([5])
  })
  it('works whichever corner it was dragged from, and picks nothing from empty canvas', () => {
    expect(marqueeHits(list, { left: 160, top: 60, right: 90, bottom: 40 })).toEqual([1, 2, 4])
    expect(marqueeHits(list, { left: 1000, top: 1000, right: 1100, bottom: 1100 })).toEqual([])
    // A hidden one is never picked.
    expect(marqueeHits(list, { left: 390, top: 390, right: 460, bottom: 460 })).toEqual([])
  })
  it('replaces, adds to or toggles the picks as the modifier says', () => {
    expect(pickWith([1, 2], [3, 4], 'replace')).toEqual([3, 4])
    expect(pickWith([1, 2], [2, 3], 'add')).toEqual([1, 2, 3])
    expect(pickWith([1, 2], [2, 3], 'toggle')).toEqual([1, 3])
    expect(pickWith([], [], 'toggle')).toEqual([])
  })
})

describe('which picked sources can be placed', () => {
  it('a source with no size yet has no place to move or line up', () => {
    expect(hasSize(box(0, 0, 100, 50))).toBe(true)
    expect(hasSize([0, 0, 0, 0, 10, 10])).toBe(false)
    expect(hasSize([0.4, 0, 0, 50, 0, 0])).toBe(false)
    expect(hasSize(undefined)).toBe(false)
  })
  it('keeps those with a size, and a source of a picked group only through the group', () => {
    const kid1 = item(11, box(10, 10, 50, 50))
    const kid2 = item(12, box(80, 10, 50, 50))
    const group = item(10, box(10, 10, 120, 50), { children: [kid1, kid2] })
    const empty = item(20, [0, 0, 0, 0, 5, 5])
    const list = [group, empty, item(30, box(300, 0, 10, 10))]
    const ids = (picked: number[]) => pickedBoxes(list, picked).map((i) => i.id)
    expect(ids([10, 11, 20, 30])).toEqual([10, 30]) // the child rides on its group; no size, no place
    expect(ids([11, 12])).toEqual([11, 12]) // two sources of the group, without the group
    expect(ids([11, 30])).toEqual([11, 30])
  })
})

describe('cancelling a drag', () => {
  it('puts every source of it back where the drag found it', () => {
    const a = box(10, 20, 100, 50)
    const b = box(300, 40, 60, 60)
    expect(revertBoxes({ id: 1, from: a, others: [] })).toEqual([
      { id: 1, x: 10, y: 20, w: 100, h: 50 },
    ])
    expect(revertBoxes({ id: 1, from: a, others: [{ id: 2, from: b }] })).toEqual([
      { id: 1, x: 10, y: 20, w: 100, h: 50 },
      { id: 2, x: 300, y: 40, w: 60, h: 60 },
    ])
    expect(
      revertBoxes({
        id: 1,
        from: a,
        others: [],
        group: {
          items: [
            { id: 1, frame: a },
            { id: 2, frame: b },
          ],
        },
      }),
    ).toEqual([
      { id: 1, x: 10, y: 20, w: 100, h: 50 },
      { id: 2, x: 300, y: 40, w: 60, h: 60 },
    ])
  })
})

describe('what is still waiting to be sent', () => {
  it('names every source in a waiting request, one or several', () => {
    const next = new Map<string, { id?: number; boxes?: { id: number }[] }>([
      ['s\u00015', { id: 5 }],
      ['s\u00011,2', { boxes: [{ id: 1 }, { id: 2 }] }],
    ])
    expect([...queuedIds(next)].sort()).toEqual([1, 2, 5])
  })
})

describe('review fixes: guides, gaps, spacing, sizing', () => {
  const opts = { screen: true, centre: true, others: true }
  it('one guide where a canvas line and a source line coincide, or two sources differ by a hair', () => {
    const edge = box(0, 300, 80, 50)
    const g = guidesFor(rectOf(box(0, 100, 50, 50)), [edge], canvas, opts).filter(
      (l) => l.axis === 'x',
    )
    expect(g.filter((l) => Math.abs(l.at) < 0.5).length).toBe(1)
    expect(g.find((l) => Math.abs(l.at) < 0.5)?.kind).toBe('canvas') // the canvas's own line wins
    const a = box(500, 0, 50, 50)
    const b = box(500.2, 200, 50, 50)
    const two = guidesFor(rectOf(box(500, 100, 40, 40)), [a, b], canvas, opts).filter(
      (l) => l.axis === 'x' && Math.abs(l.at - 500) < 1,
    )
    expect(two.length).toBe(1)
  })
  it('no gap line or "0" label where two boxes touch', () => {
    expect(gapsFor(rectOf(box(100, 0, 50, 50)), [box(0, 0, 100, 50)])).toEqual([])
    expect(gapsFor(rectOf(box(100, 0, 50, 50)), [box(0, 0, 99, 50)]).length).toBe(1)
  })
  it('spaces out around a locked one, which stays and is a fixed end of its stretch', () => {
    const mk = (id: number, x: number, locked = false) => ({
      id,
      frame: box(x, 0, 100, 10),
      locked,
    })
    // 4 items, #2 locked in the middle: #3 spaces between #2 and #4, #1..#2 has nothing between.
    const d = distributeDeltas([mk(1, 0), mk(2, 150, true), mk(3, 200), mk(4, 700)], 'x')
    expect(d.map((x) => x.id)).toEqual([3]) // the locked one isn't moved; #1 and #4 are ends
    const only = d[0]!
    // between #2 (150-250) and #4 (700-800): gap = (700 - 250 - 100) / 2 = 175, so #3 starts at 425
    expect(only.dx).toBeCloseTo(425 - 200, 6)
  })
  it('never mirrors a group dragged inside out', () => {
    const items = [{ id: 1, frame: box(100, 100, 100, 100), locked: false }]
    const out = scaleGroup(
      items,
      { left: 100, top: 100, right: 200, bottom: 200 },
      {
        left: 300,
        top: 100,
        right: 250,
        bottom: 200,
      },
    )
    expect(out[0]!.w).toBeGreaterThanOrEqual(4)
    expect(out[0]!.x).toBeGreaterThanOrEqual(240) // not mirrored across the group's left
  })
})

describe('CodeRabbit pass 2', () => {
  it('queued requests go out in the order they were made when they overlap', () => {
    type J = { save: boolean; id?: number; boxes?: { id: number }[] }
    const next = new Map<string, J>()
    const ab = (x: number) => ({ save: false, boxes: [{ id: 1, x } as { id: number }, { id: 2 }] })
    enqueueJob(next, 'ab', ab(1))
    enqueueJob(next, 'a', { save: false, id: 1 })
    enqueueJob(next, 'ab', ab(3)) // the newest A+B, after A
    expect([...next.keys()]).toEqual(['a', 'ab']) // A's older move is not sent after the newer A+B
    expect((next.get('ab')?.boxes?.[0] as unknown as { x: number }).x).toBe(3)
    // Requests that don't overlap still replace in place.
    const apart = new Map<string, J>()
    enqueueJob(apart, 'ab', ab(1))
    enqueueJob(apart, 'c', { save: false, id: 3 })
    enqueueJob(apart, 'ab', ab(2))
    expect([...apart.keys()]).toEqual(['ab', 'c'])
    // A save is never lost to a later move without one.
    const saved = new Map<string, J>()
    enqueueJob(saved, 'a', { save: true, id: 1 })
    enqueueJob(saved, 'a', { save: false, id: 1 })
    expect(saved.get('a')?.save).toBe(true)
  })

  it('reorders overlapping multi-item jobs queued with ids instead of boxes', () => {
    type J = { save: boolean; id?: number; ids?: number[]; boxes?: { id: number }[] }
    const next = new Map<string, J>()
    enqueueJob(next, 'many:1,2', { save: false, ids: [1, 2] })
    enqueueJob(next, '1', { save: false, id: 1 })
    enqueueJob(next, 'many:1,2', { save: true, ids: [1, 2] })
    expect([...next.keys()]).toEqual(['1', 'many:1,2'])
    expect(next.get('many:1,2')?.save).toBe(true)

    // Also overlaps when a single-item job sits between boxes and ids jobs.
    const mixed = new Map<string, J>()
    enqueueJob(mixed, '1', { save: false, id: 1 })
    enqueueJob(mixed, 'many:1,2', { save: false, ids: [1, 2] })
    enqueueJob(mixed, '1', { save: true, id: 1 })
    expect([...mixed.keys()]).toEqual(['many:1,2', '1'])
  })

  it('Escape in a crop drag goes back to the transform/crop the drag started with', () => {
    const from = { left: 1, top: 2, right: 3, bottom: 4 }
    expect(revertCrop({ from })).toEqual(from)
    expect(revertCrop('reading')).toBeNull()
    expect(revertCrop(null)).toBeNull()
  })

  it('zero-size sources are not places to line up with', () => {
    const list = [item(1, [0, 0, 0, 0, 500, 500]), item(2, box(100, 100, 50, 50))]
    expect(snapTargets(list, [])).toEqual([box(100, 100, 50, 50)])
    const group = item(3, box(0, 0, 400, 400), {
      children: [item(4, [0, 0, 0, 0, 9, 9]), item(5, box(10, 10, 20, 20))],
    })
    expect(snapTargets([group], [])).toEqual([box(0, 0, 400, 400), box(10, 10, 20, 20)])
  })

  it('the box round the picked is made of the visible, sized, unlocked ones only', () => {
    const list = [
      item(1, box(0, 0, 100, 100)),
      item(2, box(200, 0, 100, 100)),
      item(3, box(900, 900, 100, 100), { visible: false }),
      item(4, [0, 0, 0, 0, 5, 5]),
      item(5, box(400, 0, 100, 100), { locked: true }),
    ]
    const g = pickedGroup(list, [1, 2, 3, 4, 5])
    expect(g.members.map((m) => m.id)).toEqual([1, 2])
    expect(g.rect).toEqual({ left: 0, top: 0, right: 300, bottom: 100 })
    expect(pickedGroup(list, [1, 3]).rect).toBeNull() // one is not a group
  })

  it('a marquee touches a turned source only where the source is', () => {
    // A diamond (a square turned 45 degrees) centred at (200,200): its bounds are 100..300.
    const diamond = turned(200, 100, 100, 100, 45)
    const d = rectOf(diamond)
    expect(d.left).toBeLessThan(150)
    const list = [item(1, diamond)]
    // A marquee in the bounds' upper-left corner, clear of the diamond's edge.
    expect(
      marqueeHits(list, { left: d.left, top: d.top, right: d.left + 20, bottom: d.top + 20 }),
    ).toEqual([])
    // One over its middle, and one that only touches its edge.
    expect(marqueeHits(list, { left: 190, top: 190, right: 210, bottom: 210 })).toEqual([1])
    expect(
      marqueeHits([item(2, box(100, 100, 50, 50))], {
        left: 150,
        top: 120,
        right: 200,
        bottom: 130,
      }),
    ).toEqual([2])
  })

  it('a turned source in a group sized one way grows evenly, so it stays inside the new box', () => {
    const diamond = turned(250, 100, 100, 100, 45)
    const from = union([rectOf(diamond), rectOf(box(0, 0, 50, 50))]) as Rect
    // Double the width only.
    const to = { ...from, right: from.left + (from.right - from.left) * 2 }
    const out = scaleGroup([{ id: 1, frame: diamond, locked: false }], from, to)[0]!
    const r = rectOf(frameOfBox(diamond, out))
    expect(r.right).toBeLessThanOrEqual(to.right + 1e-6)
    expect(r.top).toBeGreaterThanOrEqual(from.top - 1e-6)
    expect(r.bottom).toBeLessThanOrEqual(from.bottom + 1e-6)
  })
})
