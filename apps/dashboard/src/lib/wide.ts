// A screen can ask for the whole width of the window (the Studio's desk follows the window
// instead of the page's usual 1400 px), and optionally flush edge-to-edge workspace padding.

import { useEffect, useSyncExternalStore } from 'react'

let wide = 0
let flush = 0
const wideSubs = new Set<() => void>()
const flushSubs = new Set<() => void>()
const tellWide = () => wideSubs.forEach((f) => f())
const tellFlush = () => flushSubs.forEach((f) => f())

/** While mounted, the page's main area uses the window's full width. */
export function useWidePage(on = true): void {
  useEffect(() => {
    if (!on) return
    wide++
    tellWide()
    return () => {
      wide--
      tellWide()
    }
  }, [on])
}

/** Whether a screen asked for the full width. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    (f) => {
      wideSubs.add(f)
      return () => wideSubs.delete(f)
    },
    () => wide > 0,
  )
}

/** While mounted, the page's main area uses tight edge-to-edge workspace gutters. */
export function useFlushPage(on = true): void {
  useEffect(() => {
    if (!on) return
    flush++
    tellFlush()
    return () => {
      flush--
      tellFlush()
    }
  }, [on])
}

/** Whether a screen asked for edge-to-edge workspace gutters. */
export function useIsFlush(): boolean {
  return useSyncExternalStore(
    (f) => {
      flushSubs.add(f)
      return () => flushSubs.delete(f)
    },
    () => flush > 0,
  )
}
