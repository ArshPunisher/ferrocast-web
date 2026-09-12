import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useHistory, type History } from './history'

function harness<T>(initial: T) {
  const ref: { h: History<T> | null } = { h: null }
  const Probe = () => {
    ref.h = useHistory(initial)
    return null
  }
  const div = document.createElement('div')
  const root = createRoot(div)
  act(() => root.render(createElement(Probe)))
  return { get: () => ref.h as History<T>, root }
}

describe('useHistory', () => {
  it('undoes and redoes separate steps; a burst merges into one', () => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const t = harness(0)
    act(() => t.get().set(1))
    vi.advanceTimersByTime(1000)
    act(() => t.get().set(2, { merge: true }))
    act(() => t.get().set(3, { merge: true })) // within the burst: merges with 2
    expect(t.get().value).toBe(3)
    act(() => t.get().undo())
    expect(t.get().value).toBe(1)
    act(() => t.get().undo())
    expect(t.get().value).toBe(0)
    expect(t.get().canUndo).toBe(false)
    act(() => t.get().redo())
    act(() => t.get().redo())
    expect(t.get().value).toBe(3)
    expect(t.get().canRedo).toBe(false)
    vi.advanceTimersByTime(1000)
    act(() => t.get().set(3)) // no change, no step
    act(() => t.get().set(4))
    act(() => t.get().set(5)) // clicks right after each other are separate steps
    act(() => t.get().undo())
    expect(t.get().value).toBe(4)
    act(() => t.get().reset(9))
    expect([t.get().value, t.get().canUndo]).toEqual([9, false])
    act(() => t.root.unmount())
    vi.useRealTimers()
  })
})
