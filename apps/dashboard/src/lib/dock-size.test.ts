import { beforeEach, describe, expect, it } from 'vitest'
import {
  LEFT_DOCK,
  MIN_STAGE,
  RIGHT_DOCK,
  clampDock,
  dockKeyTarget,
  readDock,
  saveDock,
} from './dock-size'

beforeEach(() => localStorage.clear())

describe('dock widths', () => {
  it('holds a width to its own limits', () => {
    expect(clampDock(LEFT_DOCK, 50, 300, 2000)).toBe(200)
    expect(clampDock(LEFT_DOCK, 900, 300, 2000)).toBe(360)
    expect(clampDock(RIGHT_DOCK, 400, 232, 2000)).toBe(400)
    expect(clampDock(RIGHT_DOCK, 900, 232, 2000)).toBe(520)
  })

  it('leaves the stage its room on a small window', () => {
    const w = clampDock(RIGHT_DOCK, 520, 232, 1000)
    expect(1000 - 232 - w).toBeGreaterThanOrEqual(MIN_STAGE)
    // Never below the dock's own minimum, even when the window is too small for both.
    expect(clampDock(RIGHT_DOCK, 520, 232, 600)).toBe(300)
  })

  it('remembers a width, and ignores a stored one out of range or not a number', () => {
    expect(readDock(LEFT_DOCK)).toBe(232)
    saveDock(LEFT_DOCK, 280)
    expect(readDock(LEFT_DOCK)).toBe(280)
    localStorage.setItem(LEFT_DOCK.key, '9999')
    expect(readDock(LEFT_DOCK)).toBe(232)
    localStorage.setItem(LEFT_DOCK.key, 'abc')
    expect(readDock(LEFT_DOCK)).toBe(232)
  })

  it('maps keys: arrows move the edge, shift moves further, Home and End go to the ends', () => {
    expect(dockKeyTarget(LEFT_DOCK, 'ArrowRight', false, 232, 1)).toBe(248)
    expect(dockKeyTarget(LEFT_DOCK, 'ArrowLeft', true, 232, 1)).toBe(184)
    // The right dock grows when its handle moves left.
    expect(dockKeyTarget(RIGHT_DOCK, 'ArrowLeft', false, 332, -1)).toBe(348)
    expect(dockKeyTarget(RIGHT_DOCK, 'ArrowRight', false, 332, -1)).toBe(316)
    expect(dockKeyTarget(RIGHT_DOCK, 'Home', false, 332, -1)).toBe(300)
    expect(dockKeyTarget(RIGHT_DOCK, 'End', false, 332, -1)).toBe(520)
    expect(dockKeyTarget(RIGHT_DOCK, 'a', false, 332, -1)).toBeNull()
  })
})
