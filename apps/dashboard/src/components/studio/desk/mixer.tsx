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
  Globe,
} from '@phosphor-icons/react'
import { type EngineAudio, type EngineLevel, type EngineMonitor } from '@ferrocast/api'
import { Button, Dialog, IconButton, InfoTip, Input, Segmented, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction, useResource } from '../../../lib/hooks'
import { KindTile, useDesk, type EngineApi } from './common'
import { DockHeader } from './layout'
import { filterItems, useContextMenu, type MenuItem } from './menu'
import { AdvancedAudio } from './advanced-audio'

/** The fader is cubic like OBS's: halfway is about -18 dB, the top is 0 dB. */
export const toDb = (pos: number): number =>
  pos <= 0 ? -100 : Math.max(-100, 60 * Math.log10(pos))
export const toPos = (db: number): number => (db <= -100 ? 0 : Math.min(1, 10 ** (db / 60)))
/** Where a level sits on the meter: -60 dB at one end, 0 at the other. */
export const meterPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
const SCALE = [-60, -50, -40, -30, -20, -10, 0]
/** OBS's zones: green to -20 dB, yellow to -9, red above. */
const ZONES =
  'linear-gradient(var(--dir),var(--fc-ok) 0 66.6%,var(--fc-warn) 66.6% 85%,var(--fc-danger) 85% 100%)'

