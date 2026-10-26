// OBS's Edit Transform: an item's exact place, turn, size, anchor point, bounding box and
// crop. Every change shows in the picture at once; Reset puts back how it was when opened.

import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  BoundingBox,
  Crop,
  LinkSimple,
  LinkSimpleBreak,
  Resize,
} from '@phosphor-icons/react'
import { ENGINE_BOUNDS, type EngineBounds, type EngineTransform } from '@ferrocast/api'
import { Button, Dialog, IconButton, InfoTip, Select, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'

const BOUNDS_LABEL: Record<EngineBounds, string> = {
  none: 'None',
  stretch: 'Stretch to the box',
  fit: 'Fit inside the box',
  fill: 'Fill the box',
  width: 'Fit the width',
  height: 'Fit the height',
  max: 'Shrink only',
}

/** OBS's alignment bits for the nine points, top row first. */
const POINTS: { bits: number; label: string }[] = [
  { bits: 5, label: 'Top left' },
  { bits: 4, label: 'Top' },
  { bits: 6, label: 'Top right' },
  { bits: 1, label: 'Left' },
  { bits: 0, label: 'Middle' },
  { bits: 2, label: 'Right' },
  { bits: 9, label: 'Bottom left' },
  { bits: 8, label: 'Bottom' },
  { bits: 10, label: 'Bottom right' },
]

/** The size the item shows at (its cropped size times its scale). */
export function shownSize(t: EngineTransform): { w: number; h: number } {
  const cw = Math.max(0, t.width - t.crop_left - t.crop_right)
  const ch = Math.max(0, t.height - t.crop_top - t.crop_bottom)
  return { w: cw * Math.abs(t.scale_x), h: ch * Math.abs(t.scale_y) }
}

/** The scale that shows the item `w`×`h` big, keeping flips (null for a source with no size). */
export function scaleFor(
  t: EngineTransform,
  w: number,
  h: number,
): { x: number; y: number } | null {
  const cw = t.width - t.crop_left - t.crop_right
  const ch = t.height - t.crop_top - t.crop_bottom
  if (cw <= 0 || ch <= 0 || !(w > 0) || !(h > 0)) return null
  return { x: (Math.sign(t.scale_x) || 1) * (w / cw), y: (Math.sign(t.scale_y) || 1) * (h / ch) }
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** A number field that lets a half-typed number ("-", "1.") sit until it's whole. */
function Num({
  label,
  value,
  unit,
  onChange,
  disabled,
  min,
}: {
  label: string
  value: number
  unit: string
  onChange: (n: number) => void
  disabled?: boolean
  min?: number
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', disabled && 'opacity-50')}>
      <span className="text-[13px] font-bold text-text-2">{label}</span>
      <span className="flex h-9 items-center rounded-control border border-line-strong bg-inset pr-2.5 focus-within:border-accent-text focus-within:shadow-[0_0_0_3px_var(--fc-accent-soft)]">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          aria-label={label}
          value={text ?? String(round(value))}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (
              e.target.value.trim() !== '' &&
              Number.isFinite(n) &&
              (min === undefined || n >= min)
            )
              onChange(n)
          }}
          onBlur={() => setText(null)}
          className="h-full w-full min-w-0 bg-transparent pl-2.5 text-[15px] font-semibold text-text tabular-nums outline-none"
        />
        <span aria-hidden className="text-[13px] font-semibold text-text-3">
          {unit}
        </span>
      </span>
    </label>
  )
}

