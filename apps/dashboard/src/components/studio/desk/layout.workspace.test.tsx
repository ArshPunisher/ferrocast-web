// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPreviewOverlayRegistry } from '@ferrocast/ui'
import {
  DockHeader,
  DockWorkspace,
  clampFloat,
  fresh,
  moveTo,
  tabWith,
  useLayout,
  type DockId,
} from './layout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function pointerEvt(type: string, init: MouseEventInit & { pointerId?: number; button?: number }) {
  const Ctor = typeof window.PointerEvent === 'function' ? window.PointerEvent : window.MouseEvent
  return new Ctor(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init })
}

describe('DockWorkspace CSS layout, resize loops, and containment', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  let vw = 1280
  let vh = 800
  const mqlListeners = new Set<{ q: string; cb: () => void }>()
  let moObservedHtml = false
  let roCallbacks: Array<() => void> = []

  const evalQuery = (q: string) => {
    const match = q.match(/max-width:\s*(\d+)px/)
    if (match) return vw <= Number(match[1])
    return false
  }

  const setViewport = async (nextW: number, nextH: number) => {
    vw = nextW
    vh = nextH
    vi.stubGlobal('innerWidth', nextW)
    vi.stubGlobal('innerHeight', nextH)
    await act(async () => {
      for (const l of mqlListeners) l.cb()
      window.dispatchEvent(new Event('resize'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
  }

  beforeEach(() => {
    localStorage.clear()
    resetPreviewOverlayRegistry()
    mqlListeners.clear()
    roCallbacks = []
    moObservedHtml = false
    vw = 1280
    vh = 800
    vi.stubGlobal('innerWidth', vw)
    vi.stubGlobal('innerHeight', vh)
    host = document.body.appendChild(document.createElement('div'))

    vi.stubGlobal('matchMedia', (q: string) => ({
      media: q,
      get matches() {
        return evalQuery(q)
      },
      addEventListener: (_: string, cb: () => void) => mqlListeners.add({ q, cb }),
      removeEventListener: (_: string, cb: () => void) => {
        for (const item of mqlListeners)
          if (item.q === q && item.cb === cb) mqlListeners.delete(item)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))

    vi.stubGlobal(
      'ResizeObserver',
      class {
        cb: () => void
        constructor(cb: () => void) {
          this.cb = cb
          roCallbacks.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )

    const OrigMO = window.MutationObserver
    vi.stubGlobal(
      'MutationObserver',
      class extends OrigMO {
        override observe(target: Node, options?: MutationObserverInit) {
          if (target === document.documentElement) moObservedHtml = true
          super.observe(target, options)
        }
      },
    )

    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {}
    }
    if (typeof CSS === 'undefined' || !CSS.escape) {
      vi.stubGlobal('CSS', { escape: (s: string) => s })
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    if (root) {
      act(() => root!.unmount())
      root = null
    }
    host.remove()
    localStorage.clear()
    resetPreviewOverlayRegistry()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses CSS height without inline JS height or documentElement MutationObserver and keeps preview mounted across 900px/640px', async () => {
    let stageMounts = 0
    let stageUnmounts = 0
    let firstStageNode: HTMLElement | null = null

    function StageProbe() {
      const ref = useRef<HTMLDivElement>(null)
      useEffect(() => {
        stageMounts += 1
        if (!firstStageNode) firstStageNode = ref.current
        return () => {
          stageUnmounts += 1
        }
      }, [])
      return (
        <div ref={ref} data-stage-probe>
          Preview
        </div>
      )
    }

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<StageProbe />}
          docks={(id: DockId) => (
            <section data-test-panel={id}>
              <DockHeader id={id} />
              <div>{id}</div>
            </section>
          )}
        />,
      )
    })

    const ws = host.querySelector<HTMLElement>('[data-dock-ws]')!
    expect(ws).not.toBeNull()
    expect(ws.style.height).toBe('')
    expect(moObservedHtml).toBe(false)
    expect(stageMounts).toBe(1)
    expect(stageUnmounts).toBe(0)
    expect(host.querySelector('[role="radiogroup"][aria-label="Panel"]')).toBeNull()

    // Non-ghost docks opt into layout+style containment; scenes/sources avoid trapping fixed drag ghosts.
    expect(host.querySelector('[data-dock="audio"]')?.className).toContain('fc-contain-dock')
    expect(host.querySelector('[data-dock="scenes"]')?.className).not.toContain('fc-contain-dock')
    expect(host.querySelector('[data-dock="sources"]')?.className).not.toContain('fc-contain-dock')
    expect(host.querySelector('[data-stage]')?.className).toContain('fc-contain-stage')

    // Below 900px desktop compact layout keeps preview mounted and avoids phone mode.
    await setViewport(820, 680)
    expect(stageMounts).toBe(1)
    expect(stageUnmounts).toBe(0)
    expect(host.querySelector('[data-stage-probe]')).toBe(firstStageNode)
    expect(host.querySelector('[role="radiogroup"][aria-label="Panel"]')).toBeNull()
    expect(host.querySelector('[data-dock="scenes"]')).not.toBeNull()
    expect(host.querySelector('[data-dock="sources"]')).not.toBeNull()
    expect(host.querySelector('[data-dock="audio"]')).not.toBeNull()

    // Phone tier (<640px) keeps the same stage DOM node mounted while revealing Panel switcher.
    await setViewport(375, 812)
    expect(stageMounts).toBe(1)
    expect(stageUnmounts).toBe(0)
    expect(host.querySelector('[data-stage-probe]')).toBe(firstStageNode)
    expect(host.querySelector('[role="radiogroup"][aria-label="Panel"]')).not.toBeNull()

    // Widening back preserves the exact same stage instance.
    await setViewport(1440, 900)
    expect(stageMounts).toBe(1)
    expect(stageUnmounts).toBe(0)
    expect(host.querySelector('[data-stage-probe]')).toBe(firstStageNode)
  })

  it('updates CSS vars via rAF during Divider drag with 0 localStorage writes mid-drag and 1 commit on pointerup', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const ws = host.querySelector<HTMLElement>('[data-dock-ws]')!
    const leftRegion = host.querySelector<HTMLElement>('[data-dock-region="left"]')!
    const center = host.querySelector<HTMLElement>('[data-desk-center]')!
    const divider = host.querySelector<HTMLElement>(
      '[role="separator"][aria-label="Resize the left panels"]',
    )!

    leftRegion.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 700, right: 300, bottom: 700 }) as DOMRect
    center.getBoundingClientRect = () =>
      ({ left: 301, top: 0, width: 640, height: 700, right: 941, bottom: 700 }) as DOMRect

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const dragEvents: boolean[] = []
    const onDrag = (e: Event) =>
      dragEvents.push((e as CustomEvent<{ active: boolean }>).detail.active)
    window.addEventListener('fc:divider-drag', onDrag)

    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointerdown', { clientX: 300, clientY: 200 }))
      for (const dx of [12, 24, 36, 48]) {
        divider.dispatchEvent(pointerEvt('pointermove', { clientX: 300 + dx, clientY: 200 }))
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })

    expect(setItem).not.toHaveBeenCalled()
    expect(ws.style.getPropertyValue('--fc-lw')).toBe('348px')
    expect(dragEvents).toEqual([true])

    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointerup', { clientX: 348, clientY: 200 }))
    })
    window.removeEventListener('fc:divider-drag', onDrag)

    expect(dragEvents).toEqual([true, false])
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(setItem.mock.calls[0]![1]).lw).toBe(348)
  })

  it('coalesces floating dock drags in rAF and clamps floating geometry on window resize', async () => {
    const seeded = {
      ...moveTo(fresh('side'), 'chat', 'right'),
      hidden: ['events'],
      float: { chat: { x: 700, y: 460, w: 320, h: 240 } },
    }
    seeded.right = seeded.right.filter((d) => d !== 'chat')
    localStorage.setItem('fc-studio-layout', JSON.stringify(seeded))

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const floatDock = () =>
      host.querySelector<HTMLElement>('[data-dock="chat"][data-over-preview]')!
    const floatHeader = floatDock().querySelector('header')!
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await act(async () => {
      floatHeader.dispatchEvent(pointerEvt('pointerdown', { clientX: 720, clientY: 470 }))
      for (const step of [10, 20, 30, 40]) {
        document.dispatchEvent(
          pointerEvt('pointermove', { clientX: 720 + step, clientY: 470 + step }),
        )
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })

    // Mid-drag moves via rAF DOM updates without hammering localStorage.
    expect(setItem).not.toHaveBeenCalled()
    expect(floatDock().style.left).toBe('740px')
    expect(floatDock().style.top).toBe('500px')

    await act(async () => {
      document.dispatchEvent(pointerEvt('pointerup', { clientX: 760, clientY: 510 }))
    })
    expect(setItem).toHaveBeenCalledTimes(1)

    // Shrinking the window clamps floating dock within bounds on resize.
    await setViewport(800, 560)
    const [fx, fy, fw, fh] = floatDock().dataset.pos!.split(',').map(Number)
    expect(fx! + fw!).toBeLessThanOrEqual(800 - 8)
    expect(fy! + fh!).toBeLessThanOrEqual(560 - 8)
  })

  it('ignores mismatched pointerIds and restores CSS vars on divider pointercancel (CR-1)', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const ws = host.querySelector<HTMLElement>('[data-dock-ws]')!
    const leftRegion = host.querySelector<HTMLElement>('[data-dock-region="left"]')!
    const center = host.querySelector<HTMLElement>('[data-desk-center]')!
    const divider = host.querySelector<HTMLElement>(
      '[role="separator"][aria-label="Resize the left panels"]',
    )!

    leftRegion.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 700, right: 300, bottom: 700 }) as DOMRect
    center.getBoundingClientRect = () =>
      ({ left: 301, top: 0, width: 640, height: 700, right: 941, bottom: 700 }) as DOMRect

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const dragEvents: boolean[] = []
    const onDrag = (e: Event) =>
      dragEvents.push((e as CustomEvent<{ active: boolean }>).detail.active)
    window.addEventListener('fc:divider-drag', onDrag)

    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 300, clientY: 200 }))
      // Different pointerId must be ignored cleanly.
      divider.dispatchEvent(pointerEvt('pointermove', { pointerId: 9, clientX: 390, clientY: 200 }))
      divider.dispatchEvent(pointerEvt('pointerup', { pointerId: 9, clientX: 390, clientY: 200 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    expect(dragEvents).toEqual([])
    expect(setItem).not.toHaveBeenCalled()

    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 350, clientY: 200 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    expect(ws.style.getPropertyValue('--fc-lw')).toBe('350px')
    expect(dragEvents).toEqual([true])

    // pointercancel aborts without saving and restores initial --fc-lw.
    await act(async () => {
      divider.dispatchEvent(
        pointerEvt('pointercancel', { pointerId: 1, clientX: 360, clientY: 200 }),
      )
    })
    expect(setItem).not.toHaveBeenCalled()
    expect(ws.style.getPropertyValue('--fc-lw')).toBe('300px')
    expect(document.body.style.userSelect).toBe('')
    expect(dragEvents).toEqual([true, false])

    // pointerup after pointercancel must not double-complete or commit.
    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 360, clientY: 200 }))
    })
    expect(setItem).not.toHaveBeenCalled()
    expect(dragEvents).toEqual([true, false])
    window.removeEventListener('fc:divider-drag', onDrag)
  })

  it('aborts divider drag cleanly if divider unmounts at 900px compact threshold (CR-5, F7.1)', async () => {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const ws = host.querySelector<HTMLElement>('[data-dock-ws]')!
    const leftRegion = host.querySelector<HTMLElement>('[data-dock-region="left"]')!
    const center = host.querySelector<HTMLElement>('[data-desk-center]')!
    const divider = host.querySelector<HTMLElement>(
      '[role="separator"][aria-label="Resize the left panels"]',
    )!

    leftRegion.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 700, right: 300, bottom: 700 }) as DOMRect
    center.getBoundingClientRect = () =>
      ({ left: 301, top: 0, width: 640, height: 700, right: 941, bottom: 700 }) as DOMRect

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const dragEvents: boolean[] = []
    const onDrag = (e: Event) =>
      dragEvents.push((e as CustomEvent<{ active: boolean }>).detail.active)
    window.addEventListener('fc:divider-drag', onDrag)

    await act(async () => {
      divider.dispatchEvent(pointerEvt('pointerdown', { clientX: 300, clientY: 200 }))
      divider.dispatchEvent(pointerEvt('pointermove', { clientX: 360, clientY: 200 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    expect(dragEvents).toEqual([true])
    expect(document.body.style.userSelect).toBe('none')

    // Cross into <900px compact while dragging: Divider unmounts mid-drag.
    await setViewport(820, 680)
    expect(dragEvents).toEqual([true, false])
    expect(document.body.style.userSelect).toBe('')
    expect(setItem).not.toHaveBeenCalled()
    expect(ws.style.getPropertyValue('--fc-lw')).toBe('300px')
    window.removeEventListener('fc:divider-drag', onDrag)
  })

  it('cleans up FloatingDock window listeners and commits swallowed CSS resize via debounce (CR-3, F7.2)', async () => {
    vi.useFakeTimers()
    const seeded = {
      ...moveTo(fresh('side'), 'chat', 'right'),
      hidden: ['events'],
      float: { chat: { x: 200, y: 120, w: 320, h: 240 } },
    }
    seeded.right = seeded.right.filter((d) => d !== 'chat')
    localStorage.setItem('fc-studio-layout', JSON.stringify(seeded))

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const floatEl = host.querySelector<HTMLElement>('[data-dock="chat"][data-over-preview]')!
    let curW = 320
    let curH = 240
    Object.defineProperty(floatEl, 'offsetWidth', { configurable: true, get: () => curW })
    Object.defineProperty(floatEl, 'offsetHeight', { configurable: true, get: () => curH })

    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    // Simulated CSS resize where pointerup fires on window: BOTH pointerup and pointercancel must be removed.
    await act(async () => {
      floatEl.dispatchEvent(pointerEvt('pointerdown', { clientX: 515, clientY: 355 }))
    })
    expect(
      addSpy.mock.calls.filter(([t]) => t === 'pointerup' || t === 'pointercancel'),
    ).toHaveLength(2)

    curW = 410
    curH = 310
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 605, clientY: 425 }))
    })
    expect(
      removeSpy.mock.calls.filter(([t]) => t === 'pointerup' || t === 'pointercancel'),
    ).toHaveLength(2)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(setItem.mock.calls[0]![1]).float.chat).toMatchObject({ w: 410, h: 310 })

    // Second resize where CSS resize swallows pointerup: ResizeObserver trailing debounce must commit.
    setItem.mockClear()
    await act(async () => {
      floatEl.dispatchEvent(pointerEvt('pointerdown', { clientX: 605, clientY: 425 }))
      curW = 460
      curH = 350
      for (const cb of roCallbacks) cb()
      vi.advanceTimersByTime(20)
    })
    expect(setItem).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(setItem.mock.calls[0]![1]).float.chat).toMatchObject({ w: 460, h: 350 })
  })

  it('reconciles floatEl on cancelled or clamped release, keeps latest w/h, and cleans up at compact (CR-4, CR-9, F7.3)', async () => {
    const seeded = {
      ...moveTo(fresh('side'), 'chat', 'right'),
      hidden: ['events'],
      float: { chat: { x: 400, y: 200, w: 320, h: 240 } },
    }
    seeded.right = seeded.right.filter((d) => d !== 'chat')
    localStorage.setItem('fc-studio-layout', JSON.stringify(seeded))

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          stage={<div>Preview</div>}
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const floatEl = host.querySelector<HTMLElement>('[data-dock="chat"][data-over-preview]')!
    let liveW = 320
    let liveH = 240
    Object.defineProperty(floatEl, 'offsetWidth', { configurable: true, get: () => liveW })
    Object.defineProperty(floatEl, 'offsetHeight', { configurable: true, get: () => liveH })

    const header = () => floatEl.querySelector('header')!

    // 1. pointercancel mid-drag must restore inline left/top and data-pos back to pre-drag coordinates.
    await act(async () => {
      header().dispatchEvent(pointerEvt('pointerdown', { clientX: 420, clientY: 210 }))
      document.dispatchEvent(pointerEvt('pointermove', { clientX: 520, clientY: 310 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    expect(floatEl.style.left).toBe('500px')
    expect(document.body.dataset.dockDrag).toBe('1')

    await act(async () => {
      document.dispatchEvent(pointerEvt('pointercancel', { clientX: 520, clientY: 310 }))
    })
    expect(document.body.dataset.dockDrag).toBeUndefined()
    expect(floatEl.style.left).toBe('400px')
    expect(floatEl.style.top).toBe('200px')
    expect(floatEl.dataset.pos).toBe('400,200,320,240')

    // 2. Same-spot release reconciles floatEl and preserves intervening ResizeObserver w/h change (CR-4, CR-9).
    await act(async () => {
      header().dispatchEvent(pointerEvt('pointerdown', { clientX: 420, clientY: 210 }))
      document.dispatchEvent(pointerEvt('pointermove', { clientX: 460, clientY: 240 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      liveW = 450
      liveH = 330
      for (const cb of roCallbacks) cb()
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await act(async () => {
      document.dispatchEvent(pointerEvt('pointerup', { clientX: 420, clientY: 210 }))
    })
    expect(floatEl.style.left).toBe('400px')
    expect(floatEl.style.top).toBe('200px')
    const savedChat = JSON.parse(setItem.mock.calls[setItem.mock.calls.length - 1]![1]).float.chat
    expect(savedChat).toEqual({ x: 400, y: 200, w: 450, h: 330 })

    // 3. Entering compact (800px) allows dragging FloatingDock cleanly, while phone (<640px) cleans up drag (F11.2, F7.3).
    await setViewport(800, 680)
    expect(header().className).toContain('cursor-grab')
    await act(async () => {
      header().dispatchEvent(pointerEvt('pointerdown', { clientX: 420, clientY: 210 }))
      document.dispatchEvent(pointerEvt('pointermove', { clientX: 450, clientY: 240 }))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    })
    expect(document.body.dataset.dockDrag).toBe('1')
    await setViewport(375, 812)
    expect(document.body.dataset.dockDrag).toBeUndefined()
    expect(document.body.style.userSelect).toBe('')
  })

  it('prunes stale --fc-dock-* CSS weight vars, places phone float after switcher, and exempts tabbed scenes/sources & studio stage (CR-8, F11.1, F11.2, F11.3, F16)', async () => {
    const header = document.createElement('header')
    header.dataset.appHeader = ''
    header.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 50, right: 1280, bottom: 50 }) as DOMRect
    Object.defineProperty(header, 'style', { value: { display: 'flex' }, configurable: true })
    const origGetCS = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (el: Element, pseudo?: string | null) => {
        if (el === header) {
          return {
            display: 'flex',
            visibility: 'visible',
            position: 'sticky',
          } as CSSStyleDeclaration
        }
        return origGetCS(el, pseudo)
      },
    )
    document.body.appendChild(header)
    try {
      expect(clampFloat({ x: 200, y: 0, w: 320, h: 240 }, 1280, 800).y).toBe(58)
    } finally {
      header.remove()
    }

    const seeded = {
      ...tabWith(fresh('side'), 'scenes', 'audio'),
      float: { chat: { x: 100, y: 100, w: 300, h: 220 } },
      hidden: ['events'],
      mob: 'chat' as DockId,
      w: { audio: 1.5, sources: 1, golive: 1, staleDock: 2.5 } as Record<string, number>,
    }
    localStorage.setItem('fc-studio-layout', JSON.stringify(seeded))

    function WeightPruner() {
      const { setLayout } = useLayout()
      return (
        <button
          data-prune-weights
          onClick={() => setLayout((l) => ({ ...l, w: { audio: 1.5, sources: 1, golive: 1 } }))}
        />
      )
    }

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DockWorkspace
          top={<WeightPruner />}
          stage={
            <div data-stage-bg data-studio-stage>
              Studio
            </div>
          }
          docks={(id) => (
            <div>
              <DockHeader id={id} />
              <div>{id}</div>
            </div>
          )}
        />,
      )
    })

    const ws = host.querySelector<HTMLElement>('[data-dock-ws]')!
    expect(ws.style.getPropertyValue('--fc-dock-staleDock')).toBe('2.5')
    // Tabbed audio host contains scenes, so it must use fc-contain-style instead of fc-contain-dock (F11.3).
    expect(host.querySelector('[data-dock="audio"]')?.className).toContain('fc-contain-style')
    expect(host.querySelector('[data-dock="audio"]')?.className).not.toContain('fc-contain-dock')

    // Remove staleDock weight in the same DockWorkspace instance: CSS custom property must be pruned (CR-8).
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-prune-weights]')!.click()
    })
    expect(ws.style.getPropertyValue('--fc-dock-staleDock')).toBe('')

    // Compact stage wrapper exempts [data-studio-stage] from aspect-video override (F16).
    await setViewport(820, 680)
    expect(host.querySelector('[data-stage]')?.className).not.toContain(
      '[&>:first-child]:aspect-video',
    )

    // At 375px phone tier, floating dock selected in mob must render after [data-desk-center] (order-2) (F11.1).
    await setViewport(375, 812)
    const phoneFloatDock = host.querySelector<HTMLElement>('[data-dock="chat"]')!
    expect(phoneFloatDock.className).toContain('order-2')
  })
})
