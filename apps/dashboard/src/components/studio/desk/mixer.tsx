// The Audio panel: every sound in the scene on air, like OBS's mixer but easier to read. Each
// has live meters (green, yellow, red, with a peak line and a clip light), a fader, mute and
// "hear it". Rows or a mixing desk of columns; right-click a sound for the rest (lock its
// volume, hide it, rename, filters). Devices heard in every scene come first.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  Columns,
  DotsThree,
  Eye,
  EyeSlash,
  Faders,
  Funnel,
  GearSix,
  Headphones,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Plus,
  Rows,
  SlidersHorizontal,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  Globe,
} from '@phosphor-icons/react'
import {
  type EngineAudio,
  type EngineItem,
  type EngineLevel,
  type EngineMonitor,
} from '@ferrocast/api'
import {
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  InfoTip,
  Input,
  Segmented,
  Skeleton,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction, useResource } from '../../../lib/hooks'
import { KindTile, SOUND_ONLY, useDesk, useDeskStats, type EngineApi } from './common'
import { itemFor } from './shown-in'
import { DockHeader } from './layout'
import { filterItems, useContextMenu, type MenuItem } from './menu'
import { AdvancedAudio } from './advanced-audio'
import {
  FLOOR,
  initialMeter,
  onFrame,
  stepMeter,
  useLatest,
  useLevelFeed,
  type LevelFeed,
} from './meter-feed'

/** The fader is cubic like OBS's: halfway is about -18 dB, the top is 0 dB. */
export const toDb = (pos: number): number =>
  pos <= 0 ? -100 : Math.max(-100, 60 * Math.log10(pos))
export const toPos = (db: number): number => (db <= -100 ? 0 : Math.min(1, 10 ** (db / 60)))
/** Where a level sits on the meter: -60 dB at one end, 0 at the other. */
export const meterPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
const SCALE = [-60, -50, -40, -30, -20, -10, 0]
/** OBS's zones: green to -20 dB, yellow to -9, red above. */
const ZONES =
  'linear-gradient(var(--dir),var(--fc-meter-ok,var(--fc-ok)) 0 66.6%,var(--fc-meter-warn,var(--fc-warn)) 66.6% 85%,var(--fc-meter-clip,var(--fc-danger)) 85% 100%)'

function qDb(v: number | undefined): number {
  if (v === undefined || v <= -60) return -100
  return Math.round(v * 2) / 2
}

function levelsSame(a: Record<string, EngineLevel>, b: Record<string, EngineLevel>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    const la = a[k]
    const lb = b[k]
    if (!la || !lb) return false
    if (
      qDb(la.peak[0]) !== qDb(lb.peak[0]) ||
      qDb(la.peak[1]) !== qDb(lb.peak[1]) ||
      qDb(la.magnitude[0]) !== qDb(lb.magnitude[0]) ||
      qDb(la.magnitude[1]) !== qDb(lb.magnitude[1]) ||
      qDb(la.input_peak?.[0]) !== qDb(lb.input_peak?.[0]) ||
      qDb(la.input_peak?.[1]) !== qDb(lb.input_peak?.[1])
    )
      return false
  }
  return true
}

/** Live levels as React state, for panels that read numbers (a gate's line, the ready check):
 * only a change of 0.5 dB or more re-renders, and no faster than 150 ms apart. The meters
 * themselves use `useLevelFeed` and never re-render. */
export function useLevels(api: EngineApi, names: string[]): Record<string, EngineLevel> {
  const [levels, setLevels] = useState<Record<string, EngineLevel>>({})
  const feed = useLevelFeed(api, names)
  const key = names.join('\n')
  useEffect(() => {
    if (!key) return
    const list = key.split('\n')
    let prev: Record<string, EngineLevel> = {}
    let lastAt = 0
    return feed.subscribe(() => {
      const now = performance.now()
      if (now - lastAt < 150) return
      const v: Record<string, EngineLevel> = {}
      for (const n of list) {
        const l = feed.get(n)
        if (l) v[n] = l
      }
      if (levelsSame(prev, v)) return
      lastAt = now
      prev = v
      setLevels(v)
    })
  }, [feed, key])
  return levels
}

/** How fast a meter falls after a peak, as OBS's Meter Decay Rate: dB per second. */
export const DECAY = { fast: 23.53, medium: 11.76, slow: 8.57 } as const
export type Decay = keyof typeof DECAY

/** A meter's shown level: up at once, down no faster than `rate` dB/s. */
export function decayed(prev: number, next: number, rate: number, dtMs: number): number {
  if (next >= prev) return next
  return Math.max(next, prev - (rate * dtMs) / 1000)
}

/** The fader's handle across (or up), pixels: w-3 / h-3. */
const THUMB = 12

