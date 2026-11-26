import { describe, expect, it } from 'vitest'
import { BUILTINS } from '@ferrocast/designs'
import { MAX_OVERLAY_WIDGETS, validateLayout, type Overlay, type ThemeDesign } from '@ferrocast/api'
import { addPartToOverlay, extractThemeParts } from './theme-parts'

const lofi = BUILTINS.find(
  (d): d is ThemeDesign => d.kind === 'theme' && d.id === 'builtin.lofi-loft',
)
if (!lofi) throw new Error('expected builtin.lofi-loft')

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
  it('extracts deduplicated functional widgets and skips decorative artwork layers', () => {
    const parts = extractThemeParts(lofi)
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => (p.widget as { kind: string }).kind !== 'layer')).toBe(true)

    const labels = parts.map((p) => p.label)
    expect(labels).toContain('Chat box')
    expect(labels).toContain('Goal bar')
    expect(labels).toContain('Alert box')
    expect(labels).toContain('Latest follower')
    expect(labels).toContain('Latest sub')
    // Duplicate label presets across screens are collapsed once.
    expect(labels.filter((l) => l === 'Latest follower')).toHaveLength(1)
  })
})

describe('addPartToOverlay', () => {
  it('scales coordinates proportionally to smaller or vertical overlays cleanly within validateLayout', () => {
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
    expect(validateLayout(updated.name, updated.width, updated.height, updated.widgets)).toBeNull()
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
