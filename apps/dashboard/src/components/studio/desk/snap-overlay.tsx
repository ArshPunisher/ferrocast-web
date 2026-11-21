// What the editor draws over the preview while a source is dragged or sized: the guide lines it
// snapped to, the distance to its nearest neighbours, the box dragged on empty canvas to pick
// several, and the one box round several picked sources with its handles. Like the safe areas,
// each is marked `data-over-preview` so the app leaves its native picture out under it and the
// page's own pixels show through.
import { useSyncExternalStore, type CSSProperties } from 'react'
import { cx } from '@ferrocast/ui'
import type { Gap, Guide, Rect } from './snap'

/** What is on show, and in which canvas box (a stage can hold two: the wide and the tall). */
export interface Hints {
  owner: Element | null
  guides: Guide[]
  gaps: Gap[]
  marquee: Rect | null
}

const NONE: Hints = { owner: null, guides: [], gaps: [], marquee: null }
let hints: Hints = NONE
const listeners = new Set<() => void>()

export function setHints(next: Hints): void {
  hints = next
  for (const l of listeners) l()
}

export function clearHints(): void {
  if (hints !== NONE) setHints(NONE)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useHints(): Hints {
  return useSyncExternalStore(
    subscribe,
    () => hints,
    () => NONE,
  )
}

/** A guide line's thickness, screen px. */
const LINE = 1.5

/** Canvas pixels as a share of the canvas box. */
const pct = (v: number, of: number) => `${(v / of) * 100}%`

const edge = '0 0 0 1px rgba(0,0,0,0.35)'

/**
 * The guides and gaps (and the marquee) while something is being dragged in `boxRef`'s canvas.
 * Taps pass through.
 */
export function SnapOverlay({
  boxRef,
  canvas,
}: {
  boxRef: React.RefObject<Element | null>
  canvas: { width: number; height: number } | null
}) {
  const h = useHints()
  if (!canvas || !h.owner || h.owner !== boxRef.current) return null
  const { width: W, height: H } = canvas
  return (
    <div aria-hidden data-snap-hints className="pointer-events-none absolute inset-0">
      {h.guides.map((g) => {
        const style: CSSProperties =
          g.axis === 'x'
            ? {
                left: pct(g.at, W),
                top: pct(g.from, H),
                height: pct(g.to - g.from, H),
                width: LINE,
                marginLeft: -LINE / 2,
              }
            : {
                top: pct(g.at, H),
                left: pct(g.from, W),
                width: pct(g.to - g.from, W),
                height: LINE,
                marginTop: -LINE / 2,
              }
        return (
          <span
            key={`${g.axis}${g.at}${g.kind}`}
            data-over-preview
            data-guide-hole
            data-snap-guide={g.axis}
            data-snap-kind={g.kind}
            style={{ ...style, boxShadow: edge }}
            className="absolute bg-[var(--fc-arc)]"
          />
        )
      })}
      {h.gaps.map((g) => {
        const horizontal = g.axis === 'x'
        const line: CSSProperties = horizontal
          ? {
              left: pct(g.from, W),
              width: pct(g.to - g.from, W),
              top: pct(g.at, H),
              height: LINE,
              marginTop: -LINE / 2,
            }
          : {
              top: pct(g.from, H),
              height: pct(g.to - g.from, H),
              left: pct(g.at, W),
              width: LINE,
              marginLeft: -LINE / 2,
            }
        const middle: CSSProperties = horizontal
          ? { left: pct((g.from + g.to) / 2, W), top: pct(g.at, H) }
          : { left: pct(g.at, W), top: pct((g.from + g.to) / 2, H) }
        return (
          <span key={`gap-${g.axis}-${g.from}`}>
            <span
              data-over-preview
              data-guide-hole
              data-snap-gap={g.axis}
              style={{ ...line, boxShadow: edge }}
              className="absolute bg-[var(--fc-arc)]"
            />
            <span
              data-over-preview
              data-guide-hole
              data-snap-gap-label={g.axis}
              style={middle}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface-1 px-1.5 py-px font-mono text-[11px] leading-none font-bold text-text tabular-nums shadow-[var(--fc-shadow-1)]"
            >
              {Math.round(g.px)}
            </span>
          </span>
        )
      })}
      {h.marquee && (
        <span
          data-over-preview
          data-guide-hole
          data-marquee
          style={{
            left: pct(Math.min(h.marquee.left, h.marquee.right), W),
            top: pct(Math.min(h.marquee.top, h.marquee.bottom), H),
            width: pct(Math.abs(h.marquee.right - h.marquee.left), W),
            height: pct(Math.abs(h.marquee.bottom - h.marquee.top), H),
          }}
          className="absolute border border-dashed border-[var(--fc-arc)] bg-accent-soft"
        />
      )}
    </div>
  )
}

/** The eight handles of a box round several picked sources, as a share of the canvas box. */
const HANDLES: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
]

/**
 * The one box round the sources picked together, drawn dashed with eight handles. It is only a
 * picture: the editor's pointer handling does the grabbing (`useStageEdit`).
 */
export function GroupBox({
  rect,
  canvas,
  className,
}: {
  rect: Rect | null
  canvas: { width: number; height: number } | null
  className?: string
}) {
  if (!rect || !canvas) return null
  const { width: W, height: H } = canvas
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  return (
    <div
      aria-hidden
      data-group-box
      className={cx('pointer-events-none absolute inset-0', className)}
    >
      <span
        data-over-preview
        data-guide-hole
        style={{
          left: pct(rect.left, W),
          top: pct(rect.top, H),
          width: pct(w, W),
          height: pct(h, H),
        }}
        className="absolute border border-dashed border-[var(--fc-arc)]"
      />
      {HANDLES.map(([u, v]) => (
        <span
          key={`${u}-${v}`}
          data-over-preview
          data-guide-hole
          data-group-handle={`${u},${v}`}
          style={{ left: pct(rect.left + u * w, W), top: pct(rect.top + v * h, H) }}
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[var(--fc-arc)] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        />
      ))}
    </div>
  )
}