/** A volume fader over the meter: drag, click, arrows (1 dB), Page keys (6 dB), Home/End. */
function Fader({
  pos,
  onMove,
  label,
  vertical,
  disabled,
}: {
  pos: number
  /** `last`: the pointer or key let go. */
  onMove: (pos: number, last: boolean) => void
  label: string
  vertical?: boolean | undefined
  disabled?: boolean | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  const at = (e: PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return pos
    // The handle stays on the bar: its middle runs from half its size in to half its size
    // short of the end.
    const f = vertical
      ? 1 - (e.clientY - r.top - THUMB / 2) / (r.height - THUMB)
      : (e.clientX - r.left - THUMB / 2) / (r.width - THUMB)
    return Math.max(0, Math.min(1, f))
  }
  const step = (db: number) => {
    const d = toDb(pos)
    const next = d <= -100 && db > 0 ? toPos(-60) : toPos(Math.min(0, d + db))
    onMove(next, true)
  }
  const key = (e: KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowUp: () => step(1),
      ArrowRight: () => step(1),
      ArrowDown: () => step(-1),
      ArrowLeft: () => step(-1),
      PageUp: () => step(6),
      PageDown: () => step(-6),
      Home: () => onMove(0, true),
      End: () => onMove(1, true),
    }
    const f = map[e.key]
    if (!f || disabled) return
    e.preventDefault()
    f()
  }
  const db = toDb(pos)
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={-100}
      aria-valuemax={0}
      aria-valuenow={Math.round(db * 10) / 10}
      aria-valuetext={db <= -100 ? 'Silent' : `${db.toFixed(1)} dB`}
      aria-disabled={disabled || undefined}
      onKeyDown={key}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        onMove(at(e), false)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onMove(at(e), false)
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        onMove(at(e), true)
      }}
      className={cx(
        'group/f absolute inset-0 touch-none rounded-[6px] outline-none focus-visible:shadow-[var(--fc-focus)]',
        disabled ? 'cursor-not-allowed' : vertical ? 'cursor-ns-resize' : 'cursor-ew-resize',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute rounded-[5px] border-2 border-surface-1 bg-text shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-transform group-active/f:scale-110 motion-reduce:transition-none',
          vertical ? 'inset-x-0 h-3' : 'inset-y-0 w-3',
          disabled && 'bg-text-3',
        )}
        // All of the handle stays on the bar, so at full volume it reaches the bar's end and
        // nothing of the bar shows past it (owner, 28 Oct).
        style={
          vertical
            ? { top: `calc(${1 - pos} * (100% - ${THUMB}px))` }
            : { left: `calc(${pos} * (100% - ${THUMB}px))` }
        }
      />
    </div>
  )
}

/** Meters for both sides with the fader on top. Held peaks show as a line; `scale` adds dB
 * marks. Used by the mixer and a source's own panel. */
