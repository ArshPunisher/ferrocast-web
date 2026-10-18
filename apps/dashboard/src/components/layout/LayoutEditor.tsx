// The layout editor shared by overlays and scene designs: a canvas with drag, resize, snapping
// to the canvas and to other layers (with guides), a layers panel (order, lock, hide,
// duplicate, delete), align buttons, and settings for widgets and static layers (text,
// pictures, shapes, frames, webcam frames). The parent owns the draft and its undo history.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  AlignBottom,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignTop,
  ArrowDown,
  ArrowUp,
  CopySimple,
  DotsThree,
  Eye,
  EyeSlash,
  FrameCorners,
  ImageSquare,
  Keyboard,
  Lock,
  LockOpen,
  Play,
  Pause,
  Shapes,
  TextT,
  Trash,
  VideoCamera,
} from '@phosphor-icons/react'
import {
  CLIP_LABEL,
  FRAME_VARIANT_LABEL,
  PATTERN_LABEL,
  TEXT_EFFECT_LABEL,
  describeError,
  isBrandLayer,
  type DesignRef,
  type Goal,
  type LayerConfig,
  type Media,
  type OverlayState,
  type Theme,
  type Widget,
} from '@ferrocast/api'
import { DESIGN_FONTS, GOOGLE_FONTS, SYSTEM_FONTS, sparkSvg } from '@ferrocast/overlays'
import {
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Switch,
  Textarea,
  cx,
  toast,
} from '@ferrocast/ui'
import { Menu } from '../Menu'
import { OverlayPreview } from '../AlertStage'
import { ColorField, Range } from '../design/inspector'
import {
  GRID,
  KINDS,
  WidgetSettings,
  clampWidget,
  kindInfo,
  newWidget,
  snap,
} from './widget-settings'
import { useClient } from '../../lib/hooks'

export interface Layout {
  name: string
  width: number
  height: number
  widgets: Widget[]
  design?: DesignRef | null
}

const SNAP = 8

type LayerKind = LayerConfig['type']
const LAYER_LABEL: Record<LayerKind, string> = {
  image: 'Picture',
  text: 'Text',
  shape: 'Shape',
  frame: 'Frame',
  webcam: 'Webcam frame',
  brand: 'Ferrocast mark',
}
const LAYER_ICON: Record<LayerKind, typeof TextT> = {
  image: ImageSquare,
  text: TextT,
  shape: Shapes,
  frame: FrameCorners,
  webcam: VideoCamera,
  brand: Lock,
}

/** A short, human name for a layer or widget (layers panel, canvas labels). */
export function layerName(w: Widget): string {
  if (w.kind !== 'layer') return kindInfo(w.kind).label
  const c = w.config
  if (c.type === 'text') {
    const t = c.text.trim()
    return t ? `Text: ${t.length > 22 ? `${t.slice(0, 21)}…` : t}` : 'Text'
  }
  if (c.type === 'shape') {
    // Names people recognise in the list instead of seven rows of "Shape".
    if (w.x <= 0 && w.y <= 0 && w.w >= 1280 && w.h >= 720) return 'Background'
    if (c.pattern) return 'Pattern'
    return SHAPE_LABEL[c.shape ?? 'rect']
  }
  return LAYER_LABEL[c.type] ?? 'Layer'
}

const SHAPE_LABEL: Record<NonNullable<Extract<LayerConfig, { type: 'shape' }>['shape']>, string> = {
  rect: 'Box',
  ellipse: 'Circle',
  line: 'Line',
  slant: 'Slanted bar',
  triangle: 'Triangle',
}

function iconFor(w: Widget) {
  return w.kind === 'layer' ? (LAYER_ICON[w.config.type] ?? Shapes) : kindInfo(w.kind).icon
}

