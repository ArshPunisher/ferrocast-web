// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPreviewOverlayRegistry } from '@ferrocast/ui'
import { DockHeader, DockWorkspace, fresh, moveTo, type DockId } from './layout'

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
        for (const item of mqlListeners) if (item.q === q && item.cb === cb) mqlListeners.delete(item)
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
    const divider = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize the left panels"]')!

    leftRegion.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 700, right: 300, bottom: 700 }) as DOMRect
    center.getBoundingClientRect = () =>
      ({ left: 301, top: 0, width: 640, height: 700, right: 941, bottom: 700 }) as DOMRect

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const dragEvents: boolean[] = []
    const onDrag = (e: Event) => dragEvents.push((e as CustomEvent<{ active: boolean }>).detail.active)
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
        document.dispatchEvent(pointerEvt('pointermove', { clientX: 720 + step, clientY: 470 + step }))
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
})
