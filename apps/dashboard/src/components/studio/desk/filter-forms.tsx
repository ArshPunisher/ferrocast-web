/**
 * Simpler forms for the settings people change most (owner's picks, 9 Nov): the Mac's screen
 * capture as three plain buttons, crop as a box dragged on the source's own picture, and the
 * common filters with their two or three main sliders first and the rest under "More".
 * Everything OBS has stays reachable; only the order and the words change.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  AppWindow,
  ArrowCounterClockwise,
  Eyedropper,
  Monitor,
  SquaresFour,
  Warning,
} from '@phosphor-icons/react'
import { type EngineOption, type EngineSettings } from '@ferrocast/api'
import { Button, Input, cx } from '@ferrocast/ui'
import { useDesk } from './common'
import { meterPct, useLevels } from './mixer'
import { OptionsForm, fromHex, shownNumber, toHex, valueOf } from './options'

type Change = (key: string, value: unknown) => void

interface FormIn {
  opts: EngineOption[]
  values: EngineSettings
  onChange: Change
}

/** An option with friendlier words (its key and value unchanged). */
type Words = { key: string; label: string; help?: string }

function worded(opts: EngineOption[], words: Words[]): EngineOption[] {
  return words.flatMap((w) => {
    const o = opts.find((x) => x.key === w.key)
    return o ? [{ ...o, label: w.label, help: w.help ?? o.help }] : []
  })
}

