// The 25 Oct layers that move with the music (API.md §4 Overlays `layer`):
//  - `fx`: a motion background (a game world or a motion loop) drawn on a canvas;
//  - `music`: the wave player or the heartbeat line, with the song, shown while music plays;
//  - `sound`: no picture; plays a sound when the screen comes on air, a loop behind it, ticks
//    in a timer's last ten seconds and a sound at zero.
// The music's loudness and song come from the engine (`music` frames). Song titles come from
// the streamer's player, so they are set as text only (R-37). Canvases draw at most 30 times a
// second, never while OBS hides the source, and hold one still frame in low motion.

import { FX_PRESETS, isColor, isMediaRef } from '@ferrocast/api/design'
import type {
  FxPreset,
  LayerConfig,
  MusicNow,
  SoundLoop,
  Stinger,
  Widget,
} from '@ferrocast/api/types'
import { FX_PALETTE, alpha, bandsFor, drawFx, type Palette } from '../design/fx'
import { fontStack } from '../design/fonts'
import { playScreenSound, playUrl, type Playing } from '../design/screen-sounds'
import { timerEnd } from '../design/timers'
import { el, mediaRef, safeText } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'
import { applyTransform } from './layer'

type Cfg<T extends string> = Extract<LayerConfig, { type: T }>

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d

/** A colour as `#rrggbb` (what the canvas code mixes alpha into), or the fallback. */
export function hex6(v: unknown, d: string): string {
  if (!isColor(v) || v === 'transparent') return d
  const h = (v as string).slice(1)
  if (h.length === 3 || h.length === 4)
    return `#${h
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')}`
  return `#${h.slice(0, 6)}`
}

/** The music right now; a preview without an engine pretends a song plays. */
function musicNow(ctx: WidgetContext, preview: boolean, t: number): MusicNow {
  const m = ctx.state.music
  if (m) return m
  if (!preview) return { playing: false, level: 0, title: null, artist: null }
  return {
    playing: true,
    level: 0.45 + 0.35 * Math.max(0, Math.sin(t * 7.5)) ** 4,
    title: 'Midnight City',
    artist: 'M83',
  }
}

/** Follows the loudness quickly up and slowly down, so the picture breathes, not flickers. */
class Envelope {
  value = 0
  step(target: number, dt: number): number {
    const k = target > this.value ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 5)
    this.value += (target - this.value) * k
    return this.value
  }
}

/** A canvas that redraws at most 30 times a second while shown. */
abstract class CanvasLayer implements WidgetView {
  readonly el: HTMLElement
  protected readonly canvas: HTMLCanvasElement
  protected g: CanvasRenderingContext2D | null
  protected box = { w: 1, h: 1 }
  protected key = ''
  protected visible = true
  protected shown = false
  private raf = 0
  private last = 0
  protected t = 0
  protected readonly env = new Envelope()

  constructor(
    w: Widget & { kind: 'layer' },
    protected readonly ctx: WidgetContext,
    protected readonly preview: boolean,
    cls: string,
  ) {
    this.el = el('div', `fc-w fc-w-layer ${cls}`)
    this.el.setAttribute('aria-hidden', 'true')
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'fc-canvas'
    this.el.appendChild(this.canvas)
    this.g = this.canvas.getContext('2d')
    // Subclasses call `update(w)` once their own fields exist.
  }

  update(w: Widget): void {
    if (w.kind !== 'layer') return
    place(this.el, w)
    applyTransform(this.el, w)
    const box = { w: Math.round(num(w.w, 1, 7680, 1)), h: Math.round(num(w.h, 1, 4320, 1)) }
    const key = JSON.stringify([w.config, box.w, box.h])
    if (key === this.key) return
    this.key = key
    this.box = box
    // Sharp on a high-DPI screen, but never more than about a 1080p canvas of pixels.
    const k = Math.max(
      0.25,
      Math.min(2, globalThis.devicePixelRatio || 1, Math.sqrt(2_200_000 / (box.w * box.h))),
    )
    this.canvas.width = Math.max(1, Math.round(box.w * k))
    this.canvas.height = Math.max(1, Math.round(box.h * k))
    this.g?.setTransform(k, 0, 0, k, 0, 0)
    this.configure(w.config)
    this.draw(0)
    this.run()
  }

