// Opening web pages (sign-in pages, checkout, tip pages) from the dashboard.
//
// In the Mac/Windows/Linux app the dashboard runs in a Tauri webview that has no IPC on
// purpose (the window loads our local server). The app's own window handlers open web pages
// with the Tauri opener instead: a navigation away from the dashboard and a request for a new
// window both go to the default browser. A plain `<a target="_blank">` used to do nothing
// there (1.0.0), so every link to the web goes through `openExternal`.

import type { MouseEvent } from 'react'

/** The http(s) URL, or null for anything else (`javascript:`, `file:`, junk). */
export function webUrl(raw: string, base = window.location.href): URL | null {
  if (!raw.trim()) return null
  try {
    const u = new URL(raw, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/** True in the desktop app's window (not a linked browser or a phone). */
export function inDesktopApp(): boolean {
  const f = window.__FERROCAST__
  return !!f && f.remote !== true && (f.desktop === true || typeof f.token === 'string')
}

/** How `openExternal` opens a URL: through the window's navigation, a new window, or not at all. */
export function externalPlan(raw: string): { how: 'navigate' | 'window' | 'none'; url: string } {
  const u = webUrl(raw)
  if (!u) return { how: 'none', url: '' }
  // In the desktop app the window's navigation handler sends a page on another origin to
  // the browser and keeps the dashboard. Unlike a new window, that needs no click in
  // progress (a link that arrives a moment later still opens).
  if (inDesktopApp() && u.origin !== window.location.origin) return { how: 'navigate', url: u.href }
  // Elsewhere a new tab; same-origin pages (an overlay or tip page served by this PC) ask
  // for a new window, which the desktop app also hands to the browser.
  return { how: 'window', url: u.href }
}

/**
 * Opens a web page outside the dashboard: in the default browser from the desktop app, in a
 * new tab elsewhere. Returns false when the URL isn't a web page (nothing opens).
 */
export function openExternal(raw: string): boolean {
  const { how, url } = externalPlan(raw)
  if (how === 'navigate') window.location.assign(url)
  else if (how === 'window') window.open(url, '_blank', 'noopener,noreferrer')
  return how !== 'none'
}

/** Props for an `<a>` that opens `href` with `openExternal` (right-click copy still works). */
export function externalLink(href: string) {
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      openExternal(href)
    },
  } as const
}
