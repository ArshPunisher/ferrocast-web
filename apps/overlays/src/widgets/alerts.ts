// The alert box. One alert at a time; the engine owns the real queue (core::queue), this
// is only a local buffer so two frames arriving together never overlap on screen.
//
// Each alert renders inside its own Shadow DOM, so the streamer's custom CSS (R-39) styles
// only that alert and can't reach chat or the rest of the page. Classes they can target:
//   .al  .al-inner  .al-media  .al-text  .al-title  .al-body  .al-spikes

import { ackFrame } from '@ferrocast/api/overlay-protocol'
import type { AlertsConfig, RenderedAlert, Widget } from '@ferrocast/api/types'
import alertCss from '../styles/alert.css?inline'
import { buildDesignAlert, type DesignAlert } from '../design/alert'
import { playBuiltin } from '../design/sounds'
import { sparkSvg } from '../design/spark'
import { el, mediaRef, safeText, speakText, themeOf, warnOnce } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const EXIT_MS = 300
const EXIT_LOW_MS = 200
const GAP_MS = 250
const MAX_LOCAL_QUEUE = 50
const LAYOUTS = new Set(['stack', 'side', 'banner'])

interface Playing {
  alert: RenderedAlert
  primary: boolean
  host: HTMLElement
  timers: ReturnType<typeof setTimeout>[]
  audio: HTMLAudioElement[]
  leaving: boolean
  /** The hold timer, frozen while OBS hides the source. */
  hold: ReturnType<typeof setTimeout> | null
  holdEndsAt: number
  /** Time left on the hold when it was frozen. */
  remaining: number
  /** Set when an alert design renders it (API.md §4 Designs). */
  design: DesignAlert | null
}

function isVideo(url: string): boolean {
  return /^data:video\//i.test(url) || /\.(webm|mp4)(\?|#|$)/i.test(url)
}

/**
 * The Spark mark as the flourish on the card's top edge: the f rises out of the card and
 * the split shard (molten over arc) drops in beside it. The class stays `al-spikes` (and
 * the shard keeps `al-magnet`) because streamers' custom CSS targets those names.
 */
function spikes(): SVGSVGElement {
  return sparkSvg('al-spark', true)
}

/**
 * Builds one alert in a classic theme. Throws only on a truly broken alert (the caller acks
 * `failed`). `branded`: the built-in themes carry the small Spark flourish; pass false for an
 * unbranded alert (the streamer's own look).
 */
export function buildAlert(
  a: RenderedAlert,
  theme: string,
  lowMotion: boolean,
  branded = true,
): HTMLElement {
  if (typeof a.title !== 'string' || typeof a.body !== 'string') throw new Error('bad alert')
  const host = el('div', 'fc-alert-host')
  const root: ShadowRoot | HTMLElement =
    typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host
  const base = document.createElement('style')
  base.textContent = alertCss
  root.appendChild(base)

  const layout = LAYOUTS.has(a.layout) ? a.layout : 'stack'
  const card = el('div', 'al')
  card.dataset.layout = layout
  card.dataset.theme = themeOf(theme)
  card.dataset.motion = lowMotion ? 'low' : 'full'
  card.dataset.kind = typeof a.kind === 'string' ? a.kind.replace(/[^a-z_]/g, '') : ''
  card.setAttribute('role', 'status')
  const inner = el('div', 'al-inner')
  if (branded) inner.appendChild(spikes())

  const img = mediaRef(a.image)
  if (a.image && img) {
    const media = el('div', 'al-media')
    if (isVideo(img)) {
      const v = el('video')
      v.muted = true
      v.loop = true
      v.autoplay = true
      v.playsInline = true
      v.setAttribute('playsinline', '')
      v.src = img
      v.addEventListener('error', () => media.remove())
      media.appendChild(v)
    } else {
      const i = el('img')
      i.alt = ''
      i.decoding = 'async'
      i.src = img
      i.addEventListener('error', () => media.remove())
      media.appendChild(i)
    }
    inner.appendChild(media)
  }
  const text = el('div', 'al-text')
  const title = el('div', 'al-title', safeText(a.title, 300))
  title.dir = 'auto'
  text.appendChild(title)
  const body = safeText(a.body, 500)
  if (body.trim() !== '') {
    const b = el('div', 'al-body', body)
    b.dir = 'auto'
    text.appendChild(b)
  }
  inner.appendChild(text)
  card.appendChild(inner)
  root.appendChild(card)

  if (typeof a.css === 'string' && a.css.trim() !== '' && root !== host) {
    // Inside the shadow root the streamer's CSS can only style this alert (R-39).
    const custom = document.createElement('style')
    custom.textContent = a.css.slice(0, 20_000)
    root.appendChild(custom)
  }
  return host
}