export function Meter({
  level,
  feed,
  feedName,
  muted,
  volumeDb,
  label,
  onVolume,
  tall,
  vertical,
  locked,
  scale,
  decay = DECAY.fast,
}: {
  /** A level to show as it is (the live way is `feed` + `feedName`). */
  level?: EngineLevel | undefined
  /** Live levels drawn every animation frame, with no React render per tick. */
  feed?: LevelFeed
  feedName?: string
  muted: boolean
  volumeDb: number
  label: string
  onVolume: (db: number) => void
  tall?: boolean
  vertical?: boolean
  locked?: boolean
  scale?: boolean
  /** dB per second the bar falls at. */
  decay?: number
}) {
  const [pos, setPos] = useState<number | null>(null)
  const shown = pos ?? toPos(volumeDb)
  const last = useRef(0)
  const covers = useRef<(HTMLDivElement | null)[]>([])
  const holds = useRef<(HTMLDivElement | null)[]>([])
  const light = useRef<HTMLSpanElement | null>(null)
  // The bars' colour, dimmed while a push-to-talk / push-to-mute key holds the sound muted.
  const zones = useRef<(HTMLDivElement | null)[]>([])
  const input = useLatest({ level, feed, feedName, decay, vertical: !!vertical })
  useEffect(() => {
    const st = [initialMeter(), initialMeter()]
    const shown: string[] = ['', '', '', '']
    let last = performance.now()
    let clipAt = -1e9
    let clipOn = false
    let gatedOn = false
    return onFrame((now) => {
      const t = input.current
      const lv = t.feed && t.feedName !== undefined ? t.feed.get(t.feedName) : t.level
      const gated = !!lv?.gated
      if (gated !== gatedOn) {
        gatedOn = gated
        for (const z of zones.current) {
          if (z) {
            z.style.opacity = gated ? '0.35' : ''
            z.style.filter = gated ? 'grayscale(1)' : ''
          }
        }
      }
      const dt = now - last
      last = now
      for (let i = 0; i < 2; i++) {
        const peak = lv?.peak[i] ?? FLOOR
        const s = (st[i] = stepMeter(st[i]!, peak, dt, now, t.decay, DECAY.fast))
        if (peak >= -0.5) clipAt = now
        const pct = meterPct(s.level)
        const held = meterPct(s.hold)
        const cover = t.vertical ? `translate3d(0, ${-pct}%, 0)` : `translate3d(${pct}%, 0, 0)`
        const tick = t.vertical
          ? `translate3d(0, ${100 - held}%, 0)`
          : `translate3d(${held - 100}%, 0, 0)`
        const c = covers.current[i]
        if (c && shown[i * 2] !== cover) c.style.transform = shown[i * 2] = cover
        const h = holds.current[i]
        if (h && shown[i * 2 + 1] !== tick) {
          shown[i * 2 + 1] = tick
          h.style.transform = tick
          h.style.display = held > 0 ? '' : 'none'
        }
      }
      const clip = now - clipAt < 2000
      if (clip !== clipOn && light.current) {
        clipOn = clip
        light.current.dataset.clip = String(clip)
        light.current.title = clip ? 'Too loud: it clipped' : ''
      }
    })
  }, [input])
  const move = (p: number, end: boolean) => {
    // Sent as it moves, at most every 80 ms; the last value always goes.
    const now = Date.now()
    if (end) {
      setPos(null)
      onVolume(toDb(p))
    } else {
      setPos(p)
      if (now - last.current > 80) {
        last.current = now
        onVolume(toDb(p))
      }
    }
  }
  const bars = [0, 1].map((i) => (
    <div
      key={i}
      className={cx(
        'relative overflow-hidden rounded-full bg-inset',
        vertical ? 'h-full w-[7px]' : tall ? 'h-[8px]' : 'h-[6px]',
      )}
      style={{ ['--dir' as string]: vertical ? '0deg' : '90deg' }}
    >
      {/* GPU-composited meter: the gradient sits static; the cover and the peak tick are moved
          every animation frame by direct style writes (no React render, no layout). */}
      <div
        aria-hidden
        ref={(el) => {
          zones.current[i] = el
        }}
        className={cx('absolute inset-0', muted && 'opacity-40 grayscale')}
        style={{ background: ZONES }}
      />
      <div
        aria-hidden
        ref={(el) => {
          covers.current[i] = el
        }}
        className="pointer-events-none absolute inset-0 bg-inset/80 will-change-transform"
      />
      <div
        aria-hidden
        ref={(el) => {
          holds.current[i] = el
        }}
        className="pointer-events-none absolute inset-0 will-change-transform"
        style={{ display: 'none' }}
      >
        <span
          className={cx(
            'absolute bg-text',
            vertical ? 'inset-x-0 top-0 h-[2px]' : 'inset-y-0 right-0 w-[2px]',
          )}
        />
      </div>
    </div>
  ))
  const marks = scale && (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none relative font-mono text-[10.5px] font-semibold text-text-3 tabular-nums',
        vertical ? 'h-full w-5' : 'fc-scale-h h-3 w-full',
      )}
    >
      {SCALE.map((d) => (
        <span
          key={d}
          className={cx(
            'absolute leading-none',
            vertical ? 'right-0 translate-y-1/2' : '-translate-x-1/2',
          )}
          style={
            vertical
              ? { bottom: `${meterPct(d)}%` }
              : { left: `${Math.min(97, Math.max(3, meterPct(d)))}%` }
          }
        >
          {Math.abs(d)}
        </span>
      ))}
    </div>
  )
  const clipLight = (
    <span
      aria-hidden
      ref={light}
      data-clip="false"
      className="size-2 shrink-0 rounded-full bg-surface-3 transition-colors data-[clip=true]:bg-[var(--fc-meter-clip,var(--fc-danger-fill))] data-[clip=true]:shadow-[0_0_6px_var(--fc-meter-clip,var(--fc-danger))]"
    />
  )
  if (vertical)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5">
        {clipLight}
        <div className="flex min-h-0 flex-1 gap-1">
          {marks}
          <div className="relative flex h-full gap-[3px] px-1">
            {bars}
            <Fader pos={shown} onMove={move} label={label} vertical disabled={locked} />
          </div>
        </div>
      </div>
    )
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <div className={cx('relative min-w-0 flex-1', tall ? 'h-[30px]' : 'h-6')}>
          <div
            className={cx(
              'absolute inset-x-0 flex flex-col',
              tall ? 'top-[6px] gap-1' : 'top-[5px] gap-[3px]',
            )}
          >
            {bars}
          </div>
          <Fader pos={shown} onMove={move} label={label} disabled={locked} />
        </div>
        {clipLight}
      </div>
      {marks && <div className="pr-3.5">{marks}</div>}
    </div>
  )
}

type AudioPatch = Partial<Pick<EngineAudio, 'volume_db' | 'muted' | 'monitor'>>

