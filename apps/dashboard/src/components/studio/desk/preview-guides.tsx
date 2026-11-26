// Guides drawn over the preview's canvas: EBU R95 safe areas, a centre cross, and the mask that
// hides what runs past the canvas. In the app the live picture is a native view over the page,
// so each line and the mask is marked `data-over-preview`: the app leaves the picture out under
// it and the page's own pixels show through (the same way menus lie over the picture).
import { useRef, type CSSProperties, type HTMLAttributes } from 'react'
import { usePreviewHole } from '@ferrocast/ui'

function GuideSpan({ depKey, ...rest }: HTMLAttributes<HTMLSpanElement> & { depKey: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  usePreviewHole(ref, { kind: 'guide', deps: [depKey] })
  return <span ref={ref} {...rest} />
}

export interface Safe {
  action: boolean
  title: boolean
  cross: boolean
}

/** EBU R95: action safe is the inner 93% of the picture, graphics (title) safe the inner 90%. */
export const ACTION_SAFE = 0.93
export const TITLE_SAFE = 0.9
/** A guide line's thickness, px. */
const LINE = 2

export interface GuideLine {
  key: string
  kind: 'action' | 'title' | 'cross'
  /** Percent of the canvas, except `thick` (px). */
  left: number
  top: number
  width: number
  height: number
}

/** The straight lines the guides are made of, as percentages of the canvas box. */
export function guideLines(safe: Safe): GuideLine[] {
  const out: GuideLine[] = []
  const frame = (kind: 'action' | 'title', share: number) => {
    const inset = ((1 - share) / 2) * 100
    const span = share * 100
    out.push(
      { key: `${kind}-t`, kind, left: inset, top: inset, width: span, height: 0 },
      { key: `${kind}-b`, kind, left: inset, top: 100 - inset, width: span, height: 0 },
      { key: `${kind}-l`, kind, left: inset, top: inset, width: 0, height: span },
      { key: `${kind}-r`, kind, left: 100 - inset, top: inset, width: 0, height: span },
    )
  }
  if (safe.action) frame('action', ACTION_SAFE)
  if (safe.title) frame('title', TITLE_SAFE)
  if (safe.cross) {
    out.push(
      { key: 'cross-h', kind: 'cross', left: 0, top: 50, width: 100, height: 0 },
      { key: 'cross-v', kind: 'cross', left: 50, top: 0, width: 0, height: 100 },
    )
  }
  return out
}

const COLOR: Record<GuideLine['kind'], string> = {
  action: '#f5c542',
  title: '#38bdf8',
  cross: '#ffffff',
}

/** The guides, over the canvas box (which is `relative`). Taps pass through. */
export function GuideOverlay({ safe }: { safe: Safe }) {
  const lines = guideLines(safe)
  if (lines.length === 0) return null
  return (
    <div aria-hidden data-guides className="pointer-events-none absolute inset-0">
      {lines.map((l) => {
        const style: CSSProperties = {
          left: `${l.left}%`,
          top: `${l.top}%`,
          width: l.width ? `${l.width}%` : LINE,
          height: l.height ? `${l.height}%` : LINE,
          marginLeft: l.width ? 0 : -LINE / 2,
          marginTop: l.height ? 0 : -LINE / 2,
          background: COLOR[l.kind],
          // A thin dark edge, so a line reads on a light stage and on a bright picture.
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        }
        return (
          <GuideSpan
            key={l.key}
            depKey={`${l.key}:${l.left}:${l.top}:${l.width}:${l.height}`}
            data-over-preview
            data-guide-hole
            data-guide={l.kind}
            style={style}
            className="absolute opacity-80"
          />
        )
      })}
    </div>
  )
}

/** How far the mask reaches past the canvas (px): more than any stage. */
const REACH = 4000

/** Hides what a source shows past the canvas: stage-coloured panels all round the box. */
export function OverflowMask({ on }: { on: boolean }) {
  if (!on) return null
  const base = 'pointer-events-none absolute bg-[var(--fc-stage)]'
  return (
    <div aria-hidden data-overflow-mask className="pointer-events-none absolute inset-0">
      <GuideSpan
        depKey="mask-top"
        data-over-preview
        data-guide-hole
        className={base}
        style={{ left: -REACH, right: -REACH, bottom: '100%', height: REACH }}
      />
      <GuideSpan
        depKey="mask-bottom"
        data-over-preview
        data-guide-hole
        className={base}
        style={{ left: -REACH, right: -REACH, top: '100%', height: REACH }}
      />
      <GuideSpan
        depKey="mask-left"
        data-over-preview
        data-guide-hole
        className={base}
        style={{ top: 0, bottom: 0, right: '100%', width: REACH }}
      />
      <GuideSpan
        depKey="mask-right"
        data-over-preview
        data-guide-hole
        className={base}
        style={{ top: 0, bottom: 0, left: '100%', width: REACH }}
      />
    </div>
  )
}
