// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeskProvider } from './common'
import { PerformanceToggle } from './performance'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  StageBar,
  clampZoom,
  getPreviewView,
  stripeOf,
  useStageEdit,
  usePreviewView,
  zoomAt,
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
  const mount = async (locked: boolean, apiOver: Record<string, unknown> = {}) => {
    setView({ locked, zoom: 1, pan: [0, 0] })
    const { api, desk } = fakeDesk({ items: { data: items, set() {} }, flat: items })
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

  it('crops left edge inward via setTransform (moving x and shrinking bounds, never moving whole body)', async () => {
    const { api, el } = await mount(false)
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
    act(() => void el.dispatchEvent(pointer('pointerup', { x: 150, y: 540 })))
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.setTransform).toHaveBeenCalled()
    expect(api.setItemCrop).not.toHaveBeenCalled()
    const call = api.setTransform.mock.calls.at(-1) as unknown as [
      string,
      number,
      Record<string, unknown>,
    ]
    expect(call[0]).toBe('Main')
    expect(call[1]).toBe(1)
    expect(call[2]).toMatchObject({
      crop_left: 150,
      crop_right: 0,
      x: 150,
      y: 0,
      bounds_width: 1770,
      bounds_height: 1080,
    })
  })

  it('keeps deferred Alt-drag crop ordered ahead of a following ArrowRight nudge so x = crop + 1', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const transformPromise = new Promise<Record<string, unknown>>((r) => {
      resolveTransform = r
    })
    const { api, el } = await mount(false, {
      transform: vi.fn(() => transformPromise),
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

    expect(api.setTransform).toHaveBeenCalledTimes(1)
    const call = api.setTransform.mock.calls[0] as unknown as [
      string,
      number,
      Record<string, unknown>,
    ]
    expect(call[2]).toMatchObject({
      crop_left: 100,
      bounds_width: 1820,
      x: 101,
      y: 0,
    })
    // Must never overwrite with a pre-crop setItemBox at (1, 0) / width 1920.
    expect(api.setItemBox).not.toHaveBeenCalled()
  })

  it('completes a deferred Alt-drag crop cleanly when no later nudge occurs, and preserves nudge if transform read fails', async () => {
    let resolveTransform!: (t: Record<string, unknown>) => void
    const first = mount(false, {
      transform: vi.fn(
        () =>
          new Promise<Record<string, unknown>>((r) => {
            resolveTransform = r
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
    expect(api.setTransform).toHaveBeenCalledWith(
      'Main',
      1,
      expect.objectContaining({ crop_left: 100, x: 100, bounds_width: 1820 }),
    )

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
    expect(second.api.setTransform).not.toHaveBeenCalled()
    expect(second.api.setItemBox).toHaveBeenCalledWith(
      'Main',
      1,
      expect.objectContaining({ x: 1, y: 0, w: 1920, h: 1080, save: true }),
    )
  })
})
