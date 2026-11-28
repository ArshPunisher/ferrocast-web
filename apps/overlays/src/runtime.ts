// Applies overlay frames (API.md §6) to the DOM. Knows nothing about sockets, so the
// dashboard can drive the same renderer for its previews.

import type {
  LabelTrainView,
  ChatHighlight,
  Credits,
  Overlay,
  OverlayServerFrame,
  OverlayState,
  PollView,
  GiveawayCard,
  RenderedAlert,
  ResolvedLinks,
  MusicNow,
  Widget,
} from '@ferrocast/api/types'
import { el, mediaRef, speakText, warnOnce } from './dom'
import { emptyState, type WidgetContext, type WidgetView } from './widget'
import { AlertsWidget } from './widgets/alerts'
import { ChatWidget } from './widgets/chat'
import { EventsWidget, GoalWidget, LabelWidget, ViewersWidget } from './widgets/info'
import { PollWidget } from './widgets/poll'
import { GiveawayWidget } from './widgets/giveaway'
import { EndCreditsWidget } from './widgets/end-credits'
import { EmoteWallWidget } from './widgets/emote-wall'
import { ChatHighlightWidget } from './widgets/chat-highlight'
import { LayerWidget, applyTransform } from './widgets/layer'
import { motionLayer } from './widgets/motion'
import { applyWidgetStyle } from './design/style'

export interface OverlayRuntime {
  apply(frame: OverlayServerFrame): void
  /** True after a `revoked` frame: the page stays empty and stops reconnecting. */
  readonly revoked: boolean
  setVisible(v: boolean): void
  destroy(): void
}

export interface OverlayOptions {
  /** Where acks go. Omit for previews that should stay silent. */
  send?: (data: string) => void
  /** Play alert sounds (default true). */
  audio?: boolean
  /** Fades only, no movement (also on with prefers-reduced-motion). */
  lowMotion?: boolean
  /** `contain` scales the canvas into the root element (dashboard previews). */
  fit?: 'none' | 'contain'
}

const MAX_WIDGETS = 50

/**
 * WebKit on Linux (WebKitGTK, the desktop app's webview there) draws in software. A preview
 * scaled down with `transform: scale()` is still painted at the canvas's full size (1920x1080)
 * and shrunk afterwards, so a gallery of a dozen scenes stalled the page for tens of seconds.
 * `zoom` lays the canvas out at its final size and paints only those pixels. Kept to that one
 * platform: transforms stay exact everywhere else (Safari, Chromium and OBS's browser).
 */
export function prefersZoomFit(ua: string, platform: string, supportsZoom: boolean): boolean {
  // Check the platform too: a test browser can present a Mac user agent on Linux.
  return (
    supportsZoom &&
    (/Linux/.test(ua) || /Linux/.test(platform)) &&
    /AppleWebKit/.test(ua) &&
    !/Chrom(e|ium)\//.test(ua)
  )
}

const zoomFit = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  prefersZoomFit(navigator.userAgent, navigator.platform ?? '', CSS.supports('zoom', '1'))

