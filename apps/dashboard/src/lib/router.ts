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
  | { name: 'tips' }
  | { name: 'settings'; section?: string }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b] = parts
  switch (a) {
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
    case 'tips':
      return { name: 'tips' }
    case 'settings':
      return b ? { name: 'settings', section: b } : { name: 'settings' }
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
    default:
      return `#/${r.name}`
  }
}

export function go(r: Route): void {
  const h = href(r)
  if (location.hash !== h) location.hash = h
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
