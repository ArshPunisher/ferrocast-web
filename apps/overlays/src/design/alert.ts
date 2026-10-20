// Renders an alert dressed by an alert design (API.md §4 Designs): the look's frame, layout,
// media, font, colours, highlight, shadow and outline, its entrance, exit and text
// animations, the text delay, and, on built-ins only, the small Spark mark where the design
// puts it. Viewer text goes in through textContent only (R-37); every value from the look is
// checked again here before it reaches CSS.

import { checkCss, isColor, isMediaRef } from '@ferrocast/api/design'
import type { AlertLook, BrandSpot, RenderedAlert, TextPart } from '@ferrocast/api/types'
import { EVENT_ICON_PATHS, EVENT_ICON_VIEWBOX } from '@ferrocast/ui/event-icons'
import designCss from '../styles/design-alert.css?inline'
import { el, mediaRef, safeText, warnOnce } from '../dom'
import { fontStack } from './fonts'
import { EASE_IN, EASE_OUT, IN, OUT, textAnimation, type Animate } from './motion'
import { sparkSvg } from './spark'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CANVAS_W = 800
const CANVAS_H = 450
const FRAMES = new Set(['plate', 'neon', 'comic', 'glass', 'pixel', 'banner', 'pill', 'none'])
const LAYOUTS = new Set(['above', 'left', 'right', 'over', 'text', 'custom'])
const SHADOW: Record<string, string> = {
  none: 'none',
  soft: '0 2px 14px rgb(0 0 0 / 0.55)',
  hard: '3px 3px 0 rgb(0 0 0 / 0.9)',
  glow: '0 0 16px var(--hl), 0 0 2px var(--hl)',
}
const LIGHT_PLATES = new Set(['comic'])

export interface DesignAlertOptions {
  lowMotion: boolean
  /** Where bundled `asset:` files live, relative to the page (default `designs/assets/`). */
  assetBase?: string
  /** Turns a library media id into a URL (default: the overlay's own `media/<id>`). */
  mediaUrl?: (ref: string) => string | null
}

export interface DesignAlert {
  readonly host: HTMLElement
  /** Starts the entrance and text animations. */
  start(): void
  /** Plays the exit and returns how long it takes, in ms. */
  exit(): number
  pause(): void
  resume(): void
  destroy(): void
}

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d
const color = (v: unknown, d: string) => (isColor(v) ? (v as string) : d)

/** Splits the headline into words (no break inside) and letters (for text animation). */
function titleNode(parts: TextPart[]): HTMLElement {
  const h = el('div', 'fa-title')
  h.dir = 'auto'
  let budget = 300
  for (const part of parts) {
    if (budget <= 0) break
    const text = safeText(part.text, budget)
    budget -= Array.from(text).length
    for (const p of text.split(/(\s+)/)) {
      if (!p) continue
      if (/^\s+$/.test(p)) {
        h.append(document.createTextNode(' '))
        continue
      }
      const w = el('span', part.hl ? 'w hl' : 'w')
      for (const c of Array.from(p)) w.append(el('span', 'ch', c))
      h.append(w)
    }
  }
  return h
}

function bodyNode(parts: TextPart[]): HTMLElement {
  const b = el('div', 'fa-body')
  b.dir = 'auto'
  let budget = 500
  for (const part of parts) {
    if (budget <= 0) break
    const text = safeText(part.text, budget)
    budget -= Array.from(text).length
    b.append(part.hl ? el('span', 'hl', text) : document.createTextNode(text))
  }
  return b
}

