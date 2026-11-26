import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Overlay, OverlayState, Widget } from '@ferrocast/api'
import { useLive } from '../../lib/store'

const seenOverlays: Overlay[] = []

vi.mock('../AlertStage', () => ({
  OverlayPreview: ({ overlay }: { overlay: Overlay }) => {
    seenOverlays.push(overlay)
    return <div data-overlay-preview />
  },
}))

import { LayoutEditor } from './LayoutEditor'

let root: Root | null = null

const EMPTY_STATE: OverlayState = {
  goals: [],
  labels: {},
  viewers: {},
  events: [],
  chat: [],
  poll: null,
  giveaway: null,
}

describe('LayoutEditor OverlayPreview prop stability', () => {
  beforeEach(() => {
    seenOverlays.length = 0
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  it('keeps the same previewOverlay object reference across selection changes and wrapper object churn', async () => {
    const w1: Widget = {
      id: 'l-1',
      kind: 'layer',
      x: 100,
      y: 100,
      w: 300,
      h: 80,
      config: { type: 'text', text: 'One' },
    }
    const w2: Widget = {
      id: 'l-2',
      kind: 'layer',
      x: 100,
      y: 260,
      w: 300,
      h: 80,
      config: { type: 'text', text: 'Two' },
    }
    const widgets = [w1, w2]
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={true}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    expect(seenOverlays.length).toBeGreaterThanOrEqual(1)
    const firstRef = seenOverlays[0]

    // Clicking layers changes selection state inside LayoutEditor without changing widgets.
    const b1 = host.querySelector<HTMLElement>('[role="button"][aria-label^="Text: One"]')!
    const b2 = host.querySelector<HTMLElement>('[role="button"][aria-label^="Text: Two"]')!
    await act(async () => {
      b1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      b2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    // Re-rendering with a new outer layout wrapper object (like SceneDesigner) keeps same overlay ref.
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={true}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    expect(seenOverlays.length).toBeGreaterThanOrEqual(3)
    for (const ov of seenOverlays) {
      expect(ov).toBe(firstRef)
    }

    // Changing layout.widgets emits a new previewOverlay reference.
    const editedWidgets = [w1, { ...w2, x: 240 }]
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: editedWidgets }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={true}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )
    expect(seenOverlays.at(-1)).not.toBe(firstRef)
    expect(seenOverlays.at(-1)?.widgets).toBe(editedWidgets)
  })
})
