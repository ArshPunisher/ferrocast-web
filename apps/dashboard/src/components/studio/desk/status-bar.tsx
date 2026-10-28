// The window's status bar, like OBS's: along the bottom of the app, beside the sidebar (which
// keeps the full height), on every page while the Studio runs. Messages on the left; on the
// right the stream and recording times, CPU, frame rate, dropped frames and upload. A click on
// those opens Stats.

import { useEffect, useMemo, useRef, useState } from 'react'
import { studioEngineApi, type EngineStats } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { useClient } from '../../../lib/hooks'
import { useEngineReading } from '../../../lib/engine-stats'
import { StatsDialog, clock, droppedText } from './stats-panel'

/** Its height (px): the sidebar, the page and the Studio's layout leave room for it. */
export const STATUS_BAR_PX = 28

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

/** Counts from one read to the next: what went wrong in the last few seconds. */
type Counts = { lagged: number; skipped: number; dropped: number; at: number }

/**
 * Trouble while it happens, in words (OBS shows only the numbers): frames the computer drew
 * late (the game or the scenes are too heavy), frames the encoder skipped, frames the network
 * dropped. Shown for 10 s after it last happened.
 */
function useStrain(stats: EngineStats | null): { text: string; tone: string } | null {
  const last = useRef<Counts | null>(null)
  const [seen, setSeen] = useState<{ what: 'render' | 'encode' | 'network'; until: number } | null>(
    null,
  )
  useEffect(() => {
    if (!stats) {
      last.current = null
      return
    }
    const now = Date.now()
    const cur: Counts = {
      lagged: stats.engine.lagged,
      skipped: stats.engine.skipped ?? 0,
      dropped: stats.stream?.dropped ?? 0,
      at: now,
    }
    const prev = last.current
    last.current = cur
    if (!prev) return
    // A few missed frames now and then are normal; more than 1 in 30 a second isn't.
    const fps = stats.canvas.fps || 30
    const per = Math.max(1, (now - prev.at) / 1000)
    const bad = (d: number) => d / per > fps / 30
    const what =
      cur.dropped > prev.dropped && bad(cur.dropped - prev.dropped)
        ? 'network'
        : cur.skipped > prev.skipped && bad(cur.skipped - prev.skipped)
          ? 'encode'
          : cur.lagged > prev.lagged && bad(cur.lagged - prev.lagged)
            ? 'render'
            : null
    if (what) setSeen({ what, until: now + 10_000 })
  }, [stats])
  if (!seen || Date.now() > seen.until) return null
  return {
    render: {
      text: 'Your computer is falling behind: frames are late. Close heavy apps, lower the game’s settings, or press Optimize in Go live.',
      tone: 'text-warn',
    },
    encode: {
      text: 'The encoder is falling behind. Press Optimize in Go live: it picks the hardware encoder and a lighter bitrate.',
      tone: 'text-warn',
    },
    network: {
      text: 'Your upload can’t keep up: frames are dropped. Press Optimize in Go live, or use a wired connection.',
      tone: 'text-danger',
    },
  }[seen.what]
}

export function StudioStatusBar() {
  const client = useClient()
  const api = useMemo(() => studioEngineApi(client), [client])
  const reading = useEngineReading(api.stats)
  const { stats, kbps, since, at } = reading
  const [open, setOpen] = useState(false)
  const on = !!stats
  const strain = useStrain(stats)
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
            : strain
  return (
    <footer
      aria-label="Studio status"
      className="fixed right-0 bottom-0 left-60 z-40 hidden items-stretch border-t border-line bg-surface-1 text-[12.5px] lg:flex"
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
      <StatsDialog open={open} onClose={() => setOpen(false)} reading={reading} />
    </footer>
  )
}
