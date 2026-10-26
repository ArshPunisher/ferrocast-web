// Insights' newer charts (1.4): one bar per stream for a chosen number, one stream's viewer
// curve, the best times to stream, and top supporters. Plain SVG like the charts next to
// them: each is an image with a title and a description and carries its numbers as a table
// for screen readers. One series each, so no legend box; Molten for bars, Arc for the
// selected bar and for lines, the heat map one hue from faint to full (sequential).

import { useId, useMemo, useState } from 'react'
import { ChartLine } from '@phosphor-icons/react'
import {
  BLOCKS,
  PLATFORM_LABEL,
  STREAM_METRICS,
  WEEKDAYS,
  bestSlot,
  blockLabel,
  formatCount,
  formatMoney,
  historyApi,
  mainCurrency,
  metricOf,
  tameText,
  timeSlots,
  type HistoryStream,
  type StreamMetric,
  type Supporters,
} from '@ferrocast/api'
import { PlatformMark, Segmented, Skeleton } from '@ferrocast/ui'
import { LoadError } from '../Panel'
import { useResource } from '../../lib/hooks'
import { shortDate } from './charts'

const MAX_BARS = 40

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
    // In a clipping box: a wide table must not widen the page (an sr-only table alone can).
    <div className="sr-only">
      <table>
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
    </div>
  )
}

const keyOf = (s: HistoryStream) => `${s.platform}:${s.key}`

/** Tips in minor units of one currency, shown as money. */
function show(m: StreamMetric, v: number, currency: string | null): string {
  if (m === 'tips') return currency ? formatMoney({ currency, minor: v }) : '0'
  return formatCount(v)
}

