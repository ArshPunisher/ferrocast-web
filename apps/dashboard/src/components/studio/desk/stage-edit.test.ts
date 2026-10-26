import { describe, expect, it } from 'vitest'
import { MOVE, boxOf, cursorFor, drag, fit, gripAt, pick, type Frame } from './stage-edit'

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

  it('resizes from the far corner keeping the shape, or freely with Shift', () => {
    expect(drag(plain, { u: 1, v: 1 }, { x: 400, y: 0 }, opts)).toEqual({
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

  it('moves the first corner when its sides are dragged', () => {
    // The top-left handle pulled in by 100 across: half the size, far corner fixed.
    expect(drag(plain, { u: 0, v: 0 }, { x: 200, y: 0 }, opts)).toEqual({
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