export class AlertsWidget implements WidgetView {
  readonly el: HTMLElement
  private cfg: AlertsConfig
  private queue: { alert: RenderedAlert; primary: boolean }[] = []
  private seen = new Set<string>()
  private seenOrder: string[] = []
  private playing: Playing | null = null
  private gapTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private paused = false

  constructor(
    w: Widget & { kind: 'alerts' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-alerts')
    this.el.setAttribute('aria-live', 'polite')
    this.cfg = w.config
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'alerts') return
    this.cfg = w.config ?? { theme: 'molten', rule_ids: null }
    this.el.dataset.theme = themeOf(this.cfg.theme)
    place(this.el, w)
  }

  accepts(a: RenderedAlert): boolean {
    const ids = this.cfg.rule_ids
    return !Array.isArray(ids) || ids.includes(a.rule_id)
  }

  onAlert(a: RenderedAlert, primary: boolean): boolean {
    if (!this.accepts(a)) return false
    if (this.seen.has(a.alert_id)) return true // a duplicate frame: already playing or played
    this.seen.add(a.alert_id)
    this.seenOrder.push(a.alert_id)
    if (this.seenOrder.length > 500) this.seen.delete(this.seenOrder.shift() ?? '')
    if (this.queue.length >= MAX_LOCAL_QUEUE) {
      warnOnce('local alert buffer full, dropping the oldest')
      const dropped = this.queue.shift()
      if (dropped?.primary) this.ctx.send(ackFrame(dropped.alert.alert_id, 'failed'))
    }
    this.queue.push({ alert: a, primary })
    if (!this.playing && !this.gapTimer) this.next()
    return true
  }

  onAlertHide(alertId: string): void {
    if (this.playing?.alert.alert_id === alertId) this.leave(true)
    else this.queue = this.queue.filter((q) => q.alert.alert_id !== alertId)
  }

  /**
   * OBS hid the source: freeze the alert (animation, sound, remaining time) and stop
   * dequeuing, so nobody "sees" an alert that played off screen. Shown again: carry on.
   */
  onVisibility(visible: boolean): void {
    if (this.paused === !visible) return
    this.paused = !visible
    const p = this.playing
    const card = p?.host.shadowRoot?.querySelector('.al') ?? p?.host.querySelector('.al')
    card?.classList.toggle('is-paused', !visible)
    if (p?.design) {
      if (visible) p.design.resume()
      else p.design.pause()
    }
    if (!visible) {
      if (this.gapTimer) {
        clearTimeout(this.gapTimer)
        this.gapTimer = null
      }
      if (p && !p.leaving && p.hold) {
        clearTimeout(p.hold)
        p.hold = null
        p.remaining = Math.max(0, p.holdEndsAt - Date.now())
      }
      if (p) for (const a of p.audio) if (!a.ended) a.pause()
      return
    }
    if (p) {
      for (const a of p.audio) if (!a.ended && a.paused && a.currentTime > 0) this.tryPlay(a)
      if (!p.leaving && !p.hold) this.startHold(p, p.remaining)
    } else if (this.queue.length && !this.gapTimer) this.next()
  }

  private startHold(p: Playing, ms: number): void {
    p.holdEndsAt = Date.now() + ms
    p.hold = setTimeout(() => {
      p.hold = null
      this.leave()
    }, ms)
  }

  private tryPlay(a: HTMLAudioElement, onFail?: () => void): void {
    try {
      const r = a.play() as Promise<void> | undefined
      // Autoplay can be blocked outside OBS; the alert still shows and still acks.
      if (r && typeof r.catch === 'function')
        r.catch(() => {
          warnOnce('the browser blocked alert sound (OBS allows it)')
          onFail?.()
        })
    } catch {
      onFail?.()
    }
  }

  /** True while an alert is on screen (tests and previews). */
  get busy(): boolean {
    return this.playing !== null
  }

  private next(): void {
    this.gapTimer = null
    if (this.destroyed || this.paused) return
    const item = this.queue.shift()
    if (!item) return
    const { alert, primary } = item
    let host: HTMLElement
    let design: DesignAlert | null = null
    try {
      if (alert.design) {
        try {
          design = buildDesignAlert(alert, { lowMotion: this.ctx.lowMotion() })
        } catch (e) {
          // A design this page can't draw still shows, in the classic look.
          warnOnce('could not draw an alert design, showing the classic look', e)
        }
      }
      // Classic themes are built-ins and keep their Spark; an alert that came with a design
      // (even one this page couldn't draw) shows the mark only when that design is branded.
      const branded = alert.design ? (alert.design as { branded?: unknown }).branded === true : true
      host = design ? design.host : buildAlert(alert, this.cfg.theme, this.ctx.lowMotion(), branded)
    } catch (e) {
      warnOnce('could not render an alert', e)
      if (primary) this.ctx.send(ackFrame(alert.alert_id, 'failed'))
      this.gapTimer = setTimeout(() => this.next(), 0)
      return
    }
    if (this.paused)
      (host.shadowRoot?.querySelector('.al') ?? host.querySelector('.al'))?.classList.add(
        'is-paused',
      )
    this.el.appendChild(host)
    design?.start()
    if (this.paused) design?.pause()
    const ms = Number.isFinite(alert.duration_ms)
      ? Math.min(Math.max(alert.duration_ms, 1000), 60_000)
      : 7000
    const p: Playing = {
      alert,
      primary,
      host,
      timers: [],
      audio: [],
      leaving: false,
      hold: null,
      holdEndsAt: 0,
      remaining: ms,
      design,
    }
    this.playing = p
    if (primary) this.ctx.send(ackFrame(alert.alert_id, 'started'))
    this.playSound(p)
    this.startHold(p, ms)
  }

