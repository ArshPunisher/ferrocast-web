import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useIsWide, useWidePage } from './wide'

function Wide() {
  useWidePage()
  return null
}

function Probe({ out }: { out: { wide: boolean } }) {
  out.wide = useIsWide()
  return null
}

describe('the full-width page switch', () => {
  it('is on only while a screen that asks for it is shown', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const el = document.createElement('div')
    const root = createRoot(el)
    const out = { wide: true }
    await act(async () => root.render(<Probe out={out} />))
    expect(out.wide).toBe(false)
    await act(async () =>
      root.render(
        <>
          <Probe out={out} />
          <Wide />
          <Wide />
        </>,
      ),
    )
    expect(out.wide).toBe(true)
    // One of two still asks.
    await act(async () =>
      root.render(
        <>
          <Probe out={out} />
          <Wide />
        </>,
      ),
    )
    expect(out.wide).toBe(true)
    await act(async () => root.render(<Probe out={out} />))
    expect(out.wide).toBe(false)
    await act(async () => root.unmount())
  })
})
