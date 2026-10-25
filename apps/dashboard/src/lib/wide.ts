// A screen can ask for the whole width of the window (the Studio's desk follows the window
// instead of the page's usual 1400 px).

import { useEffect, useSyncExternalStore } from 'react'

let wide = 0
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

/** While mounted, the page's main area uses the window's full width. */
export function useWidePage(on = true): void {
  useEffect(() => {
    if (!on) return
    wide++
    tell()
    return () => {
      wide--
      tell()
    }
  }, [on])
}

/** Whether a screen asked for the full width. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => wide > 0,
  )
}