function newLayer(
  type: Exclude<LayerKind, 'brand'>,
  o: { width: number; height: number },
  media?: string,
): Widget {
  const id = `l-${Date.now().toString(36)}`
  const box = (w: number, h: number) => ({
    x: snap((o.width - w) / 2),
    y: snap((o.height - h) / 2),
    w,
    h,
  })
  switch (type) {
    case 'text':
      return {
        id,
        kind: 'layer',
        ...box(800, 120),
        config: {
          type: 'text',
          text: 'Your text here',
          font: 'Bricolage Grotesque',
          size: 72,
          weight: 800,
          color: '#eef0f4',
          align: 'center',
          shadow: 'soft',
        },
      }
    case 'image':
      return {
        id,
        kind: 'layer',
        ...box(480, 320),
        config: { type: 'image', media: media ?? '', fit: 'cover', radius: 12 },
      }
    case 'shape':
      return {
        id,
        kind: 'layer',
        ...box(400, 240),
        config: { type: 'shape', shape: 'rect', fill: '#16191e', radius: 16 },
      }
    case 'frame':
      return {
        id,
        kind: 'layer',
        ...box(640, 360),
        config: {
          type: 'frame',
          style: 'line',
          color: '#ffa424',
          accent: '#33d4ff',
          thickness: 4,
          radius: 16,
        },
      }
    case 'webcam':
      return {
        id,
        kind: 'layer',
        ...box(480, 340),
        config: {
          type: 'webcam',
          style: 'notch',
          color: '#ffa424',
          accent: '#33d4ff',
          thickness: 3,
          radius: 14,
          label: 'LIVE',
        },
      }
  }
}

