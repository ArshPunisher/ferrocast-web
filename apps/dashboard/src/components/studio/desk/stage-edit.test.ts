import { describe, expect, it } from 'vitest'
import { MOVE, boxOf, cropDrag, cursorFor, drag, fit, gripAt, pick, type Frame } from './stage-edit'

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
})
