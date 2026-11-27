import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PREVIEW_MAX_HOLES,
  PREVIEW_MAX_OVERLAYS,
  PREVIEW_OVERLAYS_EVENT,
  collectPreviewHoles,
  findUnregisteredPreviewOverlays,
  getPreviewOverlaySnapshot,
  getPreviewOverlays,
  notifyPreviewOverlays,
  registerPreviewHole,
  resetPreviewOverlayRegistry,
  subscribePreviewOverlays,
} from './preview-overlay-registry'

const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({
    x,
    y,
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  }) as DOMRect

describe('PreviewOverlayRegistry', () => {
  afterEach(() => {
    resetPreviewOverlayRegistry()
    vi.restoreAllMocks()
  })

  it('registers, updates, and unregisters holes and notifies subscribers', () => {
    const events: number[] = []
    const unsub = subscribePreviewOverlays(() => events.push(getPreviewOverlaySnapshot().version))

    let r = rect(200, 120, 180, 220)
    const off = registerPreviewHole('menu-1', {
      target: () => r,
      radius: 10,
    })

    expect(getPreviewOverlays()).toHaveLength(1)
    expect(events).toEqual([1])
    expect(collectPreviewHoles(rect(100, 100, 1000, 600))).toEqual([
      { x: 100, y: 20, w: 180, h: 220, r: 10 },
    ])

    r = rect(240, 140, 180, 220)
    notifyPreviewOverlays()
    expect(events).toEqual([1, 2])
    expect(collectPreviewHoles(rect(100, 100, 1000, 600))).toEqual([
      { x: 140, y: 40, w: 180, h: 220, r: 10 },
    ])

    off()
    expect(getPreviewOverlays()).toHaveLength(0)
    expect(collectPreviewHoles(rect(100, 100, 1000, 600))).toEqual([])
    expect(events).toEqual([1, 2, 3])
    unsub()
  })

  it('ignores zero-sized holes and skips hidden elements', () => {
    const offZero = registerPreviewHole('zero', () => rect(0, 0, 0, 100))
    const offAway = registerPreviewHole('away', () => rect(1500, 100, 100, 100))
    expect(collectPreviewHoles(rect(0, 0, 1000, 600))).toEqual([])
    offZero()
    offAway()
  })

  it('caps guides after overlays within PREVIEW_MAX_HOLES and hides preview when overlays exceed PREVIEW_MAX_OVERLAYS', () => {
    const cleanups: (() => void)[] = []
    cleanups.push(registerPreviewHole('ov-1', () => rect(10, 10, 100, 100)))
    for (let i = 0; i < 80; i++) {
      cleanups.push(
        registerPreviewHole(`g-${i}`, {
          target: () => rect(150 + i, 50, 2, 40),
          kind: 'guide',
        }),
      )
    }

    const holes = collectPreviewHoles(rect(0, 0, 1000, 600))
    expect(holes).not.toBeNull()
    expect(holes).toHaveLength(PREVIEW_MAX_HOLES)
    expect(holes![0]).toEqual({ x: 10, y: 10, w: 100, h: 100, r: 0 })

    for (let i = 2; i <= PREVIEW_MAX_OVERLAYS + 1; i++) {
      cleanups.push(registerPreviewHole(`ov-${i}`, () => rect(10 + i, 10, 20, 20)))
    }
    expect(collectPreviewHoles(rect(0, 0, 1000, 600))).toBeNull()

    for (const off of cleanups) off()
  })

  it('collapses a single non-guide overlay covering >85% of the stage into one full-stage hole, ignoring guides', () => {
    // A guide covering 95% (e.g. OverflowMask outer band) must NOT collapse the whole stage.
    const offGuide = registerPreviewHole('guide-big', {
      target: () => rect(0, 0, 960, 600),
      kind: 'guide',
    })
    const guideOnly = collectPreviewHoles(rect(0, 0, 1000, 600), 10)
    expect(guideOnly).toEqual([{ x: 0, y: 0, w: 960, h: 600, r: 0 }])
    offGuide()

    // A non-guide overlay covering >85% collapses to one full-stage hole (with edge padding).
    const offModal = registerPreviewHole('modal', () => rect(0, 0, 950, 560))
    const collapsed = collectPreviewHoles(rect(0, 0, 1000, 600), 10)
    expect(collapsed).toEqual([{ x: -10, y: -10, w: 1020, h: 620, r: 0 }])
    offModal()
  })

  it('exports the fc:preview-overlays event constant and snapshot shape', () => {
    expect(PREVIEW_OVERLAYS_EVENT).toBe('fc:preview-overlays')
    const off1 = registerPreviewHole('m', () => rect(5, 6, 40, 50))
    const off2 = registerPreviewHole('g', { target: () => rect(1, 2, 3, 4), kind: 'guide' })
    const snap = getPreviewOverlaySnapshot()
    expect(snap.overlayCount).toBe(1)
    expect(snap.guideCount).toBe(1)
    expect(snap.overlays).toHaveLength(2)
    expect(findUnregisteredPreviewOverlays()).toEqual([])
    off1()
    off2()
  })

  it('returns null when mandatory overlay holes alone exceed maxHoles', () => {
    const off1 = registerPreviewHole('ov-1', () => rect(10, 10, 40, 40))
    const off2 = registerPreviewHole('ov-2', () => rect(80, 10, 40, 40))
    expect(collectPreviewHoles(rect(0, 0, 1000, 600), 0, { maxHoles: 1 })).toBeNull()
    expect(collectPreviewHoles(rect(0, 0, 1000, 600), 0, { maxHoles: 2 })).toHaveLength(2)
    off1()
    off2()
  })
})
