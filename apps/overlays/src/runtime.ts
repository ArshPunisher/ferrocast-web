// Applies overlay frames (API.md §6) to the DOM. Knows nothing about sockets, so the
// dashboard can drive the same renderer for its previews.

import type {
  Overlay,
  OverlayServerFrame,
  OverlayState,
  RenderedAlert,
  Widget,
} from '@ferrocast/api/types'
import { el, mediaRef, speakText, warnOnce } from './dom'
import { emptyState, type WidgetContext, type WidgetView } from './widget'
import { AlertsWidget } from './widgets/alerts'
import { ChatWidget } from './widgets/chat'
import { EventsWidget, GoalWidget, LabelWidget, ViewersWidget } from './widgets/info'

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

const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function build(w: Widget, ctx: WidgetContext): WidgetView | null {
  switch (w.kind) {
    case 'alerts':
      return new AlertsWidget(w, ctx)
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
  const syncMotion = () => shell.classList.toggle('is-low', low())
  syncMotion()
  mq?.addEventListener?.('change', syncMotion)

  let state: OverlayState = emptyState()
  let overlay: Overlay | null = null
  let ready = false
  let visible = true
  let revoked = false
  const spoken = new Set<string>()
  const views = new Map<string, { kind: string; view: WidgetView }>()
  const ctx: WidgetContext = {
    send: (d) => opts.send?.(d),
    audio: opts.audio ?? true,
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
    canvas.style.transform = `scale(${k})`
    canvas.style.left = `${Math.max(0, (r.width - overlay.width * k) / 2)}px`
    canvas.style.top = `${Math.max(0, (r.height - overlay.height * k) / 2)}px`
  }
  if (opts.fit === 'contain' && typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(fit)
    ro.observe(root)
  }

  const each = (fn: (v: WidgetView) => void) => {
    for (const { view } of views.values()) {
      try {
        fn(view)
      } catch (e) {
        warnOnce('a widget failed to update', e)
      }
    }
  }

  function layout(o: Overlay, fresh: boolean): void {
    overlay = {
      ...o,
      width: Number.isFinite(o.width) ? Math.min(Math.max(o.width, 100), 7680) : 1920,
      height: Number.isFinite(o.height) ? Math.min(Math.max(o.height, 100), 4320) : 1080,
    }
    canvas.style.width = `${overlay.width}px`
    canvas.style.height = `${overlay.height}px`
    const keep = new Set<string>()
    for (const w of overlay.widgets.slice(0, MAX_WIDGETS)) {
      if (!obj(w) || typeof w.id !== 'string') continue
      keep.add(w.id)
      const cur = views.get(w.id)
      if (cur && cur.kind === w.kind) {
        cur.view.update(w)
        canvas.appendChild(cur.view.el) // keeps the stacking order of the list
        continue
      }
      cur?.view.destroy()
      const v = build(w, ctx)
      if (!v) {
        views.delete(w.id)
        continue
      }
      views.set(w.id, { kind: w.kind, view: v })
      canvas.appendChild(v.el)
      if (!fresh) v.onSnapshot?.()
    }
    for (const [id, { view }] of views)
      if (!keep.has(id)) {
        view.destroy()
        views.delete(id)
      }
    fit()
  }

  function revoke(): void {
    // The URL was regenerated or the overlay deleted: show nothing, for good.
    revoked = true
    for (const { view } of views.values()) view.destroy(true)
    views.clear()
    canvas.replaceChildren()
    try {
      globalThis.speechSynthesis?.cancel()
    } catch {
      /* nothing to stop */
    }
  }

  function speak(id: string, text: string, audio: unknown): void {
    // An approved TTS message (R-48). Never while OBS hides the source, never twice.
    if (spoken.has(id) || opts.audio === false || !visible) return
    spoken.add(id)
    if (spoken.size > 200) spoken.delete(spoken.values().next().value as string)
    // Prefer the WAV the engine rendered with the computer's voices (OBS captures it);
    // fall back to the browser's voice when there is none (API.md §6 `tts`).
    const url = mediaRef(audio)
    if (url) {
      try {
        const a = new Audio(url)
        void a.play().catch(() => speakText(text))
        return
      } catch {
        // fall through to speech
      }
    }
    speakText(text)
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
        viewers: obj(s?.viewers) ? (s.viewers as OverlayState['viewers']) : {},
        events: Array.isArray(s?.events) ? s.events : [],
        chat: Array.isArray(s?.chat) ? s.chat : [],
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
        if (Array.isArray(d.goals)) state.goals = d.goals
        if (obj(d.labels))
          state.labels = { ...state.labels, ...(d.labels as Record<string, string>) }
        if (obj(d.viewers))
          state.viewers = { ...state.viewers, ...(d.viewers as OverlayState['viewers']) }
        each((v) => v.onState?.())
        break
      }
      case 'config':
        layout(frame.data, false)
        break
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
      if (!v) {
        try {
          globalThis.speechSynthesis?.cancel()
        } catch {
          /* nothing to stop */
        }
      }
      shell.classList.toggle('is-hidden', !v)
      each((w) => w.onVisibility?.(v))
    },
    destroy() {
      for (const { view } of views.values()) view.destroy()
      views.clear()
      ro?.disconnect()
      mq?.removeEventListener?.('change', syncMotion)
      shell.remove()
    },
  }
}