function Canvas({
  layout,
  selected,
  onSelect,
  onChange,
  preview,
  state,
  readOnly,
  brandLocked,
}: {
  layout: Layout
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (w: Widget, opts?: { merge?: boolean }) => void
  preview: boolean
  state: OverlayState
  readOnly: boolean
  brandLocked: boolean
}) {
  /** The mark of a built-in can't be moved either (it's kept, as placed by the design). */
  const fixed = (w: Widget) => readOnly || !!w.locked || (brandLocked && isBrandLayer(w))
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const drag = useRef<{
    id: string
    mode: 'move' | 'resize'
    sx: number
    sy: number
    start: Widget
  } | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / layout.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.width])

  /** Lines a moving box can snap to: the canvas edges and centre, and every other layer's. */
  const lines = (except: string) => {
    const xs = [0, layout.width / 2, layout.width]
    const ys = [0, layout.height / 2, layout.height]
    for (const w of layout.widgets) {
      if (w.id === except || w.hidden) continue
      xs.push(w.x, w.x + w.w / 2, w.x + w.w)
      ys.push(w.y, w.y + w.h / 2, w.y + w.h)
    }
    return { xs, ys }
  }
  const nearest = (edges: number[], targets: number[]) => {
    let best: { d: number; shift: number; at: number } | null = null
    for (const e of edges)
      for (const t of targets) {
        const d = Math.abs(e - t)
        if (d <= SNAP / Math.max(scale, 0.25) && (!best || d < best.d))
          best = { d, shift: t - e, at: t }
      }
    return best
  }

  const onDown = (e: ReactPointerEvent, w: Widget, mode: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect(w.id)
    if (fixed(w)) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: w.id, mode, sx: e.clientX, sy: e.clientY, start: w }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / scale
    const dy = (e.clientY - d.sy) / scale
    let next: Widget
    if (d.mode === 'move') {
      let x = snap(d.start.x + dx)
      let y = snap(d.start.y + dy)
      const { xs, ys } = lines(d.id)
      const sx = nearest(
        [d.start.x + dx, d.start.x + dx + d.start.w / 2, d.start.x + dx + d.start.w],
        xs,
      )
      const sy = nearest(
        [d.start.y + dy, d.start.y + dy + d.start.h / 2, d.start.y + dy + d.start.h],
        ys,
      )
      if (sx) x = Math.round(d.start.x + dx + sx.shift)
      if (sy) y = Math.round(d.start.y + dy + sy.shift)
      setGuides({ x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] })
      next = { ...d.start, x, y }
    } else next = { ...d.start, w: snap(d.start.w + dx), h: snap(d.start.h + dy) }
    onChange(clampWidget(next, layout), { merge: true })
  }
  const onUp = () => {
    drag.current = null
    setGuides({ x: [], y: [] })
  }

  return (
    <div
      ref={box}
      className="relative aspect-video w-full touch-none overflow-hidden rounded-panel border border-line bg-[repeating-conic-gradient(var(--fc-surface-2)_0%_25%,var(--fc-surface-1)_0%_50%)] [background-size:24px_24px] select-none"
      onPointerDown={() => onSelect(null)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label={`${layout.name} layout, ${layout.width} by ${layout.height}`}
      role="group"
    >
      {preview && (
        <OverlayPreview
          overlay={{ id: 'draft', url: '', updated_at: 0, ...layout }}
          state={state}
          live
          className="pointer-events-none absolute inset-0"
        />
      )}
      {guides.x.map((x) => (
        <div
          key={`x${x}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-accent-text/80"
          style={{ left: x * scale }}
        />
      ))}
      {guides.y.map((y) => (
        <div
          key={`y${y}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-px bg-accent-text/80"
          style={{ top: y * scale }}
        />
      ))}
      {layout.widgets.map((w) => {
        const Icon = iconFor(w)
        const sel = w.id === selected
        const name = layerName(w)
        const kind = w.kind === 'layer' ? 'layer' : 'widget'
        return (
          <div
            key={w.id}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${w.kind === 'layer' ? name : kindInfo(w.kind).label} ${kind} at ${w.x}, ${w.y}, ${w.w} by ${w.h}.${w.locked ? ' Locked.' : ' Arrow keys move it, Alt with arrows resizes.'}${w.hidden ? ' Hidden on stream.' : ''}`}
            onPointerDown={(e) => onDown(e, w, 'move')}
            onFocus={() => onSelect(w.id)}
            onKeyDown={(e) => {
              if (fixed(w)) return
              const step = e.shiftKey ? GRID * 5 : GRID
              const map: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              }
              const m = map[e.key]
              if (!m) return
              e.preventDefault()
              onChange(
                clampWidget(
                  e.altKey
                    ? { ...w, w: w.w + m[0], h: w.h + m[1] }
                    : { ...w, x: w.x + m[0], y: w.y + m[1] },
                  layout,
                ),
              )
            }}
            className={cx(
              'group absolute rounded-[6px] border-2 transition-[border-color,background-color] duration-100 focus-visible:outline-none',
              fixed(w) ? 'cursor-default' : 'cursor-move',
              sel
                ? 'border-accent-text bg-accent-soft/40'
                : preview
                  ? 'border-dashed border-line-strong/70 hover:border-text-3'
                  : 'border-line-strong bg-surface-1/70 hover:border-text-3',
              w.hidden && 'opacity-40',
            )}
            style={{
              left: w.x * scale,
              top: w.y * scale,
              width: w.w * scale,
              height: w.h * scale,
              rotate: w.rotation ? `${w.rotation}deg` : undefined,
            }}
          >
            {(!preview || sel) && (
              <span
                className={cx(
                  'absolute top-1 left-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 truncate rounded-[5px] px-1.5 py-0.5 text-[12px] font-semibold',
                  sel ? 'bg-btn-primary text-on-btn-primary' : 'bg-surface-3 text-text-2',
                )}
              >
                {w.locked ? <Lock size={12} weight="bold" /> : <Icon size={12} weight="bold" />}
                {name}
              </span>
            )}
            {sel && !fixed(w) && (
              <span
                role="presentation"
                onPointerDown={(e) => onDown(e, w, 'resize')}
                className="absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize rounded-[4px] border-2 border-accent-text bg-bg"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SparkGlyph() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const svg = sparkSvg('spark-glyph')
    svg.setAttribute('width', '15')
    svg.setAttribute('height', '15')
    el.replaceChildren(svg)
  }, [])
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="inline-flex text-text [&_.sh-bottom]:fill-[var(--fc-arc)] [&_.sh-top]:fill-[var(--fc-accent)] [&_path]:fill-current"
    />
  )
}

function LayersPanel({
  layout,
  selected,
  onSelect,
  onChange,
  readOnly,
  brandLocked,
}: {
  layout: Layout
  selected: string | null
  onSelect: (id: string) => void
  onChange: (widgets: Widget[]) => void
  readOnly: boolean
  brandLocked: boolean
}) {
  const ws = layout.widgets
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= ws.length) return
    const next = [...ws]
    ;[next[i], next[j]] = [next[j] as Widget, next[i] as Widget]
    onChange(next)
  }
  const patch = (id: string, p: Partial<Widget>) =>
    onChange(ws.map((w) => (w.id === id ? ({ ...w, ...p } as Widget) : w)))
  // Top of the list is the top of the stack.
  const order = ws.map((w, i) => ({ w, i })).reverse()
  if (ws.length === 0)
    return (
      <p className="text-sm text-text-3">
        No layers yet. Add alerts first: it’s what most streams need.
      </p>
    )
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Layers, top first">
      {order.map(({ w, i }) => {
        const Icon = iconFor(w)
        const mark = isBrandLayer(w)
        const fixed = readOnly || (mark && brandLocked)
        return (
          <li
            key={w.id}
            className={cx(
              'group flex items-center gap-0.5 rounded-control pr-1',
              w.id === selected ? 'bg-accent-soft' : 'hover:bg-surface-2',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(w.id)}
              aria-pressed={w.id === selected}
              className={cx(
                'flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-[14px] font-semibold',
                w.id === selected ? 'text-accent-text' : 'text-text',
                w.hidden && 'opacity-55',
              )}
              title={
                mark && brandLocked
                  ? 'Built-in designs keep a small Ferrocast mark. Duplicate the design to remove it.'
                  : undefined
              }
            >
              {mark ? <SparkGlyph /> : <Icon size={15} className="shrink-0" />}
              <span className="truncate">{layerName(w)}</span>
            </button>
            {!fixed && (
              // Row actions stay out of the way until the row is hovered or focused; a hidden
              // or locked layer keeps its icon showing so its state is visible.
              <span className="hidden items-center group-focus-within:flex group-hover:flex [@media(hover:none)]:flex">
                <IconButton
                  size="sm"
                  label={w.hidden ? `Show ${layerName(w)}` : `Hide ${layerName(w)}`}
                  onClick={() => patch(w.id, { hidden: !w.hidden })}
                  className="size-7"
                >
                  {w.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                </IconButton>
                <IconButton
                  size="sm"
                  label={w.locked ? `Unlock ${layerName(w)}` : `Lock ${layerName(w)}`}
                  onClick={() => patch(w.id, { locked: !w.locked })}
                  className="size-7"
                >
                  {w.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </IconButton>
                <IconButton
                  size="sm"
                  label={`Bring ${layerName(w)} forward`}
                  disabled={i === ws.length - 1}
                  onClick={() => move(i, 1)}
                  className="size-7"
                >
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  label={`Send ${layerName(w)} back`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="size-7"
                >
                  <ArrowDown size={14} />
                </IconButton>
              </span>
            )}
            {!fixed && (w.hidden || w.locked) && (
              <span className="flex items-center gap-1 pr-1.5 text-text-3 group-focus-within:hidden group-hover:hidden [@media(hover:none)]:hidden">
                {w.hidden && <EyeSlash size={14} aria-label="Hidden" />}
                {w.locked && <Lock size={14} aria-label="Locked" />}
              </span>
            )}
            {fixed && mark && (
              <Lock
                size={13}
                className="mr-1.5 text-text-3"
                aria-label="Kept on built-in designs"
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function LayerSettings({
  w,
  onChange,
  media,
}: {
  w: Widget & { kind: 'layer' }
  onChange: (w: Widget, opts?: { merge?: boolean }) => void
  media: Media[]
}) {
  const c = w.config
  const set = (p: Partial<LayerConfig>, merge = false) =>
    onChange({ ...w, config: { ...c, ...p } as LayerConfig }, { merge })
  /** Sets one optional field, or removes it when the value is empty. */
  const opt = (key: string, value: unknown, merge = false) => {
    const next: Record<string, unknown> = { ...c }
    if (value === '' || value === null || value === undefined) delete next[key]
    else next[key] = value
    onChange({ ...w, config: next as unknown as LayerConfig }, { merge })
  }
  if (c.type === 'text')
    return (
      <div className="flex flex-col gap-3">
        <Field label="Text">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={c.text}
              maxLength={500}
              onChange={(e) => set({ text: e.target.value }, true)}
            />
          )}
        </Field>
        <Field label="Font">
          {(p) => (
            <Select
              {...p}
              value={c.font ?? 'Bricolage Grotesque'}
              onChange={(e) => set({ font: e.target.value })}
            >
              <optgroup label="Comes with Ferrocast">
                {['Bricolage Grotesque', 'Hanken Grotesk', 'JetBrains Mono', ...DESIGN_FONTS].map(
                  (f) => (
                    <option key={f}>{f}</option>
                  ),
                )}
              </optgroup>
              <optgroup label="Google Fonts (if installed)">
                {Object.keys(GOOGLE_FONTS)
                  .filter((f) => !DESIGN_FONTS.includes(f))
                  .map((f) => (
                    <option key={f}>{f}</option>
                  ))}
              </optgroup>
              <optgroup label="On this computer">
                {Object.keys(SYSTEM_FONTS).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Range
            label="Size"
            value={c.size ?? 48}
            min={8}
            max={240}
            unit="px"
            onChange={(v, m) => set({ size: v }, m)}
          />
          <Range
            label="Weight"
            value={c.weight ?? 700}
            min={300}
            max={900}
            step={50}
            onChange={(v, m) => set({ weight: v }, m)}
          />
        </div>
        <ColorField
          label="Colour"
          value={c.color ?? '#eef0f4'}
          onChange={(v) => set({ color: v }, true)}
        />
        <Segmented
          label="Alignment"
          size="sm"
          value={c.align ?? 'left'}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(align) => set({ align })}
        />
        <Segmented
          label="Shadow"
          size="sm"
          value={c.shadow ?? 'none'}
          options={[
            { value: 'none', label: 'None' },
            { value: 'soft', label: 'Soft' },
            { value: 'hard', label: 'Hard' },
            { value: 'glow', label: 'Glow' },
          ]}
          onChange={(shadow) => set({ shadow })}
        />
        <Switch
          checked={c.uppercase ?? false}
          onChange={(uppercase) => set({ uppercase })}
          label="All caps"
        />
        <Field label="Effect">
          {(p) => (
            <Select {...p} value={c.effect ?? ''} onChange={(e) => opt('effect', e.target.value)}>
              <option value="">None</option>
              {Object.entries(TEXT_EFFECT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {c.effect && (
          <ColorField
            label="Second colour"
            value={c.color2 ?? c.outline_color ?? '#07080a'}
            onChange={(v) => set({ color2: v }, true)}
          />
        )}
        <Switch
          checked={c.split === 'letters'}
          onChange={(on) => opt('split', on ? 'letters' : '')}
          label="Letters come in one by one"
        />
        <Field label="More lines, shown in turn" optional>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              placeholder="One per line, like your other socials"
              value={(c.rotate ?? []).join('\n')}
              onChange={(e) =>
                opt(
                  'rotate',
                  e.target.value
                    ? e.target.value
                        .split('\n')
                        .slice(0, 8)
                        .map((x) => x.slice(0, 80))
                    : '',
                  true,
                )
              }
            />
          )}
        </Field>
        <Field label="Count down (minutes)" optional>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={1440}
              placeholder="Off. Put {time} in the text"
              value={c.countdown ? String(Math.round(c.countdown / 60)) : ''}
              onChange={(e) => {
                const m = Math.min(Math.max(Number(e.target.value) || 0, 0), 1440)
                opt('countdown', m > 0 ? m * 60 : '')
              }}
            />
          )}
        </Field>
      </div>
    )
  if (c.type === 'image')
    return (
      <div className="flex flex-col gap-3">
        <Field label="Picture">
          {(p) => (
            <Select {...p} value={c.media} onChange={(e) => set({ media: e.target.value })}>
              {!media.some((m) => m.id === c.media) && (
                <option value={c.media}>
                  {c.media.startsWith('asset:') ? 'Built-in picture' : 'Choose a picture'}
                </option>
              )}
              {media
                .filter((m) => m.kind === 'image')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Segmented
          label="Fit"
          size="sm"
          value={c.fit ?? 'cover'}
          options={[
            { value: 'cover', label: 'Fill' },
            { value: 'contain', label: 'Fit' },
            { value: 'fill', label: 'Stretch' },
          ]}
          onChange={(fit) => set({ fit })}
        />
        <Range
          label="Corner radius"
          value={c.radius ?? 0}
          min={0}
          max={200}
          unit="px"
          onChange={(v, m) => set({ radius: v }, m)}
        />
      </div>
    )
  if (c.type === 'shape')
    return (
      <div className="flex flex-col gap-3">
        <Segmented
          label="Shape"
          size="sm"
          value={c.shape ?? 'rect'}
          options={[
            { value: 'rect', label: 'Box' },
            { value: 'ellipse', label: 'Round' },
            { value: 'slant', label: 'Slant' },
            { value: 'line', label: 'Line' },
          ]}
          onChange={(shape) => set({ shape })}
        />
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Fill"
            value={c.fill ?? '#16191e'}
            onChange={(v) => set({ fill: v }, true)}
          />
          <ColorField
            label="Fades to"
            value={c.fill2 ?? c.fill ?? '#16191e'}
            onChange={(v) => set({ fill2: v }, true)}
          />
        </div>
        <Range
          label="Fade angle"
          value={c.angle ?? 180}
          min={0}
          max={360}
          unit="°"
          onChange={(v, m) => set({ angle: v }, m)}
        />
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Edge"
            value={c.stroke ?? '#343a44'}
            onChange={(v) => set({ stroke: v }, true)}
          />
          <Range
            label="Edge width"
            value={c.stroke_width ?? 0}
            min={0}
            max={20}
            unit="px"
            onChange={(v, m) => set({ stroke_width: v }, m)}
          />
        </div>
        <Range
          label="Corner radius"
          value={c.radius ?? 0}
          min={0}
          max={200}
          unit="px"
          onChange={(v, m) => set({ radius: v }, m)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cut to">
            {(p) => (
              <Select {...p} value={c.clip ?? ''} onChange={(e) => opt('clip', e.target.value)}>
                <option value="">No cut</option>
                {Object.entries(CLIP_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Pattern">
            {(p) => (
              <Select
                {...p}
                value={c.pattern ?? ''}
                onChange={(e) => opt('pattern', e.target.value)}
              >
                <option value="">None</option>
                {Object.entries(PATTERN_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    )
  if (c.type === 'frame' || c.type === 'webcam')
    return (
      <div className="flex flex-col gap-3">
        <Field label="Style">
          {(p) => (
            <Select
              {...p}
              value={c.style ?? 'line'}
              onChange={(e) => set({ style: e.target.value as 'line' })}
            >
              <option value="line">Line</option>
              <option value="double">Double</option>
              <option value="corners">Corners</option>
              <option value="notch">Notch with a label</option>
              <option value="glow">Glow</option>
            </Select>
          )}
        </Field>
        <Field label="Look">
          {(p) => (
            <Select {...p} value={c.variant ?? ''} onChange={(e) => opt('variant', e.target.value)}>
              <option value="">Plain</option>
              {Object.entries(FRAME_VARIANT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Colour"
            value={c.color ?? '#ffa424'}
            onChange={(v) => set({ color: v }, true)}
          />
          <ColorField
            label="Accent"
            value={c.accent ?? '#33d4ff'}
            onChange={(v) => set({ accent: v }, true)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Range
            label="Thickness"
            value={c.thickness ?? 3}
            min={1}
            max={24}
            unit="px"
            onChange={(v, m) => set({ thickness: v }, m)}
          />
          <Range
            label="Corner radius"
            value={c.radius ?? 12}
            min={0}
            max={120}
            unit="px"
            onChange={(v, m) => set({ radius: v }, m)}
          />
        </div>
        <Field label="Label" optional>
          {(p) => (
            <Input
              {...p}
              value={c.label ?? ''}
              maxLength={40}
              onChange={(e) => set({ label: e.target.value }, true)}
            />
          )}
        </Field>
      </div>
    )
  return (
    <p className="text-[13.5px] text-text-3">
      Built-in designs keep this small Ferrocast mark. Duplicate the design in the gallery to make
      an unbranded copy.
    </p>
  )
}

export function LayoutEditor({
  layout,
  onWidgets,
  readOnly = false,
  brandLocked = false,
  state,
  themes,
  goals,
  onGoalCreated,
  preview,
  media,
  onUploaded,
  onPreview,
  rail,
  extra,
}: {
  layout: Layout
  onWidgets: (widgets: Widget[], opts?: { merge?: boolean }) => void
  readOnly?: boolean
  brandLocked?: boolean
  state: OverlayState
  themes: Theme[]
  goals: Goal[]
  onGoalCreated: (g: Goal) => void
  preview: boolean
  media: Media[]
  onUploaded: (m: Media) => void
  /** Shows the live-view switch in the canvas toolbar. */
  onPreview?: (on: boolean) => void
  /** A column on the left, e.g. a theme's scenes. */
  rail?: ReactNode
  /** Shown under the layers when nothing is selected, e.g. a theme's settings. */
  extra?: ReactNode
}) {
  const client = useClient()
  const [selected, setSelected] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const sel = layout.widgets.find((w) => w.id === selected) ?? null
  const update = (w: Widget, opts?: { merge?: boolean }) =>
    onWidgets(
      layout.widgets.map((x) => (x.id === w.id ? clampWidget(w, layout) : x)),
      opts,
    )
  const add = (w: Widget) => {
    if (layout.widgets.length >= 40) {
      toast({
        tone: 'warn',
        message: 'A layout can hold up to 40 layers.',
        hint: 'Remove one first.',
      })
      return
    }
    onWidgets([...layout.widgets, w])
    setSelected(w.id)
  }
  const remove = (id: string) => {
    onWidgets(layout.widgets.filter((x) => x.id !== id))
    setSelected(null)
  }
  const align = (how: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    if (!sel) return
    const x =
      how === 'l'
        ? 0
        : how === 'c'
          ? Math.round((layout.width - sel.w) / 2)
          : how === 'r'
            ? layout.width - sel.w
            : sel.x
    const y =
      how === 't'
        ? 0
        : how === 'm'
          ? Math.round((layout.height - sel.h) / 2)
          : how === 'b'
            ? layout.height - sel.h
            : sel.y
    update({ ...sel, x, y })
  }
  const lockedSel = !!sel && (readOnly || (isBrandLayer(sel) && brandLocked))
  const addMenu = [
    ...KINDS.filter((k) => !QUICK_KINDS.includes(k.kind)).map((k) => ({
      key: k.kind,
      label: k.label,
      icon: <k.icon size={15} />,
      onSelect: () => add(newWidget(k.kind, layout, goals)),
    })),
    {
      key: 'shape',
      label: 'Shape',
      icon: <Shapes size={15} />,
      onSelect: () => add(newLayer('shape', layout)),
    },
    {
      key: 'frame',
      label: 'Frame',
      icon: <FrameCorners size={15} />,
      onSelect: () => add(newLayer('frame', layout)),
    },
    {
      key: 'webcam',
      label: 'Webcam frame',
      icon: <VideoCamera size={15} />,
      onSelect: () => add(newLayer('webcam', layout)),
    },
  ]
  const addPicture = () => {
    const first = media.find((m) => m.kind === 'image')
    if (first) add(newLayer('image', layout, first.id))
    else file.current?.click()
  }
  const layers = (
    <section aria-label="Layers" className="flex flex-col gap-2">
      <h2 className="font-display text-[15px] font-bold">Layers</h2>
      <LayersPanel
        layout={layout}
        selected={selected}
        onSelect={setSelected}
        onChange={(ws) => onWidgets(ws)}
        readOnly={readOnly}
        brandLocked={brandLocked}
      />
    </section>
  )
  return (
    <div
      className={cx(
        'grid grid-cols-1 gap-4',
        rail
          ? 'xl:grid-cols-[148px_minmax(0,1fr)_310px]'
          : 'xl:grid-cols-[minmax(0,1fr)_320px]',
      )}
    >
      {rail}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-panel bg-[#0d0f13] bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:18px_18px] p-2.5 sm:p-5">
          <Canvas
            layout={layout}
            selected={selected}
            onSelect={setSelected}
            onChange={update}
            preview={preview}
            state={state}
            readOnly={readOnly}
            brandLocked={brandLocked}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Canvas">
          {!readOnly && (
            <>
              <Button size="sm" icon={<TextT size={15} />} onClick={() => add(newLayer('text', layout))}>
                Text
              </Button>
              <Button size="sm" icon={<ImageSquare size={15} />} onClick={addPicture}>
                Picture
              </Button>
              {QUICK_KINDS.map((k) => {
                const info = kindInfo(k)
                return (
                  <Button
                    key={k}
                    size="sm"
                    icon={<info.icon size={15} />}
                    onClick={() => add(newWidget(k, layout, goals))}
                  >
                    {info.label}
                  </Button>
                )
              })}
              <Menu
                label="Add something else"
                trigger={(p) => (
                  <IconButton {...p} size="sm" variant="secondary" label="More to add">
                    <DotsThree size={18} weight="bold" />
                  </IconButton>
                )}
                items={addMenu}
              />
            </>
          )}
          <span className="flex-1" />
          {onPreview && (
            <IconButton
              size="sm"
              aria-pressed={preview}
              label={preview ? 'Pause the live view' : 'Play the live view'}
              title={preview ? 'Pause the live view' : 'Play the live view'}
              onClick={() => onPreview(!preview)}
            >
              {preview ? <Pause size={16} /> : <Play size={16} />}
            </IconButton>
          )}
          <span
            className="inline-flex size-8 items-center justify-center rounded-control text-text-3"
            title="Drag to move, drag the corner to resize. Tab to a layer, arrows move it, Alt + arrows resize, Shift for bigger steps. Cmd or Ctrl + Z undoes."
          >
            <Keyboard size={17} aria-hidden="true" />
            <span className="sr-only">
              Drag to move, drag the corner to resize. Tab to a layer, arrows move it, Alt + arrows
              resize, Shift for bigger steps. Cmd or Ctrl + Z undoes.
            </span>
          </span>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              client
                .upload(f, f.name)
                .then((m) => {
                  onUploaded(m)
                  add(newLayer('image', layout, m.id))
                })
                .catch((err: unknown) => {
                  const d = describeError(err)
                  toast({ tone: 'error', message: d.message, hint: d.hint })
                })
            }}
          />
        </div>
      </div>
      <aside
        className="flex flex-col gap-4 self-start rounded-panel border border-line bg-surface-1 p-4 shadow-1 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
        aria-label="Inspector"
      >
        {sel ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = iconFor(sel)
                return <Icon size={18} className="shrink-0 text-accent-text" aria-hidden="true" />
              })()}
              <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold">
                {layerName(sel)}
              </h2>
              {!lockedSel && (
                <>
                  <IconButton
                    size="sm"
                    label="Duplicate"
                    onClick={() =>
                      add({
                        ...sel,
                        id: `${sel.kind === 'layer' ? 'l' : 'w'}-${Date.now().toString(36)}`,
                        x: Math.min(sel.x + 24, layout.width - sel.w),
                        y: Math.min(sel.y + 24, layout.height - sel.h),
                        locked: false,
                      } as Widget)
                    }
                  >
                    <CopySimple size={16} />
                  </IconButton>
                  {sel.kind === 'layer' && (
                    <IconButton
                      size="sm"
                      variant="danger-ghost"
                      label="Remove layer"
                      onClick={() => remove(sel.id)}
                    >
                      <Trash size={16} />
                    </IconButton>
                  )}
                </>
              )}
            </div>
            {!lockedSel && (
              <div
                className="flex flex-wrap items-center gap-0.5 rounded-control bg-surface-2 p-0.5"
                role="group"
                aria-label="Align on the canvas"
              >
                {(
                  [
                    ['l', AlignLeft, 'Align left'],
                    ['c', AlignCenterHorizontal, 'Centre across'],
                    ['r', AlignRight, 'Align right'],
                    ['t', AlignTop, 'Align top'],
                    ['m', AlignCenterVertical, 'Centre up and down'],
                    ['b', AlignBottom, 'Align bottom'],
                  ] as const
                ).map(([k, I, label]) => (
                  <IconButton
                    key={k}
                    size="sm"
                    label={label}
                    onClick={() => align(k)}
                    disabled={sel.locked}
                    className="flex-1"
                  >
                    <I size={16} />
                  </IconButton>
                ))}
              </div>
            )}
            {sel.kind === 'layer' ? (
              !lockedSel ? (
                <LayerSettings w={sel} onChange={update} media={media} />
              ) : (
                <p className="text-[13.5px] text-text-2">
                  Built-in designs keep this mark. Duplicate the design to remove it.
                </p>
              )
            ) : (
              !readOnly && (
                <WidgetSettings
                  w={sel}
                  themes={themes}
                  goals={goals}
                  onGoalCreated={onGoalCreated}
                  onChange={(w) => update(w)}
                  onRemove={() => remove(sel.id)}
                />
              )
            )}
            {!lockedSel && (
              <div className="grid grid-cols-2 gap-3">
                <Range
                  label="Rotation"
                  value={sel.rotation ?? 0}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v, m) => update({ ...sel, rotation: v }, { merge: m })}
                />
                <Range
                  label="Opacity"
                  value={Math.round((sel.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v, m) => update({ ...sel, opacity: v / 100 }, { merge: m })}
                />
              </div>
            )}
            <div className="border-t border-line pt-4 [&_ul]:max-h-72 [&_ul]:overflow-y-auto">{layers}</div>
          </div>
        ) : (
          <>
            {layers}
            {extra && <div className="border-t border-line pt-4">{extra}</div>}
          </>
        )}
      </aside>
    </div>
  )
}

/** Widgets with their own button under the canvas; the rest are in the "more" menu. */
const QUICK_KINDS: Widget['kind'][] = ['chat', 'goal', 'alerts', 'events']
