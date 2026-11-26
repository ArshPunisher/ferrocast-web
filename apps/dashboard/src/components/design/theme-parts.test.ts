import { describe, expect, it } from 'vitest'
import { BUILTINS } from '@ferrocast/designs'
import { MAX_OVERLAY_WIDGETS, validateLayout, type Overlay, type ThemeDesign } from '@ferrocast/api'
import { addPartToOverlay, extractThemeParts } from './theme-parts'

const lofi = BUILTINS.find(
  (d): d is ThemeDesign => d.kind === 'theme' && d.id === 'builtin.lofi-loft',
)
const tokyo = BUILTINS.find(
  (d): d is ThemeDesign => d.kind === 'theme' && d.id === 'builtin.tokyo-neon',
)
if (!lofi || !tokyo) throw new Error('expected builtin.lofi-loft and builtin.tokyo-neon')

function makeOverlay(overrides: Partial<Overlay> = {}): Overlay {
  return {
    id: 'ov-main',
    name: 'Main Overlay',
    url: 'http://127.0.0.1:4190/overlay/ov-main',
    width: 1920,
    height: 1080,
    widgets: [],
    updated_at: 1,
    design: null,
    ...overrides,
  }
}

describe('extractThemeParts', () => {
  it('extracts deduplicated functional widgets, excludes generic alert boxes, and keeps distinct layout geometries', () => {
    const parts = extractThemeParts(lofi)
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => (p.widget as { kind: string }).kind !== 'layer')).toBe(true)

    const labels = parts.map((p) => p.label)
    expect(labels).toContain('Chat box')
    expect(labels).toContain('Goal bar')
    expect(labels).not.toContain('Alert box')
    expect(labels).toContain('Latest follower')
    expect(labels).toContain('Latest sub')
    // Duplicate label presets across screens are collapsed once.
    expect(labels.filter((l) => l === 'Latest follower')).toHaveLength(1)

    // Distinct widget dimensions (e.g. Tokyo neon 380x360, 640x170, 640x116) stay separate.
    const tokyoEvents = extractThemeParts(tokyo).filter((p) => p.widget.kind === 'events')
    expect(tokyoEvents).toHaveLength(3)
  })

  it('keeps distinct wide geometries with the same variant while collapsing identical copies', () => {
    const baseEvent = extractThemeParts(tokyo).find((p) => p.widget.kind === 'events')!.widget
    const s0 = structuredClone(lofi.content.scenes[0]!)
    const s1 = structuredClone(lofi.content.scenes[1]!)
    const s2 = structuredClone(lofi.content.scenes[2]!)
    s0.layers = [{ ...structuredClone(baseEvent), id: 'ev-a', x: 0, y: 0, w: 600, h: 60 }]
    s1.layers = [{ ...structuredClone(baseEvent), id: 'ev-b', x: 0, y: 0, w: 300, h: 100 }]
    s2.layers = [{ ...structuredClone(baseEvent), id: 'ev-dup', x: 40, y: 40, w: 600, h: 60 }]
    const custom: ThemeDesign = {
      ...structuredClone(lofi),
      id: 'custom.wide-geometries',
      content: { scenes: [s0, s1, s2], alert_design: null },
    }
    const parts = extractThemeParts(custom)
    expect(parts.map((p) => [p.widget.w, p.widget.h])).toEqual([
      [600, 60],
      [300, 100],
    ])
  })
})

