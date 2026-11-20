import { useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import {
  APPEARANCE_EVENT,
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  loadAppearance,
  type Appearance,
} from './appearance'

let cache: { raw: string | null; value: Appearance } = { raw: null, value: DEFAULT_APPEARANCE }

function snapshot(): Appearance {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(APPEARANCE_KEY)
  } catch {
    // Not readable: the default.
  }
  if (raw !== cache.raw) cache = { raw, value: loadAppearance() }
  return cache.value
}

function subscribe(on: () => void) {
  window.addEventListener(APPEARANCE_EVENT, on)
  window.addEventListener('storage', on)
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, on)
    window.removeEventListener('storage', on)
  }
}

/** The saved appearance, live: a change anywhere in the app reaches every reader. */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_APPEARANCE)
}

/** Motion follows the computer's setting, or is off when the app's own switch is on. */
export function Motion({ children }: { children: ReactNode }) {
  const a = useAppearance()
  return <MotionConfig reducedMotion={a.reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
}
