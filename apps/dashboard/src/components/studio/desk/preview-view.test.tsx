// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeskProvider } from './common'
import { useLive } from '../../../lib/store'
import { HOLES_CHANGED } from './snap-overlay'
import { PerformanceToggle } from './performance'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  PreviewBox,
  StageBar,
  clampPan,
  clampZoom,
  fitBoxSize,
  getPreviewView,
  pixelZoomForStage,
  scrollPan,
  setStageSize,
  stripeOf,
  useStageEdit,
  usePreviewView,
  zoomAt,
  zoomBoundsPan,
} from './preview'
import { GuideOverlay, OverflowMask, guideLines } from './preview-guides'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('zoom maths', () => {
  it('keeps the point under the pointer where it is', () => {
    const z = zoomAt(1, [0, 0], 2, [100, 50])
    expect(z.zoom).toBe(2)
    // The point 100 right of the centre is still 100 right of it after doubling.
    expect(z.pan).toEqual([-100, -50])
    // And out again returns to the start.
    const back = zoomAt(z.zoom, z.pan, 0.5, [100, 50])
    expect(back.zoom).toBe(1)
    expect(back.pan[0]).toBeCloseTo(0)
    expect(back.pan[1]).toBeCloseTo(0)
  })
  it('stops at the limits', () => {
    expect(zoomAt(3, [0, 0], 10, [0, 0]).zoom).toBe(ZOOM_MAX)
    expect(zoomAt(0.3, [0, 0], 0.01, [0, 0]).zoom).toBe(ZOOM_MIN)
    expect(clampZoom(99)).toBe(ZOOM_MAX)
  })
  it('computes fit box size and 100% pixel scale purely from stage dimensions', () => {
    expect(fitBoxSize(800, 600)).toEqual({ width: 800, height: 450 })
    expect(fitBoxSize(1600, 450)).toEqual({ width: 800, height: 450 })
    expect(fitBoxSize(0, 450)).toEqual({ width: 0, height: 0 })

    expect(pixelZoomForStage(1920, 800)).toBeCloseTo(2.4)
    expect(pixelZoomForStage(3840, 600)).toBe(ZOOM_MAX)
    expect(pixelZoomForStage(1920, 0)).toBeNull()
    expect(pixelZoomForStage(0, 800)).toBeNull()
  })
  it('clamps pan and scroll within the overflow area and stays centred when fitting', () => {
    const stage = { width: 800, height: 450 }
    const fit = fitBoxSize(stage.width, stage.height)
    expect(zoomBoundsPan(1, fit, stage)).toEqual([0, 0])
    expect(zoomBoundsPan(0.5, fit, stage)).toEqual([0, 0])
    expect(zoomBoundsPan(2, fit, stage)).toEqual([400, 225])

    expect(clampPan([500, -300], [400, 225])).toEqual([400, -225])
    expect(clampPan([-0, -0], [0, 0])).toEqual([0, 0])

    // Wheel scrolling down/right moves canvas left/up (negative pan) within bounds.
    expect(scrollPan([0, 0], [120, 80], [400, 225])).toEqual([-120, -80])
    expect(scrollPan([-350, -200], [120, 80], [400, 225])).toEqual([-400, -225])
    // When canvas fits, scrolling leaves it centred.
    expect(scrollPan([40, -20], [120, 80], [0, 0])).toEqual([0, 0])

    // Zooming out back to Fit clears any leftover pan offset.
    const zoomedOut = zoomAt(2, [300, -180], 0.5, [100, 50], { fit, stage })
    expect(zoomedOut.zoom).toBe(1)
    expect(zoomedOut.pan).toEqual([0, 0])
  })
})

describe('the stripes round the canvas', () => {
  const stage = (value: string) => {
    const el = document.createElement('div')
    document.body.append(el)
    el.style.setProperty('--fc-stage-b', value)
    return el
  }
  it('the second stripe colour is the theme’s, as 0xRRGGBB', () => {
    expect(stripeOf(stage('#dcdfe6'))).toBe(0xdcdfe6)
    expect(stripeOf(stage(' #121418 '))).toBe(0x121418)
  })
  it('is left out when the theme names none, or something that isn’t a hex colour', () => {
    expect(stripeOf(document.createElement('div'))).toBeUndefined()
    expect(stripeOf(stage('rgb(1 2 3)'))).toBeUndefined()
    expect(stripeOf(stage('#fff'))).toBeUndefined()
    expect(stripeOf(null)).toBeUndefined()
  })
})

describe('guides', () => {
  it('lists the lines of each guide as a share of the canvas', () => {
    expect(guideLines({ action: false, title: false, cross: false })).toEqual([])
    const a = guideLines({ action: true, title: false, cross: false })
    expect(a).toHaveLength(4)
    // EBU R95: action safe is the inner 93%, so 3.5% in from each side.
    const top = a.find((l) => l.key === 'action-t')
    expect(top?.top).toBeCloseTo(3.5)
    expect(top?.width).toBeCloseTo(93)
    const t = guideLines({ action: false, title: true, cross: false })
    expect(t.find((l) => l.key === 'title-l')?.left).toBeCloseTo(5)
    const all = guideLines({ action: true, title: true, cross: true })
    expect(all).toHaveLength(10)
    expect(all.find((l) => l.key === 'cross-h')).toMatchObject({ top: 50, width: 100 })
  })
  it('draws them as marks the app leaves its picture out under, and never takes a click', () => {
    const html = renderToStaticMarkup(
      <GuideOverlay safe={{ action: true, title: false, cross: true }} />,
    )
    expect(html.match(/data-over-preview/g)).toHaveLength(6)
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('aria-hidden')
    expect(
      renderToStaticMarkup(<GuideOverlay safe={{ action: false, title: false, cross: false }} />),
    ).toBe('')
  })
  it('hides what runs past the canvas with four stage-coloured panels, only when asked', () => {
    expect(renderToStaticMarkup(<OverflowMask on={false} />)).toBe('')
    const html = renderToStaticMarkup(<OverflowMask on />)
    expect(html.match(/data-over-preview/g)).toHaveLength(4)
    expect(html).toContain('--fc-stage')
  })
})

