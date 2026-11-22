// Resizable Chat + Events split helpers (E1): clamped column widths, keyboard stepping, and
// persisted width across reloads.

export const EVENTS_WIDTH_KEY = 'fc-chat-events-width'
export const SPLITTER_WIDTH = 12
export const MIN_CHAT_WIDTH = 360
export const MIN_EVENTS_WIDTH = 280
export const MAX_EVENTS_WIDTH = 640
export const DEFAULT_EVENTS_WIDTH_WIDE = 352
export const DEFAULT_EVENTS_WIDTH_COMPACT = 304

export function eventsWidthBounds(containerWidth: number): { min: number; max: number } {
  if (containerWidth <= 0) {
    return { min: MIN_EVENTS_WIDTH, max: MAX_EVENTS_WIDTH }
  }
  const min = Math.min(MIN_EVENTS_WIDTH, Math.max(200, Math.floor(containerWidth * 0.4)))
  const availForEvents = containerWidth - MIN_CHAT_WIDTH - SPLITTER_WIDTH
  const max = Math.max(min, Math.min(MAX_EVENTS_WIDTH, availForEvents))
  return { min, max }
}

export function defaultEventsWidth(containerWidth: number): number {
  const preferred =
    containerWidth >= 1340 ? DEFAULT_EVENTS_WIDTH_WIDE : DEFAULT_EVENTS_WIDTH_COMPACT
  return clampEventsWidth(preferred, containerWidth)
}

export function clampEventsWidth(width: number, containerWidth: number): number {
  const { min, max } = eventsWidthBounds(containerWidth)
  return Math.round(Math.max(min, Math.min(max, width)))
}

/**
 * Computes the next Events column width for a keyboard press on the vertical splitter.
 * Events sits on the right, so ArrowLeft widens Events and ArrowRight narrows it.
 */
export function stepEventsWidth(
  currentWidth: number,
  key: string,
  shiftKey: boolean,
  containerWidth: number,
): number | null {
  const step = shiftKey ? 48 : 16
  const { min, max } = eventsWidthBounds(containerWidth)
  switch (key) {
    case 'ArrowLeft':
      return clampEventsWidth(currentWidth + step, containerWidth)
    case 'ArrowRight':
      return clampEventsWidth(currentWidth - step, containerWidth)
    case 'Home':
      return max
    case 'End':
      return min
    default:
      return null
  }
}

export function loadSavedEventsWidth(): number | null {
  try {
    const raw = localStorage.getItem(EVENTS_WIDTH_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.round(parsed)
  } catch {
    return null
  }
}

export function saveEventsWidth(width: number): void {
  try {
    localStorage.setItem(EVENTS_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // Private windows or storage blocked: keep working in memory.
  }
}
