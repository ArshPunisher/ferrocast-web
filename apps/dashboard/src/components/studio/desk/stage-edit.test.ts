import { describe, expect, it } from 'vitest'
import type { EngineTransform } from '@ferrocast/api'
import {
  MOVE,
  boxOf,
  cropCursorFor,
  cropDrag,
  croppedFrame,
  cropTransform,
  cursorFor,
  drag,
  fit,
  gripAt,
  pick,
  type Frame,
} from './stage-edit'

const canvas = { width: 1920, height: 1080 }
// A 400×300 box at (100, 50).
const plain: Frame = [400, 0, 0, 300, 100, 50]
// The same box flipped across: its first corner is on the right.
const flipped: Frame = [-400, 0, 0, 300, 500, 50]
const opts = { canvas, snap: 0 }

describe('picking in the preview', () => {
  it('finds the topmost showing item under the pointer', () => {
    const items = [
      { id: 1, visible: false, frame: plain },
      { id: 2, visible: true, frame: plain },
      { id: 3, visible: true, frame: [1920, 0, 0, 1080, 0, 0] as Frame },
      { id: 4, visible: true },
    ]
    expect(pick(items, { x: 200, y: 100 })?.id).toBe(2)
    expect(pick(items, { x: 1000, y: 900 })?.id).toBe(3)
    expect(pick(items, { x: -5, y: 10 })).toBeNull()
  })

  it('grabs a handle near it, else the box to move it', () => {
    expect(gripAt(plain, { x: 503, y: 352 }, 9)).toEqual({ u: 1, v: 1 })
    expect(gripAt(plain, { x: 300, y: 50 }, 9)).toEqual({ u: 0.5, v: 0 })
    expect(gripAt(plain, { x: 300, y: 200 }, 9)).toBe(MOVE)
    expect(gripAt(plain, { x: 900, y: 900 }, 9)).toBeNull()
    expect(cursorFor(plain, { u: 1, v: 1 })).toBe('nwse-resize')
    expect(cursorFor(plain, { u: 1, v: 0 })).toBe('nesw-resize')
    expect(cursorFor(plain, { u: 0.5, v: 0 })).toBe('ns-resize')
    expect(cursorFor(plain, { u: 0, v: 0.5 })).toBe('ew-resize')
    expect(cursorFor(plain, MOVE)).toBe('move')
  })

  it('maps the letterboxed canvas into the box', () => {
    expect(fit({ width: 960, height: 540 }, canvas)).toEqual({ scale: 0.5, ox: 0, oy: 0 })
    const tall = fit({ width: 960, height: 1000 }, canvas)
    expect(tall.scale).toBe(0.5)
    expect(tall.oy).toBe(230)
  })
})