  protected abstract configure(c: LayerConfig): void
  protected abstract draw(dt: number): void

  /** Keeps drawing while shown and moving; one still frame otherwise. */
  protected run(): void {
    const moving = this.shown && this.visible && !this.ctx.lowMotion()
    if (!moving) {
      if (this.raf) cancelAnimationFrame(this.raf)
      this.raf = 0
      return
    }
    if (this.raf || typeof requestAnimationFrame !== 'function') return
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.last ? (now - this.last) / 1000 : 0
      if (dt && dt < 1 / 31) return
      this.last = now
      this.t += Math.min(dt, 0.1)
      try {
        this.draw(Math.min(dt, 0.1))
      } catch {
        // A bad frame is skipped; the next one tries again.
      }
    }
    this.raf = requestAnimationFrame(loop)
  }

  onSnapshot(): void {
    this.shown = true
    this.run()
  }

  onVisibility(visible: boolean): void {
    this.visible = visible
    this.last = 0
    this.run()
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.el.remove()
  }
}

/** `fx`: a motion background. */
export class FxLayer extends CanvasLayer {
  private preset: FxPreset = 'hex'
  private palette: Palette = FX_PALETTE.hex
  private speed = 1
  private density = 1
  private reactive = false

  constructor(w: Widget & { kind: 'layer' }, ctx: WidgetContext, preview: boolean) {
    super(w, ctx, preview, 'fc-w-fx')
    this.update(w)
  }

  protected configure(c: LayerConfig): void {
    const f = c as Cfg<'fx'>
    this.preset = FX_PRESETS.includes(f.preset) ? f.preset : 'hex'
    const d = FX_PALETTE[this.preset]
    this.palette = { a: hex6(f.color, d.a), b: hex6(f.color2, d.b), bg: hex6(f.background, d.bg) }
    this.speed = num(f.speed, 0.25, 3, 1)
    this.density = num(f.density, 0.5, 2, 1)
    this.reactive = f.reactive === true
  }

  protected draw(dt: number): void {
    if (!this.g) return
    const t = this.t * this.speed
    const m = this.reactive ? musicNow(this.ctx, this.preview, this.t) : null
    const level = m?.playing ? this.env.step(num(m.level, 0, 1, 0), dt) : null
    // Without music the world breathes on its own, slowly.
    const beat = level ?? 0.18 + 0.12 * Math.sin(this.t * 1.6)
    drawFx(this.preset, {
      g: this.g,
      w: this.box.w,
      h: this.box.h,
      t,
      beat,
      bands: bandsFor(this.t, level ?? beat * 0.6),
      p: this.palette,
      density: this.density,
    })
  }

  onMusic(): void {
    // Drawn on the next frame; nothing to do between frames.
  }
}

const TAU = Math.PI * 2

/** `music`: the wave player or the heartbeat line, and the song under it. */
export class MusicLayer extends CanvasLayer {
  private look: 'wave' | 'pulse' = 'wave'
  private color = '#ffffff'
  private color2 = '#ffffff'
  private onlyPlaying = true
  private readonly song: HTMLElement
  private songKey = ''
  private on = false

  constructor(w: Widget & { kind: 'layer' }, ctx: WidgetContext, preview: boolean) {
    super(w, ctx, preview, 'fc-w-music')
    this.song = el('div', 'fc-music-song')
    this.song.dir = 'auto'
    this.el.appendChild(this.song)
    this.update(w)
  }