/** One bar per stream (the newest 40, oldest on the left); a click opens its detail. */
export function PerStream({
  streams,
  selected,
  onSelect,
}: {
  streams: HistoryStream[]
  selected: string | null
  onSelect: (s: HistoryStream) => void
}) {
  const id = useId()
  const [metric, setMetric] = useState<StreamMetric>('viewers')
  const currency = useMemo(() => mainCurrency(streams), [streams])
  const list = useMemo(() => streams.slice(0, MAX_BARS).reverse(), [streams])
  const values = list.map((s) => metricOf(s, metric, currency))
  const max = niceMax(Math.max(0, ...values))
  const label = STREAM_METRICS.find((x) => x.value === metric)?.label ?? ''
  const what =
    metric === 'viewers'
      ? 'Average viewers'
      : metric === 'chat'
        ? 'Chat messages'
        : metric === 'tips'
          ? `Tips in ${currency ?? 'one currency'}`
          : label
  const best = values.reduce((b, v, i) => (v > (values[b] ?? -1) ? i : b), 0)
  const h = 140
  const slot = 10
  const bar = list.length > 24 ? 6 : 5
  return (
    <figure className="m-0 flex flex-col gap-3">
      <Segmented
        label="Number per stream"
        size="sm"
        value={metric}
        options={STREAM_METRICS.map((m) => ({ value: m.value, label: m.label }))}
        onChange={setMetric}
        className="self-start"
      />
      {metric === 'tips' && !currency ? (
        <p className="text-[14.5px] text-text-3">No tips in this range.</p>
      ) : (
        <>
          <div className="relative">
            <svg
              viewBox={`0 0 ${Math.max(list.length, 1) * slot} ${h}`}
              preserveAspectRatio="none"
              role="img"
              aria-labelledby={`${id}-t`}
              aria-describedby={`${id}-d`}
              className="block h-36 w-full sm:h-40"
            >
              <title id={`${id}-t`}>{`${what} per stream`}</title>
              <desc id={`${id}-d`}>
                {list.length
                  ? `The newest ${list.length} streams, oldest first. Highest: ${show(metric, values[best] ?? 0, currency)} on ${shortDate(list[best]?.started_at ?? 0)}.`
                  : 'No streams in this range.'}
              </desc>
              {[0.5, 1].map((f) => (
                <line
                  key={f}
                  x1="0"
                  x2={list.length * slot}
                  y1={h - (h - 6) * f}
                  y2={h - (h - 6) * f}
                  stroke="var(--fc-line)"
                  strokeDasharray={f === 1 ? undefined : '3 5'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1="0"
                x2={list.length * slot}
                y1={h}
                y2={h}
                stroke="var(--fc-line-strong)"
                vectorEffect="non-scaling-stroke"
              />
              {list.map((s, i) => {
                const v = values[i] ?? 0
                const bh = Math.max((v / max) * (h - 6), v ? 1.5 : 0)
                const on = selected === keyOf(s)
                return (
                  <g key={keyOf(s)} onClick={() => onSelect(s)} className="cursor-pointer">
                    {/* A hit area taller and wider than the bar. */}
                    <rect x={i * slot} y="0" width={slot} height={h} fill="transparent" />
                    <rect
                      x={i * slot + (slot - bar) / 2}
                      y={h - bh}
                      width={bar}
                      height={bh}
                      rx="1"
                      fill={on ? 'var(--fc-arc)' : 'var(--fc-accent)'}
                    />
                    <title>{`${shortDate(s.started_at)}, ${PLATFORM_LABEL[s.platform]}: ${show(metric, v, currency)}`}</title>
                  </g>
                )
              })}
            </svg>
            <span className="pointer-events-none absolute top-0 left-0 -translate-y-1/2 rounded-full bg-surface-1 pr-1.5 font-mono text-[12.5px] text-text-3 tabular-nums">
              {show(metric, max, currency)}
            </span>
          </div>
          <figcaption
            className="flex justify-between font-mono text-[12.5px] text-text-3 tabular-nums"
            aria-hidden="true"
          >
            <span>{list[0] ? shortDate(list[0].started_at) : ''}</span>
            <span className="hidden sm:inline">
              Pick a bar or a stream below for its viewers over time
            </span>
            <span>{list.at(-1) ? shortDate(list.at(-1)!.started_at) : ''}</span>
          </figcaption>
          <SrTable
            caption={`${what} per stream`}
            head={['Stream', 'Platform', label]}
            rows={list.map((s, i) => [
              shortDate(s.started_at),
              PLATFORM_LABEL[s.platform],
              show(metric, values[i] ?? 0, currency),
            ])}
          />
        </>
      )}
    </figure>
  )
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** One stream: its viewers every five minutes and its numbers. */
export function StreamDetail({ stream }: { stream: HistoryStream }) {
  const id = useId()
  const res = useResource(
    (c) => historyApi(c).samples(stream.platform, stream.key),
    [keyOf(stream)],
  )
  const samples = res.data?.samples ?? []
  const W = 720
  const H = 160
  const first = samples[0]?.at ?? stream.started_at
  const last = samples.at(-1)?.at ?? stream.ended_at ?? first + 1
  const max = niceMax(Math.max(stream.peak_viewers, ...samples.map((s) => s.viewers)))
  const x = (t: number) => ((t - first) / Math.max(last - first, 1)) * W
  const y = (v: number) => H - (v / max) * (H - 8)
  const line = samples
    .map((s, i) => `${i ? 'L' : 'M'}${x(s.at).toFixed(1)},${y(s.viewers).toFixed(1)}`)
    .join('')
  const numbers: [string, string][] = [
    ['Avg viewers', formatCount(stream.avg_viewers)],
    ['Peak', formatCount(stream.peak_viewers)],
    ['Follows', formatCount(stream.follows)],
    ['Subs', formatCount(stream.subs)],
    ['Chat', formatCount(stream.chat_lines)],
    ['Chatters', formatCount(stream.chatters)],
    ['Tips', stream.tips.length ? stream.tips.map(formatMoney).join(' + ') : '-'],
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="stream-detail">
      <div className="flex min-w-0 items-center gap-2.5">
        <PlatformMark platform={stream.platform} size={16} />
        <p className="min-w-0 truncate text-[16px] font-semibold text-text" dir="auto">
          {stream.title ? tameText(stream.title) : PLATFORM_LABEL[stream.platform]}
        </p>
        <span className="shrink-0 font-mono text-[13.5px] text-text-3 tabular-nums">
          {shortDate(stream.started_at)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {numbers.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13.5px] text-text-3">{k}</dt>
            <dd
              className="truncate font-mono text-[16px] font-semibold text-text tabular-nums"
              title={v}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {res.error ? (
        <LoadError error={res.error} onRetry={res.reload} />
      ) : res.loading && !res.data ? (
        <Skeleton className="h-40" />
      ) : samples.length < 2 ? (
        <p className="flex items-center gap-2 text-[14.5px] text-text-3">
          <ChartLine size={16} aria-hidden /> No viewer counts were saved during this stream.
        </p>
      ) : (
        <figure className="m-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            className="block h-36 w-full overflow-visible sm:h-40"
          >
            <title id={`${id}-t`}>Viewers during this stream</title>
            <desc
              id={`${id}-d`}
            >{`From ${clock(first)} to ${clock(last)}, peaking at ${formatCount(Math.max(...samples.map((s) => s.viewers)))}.`}</desc>
            <line
              x1="0"
              x2={W}
              y1={H}
              y2={H}
              stroke="var(--fc-line-strong)"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              x2={W}
              y1={y(max)}
              y2={y(max)}
              stroke="var(--fc-line)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={line}
              fill="none"
              stroke="var(--fc-arc)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {samples.map((s) => (
              <rect key={s.at} x={x(s.at) - 6} y="0" width="12" height={H} fill="transparent">
                <title>{`${clock(s.at)}: ${formatCount(s.viewers)} viewers`}</title>
              </rect>
            ))}
          </svg>
          <figcaption
            className="mt-2 flex justify-between font-mono text-[12.5px] text-text-3 tabular-nums"
            aria-hidden="true"
          >
            <span>{clock(first)}</span>
            <span>peak scale {formatCount(max)}</span>
            <span>{clock(last)}</span>
          </figcaption>
          <SrTable
            caption="Viewers during this stream"
            head={['Time', 'Viewers']}
            rows={samples.map((s) => [clock(s.at), s.viewers])}
          />
        </figure>
      )}
    </div>
  )
}

/** Weekdays × four-hour blocks by start time, shaded by average viewers. */
export function BestTimes({ streams, now }: { streams: HistoryStream[]; now: number }) {
  const id = useId()
  const slots = useMemo(() => timeSlots(streams, now), [streams, now])
  const best = bestSlot(slots)
  const top = Math.max(1, ...slots.map((s) => s.avg_viewers))
  const shade = (v: number) => (v ? 0.18 + 0.82 * (v / top) : 0)
  return (
    <figure className="m-0 flex flex-col gap-3">
      <p className="text-[15px] text-text-2" data-testid="best-slot">
        {best ? (
          <>
            Streams that start on <b className="text-text">{WEEKDAYS[best.day]}</b> from{' '}
            <b className="text-text">{blockLabel(best.hour)}</b> average{' '}
            <b className="font-mono text-text tabular-nums">{formatCount(best.avg_viewers)}</b>{' '}
            viewers ({best.streams} {best.streams === 1 ? 'stream' : 'streams'}).
          </>
        ) : (
          'Stream a few more times to see which slots do best.'
        )}
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label="Weekday and start time grid"
        className="fc-scroll -mx-4 overflow-x-auto px-4 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none sm:mx-0 sm:px-0"
      >
        <div
          role="img"
          aria-labelledby={`${id}-t`}
          className="grid min-w-[340px] grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-[3px]"
        >
          <span id={`${id}-t`} className="sr-only">
            Average viewers by weekday and start time, in your time zone.
          </span>
          <span aria-hidden="true" />
          {BLOCKS.map((b) => (
            <span
              key={b}
              aria-hidden="true"
              className="pb-1 text-center font-mono text-[12px] text-text-3 tabular-nums"
            >
              {String(b).padStart(2, '0')}
            </span>
          ))}
          {WEEKDAYS.map((d, di) => (
            <div key={d} className="contents">
              <span
                aria-hidden="true"
                className="pr-2 text-[13px] leading-7 font-medium text-text-3"
              >
                {d}
              </span>
              {BLOCKS.map((b) => {
                const s = slots.find((x) => x.day === di && x.hour === b)
                const v = s?.avg_viewers ?? 0
                const isBest = best && best.day === di && best.hour === b
                return (
                  <span
                    key={b}
                    aria-hidden="true"
                    title={
                      s?.streams
                        ? `${d} ${blockLabel(b)}: ${formatCount(v)} average viewers over ${s.streams} ${s.streams === 1 ? 'stream' : 'streams'}`
                        : `${d} ${blockLabel(b)}: no streams`
                    }
                    className={
                      isBest
                        ? 'relative h-7 rounded-[5px] bg-surface-3 ring-2 ring-text ring-offset-1 ring-offset-surface-1'
                        : 'relative h-7 rounded-[5px] bg-surface-3'
                    }
                  >
                    {v > 0 && (
                      <span
                        className="absolute inset-0 rounded-[5px] bg-arc"
                        style={{ opacity: shade(v) }}
                      />
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex items-center gap-2 text-[13px] text-text-3">
        <span>Fewer viewers</span>
        <span
          aria-hidden="true"
          className="h-2 w-24 rounded-full bg-gradient-to-r from-arc/20 to-arc"
        />
        <span>More</span>
        <span className="ml-auto">Your time zone</span>
      </figcaption>
      <SrTable
        caption="Average viewers by weekday and start time"
        head={['Weekday', ...BLOCKS.map((b) => blockLabel(b))]}
        rows={WEEKDAYS.map((d, di) => [
          d,
          ...BLOCKS.map((b) => {
            const s = slots.find((x) => x.day === di && x.hour === b)
            return s?.streams ? `${s.avg_viewers} (${s.streams})` : '-'
          }),
        ])}
      />
    </figure>
  )
}

type Row = { platform: Parameters<typeof PlatformMark>[0]['platform']; name: string; value: string }

function List({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-[14px] font-semibold text-text-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[14.5px] text-text-3">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.slice(0, 5).map((r, i) => (
            <li key={`${r.platform}:${r.name}:${i}`} className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-[13px] text-text-3 tabular-nums">
                {i + 1}
              </span>
              <PlatformMark platform={r.platform} size={14} />
              <span
                className="min-w-0 flex-1 truncate text-[15px] font-medium text-text"
                dir="auto"
                title={r.name}
              >
                {tameText(r.name)}
              </span>
              <span className="shrink-0 font-mono text-[14px] text-text-2 tabular-nums">
                {r.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Top supporters for the range, from this PC's own event log. */
export function TopSupporters({ data }: { data: Supporters | null }) {
  if (!data) return <Skeleton className="h-40" />
  const subs: Row[] = data.subscribers.map((s) => ({
    platform: s.platform,
    name: s.name,
    value: s.gifts ? `${formatCount(s.gifts)} gifted` : `${s.months} mo`,
  }))
  const tips: Row[] = data.tippers.map((t) => ({
    platform: t.platform,
    name: t.name,
    value: [...t.amounts.map(formatMoney), ...(t.bits ? [`${formatCount(t.bits)} Bits`] : [])].join(
      ' + ',
    ),
  }))
  const raids: Row[] = data.raiders.map((r) => ({
    platform: r.platform,
    name: r.name,
    value: `${formatCount(r.viewers)} viewers`,
  }))
  const chat: Row[] = data.top_chatters.map((c) => ({
    platform: c.platform,
    name: c.name,
    value: formatCount(c.messages),
  }))
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2" data-testid="top-supporters">
      <List title="Subs and gifts" rows={subs} empty="No subs in this range yet." />
      <List title="Tips and Bits" rows={tips} empty="No tips in this range yet." />
      <List title="Raids" rows={raids} empty="No raids in this range yet." />
      <List title="Most active in chat" rows={chat} empty="No chat saved for this range." />
    </div>
  )
}
