// Pro tip page branding and goal page (API.md §9.2). The relay checks Pro, stores the
// colours, avatar, banner and goal, and draws the public pages; the engine passes calls
// through. The contrast rules mirror the relay's (`crates/relay/src/tips/brand.rs`), so the
// dashboard can show the fix before saving; the relay stays the judge.

import type { FerroClient } from './client'

/** One automatic change the relay made to a picked colour. */
export interface TipBrandChange {
  field: 'text' | 'accent'
  from: string
  to: string
  contrast_before: number
  contrast_after: number
  message: string
}

/** `GET /api/v1/tips/brand`. Colours are `#rrggbb` or all null (the default look). */
export interface TipBrand {
  accent: string | null
  background: string | null
  text: string | null
  avatar_url: string | null
  banner_url: string | null
  /** The tip page shows it now (the install is Pro). */
  applied: boolean
  /** Only in a PUT answer: what was fixed for contrast. */
  changes: TipBrandChange[]
}

export interface TipColours {
  accent: string
  background: string
  text: string
}

export type TipImageKind = 'avatar' | 'banner'

/** `GET /api/v1/tips/goal` (404 `not_found` without one). */
export interface TipGoal {
  title: string
  /** Minor units of `currency` (₹500 is 50000). */
  target: number
  currency: string
  /** Minor-unit digits of `currency` (2 for INR). */
  digits: number
  starts_at: number
  ends_at: number | null
  ended: boolean
  /** Verified tips in `currency` since `starts_at`, refunds taken off. */
  raised: number
  tips: number
  page_url: string | null
  /** The same page for OBS: transparent, reloads every 30 s. */
  overlay_url: string | null
}

export interface TipGoalInput {
  title: string
  target: number
  currency: string
  ends_at?: number | null
}

export const TIP_BRAND_LIMITS = {
  avatarBytes: 1_000_000,
  bannerBytes: 3_000_000,
  avatarSize: [512, 512],
  bannerSize: [1500, 500],
  imagesPerDay: 30,
  goalTitleMax: 60,
  goalMaxDays: 366,
  textContrast: 4.5,
  accentContrast: 3,
} as const

export const TIP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** The free tip page's look (what the page shows without branding). */
export const DEFAULT_TIP_COLOURS: TipColours = {
  accent: '#3461f5',
  background: '#0c0e12',
  text: '#eef0f4',
}

// ── Colours (mirrors the relay) ──────────────────────────────────────────────────────

type Rgb = [number, number, number]

/** `#rrggbb` or `#rgb` → normalised `#rrggbb`, or null. */
export function normaliseHex(s: string): string | null {
  const h = s.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(h)) return null
  if (!s.trim().startsWith('#')) return null
  if (h.length === 3) return `#${[...h].map((c) => c + c).join('')}`.toLowerCase()
  if (h.length === 6) return `#${h}`.toLowerCase()
  return null
}

function rgb(hex: string): Rgb {
  const h = (normaliseHex(hex) ?? '#000000').slice(1)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function luminance(c: Rgb): number {
  const ch = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])
}

/** WCAG contrast ratio of two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))]
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * t)) as Rgb
}

/** `fg` moved towards white or black until it has `min` contrast on `bg`. */
export function readableOn(fg: string, bg: string, min: number): string {
  const f = normaliseHex(fg) ?? '#000000'
  if (contrastRatio(f, bg) >= min) return f
  const target: Rgb =
    contrastRatio('#ffffff', bg) >= contrastRatio('#000000', bg) ? [255, 255, 255] : [0, 0, 0]
  for (let step = 1; step <= 100; step++) {
    const c = hex(mix(rgb(f), target, step / 100))
    if (contrastRatio(c, bg) >= min) return c
  }
  return hex(target)
}

/** What the relay will save for these colours, and what it will say it changed. */
export function fixTipColours(c: TipColours): { colours: TipColours; changes: TipBrandChange[] } {
  const bg = normaliseHex(c.background) ?? DEFAULT_TIP_COLOURS.background
  const out: TipColours = {
    accent: normaliseHex(c.accent) ?? DEFAULT_TIP_COLOURS.accent,
    background: bg,
    text: normaliseHex(c.text) ?? DEFAULT_TIP_COLOURS.text,
  }
  const changes: TipBrandChange[] = []
  for (const [field, min] of [
    ['text', TIP_BRAND_LIMITS.textContrast],
    ['accent', TIP_BRAND_LIMITS.accentContrast],
  ] as const) {
    const from = out[field]
    const to = readableOn(from, bg, min)
    if (to !== from) {
      const before = Math.round(contrastRatio(from, bg) * 10) / 10
      const after = Math.round(contrastRatio(to, bg) * 10) / 10
      const what = field === 'text' ? 'Text' : 'The accent'
      changes.push({
        field,
        from,
        to,
        contrast_before: before,
        contrast_after: after,
        message: `${what} was ${before.toFixed(1)}:1 on your background, under ${min}:1, so it's now ${to} (${after.toFixed(1)}:1) to stay readable.`,
      })
      out[field] = to
    }
  }
  return { colours: out, changes }
}