/** Nine points to pick from, laid out as they sit on the item. */
function PointPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (bits: number) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid w-[96px] grid-cols-3 gap-1">
      {POINTS.map((p) => {
        const on = p.bits === value
        return (
          <button
            key={p.bits}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.label}
            title={p.label}
            disabled={disabled}
            onClick={() => onChange(p.bits)}
            className={cx(
              'grid size-[28px] place-items-center rounded-[7px] border transition-colors disabled:opacity-40',
              on
                ? 'border-accent-text bg-accent-soft'
                : 'border-line bg-surface-2 hover:border-line-strong',
            )}
          >
            <span
              aria-hidden
              className={cx('size-[7px] rounded-full', on ? 'bg-accent-text' : 'bg-text-3')}
            />
          </button>
        )
      })}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  tip,
  children,
}: {
  icon: typeof Resize
  title: string
  tip?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-2 p-3.5">
      <h3 className="m-0 flex items-center gap-2 font-display text-[15px] font-extrabold text-text">
        <Icon size={17} weight="bold" className="text-accent-text" aria-hidden />
        {title}
        {tip && <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>}
      </h3>
      {children}
    </section>
  )
}

export function TransformDialog({
  target,
  onClose,
}: {
  target: { scene: string; id: number; name: string } | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      size="lg"
      title={target ? `Edit transform: ${target.name}` : 'Edit transform'}
    >
      {target && <Editor key={`${target.scene}:${target.id}`} target={target} onClose={onClose} />}
    </Dialog>
  )
}

