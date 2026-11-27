// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEFT_DOCK, MIN_STAGE, RIGHT_DOCK } from '../../lib/dock-size'
import { DockHandle, navWidth, useDockPair, useDockWidth } from './DockHandle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})

afterEach(async () => {
  const prev = root
  root = null
  try {
    await act(async () => prev?.unmount())
  } finally {
    host?.remove()
    host = null
    vi.unstubAllGlobals()
  }
})

describe('useDockWidth & DockHandle stability', () => {
  it('registers resize/nav listeners once across re-renders and drags without html.style MutationObserver', async () => {
    const observe = vi.fn()
    class FakeObserver {
      observe = observe
      disconnect = vi.fn()
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('MutationObserver', FakeObserver)
    vi.stubGlobal('innerWidth', 1440)
    const addSpy = vi.spyOn(window, 'addEventListener')
    const remSpy = vi.spyOn(window, 'removeEventListener')

    const seenSet: Array<(w: number, other: number) => void> = []
    const seenReset: Array<() => void> = []
    let triggerRerender: (() => void) | null = null

    function Harness() {
      const [tick, setTick] = useState(0)
      triggerRerender = () => setTick((n) => n + 1)
      const dock = useDockWidth(LEFT_DOCK)
      seenSet.push(dock.set)
      seenReset.push(dock.reset)
      return (
        <div data-tick={tick}>
          <DockHandle
            spec={LEFT_DOCK}
            label="Resize the alert rules dock"
            width={dock.width}
            otherWidth={332}
            growsRight={1}
            onResize={dock.set}
            onReset={dock.reset}
          />
        </div>
      )
    }

    await act(async () => root!.render(<Harness />))
    expect(observe).not.toHaveBeenCalled()
    const initResizeAdds = addSpy.mock.calls.filter(([e]) => e === 'resize').length
    const initNavAdds = addSpy.mock.calls.filter(([e]) => e === 'fc:nav-width-change').length
    expect(initResizeAdds).toBe(1)
    expect(initNavAdds).toBe(1)

    await act(async () => triggerRerender?.())
    await act(async () => triggerRerender?.())
    await act(async () => seenSet[0]?.(280, 332))

    expect(seenSet.length).toBeGreaterThanOrEqual(4)
    expect(seenSet[1]).toBe(seenSet[0])
    expect(seenSet[2]).toBe(seenSet[0])
    expect(seenReset[1]).toBe(seenReset[0])
    expect(seenReset[2]).toBe(seenReset[0])
    expect(observe).not.toHaveBeenCalled()
    expect(addSpy.mock.calls.filter(([e]) => e === 'resize')).toHaveLength(1)
    expect(remSpy.mock.calls.filter(([e]) => e === 'resize')).toHaveLength(0)
    addSpy.mockRestore()
    remSpy.mockRestore()
  })

  it('coalesces pointermove via rAF with 0 localStorage writes mid-drag and 1 on pointerup', async () => {
    vi.stubGlobal('innerWidth', 1440)
    const rafQueue: Array<FrameRequestCallback> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    function Harness() {
      const left = useDockWidth(LEFT_DOCK)
      return (
        <DockHandle
          spec={LEFT_DOCK}
          label="Resize left"
          width={left.width}
          otherWidth={332}
          growsRight={1}
          onResize={left.set}
          onReset={left.reset}
        />
      )
    }

    await act(async () => root!.render(<Harness />))
    const handle = host!.querySelector<HTMLDivElement>('[role="separator"]')!
    handle.setPointerCapture = () => {}

    act(() => {
      handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }))
      handle.dispatchEvent(new MouseEvent('pointermove', { clientX: 220, bubbles: true }))
      handle.dispatchEvent(new MouseEvent('pointermove', { clientX: 245, bubbles: true }))
      handle.dispatchEvent(new MouseEvent('pointermove', { clientX: 265, bubbles: true }))
    })
    expect(rafQueue).toHaveLength(1)
    expect(setItemSpy).not.toHaveBeenCalled()

    await act(async () => {
      while (rafQueue.length) rafQueue.shift()?.(0)
    })
    expect(handle.getAttribute('aria-valuenow')).toBe('297')
    expect(setItemSpy).not.toHaveBeenCalled()

    await act(async () => {
      handle.dispatchEvent(new MouseEvent('pointerup', { clientX: 280, bubbles: true }))
    })
    expect(handle.getAttribute('aria-valuenow')).toBe('312')
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy).toHaveBeenCalledWith(LEFT_DOCK.key, '312')
    setItemSpy.mockRestore()
  })

  it('navWidth accounts for root font-size zoom and measured sidebar width', () => {
    document.documentElement.style.setProperty('--fc-nav-w', '15rem')
    document.documentElement.style.fontSize = '24px'
    expect(navWidth()).toBe(360)

    const aside = document.createElement('aside')
    aside.setAttribute('aria-label', 'Sidebar')
    vi.spyOn(aside, 'getBoundingClientRect').mockReturnValue({
      width: 288,
      height: 800,
      top: 0,
      left: 0,
      right: 288,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    document.body.append(aside)
    expect(navWidth()).toBe(288)
    aside.remove()
    document.documentElement.removeAttribute('style')
  })

  it('useDockPair clamps left and right docks proportionally on shrink and nav unfold', async () => {
    localStorage.setItem(LEFT_DOCK.key, '360')
    localStorage.setItem(RIGHT_DOCK.key, '520')
    document.documentElement.style.setProperty('--fc-nav-w', '60px')
    vi.stubGlobal('innerWidth', 1400)

    let latest = { l: 0, r: 0 }
    function Harness() {
      const pair = useDockPair(LEFT_DOCK, RIGHT_DOCK)
      latest = { l: pair.left.width, r: pair.right.width }
      return null
    }

    await act(async () => root!.render(<Harness />))
    expect(latest).toEqual({ l: 360, r: 520 })

    // Unfold sidebar (240px) AND shrink viewport to 1200px -> room = 960, max sum = 580
    await act(async () => {
      document.documentElement.style.setProperty('--fc-nav-w', '15rem')
      vi.stubGlobal('innerWidth', 1200)
      window.dispatchEvent(new Event('fc:nav-width-change'))
    })

    expect(960 - latest.l - latest.r).toBeGreaterThanOrEqual(MIN_STAGE)
    expect(latest.l).toBeGreaterThan(LEFT_DOCK.min)
    expect(latest.r).toBeGreaterThan(RIGHT_DOCK.min)
    document.documentElement.removeAttribute('style')
  })

  it('does not run viewport clamp or overwrite saved dock widths below lg (< 1024 px)', async () => {
    localStorage.setItem(LEFT_DOCK.key, '340')
    localStorage.setItem(RIGHT_DOCK.key, '480')
    vi.stubGlobal('innerWidth', 375)

    const onResize = vi.fn()
    function Harness() {
      const left = useDockWidth(LEFT_DOCK)
      const right = useDockWidth(RIGHT_DOCK)
      return (
        <>
          <DockHandle
            spec={LEFT_DOCK}
            label="Left"
            width={left.width}
            otherWidth={right.width}
            growsRight={1}
            onResize={(w, other) => {
              onResize(w, other)
              left.set(w, other)
            }}
            onReset={left.reset}
          />
          <DockHandle
            spec={RIGHT_DOCK}
            label="Right"
            width={right.width}
            otherWidth={left.width}
            growsRight={-1}
            onResize={(w, other) => {
              onResize(w, other)
              right.set(w, other)
            }}
            onReset={right.reset}
          />
        </>
      )
    }

    await act(async () => root!.render(<Harness />))
    await act(async () => {
      vi.stubGlobal('innerWidth', 768)
      window.dispatchEvent(new Event('resize'))
    })

    expect(onResize).not.toHaveBeenCalled()
    expect(localStorage.getItem(LEFT_DOCK.key)).toBe('340')
    expect(localStorage.getItem(RIGHT_DOCK.key)).toBe('480')
  })
})
