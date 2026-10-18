import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { createOverlay, playAlertPreview, type OverlayRuntime } from '@ferrocast/overlays'
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

/**
 * The real overlay renderer playing one alert, at 16:9, scaled to fit. What you see is
 * exactly what OBS will show.
 */
export function AlertStage({
  alert,
  theme,
  className,
  label = 'Alert preview',
  controls = true,
  sound: soundProp,
  replay = 0,
}: {
  alert: RenderedAlert | null
  theme: string
  className?: string
  label?: string
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
    if (!el || typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setScale(stageScale(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
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
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
            This rule has nothing to preview yet.
          </p>
        )}
      </div>
      {controls && (
        <figcaption className="absolute top-2 right-2 flex gap-1">
          <IconButton
            size="sm"
            variant="secondary"
            label={sound ? 'Mute preview' : 'Play preview sound'}
            onClick={() => setSound((s) => !s)}
          >
            {sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
          </IconButton>
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
  const seq = useRef(0)
  const frame = useRef(0)
  const pending = useRef<'config' | 'snapshot' | null>(null)
  // Coalesce updates to one per animation frame; a drag only needs a `config` (layout)
  // frame, while new chat or goals need a fresh `snapshot`.
  const schedule = (kind: 'config' | 'snapshot') => {
    pending.current = pending.current === 'snapshot' ? 'snapshot' : kind
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const r = rt.current
      const k = pending.current
      pending.current = null
      if (!r || !k) return
      seq.current += 1
      const { overlay: o, state: st } = latest.current
      if (k === 'config') r.apply({ v: 1, seq: seq.current, type: 'config', data: o })
      else r.apply({ v: 1, seq: seq.current, type: 'snapshot', data: { overlay: o, state: st } })
    })
  }
  useEffect(() => {
    if (!root) return
    const r = createOverlay(root, { audio: false, fit: 'contain', lowMotion: !live })
    rt.current = r
    seq.current += 1
    r.apply({ v: 1, seq: seq.current, type: 'snapshot', data: { ...latest.current } })
    return () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      r.destroy()
      rt.current = null
    }
  }, [root, live])
  useEffect(() => schedule('config'), [overlay])
  useEffect(() => schedule('snapshot'), [state])
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