/** The main options, then the rest when `more` (the filter's "More" button in its header). */
function MainAndMore({
  opts,
  values,
  onChange,
  main,
  rename = [],
  more,
}: FormIn & { main: Words[]; rename?: Words[]; more: boolean }) {
  const first = worded(opts, main)
  const mainKeys = new Set(main.map((w) => w.key))
  const rest = opts
    .filter((o) => !mainKeys.has(o.key))
    .map((o) => {
      const w = rename.find((r) => r.key === o.key)
      return w ? { ...o, label: w.label, help: w.help ?? o.help } : o
    })
  return (
    <div className="flex flex-col gap-2">
      {first.length > 0 && (
        <OptionsForm compact opts={first} all={opts} values={values} onChange={onChange} />
      )}
      {more && rest.some((o) => o.visible) && (
        <div className="border-t border-line pt-2">
          <OptionsForm compact opts={rest} all={opts} values={values} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/** A line of the compact panel built by hand: its label, then its control (as OptionsForm's). */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2.5">
      <span
        title={label}
        className="truncate text-[13px] font-semibold whitespace-nowrap text-text-2"
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] leading-snug text-text-3">{title}</span>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ screen capture (Mac)

const METHODS = [
  {
    value: 0,
    label: 'Whole screen',
    icon: Monitor,
    help: 'Everything on one screen.',
  },
  {
    value: 1,
    label: 'One window',
    icon: AppWindow,
    help: 'Just this window, even behind others or on another screen. Its sound comes too.',
  },
  {
    value: 2,
    label: 'One app',
    icon: SquaresFour,
    help: 'Every window of one app on a screen. New windows of it show up by themselves.',
  },
] as const

/** macOS Screen Capture: what to show as three buttons, then only the picker it needs. */
export function CaptureForm({ opts, values, onChange }: FormIn) {
  const type = opts.find((o) => o.key === 'type')
  const now = type ? valueOf(type, values) : 0
  const method = METHODS.find((m) => m.value === now) ?? METHODS[0]
  const rest = worded(opts, [
    { key: 'display', label: 'Screen' },
    { key: 'window', label: 'Window' },
    { key: 'application', label: 'App' },
    { key: 'show_cursor', label: 'Show the mouse arrow', help: 'In your stream and recordings' },
  ]).concat(
    // Anything else this form gains later still shows.
    opts.filter(
      (o) => !['type', 'display', 'window', 'application', 'show_cursor'].includes(o.key),
    ),
  )
  const heading = useId()
  return (
    <div className="flex flex-col gap-2.5">
      {type && (
        <div className="flex flex-col gap-1.5">
          <span id={heading} className="text-[14px] font-bold text-text-2">
            What to show
          </span>
          <div
            role="radiogroup"
            aria-labelledby={heading}
            className="grid grid-cols-3 gap-1 rounded-control border border-line bg-inset p-1"
          >
            {METHODS.map((m) => {
              const on = m.value === method.value
              const Icon = m.icon
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange('type', m.value)}
                  className={cx(
                    'flex min-w-0 flex-col items-center gap-1 rounded-[8px] px-1 py-2 text-[13.5px] font-semibold outline-none transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)]',
                    on
                      ? 'fc-picked font-bold shadow-[var(--fc-shadow-1)]'
                      : 'text-text-2 hover:bg-surface-3 hover:text-text',
                  )}
                >
                  <Icon size={20} weight={on ? 'fill' : 'regular'} aria-hidden />
                  <span className="truncate">{m.label}</span>
                </button>
              )
            })}
          </div>
          <p className="m-0 text-[13px] text-text-3">{method.help}</p>
        </div>
      )}
      <OptionsForm compact opts={rest} all={opts} values={values} onChange={onChange} />
    </div>
  )
}

// ------------------------------------------------------------------ crop

type Edge = 'l' | 't' | 'r' | 'b'
type Edges = Record<Edge, number>

/** The crop's four edges in the source's pixels, whichever way it was saved (OBS's absolute
 *  crop keeps a box: left and top, then a width and height). */
export function edgesOf(v: EngineSettings, size: { w: number; h: number }): Edges {
  const n = (k: string) => (typeof v[k] === 'number' ? Math.max(0, Math.round(v[k])) : 0)
  if (v.relative === false) {
    const cx = n('cx')
    const cy = n('cy')
    return {
      l: n('left'),
      t: n('top'),
      r: cx > 0 ? Math.max(0, size.w - n('left') - cx) : 0,
      b: cy > 0 ? Math.max(0, size.h - n('top') - cy) : 0,
    }
  }
  return { l: n('left'), t: n('top'), r: n('right'), b: n('bottom') }
}

/** At least this much of the picture is kept. */
const KEEP = 16

/** Edges kept inside the picture, leaving at least KEEP pixels each way. */
export function clampEdges(e: Edges, size: { w: number; h: number }): Edges {
  const fit = (a: number, b: number, total: number) => {
    const room = Math.max(0, total - KEEP)
    const x = Math.min(Math.max(0, Math.round(a)), room)
    return [x, Math.min(Math.max(0, Math.round(b)), room - x)] as const
  }
  const [l, r] = fit(e.l, e.r, size.w)
  const [t, b] = fit(e.t, e.b, size.h)
  return { l, t, r, b }
}

/** The source's own picture (before its filters), read again every few seconds while shown. */
function useSourcePicture(source: string) {
  const { api } = useDesk()
  const [pic, setPic] = useState<{ image: string; w: number; h: number } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    // No source (a picker not open yet): nothing to read.
    if (!source) return
    let alive = true
    let timer = 0
    const read = async () => {
      try {
        const got = await api.sourcePicture(source, 480)
        if (!alive) return
        if (got.image && got.width && got.height) {
          setPic({ image: got.image, w: got.width, h: got.height })
          setFailed(false)
        } else setFailed(true)
      } catch {
        if (alive) setFailed(true)
      }
      if (alive && !document.hidden) timer = window.setTimeout(() => void read(), 2500)
    }
    void read()
    const back = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        void read()
      }
    }
    document.addEventListener('visibilitychange', back)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', back)
    }
  }, [api, source])
  return { pic, failed }
}

/** The colour at `x`, `y` (0 to 1 across the picture) as #rrggbb: a 3 × 3 pixel average, so
 *  one odd pixel of noise doesn't decide it. */
