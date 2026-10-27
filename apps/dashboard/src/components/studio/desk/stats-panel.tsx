// OBS's Stats window: the computer's load, the picture's timing, and each output's health,
// read every second. Better than OBS: free disk space says how long a recording still fits.

import { useEffect, useRef, useState } from 'react'
import { type EngineStats } from '@ferrocast/api'
import { Dialog, InfoTip, cx } from '@ferrocast/ui'

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

function Line({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-[14px] text-text-2">{label}</dt>
      <dd
        className={cx('m-0 font-mono text-[14px] tabular-nums', bad ? 'text-danger' : 'text-text')}
      >
        {value}
      </dd>
    </div>
  )
}

export function StatsDialog({
  open,
  onClose,
  stats,
}: {
  open: boolean
  onClose: () => void
  stats: EngineStats | null
}) {
  const rates = useRates(stats)
  const e = stats?.engine
  const stream = stats?.stream ?? null
  const rec = stats?.record ?? null
  const free = stats?.disk_free_mb ?? 0
  const recRate = rec?.active ? rates.record : 0
  const lasts = recRate ? lastsFor(free, recRate) : null
  const status = (on: boolean | undefined, extra?: string) => (on ? (extra ?? 'On') : 'Off')
  return (
    <Dialog open={open} onClose={onClose} title="Stats" size="md">
      {!e ? (
        <p className="m-0 text-[14.5px] text-text-2">Start the Studio to see its stats.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <section aria-label="This computer">
            <h3 className="m-0 mb-1 text-[14px] font-bold text-text-3">This computer</h3>
            <dl className="m-0">
              <Line label="CPU" value={`${e.cpu.toFixed(1)}%`} bad={e.cpu > 80} />
              <Line label="Memory" value={sizeText(e.memory_mb)} />
              <Line
                label="Free disk"
                value={lasts ? `${sizeText(free)}, ${lasts}` : sizeText(free)}
                bad={free < 2048}
              />
            </dl>
          </section>
          <section aria-label="Picture">
            <h3 className="m-0 mb-1 flex items-center gap-1 text-[14px] font-bold text-text-3">
              Picture
              <InfoTip label="About missed and skipped frames">
                Missed: the computer drew a frame late (too much on screen). Skipped: the encoder
                fell behind (lower the quality or use the hardware encoder).
              </InfoTip>
            </h3>
            <dl className="m-0">
              <Line label="Frame rate" value={`${e.fps.toFixed(2)} / ${stats?.canvas.fps ?? 0}`} />
              <Line label="Drawing a frame" value={`${e.frame_ms.toFixed(1)} ms`} />
              <Line
                label="Missed frames"
                value={share(e.lagged, e.frames)}
                bad={e.frames > 0 && e.lagged / e.frames > 0.01}
              />
              <Line
                label="Skipped frames"
                value={share(e.skipped ?? 0, e.encoded ?? 0)}
                bad={(e.encoded ?? 0) > 0 && (e.skipped ?? 0) / (e.encoded ?? 1) > 0.01}
              />
            </dl>
          </section>
          <section aria-label="Outputs" className="sm:col-span-2">
            <h3 className="m-0 mb-1 text-[14px] font-bold text-text-3">Outputs</h3>
            <dl className="m-0">
              <Line
                label="Stream"
                value={
                  stream?.active
                    ? `${(rates.stream / 1000).toFixed(1)} Mbps · ${sizeText(stream.bytes / 1048576)} · dropped ${share(stream.dropped, stream.frames)}`
                    : stream?.reconnecting
                      ? 'Reconnecting…'
                      : 'Off'
                }
                bad={!!stream && stream.frames > 0 && stream.dropped / stream.frames > 0.01}
              />
              <Line
                label="Recording"
                value={
                  rec?.active
                    ? `${(recRate / 1000).toFixed(1)} Mbps · ${sizeText(rec.bytes / 1048576)}${rec.paused ? ' · paused' : ''}`
                    : 'Off'
                }
              />
              <Line label="Replay buffer" value={status(stats?.replay?.active)} />
              <Line label="Virtual camera" value={status(stats?.virtualcam?.active)} />
            </dl>
          </section>
        </div>
      )}
    </Dialog>
  )
}
