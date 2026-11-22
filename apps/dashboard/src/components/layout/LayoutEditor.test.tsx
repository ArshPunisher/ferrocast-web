import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { OverlayState, Widget } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { LayoutEditor } from './LayoutEditor'

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