function Editor({
  target,
  onClose,
}: {
  target: { scene: string; id: number }
  onClose: () => void
}) {
  const { api, items } = useDesk()
  const { run } = useAction()
  const loaded = useResource(() => api.transform(target.scene, target.id), [api, target])
  const [t, setT] = useState<EngineTransform | null>(null)
  const [keep, setKeep] = useState(true)
  const first = useRef<EngineTransform | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The change still waiting for its moment; sent at once if the dialog closes first.
  const pending = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (loaded.data && !first.current) {
      first.current = loaded.data
      setT(loaded.data)
    }
  }, [loaded.data])
  // Sends the newest one a moment after typing stops; the picture follows.
  const push = (next: EngineTransform, now = false) => {
    setT(next)
    if (timer.current) clearTimeout(timer.current)
    const go = () => {
      pending.current = null
      void run('transform', () => api.setTransform(target.scene, target.id, next)).then((item) => {
        if (item)
          items.set((prev) =>
            (prev ?? []).map((i) =>
              i.id === item.id && item.frame ? { ...i, frame: item.frame } : i,
            ),
          )
      })
    }
    if (now) go()
    else {
      pending.current = go
      timer.current = setTimeout(go, 150)
    }
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      pending.current?.()
    },
    [],
  )

  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!t) return <Skeleton className="h-80" />
  const set = (patch: Partial<EngineTransform>) => push({ ...t, ...patch })
  const boxed = t.bounds !== 'none'
  // With a bounding box, the box is its size (shown, not edited here).
  const size = boxed ? { w: t.bounds_width, h: t.bounds_height } : shownSize(t)
  const resize = (w: number, h: number) => {
    const s = scaleFor(t, w, h)
    if (s) set({ scale_x: s.x, scale_y: s.y })
  }
  const ratio = size.h > 0 ? size.w / size.h : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Section icon={ArrowsOutCardinal} title="Position">
          <div className="grid grid-cols-2 gap-2.5">
            <Num label="X" unit="px" value={t.x} onChange={(x) => set({ x })} />
            <Num label="Y" unit="px" value={t.y} onChange={(y) => set({ y })} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-bold text-text-2">Anchor point</span>
              <PointPicker
                label="Anchor point"
                value={t.alignment}
                onChange={(alignment) => set({ alignment })}
              />
            </div>
            <p className="m-0 text-[13.5px] font-medium text-text-3">
              The point of it that sits at X, Y and that it turns around.
            </p>
          </div>
        </Section>
        <Section icon={ArrowClockwise} title="Rotation">
          <Num
            label="Turn"
            unit="°"
            value={t.rotation}
            onChange={(r) => set({ rotation: ((r % 360) + 360) % 360 })}
          />
          <div className="flex gap-2">
            {[
              { label: 'Turn left', d: -90, icon: ArrowCounterClockwise },
              { label: 'Turn right', d: 90, icon: ArrowClockwise },
            ].map(({ label, d, icon: I }) => (
              <Button
                key={label}
                type="button"
                variant="secondary"
                onClick={() => set({ rotation: (((t.rotation + d) % 360) + 360) % 360 })}
              >
                <I size={15} weight="bold" /> {label}
              </Button>
            ))}
          </div>
        </Section>
        <Section
          icon={Resize}
          title="Size"
          {...(boxed ? { tip: 'A bounding box sets the size; choose None to size it here.' } : {})}
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Num
              label="Width"
              unit="px"
              min={1}
              disabled={boxed}
              value={size.w}
              onChange={(w) => resize(w, keep ? w / ratio : size.h)}
            />
            <IconButton
              size="sm"
              label={keep ? 'Width and height change together' : 'Width and height change apart'}
              aria-pressed={keep}
              disabled={boxed}
              onClick={() => setKeep(!keep)}
              className="mb-1"
            >
              {keep ? <LinkSimple size={16} weight="bold" /> : <LinkSimpleBreak size={16} />}
            </IconButton>
            <Num
              label="Height"
              unit="px"
              min={1}
              disabled={boxed}
              value={size.h}
              onChange={(h) => resize(keep ? h * ratio : size.w, h)}
            />
          </div>
          <p className="m-0 text-[13.5px] font-medium text-text-3 tabular-nums">
            Its own size: {t.width}×{t.height}
          </p>
        </Section>
        <Section
          icon={Crop}
          title="Crop"
          tip="Pixels cut off each side of the source, before it's scaled."
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Num
              label="Left"
              unit="px"
              min={0}
              value={t.crop_left}
              onChange={(v) => set({ crop_left: Math.round(v) })}
            />
            <Num
              label="Right"
              unit="px"
              min={0}
              value={t.crop_right}
              onChange={(v) => set({ crop_right: Math.round(v) })}
            />
            <Num
              label="Top"
              unit="px"
              min={0}
              value={t.crop_top}
              onChange={(v) => set({ crop_top: Math.round(v) })}
            />
            <Num
              label="Bottom"
              unit="px"
              min={0}
              value={t.crop_bottom}
              onChange={(v) => set({ crop_bottom: Math.round(v) })}
            />
          </div>
        </Section>
        <Section
          icon={BoundingBox}
          title="Bounding box"
          tip="A box the item is fitted into, so it keeps a fixed size whatever the source sends."
        >
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-bold text-text-2">Kind</span>
            <Select
              className="h-9! text-[15px]"
              value={t.bounds}
              onChange={(e) => {
                const bounds = e.target.value as EngineBounds
                // A new box starts at the size it shows now.
                const start =
                  t.bounds === 'none' &&
                  bounds !== 'none' &&
                  (t.bounds_width < 1 || t.bounds_height < 1)
                    ? { bounds_width: round(size.w), bounds_height: round(size.h) }
                    : {}
                set({ bounds, ...start })
              }}
            >
              {ENGINE_BOUNDS.map((b) => (
                <option key={b} value={b}>
                  {BOUNDS_LABEL[b]}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <Num
              label="Box width"
              unit="px"
              min={0}
              disabled={!boxed}
              value={t.bounds_width}
              onChange={(v) => set({ bounds_width: v })}
            />
            <Num
              label="Box height"
              unit="px"
              min={0}
              disabled={!boxed}
              value={t.bounds_height}
              onChange={(v) => set({ bounds_height: v })}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-bold text-text-2">Inside the box</span>
              <PointPicker
                label="Where it sits inside the box"
                value={t.bounds_alignment}
                disabled={!boxed}
                onChange={(bounds_alignment) => set({ bounds_alignment })}
              />
            </div>
          </div>
        </Section>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button
          type="button"
          variant="ghost"
          className="mr-auto"
          disabled={!first.current}
          onClick={() => first.current && push(first.current, true)}
        >
          <ArrowCounterClockwise size={15} weight="bold" /> Undo changes
        </Button>
        <Button type="button" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
