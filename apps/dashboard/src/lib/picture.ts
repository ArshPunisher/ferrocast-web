// Where the stream's picture comes from: Ferrocast's own Studio (the product) or OBS (kept for
// those who already use it). One setting every page follows: the top bar, the Studio's tabs,
// Overlays, themes and Vertical show OBS only when OBS is the source.

import { useSyncExternalStore } from 'react'
import { inDesktopApp } from './external'

export type PictureSource = 'ferrocast' | 'obs'

const KEY = 'fc-golive-picture'
const EVENT = 'fc-picture-source'

function read(): PictureSource {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ferrocast' || v === 'obs') return v
  } catch {
    // Private mode: the default.
  }
  // The Studio runs only in the desktop app; in a browser OBS is the way in.
  return inDesktopApp() ? 'ferrocast' : 'obs'
}

export function setPictureSource(p: PictureSource): void {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // Private mode: it lasts this visit (the event still tells every page).
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }))
}

let current: PictureSource | null = null
const subscribe = (on: () => void) => {
  const changed = () => {
    current = read()
    on()
  }
  window.addEventListener(EVENT, changed)
  window.addEventListener('storage', changed)
  return () => {
    window.removeEventListener(EVENT, changed)
    window.removeEventListener('storage', changed)
  }
}

/** The picture source now, and changes to it from any page. */
export function usePictureSource(): PictureSource {
  return useSyncExternalStore(
    subscribe,
    () => (current ??= read()),
    () => 'obs',
  )
}

/** OBS is what the streamer uses: OBS-only parts of the app show. */
export function useUsesObs(): boolean {
  return usePictureSource() === 'obs'
}
