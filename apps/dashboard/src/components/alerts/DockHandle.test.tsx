// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEFT_DOCK } from '../../lib/dock-size'
import { DockHandle, useDockWidth } from './DockHandle'

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
  it('memoises set and reset callbacks so parent re-renders do not recreate MutationObserver', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    class FakeObserver {
      observe = observe
      disconnect = disconnect
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('MutationObserver', FakeObserver)

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
    expect(observe).toHaveBeenCalledTimes(1)
    expect(disconnect).not.toHaveBeenCalled()

    await act(async () => triggerRerender?.())
    await act(async () => triggerRerender?.())

    expect(seenSet.length).toBeGreaterThanOrEqual(3)
    expect(seenSet[1]).toBe(seenSet[0])
    expect(seenSet[2]).toBe(seenSet[0])
    expect(seenReset[1]).toBe(seenReset[0])
    expect(seenReset[2]).toBe(seenReset[0])
    expect(observe).toHaveBeenCalledTimes(1)
    expect(disconnect).not.toHaveBeenCalled()
  })
})