/** The page's full palette, the way the relay draws it (for the live preview). */
export function tipPalette(c: TipColours | null): {
  bg: string
  glow: string
  fg: string
  muted: string
  accent: string
  onAccent: string
  surface: string
  line: string
} {
  if (!c)
    return {
      bg: '#0c0e12',
      glow: '#1b2a5c',
      fg: '#eef0f4',
      muted: '#9aa3b2',
      accent: '#3461f5',
      onAccent: '#ffffff',
      surface: '#151a24',
      line: '#263047',
    }
  const { colours } = fixTipColours(c)
  const bg = rgb(colours.background)
  const fg = rgb(colours.text)
  const m = hex(mix(fg, bg, 0.3))
  const muted = contrastRatio(m, colours.background) >= TIP_BRAND_LIMITS.textContrast ? m : colours.text
  const onAccent =
    contrastRatio('#ffffff', colours.accent) >= contrastRatio('#000000', colours.accent)
      ? '#ffffff'
      : '#000000'
  return {
    bg: colours.background,
    glow: hex(mix(bg, rgb(colours.accent), 0.22)),
    fg: colours.text,
    muted,
    accent: colours.accent,
    onAccent,
    surface: hex(mix(bg, fg, 0.06)),
    line: hex(mix(bg, fg, 0.16)),
  }
}

// ── Images and goal ──────────────────────────────────────────────────────────────────

/** The plain reason a file can't be uploaded, before sending it (the relay checks again). */
export function tipImageProblem(kind: TipImageKind, file: { type: string; size: number }): string | null {
  if (!(TIP_IMAGE_TYPES as readonly string[]).includes(file.type))
    return `${kind === 'avatar' ? 'Avatars' : 'Banners'} can be PNG, JPEG or WebP.`
  const max = kind === 'avatar' ? TIP_BRAND_LIMITS.avatarBytes : TIP_BRAND_LIMITS.bannerBytes
  if (file.size > max)
    return `${kind === 'avatar' ? 'Avatars' : 'Banners'} can be up to ${max / 1_000_000} MB.`
  if (file.size === 0) return 'The file is empty.'
  return null
}

/** Minor-unit digits (ISO 4217, as the relay counts them). */
export function currencyDigits(currency: string): number {
  const c = currency.toUpperCase()
  if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3
  if (
    [
      'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF',
      'XOF', 'XPF', 'UGX',
    ].includes(c)
  )
    return 0
  return 2
}

/** "5000" or "5,000.50" in major units → minor units, or null. */
export function majorToMinor(raw: string, currency: string): number | null {
  const s = raw.trim().replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const d = currencyDigits(currency)
  const [whole = '0', frac = ''] = s.split('.')
  if (frac.length > d) return null
  const n = Number(whole) * 10 ** d + Number((frac + '0'.repeat(d)).slice(0, d) || '0')
  return Number.isSafeInteger(n) ? n : null
}

export function tipGoalProblem(g: { title: string; target: string; currency: string; ends: string }): {
  title?: string
  target?: string
  currency?: string
  ends?: string
} {
  const out: { title?: string; target?: string; currency?: string; ends?: string } = {}
  const t = Array.from(g.title.trim()).length
  if (t < 1 || t > TIP_BRAND_LIMITS.goalTitleMax)
    out.title = `The goal title must be 1 to ${TIP_BRAND_LIMITS.goalTitleMax} characters.`
  if (!/^[A-Za-z]{3}$/.test(g.currency.trim())) out.currency = 'Use a 3-letter code like INR or USD.'
  const minor = majorToMinor(g.target, g.currency.trim() || 'INR')
  if (minor === null || minor < 1) out.target = 'Enter an amount above 0.'
  if (g.ends) {
    const at = Date.parse(g.ends)
    if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + TIP_BRAND_LIMITS.goalMaxDays * 86_400_000)
      out.ends = 'Pick a date in the future, within a year.'
  }
  return out
}

// ── Routes ───────────────────────────────────────────────────────────────────────────

/** Branding and goal routes on a dashboard client. */
export function tipBrandApi(c: FerroClient) {
  return {
    brand: () => c.request<TipBrand>('GET', '/api/v1/tips/brand'),
    saveColours: (colours: TipColours) => c.request<TipBrand>('PUT', '/api/v1/tips/brand', colours),
    resetColours: () => c.request<void>('DELETE', '/api/v1/tips/brand'),
    /** The file goes as the raw body; its type becomes the Content-Type. */
    uploadImage: (kind: TipImageKind, file: Blob) =>
      c.request<TipBrand>('PUT', `/api/v1/tips/brand/${kind}`, undefined, file),
    deleteImage: (kind: TipImageKind) => c.request<void>('DELETE', `/api/v1/tips/brand/${kind}`),
    goal: () => c.request<TipGoal>('GET', '/api/v1/tips/goal'),
    saveGoal: (g: TipGoalInput) => c.request<TipGoal>('PUT', '/api/v1/tips/goal', g),
    deleteGoal: () => c.request<void>('DELETE', '/api/v1/tips/goal'),
  }
}
