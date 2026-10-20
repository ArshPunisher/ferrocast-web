import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useReducedMotion } from 'motion/react'
import { buildDesignAlert, playBuiltin, type DesignAlert } from '@ferrocast/overlays'
import type { RenderedAlert } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'

export type Scene = 'game' | 'light' | 'checker'

export interface StageTick {
  phase: 'idle' | 'in' | 'hold' | 'out'
  t: number
  total: number
}

export interface StageHandle {
  /** Plays the alert once from the start. */
  play: () => void
}

/** A backdrop that reads like a game behind the alert, so contrast looks like it will on stream. */
function Backdrop({ scene, shot }: { scene: Scene; shot?: string | null }) {
  if (shot)
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#0d1016] bg-cover bg-center"
        style={{ backgroundImage: `url("${shot.replace(/["\\]/g, '')}")` }}
      />
    )
  if (scene === 'checker')
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[repeating-conic-gradient(#2a2e36_0%_25%,#1c1f25_0%_50%)] [background-size:24px_24px]"
      />
    )
  if (scene === 'light')
    return (
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#c9d6e3]">
        <div className="absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.85),transparent_65%)]" />
        <div className="absolute -right-1/5 -bottom-1/3 h-3/4 w-2/3 rounded-full bg-[radial-gradient(circle,rgb(120_170_110/0.6),transparent_65%)]" />
      </div>
    )
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#0d1016]">
      <div className="absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full bg-[radial-gradient(circle,rgb(64_92_160/0.55),transparent_65%)]" />
      <div className="absolute -right-1/5 -bottom-1/3 h-3/4 w-2/3 rounded-full bg-[radial-gradient(circle,rgb(150_90_60/0.4),transparent_65%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,rgb(10_12_16/0.9),transparent)]" />
    </div>
  )
}

/**
 * The real overlay renderer drawing one alert design (what OBS will show), 16:9, scaled to
 * fit. Static until `play`; `autoplay` plays it again a moment after each change, `loop`
 * replays it; `onTick` drives a timeline playhead. Turning `sound` on plays it with sound.
 */
