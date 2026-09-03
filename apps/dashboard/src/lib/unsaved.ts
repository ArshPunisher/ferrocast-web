import { useCallback, useEffect, useRef, useState } from 'react'
import { leaveTo, setLeaveGuard } from './router'

/** Warns before the tab closes or reloads while an editor has unsaved changes. */
export function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', on)
    return () => window.removeEventListener('beforeunload', on)
  }, [dirty])
}

/**
 * Also stops in-app navigation (sidebar links, Back) while `dirty`, so an editor can ask
 * Save / Discard / Stay. `pending` is where the reader wanted to go; `leave()` goes there,
 * `stay()` forgets it.
 */
export function useLeaveGuard(dirty: boolean): {
  pending: string | null
  stay: () => void
  leave: () => void
} {
  useUnsavedWarning(dirty)
  const [pending, setPending] = useState<string | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => {
    if (!dirty) return
    return setLeaveGuard((to) => {
      setPending(to)
      return true
    })
  }, [dirty])
  const stay = useCallback(() => setPending(null), [])
  const leave = useCallback(() => {
    const to = pendingRef.current
    setPending(null)
    if (to !== null) leaveTo(to)
  }, [])
  return { pending, stay, leave }
}
