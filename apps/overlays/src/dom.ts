// DOM helpers. Viewer text only ever goes in through `textContent` (R-37): there is no
// HTML string anywhere in the overlay, and URLs from frames are checked before use.

import { tameText } from '@ferrocast/api/format'
import { ICON_PATHS } from '@ferrocast/ui/platform-icons'

/** Longest piece of viewer text we put on screen. */
export const MAX_TEXT = 500
const SVG_NS = 'http://www.w3.org/2000/svg'

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (className) n.className = className
  if (text !== undefined && text !== null) n.textContent = text
  return n
}

/** Caps and tames viewer text (bidi overrides, zalgo stacks, absurd length). */
export function safeText(s: unknown, max = MAX_TEXT): string {
  if (typeof s !== 'string') return ''
  const tamed = tameText(s.length > max * 4 ? s.slice(0, max * 4) : s)
  const chars = Array.from(tamed)
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : tamed
}

/** A text span that lays out right-to-left text correctly. */
export function textSpan(className: string, text: string, max = MAX_TEXT): HTMLSpanElement {
  const s = el('span', className, safeText(text, max))
  s.dir = 'auto'
  return s
}

function parse(url: string): URL | null {
  try {
    return new URL(url, 'http://127.0.0.1/o/x/')
  } catch {
    return null
  }
}

function isLocal(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
}

/** Images from frames: https, our local server, relative paths and inline images only. */
export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 200_000) return null
  const t = url.trim()
  // Control characters or spaces inside a URL are a smuggling attempt ("java\tscript:").
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f) return null
  }
  if (/^data:image\/(png|jpeg|gif|webp|avif);/i.test(t)) return t
  if (/^blob:/i.test(t)) return t
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    const u = parse(t)
    if (!u) return null
    return u.protocol === 'https:' || isLocal(u) ? u.href : null
  }
  // Relative ("media/abc") or root-relative: served by the engine itself.
  if (t.startsWith('//')) return null
  return t
}

/** Sounds and videos: like images, plus inline audio. */
export function safeMediaUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  if (/^data:(audio|video)\/[a-z0-9.+-]+;/i.test(url.trim())) return url.trim()
  return safeImageUrl(url)
}

/** A platform glyph (Simple Icons path) built as real SVG nodes. */
export function platformGlyph(platform: string, size: number): SVGSVGElement | null {
  const path = (ICON_PATHS as Record<string, string>)[platform]
  if (!path) return null
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', `fc-glyph fc-glyph-${platform}`)
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', path)
  p.setAttribute('fill', 'currentColor')
  svg.appendChild(p)
  return svg
}

export function svgPath(d: string, className: string, viewBox = '0 0 64 64'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  svg.setAttribute('preserveAspectRatio', 'none')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', d)
  svg.appendChild(p)
  return svg
}

/** Relative luminance of `#rrggbb` (WCAG). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0)
}

function mix(hex: string, to: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * amount))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A viewer's name colour, only if it is a plain hex colour, nudged until it reads on the
 * theme's background (dark navy names on a dark card become a lighter navy).
 */
export function readableColor(color: unknown, darkSurface: boolean): string | null {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return null
  let c = color.toLowerCase()
  for (let i = 0; i < 8; i++) {
    const l = luminance(c)
    // AA (4.5:1) against the theme's card: ~0.22 on dark cards, ~0.18 on white ones.
    if (darkSurface ? l >= 0.22 : l <= 0.18) return c
    c = darkSurface ? mix(c, 255, 0.25) : mix(c, 0, 0.25)
  }
  return c
}

export const DARK_THEMES = new Set(['molten', 'arcade', 'minimal'])
export const THEME_IDS = ['molten', 'daylight', 'arcade', 'minimal', 'sticker'] as const
export function themeOf(t: unknown): string {
  return typeof t === 'string' && (THEME_IDS as readonly string[]).includes(t) ? t : 'molten'
}

const warned = new Set<string>()
/** Logs a problem once per kind, so a misbehaving server can't flood the OBS log. */
export function warnOnce(kind: string, detail?: unknown): void {
  if (warned.has(kind)) return
  warned.add(kind)
  console.warn(`[ferrocast overlay] ${kind}`, detail ?? '')
}