function emblem(key: string): HTMLElement {
  const box = el('div', 'fa-emblem')
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', EVENT_ICON_VIEWBOX)
  svg.setAttribute('aria-hidden', 'true')
  for (const d of EVENT_ICON_PATHS[key] ?? EVENT_ICON_PATHS.redeem ?? []) {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  box.appendChild(svg)
  return box
}

function isVideo(url: string, kind: string): boolean {
  return kind === 'video' || /^data:video\//i.test(url) || /\.(webm|mp4)(\?|#|$)/i.test(url)
}

function mediaNode(
  a: RenderedAlert,
  look: AlertLook,
  key: string,
  opts: DesignAlertOptions,
): HTMLElement {
  const m = el('div', 'fa-media')
  const kind = look.media?.kind
  if (kind === 'image' || kind === 'video') {
    const ref = look.media.ref
    let url: string | null = null
    if (typeof ref === 'string' && ref.startsWith('asset:') && isMediaRef(ref))
      url = `${opts.assetBase ?? 'designs/assets/'}${ref.slice(6)}`
    else if (a.image) url = opts.mediaUrl ? opts.mediaUrl(a.image) : mediaRef(a.image)
    if (url) {
      if (isVideo(url, kind)) {
        const v = el('video')
        v.muted = true
        v.loop = true
        v.autoplay = true
        v.playsInline = true
        v.setAttribute('playsinline', '')
        v.src = url
        v.addEventListener('error', () => m.replaceChildren(emblem(key)))
        m.appendChild(v)
      } else {
        const i = el('img')
        i.alt = ''
        i.decoding = 'async'
        i.src = url
        i.addEventListener('error', () => m.replaceChildren(emblem(key)))
        m.appendChild(i)
      }
      return m
    }
  }
  m.appendChild(emblem(key))
  return m
}

/** Builds the alert. Throws only for an alert without a usable design (the caller falls back). */
export function buildDesignAlert(a: RenderedAlert, opts: DesignAlertOptions): DesignAlert {
  const view = a.design
  if (!view || typeof view !== 'object' || typeof view.look !== 'object' || view.look === null)
    throw new Error('alert has no design')
  const look = view.look
  const low = opts.lowMotion
  const host = el('div', 'fc-alert-host fc-design-host')
  const root: ShadowRoot | HTMLElement =
    typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host
  const base = document.createElement('style')
  base.textContent = designCss
  root.appendChild(base)

  const stage = el('div', 'fa-stage')
  const frame = FRAMES.has(look.frame) ? look.frame : 'plate'
  const layout = LAYOUTS.has(look.layout) ? look.layout : 'above'
  const card = el('div', `fa f-${frame} lay-${layout}`)
  if (look.plate !== false) card.classList.add('plate')
  if (look.font?.uppercase) card.classList.add('up')
  if (look.font?.italic) card.classList.add('it')
  if (low) stage.classList.add('low')
  card.setAttribute('role', 'status')
  card.dataset.key = String(view.event_key ?? '').replace(/[^a-z]/g, '')
  const st = card.style
  const colors = look.colors ?? ({} as AlertLook['colors'])
  const plate = color(colors.plate, '#101216')
  st.setProperty('--font', fontStack(look.font?.family))
  st.setProperty('--fs', `${num(look.font?.size, 10, 160, 42)}px`)
  st.setProperty('--fw', String(Math.round(num(look.font?.weight, 100, 900, 800))))
  st.setProperty('--ls', `${num(look.font?.letter_spacing, -0.2, 0.5, 0)}em`)
  st.setProperty('--c', color(colors.text, '#eef0f4'))
  st.setProperty('--hl', color(colors.highlight, '#ffa424'))
  st.setProperty('--plate', plate)
  st.setProperty('--accent', color(colors.accent, '#33d4ff'))
  st.setProperty('--olc', color(colors.outline, '#07080a'))
  st.setProperty('--ol', `${num(look.outline, 0, 12, 0)}px`)
  st.setProperty('--sh', SHADOW[look.shadow] ?? 'none')
  st.setProperty('--ms', `${layout === 'over' ? 0 : num(look.media_size, 24, 480, 150)}px`)
  st.setProperty('--ink', LIGHT_PLATES.has(frame) || /^#f/i.test(plate) ? '#0e1014' : '#eef0f4')
  const off = look.offsets ?? { text_x: 0, text_y: 0, media_x: 0, media_y: 0 }
  st.setProperty('--tx', `${num(off.text_x, -400, 400, 0)}px`)
  st.setProperty('--ty', `${num(off.text_y, -400, 400, 0)}px`)
  st.setProperty('--mx', `${num(off.media_x, -400, 400, 0)}px`)
  st.setProperty('--my', `${num(off.media_y, -400, 400, 0)}px`)

  if (frame === 'comic' || frame === 'banner') card.appendChild(el('div', 'fa-deco'))
  card.appendChild(mediaNode(a, look, String(view.event_key ?? ''), opts))
  const text = el('div', 'fa-text')
  const title = titleNode(
    Array.isArray(view.title_parts) ? view.title_parts : [{ text: a.title, hl: false }],
  )
  text.appendChild(title)
  const spot: BrandSpot | null = view.branded === true ? (look.brand ?? 'corner') : null
  if (spot === 'divider') {
    const d = el('div', 'fa-divider')
    d.appendChild(sparkSvg('fa-spark', true))
    text.appendChild(d)
  }
  text.appendChild(
    bodyNode(Array.isArray(view.body_parts) ? view.body_parts : [{ text: a.body, hl: false }]),
  )
  if (spot && spot !== 'divider') text.appendChild(sparkSvg(`fa-spark spot-${spot}`, true))
  card.appendChild(text)
  stage.appendChild(card)
  root.appendChild(stage)

  if (typeof look.css === 'string' && look.css.trim() !== '' && root !== host) {
    const bad = checkCss('css', look.css)
    if (bad) warnOnce('skipped custom CSS that tries to load files', bad)
    else {
      const custom = document.createElement('style')
      custom.textContent = look.css.slice(0, 20_000)
      root.appendChild(custom)
    }
  }

  // Scale the 800×450 alert canvas into the widget box.
  // Layout size, not the on-screen box: a preview that scales its whole stage down (the
  // Alerts page at phone width) would otherwise shrink the alert twice and push it into a
  // corner.
  const fit = () => {
    const r = { width: host.offsetWidth, height: host.offsetHeight }
    if (!r.width || !r.height) return
    const k = Math.min(r.width / CANVAS_W, r.height / CANVAS_H)
    stage.style.transform = `translate(${(r.width - CANVAS_W * k) / 2}px, ${(r.height - CANVAS_H * k) / 2}px) scale(${k})`
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
  ro?.observe(host)

  const anims: Animation[] = []
  const A: Animate = (node, kf, o) => {
    if (!kf.length || typeof (node as HTMLElement).animate !== 'function') return null
    try {
      const an = (node as HTMLElement).animate(kf, o)
      anims.push(an)
      return an
    } catch {
      return null
    }
  }
  const inMs = low ? 200 : num(look.anim?.in_ms, 0, 3000, 600)
  const outMs = low ? 200 : num(look.anim?.out_ms, 0, 3000, 400)
  const delay = num(look.anim?.text_delay_ms, 0, 10_000, 0)
  let paused = false

  return {
    host,
    start() {
      fit()
      const enter = IN[look.anim?.in] ?? IN.fade
      const kf = low ? (look.anim?.in === 'none' ? [] : IN.fade.kf) : enter.kf
      A(card, kf, { duration: inMs, easing: (!low && enter.ease) || EASE_IN, fill: 'both' })
      const t0 = inMs * 0.35 + delay
      for (const c of Array.from(text.children))
        if (!c.classList.contains('fa-spark'))
          A(c, [{ opacity: 0 }, { opacity: 1 }], {
            duration: low ? 1 : 260,
            delay: t0,
            fill: 'both',
            easing: 'ease-out',
          })
      if (!low)
        textAnimation(
          look.anim?.text ?? 'none',
          Array.from(title.querySelectorAll('.ch')),
          Array.from(title.querySelectorAll('.hl')),
          t0,
          A,
        )
      const shard = text.querySelector('.spot-corner .sh, .spot-edge .sh, .spot-badge .sh')
      if (shard)
        A(
          shard,
          low
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translate(10px,-26px) rotate(-18deg)' },
                { opacity: 1, transform: 'translate(0,2px) rotate(3deg)', offset: 0.7 },
                { opacity: 1, transform: 'none' },
              ],
          { duration: 520, delay: inMs + 120, fill: 'both', easing: EASE_IN },
        )
      if (paused) for (const an of anims) an.pause()
    },
    exit() {
      // Loops end before the exit; one-shot animations stay where they finished.
      for (const an of anims) {
        const it = an.effect?.getTiming().iterations
        if (typeof it === 'number' && it > 1) an.cancel()
      }
      const kf = low
        ? look.anim?.out === 'none'
          ? []
          : OUT.fade
        : (OUT[look.anim?.out] ?? OUT.fade)
      A(card, kf.length ? kf : [{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.max(outMs, 1),
        easing: EASE_OUT,
        fill: 'forwards',
      })
      return Math.max(outMs, 1)
    },
    pause() {
      paused = true
      card.classList.add('is-paused')
      stage.classList.add('is-paused')
      for (const an of anims) an.pause()
    },
    resume() {
      paused = false
      card.classList.remove('is-paused')
      stage.classList.remove('is-paused')
      for (const an of anims) if (an.playState === 'paused') an.play()
    },
    destroy() {
      for (const an of anims) an.cancel()
      ro?.disconnect()
      host.remove()
    },
  }
}