/** Start show's countdown end (ms), or null; anything else is ignored. */
const showEnds = (v: unknown): number | null => {
  if (!v || typeof v !== 'object') return null
  const n = (v as { countdown_ends_at?: unknown }).countdown_ends_at
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The music's state from a frame, every field checked; null when it isn't one. */
export function parseMusic(v: unknown): MusicNow | null {
  if (!obj(v)) return null
  const level = typeof v.level === 'number' && Number.isFinite(v.level) ? v.level : 0
  const str = (s: unknown) => (typeof s === 'string' && s.trim() ? s.slice(0, 200) : null)
  return {
    playing: v.playing === true,
    level: Math.min(1, Math.max(0, level)),
    title: str(v.title),
    artist: str(v.artist),
  }
}

/** Layers that draw or play with the music get their own view; a type change rebuilds it. */
const viewKind = (w: Widget): string => {
  const t = w.kind === 'layer' ? (w.config as { type?: unknown } | undefined)?.type : null
  return t === 'fx' || t === 'music' || t === 'sound' ? `layer:${t}` : w.kind
}

/** Rotation, opacity, hidden, and a widget design's style (API.md §4 Overlays). */
function dress(node: HTMLElement, w: Widget): void {
  try {
    applyTransform(node, w)
    if (w.kind !== 'layer') applyWidgetStyle(node, w.config)
  } catch (e) {
    warnOnce('a widget style could not be applied', e)
  }
}

function build(
  w: Widget,
  ctx: WidgetContext,
  preview: boolean,
  onAlertAudioIdle?: () => void,
): WidgetView | null {
  switch (w.kind) {
    case 'alerts':
      return new AlertsWidget(w, ctx, onAlertAudioIdle)
    case 'chat':
      return new ChatWidget(w, ctx)
    case 'events':
      return new EventsWidget(w, ctx)
    case 'goal':
      return new GoalWidget(w, ctx)
    case 'label':
      return new LabelWidget(w, ctx)
    case 'viewers':
      return new ViewersWidget(w, ctx)
    case 'poll':
      return new PollWidget(w, ctx)
    case 'giveaway':
      return new GiveawayWidget(w, ctx)
    case 'end_credits':
      return new EndCreditsWidget(w, ctx, preview)
    case 'emote_wall':
      return new EmoteWallWidget(w, ctx, preview)
    case 'chat_highlight':
      return new ChatHighlightWidget(w, ctx)
    case 'layer':
      return motionLayer(w, ctx, preview) ?? new LayerWidget(w, ctx)
    default:
      warnOnce(`unknown widget kind: ${String((w as { kind?: unknown }).kind)}`)
      return null
  }
}

export function createOverlay(root: HTMLElement, opts: OverlayOptions = {}): OverlayRuntime {
  const shell = el('div', 'fc-ov')
  const canvas = el('div', 'fc-ov-canvas')
  shell.appendChild(canvas)
  root.appendChild(shell)

  const mq =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const low = () => !!opts.lowMotion || !!mq?.matches
  let state: OverlayState = emptyState()
  let overlay: Overlay | null = null
  let ready = false
  let visible = true
  let revoked = false
  const spoken = new Set<string>()
  const views = new Map<string, { kind: string; view: WidgetView }>()
  const each = (fn: (v: WidgetView) => void) => {
    for (const { view } of views.values()) {
      try {
        fn(view)
      } catch (e) {
        warnOnce('a widget failed to update', e)
      }
    }
  }
  const syncMotion = () => {
    shell.classList.toggle('is-low', low())
    each((w) => w.onMotion?.())
  }
  syncMotion()
  mq?.addEventListener?.('change', syncMotion)
  const ctx: WidgetContext = {
    send: (d) => opts.send?.(d),
    audio: opts.audio ?? true,
    preview: !opts.send,
    lowMotion: low,
    get state() {
      return state
    },
  }

  let ro: ResizeObserver | null = null
  const fit = () => {
    if (opts.fit !== 'contain' || !overlay) return
    const r = root.getBoundingClientRect()
    const k = Math.min(r.width / overlay.width, r.height / overlay.height) || 0
    const x = Math.max(0, (r.width - overlay.width * k) / 2)
    const y = Math.max(0, (r.height - overlay.height * k) / 2)
    if (k > 0 && zoomFit()) {
      // `left` and `top` are zoomed with the element, so give them in unscaled pixels.
      canvas.style.transform = 'none'
      canvas.style.setProperty('zoom', String(k))
      canvas.style.left = `${x / k}px`
      canvas.style.top = `${y / k}px`
      return
    }
    canvas.style.removeProperty('zoom')
    canvas.style.transform = `scale(${k})`
    canvas.style.left = `${x}px`
    canvas.style.top = `${y}px`
  }
  if (opts.fit === 'contain' && typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(fit)
    ro.observe(root)
  }

  function layout(o: Overlay, fresh: boolean): void {
    overlay = {
      ...o,
      width: Number.isFinite(o.width) ? Math.min(Math.max(o.width, 100), 7680) : 1920,
      height: Number.isFinite(o.height) ? Math.min(Math.max(o.height, 100), 4320) : 1080,
    }
    canvas.style.width = `${overlay.width}px`
    canvas.style.height = `${overlay.height}px`
    const byId = new Map<string, Widget>()
    for (const w of overlay.widgets.slice(0, MAX_WIDGETS)) {
      if (!obj(w) || typeof w.id !== 'string') continue
      byId.delete(w.id)
      byId.set(w.id, w)
    }
    for (const [id, { view }] of views) {
      if (!byId.has(id)) {
        view.destroy()
        views.delete(id)
      }
    }
    let idx = 0
    for (const w of byId.values()) {
      const cur = views.get(w.id)
      const kind = viewKind(w)
      let node: HTMLElement
      let builtView: WidgetView | null = null
      if (cur && cur.kind === kind) {
        cur.view.update(w)
        dress(cur.view.el, w)
        node = cur.view.el
      } else {
        cur?.view.destroy()
        const v = build(w, ctx, !opts.send, () => pumpTts())
        if (!v) {
          views.delete(w.id)
          continue
        }
        views.set(w.id, { kind, view: v })
        dress(v.el, w)
        node = v.el
        builtView = v
      }
      const expected = canvas.children[idx] ?? null
      if (node !== expected) {
        canvas.insertBefore(node, expected)
      }
      if (builtView && !fresh) builtView.onSnapshot?.()
      idx += 1
    }
    fit()
  }

  const MAX_TTS_QUEUE = 8
  const TTS_SAFETY_MS = 25_000
  let ttsQueue: { id: string; text: string; audio: unknown }[] = []
  let ttsActive = false
  let ttsActiveId: string | null = null
  let ttsPlaying: HTMLAudioElement | null = null
  let ttsTimer: ReturnType<typeof setTimeout> | null = null
  let ttsGen = 0

  function isAlertAudioBusy(): boolean {
    for (const { view } of views.values()) {
      if (view instanceof AlertsWidget && view.isAudioBusy()) return true
    }
    return false
  }

  function clearTtsTimer(): void {
    if (ttsTimer) {
      clearTimeout(ttsTimer)
      ttsTimer = null
    }
  }

  function stopActiveStandaloneTts(): void {
    ttsGen += 1
    ttsActive = false
    ttsActiveId = null
    clearTtsTimer()
    if (ttsPlaying) {
      try {
        ttsPlaying.pause()
      } catch {
        /* nothing to stop */
      }
      ttsPlaying = null
    }
    try {
      globalThis.speechSynthesis?.cancel()
    } catch {
      /* nothing to stop */
    }
  }

  function stopTts(ids?: string[]): void {
    if (Array.isArray(ids) && ids.length > 0) {
      const drop = new Set(ids)
      ttsQueue = ttsQueue.filter((item) => !drop.has(item.id))
      if (!ttsActive || !ttsActiveId || !drop.has(ttsActiveId)) return
      stopActiveStandaloneTts()
      pumpTts()
      return
    }
    ttsQueue = []
    stopActiveStandaloneTts()
    each((v) => v.onTtsStop?.())
  }

  function pumpTts(): void {
    if (revoked || !visible || opts.audio === false || ttsActive || isAlertAudioBusy()) return
    const next = ttsQueue.shift()
    if (!next) return
    ttsActive = true
    ttsActiveId = next.id
    const gen = ++ttsGen
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      if (ttsGen !== gen) return
      ttsActive = false
      ttsActiveId = null
      ttsPlaying = null
      clearTtsTimer()
      pumpTts()
    }
    const url = mediaRef(next.audio)
    if (url) {
      try {
        const a = new Audio(url)
        ttsPlaying = a
        ttsTimer = setTimeout(done, TTS_SAFETY_MS)
        a.addEventListener('ended', done, { once: true })
        a.addEventListener('error', done, { once: true })
        const r = a.play() as Promise<void> | undefined
        if (r && typeof r.catch === 'function') {
          void r.catch(() => {
            if (ttsGen !== gen || finished) return
            if (ttsPlaying === a) ttsPlaying = null
            speakText(next.text, done)
          })
        }
        return
      } catch {
        ttsPlaying = null
        clearTtsTimer()
      }
    }
    ttsTimer = setTimeout(done, TTS_SAFETY_MS)
    speakText(next.text, done)
  }

  function revoke(): void {
    // The URL was regenerated or the overlay deleted: show nothing, for good.
    revoked = true
    stopTts()
    for (const { view } of views.values()) view.destroy(true)
    views.clear()
    canvas.replaceChildren()
  }

  function speak(id: string, text: string, audio: unknown): void {
    // An approved or live-chat TTS message. Never while OBS hides the source, never twice.
    if (spoken.has(id) || opts.audio === false || !visible) return
    spoken.add(id)
    if (spoken.size > 200) spoken.delete(spoken.values().next().value as string)
    if (ttsQueue.length >= MAX_TTS_QUEUE) return
    ttsQueue.push({ id, text, audio })
    pumpTts()
  }

  function apply(frame: OverlayServerFrame): void {
    if (revoked || !obj(frame) || typeof frame.type !== 'string') return
    if (frame.type === 'revoked') {
      revoke()
      return
    }
    if (frame.type === 'snapshot') {
      const s = frame.data.state as Partial<OverlayState>
      state = {
        goals: Array.isArray(s?.goals) ? s.goals : [],
        labels: obj(s?.labels) ? (s.labels as Record<string, string>) : {},
        ...(obj(s?.label_trains)
          ? { label_trains: s.label_trains as Record<string, LabelTrainView | null> }
          : {}),
        viewers: obj(s?.viewers) ? (s.viewers as OverlayState['viewers']) : {},
        events: Array.isArray(s?.events) ? s.events : [],
        chat: Array.isArray(s?.chat) ? s.chat : [],
        poll: obj(s?.poll) ? (s.poll as PollView) : null,
        giveaway: obj(s?.giveaway) ? (s.giveaway as GiveawayCard) : null,
        credits: obj(s?.credits) ? (s.credits as Credits) : null,
        chat_highlight: obj(s?.chat_highlight) ? (s.chat_highlight as ChatHighlight) : null,
        show: { countdown_ends_at: showEnds(s?.show) },
        ...(parseMusic(s?.music) ? { music: parseMusic(s?.music) as MusicNow } : {}),
        ...(obj(s?.links) ? { links: s.links as unknown as ResolvedLinks } : {}),
      }
      layout(frame.data.overlay, true)
      each((v) => v.onSnapshot?.())
      ready = true
      return
    }
    if (!ready) return // nothing before the first snapshot (R-38)
    switch (frame.type) {
      case 'event': {
        const e = frame.data
        if (e.kind?.type === 'chat_message') state.chat = [...state.chat.slice(-49), e]
        else state.events = [...state.events.slice(-24), e]
        each((v) => v.onEvent?.(e))
        break
      }
      case 'alert': {
        const a: RenderedAlert = frame.data
        let primary = true
        for (const { view } of views.values()) {
          try {
            if (view.onAlert?.(a, primary)) primary = false
          } catch (e) {
            warnOnce('alert widget failed', e)
          }
        }
        break
      }
      case 'alert_hide':
        each((v) => v.onAlertHide?.(frame.data.alert_id))
        break
      case 'state': {
        const d = frame.data
        if (!obj(d)) break
        if (Array.isArray(d.goals)) state.goals = d.goals
        if (obj(d.labels))
          state.labels = { ...state.labels, ...(d.labels as Record<string, string>) }
        if (obj(d.label_trains))
          state.label_trains = {
            ...state.label_trains,
            ...(d.label_trains as OverlayState['label_trains']),
          }
        if (obj(d.viewers))
          state.viewers = { ...state.viewers, ...(d.viewers as OverlayState['viewers']) }
        if ('poll' in d) state.poll = obj(d.poll) ? (d.poll as PollView) : null
        if ('giveaway' in d) state.giveaway = obj(d.giveaway) ? (d.giveaway as GiveawayCard) : null
        if ('credits' in d) state.credits = obj(d.credits) ? (d.credits as Credits) : null
        if ('chat_highlight' in d)
          state.chat_highlight = obj(d.chat_highlight) ? (d.chat_highlight as ChatHighlight) : null
        if ('show' in d) state.show = { countdown_ends_at: showEnds(d.show) }
        if ('links' in d) state.links = obj(d.links) ? (d.links as unknown as ResolvedLinks) : null
        each((v) => v.onState?.())
        break
      }
      case 'config':
        layout(frame.data, false)
        break
      case 'music': {
        const m = parseMusic(frame.data)
        if (!m) break
        state.music = m
        each((v) => v.onMusic?.())
        break
      }
      case 'delete_message':
        each((v) => v.onDeleteMessage?.(frame.data.platform, frame.data.message_id))
        state.chat = state.chat.filter(
          (e) =>
            !(
              e.platform === frame.data.platform && (e.source_id ?? e.id) === frame.data.message_id
            ),
        )
        break
      case 'delete_user': {
        const { platform, user_id } = frame.data
        // Also from state, so a redraw (theme change, new chat widget) can't bring them back.
        state.chat = state.chat.filter(
          (e) =>
            !(
              e.platform === platform &&
              e.kind.type === 'chat_message' &&
              e.kind.actor?.id === user_id
            ),
        )
        each((v) => v.onDeleteUser?.(platform, user_id))
        break
      }
      case 'clear_chat': {
        const { platform } = frame.data
        state.chat = platform === null ? [] : state.chat.filter((e) => e.platform !== platform)
        each((v) => v.onClearChat?.(platform))
        break
      }
      case 'tts':
        if (typeof frame.data.id === 'string' && typeof frame.data.text === 'string')
          speak(frame.data.id, frame.data.text, (frame.data as { audio?: unknown }).audio)
        break
      case 'tts_stop':
        stopTts(Array.isArray(frame.data?.ids) ? frame.data.ids : undefined)
        break
      default:
        warnOnce(`ignored frame type ${String((frame as { type: unknown }).type)}`)
    }
  }

  return {
    get revoked() {
      return revoked
    },
    apply(frame) {
      try {
        apply(frame)
      } catch (e) {
        warnOnce('a frame could not be applied', e)
      }
    },
    setVisible(v) {
      visible = v
      if (!v) stopTts()
      else pumpTts()
      shell.classList.toggle('is-hidden', !v)
      each((w) => w.onVisibility?.(v))
    },
    destroy() {
      stopTts()
      for (const { view } of views.values()) view.destroy()
      views.clear()
      ro?.disconnect()
      mq?.removeEventListener?.('change', syncMotion)
      shell.remove()
    },
  }
}
