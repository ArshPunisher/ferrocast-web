// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupBox, HOLES_CHANGED, SnapOverlay, clearHints, setHints } from './snap-overlay'

const canvas = { width: 1920, height: 1080 }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  clearHints()
})

describe('the box dragged on empty canvas', () => {
  it('leaves its inside to the live picture: only thin edges are holes', () => {
    const box = document.createElement('div')
    document.body.append(box)
    act(() => root.render(<SnapOverlay boxRef={{ current: box }} canvas={canvas} />))
    act(() =>
      setHints({
        owner: box,
        guides: [],
        gaps: [],
        marquee: { left: 100, top: 100, right: 900, bottom: 600 },
      }),
    )
    const holes = [...host.querySelectorAll<HTMLElement>('[data-over-preview]')]
    expect(holes.length).toBe(4)
    for (const h of holes) {
      const thin = h.style.width === '2px' || h.style.height === '2px'
      expect(thin, h.outerHTML).toBe(true)
    }
    box.remove()
  })
})

describe('telling the app the holes moved', () => {
  it('the overlays say so whenever they change, as a style change fires no observer', () => {
    const seen = vi.fn()
    window.addEventListener(HOLES_CHANGED, seen)
    act(() =>
      root.render(<GroupBox rect={{ left: 0, top: 0, right: 100, bottom: 100 }} canvas={canvas} />),
    )
    const first = seen.mock.calls.length
    expect(first).toBeGreaterThan(0)
    act(() =>
      root.render(
        <GroupBox rect={{ left: 10, top: 0, right: 110, bottom: 100 }} canvas={canvas} />,
      ),
    )
    expect(seen.mock.calls.length).toBeGreaterThan(first)
    window.removeEventListener(HOLES_CHANGED, seen)
  })
})
