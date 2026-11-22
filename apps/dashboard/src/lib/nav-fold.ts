// The sidebar's folded state, with a screen that folds it for room (the Alerts editor).
// The person's own choice (`pref`) and what the screen did to it (`alertsFolded`) are kept
// apart, so leaving the screen puts back exactly what the person had.

export interface NavState {
  /** The person's own choice: folded to the icon rail or not. Saved. */
  pref: boolean
  /** While on the folding screen: how the sidebar stands there. null on any other screen. */
  alertsFolded: boolean | null
}

export function initialNav(pref: boolean): NavState {
  return { pref, alertsFolded: null }
}

/** Whether the sidebar is folded right now. */
export function isFolded(s: NavState): boolean {
  return s.alertsFolded ?? s.pref
}

/** Arriving on the folding screen: the sidebar folds, whatever the choice is. */
export function enterFolding(s: NavState): NavState {
  return s.alertsFolded === null ? { ...s, alertsFolded: true } : s
}

/** Leaving it: the person's own choice comes back untouched. */
export function leaveFolding(s: NavState): NavState {
  return s.alertsFolded === null ? s : { ...s, alertsFolded: null }
}

/**
 * The logo's toggle. On the folding screen it only moves the sidebar for as long as the
 * person is there (the choice is not changed); elsewhere it is the choice.
 */
export function toggleNav(s: NavState): NavState {
  return s.alertsFolded === null ? { ...s, pref: !s.pref } : { ...s, alertsFolded: !s.alertsFolded }
}
