import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { OverlayState, Widget } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { LayoutEditor, containSize } from './LayoutEditor'

let root: Root | null = null

const EMPTY_STATE: OverlayState = {
  goals: [],
  labels: {},
  viewers: { twitch: 0, youtube: 0, kick: 0 },
  events: [],
  chat: [],
  poll: null,
  giveaway: null,
}

describe('LayoutEditor full-canvas Emote wall pointer transparency (Problem 5)', () => {
  beforeEach(() => {
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

  it('does not block pointer events over underlying widgets when full-canvas Emote wall is on top', async () => {
    const labelWidget: Widget = {
      id: 'w-label',
      kind: 'label',
      x: 200,
      y: 200,
      w: 360,
      h: 80,
      config: {
        source: 'latest_follower',
        template: 'Latest: {value}',
        theme: 'molten',
      },
    }
    const emoteWall: Widget = {
      id: 'w-emote',
      kind: 'emote_wall',
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      config: {
        theme: 'molten',
        platforms: [],
        max_emotes: 40,
        size: 56,
        lifetime_s: 6,
        physics: 'bounce',
      },
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: [labelWidget, emoteWall] }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={false}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    const emoteBox = host.querySelector<HTMLElement>(
      '[role="button"][aria-label^="Emote wall widget"]',
    )!
    const labelBox = host.querySelector<HTMLElement>('[role="button"][aria-label^="Label widget"]')!
    expect(emoteBox).toBeTruthy()
    expect(labelBox).toBeTruthy()
    expect(emoteBox.className).toContain('pointer-events-none')

    await act(async () => {
      labelBox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    expect(labelBox.getAttribute('aria-pressed')).toBe('true')
    expect(emoteBox.getAttribute('aria-pressed')).toBe('false')
  })

  it('positions the widget tag above the widget when vertical clearance exists so live text stays uncovered', async () => {
    const labelWidget: Widget = {
      id: 'w-label',
      kind: 'label',
      x: 200,
      y: 400,
      w: 420,
      h: 64,
      config: {
        source: 'latest_follower',
        template: 'Latest: {value}',
        theme: 'molten',
      },
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: [labelWidget] }}
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

    const labelBox = host.querySelector<HTMLElement>('[role="button"][aria-label^="Label widget"]')!
    await act(async () => {
      labelBox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const tag = host.querySelector<HTMLElement>('[data-widget-tag="w-label"]')
    expect(tag).not.toBeNull()
    expect(tag!.className).toContain('bottom-[calc(100%+4px)]')
    expect(tag!.className).not.toContain('top-1')
  })
})

describe('LayoutEditor steady containSize & single inspector scroller (Group A)', () => {
  beforeEach(() => {
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

  it('containSize scales 16:9 wide/tall boxes, 9:16 portrait overlays, and guards zero boxes', () => {
    expect(containSize(0, 500, 1920, 1080)).toBeNull()
    expect(containSize(800, 0, 1920, 1080)).toBeNull()
    expect(containSize(-10, 400, 1920, 1080)).toBeNull()

    // Wide box (1200x400) constrains 16:9 by height -> 711x400
    const wide = containSize(1200, 400, 1920, 1080)!
    expect(wide.height).toBe(400)
    expect(wide.width).toBe(Math.floor((1920 * 400) / 1080))
    expect(wide.scale).toBeCloseTo(400 / 1080, 5)

    // Tall narrow box (640x700) constrains 16:9 by width -> 640x360
    const tall = containSize(640, 700, 1920, 1080)!
    expect(tall.width).toBe(640)
    expect(tall.height).toBe(360)
    expect(tall.scale).toBeCloseTo(640 / 1920, 5)

    // Portrait 9:16 overlay (1080x1920) inside 800x600 box constrains by height -> 337x600
    const portrait = containSize(800, 600, 1080, 1920)!
    expect(portrait.height).toBe(600)
    expect(portrait.width).toBe(Math.floor((1080 * 600) / 1920))
    expect(portrait.scale).toBeCloseTo(600 / 1920, 5)
  })

  it('renders no nested overflow-y-auto or max-h-72 inside the Inspector when a layer is selected', async () => {
    const textLayer: Widget = {
      id: 'l-text',
      kind: 'layer',
      x: 100,
      y: 100,
      w: 500,
      h: 100,
      config: { type: 'text', text: 'Hello' },
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: [textLayer] }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={false}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    const layerBtn = host.querySelector<HTMLElement>('[role="button"][aria-label^="Text: Hello"]')!
    await act(async () => {
      layerBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    const inspector = host.querySelector('aside[aria-label="Inspector"]')!
    expect(inspector).toBeTruthy()
    const nestedScrollers = inspector.querySelectorAll(
      '[class*="overflow-y-auto"], [class*="max-h-72"]',
    )
    expect(nestedScrollers).toHaveLength(0)
  })
})