// What's kept per browser: the view, sounds whose volume is locked, and hidden sounds.
interface Prefs {
  vertical: boolean
  locked: string[]
  hidden: string[]
  /** How fast meters fall (OBS's decay rate). */
  decay: Decay
  /** Only sounds making sound now (OBS's "active" filter). */
  activeOnly: boolean
}
const PREFS_KEY = 'fc-studio-mixer'
function prefsKey(collectionId?: string | null): string {
  return collectionId ? `${PREFS_KEY}:${collectionId}` : PREFS_KEY
}
function loadPrefs(collectionId?: string | null): Prefs {
  try {
    const key = prefsKey(collectionId)
    const raw = localStorage.getItem(key)
    const v = JSON.parse(raw ?? 'null') as Partial<Prefs> | null
    if (!v && collectionId) {
      const globalPrefs = JSON.parse(
        localStorage.getItem(PREFS_KEY) ?? 'null',
      ) as Partial<Prefs> | null
      return {
        vertical: !!globalPrefs?.vertical,
        locked: [],
        hidden: [],
        decay:
          globalPrefs?.decay === 'medium' || globalPrefs?.decay === 'slow'
            ? globalPrefs.decay
            : 'fast',
        activeOnly: !!globalPrefs?.activeOnly,
      }
    }
    return {
      vertical: !!v?.vertical,
      locked: Array.isArray(v?.locked) ? v.locked : [],
      hidden: Array.isArray(v?.hidden) ? v.hidden : [],
      decay: v?.decay === 'medium' || v?.decay === 'slow' ? v.decay : 'fast',
      activeOnly: !!v?.activeOnly,
    }
  } catch {
    return { vertical: false, locked: [], hidden: [], decay: 'fast', activeOnly: false }
  }
}
function usePrefs(collectionId?: string | null): [Prefs, (f: (p: Prefs) => Prefs) => void] {
  const [p, setP] = useState(() => loadPrefs(collectionId))
  useEffect(() => {
    setP(loadPrefs(collectionId))
  }, [collectionId])
  const set = (f: (p: Prefs) => Prefs) =>
    setP((old) => {
      const n = f(old)
      try {
        localStorage.setItem(prefsKey(collectionId), JSON.stringify(n))
      } catch {
        // Private mode: kept for this visit.
      }
      return n
    })
  return [p, set]
}
const toggle = (list: string[], name: string) =>
  list.includes(name) ? list.filter((x) => x !== name) : [...list, name]

const HEAR: { value: EngineMonitor; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'only_me', label: 'Only me' },
  { value: 'me_and_stream', label: 'Me and the stream' },
]

interface ChannelProps {
  a: EngineAudio
  feed: LevelFeed
  locked: boolean
  onAudio: (patch: AudioPatch) => void
  onMenu: (e: React.MouseEvent) => void
  decay: number
}

function MuteButton({ a, onAudio }: Pick<ChannelProps, 'a' | 'onAudio'>) {
  return (
    <IconButton
      size="xs"
      variant="ghost"
      label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
      aria-pressed={a.muted}
      // Filled both ways (owner, 11 Nov, as the eye and lock); muted is a solid red chip.
      className={cx(
        // `!`: the ghost button's own hover would clear the fill (owner, 11 Nov).
        a.muted
          ? 'bg-danger-fill! text-white! hover:brightness-110'
          : 'text-text-2 hover:text-text',
      )}
      onClick={() => onAudio({ muted: !a.muted })}
    >
      {a.muted ? <SpeakerSlash size={15} weight="fill" /> : <SpeakerHigh size={15} weight="fill" />}
    </IconButton>
  )
}

function HearButton({ a, onAudio }: Pick<ChannelProps, 'a' | 'onAudio'>) {
  const hearing = a.monitor !== 'off'
  return (
    <IconButton
      size="xs"
      variant="ghost"
      label={hearing ? `Stop hearing ${a.name}` : `Hear ${a.name} in your headphones`}
      aria-pressed={hearing}
      // Filled both ways; on, a solid green chip with a white icon (owner, 11 Nov), kept on
      // hover (`!` over the ghost button's own hover).
      className={cx(
        hearing
          ? 'bg-[var(--fc-ok-fill)]! text-white! hover:brightness-110'
          : 'text-text-3 hover:text-text',
      )}
      onClick={() => onAudio({ monitor: hearing ? 'off' : 'me_and_stream' })}
    >
      <Headphones size={15} weight="fill" />
    </IconButton>
  )
}

const dbText = (a: EngineAudio) =>
  a.muted ? 'Muted' : a.volume_db <= -100 ? 'Silent' : `${a.volume_db.toFixed(1)} dB`