export function colourAt(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): string {
  const cx = Math.min(w - 1, Math.max(0, Math.floor(x * w)))
  const cy = Math.min(h - 1, Math.max(0, Math.floor(y * h)))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const sx = cx + dx
      const sy = cy + dy
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
      const i = (sy * w + sx) * 4
      r += px[i] ?? 0
      g += px[i + 1] ?? 0
      b += px[i + 2] ?? 0
      n++
    }
  const hex = (s: number) =>
    Math.round(s / Math.max(1, n))
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/** "Pick from the picture": the source's own picture, and a click on it takes that colour. */
function PickFromPicture({
  source,
  onPick,
  onClose,
}: {
  source: string
  onPick: (hex: string) => void
  onClose: () => void
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const { pic, failed } = useSourcePicture(source)
  const pixels = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; hex: string } | null>(null)
  // The picture's pixels, read once each time a new picture comes.
  useEffect(() => {
    if (!pic) return
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      pixels.current = {
        data: ctx.getImageData(0, 0, c.width, c.height).data,
        w: c.width,
        h: c.height,
      }
    }
    img.src = pic.image
    return () => {
      alive = false
    }
  }, [pic])
  useEffect(() => {
    // Escape closes the picker only, not the panel round it: taken first (capture) and marked
    // as used, which the panel's own Escape checks.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      closeRef.current()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [])
  const at = (e: React.MouseEvent<HTMLElement>) => {
    const p = pixels.current
    if (!p) return null
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    return { x, y, hex: colourAt(p.data, p.w, p.h, x, y) }
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-1 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-text-2">Click the colour to remove</span>
        <Button size="sm" variant="ghost" onClick={() => onClose()}>
          Cancel
        </Button>
      </div>
      {pic ? (
        <div
          className="relative w-full cursor-crosshair touch-none select-none"
          style={{ aspectRatio: `${pic.w} / ${pic.h}` }}
          onPointerMove={(e) => setHover(at(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const got = at(e)
            if (!got) return
            onPick(got.hex)
            onClose()
          }}
        >
          <img
            src={pic.image}
            alt="Your source's picture: click a colour on it"
            width={pic.w}
            height={pic.h}
            draggable={false}
            className="absolute inset-0 size-full rounded-[8px] object-fill"
          />
          {hover && (
            <span
              aria-hidden
              className="pointer-events-none absolute flex -translate-x-1/2 items-center gap-1.5 rounded-[8px] bg-black/80 px-2 py-1 font-mono text-[12px] text-white"
              style={{
                left: `${Math.min(85, Math.max(15, hover.x * 100))}%`,
                top: `calc(${hover.y * 100}% ${hover.y > 0.5 ? '- 2.25rem' : '+ 1rem'})`,
              }}
            >
              <span
                className="size-4 rounded-[4px] border border-white/60"
                style={{ background: hover.hex }}
              />
              {hover.hex}
            </span>
          )}
        </div>
      ) : failed ? (
        <p className="m-0 text-[13px] text-text-3">
          This source has no picture right now. Use the colour box instead.
        </p>
      ) : (
        <div className="aspect-video w-full rounded-control bg-surface-3 motion-safe:animate-pulse" />
      )}
    </div>
  )
}

/** The colours a key takes by name, with a dot of each. */
const KEY_DOTS: Record<string, string> = {
  green: '#1fb24e',
  blue: '#2563eb',
  magenta: '#d633b8',
  red: '#e0383e',
}

/** The colours the green screen keys out for its named choices (OBS's, as #rrggbb). */
const CHROMA_KEYS: Record<string, string> = {
  green: '#00ff00',
  blue: '#0099ff',
  magenta: '#ff00ff',
}

/** How far `hex` is from black, white and every grey, as the green screen measures colours
 *  (OBS's: the distance between their Cb and Cr; its Strength removes all within that, so a
 *  Strength past this removes greys too). Pure green is 0.52 away, a lime green screen 0.33. */
export function chromaFromGrey(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [
    number,
    number,
    number,
  ]
  const cb = -0.100644 * r - 0.338572 * g + 0.439216 * b + 0.501961
  const cr = 0.439216 * r - 0.398942 * g - 0.040274 * b + 0.501961
  return Math.hypot(cb - 0.501961, cr - 0.501961)
}

/** The green screen's similarity (OBS's 1–1000) that removes `hex` and colours near it but
 *  keeps black, white and greys: 70% of the way to grey, never above OBS's default 400. */
export function safeSimilarity(hex: string): number {
  return Math.round(Math.min(400, Math.max(40, chromaFromGrey(hex) * 1000 * 0.7)))
}

/** The strength to start a green screen at for `hex`: OBS's 400 when greys stay well clear of
 *  it (pure green), else one that keeps black, white and greys (Blue 256, a lime 232). */
export function startingSimilarity(hex: string): number {
  // 400 plus the soft edge round it (80 by default) still short of grey: OBS's own default.
  return chromaFromGrey(hex) * 1000 >= 500 ? 400 : safeSimilarity(hex)
}

/** Green screen and colour key: which colour (Green, Blue or one picked off the picture), then
 *  the main sliders. */
function KeyForm({
  kind,
  source,
  opts,
  values,
  onChange,
  more,
}: FormIn & { kind: string; source: string; more: boolean }) {
  const simple = SIMPLE[kind]
  const type = opts.find((o) => o.key === 'key_color_type')
  const key = opts.find((o) => o.key === 'key_color')
  const [picking, setPicking] = useState(false)
  const now = type ? String(valueOf(type, values) ?? 'green') : 'green'
  const custom = now === 'custom'
  const picked = key ? toHex(valueOf(key, values)) : '#000000'
  // Green and Blue always; another named colour (Magenta from OBS) while it's the one in use.
  const named = ['green', 'blue', ...(now !== 'green' && now !== 'blue' && !custom ? [now] : [])]
  const names = (v: string) => type?.choices[type.values.indexOf(v)] ?? v
  // The green screen removes all colours within Strength of its key: past the key's distance
  // from grey it takes black, white and greys too (9 Nov: a picked lime green blacked out the
  // whole window). Colour Key measures plain RGB distance and has no such edge.
  const chroma = kind.startsWith('chroma_key')
  const keyHex = custom ? picked : (CHROMA_KEYS[now] ?? CHROMA_KEYS.green ?? '#00ff00')
  const strength = opts.find((o) => o.key === 'similarity')
  const similarity = strength ? Number(valueOf(strength, values)) : 0
  const safe = safeSimilarity(keyHex)
  const greysGo = chroma && similarity / 1000 >= chromaFromGrey(keyHex)
  // Each colour starts at its own strength (owner, 9 Nov: back on Green after Blue it kept
  // Blue's 26%): Green at OBS's 40%, Blue or a picked colour lower, so black, white and greys
  // stay (Blue at 40% removed 99% of a test picture; at 26%, only the blue).
  const startAt = (hex: string) => {
    if (chroma && strength) onChange('similarity', startingSimilarity(hex))
  }
  const seg = (on: boolean) =>
    cx(
      'flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-[12.5px] font-bold outline-none transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)]',
      on ? 'bg-surface-1 text-text shadow-[var(--fc-shadow-1)]' : 'text-text-3 hover:text-text',
    )
  return (
    <div className="flex flex-col gap-2">
      {type && (
        <Line label="Remove">
          <div
            role="radiogroup"
            aria-label="Colour to remove"
            className="flex min-w-0 flex-1 gap-0.5 rounded-[9px] bg-surface-3 p-0.5"
          >
            {named.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={now === v && !picking}
                className={seg(now === v && !picking)}
                onClick={() => {
                  onChange('key_color_type', v)
                  const hex = CHROMA_KEYS[v]
                  if (hex) startAt(hex)
                }}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
                  style={{ background: KEY_DOTS[v] ?? '#888' }}
                />
                <span className="truncate">{names(v)}</span>
              </button>
            ))}
            {key && (
              <button
                type="button"
                role="radio"
                aria-checked={custom || picking}
                aria-label={
                  custom ? `Picked colour ${picked}: pick another` : 'Pick a colour off the picture'
                }
                title={custom ? picked : 'Pick a colour off the picture'}
                className={seg(custom || picking)}
                onClick={() => setPicking(true)}
              >
                {custom ? (
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
                    style={{ background: picked }}
                  />
                ) : (
                  <Eyedropper size={13} weight="bold" aria-hidden />
                )}
                <span className="truncate">Pick</span>
              </button>
            )}
          </div>
        </Line>
      )}
      {picking && key && (
        <PickFromPicture
          source={source}
          onClose={() => setPicking(false)}
          onPick={(hex) => {
            // A picked colour is a custom one.
            onChange('key_color_type', 'custom')
            onChange('key_color', fromHex(hex, valueOf(key, values) ?? 0xff000000))
            // A strength that keeps black, white and greys for this colour (a lime or pale green
            // sits closer to grey than pure green, so OBS's 40% would take greys too).
            startAt(hex)
          }}
        />
      )}
      {greysGo && strength && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[8px] bg-warn-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-warn"
        >
          <Warning size={15} weight="fill" aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">This strength removes black, white and greys too.</span>
          <button
            type="button"
            onClick={() => onChange('similarity', safe)}
            className="shrink-0 rounded-[6px] px-1.5 py-0.5 font-bold underline underline-offset-2 outline-none hover:bg-warn-soft focus-visible:shadow-[var(--fc-focus)]"
          >
            Lower to {shownNumber(strength, safe)}%
          </button>
        </div>
      )}
      {simple && (
        <MainAndMore
          opts={opts.filter((o) => o.key !== 'key_color_type')}
          values={values}
          onChange={onChange}
          main={simple.main}
          more={more}
          {...(simple.rename ? { rename: simple.rename } : {})}
        />
      )}
    </div>
  )
}

