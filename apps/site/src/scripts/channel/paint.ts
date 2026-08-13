// Product UI painted onto canvases for the 3D screens (the desk monitor, the deck display,
// the glass cards). Ported from the site-style studies (design/site-styles/assets/core.js).
// These are pictures of the app inside a 3D object, never page text: the words a visitor
// reads always live in the HTML beside the scene.
import * as THREE from 'three'

export const PLAT = { twitch: '#a970ff', youtube: '#ff3b4e', kick: '#53fc18' } as const
export type Plat = keyof typeof PLAT
export type Line = [Plat, string, string]

export interface UI {
  bg: string
  ink: string
  muted: string
  accent: string
  accent2: string
  onAccent: string
  line: string
  transparent?: boolean
  radius?: number
}

/** The app's own dark UI: screens inside the scenes are always the dark app. */
export const APP_DARK: UI = {
  bg: '#151922',
  ink: '#eef0f4',
  muted: '#9aa1ad',
  accent: '#ffa424',
  accent2: '#33d4ff',
  onAccent: '#16110a',
  line: '#3a404b',
}
export const APP_LIGHT: UI = {
  bg: '#ffffff',
  ink: '#0e1014',
  muted: '#4f5561',
  accent: '#cf7400',
  accent2: '#05678c',
  onAccent: '#0a0600',
  line: '#c9ced7',
}

