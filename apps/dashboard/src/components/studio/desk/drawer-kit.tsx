// The source drawer's parts (owner's pick, design A, 10 Nov: Projects/ferrocast/design/
// source-drawer/types.html): grey section bands with a coloured icon, one 36 px line per
// setting (its name left, its control right), small segmented choices, number boxes, and the
// Position tab and the sound rows built from them.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  ArrowCounterClockwise,
  ArrowsInSimple,
  ArrowsOut,
  ArrowsOutCardinal,
  BoundingBox,
  Crop,
  FlipHorizontal,
  FlipVertical,
  LinkSimple,
  LinkSimpleBreak,
  SpeakerHigh,
  SpeakerSlash,
  type Icon as PhIcon,
} from '@phosphor-icons/react'
import {
  ENGINE_BOUNDS,
  type EngineAudio,
  type EngineAudioChange,
  type EngineItem,
  type EngineTransform,
} from '@ferrocast/api'
import { Button, IconButton, InfoTip, Select, Skeleton, Switch, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'
import { BOUNDS_LABEL, scaleFor, shownSize } from './transform'

/** A section's heading: a grey band with its coloured icon, as the Studio's panels. */
export function Band({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: ReactNode
  icon: PhIcon
  tone: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-[30px] flex-none items-center gap-2 border-b border-line bg-dock-head pr-2 pl-3 text-[11px] font-bold tracking-[0.07em] text-text-2 uppercase">
      <Icon size={13} weight="bold" aria-hidden style={{ color: tone }} />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {children && (
        <span className="flex items-center gap-1.5 tracking-normal normal-case">{children}</span>
      )}
    </div>
  )
}

/** One setting: exactly one 36 px line, its name on the left (ending in "…" if long, whole in
 *  its tooltip), its control on the right; a hint goes in an (i). */
export function Prop({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode | ((id: string) => ReactNode)
}) {
  const id = useId()
  return (
    <div className="grid h-9 grid-cols-[7.75rem_minmax(0,1fr)] items-center gap-x-2.5 border-b border-line pr-2.5 pl-3">
      <span className="flex min-w-0 items-center gap-1">
        <label
          htmlFor={id}
          title={label}
          className="min-w-0 truncate text-[12.5px] font-semibold whitespace-nowrap text-text-2"
        >
          {label}
        </label>
        {hint && <InfoTip label={`About ${label.toLowerCase()}`}>{hint}</InfoTip>}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {typeof children === 'function' ? children(id) : children}
      </div>
    </div>
  )
}

/** What isn't one line (a preview, a picker, a list): its own padded block across. */
export function Pad({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('border-b border-line px-3 py-2.5', className)}>{children}</div>
}

/** A small segmented choice that fills its line. */
export function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T | null
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-7 w-full min-w-0 gap-0.5 rounded-[6px] border border-line bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-[4px] px-1.5 text-[12px] font-semibold whitespace-nowrap outline-none transition-colors focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50',
              on ? 'fc-picked' : 'text-text-2 hover:bg-surface-3 hover:text-text',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A number box with a small letter before it and its unit after; a half-typed number waits
 *  until it's whole, and it's sent as it changes (or on leaving, with `commit`). */
export function NumBox({
  id,
  label,
  letter,
  value,
  unit,
  onChange,
  disabled,
  min,
  max,
  step = 1,
  onLeave = false,
}: {
  id?: string
  label: string
  letter?: string
  value: number
  unit?: string
  onChange: (n: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  /** Sent only when leaving the box or pressing Enter. */
  onLeave?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = Math.round(value / step) * step
  const parse = (s: string) => {
    const n = Number(s)
    if (s.trim() === '' || !Number.isFinite(n)) return null
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  }
  const commit = () => {
    if (text !== null) {
      const n = parse(text)
      if (n !== null && onLeave) onChange(n)
    }
    setText(null)
  }
  return (
    <span
      className={cx(
        'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[5px] border border-line bg-inset px-2 focus-within:border-accent-line focus-within:shadow-[0_0_0_3px_var(--fc-accent-soft)]',
        disabled && 'opacity-50',
      )}
    >
      {letter && (
        <span aria-hidden className="text-[11px] font-bold text-text-3">
          {letter}
        </span>
      )}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        value={text ?? String(Number(shown.toFixed(2)))}
        onChange={(e) => {
          setText(e.target.value)
          const n = parse(e.target.value)
          if (n !== null && !onLeave) onChange(n)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          // Escape drops a half-typed number; with nothing typed it closes the drawer.
          if (e.key === 'Escape' && text !== null) {
            e.preventDefault()
            setText(null)
          }
        }}
        className="h-full w-full min-w-0 bg-transparent font-mono text-[12px] text-text tabular-nums outline-none"
      />
      {unit && (
        <span aria-hidden className="shrink-0 font-mono text-[11px] text-text-3">
          {unit}
        </span>
      )}
    </span>
  )
}

/** OBS's alignment bits for the nine points, top row first. */
const POINTS = [
  { bits: 5, label: 'Top left', col: 0, row: 0 },
  { bits: 4, label: 'Top', col: 1, row: 0 },
  { bits: 6, label: 'Top right', col: 2, row: 0 },
  { bits: 1, label: 'Left', col: 0, row: 1 },
  { bits: 0, label: 'Middle', col: 1, row: 1 },
  { bits: 2, label: 'Right', col: 2, row: 1 },
  { bits: 9, label: 'Bottom left', col: 0, row: 2 },
  { bits: 8, label: 'Bottom', col: 1, row: 2 },
  { bits: 10, label: 'Bottom right', col: 2, row: 2 },
] as const

/** Where a point of the canvas is (0, the middle or the edge), for its column or row. */
const at = (n: 0 | 1 | 2, size: number) => (n === 0 ? 0 : n === 1 ? size / 2 : size)

/** The nine points as a small pad that sits in a 36px row (owner's pick A, 11 Nov), the one
 *  picked named beside it. One tab stop; the arrow keys move between the points. */
export function MiniPad({
  label,
  value,
  disabled,
  onPick,
}: {
  label: string
  /** The point's bits, or null when it's at none of them. */
  value: number | null
  disabled?: boolean
  onPick: (bits: number) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const now = POINTS.findIndex((p) => p.bits === value)
  const move = (from: number, key: string) => {
    const col = from % 3
    const to =
      key === 'ArrowRight'
        ? col < 2
          ? from + 1
          : from
        : key === 'ArrowLeft'
          ? col > 0
            ? from - 1
            : from
          : key === 'ArrowDown'
            ? Math.min(from + 3, 8)
            : key === 'ArrowUp'
              ? Math.max(from - 3, 0)
              : -1
    if (to < 0) return false
    const p = POINTS[to]
    if (p) onPick(p.bits)
    refs.current[to]?.focus()
    return true
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        role="radiogroup"
        aria-label={label}
        className="grid shrink-0 grid-cols-3 gap-[2px] rounded-[5px] border border-line bg-surface-2 p-[3px]"
      >
        {POINTS.map((p, i) => {
          const on = i === now
          return (
            <button
              key={p.bits}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.label}
              title={p.label}
              disabled={disabled}
              tabIndex={on || (now < 0 && i === 0) ? 0 : -1}
              onClick={() => onPick(p.bits)}
              onKeyDown={(e) => {
                if (move(i, e.key)) e.preventDefault()
              }}
              className={cx(
                'size-2 rounded-[2px] outline-none transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)] disabled:opacity-40',
                on ? 'bg-arc' : 'bg-line-strong hover:bg-text-3',
              )}
            />
          )
        })}
      </span>
      <span className="truncate text-[12.5px] text-text-2">
        {now >= 0 ? POINTS[now]?.label : 'Free'}
      </span>
    </span>
  )
}

/**
 * The Position tab (design A, #7): where it is and its size, a snap to the nine points of the
 * picture with Fit and Stretch, turn, flip, and crop. Changes show in the picture at once.
 */
export function PositionTab({ scene, item }: { scene: string; item: EngineItem }) {
  // The edited picture's size (the vertical one's while it's picked): where the snap points are.
  const { api, items, refresh, size: picture } = useDesk()
  const { run, busy } = useAction()
  const loaded = useResource(() => api.transform(scene, item.id), [api, scene, item.id])
  const [t, setT] = useState<EngineTransform | null>(null)
  const [keep, setKeep] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (loaded.data) setT(loaded.data)
  }, [loaded.data])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      pending.current?.()
    },
    [],
  )
  if (loaded.error && !loaded.data)
    return (
      <Pad>
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      </Pad>
    )
  if (!t) return <Skeleton className="m-3 h-40" />
  const off = item.locked
  // The newest change, a moment after typing stops; the picture follows.
  const push = (next: EngineTransform) => {
    setT(next)
    if (timer.current) clearTimeout(timer.current)
    const go = () => {
      pending.current = null
      void run('transform', () => api.setTransform(scene, item.id, next)).then((moved) => {
        if (moved)
          items.set((prev) =>
            (prev ?? []).map((i) =>
              i.id === moved.id && moved.frame ? { ...i, frame: moved.frame } : i,
            ),
          )
      })
    }
    pending.current = go
    timer.current = setTimeout(go, 150)
  }
  const set = (patch: Partial<EngineTransform>) => push({ ...t, ...patch })
  const boxed = t.bounds !== 'none'
  const size = boxed ? { w: t.bounds_width, h: t.bounds_height } : shownSize(t)
  const ratio = size.h > 0 ? size.w / size.h : 1
  const resize = (w: number, h: number) => {
    if (boxed) return set({ bounds_width: w, bounds_height: h })
    const s = scaleFor(t, w, h)
    if (s) set({ scale_x: s.x, scale_y: s.y })
  }
  // An action of the item's own (fit, stretch, reset), then its numbers read again, and the
  // scene's items, so its outline on the canvas follows.
  const act = (what: 'fit' | 'stretch' | 'reset') =>
    void run(what, () => done(api.editItem(scene, item.id, what))).then((ok) => {
      if (!ok) return
      loaded.reload()
      refresh()
    })
  const cw = picture?.width ?? 1920
  const ch = picture?.height ?? 1080
  const turn = (((Math.round(t.rotation) % 360) + 360) % 360) as number
  return (
    <div className="flex flex-col">
      <Band icon={ArrowsOutCardinal} tone="var(--fc-accent-text)" title="Place">
        <Button
          size="xs"
          variant="ghost"
          className="h-[22px]! px-2! text-[11.5px]!"
          disabled={off || busy !== null}
          onClick={() => act('reset')}
        >
          <ArrowCounterClockwise size={12} weight="bold" /> Reset
        </Button>
      </Band>
      <Prop label="Where">
        <NumBox
          label="X"
          letter="X"
          unit="px"
          value={t.x}
          disabled={off}
          onChange={(x) => set({ x })}
        />
        <NumBox
          label="Y"
          letter="Y"
          unit="px"
          value={t.y}
          disabled={off}
          onChange={(y) => set({ y })}
        />
      </Prop>
      <Prop
        label={boxed ? 'Box size' : 'Size'}
        hint={boxed ? 'It sits in a box this big.' : undefined}
      >
        <NumBox
          label="Width"
          letter="W"
          value={size.w}
          min={1}
          disabled={off}
          onChange={(w) => resize(w, keep ? w / ratio : size.h)}
        />
        <IconButton
          size="xs"
          variant="ghost"
          label={keep ? 'Keep its shape: on' : 'Keep its shape: off'}
          aria-pressed={keep}
          className={cx(keep && 'bg-accent-soft text-accent-text')}
          onClick={() => setKeep(!keep)}
        >
          {keep ? <LinkSimple size={14} weight="bold" /> : <LinkSimpleBreak size={14} />}
        </IconButton>
        <NumBox
          label="Height"
          letter="H"
          value={size.h}
          min={1}
          disabled={off}
          onChange={(h) => resize(keep ? h * ratio : size.w, h)}
        />
      </Prop>
      <Prop label="Snap to" hint="Puts it at a corner, an edge or the middle of the picture.">
        <MiniPad
          label="Snap to"
          disabled={off}
          value={
            POINTS.find(
              (p) =>
                p.bits === t.alignment &&
                Math.abs(t.x - at(p.col, cw)) < 0.5 &&
                Math.abs(t.y - at(p.row, ch)) < 0.5,
            )?.bits ?? null
          }
          onPick={(bits) => {
            const p = POINTS.find((x) => x.bits === bits)
            if (p) set({ alignment: p.bits, x: at(p.col, cw), y: at(p.row, ch) })
          }}
        />
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />
          <IconButton
            size="xs"
            variant="ghost"
            label="Fit the picture"
            disabled={off}
            onClick={() => act('fit')}
          >
            <ArrowsInSimple size={14} weight="bold" />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            label="Fill the picture"
            disabled={off}
            onClick={() => act('stretch')}
          >
            <ArrowsOut size={14} weight="bold" />
          </IconButton>
        </span>
      </Prop>
      <Prop label="Turn">
        <Seg
          label="Turn"
          value={[0, 90, 180, 270].includes(turn) ? turn : null}
          disabled={off}
          options={[0, 90, 180, 270].map((d) => ({ value: d, label: `${d}°` }))}
          onChange={(rotation) => set({ rotation })}
        />
      </Prop>
      <Prop label="Flip">
        <div className="flex h-7 w-full gap-0.5 rounded-[6px] border border-line bg-surface-2 p-0.5">
          {(
            [
              { key: 'scale_x', label: 'Across', icon: FlipHorizontal },
              { key: 'scale_y', label: 'Upside down', icon: FlipVertical },
            ] as const
          ).map(({ key, label, icon: I }) => {
            const on = t[key] < 0
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={off}
                onClick={() => set({ [key]: -t[key] })}
                className={cx(
                  'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[4px] text-[12px] font-semibold outline-none focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50',
                  on ? 'fc-picked' : 'text-text-2 hover:bg-surface-3 hover:text-text',
                )}
              >
                <I size={13} weight="bold" aria-hidden /> {label}
              </button>
            )
          })}
        </div>
      </Prop>
      <Band icon={BoundingBox} tone="var(--fc-twitch)" title="Box" />
      <Prop label="Kind" hint="Keeps it inside a box of its own size: fitted, filled or stretched.">
        {(id) => (
          <Select
            id={id}
            disabled={off}
            value={t.bounds}
            className="h-7! rounded-[5px]! py-0! pl-2! text-[12.5px]!"
            onChange={(e) => {
              const bounds = e.target.value as EngineTransform['bounds']
              // A box starts at the size it shows now.
              set(
                t.bounds === 'none' && bounds !== 'none'
                  ? { bounds, bounds_width: size.w, bounds_height: size.h }
                  : { bounds },
              )
            }}
          >
            {ENGINE_BOUNDS.map((b) => (
              <option key={b} value={b}>
                {BOUNDS_LABEL[b]}
              </option>
            ))}
          </Select>
        )}
      </Prop>
      {boxed && (
        <Prop label="Inside the box" hint="Where it sits when it's smaller than its box.">
          <MiniPad
            label="Inside the box"
            disabled={off}
            value={t.bounds_alignment}
            onPick={(bounds_alignment) => set({ bounds_alignment })}
          />
        </Prop>
      )}
      <Band icon={Crop} tone="var(--fc-warn)" title="Crop" />
      <Prop label="Edges" hint="Cuts this much off each side of it, in the source's own pixels.">
        {(
          [
            ['crop_left', 'L', 'Crop left'],
            ['crop_top', 'T', 'Crop top'],
            ['crop_right', 'R', 'Crop right'],
            ['crop_bottom', 'B', 'Crop bottom'],
          ] as const
        ).map(([key, letter, label]) => (
          <NumBox
            key={key}
            label={label}
            letter={letter}
            value={t[key]}
            min={0}
            disabled={off}
            onChange={(n) => set({ [key]: Math.round(n) })}
          />
        ))}
      </Prop>
      {off && (
        <p className="m-0 px-3 py-2.5 text-[12px] text-text-3">
          It's locked: unlock it in Sources to move it.
        </p>
      )}
    </div>
  )
}

