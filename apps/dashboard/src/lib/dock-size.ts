// The Alerts editor's two docks can be dragged wider or narrower. Their widths are kept in
// this browser, and never leave less than MIN_STAGE for the stage between them.

export interface DockSpec {
  key: string
  def: number
  min: number
  max: number
}

export const LEFT_DOCK: DockSpec = { key: 'fc-alerts-dock-left', def: 232, min: 200, max: 360 }
export const RIGHT_DOCK: DockSpec = { key: 'fc-alerts-dock-right', def: 332, min: 300, max: 520 }
/** The stage never gets narrower than this (it keeps 16:9 and shrinks down to it). */
export const MIN_STAGE = 380

/** `w` held to the dock's own limits, and to the room the other dock and the stage leave. */
export function clampDock(spec: DockSpec, w: number, otherWidth: number, room: number): number {
  const fits = Math.max(spec.min, room - otherWidth - MIN_STAGE)
  return Math.round(Math.max(spec.min, Math.min(spec.max, fits, w)))
}

/** Clamps both docks together when room shrinks so neither stalls waiting on the other. */
export function clampDockPair(
  leftSpec: DockSpec,
  rightSpec: DockSpec,
  leftWidth: number,
  rightWidth: number,
  room: number,
): [number, number] {
  let l = Math.round(Math.max(leftSpec.min, Math.min(leftSpec.max, leftWidth)))
  let r = Math.round(Math.max(rightSpec.min, Math.min(rightSpec.max, rightWidth)))
  const excess = l + r - (room - MIN_STAGE)
  if (excess <= 0) return [l, r]
  const lSlack = l - leftSpec.min
  const rSlack = r - rightSpec.min
  const totalSlack = lSlack + rSlack
  if (totalSlack <= 0 || excess >= totalSlack) return [leftSpec.min, rightSpec.min]
  let lDrop = Math.min(lSlack, Math.round(excess * (lSlack / totalSlack)))
  const rDrop = Math.min(rSlack, excess - lDrop)
  const rem = excess - lDrop - rDrop
  if (rem > 0) lDrop = Math.min(lSlack, lDrop + rem)
  l -= lDrop
  r -= rDrop
  return [l, r]
}

export function readDock(spec: DockSpec): number {
  try {
    const raw = Number(localStorage.getItem(spec.key))
    if (Number.isFinite(raw) && raw >= spec.min && raw <= spec.max) return Math.round(raw)
  } catch {
    // Blocked storage: the default.
  }
  return spec.def
}

export function saveDock(spec: DockSpec, w: number): void {
  try {
    localStorage.setItem(spec.key, String(Math.round(w)))
  } catch {
    // Private windows: it still resizes, just isn't remembered.
  }
}

/** The key presses a splitter answers to: how far, or where to. null for any other key. */
export function dockKeyTarget(
  spec: DockSpec,
  key: string,
  shift: boolean,
  current: number,
  /** +1 when growing the dock moves the handle right (the left dock), -1 for the right one. */
  growsRight: 1 | -1,
): number | null {
  const step = shift ? 48 : 16
  switch (key) {
    case 'ArrowRight':
      return current + step * growsRight
    case 'ArrowLeft':
      return current - step * growsRight
    case 'Home':
      return spec.min
    case 'End':
      return spec.max
    default:
      return null
  }
}
