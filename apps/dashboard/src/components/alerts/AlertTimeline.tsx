import { useRef } from 'react'
import {
  MAX_DURATION_MS,
  MAX_IN_MS,
  MAX_OUT_MS,
  MAX_TEXT_DELAY_MS,
  MIN_DURATION_MS,
  defaultAlertAnim,
  type AlertAnim,
  type AlertIn,
  type AlertOut,
  type TextAnim,
} from '@ferrocast/api'
import { Field, Select } from '@ferrocast/ui'

const IN_OPTIONS: { value: AlertIn; label: string }[] = [
  { value: 'fade', label: 'Fade in' },
  { value: 'rise', label: 'Liquid rise' },
  { value: 'drop', label: 'Drop in' },
  { value: 'slide_left', label: 'Slide from left' },
  { value: 'slide_right', label: 'Slide from right' },
  { value: 'zoom', label: 'Zoom in' },
  { value: 'pop', label: 'Pop' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'flip', label: 'Flip' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'magnet', label: 'Magnet pull' },
  { value: 'none', label: 'Instant (none)' },
]

const OUT_OPTIONS: { value: AlertOut; label: string }[] = [
  { value: 'fade', label: 'Fade out' },
  { value: 'sink', label: 'Sink' },
  { value: 'lift', label: 'Lift' },
  { value: 'slide_left', label: 'Slide left' },
  { value: 'slide_right', label: 'Slide right' },
  { value: 'zoom', label: 'Zoom out' },
  { value: 'shrink', label: 'Shrink' },
  { value: 'flip', label: 'Flip' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'none', label: 'Instant (none)' },
]

const TEXT_OPTIONS: { value: TextAnim; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'wave', label: 'Wave' },
  { value: 'wiggle', label: 'Wiggle' },
  { value: 'bounce', label: 'Letter bounce' },
  { value: 'pop', label: 'Letter pop' },
  { value: 'type', label: 'Typewriter' },
  { value: 'glow', label: 'Glow pulse' },
  { value: 'cascade', label: 'Cascade' },
  { value: 'pop_wave', label: 'Pop wave' },
  { value: 'shine', label: 'Shine' },
  { value: 'neon', label: 'Neon glow' },
  { value: 'rgb', label: 'RGB cycle' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'spin', label: 'Letter spin' },
]

const MIN_HOLD_MS = 100

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function roundStep(v: number, step: number): number {
  return Math.round(v / step) * step
}

