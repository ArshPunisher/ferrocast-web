// Hash routing: the dashboard is a static bundle served at /app/ by the engine and loaded
// as a file in the desktop window, so the hash is the only route that always works.

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'chat' }
  | { name: 'alerts'; rule?: string }
  | { name: 'overlays' }
  | { name: 'overlay'; id: string }
  | { name: 'moderation' }
  | { name: 'bot' }
  | { name: 'community'; section?: string }
  | { name: 'recap' }
  | { name: 'tips' }
  | { name: 'settings'; section?: string }
  | { name: 'import'; source?: 'streamelements' | 'streamlabs' }
  | { name: 'designs'; tab?: GalleryTab }
  | { name: 'designer'; id: string }
  | { name: 'studio'; section?: StudioSection }
  /** Pro stream history (`#/history`). */
  | { name: 'history' }
  /** Ferrocast Pro's plans (`#/plans`), opened from Get Pro. */
  | { name: 'plans' }
  /** The Ferrocast account (`#/account`). */
  | { name: 'account' }
  /** Cloud mode (`#/cloud`, `?connected=twitch` after a connect on the web). */
  | { name: 'cloud'; connected?: string }

/** Gallery tabs; themes is the default (`#/designs`). */
export type GalleryTab = 'themes' | 'alerts' | 'widgets' | 'mine'
const GALLERY_TABS: GalleryTab[] = ['themes', 'alerts', 'widgets', 'mine']

export type StudioSection = 'golive' | 'vertical' | 'show' | 'info' | 'obs' | 'moments' | 'engine'
const STUDIO_SECTIONS: StudioSection[] = [
  'golive',
  'vertical',
  'show',
  'info',
  'obs',
  'moments',
  'engine',
]

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b] = parts
  switch (a) {
    case 'cloud': {
      const connected = new URLSearchParams(query).get('connected')
      return connected ? { name: 'cloud', connected } : { name: 'cloud' }
    }
    case 'chat':
      return { name: 'chat' }
    case 'alerts':
      return b ? { name: 'alerts', rule: b } : { name: 'alerts' }
    case 'overlays':
      return b ? { name: 'overlay', id: b } : { name: 'overlays' }
    case 'moderation':
      return { name: 'moderation' }
    case 'bot':
      return { name: 'bot' }
    case 'community':
      return b ? { name: 'community', section: b } : { name: 'community' }
    case 'recap':
      return { name: 'recap' }
    case 'tips':
      return { name: 'tips' }
    case 'settings':
      return b ? { name: 'settings', section: b } : { name: 'settings' }
    case 'designs':
      return GALLERY_TABS.includes(b as GalleryTab) && b !== 'themes'
        ? { name: 'designs', tab: b as GalleryTab }
        : { name: 'designs' }
    case 'designer':
      return b ? { name: 'designer', id: b } : { name: 'designs' }
    case 'studio':
      return STUDIO_SECTIONS.includes(b as StudioSection)
        ? { name: 'studio', section: b as StudioSection }
        : { name: 'studio' }
    case 'history':
      return { name: 'history' }
    case 'plans':
      return { name: 'plans' }
    case 'account':
      return { name: 'account' }
    case 'import':
      return b === 'streamelements' || b === 'streamlabs'
        ? { name: 'import', source: b }
        : { name: 'import' }
    default:
      return { name: 'home' }
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'alerts':
      return r.rule ? `#/alerts/${encodeURIComponent(r.rule)}` : '#/alerts'
    case 'overlay':
      return `#/overlays/${encodeURIComponent(r.id)}`
    case 'settings':
      return r.section ? `#/settings/${r.section}` : '#/settings'
    case 'community':
      return r.section ? `#/community/${r.section}` : '#/community'
    case 'import':
      return r.source ? `#/import/${r.source}` : '#/import'
    case 'designs':
      return r.tab && r.tab !== 'themes' ? `#/designs/${r.tab}` : '#/designs'
    case 'designer':
      return `#/designer/${encodeURIComponent(r.id)}`
    case 'studio':
      return r.section ? `#/studio/${r.section}` : '#/studio'
    default:
      return `#/${r.name}`
  }
}

export function go(r: Route): void {
  const h = href(r)
  if (location.hash !== h) location.hash = h
}

// ------------------------------------------------------------------ leave guard
// An editor with unsaved changes can stop in-app navigation (links, go(), Back): the hash
// is put back before any screen sees it, and the editor asks what to do. This listener is
// added when the module loads, so it runs before the route subscribers below.

/** Returns true to keep the reader here; `to` is the hash they tried to open. */
type LeaveGuard = (to: string) => boolean
let guard: LeaveGuard | null = null
let current = typeof location === 'undefined' ? '' : location.hash
let passing = false

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = location.hash
    if (!passing && guard && next !== current && guard(next)) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}${current}`)
      return
    }
    passing = false
    current = next
  })
}

/** Sets (or with null, clears) the one leave guard. Returns a function that clears it. */
export function setLeaveGuard(g: LeaveGuard | null): () => void {
  guard = g
  current = location.hash
  return () => {
    if (guard === g) guard = null
  }
}

/** Opens `hash` past the guard (the reader chose to leave). */
export function leaveTo(hash: string): void {
  if (location.hash === hash) return
  passing = true
  location.hash = hash
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => '',
  )
  return parseRoute(hash)
}