  private playSound(p: Playing): void {
    if (!this.ctx.audio) return
    const sound = mediaRef(p.alert.sound)
    // tts_audio is a WAV the engine rendered with the computer's voices; while it isn't
    // ready (or can't be made) the overlay speaks tts_text itself (API.md §3).
    const tts = mediaRef(p.alert.tts_audio)
    const ttsText =
      !tts && typeof p.alert.tts_text === 'string' && p.alert.tts_text.trim()
        ? p.alert.tts_text
        : null
    const vol = Number.isFinite(p.alert.volume)
      ? Math.min(Math.max(p.alert.volume, 0), 100) / 100
      : 0.7
    const play = (url: string, next?: () => void) => {
      // 'ended', 'error' and a rejected play() can all fire: run the follow-up once.
      let done = false
      const after = next
        ? () => {
            if (done) return
            done = true
            next()
          }
        : undefined
      let a: HTMLAudioElement
      try {
        a = new Audio(url)
      } catch {
        after?.()
        return
      }
      a.volume = vol
      p.audio.push(a)
      if (after) {
        a.addEventListener('ended', after, { once: true })
        a.addEventListener('error', after, { once: true })
      }
      this.tryPlay(a, after)
    }
    const playTts = () => {
      if (this.playing !== p || p.leaving) return
      if (tts) play(tts)
      else if (ttsText) speakText(ttsText)
    }
    const look = p.alert.design?.look
    if (sound) play(sound, tts || ttsText ? playTts : undefined)
    else if (look && look.sound?.builtin && look.sound.builtin !== 'none') {
      // A built-in sound from the design, then the message read aloud after it.
      const len = playBuiltin(
        look.sound.builtin,
        Number.isFinite(look.sound.volume) ? look.sound.volume : 70,
      )
      if (tts || ttsText) p.timers.push(setTimeout(playTts, len + 150))
    } else playTts()
  }

  /** `stop` = the streamer skipped it: cut the sound too. A normal end lets it ring out. */
  private leave(stop = false): void {
    const p = this.playing
    if (!p || p.leaving) return
    p.leaving = true
    for (const t of p.timers) clearTimeout(t)
    p.timers = []
    if (p.hold) clearTimeout(p.hold)
    p.hold = null
    if (stop) for (const a of p.audio) a.pause()
    p.host.classList.add('is-out')
    const card = p.host.shadowRoot?.querySelector('.al') ?? p.host.querySelector('.al')
    card?.classList.add('is-out')
    const ms = p.design ? p.design.exit() : this.ctx.lowMotion() ? EXIT_LOW_MS : EXIT_MS
    p.timers.push(
      setTimeout(() => {
        if (p.design) p.design.destroy()
        p.host.remove()
        if (this.playing === p) this.playing = null
        if (p.primary) this.ctx.send(ackFrame(p.alert.alert_id, 'finished'))
        if (!this.destroyed && !this.paused && this.queue.length)
          this.gapTimer = setTimeout(() => this.next(), GAP_MS)
      }, ms),
    )
  }

  /** `silent` (the URL was revoked): no acks, the engine no longer counts this page. */
  destroy(silent = false): void {
    this.destroyed = true
    if (this.gapTimer) clearTimeout(this.gapTimer)
    const p = this.playing
    if (p) {
      for (const t of p.timers) clearTimeout(t)
      if (p.hold) clearTimeout(p.hold)
      for (const a of p.audio) a.pause()
      p.design?.destroy()
      // Let the engine move on instead of waiting for its deadlines.
      if (p.primary && !silent) this.ctx.send(ackFrame(p.alert.alert_id, 'finished'))
    }
    if (!silent)
      for (const q of this.queue) if (q.primary) this.ctx.send(ackFrame(q.alert.alert_id, 'failed'))
    this.playing = null
    this.queue = []
    this.el.remove()
  }
}