export function rr(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
export const font = (px: number, weight = 600, display = false) =>
  `${weight} ${px}px ${display ? "'Bricolage Grotesque Variable'" : "'Hanken Grotesk Variable'"}, ui-sans-serif, system-ui, sans-serif`

/** Cut a string to fit a width, ending with an ellipsis. */
function fit(c: CanvasRenderingContext2D, s: string, room: number) {
  if (c.measureText(s).width <= room) return s
  let m = s
  while (m.length > 2 && c.measureText(`${m}...`).width > room) m = m.slice(0, -1)
  return `${m.trimEnd()}...`
}

/** The Spark bolt, simplified for small sizes. */
function bolt(c: CanvasRenderingContext2D, cx: number, cy: number, k: number) {
  c.beginPath()
  ;[
    [40, 4],
    [12, 38],
    [30, 38],
    [23, 60],
    [52, 26],
    [34, 26],
  ].forEach(([x, y], i) => {
    const px = cx + ((x as number) - 32) * k,
      py = cy + ((y as number) - 32) * k
    if (i) c.lineTo(px, py)
    else c.moveTo(px, py)
  })
  c.closePath()
  c.fill()
}

export const paint = {
  alert(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    o: UI & { kicker?: string; title?: string; detail?: string },
  ) {
    const r = o.radius ?? h * 0.18
    c.clearRect(0, 0, w, h)
    if (!o.transparent) {
      c.fillStyle = o.bg
      rr(c, 0, 0, w, h, r)
      c.fill()
    }
    const pad = h * 0.16,
      s = h - pad * 2
    c.fillStyle = o.accent
    rr(c, pad, pad, s, s, s * 0.26)
    c.fill()
    c.fillStyle = o.onAccent
    bolt(c, pad + s / 2, pad + s / 2, s * 0.012)
    const tx = pad * 2 + s,
      room = w - tx - pad
    c.textBaseline = 'alphabetic'
    c.fillStyle = o.muted
    c.font = font(h * 0.15, 600)
    c.fillText(fit(c, o.kicker ?? 'New subscriber', room), tx, pad + h * 0.2)
    c.fillStyle = o.ink
    c.font = font(h * 0.25, 700, true)
    c.fillText(fit(c, o.title ?? 'mirelle_plays', room), tx, pad + h * 0.5)
    c.fillStyle = o.accent2
    c.font = font(h * 0.14, 650)
    c.fillText(fit(c, o.detail ?? 'Tier 1, 7 months', room), tx, pad + h * 0.7)
  },
  chat(c: CanvasRenderingContext2D, w: number, h: number, o: UI & { lines: Line[] }) {
    const r = o.radius ?? w * 0.05
    c.clearRect(0, 0, w, h)
    if (!o.transparent) {
      c.fillStyle = o.bg
      rr(c, 0, 0, w, h, r)
      c.fill()
    }
    const pad = w * 0.06,
      lh = (h - pad * 2) / o.lines.length
    o.lines.forEach(([p, name, msg], i) => {
      const y = pad + i * lh + lh * 0.62
      c.fillStyle = PLAT[p]
      rr(c, pad, y - lh * 0.34, lh * 0.12, lh * 0.42, lh * 0.06)
      c.fill()
      c.font = font(lh * 0.34, 700)
      c.fillStyle = o.ink
      const nx = pad + lh * 0.3
      c.fillText(name, nx, y)
      const nw = c.measureText(name).width
      c.font = font(lh * 0.34, 500)
      c.fillStyle = o.muted
      c.fillText(fit(c, msg, w - pad - (nx + nw + lh * 0.25)), nx + nw + lh * 0.25, y)
    })
  },
  mod(c: CanvasRenderingContext2D, w: number, h: number, o: UI) {
    const r = o.radius ?? h * 0.12
    c.clearRect(0, 0, w, h)
    if (!o.transparent) {
      c.fillStyle = o.bg
      rr(c, 0, 0, w, h, r)
      c.fill()
    }
    const pad = h * 0.12
    c.font = font(h * 0.11, 650)
    c.fillStyle = o.muted
    c.fillText('Held by the link filter', pad, pad + h * 0.1)
    c.fillStyle = o.ink
    c.font = font(h * 0.13, 700)
    c.fillText('spamhaus_99', pad, pad + h * 0.3)
    c.fillStyle = o.muted
    c.font = font(h * 0.12, 500)
    const spam = 'free followers at bit.ly/...'
    c.fillText(spam, pad, pad + h * 0.46)
    c.strokeStyle = o.muted
    c.lineWidth = h * 0.012
    c.beginPath()
    c.moveTo(pad, pad + h * 0.42)
    c.lineTo(pad + c.measureText(spam).width, pad + h * 0.42)
    c.stroke()
    const by = h - pad - h * 0.2,
      bw = (w - pad * 3) / 2
    c.fillStyle = o.accent
    rr(c, pad, by, bw, h * 0.2, h * 0.1)
    c.fill()
    c.fillStyle = o.onAccent
    c.font = font(h * 0.1, 700)
    c.fillText('Ban everywhere', pad + h * 0.08, by + h * 0.13)
    c.strokeStyle = o.line
    c.lineWidth = h * 0.008
    rr(c, pad * 2 + bw, by, bw, h * 0.2, h * 0.1)
    c.stroke()
    c.fillStyle = o.ink
    c.fillText('Time out 10m', pad * 2 + bw + h * 0.08, by + h * 0.13)
  },
  tip(c: CanvasRenderingContext2D, w: number, h: number, o: UI) {
    const r = o.radius ?? h * 0.16
    c.clearRect(0, 0, w, h)
    if (!o.transparent) {
      c.fillStyle = o.bg
      rr(c, 0, 0, w, h, r)
      c.fill()
    }
    const pad = h * 0.16
    c.fillStyle = o.muted
    c.font = font(h * 0.14, 600)
    c.fillText('Tip, straight to you', pad, pad + h * 0.12)
    c.fillStyle = o.ink
    c.font = font(h * 0.34, 700, true)
    c.fillText('₹250', pad, pad + h * 0.5)
    c.fillStyle = o.accent2
    c.font = font(h * 0.13, 600)
    c.fillText('from Dana Okafor, via UPI', pad, pad + h * 0.7)
  },
  goal(c: CanvasRenderingContext2D, w: number, h: number, o: UI) {
    const r = o.radius ?? h * 0.2
    c.clearRect(0, 0, w, h)
    if (!o.transparent) {
      c.fillStyle = o.bg
      rr(c, 0, 0, w, h, r)
      c.fill()
    }
    const pad = h * 0.2
    c.fillStyle = o.ink
    c.font = font(h * 0.2, 700)
    c.fillText('Sub goal', pad, pad + h * 0.16)
    c.fillStyle = o.muted
    c.font = font(h * 0.17, 600)
    const t = '38 / 50'
    c.fillText(t, w - pad - c.measureText(t).width, pad + h * 0.16)
    const by = h - pad - h * 0.18,
      bw = w - pad * 2
    c.fillStyle = o.accent
    rr(c, pad, by, bw * 0.76, h * 0.18, h * 0.09)
    c.fill()
  },
}

/* Canvas textures painted before the web fonts arrive are repainted once they load. */
const TEXTURES = new Set<CanvasTex>()
let fontsReady = false
export const onFonts: (() => void)[] = []
if (typeof document !== 'undefined' && document.fonts?.load) {
  Promise.all([
    document.fonts.load("700 40px 'Bricolage Grotesque Variable'"),
    document.fonts.load("600 40px 'Hanken Grotesk Variable'"),
  ])
    .then(() => {
      fontsReady = true
      TEXTURES.forEach((t) => t.redraw())
      onFonts.forEach((f) => f())
    })
    .catch(() => {})
}

export type CanvasTex = THREE.CanvasTexture & { redraw(): void }
/** A texture painted by draw(); call redraw() to paint it again (theme, state changes). */
export function canvasTex(
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTex {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const tex = new THREE.CanvasTexture(cv) as CanvasTex
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.redraw = () => {
    draw(ctx, w, h)
    tex.needsUpdate = true
  }
  tex.redraw()
  if (!fontsReady) TEXTURES.add(tex)
  return tex
}

/** A soft round blob, for contact shadows and light pools. */
export function blobTex(inner = 'rgba(0,0,0,0.6)', outer = 'rgba(0,0,0,0)') {
  return canvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, inner)
    g.addColorStop(1, outer)
    c.clearRect(0, 0, w, h)
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  })
}
