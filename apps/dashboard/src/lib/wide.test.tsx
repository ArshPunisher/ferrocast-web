import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useFlushPage, useIsFlush, useIsWide, useWidePage } from './wide'

function Wide() {
  useWidePage()
  return null
}

function Flush() {
  useFlushPage()
  return null
}

function Probe({ out }: { out: { wide: boolean; flush: boolean } }) {
  out.wide = useIsWide()
  out.flush = useIsFlush()
  return null
}

describe('the full-width and flush page switches', () => {
  it('are on only while a screen that asks for them is shown', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const el = document.createElement('div')
    const root = createRoot(el)
    const out = { wide: true, flush: true }
    await act(async () => root.render(<Probe out={out} />))
    expect(out.wide).toBe(false)
    expect(out.flush).toBe(false)
    await act(async () =>
      root.render(
        <>
          <Probe out={out} />
          <Wide />
          <Wide />
          <Flush />
        </>,
      ),
    )
    expect(out.wide).toBe(true)
    expect(out.flush).toBe(true)
    // One of two still asks for wide; flush unmounted.
    await act(async () =>
      root.render(
        <>
          <Probe out={out} />
          <Wide />
        </>,
      ),
    )
    expect(out.wide).toBe(true)
    expect(out.flush).toBe(false)
    await act(async () => root.render(<Probe out={out} />))
    expect(out.wide).toBe(false)
    await act(async () => root.unmount())
  })
})
