// The ten looks (Settings › Appearance). Which one is on is kept in the engine's settings
// (`theme`) and mirrored in this browser (`fc-theme`) so the page can apply it before its first
// paint. The colours live in packages/ui/src/styles/tokens.css, one block per theme.

import { THEME_IDS, type ThemeId, type ThemePref } from '@ferrocast/api'

export type ThemeKind = 'dark' | 'light'

export interface ThemeInfo {
  id: ThemeId
  name: string
  kind: ThemeKind
  /** One calm line for its card. */
  blurb: string
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    kind: 'dark',
    blurb: 'Soft charcoal, neutral grey. Calm for long streams.',
  },
  {
    id: 'slate',
    name: 'Slate',
    kind: 'dark',
    blurb: 'Blue-grey, cooler and a little brighter. The default dark.',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    kind: 'dark',
    blurb: 'Dusky indigo-grey with a gentle violet tint, like a night sky.',
  },
  {
    id: 'forest',
    name: 'Forest',
    kind: 'dark',
    blurb: 'Deep green-grey. Easy on the eyes, pairs well with green screens.',
  },
  {
    id: 'ember',
    name: 'Ember',
    kind: 'dark',
    blurb: 'Warm brown-grey, like a dim room lit by a lamp.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    kind: 'dark',
    blurb: 'Near-black, for OLED screens and dark rooms.',
  },
  {
    id: 'daylight',
    name: 'Daylight',
    kind: 'light',
    blurb: 'Bright white panels on a pale grey page. The default light.',
  },
  {
    id: 'mist',
    name: 'Mist',
    kind: 'light',
    blurb: 'Blue-grey light with no pure white anywhere. Much less glare.',
  },
  {
    id: 'linen',
    name: 'Linen',
    kind: 'light',
    blurb: 'Warm off-white, like paper. Soft for daytime streams.',
  },
  {
    id: 'contrast',
    name: 'High contrast',
    kind: 'light',
    blurb: 'Black lines and text on white, for low vision and bright rooms.',
  },
]

export const DEFAULT_DARK: ThemeId = 'slate'
export const DEFAULT_LIGHT: ThemeId = 'daylight'

export const THEME_KEY = 'fc-theme'
/** Fired on `window` whenever a choice is put on the page, so other parts follow at once. */
export const THEME_APPLIED_EVENT = 'fc-theme-applied'

/** Whether the computer asks for a light page (false where there is no `matchMedia`). */
export function prefersLight(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
}
/** The last theme chosen of each kind, so the quick dark/light switch comes back to it. */
const LAST_KEY = { dark: 'fc-theme-dark', light: 'fc-theme-light' } as const

const KNOWN = new Set<string>(['system', 'dark', 'light', ...THEME_IDS])

/** A saved value read back safely: anything odd follows the computer. */
export function parseThemePref(raw: unknown): ThemePref {
  return typeof raw === 'string' && KNOWN.has(raw) ? (raw as ThemePref) : 'system'
}

/** The theme actually shown: `system` by the computer, `dark` and `light` as Slate and Daylight. */
export function resolvedTheme(pref: ThemePref, prefersLight: boolean): ThemeId {
  if (pref === 'system') return prefersLight ? DEFAULT_LIGHT : DEFAULT_DARK
  if (pref === 'dark') return DEFAULT_DARK
  if (pref === 'light') return DEFAULT_LIGHT
  return pref
}

export function kindOf(pref: ThemePref, prefersLight: boolean): ThemeKind {
  const id = resolvedTheme(pref, prefersLight)
  return THEMES.find((t) => t.id === id)?.kind ?? 'dark'
}

function remember(kind: ThemeKind, id: ThemeId) {
  try {
    localStorage.setItem(LAST_KEY[kind], id)
  } catch {
    // Storage blocked: the quick switch uses the defaults.
  }
}

/** Puts a choice on the page and keeps it here; `system` clears both. */
export function applyThemePref(pref: ThemePref, root: HTMLElement = document.documentElement) {
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // Private mode: the choice still applies until the window closes.
  }
  if (pref !== 'system') {
    const id = resolvedTheme(pref, false)
    remember(THEMES.find((t) => t.id === id)?.kind ?? 'dark', id)
  }
  window.dispatchEvent(new Event(THEME_APPLIED_EVENT))
}

/** The last theme chosen of this kind (Slate or Daylight before any choice). */
export function lastTheme(kind: ThemeKind): ThemeId {
  let last: string | null = null
  try {
    last = localStorage.getItem(LAST_KEY[kind])
  } catch {
    // ignore
  }
  const id = THEMES.find((t) => t.id === last && t.kind === kind)?.id
  return id ?? (kind === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT)
}

/** Where the quick dark/light switch goes from `pref`: the last theme of the other kind. */
export function counterpart(pref: ThemePref, prefersLight: boolean): ThemeId {
  return lastTheme(kindOf(pref, prefersLight) === 'dark' ? 'light' : 'dark')
}
