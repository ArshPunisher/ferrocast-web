// The Mac menu bar (apps/desktop menu.rs) tells the page what an item means with a
// `ferrocast:menu` event: go to a route, or run an action the page already has. This is the
// page's half: a small table, nothing new behind it.

export type MenuMessage = { kind: 'nav'; to: string } | { kind: 'action'; name: string }

/** What the page can do for the menu; the app supplies each one. */
export interface MenuDeps {
  navigate: (hash: string) => void
  checkUpdates: () => Promise<unknown>
  toggleLock: () => void
  zoom: (how: 'fit' | 'in' | 'out') => void
}

export function isMenuMessage(x: unknown): x is MenuMessage {
  if (!x || typeof x !== 'object') return false
  const m = x as Record<string, unknown>
  return (
    (m.kind === 'nav' && typeof m.to === 'string') ||
    (m.kind === 'action' && typeof m.name === 'string')
  )
}

/** The Studio settings page the menu asked for, kept for a Studio that isn't on screen yet. */
let pendingSettings: string | null = null

/** What the menu asked the Studio to open (once), for the Studio to take when it appears. */
export function takePendingSettings(): string | null {
  const page = pendingSettings
  pendingSettings = null
  return page
}

/** Opens a page of the Studio's settings: now if the Studio is there, else when it appears. */
function openStudioSettings(page: string, deps: MenuDeps): void {
  pendingSettings = page
  deps.navigate('#/studio')
  window.dispatchEvent(new CustomEvent('ferrocast:open-settings', { detail: { page } }))
}

/** A text field has focus: Undo and Redo there mean its own edit history. */
function typingInAField(): boolean {
  const t = document.activeElement as HTMLElement | null
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))
}

/** Undo and redo for what's on screen: a field's own, else the Studio's (its ⌘Z handler). */
function undoRedo(redo: boolean): void {
  if (typingInAField()) {
    document.execCommand(redo ? 'redo' : 'undo')
    return
  }
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      shiftKey: redo,
      bubbles: true,
      cancelable: true,
    }),
  )
}

/** Does what a menu item means. Unknown messages do nothing. */
export function runMenu(msg: MenuMessage, deps: MenuDeps): void {
  if (msg.kind === 'nav') {
    // Only routes of this dashboard.
    if (/^#\/[\w\-/]*$/.test(msg.to)) deps.navigate(msg.to)
    return
  }
  switch (msg.name) {
    case 'check-updates':
      deps.navigate('#/settings/updates')
      void deps.checkUpdates().catch(() => undefined)
      return
    case 'remux':
      // OBS's Remux lives on the Recording page of the Studio's settings.
      return openStudioSettings('record', deps)
    case 'undo':
      return undoRedo(false)
    case 'redo':
      return undoRedo(true)
    case 'lock-preview':
      return deps.toggleLock()
    case 'zoom-fit':
      return deps.zoom('fit')
    case 'zoom-in':
      return deps.zoom('in')
    case 'zoom-out':
      return deps.zoom('out')
  }
}
