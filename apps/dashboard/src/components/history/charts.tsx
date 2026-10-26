// Stream history's charts: plain SVG, no chart library. Each is an image with a title and
// a description, and carries the same numbers as a table for screen readers. Colours come
// from the theme tokens, so light and dark both work: Arc for the viewers line, Molten for
// the weekly bars, the platforms' own colours only for the platform split.

import { useId, useMemo } from 'react'
import {
  PLATFORM_LABEL,
  formatCount,
  type HistoryPlatform,
  type HistoryStream,
  type HistoryWeek,
} from '@ferrocast/api'
import { PlatformMark } from '@ferrocast/ui'

const DAY = 86_400_000

export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** One point per day streamed: each platform's best average that day, added together. */
export function viewerDays(streams: HistoryStream[]): { day: number; viewers: number }[] {
  const days = new Map<number, Map<HistoryPlatform, number>>()
  for (const s of streams) {
    const d = new Date(s.started_at)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const per = days.get(day) ?? new Map<HistoryPlatform, number>()
    per.set(s.platform, Math.max(per.get(s.platform) ?? 0, s.avg_viewers))
    days.set(day, per)
  }
  return [...days.entries()]
    .map(([day, per]) => ({ day, viewers: [...per.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.day - b.day)
}

/** A round top for the axis: 1, 2, 5 × 10ⁿ. */
function niceMax(n: number): number {
  if (n <= 5) return 5
  const p = 10 ** Math.floor(Math.log10(n))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p
  return 10 * p
}

function SrTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: (string | number)[][]
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const W = 720
const H = 220

export function ViewersChart({
  streams,
  from,
  to,
}: {
  streams: HistoryStream[]
  from: number
  to: number
}) {
  const id = useId()
  const points = useMemo(() => viewerDays(streams), [streams])
  const max = niceMax(Math.max(0, ...points.map((p) => p.viewers)))
  const x = (t: number) => ((t + DAY / 2 - from) / Math.max(to - from, 1)) * W
  const y = (v: number) => H - (v / max) * (H - 8)
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.viewers).toFixed(1)}`)
    .join('')
  const first = points[0]
  const last = points.at(-1)
  const area =
    first && last ? `${line}L${x(last.day).toFixed(1)},${H}L${x(first.day).toFixed(1)},${H}Z` : ''
  const best = points.reduce<{ day: number; viewers: number } | null>(
    (b, p) => (!b || p.viewers > b.viewers ? p : b),
    null,
  )
  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          className="block h-44 w-full overflow-visible sm:h-56"
        >
          <title id={`${id}-t`}>Average viewers per stream day</title>
          <desc id={`${id}-d`}>
            {points.length
              ? `${points.length} days streamed between ${shortDate(from)} and ${shortDate(to)}. Highest: ${formatCount(best?.viewers ?? 0)} on ${shortDate(best?.day ?? from)}.`
              : 'No streams in this range.'}
          </desc>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--fc-arc)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--fc-arc)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--fc-line)"
              strokeDasharray={f === 1 ? undefined : '3 5'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1="0"
            x2={W}
            y1={H}
            y2={H}
            stroke="var(--fc-line-strong)"
            vectorEffect="non-scaling-stroke"
          />
          {area && <path d={area} fill={`url(#${id}-g)`} />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke="var(--fc-arc)"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <span className="pointer-events-none absolute top-0 left-0 -translate-y-1/2 rounded-full bg-surface-1 pr-1.5 font-mono text-[12.5px] text-text-3 tabular-nums">
          {formatCount(max)}
        </span>
      </div>
      <figcaption
        className="mt-2 flex justify-between font-mono text-[12.5px] text-text-3 tabular-nums"
        aria-hidden="true"
      >
        <span>{shortDate(from)}</span>
        <span>{shortDate(to)}</span>
      </figcaption>
      <SrTable
        caption="Average viewers per stream day"
        head={['Day', 'Viewers']}
        rows={points.map((p) => [shortDate(p.day), p.viewers])}
      />
    </figure>
  )
}

export function WeeklyBars({ weeks }: { weeks: HistoryWeek[] }) {
  const id = useId()
  const n = Math.max(weeks.length, 1)
  const max = niceMax(Math.max(0, ...weeks.map((w) => w.streams)))
  const slot = 10
  // Few weeks: slimmer bars, so four weeks don't read as four slabs.
  const bar = weeks.length > 30 ? 7 : weeks.length > 8 ? 6 : 3.5
  const h = 120
  const total = weeks.reduce((a, w) => a + w.streams, 0)
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${n * slot} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        className="block h-32 w-full sm:h-36"
      >
        <title id={`${id}-t`}>Streams per week</title>
        <desc
          id={`${id}-d`}
        >{`${formatCount(total)} streams over ${weeks.length} weeks, one bar per week. Simulcasts count once per platform.`}</desc>
        <line
          x1="0"
          x2={n * slot}
          y1={h}
          y2={h}
          stroke="var(--fc-line-strong)"
          vectorEffect="non-scaling-stroke"
        />
        {weeks.map((w, i) => {
          const bh = (w.streams / max) * (h - 4)
          return (
            <rect
              key={w.week_start}
              x={i * slot + (slot - bar) / 2}
              y={h - Math.max(bh, w.streams ? 1.5 : 0)}
              width={bar}
              height={Math.max(bh, w.streams ? 1.5 : 0)}
              fill="var(--fc-accent)"
            >
              <title>{`Week of ${shortDate(w.week_start)}: ${w.streams} streams`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption
        className="mt-2 flex justify-between font-mono text-[12.5px] text-text-3 tabular-nums"
        aria-hidden="true"
      >
        <span>{weeks[0] ? shortDate(weeks[0].week_start) : ''}</span>
        <span>most {formatCount(Math.max(0, ...weeks.map((w) => w.streams)))}</span>
      </figcaption>
      <SrTable
        caption="Streams per week"
        head={['Week of', 'Streams', 'Twitch', 'YouTube', 'Kick', 'Hours']}
        rows={weeks.map((w) => [
          shortDate(w.week_start),
          w.streams,
          w.by_platform.twitch,
          w.by_platform.youtube,
          w.by_platform.kick,
          Math.round(w.minutes / 6) / 10,
        ])}
      />
    </figure>
  )
}

const ORDER: HistoryPlatform[] = ['twitch', 'youtube', 'kick']

export function PlatformSplit({ counts }: { counts: Record<HistoryPlatform, number> }) {
  const id = useId()
  const total = ORDER.reduce((a, p) => a + counts[p], 0)
  let at = 0
  const parts = ORDER.filter((p) => counts[p] > 0).map((p) => {
    const w = total ? (counts[p] / total) * 100 : 0
    const part = { p, x: at, w }
    at += w
    return part
  })
  return (
    <figure className="m-0 flex flex-col gap-4">
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-t`}
        className="block h-3 w-full overflow-hidden rounded-full"
      >
        <title id={`${id}-t`}>
          {total
            ? `Streams by platform: ${ORDER.map((p) => `${PLATFORM_LABEL[p]} ${counts[p]}`).join(', ')}`
            : 'No streams'}
        </title>
        <rect x="0" y="0" width="100" height="10" fill="var(--fc-surface-3)" />
        {parts.map(({ p, x, w }) => (
          <rect
            key={p}
            x={x}
            y="0"
            width={Math.max(w - 0.6, 0.6)}
            height="10"
            fill={`var(--fc-${p})`}
          />
        ))}
      </svg>
      <ul className="flex flex-col gap-2.5">
        {ORDER.map((p) => (
          <li key={p} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-text">
              <PlatformMark platform={p} size={15} />
              {PLATFORM_LABEL[p]}
            </span>
            <span className="font-mono text-sm text-text-2 tabular-nums">
              {formatCount(counts[p])}
              <span className="ml-2 inline-block w-10 text-right text-text-3">
                {total ? `${Math.round((counts[p] / total) * 100)}%` : '0%'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
