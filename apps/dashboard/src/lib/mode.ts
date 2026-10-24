// Simple or Advanced, per screen (owner's pick 1B, 24 Oct board): everyone starts in Simple;
// each screen remembers its own choice in this browser. Every card on the screen reads it.

import { useCallback, useSyncExternalStore } from 'react'

export type Mode = 'simple' | 'advanced'

const key = (screen: string) => `fc-mode:${screen}`
const listeners = new Set<() => void>()

function read(screen: string): Mode {
  try {
    return localStorage.getItem(key(screen)) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

/** The screen's mode and a setter; every user of the same screen updates together. */
export function useMode(screen: string): [Mode, (m: Mode) => void] {
  const mode = useSyncExternalStore(
    (on) => {
      listeners.add(on)
      return () => listeners.delete(on)
    },
    () => read(screen),
    () => 'simple' as Mode,
  )
  const set = useCallback(
    (m: Mode) => {
      try {
        localStorage.setItem(key(screen), m)
      } catch {
        // Private windows may refuse storage: the choice still applies until the page closes.
      }
      for (const l of listeners) l()
    },
    [screen],
  )
  return [mode, set]
}