describe('the preview view store', () => {
  it('keeps lock, guides and overflow for this viewer, but not where it was panned to', async () => {
    localStorage.clear()
    vi.resetModules()
    const m = await import('./preview')
    let set: ReturnType<typeof m.usePreviewView>[1] | null = null
    function Probe() {
      set = m.usePreviewView()[1]
      return null
    }
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<Probe />))
    act(() => {
      set?.({
        locked: true,
        safe: { action: true, title: false, cross: true },
        overflow: 'hide',
        zoom: 2,
        pan: [30, 40],
      })
    })
    const kept = JSON.parse(localStorage.getItem('fc-preview-view') ?? '{}')
    expect(kept).toMatchObject({
      locked: true,
      overflow: 'hide',
      zoom: 2,
      safe: { action: true, cross: true },
    })
    expect(kept.pan).toBeUndefined()
    // A new session reads them back, centred.
    vi.resetModules()
    const again = await import('./preview')
    expect(again.getPreviewView()).toMatchObject({
      locked: true,
      overflow: 'hide',
      zoom: 2,
      pan: [0, 0],
    })
    act(() => root.unmount())
  })
})

// ---- The toolbar and the stage's pointer handling, on a faked desk ----

const nop: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === 'then' ? undefined : nop),
  apply: () => nop,
})

function fakeDesk(over: Record<string, unknown> = {}) {
  const api = {
    setItemBox: vi.fn(async () => ({})),
    setItemBoxes: vi.fn(async () => []),
    setItemCrop: vi.fn(async () => ({})),
    transform: vi.fn(async () => ({
      x: 0,
      y: 0,
      rotation: 0,
      scale_x: 1,
      scale_y: 1,
      alignment: 5,
      bounds: 'stretch',
      bounds_alignment: 5,
      bounds_width: 1920,
      bounds_height: 1080,
      crop_left: 0,
      crop_top: 0,
      crop_right: 0,
      crop_bottom: 0,
      width: 1920,
      height: 1080,
    })),
    setTransform: vi.fn(async () => ({})),
    select: vi.fn(async () => ({})),
    previewCursor: vi.fn(async () => ({})),
    previewPaused: vi.fn(async () => ({ paused: false })),
    setPreviewPaused: vi.fn(async (paused: boolean) => ({ paused })),
  }
  const base = {
    api,
    scene: 'Main',
    scenes: {
      data: { transition: { kind: 'cut_transition', ms: 0 }, vertical: null, preview: null },
      reload() {},
    },
    kinds: { data: { transitions: [] } },
    openSettings() {},
    screens: { data: [], reload() {} },
    refresh() {},
    size: { width: 1920, height: 1080 },
    stats: { canvas: { width: 1920, height: 1080, fps: 60 }, history: { undo: null, redo: null } },
    items: {
      data: [
        {
          id: 1,
          name: 'Cam',
          frame: [1920, 0, 0, 1080, 0, 0],
          visible: true,
          locked: false,
          children: [],
        },
      ],
      set() {},
    },
    selected: 1,
    also: [],
    select() {},
    pickMore() {},
    setTransforming() {},
    prefs: { data: {} },
    itemMenu: { current: null },
    flat: [],
  }
  const t = { ...base, ...over }
  return {
    api,
    desk: new Proxy(t, { get: (o: Record<string, unknown>, k: string) => (k in o ? o[k] : nop) }),
  }
}

describe('the preview toolbar', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    let set: ReturnType<typeof usePreviewView>[1] | null = null
    function P() {
      set = usePreviewView()[1]
      return null
    }
    const h = document.createElement('div')
    const r = createRoot(h)
    act(() => r.render(<P />))
    act(() =>
      set?.({
        locked: false,
        zoom: 1,
        pan: [0, 0],
        overflow: 'show',
        safe: { action: false, title: false, cross: false },
      }),
    )
    act(() => r.unmount())
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const mount = async () => {
    const { desk } = fakeDesk()
    await act(async () =>
      root.render(
        <DeskProvider value={desk as never}>
          <StageBar />
        </DeskProvider>,
      ),
    )
  }
  const byLabel = (label: string | RegExp) =>
    [...host.querySelectorAll<HTMLElement>('[aria-label]')].find((e) =>
      typeof label === 'string'
        ? e.getAttribute('aria-label') === label
        : label.test(e.getAttribute('aria-label') ?? ''),
    )

  it('locks and unlocks the preview from a button with a clear name', async () => {
    await mount()
    const lock = byLabel(/^Lock the preview/)
    expect(lock?.getAttribute('aria-pressed')).toBe('false')
    await act(async () => lock?.click())
    expect(getPreviewView().locked).toBe(true)
    const unlock = byLabel(/^Unlock the preview/)
    expect(unlock?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => unlock?.click())
    expect(getPreviewView().locked).toBe(false)
  })

  it('has a performance mode button that pauses the preview and says so, and resumes', async () => {
    const { api, desk } = fakeDesk()
    await act(async () =>
      root.render(
        <DeskProvider value={desk as never}>
          <StageBar />
        </DeskProvider>,
      ),
    )
    const pause = byLabel(/^Pause the preview to save power/)
    expect(pause?.getAttribute('aria-pressed')).toBe('false')
    await act(async () => pause?.click())
    expect(api.setPreviewPaused).toHaveBeenLastCalledWith(true)
    const resume = byLabel('Resume the preview')
    expect(resume?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => resume?.click())
    expect(api.setPreviewPaused).toHaveBeenLastCalledWith(false)
    expect(byLabel(/^Pause the preview to save power/)?.getAttribute('aria-pressed')).toBe('false')
  })

  it('zooms in and out by buttons, resets with Fit, and stops at the limits', async () => {
    await mount()
    await act(async () => byLabel(/^Zoom in/)?.click())
    expect(getPreviewView().zoom).toBeCloseTo(1.25)
    await act(async () => byLabel(/^Zoom out/)?.click())
    expect(getPreviewView().zoom).toBeCloseTo(1)
    await act(async () => byLabel('Zoom 50%')?.click())
    expect(getPreviewView().zoom).toBe(0.5)
    await act(async () => byLabel(/^Fit the canvas/)?.click())
    expect(getPreviewView()).toMatchObject({ zoom: 1, pan: [0, 0] })
    // Canvas pixels need the box on the page: off until there is one.
    expect((byLabel(/canvas pixels/) as HTMLButtonElement | undefined)?.disabled).toBe(true)
  })

  it('has a Guides button whose menu toggles the safe areas, the cross and the overflow', async () => {
    await mount()
    const guides = byLabel(/^Guides:/)
    expect(guides?.getAttribute('aria-haspopup')).toBe('menu')
    const open = async () => act(async () => guides?.click())
    const pick = async (text: string) => {
      await open()
      const row = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((e) =>
        e.textContent?.includes(text),
      )
      expect(row, text).toBeTruthy()
      await act(async () => row?.click())
    }
    await pick('Action safe area')
    expect(getPreviewView().safe.action).toBe(true)
    await pick('Title safe area')
    await pick('Centre cross')
    expect(getPreviewView().safe).toEqual({ action: true, title: true, cross: true })
    await pick('Hide what runs past the canvas')
    expect(getPreviewView().overflow).toBe('hide')
    await pick('Show what runs past the canvas')
    expect(getPreviewView().overflow).toBe('show')
  })

  it('spells out labels when PerformanceToggle and StageBar controls move into More tools', async () => {
    const { desk } = fakeDesk()
    await act(async () =>
      root.render(
        <DeskProvider value={desk as never}>
          <PerformanceToggle panel />
        </DeskProvider>,
      ),
    )
    expect(host.textContent).toContain('Performance mode')
  })
})