describe('addPartToOverlay', () => {
  it('scales coordinates uniformly to preserve aspect ratio on vertical overlays within validateLayout', () => {
    const parts = extractThemeParts(lofi)
    const chatPart = parts.find((p) => p.widget.kind === 'chat')!
    const vertical = makeOverlay({ id: 'ov-vert', name: 'Vertical', width: 720, height: 1280 })

    const updated = addPartToOverlay(vertical, chatPart, lofi)
    expect(updated.widgets).toHaveLength(1)
    const added = updated.widgets[0]!
    expect(added.kind).toBe('chat')
    expect(added.x).toBeGreaterThanOrEqual(0)
    expect(added.y).toBeGreaterThanOrEqual(0)
    expect(added.x + added.w).toBeLessThanOrEqual(720)
    expect(added.y + added.h).toBeLessThanOrEqual(1280)
    const origRatio = chatPart.widget.w / chatPart.widget.h
    const scaledRatio = added.w / added.h
    expect(Math.abs(scaledRatio - origRatio)).toBeLessThan(0.05)
    expect(validateLayout(updated.name, updated.width, updated.height, updated.widgets)).toBeNull()
  })

  it('applies one uniform scale for minimum dimensions when possible and refuses extreme aspect ratios instead of stretching', () => {
    const parts = extractThemeParts(lofi)
    const basePart = structuredClone(parts.find((p) => p.widget.kind === 'events')!)
    const vertical = makeOverlay({ id: 'ov-vert', name: 'Vertical', width: 720, height: 1280 })

    // 600x25 on 1920x1080 -> 720x1280: sx=0.375 would give h=9.375 (<20); uniform scale 0.8 gives 480x20.
    const fitPart = structuredClone(basePart)
    fitPart.sceneWidth = 1920
    fitPart.sceneHeight = 1080
    fitPart.widget.w = 600
    fitPart.widget.h = 25
    const fitted = addPartToOverlay(vertical, fitPart, lofi)
    const added = fitted.widgets[0]!
    expect([added.w, added.h]).toEqual([480, 20])
    expect(Math.abs(added.w / added.h - 600 / 25)).toBeLessThan(0.01)
    expect(validateLayout(fitted.name, fitted.width, fitted.height, fitted.widgets)).toBeNull()

    // 1000x20 on 1920x1080 -> 720x1280 cannot satisfy w<=720 and h>=20 uniformly without stretching.
    const extremePart = structuredClone(basePart)
    extremePart.sceneWidth = 1920
    extremePart.sceneHeight = 1080
    extremePart.widget.w = 1000
    extremePart.widget.h = 20
    expect(() => addPartToOverlay(vertical, extremePart, lofi)).toThrow(/cannot fit/i)
  })

  it('sets branded on built-in themes and strips stale branded flag on unbranded themes', () => {
    const parts = extractThemeParts(lofi)
    const chatPart = parts.find((p) => p.widget.kind === 'chat')!
    const withStaleBrand = structuredClone(chatPart)
    ;(withStaleBrand.widget.config as { branded?: boolean }).branded = true
    const brandedOut = addPartToOverlay(makeOverlay(), withStaleBrand, lofi)
    expect((brandedOut.widgets[0]!.config as { branded?: boolean }).branded).toBe(true)

    const unbrandedTheme: ThemeDesign = {
      ...structuredClone(lofi),
      id: 'custom.mine',
      built_in: false,
      branded: false,
    }
    const unbrandedOut = addPartToOverlay(makeOverlay(), withStaleBrand, unbrandedTheme)
    expect('branded' in unbrandedOut.widgets[0]!.config).toBe(false)
  })

  it('generates a collision-free widget id when the overlay already uses the base id', () => {
    const parts = extractThemeParts(lofi)
    const goalPart = parts.find((p) => p.widget.kind === 'goal')!
    const overlay = makeOverlay({
      widgets: [
        {
          ...structuredClone(goalPart.widget),
          id: goalPart.widget.id,
        },
      ],
    })

    const updated = addPartToOverlay(overlay, goalPart, lofi)
    expect(updated.widgets.map((w) => w.id)).toEqual([
      goalPart.widget.id,
      `${goalPart.widget.id}-2`,
    ])
    expect(validateLayout(updated.name, updated.width, updated.height, updated.widgets)).toBeNull()
  })

  it('refuses to exceed the 40-widget overlay cap', () => {
    const parts = extractThemeParts(lofi)
    const goalPart = parts[0]!
    const full = makeOverlay({
      widgets: Array.from({ length: MAX_OVERLAY_WIDGETS }, (_, i) => ({
        ...structuredClone(goalPart.widget),
        id: `w-${i}`,
      })),
    })

    expect(() => addPartToOverlay(full, goalPart, lofi)).toThrow(/40 widgets/)
  })
})
