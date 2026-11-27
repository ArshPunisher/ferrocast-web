import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import {
  createOverlay,
  playAlertPreview,
  unlockAudio,
  type OverlayRuntime,
} from '@ferrocast/overlays'
import overlayCss from '@ferrocast/overlays/styles.css?inline'
import type { Overlay, OverlayState, RenderedAlert } from '@ferrocast/api'
import { IconButton, cx } from '@ferrocast/ui'

/** A Shadow DOM host with the overlay stylesheet, so overlay CSS and streamer CSS never leak. */
function useShadowRoot(): [React.RefObject<HTMLDivElement | null>, HTMLElement | null] {
  const host = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const h = host.current
    if (!h) return
    const shadow = h.shadowRoot ?? h.attachShadow({ mode: 'open' })
    shadow.replaceChildren()
    const style = document.createElement('style')
    style.textContent = `${overlayCss}\n:host{display:block;position:absolute;inset:0}\n.stage-root{position:absolute;inset:0}`
    const r = document.createElement('div')
    r.className = 'stage-root'
    shadow.append(style, r)
    setRoot(r)
    return () => {
      shadow.replaceChildren()
      setRoot(null)
    }
  }, [])
  return [host, root]
}

/** The backdrop: a dark, blurry "game" so contrast reads like it will on stream. */
function Backdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#0d1016]">
      <div className="absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full bg-[radial-gradient(circle,rgb(64_92_160/0.55),transparent_65%)]" />
      <div className="absolute -right-1/5 -bottom-1/3 h-3/4 w-2/3 rounded-full bg-[radial-gradient(circle,rgb(150_90_60/0.4),transparent_65%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,rgb(10_12_16/0.9),transparent)]" />
    </div>
  )
}

/**
 * Narrowest stage the alert is laid out at. Alert text is sized for a 1080p canvas, so on a
 * phone the whole stage is laid out this wide and scaled down as one picture: the card
 * keeps its real proportions instead of the name breaking mid-word.
 */
const STAGE_MIN_W = 640

/** How much to shrink a stage `width` pixels wide (1 = real size). */
export function stageScale(width: number): number {
  return width > 0 ? Math.min(1, width / STAGE_MIN_W) : 1
}

/** True when playing the alert makes a sound (its file, a design's built-in sound or TTS). */
export function alertHasSound(a: RenderedAlert | null): boolean {
  if (!a) return false
  const builtin = a.design?.look?.sound?.builtin
  return !!(a.sound || a.tts_audio || a.tts_text?.trim() || (builtin && builtin !== 'none'))
}

/**
 * The real overlay renderer playing one alert, at 16:9, scaled to fit. What you see is
 * exactly what OBS will show.
 */