describe('the stage: lock, pan and pinch', () => {
  let root: Root
  let host: HTMLDivElement
  const items = [
    {
      id: 1,
      name: 'Cam',
      frame: [1920, 0, 0, 1080, 0, 0],
      visible: true,
      locked: false,
      children: [],
    },
  ]
  function Stage() {
    const ref = useRef<HTMLDivElement | null>(null)
    const handlers = useStageEdit(ref, true)
    return <div ref={ref} data-stage tabIndex={0} {...handlers} />
  }
  beforeEach(() => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const setView = (v: Parameters<ReturnType<typeof usePreviewView>[1]>[0]) => {
    let set: ReturnType<typeof usePreviewView>[1] | null = null
    function P() {
      set = usePreviewView()[1]
      return null
    }
    const h = document.createElement('div')
    const r = createRoot(h)
    act(() => r.render(<P />))
    act(() => set?.(v))
    act(() => r.unmount())
  }
  const mount = async (
    locked: boolean,
    apiOver: Record<string, unknown> = {},
    deskOver: Record<string, unknown> = {},
  ) => {
    setView({ locked, zoom: 1, pan: [0, 0] })
    const initialList = (deskOver.items as { data?: typeof items } | undefined)?.data ?? items
    const { api, desk } = fakeDesk({
      items: { data: initialList, set() {} },
      flat: initialList,
      ...deskOver,
    })
    Object.assign(api, apiOver)
    await act(async () =>
      root.render(
        <DeskProvider value={desk as never}>
          <Stage />
        </DeskProvider>,
      ),
    )
    const el = host.querySelector<HTMLElement>('[data-stage]') as HTMLElement
    el.setPointerCapture = () => {}
    el.releasePointerCapture = () => {}
    el.hasPointerCapture = () => false
    const rerender = async (nextDeskOver: Record<string, unknown>) => {
      const next = { ...desk, ...nextDeskOver }
      await act(async () =>
        root.render(
          <DeskProvider value={next as never}>
            <Stage />
          </DeskProvider>,
        ),
      )
    }
    return { api, el, rerender }
  }
  const pointer = (
    type: string,
    init: { id?: number; button?: number; x?: number; y?: number; kind?: string },
  ) => {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: init.button ?? 0,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
    })
    Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 })
    Object.defineProperty(e, 'pointerType', { value: init.kind ?? 'mouse' })
    return e
  }
  const key = (
    el: HTMLElement,
    type: 'keydown' | 'keyup',
    k: string,
    mods: KeyboardEventInit = {},
  ) =>
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...mods }),
      )
    })

  it('nudges a picked source with the arrow keys, but not while the preview is locked', async () => {
    let { api, el } = await mount(false)
    key(el, 'keydown', 'ArrowRight')
    expect(api.setItemBox).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    root = createRoot(host)
    ;({ api, el } = await mount(true))
    key(el, 'keydown', 'ArrowRight')
    key(el, 'keydown', 'ArrowLeft', { shiftKey: true })
    expect(api.setItemBox).not.toHaveBeenCalled()
  })

  it('pans with space held and a drag, and with the middle button', async () => {
    const { el } = await mount(false)
    key(el, 'keydown', ' ')
    expect(el.style.cursor).toBe('grab')
    act(() => void el.dispatchEvent(pointer('pointerdown', { x: 100, y: 100 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 130, y: 80 })))
    expect(getPreviewView().pan).toEqual([30, -20])
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 130, y: 80 })))
    key(el, 'keyup', ' ')
    expect(el.style.cursor).toBe('')
    // The middle button pans without space, carrying on from where it was.
    act(() => void el.dispatchEvent(pointer('pointerdown', { button: 1, x: 0, y: 0 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { button: 1, x: 5, y: 5 })))
    expect(getPreviewView().pan).toEqual([35, -15])
    act(() => void el.dispatchEvent(pointer('pointerup', { button: 1 })))
  })

  it('reconciles stored pan when the stage shrinks so dragging left moves immediately', async () => {
    const { el } = await mount(false)
    try {
      act(() => setStageSize({ width: 800, height: 450 }))
      key(el, 'keydown', '=', { ctrlKey: true })
      key(el, 'keydown', '=', { ctrlKey: true })
      act(() => void el.dispatchEvent(pointer('pointerdown', { button: 1, x: 0, y: 0 })))
      act(() => void el.dispatchEvent(pointer('pointermove', { button: 1, x: 500, y: 0 })))
      act(() => void el.dispatchEvent(pointer('pointerup', { button: 1 })))
      const zoomed = getPreviewView().zoom
      const fitBefore = fitBoxSize(800, 450)
      const maxBefore = zoomBoundsPan(zoomed, fitBefore, { width: 800, height: 450 })
      expect(getPreviewView().pan[0]).toBeCloseTo(maxBefore[0], 1)

      // Shrink the stage: stored pan reconciles immediately to the smaller bounds.
      act(() => setStageSize({ width: 400, height: 225 }))
      const maxAfter = zoomBoundsPan(zoomed, fitBoxSize(400, 225), { width: 400, height: 225 })
      expect(getPreviewView().pan[0]).toBeCloseTo(maxAfter[0], 1)

      // A 10 px left drag moves immediately instead of fighting stale pan headroom.
      act(() => void el.dispatchEvent(pointer('pointerdown', { button: 1, x: 100, y: 0 })))
      act(() => void el.dispatchEvent(pointer('pointermove', { button: 1, x: 90, y: 0 })))
      act(() => void el.dispatchEvent(pointer('pointerup', { button: 1 })))
      expect(getPreviewView().pan[0]).toBeCloseTo(maxAfter[0] - 10, 1)
    } finally {
      act(() => {
        setStageSize(null)
        key(el, 'keydown', '0', { ctrlKey: true })
      })
    }
  })

  it('zooms with the keys and by pinching with two fingers, and does not drag a source then', async () => {
    const { api, el } = await mount(false)
    key(el, 'keydown', '=', { ctrlKey: true })
    expect(getPreviewView().zoom).toBeCloseTo(1.25)
    key(el, 'keydown', '-', { metaKey: true })
    expect(getPreviewView().zoom).toBeCloseTo(1)
    key(el, 'keydown', '0', { ctrlKey: true })
    expect(getPreviewView()).toMatchObject({ zoom: 1, pan: [0, 0] })
    // Two touches 100 px apart move to 200 px apart: twice the zoom.
    act(() => void el.dispatchEvent(pointer('pointerdown', { id: 1, kind: 'touch', x: -50, y: 0 })))
    act(() => void el.dispatchEvent(pointer('pointerdown', { id: 2, kind: 'touch', x: 50, y: 0 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { id: 2, kind: 'touch', x: 150, y: 0 })))
    expect(getPreviewView().zoom).toBeCloseTo(2, 1)
    act(() => void el.dispatchEvent(pointer('pointerup', { id: 2, kind: 'touch' })))
    act(() => void el.dispatchEvent(pointer('pointerup', { id: 1, kind: 'touch' })))
    expect(api.setItemBox).not.toHaveBeenCalled()
  })

  it('switches immediately between resize arrows and crop cursor on Alt press/release without pointer move', async () => {
    const { el } = await mount(false)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    // Item 1 is [1920, 0, 0, 1080, 0, 0]; left-middle handle is at (0, 540).
    act(() => void el.dispatchEvent(pointer('pointerenter', { x: 0, y: 540 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 0, y: 540 })))
    expect(el.style.cursor).toBe('ew-resize')

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }),
      )
    })
    expect(el.style.cursor).toContain('url("data:image/svg+xml,')
    expect(el.style.cursor).toContain('ew-resize')
    expect(el.style.cursor).not.toBe('crosshair')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false, bubbles: true }))
    })
    expect(el.style.cursor).toBe('ew-resize')

    // Hovering inside item (960, 540) keeps move cursor even when Alt is held.
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 960, y: 540 })))
    expect(el.style.cursor).toBe('move')
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }),
      )
    })
    expect(el.style.cursor).toBe('move')
  })

  it('crops left edge inward via api.setItemCrop (save:false on move, save:true on release, never setTransform)', async () => {
    const { api, el } = await mount(false, {
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number },
        ) => ({
          id,
          frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
        }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    // Wait for api.transform() to resolve.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const move = pointer('pointermove', { x: 150, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 150,
      top: 0,
      right: 0,
      bottom: 0,
      save: false,
    })

    act(() => void el.dispatchEvent(pointer('pointerup', { x: 150, y: 540 })))
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenLastCalledWith('Main', 1, {
      left: 150,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
    expect(api.setTransform).not.toHaveBeenCalled()
  })

  it('keeps deferred Alt-drag crop ordered ahead of ArrowRight nudge via setItemCrop', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const transformPromise = new Promise<Record<string, unknown>>((r) => {
      resolveTransform = r
    })
    const { api, el } = await mount(false, {
      transform: vi.fn(() => transformPromise),
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number },
        ) => ({
          id,
          frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
        }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    // Release before api.transform() resolves, then immediately nudge +1 px right.
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    await act(async () => {
      resolveTransform({
        x: 0,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920,
        bounds_height: 1080,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
    expect(api.setItemBox).toHaveBeenCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 101, y: 0, w: 1820, h: 1080, save: true }),
    )
    expect(api.setTransform).not.toHaveBeenCalled()
  })

  it('orders a fast Alt-drag crop ahead of a subsequent regular move drag (H8)', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const transformPromise = new Promise<Record<string, unknown>>((r) => {
      resolveTransform = r
    })
    const order: string[] = []
    const { api, el } = await mount(false, {
      transform: vi.fn(() => transformPromise),
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number; save?: boolean },
        ) => {
          order.push(`crop:${c.left}:${String(c.save)}`)
          return {
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          }
        },
      ),
      setItemBox: vi.fn(
        async (_scene: string, id: number, b: { x: number; y: number; w: number; h: number }) => {
          order.push(`box:${b.x}:${b.w}`)
          return { id, frame: [b.w, 0, 0, b.h, b.x, b.y] }
        },
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // 1. Fast Alt+drag left handle by +100px and release before transform() resolves.
    const altDown = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(altDown, 'altKey', { value: true })
    act(() => void el.dispatchEvent(altDown))
    const altMove = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(altMove, 'altKey', { value: true })
    act(() => void el.dispatchEvent(altMove))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    // 2. Immediately do a regular move drag (no Alt) inside the item by (+20, 0) while transform is still pending.
    act(() => void el.dispatchEvent(pointer('pointerdown', { x: 400, y: 540 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 420, y: 540 })))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 420, y: 540 })))

    await act(async () => {
      resolveTransform({
        x: 0,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920,
        bounds_height: 1080,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(order[0]).toBe('crop:100:true')
    const boxCall = api.setItemBox.mock.calls.at(-1) as unknown as [
      string,
      number,
      { x: number; y: number; w: number; h: number; save?: boolean },
    ]
    // Must keep post-crop width 1820 and start moving from post-crop x=100 -> 120, never pre-crop 1920!
    expect(boxCall[2]).toMatchObject({ x: 120, y: 0, w: 1820, h: 1080, save: true })
  })

  it('aborts an in-progress Alt-drag crop via setItemCrop targeting the drag scene', async () => {
    const { api, el } = await mount(false, {
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number },
        ) => ({
          id,
          frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
        }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const move = pointer('pointermove', { x: 150, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenLastCalledWith('Main', 1, {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
  })

  it('completes a deferred Alt-drag crop via setItemCrop and preserves nudge if transform read fails', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const first = mount(false, {
      transform: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((r) => {
            resolveTransform = r
          }),
      ),
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number },
        ) => ({
          id,
          frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
        }),
      ),
    })
    const { api, el } = await first
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    await act(async () => {
      resolveTransform({
        x: 0,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920,
        bounds_height: 1080,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })

    // Failure path: if transform() rejects after ArrowRight, the nudge still applies.
    let rejectTransform!: (e: Error) => void
    const second = await mount(false, {
      transform: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((_r, rej) => {
            rejectTransform = rej
          }),
      ),
    })
    vi.spyOn(second.el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    const down2 = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down2, 'altKey', { value: true })
    act(() => void second.el.dispatchEvent(down2))
    const move2 = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move2, 'altKey', { value: true })
    act(() => void second.el.dispatchEvent(move2))
    act(() => void second.el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    act(() => {
      second.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    await act(async () => {
      rejectTransform(new Error('network'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(second.api.setItemCrop).not.toHaveBeenCalled()
    expect(second.api.setItemBox).toHaveBeenCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 1, y: 0, w: 1920, h: 1080, save: true }),
    )
  })

  it('keeps pending crop active until setItemCrop settles so an in-flight ArrowRight nudge keeps cropped width', async () => {
    let resolveCrop!: (v: Record<string, unknown>) => void
    const { api, el } = await mount(false, {
      setItemCrop: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((r) => {
            resolveCrop = r
          }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    // Advance microtasks so cropRead resolves and api.setItemCrop is actively in flight.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenCalledTimes(1)

    // Nudge while setItemCrop is still in flight: must wait instead of overwriting cropped width.
    key(el, 'keydown', 'ArrowRight')
    expect(api.setItemBox).not.toHaveBeenCalled()

    await act(async () => {
      resolveCrop({ id: 1, frame: [1820, 0, 0, 1080, 100, 0] })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.setItemBox).toHaveBeenLastCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 101, y: 0, w: 1820, h: 1080, save: true }),
    )
  })

  it('preserves settled crop geometry when multi-selecting and dragging multiple sources immediately after deferred crop', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const multiItems = [
      {
        id: 1,
        name: 'Cam',
        frame: [1920, 0, 0, 1080, 0, 0],
        visible: true,
        locked: false,
        children: [],
      },
      {
        id: 2,
        name: 'Overlay',
        frame: [400, 0, 0, 200, 50, 50],
        visible: true,
        locked: false,
        children: [],
      },
    ]
    const { api, el, rerender } = await mount(
      false,
      {
        transform: vi.fn(
          () =>
            new Promise<Record<string, unknown>>((r) => {
              resolveTransform = r
            }),
        ),
        setItemCrop: vi.fn(
          async (
            _scene: string,
            id: number,
            c: { left: number; top: number; right: number; bottom: number },
          ) => ({
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          }),
        ),
      },
      { items: { data: multiItems, set() {} }, flat: multiItems },
    )
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // 1. Alt+drag crops left edge by 100px while transform() is still pending.
    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    // 2. Multi-select item 2 and drag both items by (dx: 50, dy: 20) before crop resolves.
    await rerender({ also: [2] })
    act(() => void el.dispatchEvent(pointer('pointerdown', { x: 600, y: 600 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 650, y: 620 })))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 650, y: 620 })))

    // 3. Resolve transform() so crop settles first, then multi-source drag runs with cropped geometry.
    await act(async () => {
      resolveTransform({
        x: 0,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920,
        bounds_height: 1080,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })

    expect(api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
    expect(api.setItemBoxes).toHaveBeenLastCalledWith('Main', {
      items: [
        { id: 1, x: 150, y: 20, w: 1820, h: 1080 },
        { id: 2, x: 100, y: 70, w: 400, h: 200 },
      ],
      save: true,
    })
  })

  it('applies queued ArrowRight postShift onto pre-crop frame if setItemCrop rejects', async () => {
    let rejectCrop!: (err: Error) => void
    const { api, el } = await mount(false, {
      setItemCrop: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((_r, rej) => {
            rejectCrop = rej
          }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    key(el, 'keydown', 'ArrowRight')
    expect(api.setItemBox).not.toHaveBeenCalled()

    await act(async () => {
      rejectCrop(new Error('crop rejected'))
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })

    expect(api.setItemBox).toHaveBeenCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 1, y: 0, w: 1920, h: 1080, save: true }),
    )
  })

  it('clears stale lastAfterCrop when companion source crop finishes mid-drag so final displacement wins', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const multiItems = [
      {
        id: 1,
        name: 'Cam',
        frame: [400, 0, 0, 200, 600, 600],
        visible: true,
        locked: false,
        children: [],
      },
      {
        id: 2,
        name: 'Bg',
        frame: [1920, 0, 0, 1080, 0, 0],
        visible: true,
        locked: false,
        children: [],
      },
    ]
    const { api, el, rerender } = await mount(
      false,
      {
        transform: vi.fn(
          () =>
            new Promise<Record<string, unknown>>((r) => {
              resolveTransform = r
            }),
        ),
        setItemCrop: vi.fn(
          async (
            _scene: string,
            id: number,
            c: { left: number; top: number; right: number; bottom: number },
          ) => ({
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          }),
        ),
      },
      { items: { data: multiItems, set() {} }, flat: multiItems, selected: 2, also: [] },
    )
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // 1. Alt+crop companion (id: 2) while transform() is still pending.
    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    // 2. Select id: 1 with companion id: 2 and drag +50px before id: 2's crop settles.
    await rerender({ selected: 1, also: [2] })
    act(() => void el.dispatchEvent(pointer('pointerdown', { x: 700, y: 700 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 750, y: 700 })))

    // 3. Companion id: 2 settles mid-drag; drag then continues to +100px before release.
    await act(async () => {
      resolveTransform({
        x: 0,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920,
        bounds_height: 1080,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })

    await act(async () => {
      el.dispatchEvent(pointer('pointermove', { x: 800, y: 700 }))
      el.dispatchEvent(pointer('pointerup', { x: 800, y: 700 }))
      for (let i = 0; i < 4; i++) await Promise.resolve()
    })

    expect(api.setItemBoxes).toHaveBeenLastCalledWith('Main', {
      items: [
        { id: 1, x: 700, y: 600, w: 400, h: 200 },
        { id: 2, x: 200, y: 0, w: 1820, h: 1080 },
      ],
      save: true,
    })
  })

  it('keeps waiting until all postShift writes finish instead of adopting an intermediate frame', async () => {
    const boxResolvers: Array<(v: Record<string, unknown>) => void> = []
    const { api, el } = await mount(false, {
      setItemCrop: vi.fn(
        async (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number },
        ) => ({
          id,
          frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
        }),
      ),
      setItemBox: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((r) => {
            boxResolvers.push(r)
          }),
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // 1. Release Alt+crop left=100; ArrowRight #1 triggers drainShift first setItemBox (in flight at x=101).
    const down = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down))
    const move = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    key(el, 'keydown', 'ArrowRight')

    await act(async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve()
    })
    expect(boxResolvers).toHaveLength(1)

    // 2. While first shift write is still in flight, nudge #2 (x=102) and start +50px drag.
    key(el, 'keydown', 'ArrowRight')
    act(() => void el.dispatchEvent(pointer('pointerdown', { x: 500, y: 500 })))
    act(() => void el.dispatchEvent(pointer('pointermove', { x: 550, y: 500 })))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 550, y: 500 })))

    await act(async () => {
      boxResolvers[0]!({ id: 1, frame: [1820, 0, 0, 1080, 101, 0] })
      for (let i = 0; i < 4; i++) await Promise.resolve()
    })
    expect(boxResolvers).toHaveLength(2)
    await act(async () => {
      boxResolvers[1]!({ id: 1, frame: [1820, 0, 0, 1080, 102, 0] })
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })
    expect(boxResolvers).toHaveLength(3)

    expect(api.setItemBox).toHaveBeenLastCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 152, y: 0, w: 1820, h: 1080, save: true }),
    )
  })

  it('preserves final setItemCrop save:true when ArrowRight or move drag happens while save:false crop is in flight', async () => {
    // Sub-case 1: Alt+drag crop (transform already resolved -> save:false in flight) + release + ArrowRight
    let resolveInFlightMove!: (v: Record<string, unknown>) => void
    let moveCall = 0
    const order1: string[] = []
    const first = await mount(false, {
      setItemCrop: vi.fn(
        (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number; save?: boolean },
        ) => {
          moveCall++
          if (moveCall === 1 && !c.save) {
            return new Promise<Record<string, unknown>>((r) => {
              resolveInFlightMove = (v) => {
                order1.push(`crop:${c.left}:${String(c.save)}`)
                r(v)
              }
            })
          }
          order1.push(`crop:${c.left}:${String(c.save)}`)
          return Promise.resolve({
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          })
        },
      ),
      setItemBox: vi.fn(
        async (
          _scene: string,
          id: number,
          b: { x: number; y: number; w: number; h: number; save?: boolean },
        ) => {
          order1.push(`box:${b.x}:${b.w}:${String(b.save)}`)
          return { id, frame: [b.w, 0, 0, b.h, b.x, b.y] }
        },
      ),
    })
    vi.spyOn(first.el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down1 = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down1, 'altKey', { value: true })
    act(() => void first.el.dispatchEvent(down1))
    // Resolve api.transform() immediately so h.crop !== 'reading' during drag.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const move1 = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move1, 'altKey', { value: true })
    act(() => void first.el.dispatchEvent(move1))
    expect(first.api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: false,
    })

    // Release (queues save:true) while save:false is still in flight, then press ArrowRight immediately.
    act(() => void first.el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    key(first.el, 'keydown', 'ArrowRight')

    await act(async () => {
      resolveInFlightMove({ id: 1, frame: [1820, 0, 0, 1080, 100, 0] })
      for (let i = 0; i < 8; i++) await Promise.resolve()
    })

    expect(first.api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
    expect(order1).toEqual(['crop:100:false', 'crop:100:true', 'box:101:1820:true'])
    expect(first.api.setItemBox).toHaveBeenLastCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 101, y: 0, w: 1820, h: 1080, save: true }),
    )

    // Sub-case 2: Alt+drag crop (save:false in flight) + release + immediate +20px regular move drag
    act(() => root.unmount())
    root = createRoot(host)
    let resolveInFlightMove2!: (v: Record<string, unknown>) => void
    let moveCall2 = 0
    const order2: string[] = []
    const second = await mount(false, {
      setItemCrop: vi.fn(
        (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number; save?: boolean },
        ) => {
          moveCall2++
          if (moveCall2 === 1 && !c.save) {
            return new Promise<Record<string, unknown>>((r) => {
              resolveInFlightMove2 = (v) => {
                order2.push(`crop:${c.left}:${String(c.save)}`)
                r(v)
              }
            })
          }
          order2.push(`crop:${c.left}:${String(c.save)}`)
          return Promise.resolve({
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          })
        },
      ),
      setItemBox: vi.fn(
        async (
          _scene: string,
          id: number,
          b: { x: number; y: number; w: number; h: number; save?: boolean },
        ) => {
          order2.push(`box:${b.x}:${b.w}:${String(b.save)}`)
          return { id, frame: [b.w, 0, 0, b.h, b.x, b.y] }
        },
      ),
    })
    vi.spyOn(second.el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    const down2 = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down2, 'altKey', { value: true })
    act(() => void second.el.dispatchEvent(down2))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const move2 = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move2, 'altKey', { value: true })
    act(() => void second.el.dispatchEvent(move2))
    act(() => void second.el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))

    // Immediately perform +20px regular move drag while save:false crop is still in flight.
    act(() => void second.el.dispatchEvent(pointer('pointerdown', { x: 400, y: 540 })))
    act(() => void second.el.dispatchEvent(pointer('pointermove', { x: 420, y: 540 })))
    act(() => void second.el.dispatchEvent(pointer('pointerup', { x: 420, y: 540 })))

    await act(async () => {
      resolveInFlightMove2({ id: 1, frame: [1820, 0, 0, 1080, 100, 0] })
      for (let i = 0; i < 8; i++) await Promise.resolve()
    })

    expect(second.api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
    expect(order2).toEqual(['crop:100:false', 'crop:100:true', 'box:120:1820:true'])
    expect(second.api.setItemBox).toHaveBeenLastCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 120, y: 0, w: 1820, h: 1080, save: true }),
    )
  })

  it('starts a chained fast Alt+drag from the previous crop settled frame when released early', async () => {
    let resolveCrop1!: (v: Record<string, unknown>) => void
    let cropLeft = 0
    const { api, el } = await mount(false, {
      transform: vi.fn(async () => ({
        x: cropLeft,
        y: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 1920 - cropLeft,
        bounds_height: 1080,
        crop_left: cropLeft,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
        width: 1920,
        height: 1080,
      })),
      setItemCrop: vi.fn(
        (
          _scene: string,
          id: number,
          c: { left: number; top: number; right: number; bottom: number; save?: boolean },
        ) => {
          cropLeft = c.left
          if (c.left === 100 && c.save) {
            return new Promise<Record<string, unknown>>((r) => {
              resolveCrop1 = r
            })
          }
          return Promise.resolve({
            id,
            frame: [1920 - c.left - c.right, 0, 0, 1080 - c.top - c.bottom, c.left, c.top],
          })
        },
      ),
    })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Drag 1: Alt+drag left handle by +100 px and release; its save:true request stays in flight.
    const down1 = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down1, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down1))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const move1 = pointer('pointermove', { x: 100, y: 540 })
    Object.defineProperty(move1, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move1))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 100, y: 540 })))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.setItemCrop).toHaveBeenCalledWith('Main', 1, {
      left: 100,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })

    // Drag 2: start from (100, 540) (or left handle grip at pre-crop (0, 540) since items.data has not updated yet)
    // and drag +200 px before Drag 1 settles, releasing immediately before Drag 1 settles.
    const down2 = pointer('pointerdown', { x: 0, y: 540 })
    Object.defineProperty(down2, 'altKey', { value: true })
    act(() => void el.dispatchEvent(down2))
    const move2 = pointer('pointermove', { x: 200, y: 540 })
    Object.defineProperty(move2, 'altKey', { value: true })
    act(() => void el.dispatchEvent(move2))
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 200, y: 540 })))

    // Now Drag 1 settles at frame [1820, 0, 0, 1080, 100, 0].
    // Drag 2 must compute from settled width 1820 (1:1 ratio -> 100 + 200 = 300), not stale width 1920 (290).
    await act(async () => {
      resolveCrop1({ id: 1, frame: [1820, 0, 0, 1080, 100, 0] })
      for (let i = 0; i < 8; i++) await Promise.resolve()
    })

    expect(api.setItemCrop).toHaveBeenLastCalledWith('Main', 1, {
      left: 300,
      top: 0,
      right: 0,
      bottom: 0,
      save: true,
    })
  })
})