/** The sound rows (design A, #6): volume and mute, hear it, delay, balance, mono. */
export function SoundRows({
  a,
  onAudio,
}: {
  a: EngineAudio
  onAudio: (patch: EngineAudioChange) => void
}) {
  const balance = a.balance ?? 0.5
  return (
    <>
      <Prop label={a.muted ? 'Muted' : 'Volume'}>
        <span
          className={cx(
            'ml-auto font-mono text-[12px] tabular-nums',
            a.muted ? 'text-danger' : 'text-text',
          )}
        >
          {a.muted ? 'muted' : `${a.volume_db.toFixed(1)} dB`}
        </span>
        <IconButton
          size="xs"
          variant="ghost"
          label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
          aria-pressed={a.muted}
          className={cx(a.muted && 'bg-danger-soft text-danger')}
          onClick={() => onAudio({ muted: !a.muted })}
        >
          {a.muted ? <SpeakerSlash size={14} weight="bold" /> : <SpeakerHigh size={14} />}
        </IconButton>
      </Prop>
      <Prop
        label="Hear it"
        hint="Off: only the stream hears it. Only me: your headphones, not the stream or the recording. Me + stream: both."
      >
        <Seg
          label="Hear it"
          value={a.monitor}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'only_me', label: 'Only me' },
            { value: 'me_and_stream', label: 'Me + stream' },
          ]}
          onChange={(monitor) => onAudio({ monitor })}
        />
      </Prop>
      <Prop
        label="Delay"
        hint="Holds the sound back to match a camera that runs late (minus: earlier)."
      >
        {(id) => (
          <span className="flex w-28">
            <NumBox
              id={id}
              label="Delay"
              value={a.sync_ms ?? 0}
              unit="ms"
              min={-950}
              max={20000}
              onLeave
              onChange={(sync_ms) => onAudio({ sync_ms: Math.round(sync_ms) })}
            />
          </span>
        )}
      </Prop>
      <Prop label="Balance">
        {(id) => (
          <>
            <span aria-hidden className="font-mono text-[11px] text-text-3">
              L
            </span>
            <input
              id={id}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={balance}
              aria-valuetext={
                balance === 0.5
                  ? 'Middle'
                  : `${Math.round(Math.abs(balance - 0.5) * 200)}% ${balance < 0.5 ? 'left' : 'right'}`
              }
              onChange={(e) => onAudio({ balance: Number(e.target.value) })}
              onDoubleClick={() => onAudio({ balance: 0.5 })}
              className="fc-slim min-w-0 flex-1"
              style={{
                ['--from' as string]: `${Math.min(50, balance * 100)}%`,
                ['--fill' as string]: `${Math.max(50, balance * 100)}%`,
              }}
            />
            <span aria-hidden className="font-mono text-[11px] text-text-3">
              R
            </span>
          </>
        )}
      </Prop>
      <Prop label="Mono" hint="Both speakers get the same sound.">
        {(id) => (
          <span className="ml-auto">
            <Switch
              id={id}
              label="Mono"
              hideLabel
              checked={!!a.mono}
              onChange={(mono) => onAudio({ mono })}
            />
          </span>
        )}
      </Prop>
    </>
  )
}