/** Live levels for these sounds, read about ten times a second while shown. */
export function useLevels(api: EngineApi, names: string[]): Record<string, EngineLevel> {
  const [levels, setLevels] = useState<Record<string, EngineLevel>>({})
  const key = names.join('\n')
  useEffect(() => {
    if (!key) return
    let alive = true
    let timer = 0
    const list = key.split('\n')
    const tick = async () => {
      try {
        const v = await api.levels(list)
        if (alive) setLevels(v)
      } catch {
        // Stopped or busy: the next tick tries again.
      }
      if (alive) timer = window.setTimeout(() => void tick(), 100)
    }
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [api, key])
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

/** The peaks shown, falling at `rate` (OBS's decay; fast is close to raw). */
function useDecayed(peaks: number[], rate: number): number[] {
  const s = useRef<{ v: number[]; at: number }>({ v: [-100, -100], at: Date.now() })
  const now = Date.now()
  const dt = now - s.current.at
  s.current = { v: peaks.map((p, i) => decayed(s.current.v[i] ?? -100, p, rate, dt)), at: now }
  return s.current.v
}

/** The highest recent peak per side (held 1.5 s, then falling), and a clip light that stays
 * on 2 s after a peak at 0 dB. */
function useHold(level: EngineLevel | undefined): { hold: number[]; clip: boolean } {
  const h = useRef<{ v: number[]; at: number[]; clip: number }>({
    v: [-100, -100],
    at: [0, 0],
    clip: 0,
  })
  const now = Date.now()
  const peaks = level?.peak ?? [-100, -100]
  peaks.forEach((p, i) => {
    const s = h.current
    const held = s.v[i] ?? -100
    if (p >= held) {
      s.v[i] = p
      s.at[i] = now
    } else if (now - (s.at[i] ?? 0) > 1500) {
      s.v[i] = Math.max(p, held - 2)
    }
    if (p >= -0.5) s.clip = now
  })
  return { hold: [...h.current.v], clip: now - h.current.clip < 2000 }
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
  level: EngineLevel | undefined
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
  const peaks = useDecayed(level?.peak ?? [-100, -100], decay)
  const { hold, clip } = useHold(level)
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
  const bars = peaks.map((p, i) => {
    const pct = meterPct(p)
    const held = meterPct(hold[i] ?? -100)
    return (
      <div
        key={i}
        className={cx(
          'relative overflow-hidden rounded-full',
          vertical ? 'h-full w-[7px]' : tall ? 'h-[8px]' : 'h-[6px]',
        )}
        style={{ ['--dir' as string]: vertical ? '0deg' : '90deg' }}
      >
        <div aria-hidden className="absolute inset-0 opacity-20" style={{ background: ZONES }} />
        <div
          aria-hidden
          className={cx(
            'absolute inset-0 transition-[clip-path] duration-75 motion-reduce:transition-none',
            muted && 'opacity-40 grayscale',
          )}
          style={{
            background: ZONES,
            clipPath: vertical ? `inset(${100 - pct}% 0 0 0)` : `inset(0 ${100 - pct}% 0 0)`,
          }}
        />
        {held > 0 && (
          <div
            aria-hidden
            className={cx('absolute bg-text', vertical ? 'inset-x-0 h-[2px]' : 'inset-y-0 w-[2px]')}
            style={vertical ? { bottom: `${held}%` } : { left: `calc(${held}% - 2px)` }}
          />
        )}
      </div>
    )
  })
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
  const light = (
    <span
      aria-hidden
      title={clip ? 'Too loud: it clipped' : undefined}
      className={cx(
        'size-2 shrink-0 rounded-full transition-colors',
        clip ? 'bg-danger-fill shadow-[0_0_6px_var(--fc-danger)]' : 'bg-surface-3',
      )}
    />
  )
  if (vertical)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5">
        {light}
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
        {light}
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
function loadPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
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
function usePrefs(): [Prefs, (f: (p: Prefs) => Prefs) => void] {
  const [p, setP] = useState(loadPrefs)
  const set = (f: (p: Prefs) => Prefs) =>
    setP((old) => {
      const n = f(old)
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(n))
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
  level: EngineLevel | undefined
  locked: boolean
  onAudio: (patch: AudioPatch) => void
  onMenu: (e: React.MouseEvent) => void
  decay: number
}

function MuteButton({ a, onAudio }: Pick<ChannelProps, 'a' | 'onAudio'>) {
  return (
    <IconButton
      size="sm"
      variant="ghost"
      label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
      aria-pressed={a.muted}
      className={cx(a.muted ? 'bg-danger-soft text-danger hover:bg-danger-soft' : 'text-text')}
      onClick={() => onAudio({ muted: !a.muted })}
    >
      {a.muted ? <SpeakerSlash size={16} weight="bold" /> : <SpeakerHigh size={16} weight="bold" />}
    </IconButton>
  )
}

function HearButton({ a, onAudio }: Pick<ChannelProps, 'a' | 'onAudio'>) {
  const hearing = a.monitor !== 'off'
  return (
    <IconButton
      size="sm"
      variant="ghost"
      label={hearing ? `Stop hearing ${a.name}` : `Hear ${a.name} in your headphones`}
      aria-pressed={hearing}
      className={cx(hearing ? 'fc-picked hover:bg-[var(--fc-pick-hover)]' : 'text-text-3')}
      onClick={() => onAudio({ monitor: hearing ? 'off' : 'me_and_stream' })}
    >
      <Headphones size={16} weight={hearing ? 'fill' : 'bold'} />
    </IconButton>
  )
}

const dbText = (a: EngineAudio) =>
  a.muted ? 'Muted' : a.volume_db <= -100 ? 'Silent' : `${a.volume_db.toFixed(1)} dB`

function Row({ a, level, locked, onAudio, onMenu, decay }: ChannelProps) {
  return (
    <div
      onContextMenu={onMenu}
      className={cx(
        'group/row rounded-[12px] border border-transparent px-2 pt-2 pb-1 transition-colors hover:border-line hover:bg-surface-2',
        a.muted && 'bg-danger-soft/40',
      )}
    >
      <div className="flex items-center gap-2 text-[14.5px]">
        <KindTile kind={a.kind} size={26} dim={a.muted} />
        <span
          className={cx('min-w-0 flex-1 truncate font-bold', a.muted ? 'text-text-3' : 'text-text')}
        >
          {a.name}
        </span>
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
            'flex shrink-0 items-baseline justify-end gap-1 text-right font-mono text-[13.5px] font-bold tabular-nums',
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
      <div className="mt-1 flex items-start gap-0.5">
        <MuteButton a={a} onAudio={onAudio} />
        <div className="min-w-0 flex-1 pt-1">
          <Meter
            level={level}
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
          size="sm"
          variant="ghost"
          label={`More for ${a.name}`}
          onClick={onMenu}
          // Narrow (owner's pick N1): there on hover or focus; right-click opens it too.
          className="fc-quiet"
        >
          <DotsThree size={16} weight="bold" />
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
function Strip({ a, level, locked, onAudio, onMenu, decay }: ChannelProps) {
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
        level={level}
        muted={a.muted}
        volumeDb={a.volume_db}
        label={`${a.name} volume`}
        locked={locked}
        decay={decay}
        onVolume={(volume_db) => onAudio({ volume_db: Math.round(volume_db * 10) / 10 })}
      />
      <div className="flex h-8 items-center">
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

export function AudioDock() {
  const desk = useDesk()
  const { api, audio, pictureScenes, setAdding, openSettings, edit, refresh } = desk
  const { run } = useAction()
  const [all, setAll] = useState(false)
  const [prefs, setPrefs] = usePrefs()
  const [naming, setNaming] = useState<{ from: string; value: string } | null>(null)
  // Advanced audio: open on one sound's name, or '' for all.
  const [advanced, setAdvanced] = useState<string | null>(null)
  const { open, menu } = useContextMenu()
  const names = pictureScenes.map((x) => x.name).join('\n')
  // Every scene's sounds, each once: the global devices first, then in scene order.
  const every = useResource(async () => {
    if (!all || !names) return null
    const lists = await Promise.all(names.split('\n').map((n) => api.audio(n)))
    const seen = new Set<string>()
    return lists.flat().filter((a) => !seen.has(a.name) && seen.add(a.name))
  }, [api, all, names, audio.data])
  const list = all ? every.data : audio.data
  const shown = list?.filter(
    (a) => !prefs.hidden.includes(a.name) && (!prefs.activeOnly || a.active !== false),
  )
  const hiddenHere = (list?.length ?? 0) - (shown?.length ?? 0)
  const levels = useLevels(api, shown?.map((a) => a.name) ?? [])

  const setAudio = (name: string, patch: AudioPatch) => {
    // Shown at once; the engine follows.
    audio.set((l) => (l ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    every.set((l) => (l ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    void run(`audio:${name}`, () => api.setAudio(name, patch), { quiet: false })
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
    ]
  }
  const props = (a: EngineAudio): ChannelProps => ({
    a,
    level: levels[a.name],
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
          'min-h-0 flex-1 p-1.5',
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
          <Skeleton className="h-28" />
        ) : shown.length === 0 ? (
          <p className="m-0 p-2.5 text-[14.5px] font-medium text-text-2">
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
          <div className="@container flex flex-col gap-1">
            {shown.map((a) => (
              <Row key={a.name} {...props(a)} />
            ))}
          </div>
        )}
      </div>
      <footer className="flex h-10 flex-none items-center gap-0.5 border-t border-line px-1.5">
        <Button size="sm" variant="ghost" onClick={() => setAdding('mic')}>
          <Plus size={14} weight="bold" /> Add sound
        </Button>
        {hiddenHere > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setPrefs((p) => ({ ...p, hidden: [] }))}>
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
    </section>
  )
}
