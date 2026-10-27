// The window's status bar, like OBS's: along the very bottom of the app on every page while
// the Studio runs. Messages on the left; on the right the stream and recording times, CPU,
// frame rate, dropped frames and upload. A click on those opens Stats.

import { useEffect, useMemo, useState } from 'react'
import { studioEngineApi } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { useClient } from '../../../lib/hooks'
import { useEngineReading } from '../../../lib/engine-stats'
import { StatsDialog } from './stats-panel'

/** Its height (px): the sidebar, the page and the Studio's layout leave room for it. */
export const STATUS_BAR_PX = 28

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
}: {
  label: string
  children: React.ReactNode
  tone?: 'live' | 'warn' | undefined
}) {
  return (
    <span className="inline-flex h-full items-center gap-1.5 border-l border-line px-2.5 whitespace-nowrap">
      <span className={tone === 'live' ? 'font-bold text-danger' : 'text-text-3'}>{label}</span>
      <span
        className={cx(
          'font-mono font-semibold tabular-nums',
          tone === 'warn' ? 'text-warn' : 'text-text',
        )}
      >
        {children}
      </span>
    </span>
  )
}

export function StudioStatusBar() {
  const client = useClient()
  const api = useMemo(() => studioEngineApi(client), [client])
  const { stats, kbps, since, at } = useEngineReading(api.stats)
  const [open, setOpen] = useState(false)
  const on = !!stats
  // The rest of the window leaves room for it while it shows.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fc-statusbar', on ? `${STATUS_BAR_PX}px` : '0px')
    return () => root.style.setProperty('--fc-statusbar', '0px')
  }, [on])
  if (!stats) return null
  const stream = stats.stream
  const rec = stats.record
  const eng = stats.engine
  const target = stats.canvas.fps || 30
  const live = !!stream?.active
  const recording = !!rec?.active
  const slow = eng.fps > 0 && eng.fps < target * 0.95
  const dropped = stream?.dropped ?? 0
  const remux = stats.remux ?? null
  const note = stream?.reconnecting
    ? { text: 'Reconnecting…', tone: 'text-warn' }
    : stream?.error && !stream.active
      ? { text: stream.error, tone: 'text-danger' }
      : remux?.error
        ? { text: `The MP4 couldn't be made: ${remux.error}`, tone: 'text-danger' }
        : remux && !remux.done
          ? { text: `Making an MP4… ${Math.round(remux.percent)}%`, tone: 'text-text-2' }
          : rec?.paused
            ? { text: 'Recording paused', tone: 'text-warn' }
            : null
  return (
    <footer
      aria-label="Studio status"
      className="fixed inset-x-0 bottom-0 z-40 hidden items-stretch border-t border-line bg-surface-1 text-[12.5px] lg:flex"
      style={{ height: STATUS_BAR_PX }}
    >
      <span
        aria-live="polite"
        title={note?.text}
        className={cx('flex min-w-0 flex-1 items-center truncate px-3 font-semibold', note?.tone)}
      >
        {note?.text}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open Stats"
        aria-label="Studio status: open Stats"
        className="flex h-full items-stretch transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-inset"
      >
        <Cell label={live ? 'LIVE' : 'Live'} tone={live ? 'live' : undefined}>
          {clock(since ? at - since : 0)}
        </Cell>
        <Cell label={recording ? 'REC' : 'Rec'} tone={recording ? 'live' : undefined}>
          {/* Time recorded (frames over the frame rate): pauses don't count. */}
          {clock(((rec?.frames ?? 0) / target) * 1000)}
        </Cell>
        <Cell label="CPU">{eng.cpu.toFixed(1)}%</Cell>
        <Cell label="FPS" tone={slow ? 'warn' : undefined}>
          {eng.fps.toFixed(2)} / {target.toFixed(2)}
        </Cell>
        <Cell label="Dropped" tone={dropped > 0 ? 'warn' : undefined}>
          {droppedText(dropped, stream?.frames ?? 0)}
        </Cell>
        <Cell label="Upload">{kbps === null ? '0' : kbps.toLocaleString()} kb/s</Cell>
      </button>
      <StatsDialog open={open} onClose={() => setOpen(false)} stats={stats} />
    </footer>
  )
}