describe('dragging', () => {
  it('moves the whole box', () => {
    expect(drag(plain, MOVE, { x: 30, y: -20 }, opts)).toEqual({ x: 130, y: 30, w: 400, h: 300 })
  })

  it('snaps to the canvas edges and middle unless asked not to', () => {
    const snap = { canvas, snap: 10 }
    // Left edge 6 pixels from 0.
    expect(drag(plain, MOVE, { x: -94, y: 0 }, snap).x).toBe(0)
    // The middle lands on the canvas's middle.
    expect(drag(plain, MOVE, { x: 657, y: 0 }, snap).x).toBe(760)
    expect(drag(plain, MOVE, { x: -94, y: 0 }, opts).x).toBe(6)
  })

  it('snaps only to what the settings ask for', () => {
    const none = { screen: false, center: false, others: [] }
    // Screen edges off: no pull to 0.
    expect(drag(plain, MOVE, { x: -94, y: 0 }, { canvas, snap: 10, to: none }).x).toBe(6)
    // Middle on, edges off.
    const mid = { canvas, snap: 10, to: { ...none, center: true } }
    expect(drag(plain, MOVE, { x: 657, y: 0 }, mid).x).toBe(760)
    expect(drag(plain, MOVE, { x: -94, y: 0 }, mid).x).toBe(6)
    // Another source's right edge (at 1000) catches this one's left edge.
    const other: Frame = [200, 0, 0, 200, 800, 400]
    const near = { canvas, snap: 10, to: { ...none, others: [other] } }
    expect(drag(plain, MOVE, { x: 906, y: 0 }, near).x).toBe(1000)
    // Its top (400) lines up with this one's top.
    expect(drag(plain, MOVE, { x: 0, y: 355 }, near).y).toBe(400)
  })

  it("catches another source's middle too, across and down", () => {
    const none = { screen: false, center: false, others: [] as Frame[] }
    // Another source at x 800-1000, y 400-600: its middle is at (900, 500).
    const other: Frame = [200, 0, 0, 200, 800, 400]
    const near = { canvas, snap: 10, to: { ...none, others: [other] } }
    // This one's middle (200 in from its left) lands near 900: its left goes to 700.
    expect(drag(plain, MOVE, { x: 603, y: 0 }, near).x).toBe(700)
    // And this one's middle (150 down) near 500: its top goes to 350.
    expect(drag(plain, MOVE, { x: 0, y: 297 }, near).y).toBe(350)
    // Not when it is too far.
    expect(drag(plain, MOVE, { x: 620, y: 0 }, near).x).toBe(720)
  })

  it('resizes from the far corner keeping the shape, or freely with Shift', () => {
    expect(drag(plain, { u: 1, v: 1 }, { x: 400, y: 300 }, opts)).toEqual({
      x: 100,
      y: 50,
      w: 800,
      h: 600,
    })
    expect(drag(plain, { u: 1, v: 1 }, { x: 400, y: 0 }, { ...opts, free: true })).toEqual({
      x: 100,
      y: 50,
      w: 800,
      h: 300,
    })
  })

  it('keeps the shape from every handle when the frame is locked, Shift or not', () => {
    // The right side pulled 200 out: twice as wide, so twice as tall, round the same middle.
    expect(drag(plain, { u: 1, v: 0.5 }, { x: 200, y: 0 }, { ...opts, keep: true })).toEqual({
      x: 100,
      y: -25,
      w: 600,
      h: 450,
    })
    // The top pulled 150 down: half as tall, so half as wide, the bottom staying put.
    expect(
      drag(plain, { u: 0.5, v: 0 }, { x: 0, y: 150 }, { ...opts, keep: true, free: true }),
    ).toEqual({ x: 200, y: 200, w: 200, h: 150 })
    // A corner too, even with Shift held.
    const c = drag(plain, { u: 1, v: 1 }, { x: 400, y: 0 }, { ...opts, keep: true, free: true })
    expect(c.w / c.h).toBeCloseTo(400 / 300)
  })

  it('sizes smoothly from a corner as the pointer goes round, never jumping', () => {
    // Before, the side that moved more set the size: crossing the diagonal jumped.
    const a = drag(plain, { u: 1, v: 1 }, { x: 100, y: 74 }, opts)
    const b = drag(plain, { u: 1, v: 1 }, { x: 100, y: 76 }, opts)
    expect(Math.abs(a.w - b.w)).toBeLessThan(3)
  })

  it('pulls a side being resized onto the canvas edge when near, as OBS does', () => {
    const snap = { canvas, snap: 20 }
    // Free: the right side 10 short of the canvas's edge lands on it.
    expect(drag(plain, { u: 1, v: 0.5 }, { x: 1410, y: 0 }, snap).w).toBe(1820)
    // Keeping the shape: the far corner's side lands on the edge, the shape stays.
    const c = drag(plain, { u: 1, v: 1 }, { x: 1408, y: 1056 }, snap)
    expect(c.x + c.w).toBeCloseTo(1920)
    expect(c.w / c.h).toBeCloseTo(400 / 300)
    // The first corner pulled out to the canvas's top-left edge.
    const d = drag(plain, { u: 0, v: 0.5 }, { x: -92, y: 0 }, snap)
    expect(d.x).toBe(0)
    expect(d.w).toBe(500)
    // A snap that would leave the short side under 4 pixels isn't taken.
    const thin: Frame = [400, 0, 0, 10, 100, 50]
    const t = drag(
      thin,
      { u: 0, v: 0.5 },
      { x: 396, y: 0 },
      {
        ...snap,
        keep: true,
        to: {
          screen: false,
          center: false,
          others: [[1, 0, 0, 1, 345, 0]],
        },
      },
    )
    expect(t.h).toBeGreaterThanOrEqual(4)
    // Its smallest is 160×4; the line 5 short of that left side would make it 3.9 high.
    expect(t.w).toBe(160)
    // Nowhere near a line: no pull.
    expect(drag(plain, { u: 1, v: 0.5 }, { x: 300, y: 0 }, snap).w).toBe(700)
  })

  it('moves the first corner when its sides are dragged', () => {
    // The top-left handle pulled in along its diagonal: half the size, far corner fixed.
    expect(drag(plain, { u: 0, v: 0 }, { x: 200, y: 150 }, opts)).toEqual({
      x: 300,
      y: 200,
      w: 200,
      h: 150,
    })
    // A side handle changes only its own side.
    expect(drag(plain, { u: 0.5, v: 0 }, { x: 50, y: -40 }, opts)).toEqual({
      x: 100,
      y: 10,
      w: 400,
      h: 340,
    })
  })

  it('works on flipped boxes in their own direction', () => {
    // The flipped box's u = 1 side is on the left; dragging it left makes it wider.
    const b = drag(flipped, { u: 1, v: 0.5 }, { x: -100, y: 0 }, opts)
    expect(b).toEqual({ x: 500, y: 50, w: 500, h: 300 })
  })

  it('never gets smaller than 4 pixels', () => {
    const b = drag(plain, { u: 1, v: 1 }, { x: -1000, y: -1000 }, opts)
    expect(b.w).toBeGreaterThanOrEqual(4)
    expect(b.h).toBeGreaterThanOrEqual(4)
    expect(b.w / b.h).toBeCloseTo(4 / 3)
  })

  it('reads a box back as the engine takes it', () => {
    expect(boxOf(flipped)).toEqual({ x: 500, y: 50, w: 400, h: 300 })
  })
})