  protected configure(c: LayerConfig): void {
    const m = c as Cfg<'music'>
    this.look = m.look === 'pulse' ? 'pulse' : 'wave'
    this.color = hex6(m.color, this.look === 'pulse' ? '#3dffb4' : '#ffffff')
    this.color2 = hex6(m.color2, this.color)
    this.onlyPlaying = m.only_playing !== false
    const s = this.song.style
    s.display = m.show_title === false ? 'none' : ''
    s.color = hex6(m.text_color, this.color)
    s.fontFamily = fontStack(typeof m.font === 'string' ? m.font : 'Hanken Grotesk')
    const size = num(m.title_size, 8, 160, Math.max(12, Math.round(this.box.h * 0.16)))
    s.fontSize = `${size}px`
    this.songKey = ''
    this.onMusic()
  }

  /** Song text and whether the piece shows at all. */
  onMusic(): void {
    const m = musicNow(this.ctx, this.preview, this.t)
    const title = safeText(m.title ?? '', 120).trim()
    const artist = safeText(m.artist ?? '', 120).trim()
    const text = [title, artist].filter(Boolean).join(' · ')
    if (text !== this.songKey) {
      this.songKey = text
      this.song.textContent = text
    }
    this.on = m.playing || !this.onlyPlaying
    this.el.classList.toggle('is-quiet', !this.on)
  }

  protected draw(dt: number): void {
    const g = this.g
    if (!g) return
    const { w } = this.box
    const h = this.box.h * (this.song.style.display === 'none' ? 1 : 0.68)
    const m = musicNow(this.ctx, this.preview, this.t)
    if (this.preview && !this.ctx.state.music) this.onMusic()
    const level = this.env.step(m.playing ? num(m.level, 0, 1, 0) : 0, dt)
    g.clearRect(0, 0, w, this.box.h)
    // Hidden until music plays: nothing to draw.
    if (!this.on && dt > 0) return
    g.save()
    g.lineJoin = 'round'
    g.lineCap = 'round'
    if (this.look === 'wave') {
      // A sine that swells in the middle and fades to the edges, louder with the music.
      const mid = h * 0.5
      const grad = g.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, alpha(this.color, 0))
      grad.addColorStop(0.5, this.color)
      grad.addColorStop(1, alpha(this.color2, 0))
      g.strokeStyle = grad
      g.lineWidth = Math.max(1.4, h / 60)
      g.beginPath()
      g.moveTo(0, mid)
      const amp = h * 0.42 * (0.12 + level * 0.88)
      for (let x = 0; x <= w; x += 1.5) {
        const env = Math.exp(-(((x - w / 2) / (w * 0.24)) ** 2))
        const k = (x / w) * 60
        g.lineTo(x, mid + Math.sin(k + this.t * 9) * amp * env * Math.sin(k * 0.11 + this.t))
      }
      g.stroke()
    } else {
      // The heartbeat: a flat line with a beat in the middle that jumps with the music.
      const mid = h * 0.55
      g.strokeStyle = this.color
      g.shadowColor = this.color
      g.shadowBlur = Math.max(6, h / 12)
      g.lineWidth = Math.max(1.6, h / 50)
      g.beginPath()
      g.moveTo(0, mid)
      const c = w / 2
      const span = Math.max(30, w * 0.06)
      for (let x = 0; x <= w; x += 2) {
        const d = x - c
        const spike =
          Math.abs(d) < span
            ? Math.sin((d / span) * Math.PI * 2.4) *
              h *
              0.42 *
              Math.exp(-((d / (span * 0.55)) ** 2)) *
              (0.25 + level * 0.9)
            : 0
        g.lineTo(x, mid - spike)
      }
      g.stroke()
      // the dot that travels along the line
      const dotX = ((this.t * 0.47) % 1) * w
      g.shadowBlur = 0
      g.fillStyle = this.color2
      g.beginPath()
      g.arc(dotX, mid, Math.max(2, h / 40), 0, TAU)
      g.fill()
    }
    g.restore()
  }
}

/** `sound`: plays the screen's sounds while it's on air. */
export class SoundLayer implements WidgetView {
  readonly el: HTMLElement
  private cfg: Cfg<'sound'> = { type: 'sound' }
  private key = ''
  private visible = true
  private shown = false
  private loop: Playing | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  /** The timer end being followed, and the last whole second ticked for it. */
  private followed = 0
  private lastSecond = Infinity
  private zeroPlayed = 0

