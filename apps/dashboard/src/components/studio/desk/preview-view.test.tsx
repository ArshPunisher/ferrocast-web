// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeskProvider } from './common'
import { PerformanceToggle } from './performance'
import {
  ZOOM_MAX,
  ZOOM_MIN,
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
    setItemCrop: vi.fn(async () => ({})),
    select: vi.fn(async () => ({})),
    previewCursor: vi.fn(async () => ({})),
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
    const ref = { current: null as HTMLDivElement | null }
    const handlers = useStageEdit(ref, true)
    return <div data-stage tabIndex={0} {...handlers} />
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
  const mount = async (locked: boolean) => {
    setView({ locked, zoom: 1, pan: [0, 0] })
    const { api, desk } = fakeDesk({ items: { data: items, set() {} }, flat: items })
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
    return { api, el }
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
})
