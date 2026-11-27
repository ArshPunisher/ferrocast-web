// Shared reactive state for the Studio Ready check pill, card, and status-bar recall button.
// Stored outside the component tree so responsive layout switches (desktop <-> mobile) preserve
// check results, expanded state, and dismissal across ReadyCheck remounts within a session.

import { useSyncExternalStore } from 'react'
import type { Preflight } from '@ferrocast/api'

export interface ReadyCheckBarState {
  sessionId: number
  scanStarted: boolean
  active: boolean
  checking: boolean
  dismissed: boolean
  /** The problems that were there when it was dismissed: a different one shows it again. */
  dismissedIds: string[]
  expanded: boolean
  found: Preflight | null
  count: number
  blocking: number
  hasRecovered: boolean
  pendingFocus: 'pill' | 'recall' | null
}

let state: ReadyCheckBarState | null = null
let nextSessionId = 0
let activeTimer: ReturnType<typeof setTimeout> | null = null
let pendingResolve: (() => void) | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function clearActiveTimer() {
  if (activeTimer !== null) {
    clearTimeout(activeTimer)
    activeTimer = null
  }
  const r = pendingResolve
  pendingResolve = null
  r?.()
}

function createInitialState(hasRecovered: boolean): ReadyCheckBarState {
  nextSessionId += 1
  return {
    sessionId: nextSessionId,
    scanStarted: false,
    active: true,
    checking: true,
    dismissed: false,
    dismissedIds: [],
    expanded: hasRecovered,
    found: null,
    count: 0,
    blocking: 0,
    hasRecovered,
    pendingFocus: null,
  }
}

export function getReadyCheckState(): ReadyCheckBarState | null {
  return state
}

/** Starts a fresh Ready check session (called when Studio starts). */
export function beginReadyCheckSession(hasRecovered: boolean): number {
  clearActiveTimer()
  state = createInitialState(hasRecovered)
  emit()
  return state.sessionId
}

/** Starts the preflight mic/status scan once for the active session. */
export function startReadyCheckScanIfNeeded(
  hasRecovered: boolean,
  scanner: (
    isAlive: () => boolean,
    sleep: (ms: number) => Promise<void>,
  ) => Promise<Preflight | null>,
): void {
  if (state?.scanStarted) return
  clearActiveTimer()
  const base = state ?? createInitialState(hasRecovered)
  const sessionId = base.sessionId
  state = { ...base, scanStarted: true }
  emit()

  const isAlive = () => state?.sessionId === sessionId
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (!isAlive()) {
        resolve()
        return
      }
      pendingResolve = resolve
      activeTimer = setTimeout(() => {
        activeTimer = null
        pendingResolve = null
        resolve()
      }, ms)
    })

  void scanner(isAlive, sleep)
    .then((found) => {
      if (!found || !isAlive()) return
      setReadyCheckFound(sessionId, found)
    })
    .catch(() => {
      // Preflight fallback is handled inside scanner; ignore canceled/unhandled rejections.
    })
}

export function setReadyCheckFound(sessionId: number, found: Preflight): void {
  if (!state || state.sessionId !== sessionId) return
  const count = found.checks.length
  const blocking = found.checks.filter((c) => c.status === 'fail').length
  // Once dismissed it stays away until a problem it has not shown before turns up. One fixed
  // (fewer problems) does not bring it back.
  const known = new Set(state.dismissedIds)
  const newProblem = state.dismissed && found.checks.some((c) => !known.has(c.id))
  state = {
    ...state,
    checking: false,
    found,
    count,
    blocking,
    ...(newProblem ? { dismissed: false, expanded: false } : {}),
  }
  emit()
}

export function setReadyCheckExpanded(
  next: boolean | ((prev: boolean) => boolean),
  focusPill = false,
): void {
  if (!state) return
  const expanded = typeof next === 'function' ? next(state.expanded) : next
  const pendingFocus = expanded ? null : focusPill ? ('pill' as const) : state.pendingFocus
  if (state.expanded === expanded && state.pendingFocus === pendingFocus) return
  state = { ...state, expanded, pendingFocus }
  emit()
}

export function dismissReadyCheck(): void {
  if (!state) return
  state = {
    ...state,
    expanded: false,
    dismissed: true,
    dismissedIds: (state.found?.checks ?? []).map((c) => c.id),
    pendingFocus: 'recall',
  }
  emit()
}

export function restoreReadyCheck(): void {
  if (!state) return
  state = { ...state, dismissed: false, pendingFocus: 'pill' }
  emit()
}

export function clearReadyCheckPendingFocus(): void {
  if (!state || state.pendingFocus === null) return
  state = { ...state, pendingFocus: null }
  emit()
}

export function resetReadyCheckState(): void {
  clearActiveTimer()
  if (state === null) return
  state = null
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReadyCheckState(): ReadyCheckBarState | null {
  return useSyncExternalStore(subscribe, getReadyCheckState, getReadyCheckState)
}