  constructor(
    w: Widget & { kind: 'layer' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('div', 'fc-w fc-w-layer fc-w-sound')
    this.el.setAttribute('aria-hidden', 'true')
    this.update(w)
  }

  private on(): boolean {
    return this.ctx.audio && this.shown && this.visible
  }

  private volume(): number {
    const v = num(this.cfg.volume, 0, 1, 0.7)
    return this.cfg.duck && this.ctx.state.music?.playing ? v * 0.35 : v
  }

  private once(name: Stinger | null | undefined, media?: string | null): void {
    if (!this.on()) return
    const url = typeof media === 'string' && isMediaRef(media) ? mediaRef(media) : null
    if (url) playUrl(url, this.volume())
    else if (name) playScreenSound(name, this.volume())
  }

  update(w: Widget): void {
    if (w.kind !== 'layer') return
    place(this.el, w)
    const key = JSON.stringify(w.config)
    if (key === this.key) return
    this.key = key
    this.cfg = w.config as Cfg<'sound'>
    this.stopLoop()
    this.startLoop()
    this.watch()
  }

  private startLoop(): void {
    if (!this.on() || this.loop) return
    const media = this.cfg.loop_media
    const url = typeof media === 'string' && isMediaRef(media) ? mediaRef(media) : null
    if (url) this.loop = playUrl(url, this.volume(), true)
    else if (this.cfg.loop)
      this.loop = playScreenSound(this.cfg.loop as SoundLoop, this.volume(), true)
  }

  private stopLoop(): void {
    this.loop?.stop()
    this.loop = null
  }

  /** Ticks and the zero sound follow the timers on this screen (checked 5 times a second). */
  private watch(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    if (!this.on() || (!this.cfg.last_ticks && !this.cfg.at_zero)) return
    this.poll = setInterval(() => this.check(), 200)
  }

  private check(): void {
    const end = timerEnd()
    if (end === null) return
    if (end !== this.followed) {
      this.followed = end
      this.lastSecond = Infinity
    }
    const left = (end - Date.now()) / 1000
    const sec = Math.ceil(left)
    if (this.cfg.last_ticks && sec >= 1 && sec <= 10 && sec < this.lastSecond)
      playScreenSound('tick', this.volume())
    if (sec < this.lastSecond) this.lastSecond = sec
    // Zero is heard once per timer, and only when it happens now (not a timer long done).
    if (this.cfg.at_zero && left <= 0 && left > -1.5 && this.zeroPlayed !== end) {
      this.zeroPlayed = end
      this.once(this.cfg.at_zero as Stinger)
    }
  }

  onSnapshot(): void {
    if (this.shown) return
    this.shown = true
    this.once(this.cfg.on_show as Stinger | null, this.cfg.on_show_media)
    this.startLoop()
    this.watch()
  }

  onVisibility(visible: boolean): void {
    const back = visible && !this.visible
    this.visible = visible
    if (!visible) {
      this.stopLoop()
      this.watch()
      return
    }
    if (back && this.shown) this.once(this.cfg.on_show as Stinger | null, this.cfg.on_show_media)
    this.startLoop()
    this.watch()
  }

  /** Music started or stopped: the loop gets quieter or louder. */
  onMusic(): void {
    this.loop?.setVolume(this.volume())
  }

  destroy(): void {
    this.stopLoop()
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    this.el.remove()
  }
}

/** The view for a `layer` whose type moves with the music, or null for the plain kinds. */
export function motionLayer(
  w: Widget & { kind: 'layer' },
  ctx: WidgetContext,
  preview: boolean,
): WidgetView | null {
  switch (w.config?.type) {
    case 'fx':
      return new FxLayer(w, ctx, preview)
    case 'music':
      return new MusicLayer(w, ctx, preview)
    case 'sound':
      return new SoundLayer(w, ctx)
    default:
      return null
  }
}
