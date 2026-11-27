import { describe, expect, it } from 'vitest'
import { computePopoverPosition, type RectBox, type SafeBounds } from './popover-surface'

const box = (left: number, top: number, width: number, height: number): RectBox => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

describe('computePopoverPosition', () => {
  const desktopBounds: SafeBounds = { left: 8, top: 48, right: 1272, bottom: 764 }

  it('opens below when room fits and aligns start or end inside bounds', () => {
    const pos = computePopoverPosition({
      anchor: box(400, 120, 80, 32),
      surface: { width: 200, height: 180, scrollHeight: 180 },
      bounds: desktopBounds,
      placement: 'bottom',
      align: 'start',
      gap: 6,
    })
    expect(pos).toEqual({
      left: 400,
      top: 158,
      maxHeight: 606,
      maxWidth: 1264,
      placedSide: 'bottom',
    })
  })

  it('flips upward when below overflows safe bottom (e.g. Audio bottom dock or near status bar)', () => {
    const pos = computePopoverPosition({
      anchor: box(600, 700, 32, 32),
      surface: { width: 208, height: 220, scrollHeight: 220 },
      bounds: desktopBounds,
      placement: 'bottom',
      align: 'end',
      gap: 6,
    })
    expect(pos.placedSide).toBe('top')
    expect(pos.top + 220).toBeLessThanOrEqual(700 - 6 + 1)
    expect(pos.top).toBe(474)
    expect(pos.left).toBe(632 - 208)
  })

  it('clamps right-aligned menus inside left viewport edge on narrow side docks (180 px dock)', () => {
    const pos = computePopoverPosition({
      anchor: box(140, 60, 28, 28),
      surface: { width: 220, height: 180, scrollHeight: 180 },
      bounds: desktopBounds,
      placement: 'bottom',
      align: 'end',
      gap: 4,
    })
    expect(pos.left).toBe(8)
    expect(pos.left + 220).toBeLessThanOrEqual(desktopBounds.right)
  })

  it('flips submenus cleanly to the left of parentMenuRect instead of hardcoded -220 offset', () => {
    const parentMenu = box(1040, 200, 220, 240)
    const itemRow = box(1044, 240, 212, 32)
    const pos = computePopoverPosition({
      anchor: itemRow,
      parentMenuRect: parentMenu,
      surface: { width: 210, height: 140, scrollHeight: 140 },
      bounds: desktopBounds,
      placement: 'right',
      align: 'start',
      gap: -4,
    })
    expect(pos.placedSide).toBe('left')
    // Flips against parentMenu.left + 4 - subWidth = 1040 + 4 - 210 = 834 (no overlap, no offscreen shift).
    expect(pos.left).toBe(834)
    expect(pos.top).toBe(234)
  })

  it('clamps submenus inside 375x812 mobile viewport bounds without shifting off-screen', () => {
    const mobileBounds: SafeBounds = { left: 8, top: 64, right: 367, bottom: 740 }
    const parentMenu = box(140, 200, 220, 200)
    const itemRow = box(144, 240, 212, 32)
    const pos = computePopoverPosition({
      anchor: itemRow,
      parentMenuRect: parentMenu,
      surface: { width: 210, height: 180, scrollHeight: 180 },
      bounds: mobileBounds,
      placement: 'right',
      align: 'start',
      gap: -4,
    })
    expect(pos.left).toBeGreaterThanOrEqual(mobileBounds.left)
    expect(pos.left + Math.min(210, pos.maxWidth)).toBeLessThanOrEqual(mobileBounds.right)
    expect(pos.top).toBeGreaterThanOrEqual(mobileBounds.top)
    expect(pos.top + 180).toBeLessThanOrEqual(mobileBounds.bottom)
  })

  it('caps maxHeight and scrolls cleanly inside 1024x600 short viewports', () => {
    const shortBounds: SafeBounds = { left: 8, top: 48, right: 1016, bottom: 564 }
    const pos = computePopoverPosition({
      anchor: box(700, 50, 32, 32),
      surface: { width: 264, height: 540, scrollHeight: 540 },
      bounds: shortBounds,
      placement: 'bottom',
      align: 'end',
      gap: 6,
    })
    expect(pos.placedSide).toBe('bottom')
    expect(pos.top).toBe(88)
    expect(pos.maxHeight).toBe(564 - 88)
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(564)
  })

  it('clamps vertical placement to both bounds.top and bounds.bottom - height', () => {
    const bounds: SafeBounds = { left: 8, top: 80, right: 800, bottom: 600 }
    // Anchor sits above protected top bound; bottom placement must clamp down to bounds.top.
    const fromAbove = computePopoverPosition({
      anchor: box(100, 40, 80, 20),
      surface: { width: 200, height: 100, scrollHeight: 100 },
      bounds,
      placement: 'bottom',
      align: 'start',
      gap: 6,
    })
    expect(fromAbove.placedSide).toBe('bottom')
    expect(fromAbove.top).toBe(bounds.top)

    // Anchor sits below protected bottom bound; top placement must clamp up to bounds.bottom - height.
    const fromBelow = computePopoverPosition({
      anchor: box(100, 650, 80, 20),
      surface: { width: 200, height: 20, scrollHeight: 20 },
      bounds,
      placement: 'top',
      align: 'start',
      gap: 6,
    })
    expect(fromBelow.placedSide).toBe('top')
    expect(fromBelow.top + 20).toBeLessThanOrEqual(bounds.bottom)
  })
})