describe('cropping with Alt (OBS)', () => {
  // A 1000 x 500 source shown at half size: 500 x 250 on the canvas at (100, 100).
  const f: Frame = [500, 0, 0, 250, 100, 100]
  const none = { left: 0, top: 0, right: 0, bottom: 0 }
  const size = { width: 1000, height: 500 }
  it('each handle crops its own side, in source pixels', () => {
    // Right handle 50 canvas pixels in: 100 source pixels off the right.
    expect(cropDrag(f, { u: 1, v: 0.5 }, { x: -50, y: 0 }, none, size)).toEqual({
      ...none,
      right: 100,
    })
    // Top-left corner down and right: the left and top go.
    expect(cropDrag(f, { u: 0, v: 0 }, { x: 25, y: 10 }, none, size)).toEqual({
      left: 50,
      top: 20,
      right: 0,
      bottom: 0,
    })
  })
  it('dragging back out uncrops, never below nothing', () => {
    const cut = { ...none, bottom: 100 }
    // The source now shows 400 px high in 250 canvas px.
    const g: Frame = [500, 0, 0, 200, 100, 100]
    expect(cropDrag(g, { u: 0.5, v: 1 }, { x: 0, y: 25 }, cut, size).bottom).toBe(50)
    expect(cropDrag(g, { u: 0.5, v: 1 }, { x: 0, y: 900 }, cut, size).bottom).toBe(0)
  })
  it('always leaves some picture, and moving does nothing', () => {
    expect(cropDrag(f, { u: 1, v: 0.5 }, { x: -9999, y: 0 }, none, size).right).toBe(998)
    expect(cropDrag(f, MOVE, { x: 40, y: 40 }, none, size)).toEqual(none)
  })
  it('works along a turned source too', () => {
    // Turned a quarter: its width runs down the canvas.
    const t: Frame = [0, 500, -250, 0, 400, 100]
    expect(cropDrag(t, { u: 1, v: 0.5 }, { x: 0, y: -50 }, none, size).right).toBe(100)
  })
  it("a finger's wider reach never takes the middle of a wide, short box from moving it", () => {
    // 600 x 100 at (100,100): on a phone a 22 px reach is 122 canvas pixels, which reached from
    // the left-middle handle to a press 100 pixels in (Neon: a group drag became a resize).
    const wide: Frame = [600, 0, 0, 100, 100, 100]
    const press = { x: 200, y: 150 }
    expect(gripAt(wide, press, 122, 50)).toEqual(MOVE)
    // A mouse's reach (the least) is kept: a press right at a handle still takes it.
    expect(gripAt(wide, { x: 100, y: 150 }, 122, 50)?.u).toBe(0) // a handle on its left side
    // A box smaller than the reach still gives its handles the least reach, never less.
    const tiny: Frame = [20, 0, 0, 20, 500, 500]
    expect(gripAt(tiny, { x: 530, y: 510 }, 122, 50)?.u).toBeGreaterThanOrEqual(0) // a handle
  })
})

