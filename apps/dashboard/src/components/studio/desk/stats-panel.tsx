// OBS's Stats window: the computer's load, the picture's timing, and each output's health,
// read every second (owner's pick S3: graphs, number boxes, an outputs table). Better than OBS: free disk space says how long a recording still fits.

import { useEffect, useRef, useState } from 'react'
import {
  Broadcast,
  ClockCounterClockwise,
  HardDrives,
  Record as RecordIcon,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react'
import { type EngineStats } from '@ferrocast/api'
import { Dialog, InfoTip, cx } from '@ferrocast/ui'
import { type EngineReading } from '../../../lib/engine-stats'

/** Kbps between two byte counts `ms` apart (0 when it went back: a new stream or file). */
export function kbpsBetween(before: number, after: number, ms: number): number {
  if (ms <= 0 || after < before) return 0
  return Math.round(((after - before) * 8) / ms)
}

/** "12.3 GB" / "850 MB". */
export function sizeText(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

/** How long `freeMb` lasts at `kbps`, in words ("about 3 h 20 min"); null when unknown. */
export function lastsFor(freeMb: number, kbps: number): string | null {
  if (kbps <= 0) return null
  const seconds = (freeMb * 1024 * 1024 * 8) / (kbps * 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `about ${h} h ${m} min` : `about ${m} min`
}

/** "3 (0.1%)": a count and its share of `total`. */
export function share(n: number, total: number): string {
  const pct = total > 0 ? (n / total) * 100 : 0
  return `${n.toLocaleString()} (${pct.toFixed(1)}%)`
}

interface Rates {
  stream: number
  record: number
}

/** Bitrates from the change in bytes between two reads. */
function useRates(stats: EngineStats | null): Rates {
  const last = useRef<{ at: number; stream: number; record: number } | null>(null)
  const [rates, setRates] = useState<Rates>({ stream: 0, record: 0 })
  useEffect(() => {
    if (!stats) return
    const now = performance.now()
    const cur = { at: now, stream: stats.stream?.bytes ?? 0, record: stats.record?.bytes ?? 0 }
    const prev = last.current
    last.current = cur
    if (!prev) return
    setRates({
      stream: kbpsBetween(prev.stream, cur.stream, now - prev.at),
      record: kbpsBetween(prev.record, cur.record, now - prev.at),
    })
  }, [stats])
  return rates
}

/** "00:12:41". */
export function clock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return [sec / 3600, (sec / 60) % 60, sec % 60]
    .map((n) => String(Math.floor(n)).padStart(2, '0'))
    .join(':')
}

/** Dropped frames as OBS shows them: the count and its share of all sent. */
export function droppedText(dropped: number, frames: number): string {
  const pct = frames > 0 ? (dropped / frames) * 100 : 0
  return `${dropped} (${pct.toFixed(1)}%)`
}

/** A minute of readings as a line with its area filled (newest at the right). */
function Graph({
  label,
  value,
  note,
  points,
  max,
  tone,
}: {
  label: string
  value: string
  note: string
  points: number[]
  /** The top of the scale. */
  max: number
  tone: 'arc' | 'ok' | 'warn'
}) {
  const w = 300
  const h = 64
  const n = Math.max(points.length, 2)
  const xy = points.map((v, i) => {
    const x = (i / (n - 1)) * w
    const y = h - 3 - (Math.min(v, max) / max) * (h - 6)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const stroke =
    tone === 'ok' ? 'var(--fc-ok)' : tone === 'warn' ? 'var(--fc-warn)' : 'var(--fc-arc)'
  const fill =
    tone === 'ok'
      ? 'var(--fc-ok-soft)'
      : tone === 'warn'
        ? 'var(--fc-warn-soft)'
        : 'var(--fc-accent-soft)'
  return (
    <figure className="m-0 rounded-[14px] border border-line bg-surface-2 px-3 pt-2.5 pb-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-[14px] font-bold text-text-2">
        {label}
        <span className="font-mono text-[15px] text-text tabular-nums">{value}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="mt-1.5 block h-16 w-full"
        role="img"
        aria-label={`${label} over the last minute`}
      >
        {xy.length > 1 && (
          <>
            <polygon
              points={`${xy[0]?.split(',')[0]},${h} ${xy.join(' ')} ${xy[xy.length - 1]?.split(',')[0]},${h}`}
              fill={fill}
            />
            <polyline
              points={xy.join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <p className="m-0 font-mono text-[11.5px] text-text-3">{note}</p>
    </figure>
  )
}

function Box({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 px-2.5 py-2">
      <span className="block text-[12.5px] font-semibold text-text-3">{label}</span>
      <b
        className={cx(
          'font-mono text-[15px] font-bold tabular-nums',
          bad ? 'text-danger' : 'text-text',
        )}
      >
        {value}
      </b>
    </div>
  )
}

/** OBS's Stats, clearer (owner's pick S3): a minute of CPU and drawing time as graphs, the
 * key numbers in boxes, and a table of the outputs. */
export function StatsDialog({
  open,
  onClose,
  reading,
}: {
  open: boolean
  onClose: () => void
  reading: EngineReading
}) {
  const { stats, history, since, at, kbps } = reading
  const rates = useRates(stats)
  const e = stats?.engine
  const stream = stats?.stream ?? null
  const rec = stats?.record ?? null
  const free = stats?.disk_free_mb ?? 0
  const fps = stats?.canvas.fps || 30
  const recRate = rec?.active ? rates.record : 0
  const lasts = recRate ? lastsFor(free, recRate) : null
  const budget = 1000 / fps
  const slowDraw = !!e && e.frame_ms > budget * 0.8
  const outputs: {
    name: string
    icon: Icon
    on: boolean
    status: string
    rate: string
    dropped: string
    bad?: boolean
  }[] = [
    {
      name: 'Stream',
      icon: Broadcast,
      on: !!stream?.active || !!stream?.reconnecting,
      status: stream?.reconnecting
        ? 'Reconnecting'
        : stream?.active
          ? clock(since ? at - since : 0)
          : 'Off',
      rate: stream?.active ? `${((kbps ?? rates.stream) / 1000).toFixed(1)} Mb/s` : '–',
      dropped: stream?.active ? droppedText(stream.dropped, stream.frames) : '–',
      bad: !!stream && stream.frames > 0 && stream.dropped / stream.frames > 0.01,
    },
    {
      name: 'Recording',
      icon: RecordIcon,
      on: !!rec?.active,
      status: rec?.active
        ? `${rec.paused ? 'Paused ' : ''}${clock(((rec.frames ?? 0) / fps) * 1000)}`
        : 'Off',
      rate: rec?.active ? `${(recRate / 1000).toFixed(1)} Mb/s` : '–',
      dropped: rec?.active ? sizeText(rec.bytes / 1048576) : '–',
    },
    {
      name: 'Replay buffer',
      icon: ClockCounterClockwise,
      on: !!stats?.replay?.active,
      status: stats?.replay?.active ? 'On' : 'Off',
      rate: '–',
      dropped: '–',
    },
    {
      name: 'Virtual camera',
      icon: VideoCamera,
      on: !!stats?.virtualcam?.active,
      status: stats?.virtualcam?.active ? 'On' : 'Off',
      rate: '–',
      dropped: '–',
    },
  ]
  return (
    <Dialog open={open} onClose={onClose} title="Stats" size="md">
      {!e ? (
        <p className="m-0 text-[14.5px] text-text-2">Start the Studio to see its stats.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Graph
              label="CPU"
              value={`${e.cpu.toFixed(1)}%`}
              note="last 60 s"
              points={history.cpu}
              // Room above the line: the scale grows with it, at least to 10%.
              max={Math.max(10, ...history.cpu.map((v) => Math.ceil(v / 10) * 10))}
              tone={e.cpu > 80 ? 'warn' : 'arc'}
            />
            <Graph
              label="Drawing a frame"
              value={`${e.frame_ms.toFixed(1)} ms`}
              note={`budget ${budget.toFixed(0)} ms at ${fps} fps`}
              points={history.frameMs}
              max={budget}
              tone={slowDraw ? 'warn' : 'ok'}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Box
              label="Frame rate"
              value={`${e.fps.toFixed(2)} / ${fps}`}
              bad={e.fps < fps * 0.95}
            />
            <Box
              label="Missed"
              value={share(e.lagged, e.frames)}
              bad={e.frames > 0 && e.lagged / e.frames > 0.01}
            />
            <Box
              label="Skipped"
              value={share(e.skipped ?? 0, e.encoded ?? 0)}
              bad={(e.encoded ?? 0) > 0 && (e.skipped ?? 0) / (e.encoded ?? 1) > 0.01}
            />
            <Box label="Memory" value={sizeText(e.memory_mb)} />
          </div>
          <p className="m-0 flex flex-wrap items-center gap-1 text-[13.5px] text-text-2">
            <HardDrives size={15} aria-hidden className="text-text-3" />
            <span className={cx('font-mono tabular-nums', free < 2048 && 'text-danger')}>
              {sizeText(free)}
            </span>
            free{lasts ? `: recording fits ${lasts} more` : ''}
            <InfoTip label="About missed and skipped frames">
              Missed: the computer drew a frame late (too much on screen). Skipped: the encoder fell
              behind (lower the quality or use the hardware encoder).
            </InfoTip>
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-line">
            <table className="w-full min-w-[440px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-surface-2 text-left text-[12px] font-extrabold tracking-[0.03em] text-text-3 uppercase">
                  <th className="w-9 py-2 pl-3" aria-hidden />
                  <th className="py-2 font-extrabold">Output</th>
                  <th className="py-2 font-extrabold">Status</th>
                  <th className="py-2 font-extrabold">Bitrate</th>
                  <th className="py-2 pr-3 font-extrabold">Dropped / size</th>
                </tr>
              </thead>
              <tbody>
                {outputs.map((o) => {
                  const I = o.icon
                  return (
                    <tr key={o.name} className="border-t border-line">
                      <td className="py-2.5 pl-3">
                        <I
                          size={17}
                          weight={o.on ? 'fill' : 'bold'}
                          aria-hidden
                          className={o.on ? 'text-danger' : 'text-text-3'}
                        />
                      </td>
                      <td className="py-2.5 font-semibold">{o.name}</td>
                      <td className="py-2.5">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 font-mono text-[13px] font-bold tabular-nums',
                            o.on ? 'text-danger' : 'text-text-3',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cx(
                              'size-[7px] rounded-full',
                              o.on ? 'bg-danger-fill' : 'bg-line-strong',
                            )}
                          />
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono tabular-nums">{o.rate}</td>
                      <td
                        className={cx(
                          'py-2.5 pr-3 font-mono tabular-nums',
                          o.bad ? 'text-danger' : '',
                        )}
                      >
                        {o.dropped}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  )
}
