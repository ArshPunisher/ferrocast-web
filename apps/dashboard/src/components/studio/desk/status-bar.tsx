// The Studio's status bar along the bottom, like OBS's: messages on the left, then the stream
// and recording times, CPU, frame rate, dropped frames and upload. A click opens Stats.

import { useEffect, useRef, useState } from 'react'
import { type EngineStats } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { useDesk, useEngine } from './common'
import { StatsDialog } from './stats-panel'

/** What the bars show between engine reads: the upload rate and when the stream began. */
export interface Health {
  /** Upload in kbit/s, or null when not streaming. */
  kbps: number | null
  /** When the stream went live (ms), or null. */
  since: number | null
  /** The time of the last read (ms). */
  now: number
  /** Forgets the upload rate (the stream started or ended). */
  reset: () => void
}

/** Reads the engine once a second into the desk's stats, working out the upload rate. */
export function useHealth(setStats: (s: EngineStats) => void): Health {
  const api = useEngine()
  const last = useRef<{ bytes: number; at: number } | null>(null)
  const [kbps, setKbps] = useState<number | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let alive = true
    const read = async () => {
      try {
        const v = await api.stats()
        if (!alive) return
        setStats(v)
        const t = Date.now()
        setNow(t)
        const st = v.stream
        if (st && last.current && t > last.current.at) {
          setKbps(Math.round(((st.bytes - last.current.bytes) * 8) / (t - last.current.at)))
        } else if (!st) setKbps(null)
        last.current = st ? { bytes: st.bytes, at: t } : null
        setSince((x) => (st?.active ? (x ?? t) : null))
      } catch {
        // The next read tries again.
      }
    }
    void read()
    const t = setInterval(() => void read(), 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, setStats])
  return {
    kbps,
    since,
    now,
    reset: () => {
      last.current = null
      setKbps(null)
    },
  }
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [s / 3600, (s / 60) % 60, s % 60]
    .map((n) => String(Math.floor(n)).padStart(2, '0'))
    .join(':')
}

/** Dropped frames as OBS shows them: the count and its share of all sent. */
export function droppedText(dropped: number, frames: number): string {
  const pct = frames > 0 ? (dropped / frames) * 100 : 0
  return `${dropped} (${pct.toFixed(1)}%)`
}

function Cell({
  label,
  children,
  tone,
  className,
}: {
  label: string
  children: React.ReactNode
  tone?: 'live' | 'warn' | 'danger' | undefined
  className?: string | undefined
}) {
  return (
    <span
      className={cx(
        'inline-flex h-full items-center gap-1.5 border-l border-line px-3 whitespace-nowrap',
        className,
      )}
    >
      <span className="text-text-3">{label}</span>
      <b
        className={cx(
          'font-mono font-semibold tabular-nums',
          tone === 'live'
            ? 'text-danger'
            : tone === 'warn'
              ? 'text-warn'
              : tone === 'danger'
                ? 'text-danger'
                : 'text-text',
        )}
      >
        {children}
      </b>
    </span>
  )
}

export function StatusBar({ health }: { health: Health }) {
  const { stats } = useDesk()
  const [open, setOpen] = useState(false)
  const stream = stats?.stream ?? null
  const rec = stats?.record ?? null
  const eng = stats?.engine
  const target = stats?.canvas.fps || 30
  const live = !!stream?.active
  const recording = !!rec?.active
  // Frames that didn't make it out in time (rendering lag) also count, as in OBS.
  const slow = !!eng && eng.fps > 0 && eng.fps < target * 0.95
  const dropped = stream?.dropped ?? 0
  const remux = stats?.remux ?? null
  const note = stream?.reconnecting
    ? { text: 'Reconnecting…', tone: 'text-warn' }
    : remux && remux.error
      ? { text: `The MP4 couldn't be made: ${remux.error}`, tone: 'text-danger' }
      : remux && !remux.done
        ? { text: `Making an MP4… ${Math.round(remux.percent)}%`, tone: 'text-text-2' }
        : rec?.paused
          ? { text: 'Recording paused', tone: 'text-warn' }
          : null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Studio status: open Stats"
        title="Open Stats"
        className="flex h-9 w-full shrink-0 items-stretch border-t border-line bg-surface-2 text-left text-[13px] transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-inset"
      >
        <span
          aria-live="polite"
          className={cx('flex min-w-0 flex-1 items-center truncate px-3 font-semibold', note?.tone)}
        >
          {note?.text}
        </span>
        <Cell label={live ? 'LIVE' : 'Live'} tone={live ? 'live' : undefined}>
          {clock(health.since ? health.now - health.since : 0)}
        </Cell>
        <Cell label={recording ? 'REC' : 'Rec'} tone={recording ? 'live' : undefined}>
          {/* Time recorded (frames over the frame rate): pauses don't count. */}
          {clock(((rec?.frames ?? 0) / target) * 1000)}
        </Cell>
        <Cell label="CPU">{eng ? `${eng.cpu.toFixed(1)}%` : '…'}</Cell>
        <Cell label="FPS" tone={slow ? 'warn' : undefined}>
          {eng ? `${eng.fps.toFixed(2)} / ${target.toFixed(2)}` : '…'}
        </Cell>
        <Cell
          label="Dropped"
          tone={dropped > 0 ? 'warn' : undefined}
          className="hidden lg:inline-flex"
        >
          {droppedText(dropped, stream?.frames ?? 0)}
        </Cell>
        <Cell label="Upload" className="hidden lg:inline-flex">
          {health.kbps === null ? '0' : health.kbps.toLocaleString()} kb/s
        </Cell>
      </button>
      <StatsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
