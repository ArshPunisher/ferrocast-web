// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineItem, EngineStats } from '@ferrocast/api'
import {
  findUnregisteredPreviewOverlays,
  getPreviewOverlays,
  resetPreviewOverlayRegistry,
} from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { LayoutMenu } from './desk'
import { DockHeader, DockWorkspace } from './layout'
import { PausedCard } from './performance'
import { GuideOverlay, OverflowMask } from './preview-guides'
import { ScenesDock } from './scenes'
import { GroupBox, SnapOverlay, clearHints, setHints } from './snap-overlay'
import { SourcesDock } from './sources'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

function pointerEvt(type: string, opts: PointerEventInit & { buttons?: number } = {}) {
  const evt = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent & {
    clientX: number
    clientY: number
    button: number
    buttons: number
    pointerId: number
  }
  evt.clientX = opts.clientX ?? 0
  evt.clientY = opts.clientY ?? 0
  evt.button = opts.button ?? 0
  evt.buttons = opts.buttons ?? 1
  evt.pointerId = opts.pointerId ?? 1
  return evt
}

function makeDesk(overrides: Partial<Record<string, unknown>> = {}): Desk {
  const items: EngineItem[] = [
    {
      id: 1,
      name: 'Cam',
      kind: 'av_capture_input_v2',
      visible: true,
      locked: false,
      audio: false,
      group: false,
      children: [],
      blend: 'normal',
      scale_filter: 'off',
      own_filters: false,
    } as EngineItem,
  ]
  return {
    api: {
      moveScene: vi.fn(async () => undefined),
      reorderItems: vi.fn(async () => undefined),
      clipboard: vi.fn(async () => null),
      setItemTransition: vi.fn(async () => undefined),
      thumbnail: vi.fn(async () => null),
      screenshot: vi.fn(async () => ({ file: '/tmp/shot.png' })),
      stop: vi.fn(async () => ({ running: false })),
      paused: vi.fn(async () => ({ paused: false })),
      pausePreview: vi.fn(async () => undefined),
    },
    scenes: {
      data: {
        current: 'Gameplay',
        preview: null,
        vertical: null,
        scenes: [
          { name: 'Gameplay', current: true, preview: false, items: 1, transition: null },
          { name: 'BRB', current: false, preview: false, items: 0, transition: null },
        ],
      },
      set: vi.fn(),
      reload: vi.fn(),
      error: null,
      loading: false,
    },
    scene: 'Gameplay',
    canvas: 'main',
    setCanvas: vi.fn(),
    size: { width: 1920, height: 1080 },
    pictureScenes: [
      { name: 'Gameplay', current: true, preview: false, items: 1, transition: null },
      { name: 'BRB', current: false, preview: false, items: 0, transition: null },
    ],
    pictureCurrent: 'Gameplay',
    allScenes: [
      { name: 'Gameplay', current: true, preview: false, items: 1, transition: null },
      { name: 'BRB', current: false, preview: false, items: 0, transition: null },
    ],
    items: { data: items, set: vi.fn(), reload: vi.fn(), error: null, loading: false },
    audio: { data: [], set: vi.fn(), reload: vi.fn() },
    kinds: { data: null, set: vi.fn(), reload: vi.fn() },
    prefs: { data: null, set: vi.fn(), reload: vi.fn() },
    screens: { data: [], set: vi.fn(), reload: vi.fn() },
    stats: { stream: null, record: null } as unknown as EngineStats,
    selected: null,
    also: [],
    select: vi.fn(),
    togglePick: vi.fn(),
    edit: vi.fn(),
    itemMenu: { current: null },
    refresh: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  } as unknown as Desk
}

let root: Root | null = null

beforeEach(() => {
  localStorage.clear()
  resetPreviewOverlayRegistry()
  clearHints()
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1024)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  clearHints()
  resetPreviewOverlayRegistry()
  vi.restoreAllMocks()
})

describe('DockMenu portal, flip-up, and registry (M2)', () => {
  it('portals outside overflow-hidden dock, flips above near bottom edge, and registers', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DockWorkspace
          stage={<div />}
          docks={(id) => (id === 'audio' ? <DockHeader id="audio" /> : null)}
        />,
      ),
    )

    const dock = host.querySelector('[data-dock="audio"]')!
    const btn = dock.querySelector(
      'button[aria-label="Audio panel: move, pop out or hide"]',
    ) as HTMLButtonElement
    expect(btn).toBeTruthy()
    // Bottom dock header near y=540 in 1024x600 window: must portal & flip above!
    btn.getBoundingClientRect = () => rect(480, 540, 28, 28)

    await act(async () => btn.click())

    const menu = document.body.querySelector(
      '[role="menu"][aria-label="Audio panel"]',
    ) as HTMLElement
    expect(menu).toBeTruthy()
    expect(dock.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
    expect(parseFloat(menu.style.maxHeight)).toBeGreaterThan(0)
    expect(parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(540)
    expect(getPreviewOverlays().some((e) => e.target === menu)).toBe(true)
  })
})

