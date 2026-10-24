// Static scene layers (API.md §4 Overlays `layer`): pictures, text, shapes, frames, webcam
// frames and the Spark mark of a built-in design. Text is set with textContent only (R-37);
// every value is checked before it reaches CSS, and media must be a library file or a file
// bundled with the app.
//
// The design library's richer options (API-REQUESTS R20) are drawn here too: silhouettes,
// tiled and particle patterns, frame variants, text effects, per-letter entrances, a
// rotator (lines shown in turn) and a countdown. Unknown values are ignored, never passed on.

import {
  FRAME_VARIANTS,
  SHAPE_CLIPS,
  SHAPE_PATTERNS,
  TEXT_EFFECTS,
  isColor,
  isMediaRef,
} from '@ferrocast/api/design'
import type {
  FrameVariant,
  LayerConfig,
  ShapeClip,
  ShapePattern,
  TextEffect,
  Widget,
} from '@ferrocast/api/types'
import { CLIP_PATH, frameDecor, isParticles, particles } from '../design/decor'
import { fontStack } from '../design/fonts'
import { EASE_IN, IN } from '../design/motion'
import { sparkSvg } from '../design/spark'
import { el, mediaRef, safeText } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d
const color = (v: unknown, d: string | null) => (isColor(v) ? (v as string) : d)
const one = <T extends string>(v: unknown, ok: readonly T[], d: T): T =>
  ok.includes(v as T) ? (v as T) : d
const opt = <T extends string>(v: unknown, ok: readonly T[]): T | null =>
  ok.includes(v as T) ? (v as T) : null
const SHADOW: Record<string, string> = {
  none: 'none',
  soft: '0 4px 24px rgb(0 0 0 / 0.55)',
  hard: '4px 4px 0 rgb(0 0 0 / 0.85)',
  glow: '0 0 22px currentColor',
}
/** Shape shadows follow the silhouette (a filter on the layer, so clip-paths keep them). */
const SHAPE_SHADOW: Record<string, string> = {
  soft: 'drop-shadow(0 10px 22px rgb(0 0 0 / 0.5))',
  hard: 'drop-shadow(6px 6px 0 rgb(0 0 0 / 0.85))',
  glow: 'drop-shadow(0 0 14px var(--glow))',
}
const MAX_ROTATE = 8
const MAX_CHARS_SPLIT = 120