export function DesignStage({
  alert,
  scene = 'game',
  shot = null,
  autoplay = false,
  loop = false,
  sound = false,
  onTick,
  onPart,
  className,
  label = 'Alert preview',
  handle,
  mediaUrl,
  fill = false,
  refresh = 0,
  children,
}: {
  alert: RenderedAlert | null
  scene?: Scene
  /** A screenshot of the streamer's scene to preview over (an object URL). */
  shot?: string | null
  autoplay?: boolean
  loop?: boolean
  sound?: boolean
  onTick?: (t: StageTick) => void
  /** Clicking the picture or the text on the stage (the designer opens that section). */
  onPart?: (part: 'media' | 'text') => void
  className?: string
  label?: string
  handle?: Ref<StageHandle>
  /** Turns a library media id into a URL the dashboard can load. */
  mediaUrl?: (id: string) => string | null
  /** Fill the parent (letterboxed) instead of sizing itself at 16:9. */
  fill?: boolean
  /** Redraws when this changes (the media library finished loading). */
  refresh?: number
  children?: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const current = useRef<DesignAlert | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const raf = useRef(0)
  const sounding = useRef<HTMLAudioElement | null>(null)
  const latest = useRef({ alert, loop, sound, onTick, onPart, mediaUrl })
  latest.current = { alert, loop, sound, onTick, onPart, mediaUrl }
  const reduce = useReducedMotion() ?? false
  const [playing, setPlaying] = useState(false)

  const clear = useCallback(() => {
    sounding.current?.pause()
    sounding.current = null
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
    cancelAnimationFrame(raf.current)
    current.current?.destroy()
    current.current = null
  }, [])

  const mount = useCallback(
    (animate: boolean) => {
      clear()
      const el = box.current
      const a = latest.current.alert
      if (!el || !a?.design) return null
      let d: DesignAlert
      try {
        const toUrl = latest.current.mediaUrl
        // Impact hits sound only with the preview's sound on, like the alert's own sound.
        const sound = latest.current.sound
        d = buildDesignAlert(
          a,
          toUrl
            ? { lowMotion: reduce, mediaUrl: toUrl, impactSound: sound }
            : { lowMotion: reduce, impactSound: sound },
        )
      } catch {
        return null
      }
      d.host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
      el.appendChild(d.host)
      current.current = d
      const root = d.host.shadowRoot
      if (latest.current.onPart && root) {
        const media = root.querySelector<HTMLElement>('.fa-media')
        const text = root.querySelector<HTMLElement>('.fa-text')
        for (const [node, part] of [
          [media, 'media'],
          [text, 'text'],
        ] as const) {
          if (!node) continue
          node.style.cursor = 'pointer'
          node.addEventListener('click', () => latest.current.onPart?.(part))
        }
      }
      if (!animate) latest.current.onTick?.({ phase: 'idle', t: 0, total: a.duration_ms })
      return d
    },
    [clear, reduce],
  )

  const play = useCallback(() => {
    const d = mount(true)
    const a = latest.current.alert
    if (!d || !a?.design) return
    const look = a.design.look
    const total = Math.min(Math.max(a.duration_ms, 1000), 60_000)
    const outMs = reduce ? 200 : look.anim.out_ms
    d.start()
    setPlaying(true)
    if (latest.current.sound) {
      const url = a.sound ? latest.current.mediaUrl?.(a.sound) : null
      if (url) {
        try {
          const au = new Audio(url)
          au.volume = Math.min(1, Math.max(0, look.sound.volume / 100))
          sounding.current = au
          void au.play().catch(() => undefined)
        } catch {
          /* no sound in this browser */
        }
      } else if (look.sound.builtin !== 'none') playBuiltin(look.sound.builtin, look.sound.volume)
    }
    timers.current.push(
      setTimeout(
        () => {
          const ms = d.exit()
          timers.current.push(
            setTimeout(() => {
              setPlaying(false)
              if (latest.current.loop && !reduce) timers.current.push(setTimeout(play, 900))
              else mount(false)
            }, ms + 60),
          )
        },
        Math.max(200, total - outMs),
      ),
    )
    const start = performance.now()
    const inMs = reduce ? 200 : look.anim.in_ms
    const tick = () => {
      const t = performance.now() - start
      const phase = t < inMs ? 'in' : t < total - outMs ? 'hold' : 'out'
      latest.current.onTick?.({ phase, t, total })
      if (t < total + 60) raf.current = requestAnimationFrame(tick)
      else latest.current.onTick?.({ phase: 'idle', t: 0, total })
    }
    if (latest.current.onTick) raf.current = requestAnimationFrame(tick)
  }, [mount, reduce])

  useImperativeHandle(handle, () => ({ play }), [play])

  // A changed look shows at once; with autoplay or loop it replays a moment later.
  const key =
    JSON.stringify(alert?.design ?? null) + (alert?.title ?? '') + (alert?.body ?? '') + refresh
  useEffect(() => {
    mount(false)
    if (!(autoplay || loop) || reduce) return
    const t = setTimeout(play, 500)
    return () => clearTimeout(t)
  }, [key, autoplay, loop, mount, play, reduce])
  useEffect(() => clear, [clear])
  // Sound switched on: play it now, so the click is heard. Off: stop what's playing.
  const wasSound = useRef(sound)
  useEffect(() => {
    if (sound === wasSound.current) return
    wasSound.current = sound
    if (sound) play()
    else {
      sounding.current?.pause()
      sounding.current = null
    }
  }, [sound, play])

  return (
    <figure
      className={cx(
        'relative m-0 overflow-hidden rounded-panel border border-line bg-black',
        className,
      )}
      aria-label={label}
    >
      <div className={fill ? 'absolute inset-0' : 'relative aspect-video w-full'}>
        <Backdrop scene={scene} shot={shot} />
        <div ref={box} className="absolute inset-0" data-playing={playing ? 'true' : undefined} />
        {!alert?.design && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Nothing to preview for this event yet.
          </p>
        )}
      </div>
      {children}
    </figure>
  )
}
