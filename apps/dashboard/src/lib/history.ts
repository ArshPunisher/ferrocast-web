// Undo and redo for an editor's draft. Continuous changes within a short burst (a slider
// drag, typing) merge into one step, so Cmd/Ctrl+Z undoes what the person thinks of as one
// change; every click is a step of its own.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface History<T> {
  value: T
  /** Replaces the value; `merge` folds it into the last step (continuous drags). */
  set: (next: T | ((prev: T) => T), opts?: { merge?: boolean }) => void
  /** Starts over from `value` with no history (after loading or saving). */
  reset: (value: T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const BURST_MS = 600
const MAX_STEPS = 200

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  })
  const last = useRef(0)
  const lastMerged = useRef(false)
  const set = useCallback((next: T | ((prev: T) => T), opts: { merge?: boolean } = {}) => {
    // Decided here, not inside the updater: React may run an updater twice.
    const now = Date.now()
    const merge = opts.merge === true && lastMerged.current && now - last.current < BURST_MS
    last.current = now
    lastMerged.current = opts.merge === true
    setState((s) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next
      if (Object.is(value, s.present) || JSON.stringify(value) === JSON.stringify(s.present))
        return s
      if (merge && s.past.length > 0) return { past: s.past, present: value, future: [] }
      return { past: [...s.past, s.present].slice(-MAX_STEPS), present: value, future: [] }
    })
  }, [])
  const reset = useCallback((value: T) => {
    last.current = 0
    setState({ past: [], present: value, future: [] })
  }, [])
  const undo = useCallback(() => {
    last.current = 0
    lastMerged.current = false
    setState((s) => {
      const prev = s.past.at(-1)
      if (prev === undefined) return s
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] }
    })
  }, [])
  const redo = useCallback(() => {
    last.current = 0
    lastMerged.current = false
    setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined) return s
      return { past: [...s.past, s.present], present: next, future: rest }
    })
  }, [])
  return {
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

/** Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redoes, except while typing in a field. */
export function useUndoKeys(h: { undo: () => void; redo: () => void }, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      if (typing && (t as HTMLInputElement).type !== 'range') return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        h.undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        h.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [h, enabled])
}