/** `{time}` for a countdown: m:ss, or h:mm:ss from an hour up. */
export function clockText(secs: number): string {
  const s = Math.max(0, Math.ceil(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}

/** Applies a widget's rotation, opacity and hidden flag (shared by every widget kind). */
export function applyTransform(node: HTMLElement, w: Widget): void {
  const rot = num(w.rotation, -360, 360, 0)
  node.style.rotate = rot ? `${rot}deg` : ''
  const op = num(w.opacity, 0, 1, 1)
  node.style.opacity = op === 1 ? '' : String(op)
  // A class, not the `hidden` attribute: goal and label widgets hide themselves when they
  // have nothing to show, and the streamer's own "hide" must not clash with that.
  node.classList.toggle('is-user-hidden', w.hidden === true)
}

type TextCfg = Extract<LayerConfig, { type: 'text' }>

export class LayerWidget implements WidgetView {
  readonly el: HTMLElement
  private key = ''
  private shown = false
  private id = ''
  private box = { w: 0, h: 0 }
  private visible = true
  /** The rotator's and countdown's ticking. */
  private timer: ReturnType<typeof setInterval> | null = null
  private textEl: HTMLElement | null = null
  private items: string[] = []
  private at = 0
  private countFrom = 0
  private endsAt = 0

  constructor(
    w: Widget & { kind: 'layer' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('div', 'fc-w fc-w-layer')
    this.el.setAttribute('aria-hidden', 'true')
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'layer') return
    place(this.el, w)
    applyTransform(this.el, w)
    const box = { w: Math.max(1, num(w.w, 1, 10_000, 1)), h: Math.max(1, num(w.h, 1, 10_000, 1)) }
    const key = JSON.stringify([w.config, box.w, box.h])
    if (key === this.key) return
    this.key = key
    this.id = String(w.id)
    this.box = box
    this.stopTicking()
    this.render(w.config)
    if (this.shown) {
      this.applyMotion()
      this.startTicking()
    }
  }

  /** The layer's loop: a pattern's own drift, or the gentle loop asked for (never in low motion). */
  private applyMotion(): void {
    for (const cls of Array.from(this.el.classList))
      if (cls === 'is-moving' || cls.startsWith('fc-loop-')) this.el.classList.remove(cls)
    const c = this.config()
    const loop = opt(c?.anim?.loop, ['float', 'pulse', 'shimmer'] as const)
    if (!loop || this.ctx.lowMotion()) return
    const patterned = c?.type === 'shape' && typeof c.pattern === 'string'
    const framed = c?.type === 'frame' || c?.type === 'webcam'
    this.el.classList.add(patterned || framed ? 'is-moving' : `fc-loop-${loop}`)
  }

  private config(): LayerConfig | null {
    try {
      return (JSON.parse(this.key) as [LayerConfig])[0] ?? null
    } catch {
      return null
    }
  }

  private render(c: LayerConfig): void {
    const node = this.el
    node.replaceChildren()
    this.textEl = null
    node.dataset.type = typeof c?.type === 'string' ? c.type.replace(/[^a-z]/g, '') : ''
    node.style.removeProperty('filter')
    node.style.removeProperty('--glow')
    const s = node.style
    switch (c?.type) {
      case 'image': {
        const ref = typeof c.media === 'string' && isMediaRef(c.media) ? c.media : null
        const url = ref
          ? ref.startsWith('asset:')
            ? `designs/assets/${ref.slice(6)}`
            : mediaRef(ref)
          : null
        if (url) {
          const i = el('img', 'fc-layer-img')
          i.alt = ''
          i.decoding = 'async'
          i.src = url
          i.style.objectFit = one(c.fit, ['cover', 'contain', 'fill'] as const, 'cover')
          i.addEventListener('error', () => i.remove())
          node.appendChild(i)
        }
        s.borderRadius = `${num(c.radius, 0, 2000, 0)}px`
        break
      }
      case 'text':
        this.renderText(c)
        break
      case 'shape':
        this.renderShape(c)
        break
      case 'frame':
      case 'webcam': {
        const style = one(c.style, ['line', 'double', 'corners', 'notch', 'glow'] as const, 'line')
        const variant = opt<FrameVariant>(c.variant, FRAME_VARIANTS)
        const f = el('div', `fc-frame fc-frame-${style}`)
        if (variant) f.classList.add(`fv-${variant}`)
        f.style.setProperty('--f-color', color(c.color, '#ffa424') ?? '#ffa424')
        f.style.setProperty('--f-accent', color(c.accent, '#33d4ff') ?? '#33d4ff')
        f.style.setProperty('--f-w', `${num(c.thickness, 1, 40, 3)}px`)
        f.style.setProperty('--f-r', `${num(c.radius, 0, 400, 12)}px`)
        if (style === 'corners' && variant !== 'hud')
          for (const k of ['tl', 'tr', 'bl', 'br'])
            f.appendChild(el('span', `fc-corner fc-corner-${k}`))
        if (variant) for (const d of frameDecor(variant, this.id, this.box)) f.appendChild(d)
        const label = safeText(c.label, 40)
        if (label) f.appendChild(el('span', 'fc-frame-label', label))
        node.appendChild(f)
        break
      }
      case 'brand': {
        const variant = one(c.variant, ['mark', 'badge', 'watermark'] as const, 'mark')
        const wrap = el('div', `fc-brand fc-brand-${variant}`)
        wrap.style.color = color(c.color, '#eef0f4') ?? '#eef0f4'
        wrap.appendChild(sparkSvg('fc-brand-mark'))
        node.appendChild(wrap)
        break
      }
      default:
        break
    }
  }

  private renderShape(c: Extract<LayerConfig, { type: 'shape' }>): void {
    const node = this.el
    const kind = one(c.shape, ['rect', 'ellipse', 'line', 'slant', 'triangle'] as const, 'rect')
    const b = el('div', `fc-shape fc-shape-${kind}`)
    const fill = color(c.fill, null)
    const fill2 = color(c.fill2, null)
    const angle = num(c.angle, 0, 360, 180)
    const pattern = opt<ShapePattern>(c.pattern, SHAPE_PATTERNS)
    if (pattern) {
      // A pattern draws in `fill` over `fill2` (the ground, see-through when unset).
      b.style.background = fill2 ?? 'transparent'
      b.classList.add('has-pattern')
      const p1 = fill ?? '#ffffff'
      const scale = num(c.pattern_scale, 0.25, 4, 1)
      if (isParticles(pattern)) {
        b.appendChild(particles(pattern, this.id, this.box, [p1, fill2 ?? p1], scale))
      } else {
        const t = el('div', `fc-pat fc-pat-${pattern}`)
        t.style.setProperty('--p1', p1)
        t.style.setProperty('--p2', fill2 ?? 'transparent')
        t.style.setProperty('--tile', `${Math.round(24 * scale)}px`)
        if (pattern === 'perspective') {
          const g = el('div', 'fc-pat-floor')
          t.appendChild(g)
        }
        b.appendChild(t)
      }
    } else
      b.style.background =
        fill && fill2 ? `linear-gradient(${angle}deg, ${fill}, ${fill2})` : (fill ?? 'transparent')
    const stroke = color(c.stroke, null)
    const sw = num(c.stroke_width, 0, 50, 0)
    if (stroke && sw && kind !== 'line') b.style.border = `${sw}px solid ${stroke}`
    if (kind === 'line') b.style.height = `${Math.max(1, sw || 2)}px`
    if (kind === 'rect') b.style.borderRadius = `${num(c.radius, 0, 2000, 0)}px`
    const clip = opt<ShapeClip>(c.clip, SHAPE_CLIPS)
    if (clip && kind !== 'line') {
      b.style.clipPath = CLIP_PATH[clip]
      b.style.borderRadius = '0'
      b.dataset.clip = clip
    }
    const shadow = c.shadow && c.shadow !== 'none' ? SHAPE_SHADOW[c.shadow] : undefined
    if (shadow) {
      node.style.setProperty('--glow', fill ?? stroke ?? '#ffffff')
      node.style.filter = shadow
    }
    node.appendChild(b)
  }

  private renderText(c: TextCfg): void {
    const node = this.el
    const t = el('div', 'fc-layer-text')
    t.dir = 'auto'
    const ts = t.style
    const ink = color(c.color, '#eef0f4') ?? '#eef0f4'
    ts.fontFamily = fontStack(c.font ?? 'Bricolage Grotesque')
    ts.fontSize = `${num(c.size, 6, 400, 48)}px`
    ts.fontWeight = String(Math.round(num(c.weight, 100, 900, 700)))
    ts.color = ink
    ts.textAlign = one(c.align, ['left', 'center', 'right'] as const, 'left')
    ts.justifyContent =
      { left: 'flex-start', center: 'center', right: 'flex-end' }[ts.textAlign] ?? 'flex-start'
    if (c.uppercase) ts.textTransform = 'uppercase'
    if (c.italic) ts.fontStyle = 'italic'
    ts.letterSpacing = `${num(c.letter_spacing, -0.2, 1, 0)}em`
    ts.textShadow =
      SHADOW[one(c.shadow, ['none', 'soft', 'hard', 'glow'] as const, 'none')] ?? 'none'
    const ol = num(c.outline, 0, 20, 0)
    const olc = color(c.outline_color, '#07080a') ?? '#07080a'
    if (ol) ts.setProperty('-webkit-text-stroke', `${ol}px ${olc}`)
    const effect = opt<TextEffect>(c.effect, TEXT_EFFECTS)
    if (effect) {
      t.classList.add(`fx-${effect}`)
      ts.setProperty('--fx1', ink)
      ts.setProperty('--fx2', color(c.color2, null) ?? olc)
      ts.setProperty('--fx-ol', olc)
    }
    // Rotator lines and the countdown: the streamer's own words, set as text.
    const extra = Array.isArray(c.rotate)
      ? c.rotate
          .slice(0, MAX_ROTATE)
          .map((x) => safeText(x, 80))
          .filter((x) => x.trim() !== '')
      : []
    const base = safeText(c.text, 500)
    this.items = extra.length ? [base, ...extra].filter((x) => x.trim() !== '') : []
    this.at = 0
    const from = typeof c.countdown === 'number' ? num(c.countdown, 1, 86_400, 0) : 0
    // A new length starts the countdown again; any other edit keeps it running.
    if (from !== this.countFrom) this.endsAt = 0
    this.countFrom = from
    if (this.items.length > 1) t.classList.add('is-rotator')
    const inner = el('span', 'fc-lt')
    t.appendChild(inner)
    this.textEl = inner
    const split = opt(c.split, ['letters', 'words'] as const)
    if (this.countFrom > 0) {
      t.classList.add('is-countdown')
      this.setText(this.countdownText(this.countFrom))
    } else if (this.items.length > 1) this.setText(this.items[0] ?? '')
    else if (
      split &&
      effect !== 'gradient' &&
      effect !== 'chrome' &&
      Array.from(base).length <= MAX_CHARS_SPLIT
    ) {
      // Words never break inside; letters animate one by one.
      for (const [i, p] of base.split(/(\s+)/).entries()) {
        if (!p) continue
        if (/^\s+$/.test(p)) {
          inner.append(document.createTextNode(' '))
          continue
        }
        const w = el('span', 'w')
        if (split === 'letters') for (const ch of Array.from(p)) w.append(el('span', 'ch', ch))
        else w.textContent = p
        w.dataset.i = String(i)
        inner.append(w)
      }
      inner.dataset.text = base
    } else this.setText(base)
    node.appendChild(t)
  }

  private setText(s: string): void {
    if (!this.textEl) return
    this.textEl.textContent = s
    // The glitch and stamp effects draw copies of the text from this attribute.
    this.textEl.dataset.text = s
  }

  private countdownText(left: number): string {
    const c = this.config()
    if (!c || c.type !== 'text') return clockText(left)
    // Late: "+01:23" counting up, when asked.
    if (left <= 0 && c.countdown_up) return `+${clockText(Math.floor(-left))}`
    if (left <= 0 && typeof c.countdown_done === 'string' && c.countdown_done.trim())
      return safeText(c.countdown_done, 80)
    const src = safeText(c.text, 500)
    return src.includes('{time}') ? src.split('{time}').join(clockText(left)) : clockText(left)
  }

  /** Start show's countdown end, when this timer follows it and one is running. */
  private showEnds(): number | null {
    const c = this.config()
    if (!c || c.type !== 'text' || c.countdown_show === false) return null
    return this.ctx.state.show?.countdown_ends_at ?? null
  }

  private tick(): void {
    if (this.countFrom > 0) {
      const c = this.config()
      const ends = this.showEnds() ?? this.endsAt
      const left = (ends - Date.now()) / 1000
      this.setText(this.countdownText(left))
      if (left <= 0 && !(c?.type === 'text' && c.countdown_up)) this.stopTicking()
      return
    }
    if (this.items.length < 2 || !this.textEl) return
    this.at = (this.at + 1) % this.items.length
    const next = this.items[this.at] ?? ''
    const node = this.textEl
    const low = this.ctx.lowMotion()
    if (typeof node.animate !== 'function') {
      this.setText(next)
      return
    }
    try {
      const out = node.animate(
        low
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateY(-40%)' },
            ],
        { duration: low ? 160 : 260, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' },
      )
      out.onfinish = () => {
        this.setText(next)
        out.cancel()
        try {
          node.animate(
            low
              ? [{ opacity: 0 }, { opacity: 1 }]
              : [
                  { opacity: 0, transform: 'translateY(45%)' },
                  { opacity: 1, transform: 'none' },
                ],
            { duration: low ? 160 : 420, easing: EASE_IN },
          )
        } catch {
          /* shown without the entrance */
        }
      }
    } catch {
      this.setText(next)
    }
  }

  private startTicking(): void {
    this.stopTicking()
    if (!this.visible) return
    const c = this.config()
    if (!c || c.type !== 'text') return
    if (this.countFrom > 0) {
      if (!this.endsAt) this.endsAt = Date.now() + this.countFrom * 1000
      this.tick()
      if (this.endsAt > Date.now() || c.countdown_up || this.showEnds())
        this.timer = setInterval(() => this.tick(), 1000)
    } else if (this.items.length > 1) {
      const every = num(c.rotate_s, 2, 60, 5) * 1000
      this.timer = setInterval(() => this.tick(), every)
    }
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** The layer's entrance (once, when the page shows it), honouring low motion. */
  onSnapshot(): void {
    if (this.shown) return
    this.shown = true
    const c = this.config()
    this.startTicking()
    const anim = c?.anim
    const low = this.ctx.lowMotion()
    this.applyMotion()
    if (!anim || anim.in === 'none' || typeof this.el.animate !== 'function') return
    const kf = low ? IN.fade.kf : (IN[anim.in]?.kf ?? IN.fade.kf)
    const delay = num(anim.delay_ms, 0, 10_000, 0)
    const parts =
      !low && c?.type === 'text' && c.split
        ? Array.from(this.el.querySelectorAll(c.split === 'letters' ? '.ch' : '.w'))
        : []
    try {
      if (parts.length) {
        const step =
          c?.type === 'text' && c.split === 'letters' ? Math.min(45, 900 / parts.length) : 90
        parts.forEach((p, i) =>
          (p as HTMLElement).animate(kf, {
            duration: 560,
            delay: delay + i * step,
            easing: IN[anim.in]?.ease ?? EASE_IN,
            fill: 'backwards',
          }),
        )
      } else
        this.el.animate(kf, {
          duration: low ? 200 : 650,
          delay,
          easing: (!low && IN[anim.in]?.ease) || EASE_IN,
          fill: 'backwards',
        })
    } catch {
      /* the layer simply appears */
    }
  }

  onVisibility(visible: boolean): void {
    const back = visible && !this.visible
    this.visible = visible
    this.el.classList.toggle('is-paused', !visible)
    if (!this.shown) return
    // On air again: the timer starts from the top (unless the streamer turned that off).
    const c = this.config()
    if (back && this.countFrom > 0 && !(c?.type === 'text' && c.countdown_restart === false))
      this.endsAt = 0
    if (visible) this.startTicking()
    else this.stopTicking()
  }

  /** Start show's countdown started, ended or was cancelled. */
  onState(): void {
    if (this.shown && this.countFrom > 0 && this.visible) this.startTicking()
  }

  destroy(): void {
    this.stopTicking()
    this.el.remove()
  }
}