function Row({ a, feed, locked, onAudio, onMenu, decay }: ChannelProps) {
  return (
    <div
      onContextMenu={onMenu}
      className={cx(
        'group/row border-b border-line pt-1.5 pr-1.5 pb-1 pl-3 transition-colors hover:bg-surface-2',
        a.muted && 'bg-danger-soft/40',
      )}
    >
      <div className="flex items-center gap-2 text-[13.5px]">
        <KindTile kind={a.kind} size={20} dim={a.muted} />
        <span
          className={cx(
            'min-w-0 flex-1 truncate font-semibold',
            a.muted ? 'text-text-3' : 'text-text',
          )}
        >
          {a.name}
        </span>
        {(a.push_to_talk || a.push_to_mute) && (
          <span
            title={
              a.push_to_talk
                ? 'Push to talk: muted unless its key is held.'
                : 'Push to mute: muted while its key is held.'
            }
            className="shrink-0 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold text-text-2"
          >
            {a.push_to_talk ? 'PTT' : 'PTM'}
          </span>
        )}
        {a.channel !== null && (
          <>
            <span className="hidden shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-bold text-accent-text @[300px]:inline">
              Everywhere
            </span>
            <Globe
              size={15}
              weight="bold"
              className="shrink-0 text-accent-text @[300px]:hidden"
              aria-label="Everywhere: in every scene"
            />
          </>
        )}
        {locked && (
          <LockSimple size={13} weight="bold" className="text-text-3" aria-label="Locked" />
        )}
        {/* The fader's setting, not the sound: 0 dB is full volume, as in OBS. The bar below
            shows how loud it is. */}
        <span
          title="Volume: 0 dB is full (unchanged). The bar shows how loud it is."
          className={cx(
            'flex shrink-0 items-baseline justify-end gap-1 text-right font-mono text-[12.5px] font-semibold tabular-nums',
            a.muted ? 'text-danger' : 'text-text',
          )}
        >
          {!a.muted && (
            <span className="hidden font-sans text-[12px] font-semibold text-text-3 @[260px]:inline">
              Vol
            </span>
          )}
          {/* Wide enough for the longest ("-99.9 dB") on one line: the row never shifts as the
              fader moves (owner, 29 Oct). */}
          <span className="w-[8.5ch] whitespace-nowrap">{dbText(a)}</span>
        </span>
      </div>
      <div className="mt-0.5 flex items-start gap-0.5">
        <MuteButton a={a} onAudio={onAudio} />
        <div className="min-w-0 flex-1 pt-0.5">
          <Meter
            feed={feed}
            feedName={a.name}
            muted={a.muted}
            volumeDb={a.volume_db}
            label={`${a.name} volume`}
            locked={locked}
            decay={decay}
            scale
            onVolume={(volume_db) => onAudio({ volume_db: Math.round(volume_db * 10) / 10 })}
          />
        </div>
        <HearButton a={a} onAudio={onAudio} />
        <IconButton
          size="xs"
          variant="ghost"
          label={`More for ${a.name}`}
          onClick={onMenu}
          // Narrow (owner's pick N1): there on hover or focus; right-click opens it too.
          className="fc-quiet"
        >
          <DotsThree size={15} weight="bold" />
        </IconButton>
      </div>
    </div>
  )
}

/**
 * A slim channel strip for the mixing desk (owner's pick D1, 29 Oct): the level on top, a tall
 * meter with its fader, mute and hear, and the name at the bottom (it opens the sound's menu).
 * The dB scale is printed once beside the strips (DeskScale), not on each.
 */
function Strip({ a, feed, locked, onAudio, onMenu, decay }: ChannelProps) {
  return (
    <div
      onContextMenu={onMenu}
      className={cx(
        'flex h-full w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-[10px] border border-line bg-surface-2 px-1 pt-2 pb-1.5',
        a.muted && 'border-danger/30',
      )}
    >
      <span
        className={cx(
          'h-5 font-mono text-[12.5px] leading-5 font-bold tabular-nums',
          a.muted ? 'text-danger' : 'text-text-2',
        )}
      >
        {a.muted ? 'Muted' : a.volume_db <= -100 ? 'Silent' : a.volume_db.toFixed(1)}
      </span>
      <Meter
        vertical
        feed={feed}
        feedName={a.name}
        muted={a.muted}
        volumeDb={a.volume_db}
        label={`${a.name} volume`}
        locked={locked}
        decay={decay}
        onVolume={(volume_db) => onAudio({ volume_db: Math.round(volume_db * 10) / 10 })}
      />
      <div className="flex h-8 items-center gap-1">
        <MuteButton a={a} onAudio={onAudio} />
        <HearButton a={a} onAudio={onAudio} />
      </div>
      <button
        type="button"
        onClick={onMenu}
        title={a.channel !== null ? `${a.name} (in every scene)` : a.name}
        aria-label={`More for ${a.name}`}
        className={cx(
          'flex h-6 w-full min-w-0 items-center justify-center gap-1 rounded-[6px] px-1 text-[12px] font-bold outline-none hover:bg-surface-3 focus-visible:shadow-[var(--fc-focus)]',
          a.muted ? 'text-text-3' : 'text-text',
        )}
      >
        {a.channel !== null && (
          <Globe size={11} weight="bold" className="shrink-0 text-accent-text" aria-hidden />
        )}
        <span className="min-w-0 truncate">{a.name}</span>
      </button>
    </div>
  )
}

/** The mixing desk's dB scale, once, lined up with the strips' meters. */
function DeskScale() {
  return (
    <div aria-hidden className="flex h-full w-6 shrink-0 flex-col items-center gap-1.5 pt-2 pb-1.5">
      <span className="h-5" />
      <span className="flex w-full flex-1 flex-col">
        {/* The meter's clip light and gap above its bars (CodeRabbit). */}
        <span className="h-[14px] shrink-0" />
        <span className="relative w-full flex-1 font-mono text-[10.5px] font-semibold text-text-3 tabular-nums">
          {SCALE.map((d) => (
            <span
              key={d}
              className="absolute right-0 translate-y-1/2 leading-none"
              style={{ bottom: `${meterPct(d)}%` }}
            >
              {Math.abs(d)}
            </span>
          ))}
        </span>
      </span>
      <span className="h-8" />
      <span className="h-6" />
    </div>
  )
}

export type RemoveTarget =
  | { mode: 'global'; audio: EngineAudio }
  | { mode: 'scene'; audio: EngineAudio; scene: string; itemId: number }
  | { mode: 'lookup_scene'; audio: EngineAudio; scene: string }
  | { mode: 'drawer'; audio: EngineAudio; scenes: string[] }