const SIDES = [
  { k: 'l', label: 'Left', cursor: 'cursor-ew-resize' },
  { k: 't', label: 'Top', cursor: 'cursor-ns-resize' },
  { k: 'r', label: 'Right', cursor: 'cursor-ew-resize' },
  { k: 'b', label: 'Bottom', cursor: 'cursor-ns-resize' },
] as const

/** Crop: drag the box's edges (or the whole box) on the source's own picture. */
export function CropForm({ source, opts, values, onChange }: FormIn & { source: string }) {
  const { pic, failed } = useSourcePicture(source)
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ k: string; x: number; y: number; from: Edges } | null>(null)
  const [live, setLive] = useState<Edges | null>(null)
  if (!pic) {
    // No picture yet (a window that's closed, a camera starting): the numbers still work.
    return failed ? (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[13.5px] text-text-3">
          This source has no picture right now, so here are the numbers.
        </p>
        <OptionsForm compact opts={opts} values={values} onChange={onChange} />
      </div>
    ) : (
      <div className="aspect-video w-full rounded-control bg-surface-3 motion-safe:animate-pulse" />
    )
  }
  const size = { w: pic.w, h: pic.h }
  const saved = clampEdges(edgesOf(values, size), size)
  const e = live ?? saved
  const write = (next: Edges) => {
    const c = clampEdges(next, size)
    setLive(c)
    // Always saved as the four edges (OBS's Relative crop).
    if (values.relative === false) onChange('relative', true)
    onChange('left', c.l)
    onChange('top', c.t)
    onChange('right', c.r)
    onChange('bottom', c.b)
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const onMove = (ev: React.PointerEvent) => {
    if (!drag || !box.current) return
    const r = box.current.getBoundingClientRect()
    const dx = ((ev.clientX - drag.x) / r.width) * size.w
    const dy = ((ev.clientY - drag.y) / r.height) * size.h
    const f = drag.from
    if (drag.k === 'move') {
      const mx = Math.max(-f.l, Math.min(f.r, dx))
      const my = Math.max(-f.t, Math.min(f.b, dy))
      write({ l: f.l + mx, r: f.r - mx, t: f.t + my, b: f.b - my })
    } else if (drag.k === 'l') write({ ...f, l: f.l + dx })
    else if (drag.k === 'r') write({ ...f, r: f.r - dx })
    else if (drag.k === 't') write({ ...f, t: f.t + dy })
    else if (drag.k === 'b') write({ ...f, b: f.b - dy })
  }
  const start = (k: string) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    box.current?.setPointerCapture(ev.pointerId)
    setDrag({ k, x: ev.clientX, y: ev.clientY, from: e })
  }
  const end = () => {
    setDrag(null)
    setLive(null)
  }
  // Arrow keys on an edge: 2 pixels, 20 with Shift.
  const nudge = (k: (typeof SIDES)[number]['k']) => (ev: React.KeyboardEvent) => {
    const sign =
      ev.key === 'ArrowRight' || ev.key === 'ArrowDown'
        ? 1
        : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp'
          ? -1
          : 0
    if (!sign) return
    ev.preventDefault()
    const step = (ev.shiftKey ? 20 : 2) * sign
    // Moving the right or bottom edge right/down keeps more, so its crop gets smaller.
    const by = k === 'r' || k === 'b' ? -step : step
    write({ ...saved, [k]: saved[k] + by })
    setLive(null)
  }
  const keptW = size.w - e.l - e.r
  const keptH = size.h - e.t - e.b
  const mid = { x: e.l + keptW / 2, y: e.t + keptH / 2 }
  const handle: Record<Edge, { x: number; y: number }> = {
    l: { x: e.l, y: mid.y },
    r: { x: size.w - e.r, y: mid.y },
    t: { x: mid.x, y: e.t },
    b: { x: mid.x, y: size.h - e.b },
  }
  const cropped = e.l + e.t + e.r + e.b > 0
  return (
    <div className="flex flex-col gap-2.5">
      <Header title="Drag the edges, or drag the box to move it.">
        {cropped && (
          <Button size="sm" variant="secondary" onClick={() => write({ l: 0, t: 0, r: 0, b: 0 })}>
            <ArrowCounterClockwise size={14} weight="bold" /> No crop
          </Button>
        )}
      </Header>
      <div className="px-2.5 py-2.5">
        <div
          ref={box}
          className="relative w-full touch-none select-none"
          style={{ aspectRatio: `${size.w} / ${size.h}` }}
          onPointerMove={onMove}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img
            src={pic.image}
            alt=""
            width={size.w}
            height={size.h}
            draggable={false}
            className="absolute inset-0 size-full rounded-[8px] object-fill"
          />
          {/* What's cut off, dimmed. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[8px]"
          >
            <div
              className="absolute inset-x-0 top-0 bg-black/55"
              style={{ height: pct(e.t, size.h) }}
            />
            <div
              className="absolute inset-x-0 bottom-0 bg-black/55"
              style={{ height: pct(e.b, size.h) }}
            />
            <div
              className="absolute left-0 bg-black/55"
              style={{ top: pct(e.t, size.h), bottom: pct(e.b, size.h), width: pct(e.l, size.w) }}
            />
            <div
              className="absolute right-0 bg-black/55"
              style={{ top: pct(e.t, size.h), bottom: pct(e.b, size.h), width: pct(e.r, size.w) }}
            />
          </div>
          <div
            aria-hidden
            onPointerDown={start('move')}
            className="absolute cursor-move outline-2 outline-accent outline-solid"
            style={{
              left: pct(e.l, size.w),
              top: pct(e.t, size.h),
              right: pct(e.r, size.w),
              bottom: pct(e.b, size.h),
            }}
          />
          {SIDES.map((s) => (
            <button
              key={s.k}
              type="button"
              aria-label={`${s.label} edge: ${e[s.k]} pixels cut. Arrow keys move it, Shift for bigger steps.`}
              onPointerDown={start(s.k)}
              onKeyDown={nudge(s.k)}
              className={cx(
                'absolute -mt-[11px] -ml-[11px] size-[22px] rounded-full border-2 border-accent bg-white shadow-[var(--fc-shadow-1)] outline-none focus-visible:shadow-[var(--fc-focus)]',
                s.cursor,
              )}
              style={{ left: pct(handle[s.k].x, size.w), top: pct(handle[s.k].y, size.h) }}
            />
          ))}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-[6px] bg-black/75 px-2 py-1 font-mono text-[12px] text-white tabular-nums"
          >
            {keptW} × {keptH}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {SIDES.map((s) => (
          <label key={s.k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12px] font-bold text-text-3">{s.label}</span>
            <Input
              type="number"
              inputMode="numeric"
              name={`crop_${s.k}`}
              autoComplete="off"
              min={0}
              step={1}
              value={e[s.k]}
              className="h-8! px-2! text-[13px]! tabular-nums"
              onChange={(ev) => {
                const n = ev.target.valueAsNumber
                if (Number.isFinite(n)) {
                  write({ ...saved, [s.k]: n })
                  setLive(null)
                }
              }}
            />
          </label>
        ))}
      </div>
      <p className="m-0 text-[12.5px] text-text-3">
        In pixels of the real picture ({size.w} × {size.h}).
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ noise gate

/** The gate as one line on the live meter: the mic turns on above it. */
export function GateForm({
  source,
  opts,
  values,
  onChange,
  more,
}: FormIn & { source: string; more: boolean }) {
  const { api } = useDesk()
  const levels = useLevels(api, [source])
  const open = typeof values.open_threshold === 'number' ? values.open_threshold : -26
  const peak = Math.max(...(levels[source]?.peak ?? [-100, -100]))
  const set = (db: number) => {
    onChange('open_threshold', db)
    // It turns off a little below where it turns on, so a voice doesn't flicker it.
    onChange('close_threshold', Math.max(-96, db - 6))
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-7 overflow-hidden rounded-[7px] bg-surface-3" aria-hidden>
        <div
          className="absolute inset-0 origin-left bg-ok/70 transition-transform duration-75 motion-reduce:transition-none"
          style={{ transform: `scaleX(${meterPct(peak) / 100})` }}
        />
        <div
          className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-text"
          style={{ left: `${meterPct(open)}%` }}
        />
      </div>
      <Line label="Mic on above">
        <input
          type="range"
          min={-60}
          max={0}
          step={1}
          value={Math.round(open)}
          aria-label="Mic on above"
          aria-valuetext={`${Math.round(open)} dB`}
          onChange={(ev) => set(Number(ev.target.value))}
          className="fc-slim min-w-0 flex-1"
          style={{ ['--fill' as string]: `${meterPct(open)}%` }}
        />
        <span className="flex h-7 w-[3.75rem] shrink-0 items-center justify-end rounded-[7px] bg-surface-3 px-1.5 font-mono text-[12.5px] tabular-nums">
          {Math.round(open)}
          <span className="pl-0.5 font-sans text-[11px] text-text-3">dB</span>
        </span>
      </Line>
      <p className="m-0 text-[12.5px] text-text-3">
        Talking should pass the line; quiet should stay left of it.
      </p>
      <MainAndMore
        opts={opts}
        values={values}
        onChange={onChange}
        main={[]}
        more={more}
        rename={[
          { key: 'open_threshold', label: 'On above' },
          { key: 'close_threshold', label: 'Off below' },
          { key: 'attack_time', label: 'Fade in' },
          { key: 'hold_time', label: 'Wait' },
          { key: 'release_time', label: 'Fade out' },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------ the rest

/** Filters shown main-settings-first, with short words: every label fits on one line of the
 *  panel (owner, 9 Nov), the rest behind the header's More. */
const SIMPLE: Record<string, { main: Words[]; rename?: Words[] }> = {
  color_filter: {
    main: [
      { key: 'brightness', label: 'Brightness' },
      { key: 'contrast', label: 'Contrast' },
      { key: 'saturation', label: 'Saturation' },
    ],
    rename: [
      { key: 'gamma', label: 'Gamma' },
      { key: 'hue_shift', label: 'Hue' },
      { key: 'opacity', label: 'Opacity' },
      { key: 'color_multiply', label: 'Tint' },
      { key: 'color_add', label: 'Add colour' },
    ],
  },
  chroma_key_filter: {
    main: [
      {
        key: 'similarity',
        label: 'Strength',
        help: 'Raise it until the background is gone. Too high starts removing you.',
      },
      { key: 'spill', label: 'Clean edges', help: 'Takes the coloured glow off your edges' },
      { key: 'smoothness', label: 'Soft edges' },
    ],
    rename: [
      { key: 'key_color', label: 'Exact colour' },
      { key: 'opacity', label: 'Opacity' },
      { key: 'contrast', label: 'Contrast' },
      { key: 'brightness', label: 'Brightness' },
      { key: 'gamma', label: 'Gamma' },
    ],
  },
  color_key_filter: {
    main: [
      { key: 'similarity', label: 'Strength' },
      { key: 'smoothness', label: 'Soft edges' },
    ],
    rename: [
      { key: 'key_color', label: 'Exact colour' },
      { key: 'opacity', label: 'Opacity' },
      { key: 'contrast', label: 'Contrast' },
      { key: 'brightness', label: 'Brightness' },
      { key: 'gamma', label: 'Gamma' },
    ],
  },
  sharpness_filter: { main: [{ key: 'sharpness', label: 'Amount' }] },
  compressor_filter: {
    main: [
      { key: 'threshold', label: 'Starts at', help: 'Sounds louder than this get quieter' },
      { key: 'ratio', label: 'Amount' },
    ],
    rename: [
      { key: 'attack_time', label: 'Attack' },
      { key: 'release_time', label: 'Release' },
      { key: 'output_gain', label: 'Boost after' },
    ],
  },
}
// OBS's newer versions of the same filters read the same keys.
for (const k of ['color_filter', 'chroma_key_filter', 'color_key_filter', 'sharpness_filter']) {
  const s = SIMPLE[k]
  if (s) SIMPLE[`${k}_v2`] = s
}

/** Whether `kind`'s form keeps settings behind its header's More button. */
export function hasMore(kind: string): boolean {
  return (
    kind === 'noise_gate_filter' ||
    (Object.hasOwn(SIMPLE, kind) && kind !== 'sharpness_filter' && kind !== 'sharpness_filter_v2')
  )
}

/** A filter's form: its own simpler one where there is one, else every option as OBS has it.
 *  `more` shows the rest (the header's More button); Reset is in the header too. */
export function FilterForm({
  kind,
  source,
  opts,
  values,
  onChange,
  more = false,
}: FormIn & { kind: string; source: string; more?: boolean }) {
  if (kind === 'crop_filter')
    return <CropForm source={source} opts={opts} values={values} onChange={onChange} />
  if (kind === 'noise_gate_filter')
    return <GateForm source={source} opts={opts} values={values} onChange={onChange} more={more} />
  if (/^(chroma|color)_key_filter(_v2)?$/.test(kind))
    return (
      <KeyForm
        kind={kind}
        source={source}
        opts={opts}
        values={values}
        onChange={onChange}
        more={more}
      />
    )
  const simple = SIMPLE[kind]
  if (!simple) return <OptionsForm compact opts={opts} values={values} onChange={onChange} />
  return (
    <MainAndMore
      opts={opts}
      values={values}
      onChange={onChange}
      main={simple.main}
      more={more}
      {...(simple.rename ? { rename: simple.rename } : {})}
    />
  )
}