describe('cropCursorFor and cropTransform', () => {
  const baseTransform = (over: Partial<EngineTransform> = {}): EngineTransform => ({
    x: 100,
    y: 100,
    rotation: 0,
    scale_x: 1,
    scale_y: 1,
    alignment: 5,
    bounds: 'none',
    bounds_alignment: 5,
    bounds_width: 0,
    bounds_height: 0,
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    width: 1000,
    height: 500,
    ...over,
  })

  it('uses an SVG crop cursor (never crosshair) on handles with Alt and resize arrows without Alt', () => {
    const f: Frame = [400, 0, 0, 200, 100, 100]
    expect(cropCursorFor(f, { u: 0, v: 0.5 }, false)).toBe('ew-resize')
    const altLeft = cropCursorFor(f, { u: 0, v: 0.5 }, true)
    expect(altLeft).toContain('url("data:image/svg+xml,')
    expect(altLeft).toContain('ew-resize')
    expect(altLeft).not.toBe('crosshair')

    const altTop = cropCursorFor(f, { u: 0.5, v: 0 }, true)
    expect(altTop).toContain('ns-resize')
    expect(cropCursorFor(f, { u: 0, v: 0 }, true)).toContain('nwse-resize')
    // Hovering inside the source still moves even when Alt is held.
    expect(cropCursorFor(f, MOVE, true)).toBe('move')
  })

  it('at scale 1, cropping left or top shifts x/y inward and keeps the opposite edge pinned', () => {
    const f: Frame = [1000, 0, 0, 500, 100, 100]
    const from = baseTransform()
    const leftIn = cropTransform(f, { u: 0, v: 0.5 }, { x: 120, y: 0 }, from)
    expect(leftIn.crop_left).toBe(120)
    expect(leftIn.x).toBe(220)
    expect(leftIn.y).toBe(100)
    expect(leftIn.x + (leftIn.width - leftIn.crop_left - leftIn.crop_right)).toBe(1100)

    const topIn = cropTransform(f, { u: 0.5, v: 0 }, { x: 0, y: 80 }, from)
    expect(topIn.crop_top).toBe(80)
    expect(topIn.y).toBe(180)
    expect(topIn.x).toBe(100)
    expect(topIn.y + (topIn.height - topIn.crop_top - topIn.crop_bottom)).toBe(600)
  })

  it('at scale 0.5 (bounds none and stretch), keeps the visible pixels stationary on canvas', () => {
    const f: Frame = [500, 0, 0, 250, 100, 100]
    const half = baseTransform({ scale_x: 0.5, scale_y: 0.5 })
    const res = cropTransform(f, { u: 0, v: 0 }, { x: 50, y: 25 }, half)
    expect(res.crop_left).toBe(100)
    expect(res.crop_top).toBe(50)
    expect(res.x).toBe(150)
    expect(res.y).toBe(125)
    expect(res.scale_x).toBe(0.5)
    expect(res.scale_y).toBe(0.5)

    // With bounding box (as demo items use), shrinks bounds size cleanly instead of stretching!
    const boxed = baseTransform({
      bounds: 'stretch',
      bounds_width: 500,
      bounds_height: 250,
    })
    const boxedLeft = cropTransform(f, { u: 0, v: 0.5 }, { x: 50, y: 0 }, boxed)
    expect(boxedLeft.crop_left).toBe(100)
    expect(boxedLeft.x).toBe(150)
    expect(boxedLeft.bounds_width).toBe(450)
    expect(boxedLeft.bounds_height).toBe(250)
    expect(boxedLeft.x + boxedLeft.bounds_width).toBe(600)
  })

  it('when flipped on X (scale_x < 0), crops the edge under the handle without moving opposite side', () => {
    // Source sits visually across x = 100..1100; u=0 is at x=1100 (right), u=1 at x=100 (left).
    const f: Frame = [-1000, 0, 0, 500, 1100, 100]
    const flippedX = baseTransform({ x: 1100, y: 100, scale_x: -1 })
    const dragRightSideIn = cropTransform(f, { u: 0, v: 0.5 }, { x: -100, y: 0 }, flippedX)
    expect(dragRightSideIn.crop_left).toBe(100)
    expect(dragRightSideIn.x).toBe(1000)
    // Left visual edge (u = 1) stays at 100.
    expect(dragRightSideIn.x - (1000 - dragRightSideIn.crop_left)).toBe(100)

    const dragLeftSideIn = cropTransform(f, { u: 1, v: 0.5 }, { x: 100, y: 0 }, flippedX)
    expect(dragLeftSideIn.crop_right).toBe(100)
    expect(dragLeftSideIn.x).toBe(1100)
  })

  it('when rotated 90 degrees clockwise, maps drag along rotated axes and keeps far edge fixed', () => {
    // Source width runs down (+y) from (500, 100) to (500, 1100); height runs left (-x) to (0, 100).
    const f: Frame = [0, 1000, -500, 0, 500, 100]
    const rot90 = baseTransform({ x: 500, y: 100, rotation: 90 })
    const topEdgeDown = cropTransform(f, { u: 0, v: 0.5 }, { x: 0, y: 100 }, rot90)
    expect(topEdgeDown.crop_left).toBe(100)
    expect(topEdgeDown.x).toBe(500)
    expect(topEdgeDown.y).toBe(200)

    const rightEdgeLeft = cropTransform(f, { u: 0.5, v: 0 }, { x: -50, y: 0 }, rot90)
    expect(rightEdgeLeft.crop_top).toBe(50)
    expect(rightEdgeLeft.x).toBe(450)
    expect(rightEdgeLeft.y).toBe(100)
  })

  it('with existing crop, updates origin incrementally and uncrops back without drift', () => {
    // Previously cropped 100 left and 50 top -> seen 900x450 shown at half scale: 450x225 at (150, 125).
    const f: Frame = [450, 0, 0, 225, 150, 125]
    const existing = baseTransform({
      x: 150,
      y: 125,
      scale_x: 0.5,
      scale_y: 0.5,
      crop_left: 100,
      crop_top: 50,
    })
    const moreIn = cropTransform(f, { u: 0, v: 0 }, { x: 25, y: 15 }, existing)
    expect(moreIn.crop_left).toBe(150)
    expect(moreIn.crop_top).toBe(80)
    expect(moreIn.x).toBe(175)
    expect(moreIn.y).toBe(140)

    const uncropAll = cropTransform(f, { u: 0, v: 0 }, { x: -300, y: -300 }, existing)
    expect(uncropAll.crop_left).toBe(0)
    expect(uncropAll.crop_top).toBe(0)
    expect(uncropAll.x).toBe(100)
    expect(uncropAll.y).toBe(100)
  })

  it('croppedFrame scales edge vectors and sets post-crop origin for synchronous local state', () => {
    const f: Frame = [1920, 0, 0, 1080, 0, 0]
    const from = baseTransform({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      bounds_width: 1920,
      bounds_height: 1080,
    })
    const next = cropTransform(f, { u: 0, v: 0.5 }, { x: 100, y: 0 }, from)
    expect(croppedFrame(f, from, next)).toEqual([1820, 0, 0, 1080, 100, 0])
  })
})
