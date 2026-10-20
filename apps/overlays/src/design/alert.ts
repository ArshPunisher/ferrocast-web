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
import { isMotionIn, isMotionOut, isMotionText, motionOf, motionPlan } from '@ferrocast/api/motion'
import {
  Clock,
  Ctx,
  ENTRANCE_SOUND,
  OPENING_IN,
  EXIT_SOUND,
  burst,
  endIdle,
  runEntrance,
  runExit,
  runIdle,
  runText,
  type MotionHost,
  type MotionView,
} from './motion-engine'
import { Particles } from './motion-fx'
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
  /**
   * The alert's sound may play here (the overlay's audio, the designer's sound toggle): the
   * look's impact hits play too when it switches them on. Off by default.
   */
  impactSound?: boolean
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

/** True for a light colour (`#rgb`, `#rrggbb`, `#rrggbbaa`): relative luminance over 0.5. */
export function isLightColor(c: string): boolean {
  const h = c.replace('#', '')
  const full =
    h.length === 3 || h.length === 4 ? [...h.slice(0, 3)].map((x) => x + x).join('') : h.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return false
  const lin = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4) > 0.5
}

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
  // Frosted glass is mostly see-through: a light plate (a cream card's dark words) gets a
  // light pane, or the words vanish on a dark game.
  if (isLightColor(plate)) card.classList.add('plate-light')
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
  // The motion layers (zoom punch, shake, placement, idle loop) around the card; in the
  // middle spot the card sits exactly where it always did.
  const motion = motionOf(look)
  const punch = el('div', 'fa-punch')
  const shk = el('div', 'fa-shk')
  const pos = el('div', 'fa-pos')
  pos.dataset.spot = motion.position
  const wrap = el('div', 'fa-wrap')
  wrap.appendChild(card)
  pos.appendChild(wrap)
  shk.appendChild(pos)
  punch.appendChild(shk)
  stage.appendChild(punch)
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
    scale = k
    fx?.fit(k * (globalThis.devicePixelRatio || 1))
  }
  let scale = 1
  // Made on first use: a look without particles, flashes or a vignette adds nothing.
  let fx: Particles | null = null
  let flash: HTMLElement | null = null
  let vig: HTMLElement | null = null
  let sheen: HTMLElement | null | undefined
  const mv: MotionView = {
    W: CANVAS_W,
    H: CANVAS_H,
    stage,
    punch,
    shk,
    wrap,
    card,
    mini: false,
    colors: {
      accent: color(colors.accent, '#33d4ff'),
      highlight: color(colors.highlight, '#ffa424'),
      text: color(colors.text, '#eef0f4'),
    },
    chars: () => Array.from(title.querySelectorAll<HTMLElement>('.ch')),
    get sheen() {
      if (sheen !== undefined) return sheen
      // Only a card with a plate gets the light band; without one the letters shine.
      let plated: boolean
      try {
        const cs = getComputedStyle(text)
        plated =
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
          cs.backgroundImage !== 'none'
      } catch {
        plated = false
      }
      if (!plated) return (sheen = null)
      const clip = el('div', 'fa-sheen-clip')
      clip.setAttribute('aria-hidden', 'true')
      const band = el('div', 'fa-sheen')
      clip.appendChild(band)
      text.appendChild(clip)
      return (sheen = band)
    },
    get flash() {
      if (!flash) {
        flash = el('div', 'fa-flash')
        flash.setAttribute('aria-hidden', 'true')
        stage.appendChild(flash)
      }
      return flash
    },
    get vig() {
      if (!vig) {
        vig = el('div', 'fa-vig')
        vig.setAttribute('aria-hidden', 'true')
        stage.insertBefore(vig, flash)
      }
      return vig
    },
    get fx() {
      if (!fx) {
        const cv = el('canvas', 'fa-fx')
        cv.setAttribute('aria-hidden', 'true')
        shk.appendChild(cv)
        fx = new Particles(cv, CANVAS_W, CANVAS_H)
        fx.fit(scale * (globalThis.devicePixelRatio || 1))
        if (paused) fx.pause()
      }
      return fx
    },
    clone(cls: string) {
      const c = card.cloneNode(true) as HTMLElement
      c.classList.add('fa-tmp', cls)
      c.removeAttribute('role')
      c.setAttribute('aria-hidden', 'true')
      // A copy never plays a second video (a shattered card would play twenty).
      for (const v of Array.from(c.querySelectorAll('video'))) v.replaceWith(el('div'))
      wrap.appendChild(c)
      return c
    },
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
  let paused = false

  const enterClock = new Clock()
  // What the entrance and text effects leave to tidy if the alert leaves before they finish.
  const tidy: (() => void)[] = []
  const finishEntrance = () => {
    for (const fn of tidy.splice(0)) {
      try {
        fn()
      } catch {
        /* already gone */
      }
    }
    // Letters still waiting to arrive land now, so the exit takes the whole name with it.
    for (const ch of Array.from(title.querySelectorAll('.ch')))
      for (const an of ch.getAnimations?.() ?? []) {
        const it = an.effect?.getTiming().iterations
        if (typeof it === 'number' && Number.isFinite(it))
          try {
            an.finish()
          } catch {
            /* nothing to finish */
          }
      }
  }
  const exitClock = new Clock()
  const host1 = (clock: Clock): MotionHost => ({
    clock,
    track: (an) => {
      anims.push(an)
      if (paused) an.pause()
      return an
    },
    sound: opts.impactSound === true && motion.impact_sounds,
    ownSound: !!a.sound || (look.sound?.builtin ?? 'none') !== 'none',
    volume: num(look.sound?.volume, 0, 100, 70),
    onEnd: (fn) => void tidy.push(fn),
  })
  const intensity = motion.by_amount ? num(view.intensity, 0.6, 2, 1) : 1
  const ctx = new Ctx(mv, motion, host1(enterClock), intensity)
  let idle: Animation[] = []

  return {
    host,
    start() {
      fit()
      const id = look.anim?.in
      const textId = look.anim?.text ?? 'none'
      const chars = mv.chars()
      const plan = motionPlan(look, { chars: chars.length, reduced: low })
      // Waits for the beat (0 unless "Land on the beat" is on).
      const wait = plan.delay
      ctx.off = wait
      const fresh = isMotionIn(id)
      if (fresh && low) {
        // Reduced motion: a short fade, and the entrance still sounds.
        A(card, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 240,
          delay: wait,
          fill: 'both',
          easing: EASE_OUT,
        })
        enterClock.at(wait, () => ctx.sfx(ENTRANCE_SOUND[id], ctx.k, OPENING_IN.has(id)))
      } else if (fresh) {
        runEntrance(id, ctx)
      } else {
        const enter = IN[id as keyof typeof IN] ?? IN.fade
        const kf = low ? (id === 'none' ? [] : IN.fade.kf) : enter.kf
        A(card, kf, {
          duration: inMs,
          delay: wait,
          easing: (!low && enter.ease) || EASE_IN,
          fill: 'both',
        })
        // Particles picked by hand land as a 1.0 entrance finishes (it has none of its own).
        const p = motion.particles
        if (!low && p !== 'auto' && p !== 'none') enterClock.at(wait + inMs, () => burst(ctx, p))
      }
      const t0 = plan.textAt
      // The 1.1 entrances bring the words in with the card.
      if (!fresh || low)
        for (const c of Array.from(text.children))
          if (!c.classList.contains('fa-spark') && !c.classList.contains('fa-sheen-clip'))
            A(c, [{ opacity: 0 }, { opacity: 1 }], {
              duration: low ? 1 : 260,
              delay: t0,
              fill: 'both',
              easing: 'ease-out',
            })
      // A 1.0 look's Typewriter types exactly as it did (no cursor) until the look gets motion.
      const fresher = isMotionText(textId) && !(textId === 'type' && look.motion === undefined)
      if (!low && fresher) {
        // Design time: the engine divides by the speed (the plan is already in real ms).
        const saved = ctx.off
        ctx.off = 0
        runText(textId, ctx, t0 * ctx.speed)
        ctx.off = saved
      } else if (!low)
        textAnimation(
          textId as Parameters<typeof textAnimation>[0],
          chars,
          Array.from(title.querySelectorAll('.hl')),
          t0,
          A,
        )
      if (!low && motion.idle !== 'none')
        enterClock.at(wait + plan.enter, () => (idle = runIdle(motion.idle, ctx)))
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
          {
            duration: 520,
            delay: wait + (fresh ? plan.enter : inMs) + 120,
            fill: 'both',
            easing: EASE_IN,
          },
        )
      if (paused) for (const an of anims) an.pause()
    },
    exit() {
      // What the entrance still had planned (a late hit, the idle loop) never starts now.
      enterClock.kill()
      finishEntrance()
      endIdle(idle, ctx)
      idle = []
      // Loops end before the exit; one-shot animations stay where they finished.
      for (const an of anims) {
        const it = an.effect?.getTiming().iterations
        if (typeof it === 'number' && it > 1) an.cancel()
      }
      const out = look.anim?.out
      if (isMotionOut(out)) {
        const x = new Ctx(mv, motion, host1(exitClock), intensity)
        if (low) {
          A(card, [{ opacity: 1 }, { opacity: 0 }], {
            duration: 220,
            easing: EASE_OUT,
            fill: 'forwards',
          })
          x.sfx(EXIT_SOUND[out])
          return 220
        }
        return Math.max(1, Math.round(runExit(out, x)))
      }
      const kf = low
        ? look.anim?.out === 'none'
          ? []
          : OUT.fade
        : (OUT[out as keyof typeof OUT] ?? OUT.fade)
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
      enterClock.pause()
      exitClock.pause()
      fx?.pause()
    },
    resume() {
      paused = false
      card.classList.remove('is-paused')
      stage.classList.remove('is-paused')
      for (const an of anims) if (an.playState === 'paused') an.play()
      enterClock.resume()
      exitClock.resume()
      fx?.resume()
    },
    destroy() {
      enterClock.kill()
      exitClock.kill()
      finishEntrance()
      fx?.destroy()
      for (const an of anims) an.cancel()
      ro?.disconnect()
      host.remove()
    },
  }
}
