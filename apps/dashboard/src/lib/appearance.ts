// How the dashboard looks to this person: text size, row density, reduced motion, the meters'
// colours and the colour of what's picked (OBS's Appearance and Accessibility settings). Kept in
// this browser or window, since it depends on the screen and the eyes in front of it; applied to
// the page's root so every screen follows.

export type Density = 'compact' | 'normal' | 'comfortable'
export type MeterPreset = 'default' | 'colorblind' | 'custom'

export interface Appearance {
  /** Text and spacing size in percent, 90 to 130. */
  scale: number
  density: Density
  /** Motion off, whatever the computer's setting says. */
  reduceMotion: boolean
  meters: MeterPreset
  /** The meters' colours when `meters` is `custom`: normal, getting loud, clipping. */
  custom: { ok: string; warn: string; clip: string }
  /** The colour of what's picked, or null for Ferrocast blue. */
  select: string | null
}

export const SCALE_MIN = 90
export const SCALE_MAX = 130
export const SCALE_STEP = 5

export const DEFAULT_APPEARANCE: Appearance = {
  scale: 100,
  density: 'normal',
  reduceMotion: false,
  meters: 'default',
  custom: { ok: '#2fb36b', warn: '#e8b21a', clip: '#e5484d' },
  select: null,
}

/** Colours that stay apart for red-green colour blindness (Okabe and Ito's palette). */
export const COLORBLIND = { ok: '#0072b2', warn: '#f0e442', clip: '#d55e00', select: '#0072b2' }

export const APPEARANCE_KEY = 'fc-appearance'
export const APPEARANCE_EVENT = 'fc-appearance'

const HEX = /^#[0-9a-f]{6}$/i

/** A saved value read back safely: anything odd falls back to the default. */
export function parseAppearance(raw: unknown): Appearance {
  const d = DEFAULT_APPEARANCE
  if (typeof raw !== 'object' || raw === null) return d
  const o = raw as Record<string, unknown>
  const scale =
    typeof o.scale === 'number' && Number.isFinite(o.scale)
      ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(o.scale / SCALE_STEP) * SCALE_STEP))
      : d.scale
  const hex = (v: unknown, fallback: string) =>
    typeof v === 'string' && HEX.test(v) ? v : fallback
  const c =
    typeof o.custom === 'object' && o.custom !== null ? (o.custom as Record<string, unknown>) : {}
  return {
    scale,
    density: o.density === 'compact' || o.density === 'comfortable' ? o.density : 'normal',
    reduceMotion: o.reduceMotion === true,
    meters: o.meters === 'colorblind' || o.meters === 'custom' ? o.meters : 'default',
    custom: {
      ok: hex(c.ok, d.custom.ok),
      warn: hex(c.warn, d.custom.warn),
      clip: hex(c.clip, d.custom.clip),
    },
    select: typeof o.select === 'string' && HEX.test(o.select) ? o.select : null,
  }
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY)
    return raw ? parseAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** The meters' three colours now, or null for the theme's own. */
export function meterColors(a: Appearance): { ok: string; warn: string; clip: string } | null {
  if (a.meters === 'colorblind') return COLORBLIND
  if (a.meters === 'custom') return a.custom
  return null
}

/** Puts the choices on the page's root: a font size, data attributes and colour variables. */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  if (a.scale === 100) root.style.removeProperty('font-size')
  else root.style.fontSize = `${a.scale}%`
  root.dataset.density = a.density
  if (a.reduceMotion) root.dataset.reduceMotion = 'true'
  else delete root.dataset.reduceMotion
  const set = (name: string, v: string | null) =>
    v ? root.style.setProperty(name, v) : root.style.removeProperty(name)
  const m = meterColors(a)
  set('--fc-meter-ok', m?.ok ?? null)
  set('--fc-meter-warn', m?.warn ?? null)
  set('--fc-meter-clip', m?.clip ?? null)
  const pick = a.select ?? (a.meters === 'colorblind' ? COLORBLIND.select : null)
  set('--fc-pick', pick)
  set('--fc-pick-hover', pick)
}

/** Saves, applies and tells the open screens. */
export function setAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a))
  } catch {
    // The choice still applies until the window closes.
  }
  applyAppearance(a)
  window.dispatchEvent(new Event(APPEARANCE_EVENT))
}