export function AlertStage({
  alert,
  theme,
  className,
  label = 'Alert preview',
  emptyMessage,
  controls = true,
  sound: soundProp,
  replay = 0,
}: {
  alert: RenderedAlert | null
  theme: string
  className?: string
  label?: string
  emptyMessage?: string
  /** Show the mute and replay buttons on the stage. Off when the caller draws its own. */
  controls?: boolean
  /** Play the alert's sound (controlled). Leave unset to use the stage's own button. */
  sound?: boolean
  /** Bump to replay the alert from the start. */
  replay?: number
}) {
  const [host, root] = useShadowRoot()
  const [nonce, setNonce] = useState(0)
  const [ownSound, setSound] = useState(false)
  const sound = soundProp ?? ownSound
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const applyWidth = (w: number) => {
      if (w <= 0) return
      const next = stageScale(w)
      setScale((prev) => (Math.abs(next - prev) >= 0.005 ? next : prev))
    }
    applyWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return
    let raf = 0
    let latestW = 0
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      latestW = entry.contentRect.width
      if (typeof requestAnimationFrame !== 'function') {
        applyWidth(latestW)
        return
      }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        applyWidth(latestW)
      })
    })
    ro.observe(el)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  useEffect(() => {
    if (!root || !alert) return
    return playAlertPreview(root, alert, { theme, audio: sound, loop: true })
  }, [root, alert, theme, sound, nonce, replay])
  return (
    <figure
      className={cx(
        'relative overflow-hidden rounded-panel border border-line bg-black',
        className,
      )}
      aria-label={label}
    >
      <div ref={box} className="relative aspect-video w-full">
        <Backdrop />
        <div
          ref={host}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${100 / scale}%`,
            height: `${100 / scale}%`,
            transform: scale < 1 ? `scale(${scale})` : undefined,
          }}
        />
        {!alert && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60">
            {emptyMessage ?? 'This rule has nothing to preview yet.'}
          </p>
        )}
      </div>
      {controls && (
        <figcaption className="absolute top-2 right-2 flex gap-1">
          {/* No button for a silent alert: toggling it would do nothing (onboarding, 1.0.0). */}
          {alertHasSound(alert) && (
            <IconButton
              size="sm"
              variant="secondary"
              label={sound ? 'Mute preview' : 'Play preview sound'}
              aria-pressed={sound}
              onClick={() => {
                unlockAudio()
                setSound((s) => !s)
              }}
            >
              {sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
            </IconButton>
          )}
          <IconButton
            size="sm"
            variant="secondary"
            label="Replay preview"
            onClick={() => setNonce((n) => n + 1)}
          >
            <ArrowCounterClockwise size={15} />
          </IconButton>
        </figcaption>
      )}
    </figure>
  )
}

/** A whole overlay (every widget) rendered from a snapshot, for the layout editor and onboarding. */
export function OverlayPreview({
  overlay,
  state,
  className,
  live = false,
}: {
  overlay: Overlay
  state: OverlayState
  className?: string
  live?: boolean
}) {
  const [host, root] = useShadowRoot()
  const rt = useRef<OverlayRuntime | null>(null)
  const latest = useRef({ overlay, state })
  latest.current = { overlay, state }
  const applied = useRef<{ overlay: Overlay; state: OverlayState } | null>(null)
  const seq = useRef(0)
  const frame = useRef(0)
  const pending = useRef<{ config: boolean; state: boolean; snapshot: boolean }>({
    config: false,
    state: false,
    snapshot: false,
  })
  // Coalesce updates to one per animation frame: layout edits send `config`, state-only edits
  // (labels, goals, viewers, poll, giveaway, credits, highlight) send `state` so chat and event
  // lists don't tear down and reset, and chat/event stream changes send `snapshot`.
  const schedule = (kind: 'config' | 'state' | 'snapshot') => {
    if (!rt.current) return
    pending.current[kind] = true
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const r = rt.current
      const p = pending.current
      pending.current = { config: false, state: false, snapshot: false }
      if (!r || (!p.config && !p.state && !p.snapshot)) return
      const prev = applied.current
      const { overlay: o, state: st } = latest.current
      applied.current = { overlay: o, state: st }
      if (p.snapshot) {
        seq.current += 1
        r.apply({ v: 1, seq: seq.current, type: 'snapshot', data: { overlay: o, state: st } })
        return
      }
      if (p.config) {
        seq.current += 1
        r.apply({ v: 1, seq: seq.current, type: 'config', data: o })
      }
      if (p.state) {
        const prevTrains = prev?.state.label_trains
        const clearedTrains: Record<string, null> = {}
        if (prevTrains) {
          for (const k of Object.keys(prevTrains)) {
            if (!st.label_trains || !(k in st.label_trains)) clearedTrains[k] = null
          }
        }
        const labelTrains =
          st.label_trains || Object.keys(clearedTrains).length > 0
            ? { ...clearedTrains, ...(st.label_trains ?? {}) }
            : undefined
        seq.current += 1
        r.apply({
          v: 1,
          seq: seq.current,
          type: 'state',
          data: {
            goals: st.goals,
            labels: st.labels,
            ...(labelTrains ? { label_trains: labelTrains } : {}),
            viewers: st.viewers,
            poll: st.poll ?? null,
            giveaway: st.giveaway ?? null,
            credits: st.credits ?? null,
            chat_highlight: st.chat_highlight ?? null,
            ...(st.show
              ? { show: st.show }
              : prev?.state.show
                ? { show: { countdown_ends_at: null } }
                : {}),
            ...(st.links !== undefined
              ? { links: st.links }
              : prev?.state.links
                ? { links: null }
                : {}),
          },
        })
      }
    })
  }
  useEffect(() => {
    if (!root) return
    const r = createOverlay(root, { audio: false, fit: 'contain', lowMotion: !live })
    rt.current = r
    applied.current = { ...latest.current }
    pending.current = { config: false, state: false, snapshot: false }
    seq.current += 1
    r.apply({ v: 1, seq: seq.current, type: 'snapshot', data: { ...latest.current } })
    return () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      pending.current = { config: false, state: false, snapshot: false }
      applied.current = null
      r.destroy()
      rt.current = null
    }
  }, [root, live])
  useEffect(() => {
    if (!rt.current || overlay === applied.current?.overlay) return
    schedule('config')
  }, [overlay])
  useEffect(() => {
    const prev = applied.current?.state
    if (!rt.current || !prev || state === prev) return
    const sameStreams = state.events === prev.events && state.chat === prev.chat
    schedule(sameStreams ? 'state' : 'snapshot')
  }, [state])
  return (
    // A picture of what viewers will see, not part of the dashboard: hidden from screen
    // readers (each card names it) and left out of the dashboard's contrast checks.
    <div
      data-overlay-preview
      aria-hidden="true"
      className={cx('overflow-hidden', className ?? 'relative')}
    >
      <div ref={host} className="absolute inset-0" />
    </div>
  )
}
