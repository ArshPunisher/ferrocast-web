import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import {
  ANIM_IN_LABEL,
  ANIM_OUT_LABEL,
  SOUND_LABEL,
  TEXT_ANIM_LABEL,
  type AlertLook,
} from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import type { SetLook } from './inspector'
import type { StageTick } from './DesignStage'

/** How long each built-in sound rings, for the sound lane. */
const SOUND_MS: Record<string, number> = {
  none: 0,
  chime: 820,
  coin: 450,
  whoosh: 600,
  boing: 520,
  bass: 650,
  sparkle: 700,
}

type Handle = 'in' | 'out' | 'end' | 'delay'
const LIMITS: Record<Handle, [number, number, number]> = {
  in: [150, 1500, 50],
  out: [150, 1500, 50],
  end: [2000, 20_000, 500],
  delay: [0, 3000, 100],
}

/**
 * The alert's timing as lanes (alert in, hold, out; text; sound; text to speech) with
 * draggable edges. Every edge is also a slider: focus it and use the arrow keys.
 */
export function Timeline({
  look,
  set,
  tick,
  onCommit,
}: {
  look: AlertLook
  set: SetLook
  tick: StageTick | null
  onCommit: () => void
}) {
  const lane = useRef<HTMLDivElement>(null)
  const drag = useRef<Handle | null>(null)
  const total = look.duration_ms
  const span = Math.max(total + 600, 4000)
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / span) * 100))}%`
  const inMs = look.anim.in_ms
  const outMs = look.anim.out_ms
  const hold = Math.max(200, total - inMs - outMs)
  const textStart = inMs * 0.35 + look.anim.text_delay_ms
  const clamp = (h: Handle, v: number) => {
    const [lo, hi, step] = LIMITS[h]
    return Math.round(Math.min(hi, Math.max(lo, v)) / step) * step
  }
  const apply = (h: Handle, ms: number, merge: boolean) => {
    if (h === 'in')
      set(
        { anim: { ...look.anim, in_ms: clamp('in', Math.min(ms, total - outMs - 300)) } },
        { merge },
      )
    if (h === 'out')
      set(
        { anim: { ...look.anim, out_ms: clamp('out', Math.min(total - ms, total - inMs - 300)) } },
        { merge },
      )
    if (h === 'end') set({ duration_ms: clamp('end', Math.max(ms, inMs + outMs + 500)) }, { merge })
    if (h === 'delay')
      set({ anim: { ...look.anim, text_delay_ms: clamp('delay', ms - inMs * 0.35) } }, { merge })
  }
  const at = (e: PointerEvent) => {
    const r = lane.current?.getBoundingClientRect()
    return r && r.width ? ((e.clientX - r.left) / r.width) * span : 0
  }
  const onDown = (h: Handle) => (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = h
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onMove = (e: PointerEvent) => {
    if (drag.current) apply(drag.current, at(e), true)
  }
  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    onCommit()
  }
  const onKey = (h: Handle) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const d = (e.key === 'ArrowRight' ? 1 : -1) * LIMITS[h][2] * (e.shiftKey ? 4 : 1)
    if (h === 'in') apply('in', inMs + d, false)
    if (h === 'out') apply('out', total - outMs - d, false)
    if (h === 'end') apply('end', total + d, false)
    if (h === 'delay') apply('delay', textStart + d, false)
  }
  const handle = (h: Handle, pos: number, label: string, now: number, text: string) => (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={LIMITS[h][0]}
      aria-valuemax={LIMITS[h][1]}
      aria-valuenow={now}
      aria-valuetext={text}
      onPointerDown={onDown(h)}
      onKeyDown={onKey(h)}
      className="group absolute top-[-3px] bottom-[-3px] z-[3] w-4 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-none"
      style={{ left: pct(pos) }}
    >
      <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-[3px] bg-text shadow-[0_0_0_2px_var(--fc-bg)] group-hover:w-1.5 group-focus-visible:w-1.5 group-focus-visible:shadow-[var(--fc-focus)]" />
    </button>
  )
  const head =
    tick && tick.phase !== 'idle' ? (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-[4] w-0.5 -translate-x-px bg-danger"
        style={{ left: pct(tick.t) }}
      />
    ) : null
  const seg = (cls: string, from: number, len: number, label: string) => (
    <div
      className={cx(
        'absolute inset-y-0 flex items-center overflow-hidden rounded-[6px] px-2 font-mono text-[12px] font-semibold whitespace-nowrap',
        cls,
      )}
      style={{ left: pct(from), width: pct(len) }}
    >
      {label}
    </div>
  )
  const sound = look.sound.ref ? 1200 : (SOUND_MS[look.sound.builtin] ?? 0)
  const rows: [string, React.ReactNode][] = [
    [
      'Alert',
      <>
        {seg(
          'bg-[color-mix(in_srgb,var(--fc-accent)_85%,transparent)] text-[#1a0e00]',
          0,
          inMs,
          ANIM_IN_LABEL[look.anim.in],
        )}
        {seg(
          'bg-surface-3 text-text-2 shadow-[inset_0_0_0_1px_var(--fc-line-strong)]',
          inMs,
          hold,
          'Hold',
        )}
        {seg(
          'bg-[color-mix(in_srgb,var(--fc-arc)_80%,transparent)] text-[#00202b]',
          inMs + hold,
          outMs,
          ANIM_OUT_LABEL[look.anim.out],
        )}
        {handle('in', inMs, 'Entrance length', inMs, `${inMs} ms`)}
        {handle('out', inMs + hold, 'Exit length', outMs, `${outMs} ms`)}
        {handle('end', total, 'Alert length', total, `${(total / 1000).toFixed(1)} seconds`)}
      </>,
    ],
    [
      'Text',
      <>
        {seg(
          'bg-accent-soft text-accent-text shadow-[inset_0_0_0_1px_var(--fc-accent-line)]',
          textStart,
          Math.max(0, inMs + hold - textStart),
          TEXT_ANIM_LABEL[look.anim.text],
        )}
        {handle(
          'delay',
          textStart,
          'Text delay',
          look.anim.text_delay_ms,
          `${(look.anim.text_delay_ms / 1000).toFixed(1)} seconds`,
        )}
      </>,
    ],
    [
      'Sound',
      sound
        ? seg(
            'bg-[color-mix(in_srgb,var(--fc-accent)_16%,transparent)] text-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fc-accent)_45%,transparent)]',
            0,
            sound,
            `${look.sound.ref ? 'Your sound' : SOUND_LABEL[look.sound.builtin]} ${look.sound.volume}%`,
          )
        : null,
    ],
  ]
  if (look.tts.enabled)
    rows.push([
      'TTS',
      seg(
        'bg-surface-3 text-text-2 shadow-[inset_0_0_0_1px_var(--fc-line-strong)]',
        sound + 150,
        2600,
        'Reads the message',
      ),
    ])
  const ruler: number[] = []
  for (let s = 0; s * 1000 <= span; s += span > 12_000 ? 2 : 1) ruler.push(s)
  return (
    <section
      aria-label="Timeline"
      className="border-t border-line bg-surface-1 px-4 pt-2.5 pb-3 select-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="mb-1.5 flex items-center gap-3 text-[13px] text-text-3">
        <b className="font-semibold text-text">Timeline</b>
        <span>
          {(total / 1000).toFixed(1)} s total, text after{' '}
          {(look.anim.text_delay_ms / 1000).toFixed(1)} s
        </span>
        <span className="ml-auto hidden lg:inline">
          Drag an edge, or focus it and use the arrow keys
        </span>
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 sm:grid-cols-[64px_minmax(0,1fr)]">
        <span />
        <div className="relative h-4 font-mono text-[10.5px] text-text-3">
          {ruler.map((s) => (
            <span
              key={s}
              className={cx('absolute top-0', s ? '-translate-x-1/2' : '')}
              style={{ left: pct(s * 1000) }}
            >
              {s}s
            </span>
          ))}
        </div>
        {rows.map(([label, content], i) => (
          <div key={label} className="contents">
            <span className="font-mono text-[12px] leading-[22px] font-semibold text-text-3">
              {label}
            </span>
            <div
              ref={i === 0 ? lane : undefined}
              className="relative h-[22px] rounded-[6px] bg-inset"
            >
              {content}
              {head}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