describe('LayoutMenu portal and chrome-safe clamp (M3)', () => {
  it('portals to document.body, clamps height at 1024x600 between header and statusbar, and registers', async () => {
    const header = document.body.appendChild(document.createElement('header'))
    header.style.position = 'sticky'
    header.getBoundingClientRect = () => rect(0, 0, 1024, 56)

    const footer = document.body.appendChild(document.createElement('footer'))
    footer.setAttribute('aria-label', 'Studio status')
    footer.style.position = 'fixed'
    footer.getBoundingClientRect = () => rect(0, 572, 1024, 28)

    useLive.setState({ conn: { client: { request: vi.fn() } } as never })
    const desk = makeDesk()

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DeskProvider value={desk}>
          <DockWorkspace
            top={<LayoutMenu onStatus={vi.fn()} />}
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>,
      ),
    )

    const btn = host.querySelector('button[aria-label="Layout"]') as HTMLButtonElement
    btn.getBoundingClientRect = () => rect(960, 60, 32, 32)
    await act(async () => btn.click())

    const menu = document.body.querySelector('[role="menu"][aria-label="Layout"]') as HTMLElement
    expect(menu).toBeTruthy()
    expect(host.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
    // Available below trigger: 572 - 8 - (92 + 6) = 466.
    expect(parseFloat(menu.style.maxHeight)).toBeGreaterThan(0)
    expect(parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(466)
    expect(getPreviewOverlays().some((e) => e.target === menu)).toBe(true)
  })
})

describe('Scene and Source drag ghosts register with PreviewOverlayRegistry (M7)', () => {
  it('marks scene drag ghost with data-over-preview and registers it while dragging', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DeskProvider value={makeDesk()}>
          <DockWorkspace
            stage={<div />}
            docks={(id) => (id === 'scenes' ? <ScenesDock /> : null)}
          />
        </DeskProvider>,
      ),
    )

    const row = host.querySelector('[data-scene-name="Gameplay"]') as HTMLElement
    const btn = row.querySelector('button') as HTMLElement
    row.getBoundingClientRect = () => rect(0, 40, 200, 36)
    await act(async () => {
      btn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 54 }))
    })
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 88 }))
    })

    const ghost = host.querySelector('[data-scene-ghost]') as HTMLElement
    expect(ghost).toBeTruthy()
    expect(ghost.hasAttribute('data-over-preview')).toBe(true)
    expect(getPreviewOverlays().some((e) => e.target === ghost)).toBe(true)
  })

  it('marks source drag ghost with data-over-preview and registers it while dragging', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DeskProvider value={makeDesk()}>
          <DockWorkspace
            stage={<div />}
            docks={(id) => (id === 'sources' ? <SourcesDock /> : null)}
          />
        </DeskProvider>,
      ),
    )

    const row = host.querySelector('[data-item-id="1"]') as HTMLElement
    row.getBoundingClientRect = () => rect(0, 40, 200, 32)
    row.setPointerCapture = () => {}
    row.releasePointerCapture = () => {}
    await act(async () => {
      row.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50, buttons: 1 }))
    })
    await act(async () => {
      row.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 75, buttons: 1 }))
    })

    const ghost = host.querySelector('[data-source-ghost]') as HTMLElement
    expect(ghost).toBeTruthy()
    expect(ghost.hasAttribute('data-over-preview')).toBe(true)
    expect(getPreviewOverlays().some((e) => e.target === ghost)).toBe(true)
  })
})

describe('Guides, SnapOverlay, GroupBox, and PausedCard registry', () => {
  it('registers all guide and card overlays so findUnregisteredPreviewOverlays is empty', async () => {
    const stage = document.body.appendChild(document.createElement('div'))
    stage.setAttribute('data-stage-bg', '')
    stage.getBoundingClientRect = () => rect(0, 0, 1280, 720)

    const box = stage.appendChild(document.createElement('div'))
    box.getBoundingClientRect = () => rect(0, 0, 1280, 720)

    const host = stage.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DeskProvider value={makeDesk()}>
          <GuideOverlay safe={{ action: true, title: false, cross: true }} />
          <OverflowMask on />
          <SnapOverlay boxRef={{ current: box }} canvas={{ width: 1920, height: 1080 }} />
          <GroupBox
            rect={{ left: 100, top: 100, right: 500, bottom: 300 }}
            canvas={{ width: 1920, height: 1080 }}
          />
          <PausedCard />
        </DeskProvider>,
      ),
    )
    await act(async () => {
      setHints({
        owner: box,
        guides: [{ axis: 'x', from: 0, to: 1080, at: 960, kind: 'canvas' }],
        gaps: [{ axis: 'x', from: 100, to: 300, at: 200, px: 200 }],
        marquee: { left: 50, top: 50, right: 300, bottom: 200 },
      })
    })

    const nodes = [...host.querySelectorAll<HTMLElement>('[data-over-preview]')]
    expect(nodes.length).toBeGreaterThanOrEqual(10)
    for (const el of nodes) el.getBoundingClientRect = () => rect(20, 20, 40, 2)
    expect(getPreviewOverlays().filter((e) => e.kind === 'guide').length).toBeGreaterThanOrEqual(10)
    expect(findUnregisteredPreviewOverlays(stage)).toEqual([])
  })
})