export function AlertTimeline({
  durationMs,
  anim: animProp,
  onChange,
}: {
  durationMs: number
  anim?: AlertAnim
  onChange: (durationMs: number, anim: AlertAnim) => void
}) {
  const anim = animProp ?? defaultAlertAnim()
  const trackRef = useRef<HTMLDivElement>(null)
  const dragTarget = useRef<'in' | 'out' | 'text' | null>(null)

  const total = clamp(durationMs, MIN_DURATION_MS, MAX_DURATION_MS)
  const maxIn = Math.min(MAX_IN_MS, Math.max(0, total - anim.out_ms - MIN_HOLD_MS))
  const maxOut = Math.min(MAX_OUT_MS, Math.max(0, total - anim.in_ms - MIN_HOLD_MS))
  const maxTextDelay = Math.min(MAX_TEXT_DELAY_MS, Math.max(0, total - MIN_HOLD_MS))
  const holdMs = Math.max(0, total - anim.in_ms - anim.out_ms)

  const inPct = (anim.in_ms / total) * 100
  const outPct = (anim.out_ms / total) * 100
  const holdPct = Math.max(0, 100 - inPct - outPct)
  const textPct = clamp((anim.text_delay_ms / total) * 100, 0, 100)

  const updateIn = (ms: number) => {
    const nextIn = clamp(roundStep(ms, 50), 0, maxIn)
    onChange(total, { ...anim, in_ms: nextIn })
  }

  const updateOut = (ms: number) => {
    const nextOut = clamp(roundStep(ms, 50), 0, maxOut)
    onChange(total, { ...anim, out_ms: nextOut })
  }

  const updateTextDelay = (ms: number) => {
    const nextDelay = clamp(roundStep(ms, 50), 0, maxTextDelay)
    onChange(total, { ...anim, text_delay_ms: nextDelay })
  }

  const updateDuration = (nextDuration: number) => {
    const d = clamp(roundStep(nextDuration, 500), MIN_DURATION_MS, MAX_DURATION_MS)
    let nextIn = anim.in_ms
    let nextOut = anim.out_ms
    if (nextIn + nextOut > d - MIN_HOLD_MS) {
      const budget = Math.max(0, d - MIN_HOLD_MS)
      const ratio = nextIn / Math.max(1, nextIn + nextOut)
      nextIn = roundStep(budget * ratio, 50)
      nextOut = Math.max(0, budget - nextIn)
    }
    const nextTextDelay = Math.min(anim.text_delay_ms, Math.max(0, d - MIN_HOLD_MS))
    onChange(d, { ...anim, in_ms: nextIn, out_ms: nextOut, text_delay_ms: nextTextDelay })
  }

  const updateFromPointer = (clientX: number) => {
    const el = trackRef.current
    if (!el || !dragTarget.current) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    const atMs = ratio * total
    if (dragTarget.current === 'in') updateIn(atMs)
    else if (dragTarget.current === 'out') updateOut(total - atMs)
    else if (dragTarget.current === 'text') updateTextDelay(atMs)
  }

  const handleSliderKey = (
    e: React.KeyboardEvent,
    current: number,
    min: number,
    max: number,
    smallStep: number,
    largeStep: number,
    apply: (next: number) => void,
  ) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      apply(clamp(current + (e.shiftKey ? largeStep : smallStep), min, max))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      apply(clamp(current - (e.shiftKey ? largeStep : smallStep), min, max))
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      apply(clamp(current + largeStep, min, max))
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      apply(clamp(current - largeStep, min, max))
    } else if (e.key === 'Home') {
      e.preventDefault()
      apply(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      apply(max)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-control border border-line bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13.5px] font-bold text-text">Timeline & text effects</span>
        <span className="font-mono text-[12px] text-text-2 tabular-nums">
          {(total / 1000).toFixed(1)}s total
        </span>
      </div>

      <div className="relative pt-2 pb-1 select-none">
        <div
          ref={trackRef}
          onPointerMove={(e) => updateFromPointer(e.clientX)}
          onPointerUp={() => {
            dragTarget.current = null
          }}
          onPointerCancel={() => {
            dragTarget.current = null
          }}
          className="relative flex h-9 w-full overflow-visible rounded-control border border-line bg-surface-1 p-1"
        >
          <div
            style={{ width: `${inPct}%` }}
            className="h-full min-w-[4px] rounded-l-[6px] bg-accent/85 transition-[width] duration-75"
            title={`In: ${anim.in_ms} ms`}
          />
          <div
            style={{ width: `${holdPct}%` }}
            className="flex h-full min-w-0 items-center justify-center bg-surface-3/80 px-1 text-[11px] font-semibold text-text-2"
            title={`Hold: ${holdMs} ms`}
          >
            {holdPct > 18 && (
              <span className="truncate font-mono tabular-nums">
                Hold {(holdMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <div
            style={{ width: `${outPct}%` }}
            className="h-full min-w-[4px] rounded-r-[6px] bg-arc/85 transition-[width] duration-75"
            title={`Out: ${anim.out_ms} ms`}
          />

          <div
            role="slider"
            tabIndex={0}
            aria-label="Entrance duration"
            aria-valuemin={0}
            aria-valuemax={maxIn}
            aria-valuenow={anim.in_ms}
            aria-valuetext={`${anim.in_ms} ms`}
            data-timeline-handle="in"
            style={{ left: `${inPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault()
              dragTarget.current = 'in'
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onKeyDown={(e) => handleSliderKey(e, anim.in_ms, 0, maxIn, 50, 250, updateIn)}
            className="absolute top-0 bottom-0 z-10 -ml-2 flex w-4 cursor-ew-resize touch-none items-center justify-center rounded focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <span className="h-6 w-2 rounded-full border border-white/80 bg-accent shadow-1" />
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Exit duration"
            aria-valuemin={0}
            aria-valuemax={maxOut}
            aria-valuenow={anim.out_ms}
            aria-valuetext={`${anim.out_ms} ms`}
            data-timeline-handle="out"
            style={{ left: `${100 - outPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault()
              dragTarget.current = 'out'
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onKeyDown={(e) => handleSliderKey(e, anim.out_ms, 0, maxOut, 50, 250, updateOut)}
            className="absolute top-0 bottom-0 z-10 -ml-2 flex w-4 cursor-ew-resize touch-none items-center justify-center rounded focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <span className="h-6 w-2 rounded-full border border-white/80 bg-arc shadow-1" />
          </div>

          {anim.text !== 'none' && (
            <div
              role="slider"
              tabIndex={0}
              aria-label="Text effect delay"
              aria-valuemin={0}
              aria-valuemax={maxTextDelay}
              aria-valuenow={anim.text_delay_ms}
              aria-valuetext={`${anim.text_delay_ms} ms`}
              data-timeline-handle="text"
              style={{ left: `${textPct}%` }}
              onPointerDown={(e) => {
                e.preventDefault()
                dragTarget.current = 'text'
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onKeyDown={(e) =>
                handleSliderKey(e, anim.text_delay_ms, 0, maxTextDelay, 50, 250, updateTextDelay)
              }
              className="absolute -top-2 z-20 -ml-2 flex h-5 w-4 cursor-ew-resize touch-none items-center justify-center rounded focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              title={`Text effect starts at ${anim.text_delay_ms} ms`}
            >
              <span className="h-3 w-3 rotate-45 rounded-[2px] border border-white bg-text shadow-1" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-text-2 tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          In: {anim.in_ms} ms
        </span>
        <span>Hold: {holdMs} ms</span>
        {anim.text !== 'none' && <span>Text delay: {anim.text_delay_ms} ms</span>}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-arc" aria-hidden="true" />
          Out: {anim.out_ms} ms
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[12.5px] font-semibold text-text-2">
          <label htmlFor="alert-total-duration">On screen duration</label>
          <span className="font-mono tabular-nums">{(total / 1000).toFixed(1)} s</span>
        </div>
        <input
          id="alert-total-duration"
          type="range"
          min={MIN_DURATION_MS}
          max={MAX_DURATION_MS}
          step={500}
          value={total}
          aria-label="Total alert duration"
          aria-valuetext={`${(total / 1000).toFixed(1)} seconds`}
          onChange={(e) => updateDuration(Number(e.target.value))}
          className="h-8 w-full"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Entrance">
          {(p) => (
            <Select
              {...p}
              value={anim.in}
              onChange={(e) => onChange(total, { ...anim, in: e.target.value as AlertIn })}
            >
              {IN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Text effect">
          {(p) => (
            <Select
              {...p}
              value={anim.text}
              onChange={(e) => onChange(total, { ...anim, text: e.target.value as TextAnim })}
            >
              {TEXT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Exit">
          {(p) => (
            <Select
              {...p}
              value={anim.out}
              onChange={(e) => onChange(total, { ...anim, out: e.target.value as AlertOut })}
            >
              {OUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </div>
  )
}