export type ConfirmRemoveTarget = Extract<RemoveTarget, { mode: 'global' | 'scene' }>

/** Resolves how a mixer row/strip Remove action should remove or hand off a sound source. */
export function resolveRemoveTarget(args: {
  audio: EngineAudio
  scene: string
  items: EngineItem[]
  selected: number | null
  ownerScenes: string[]
  otherItems?: EngineItem[]
  otherSelected?: number | null
}): RemoveTarget {
  const { audio, scene, items, selected, ownerScenes, otherItems, otherSelected = null } = args
  if (audio.channel !== null) {
    return { mode: 'global', audio }
  }
  const hit = itemFor(items, audio.name, selected)
  if (hit) {
    return { mode: 'scene', audio, scene, itemId: hit.id }
  }
  if (ownerScenes.length === 1) {
    const targetScene = ownerScenes[0]!
    if (otherItems) {
      const otherHit = itemFor(otherItems, audio.name, otherSelected)
      if (otherHit) {
        return { mode: 'scene', audio, scene: targetScene, itemId: otherHit.id }
      }
      return { mode: 'drawer', audio, scenes: ownerScenes }
    }
    return { mode: 'lookup_scene', audio, scene: targetScene }
  }
  return { mode: 'drawer', audio, scenes: ownerScenes }
}

/** Confirmation copy shown before removing a global device or scene source from the mixer. */
export function removeConfirmCopy(
  target: ConfirmRemoveTarget,
  live: boolean,
): { title: string; description: string } {
  if (target.mode === 'global') {
    return {
      title: `Remove ${target.audio.name} from every scene?`,
      description: `It plays in every scene. Press Undo to bring it back with its volume and filters.${live ? ' Viewers will stop hearing it right away.' : ''}`,
    }
  }
  if (SOUND_ONLY.has(target.audio.kind)) {
    return {
      title: `Remove ${target.audio.name} from ${target.scene}?`,
      description: 'Other scenes keep it. Press Undo to bring it back.',
    }
  }
  return {
    title: `Remove ${target.audio.name} from ${target.scene}?`,
    description: `This removes both its picture and sound from ${target.scene}. Use Hide to keep it in the scene.`,
  }
}