describe('H11: native preview hole sync and vertical-only zoom guard', () => {
  afterEach(() => {
    delete (window as { __FERROCAST__?: unknown }).__FERROCAST__
    useLive.setState({ conn: null })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('hides Zoom controls when vertical-only view is selected', async () => {
    const { desk } = fakeDesk({
      canvas: 'vertical',
      scenes: {
        data: {
          current: 'Main',
          preview: null,
          vertical: { scenes: ['Vert'], current: 'Vert' },
          transition: { kind: 'cut_transition', ms: 0 },
        },
        reload() {},
      },
    })

    let setView: ReturnType<typeof usePreviewView>[1] | null = null
    function Harness() {
      setView = usePreviewView()[1]
      return <StageBar />
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(
          <DeskProvider value={desk as never}>
            <Harness />
          </DeskProvider>,
        ),
      )

      act(() => setView?.({ view: 'both', zoom: 1, pan: [0, 0] }))
      expect(host.querySelector('[role="group"][aria-label="Zoom"]')).not.toBeNull()

      act(() => setView?.({ view: 'vertical' }))
      expect(host.querySelector('[role="group"][aria-label="Zoom"]')).toBeNull()

      act(() => setView?.({ view: 'wide' }))
      expect(host.querySelector('[role="group"][aria-label="Zoom"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('ignores ctrl/meta+wheel over vertical stage or in vertical-only view without zooming wide stage', async () => {
    const { desk } = fakeDesk({
      canvas: 'vertical',
      scenes: {
        data: {
          current: 'Main',
          preview: null,
          vertical: { scenes: ['Vert'], current: 'Vert' },
          transition: { kind: 'cut_transition', ms: 0 },
        },
        reload() {},
      },
    })
    const previewReq = vi.fn(async () => undefined)
    useLive.setState({ conn: { client: { request: previewReq } } as never })

    let setView: ReturnType<typeof usePreviewView>[1] | null = null
    function Harness() {
      setView = usePreviewView()[1]
      return <PreviewBox running />
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(
          <DeskProvider value={desk as never}>
            <Harness />
          </DeskProvider>,
        ),
      )
      act(() => setView?.({ view: 'both', zoom: 1, pan: [0, 0] }))

      const vStage = host.querySelector('[aria-label^="Vertical picture"]') as HTMLDivElement
      expect(vStage).not.toBeNull()
      act(() => {
        vStage.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true }),
        )
      })
      expect(getPreviewView().zoom).toBe(1)

      act(() => setView?.({ view: 'vertical', zoom: 1, pan: [0, 0] }))
      const wideStage = host.querySelector('[aria-label^="Wide picture"]') as HTMLDivElement
      act(() => {
        wideStage.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -120, metaKey: true, cancelable: true }),
        )
      })
      expect(getPreviewView().zoom).toBe(1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('ignores two-finger pinch on vertical canvas or in vertical-only view without zooming wide stage', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    ;(window as { __FERROCAST__?: unknown }).__FERROCAST__ = { desktop: true }
    const { desk } = fakeDesk({
      canvas: 'vertical',
      scenes: {
        data: {
          current: 'Main',
          preview: null,
          vertical: { scenes: ['Vert'], current: 'Vert' },
          transition: { kind: 'cut_transition', ms: 0 },
        },
        reload() {},
      },
    })
    const previewReq = vi.fn(async () => undefined)
    useLive.setState({ conn: { client: { request: previewReq } } as never })

    let setView: ReturnType<typeof usePreviewView>[1] | null = null
    function Harness() {
      setView = usePreviewView()[1]
      return <PreviewBox running />
    }

    const touch = (type: string, id: number, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
      Object.defineProperty(e, 'pointerId', { value: id })
      Object.defineProperty(e, 'pointerType', { value: 'touch' })
      return e
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(
          <DeskProvider value={desk as never}>
            <Harness />
          </DeskProvider>,
        ),
      )
      act(() => setView?.({ view: 'both', zoom: 1, pan: [0, 0] }))

      const vStage = host.querySelector('[aria-label^="Vertical picture"]') as HTMLDivElement
      expect(vStage).not.toBeNull()
      vStage.setPointerCapture = () => {}
      vStage.releasePointerCapture = () => {}
      vStage.hasPointerCapture = () => false

      act(() => void vStage.dispatchEvent(touch('pointerdown', 1, 50, 100)))
      act(() => void vStage.dispatchEvent(touch('pointerdown', 2, 150, 100)))
      act(() => void vStage.dispatchEvent(touch('pointermove', 2, 250, 100)))
      expect(getPreviewView().zoom).toBe(1)
      expect(getPreviewView().pan).toEqual([0, 0])
      act(() => void vStage.dispatchEvent(touch('pointerup', 2, 250, 100)))
      act(() => void vStage.dispatchEvent(touch('pointerup', 1, 50, 100)))

      act(() => setView?.({ view: 'vertical', zoom: 1, pan: [0, 0] }))
      act(() => void vStage.dispatchEvent(touch('pointerdown', 1, 50, 100)))
      act(() => void vStage.dispatchEvent(touch('pointerdown', 2, 150, 100)))
      act(() => void vStage.dispatchEvent(touch('pointermove', 2, 250, 100)))
      expect(getPreviewView().zoom).toBe(1)
      expect(getPreviewView().pan).toEqual([0, 0])
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('re-syncs native preview immediately on zoom/pan changes without waiting for 500 ms poll', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    ;(window as { __FERROCAST__?: unknown }).__FERROCAST__ = { desktop: true }

    const previewReq = vi.fn(async () => undefined)
    useLive.setState({ conn: { client: { request: previewReq } } as never })
    // `size: null` avoids accidental side-effects from EditHints/GroupBox, proving PreviewBoxes syncs directly.
    const { desk } = fakeDesk({ size: null })

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-canvas-box')) {
        const m = /translate\(([-.\d]+)px,\s*([-.\d]+)px\)/.exec(this.style.transform || '')
        const tx = m ? Number(m[1]) : 0
        const ty = m ? Number(m[2]) : 0
        return {
          left: 100 + tx,
          top: 50 + ty,
          width: 800,
          height: 450,
          right: 900 + tx,
          bottom: 500 + ty,
          x: 100 + tx,
          y: 50 + ty,
          toJSON: () => {},
        }
      }
      return {
        left: 0,
        top: 0,
        width: 1200,
        height: 700,
        right: 1200,
        bottom: 700,
        x: 0,
        y: 0,
        toJSON: () => {},
      }
    })

    let setView: ReturnType<typeof usePreviewView>[1] | null = null
    function Harness() {
      setView = usePreviewView()[1]
      return <PreviewBox running />
    }

    const holesEvents: number[] = []
    const onHoles = () => holesEvents.push(1)
    window.addEventListener(HOLES_CHANGED, onHoles)

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => {
        root.render(
          <DeskProvider value={desk as never}>
            <Harness />
          </DeskProvider>,
        )
        await vi.advanceTimersByTimeAsync(20)
      })

      previewReq.mockClear()
      holesEvents.length = 0

      await act(async () => {
        setView?.({ zoom: 2, pan: [40, 20] })
        // Wait only ~25 ms (< 500 ms watch interval) for commit + rAF hole placement.
        await vi.advanceTimersByTimeAsync(25)
      })

      expect(holesEvents.length).toBeGreaterThanOrEqual(1)
      expect(previewReq).toHaveBeenCalledWith(
        'PUT',
        '/api/v1/studio/engine/preview',
        expect.objectContaining({
          rect: expect.objectContaining({
            canvas: expect.objectContaining({ x: 140, y: 70 }),
          }),
        }),
      )
    } finally {
      window.removeEventListener(HOLES_CHANGED, onHoles)
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