export function AudioDock() {
  const desk = useDesk()
  const {
    api,
    audio,
    pictureScenes,
    setAdding,
    openSettings,
    edit,
    refresh,
    collectionId: rawCollectionId,
    collectionKey: rawCollectionKey,
    scenesSettling: rawSettling,
  } = desk
  const collectionId = typeof rawCollectionId === 'string' ? rawCollectionId : null
  const collectionKey = typeof rawCollectionKey === 'number' ? rawCollectionKey : 0
  const scenesSettling = rawSettling === true
  const live = useDeskStats((s) => Boolean(s?.stream?.active))
  const { run, busy } = useAction()
  const [all, setAll] = useState(false)
  const [prefs, setPrefs] = usePrefs(collectionId)
  const [naming, setNaming] = useState<{ from: string; value: string } | null>(null)
  const [removing, setRemoving] = useState<ConfirmRemoveTarget | null>(null)
  // Advanced audio: open on one sound's name, or '' for all.
  const [advanced, setAdvanced] = useState<string | null>(null)
  const { open, menu } = useContextMenu()
  const names = pictureScenes.map((x) => x.name).join('\n')
  // Every scene's sounds, each once, plus which scenes contain each sound for All-view removal.
  const every = useResource(async () => {
    if (!all || !names || scenesSettling) return null
    const sceneNames = names.split('\n')
    const lists = await Promise.all(sceneNames.map(async (n) => [n, await api.audio(n)] as const))
    const scenesByName: Record<string, string[]> = {}
    const seen = new Set<string>()
    const list: EngineAudio[] = []
    for (const [sc, items] of lists) {
      for (const a of items) {
        const owners = (scenesByName[a.name] ??= [])
        if (!owners.includes(sc)) owners.push(sc)
        if (!seen.has(a.name)) {
          seen.add(a.name)
          list.push(a)
        }
      }
    }
    return { list, scenesByName }
  }, [api, all, names, audio.data, collectionKey, scenesSettling])
  const list = all ? (every.data?.list ?? null) : audio.data
  const shown = list?.filter(
    (a) => !prefs.hidden.includes(a.name) && (!prefs.activeOnly || a.active !== false),
  )
  const hiddenHere = (list?.length ?? 0) - (shown?.length ?? 0)
  const feed = useLevelFeed(api, shown?.map((a) => a.name) ?? [])

  const setAudio = (name: string, patch: AudioPatch) => {
    // Shown at once; the engine follows.
    audio.set((l) => (l ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    every.set(
      (prev) =>
        prev && { ...prev, list: prev.list.map((x) => (x.name === name ? { ...x, ...patch } : x)) },
    )
    void run(`audio:${name}`, () => api.setAudio(name, patch), { quiet: false })
  }

  const requestRemove = async (a: EngineAudio) => {
    const target = resolveRemoveTarget({
      audio: a,
      scene: desk.scene,
      items: desk.items.data ?? [],
      selected: desk.selected,
      ownerScenes: [],
    })
    if (target.mode === 'global' || target.mode === 'scene') {
      setRemoving(target)
      return
    }
    const resolved = await run(
      'remove-lookup',
      async () => {
        let ownerScenes = every.data?.scenesByName[a.name] ?? []
        try {
          const srcs = await api.sources()
          const match = srcs.find((s) => s.name === a.name)
          if (match?.scenes.length) ownerScenes = match.scenes
        } catch {
          // Fall back to All-view scene ownership if sources() fails.
        }
        const next = resolveRemoveTarget({
          audio: a,
          scene: desk.scene,
          items: desk.items.data ?? [],
          selected: desk.selected,
          ownerScenes,
        })
        if (next.mode !== 'lookup_scene') return next
        const otherItems = await api.items(next.scene)
        return resolveRemoveTarget({
          audio: a,
          scene: desk.scene,
          items: desk.items.data ?? [],
          selected: desk.selected,
          ownerScenes,
          otherItems,
        })
      },
      { once: true },
    )
    if (!resolved) return
    if (resolved.mode === 'drawer') {
      edit(a.name, 'sound')
      return
    }
    if (resolved.mode === 'scene') {
      setRemoving(resolved)
    }
  }

  const confirmRemove = async () => {
    const target = removing
    if (!target) return
    const ok = await run(
      'remove',
      () =>
        target.mode === 'global'
          ? done(api.setChannel(target.audio.channel!, null))
          : done(api.editItem(target.scene, target.itemId, 'remove')),
      { once: true },
    )
    if (!ok) return
    setRemoving(null)
    if (desk.editing === target.audio.name) edit(null)
    refresh()
    if (all) every.reload()
    toast({
      tone: 'info',
      key: `audio-removed:${target.audio.name}`,
      message: `${target.audio.name} removed.`,
      duration: 6000,
      action: {
        label: 'Undo',
        run: () =>
          run(
            'undo',
            async () => {
              await api.undo()
              refresh()
              if (all) every.reload()
              desk.bumpUndone?.()
            },
            { once: true },
          ),
      },
    })
  }
  const rename = async () => {
    if (!naming) return
    const to = naming.value.trim()
    if (!to || to === naming.from) return setNaming(null)
    const ok = await run('rename', () => done(api.rename(naming.from, to)))
    if (ok) {
      // Locks and hiding follow the new name.
      setPrefs((p) => ({
        ...p,
        locked: p.locked.map((x) => (x === naming.from ? to : x)),
        hidden: p.hidden.map((x) => (x === naming.from ? to : x)),
      }))
      setNaming(null)
      refresh()
    }
  }
  const unhideAll: MenuItem = {
    label: 'Show hidden sounds',
    icon: Eye,
    disabled: prefs.hidden.length === 0,
    onSelect: () => setPrefs((p) => ({ ...p, hidden: [] })),
  }
  const channelMenu = (a: EngineAudio): MenuItem[] => {
    const locked = prefs.locked.includes(a.name)
    return [
      {
        label: a.muted ? 'Unmute' : 'Mute',
        icon: a.muted ? SpeakerHigh : SpeakerSlash,
        onSelect: () => setAudio(a.name, { muted: !a.muted }),
      },
      {
        label: 'Hear it',
        icon: Headphones,
        items: HEAR.map((h) => ({
          label: h.label,
          checked: a.monitor === h.value,
          onSelect: () => setAudio(a.name, { monitor: h.value }),
        })),
      },
      {
        label: locked ? 'Unlock volume' : 'Lock volume',
        icon: locked ? LockSimpleOpen : LockSimple,
        onSelect: () => setPrefs((p) => ({ ...p, locked: toggle(p.locked, a.name) })),
      },
      { sep: true },
      {
        label: 'Hide',
        icon: EyeSlash,
        onSelect: () => setPrefs((p) => ({ ...p, hidden: toggle(p.hidden, a.name) })),
      },
      unhideAll,
      { sep: true },
      {
        label: 'Rename',
        icon: PencilSimple,
        onSelect: () => setNaming({ from: a.name, value: a.name }),
      },
      { label: 'Filters', icon: Funnel, onSelect: () => edit(a.name, 'filters') },
      { label: 'Settings', icon: SlidersHorizontal, onSelect: () => edit(a.name, 'settings') },
      {
        label: 'Advanced audio',
        icon: Faders,
        hint: 'Balance, sync, tracks',
        onSelect: () => setAdvanced(a.name),
      },
      ...filterItems(a.name, {
        ...desk,
        paste: (from) =>
          void run('filters', () => done(api.pasteFilters(a.name, from)), {
            success: `Filters pasted onto ${a.name}.`,
          }),
      }),
      { sep: true },
      {
        label: 'Remove',
        icon: Trash,
        danger: true,
        onSelect: () => void requestRemove(a),
      },
    ]
  }
  const props = (a: EngineAudio): ChannelProps => ({
    a,
    feed,
    locked: prefs.locked.includes(a.name),
    onAudio: (p) => setAudio(a.name, p),
    onMenu: (e) => open(e, a.name, channelMenu(a)),
    decay: DECAY[prefs.decay],
  })
  const error = all ? every.error : audio.error

  return (
    <section aria-label="Audio" className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id="audio"
        info={
          <InfoTip label="About audio">
            Every scene has its own sounds. Everywhere: in all scenes. Right-click a sound for more.
          </InfoTip>
        }
        actions={
          <>
            {/* Narrow (owner's pick N1): one button that says which, instead of both. */}
            <span className="hidden @[320px]:contents">
              <Segmented
                size="sm"
                label="Which sounds"
                value={all ? 'all' : 'scene'}
                options={[
                  { value: 'scene', label: 'This scene' },
                  { value: 'all', label: 'All' },
                ]}
                onChange={(v) => setAll(v === 'all')}
              />
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={all}
              title={all ? 'Showing every scene’s sounds' : 'Showing this scene’s sounds'}
              className="h-8 px-2 text-[13px] @[320px]:hidden"
              onClick={() => setAll(!all)}
            >
              {all ? 'All' : 'Scene'}
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label={prefs.vertical ? 'Show as rows' : 'Show as a mixing desk'}
              onClick={() => setPrefs((p) => ({ ...p, vertical: !p.vertical }))}
            >
              {prefs.vertical ? (
                <Rows size={16} weight="bold" />
              ) : (
                <Columns size={16} weight="bold" />
              )}
            </IconButton>
          </>
        }
      />
      <div
        className={cx(
          'min-h-0 flex-1',
          prefs.vertical && 'p-1.5',
          prefs.vertical ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto',
        )}
        onContextMenu={(e) =>
          open(e, 'Audio', [
            { label: 'Add sound', icon: Plus, onSelect: () => setAdding('mic') },
            unhideAll,
            { label: 'Advanced audio', icon: Faders, onSelect: () => setAdvanced('') },
            {
              label: 'Only sounds making sound',
              checked: prefs.activeOnly,
              onSelect: () => setPrefs((p) => ({ ...p, activeOnly: !p.activeOnly })),
            },
            {
              label: 'Meters fall',
              items: (['fast', 'medium', 'slow'] as const).map((d) => ({
                label: d === 'fast' ? 'Fast' : d === 'medium' ? 'Medium' : 'Slow',
                checked: prefs.decay === d,
                onSelect: () => setPrefs((p) => ({ ...p, decay: d })),
              })),
            },
            { label: 'Audio settings', icon: GearSix, onSelect: () => openSettings('audio') },
          ])
        }
      >
        {error && !list ? (
          <LoadError error={error} onRetry={all ? every.reload : audio.reload} />
        ) : !list || !shown ? (
          <Skeleton className="m-1.5 h-28" />
        ) : shown.length === 0 ? (
          <p className="m-0 p-3 text-[13.5px] font-medium text-text-2">
            {list.length > 0 ? 'Every sound here is hidden.' : 'No sound here yet.'}
          </p>
        ) : prefs.vertical ? (
          <div className="flex h-full gap-1.5">
            <DeskScale />
            {shown.map((a) => (
              <Strip key={a.name} {...props(a)} />
            ))}
          </div>
        ) : (
          <div className="@container flex flex-col pb-2">
            {shown.map((a) => (
              <Row key={a.name} {...props(a)} />
            ))}
          </div>
        )}
      </div>
      <footer className="fc-dock-bar flex h-8 flex-none items-center gap-0.5 border-t border-line px-1">
        <Button size="xs" variant="ghost" onClick={() => setAdding('mic')}>
          <Plus size={14} weight="bold" /> Add sound
        </Button>
        {hiddenHere > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setPrefs((p) => ({ ...p, hidden: [] }))}>
            <Eye size={14} weight="bold" /> {hiddenHere} hidden
          </Button>
        )}
        <span className="flex-1" />
        <IconButton
          size="sm"
          variant="ghost"
          label="Advanced audio: balance, sync, mono, tracks"
          onClick={() => setAdvanced('')}
        >
          <Faders size={15} weight="bold" />
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label="Audio settings"
          onClick={() => openSettings('audio')}
        >
          <GearSix size={15} weight="bold" />
        </IconButton>
      </footer>
      {menu}
      <AdvancedAudio focus={advanced} onClose={() => setAdvanced(null)} />
      <Dialog
        compact
        open={naming !== null}
        onClose={() => setNaming(null)}
        size="sm"
        title={`Rename ${naming?.from ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void rename()}>
              Save
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void rename()
          }}
        >
          <Input
            autoFocus
            data-autofocus
            aria-label="New name"
            maxLength={100}
            value={naming?.value ?? ''}
            onChange={(e) => setNaming((n) => n && { ...n, value: e.target.value })}
          />
        </form>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        busy={busy === 'remove'}
        closeOnConfirm={false}
        onClose={() => {
          if (busy !== 'remove') setRemoving(null)
        }}
        {...(removing ? removeConfirmCopy(removing, live) : { title: '' })}
        confirm="Remove"
        danger
        onConfirm={() => void confirmRemove()}
      />
    </section>
  )
}
