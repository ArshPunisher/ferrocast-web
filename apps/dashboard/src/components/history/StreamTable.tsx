// Every stream in the range, newest first: one row per platform. Wide on a phone, so the
// table scrolls sideways inside its own box (focusable, so the keyboard can scroll it too).

import { useState } from 'react'
import {
  PLATFORM_LABEL,
  formatCount,
  formatMoney,
  streamMinutes,
  tameText,
  type HistoryStream,
} from '@ferrocast/api'
import { Button, PlatformMark } from '@ferrocast/ui'

const FIRST = 25

function length(min: number): string {
  const h = Math.floor(min / 60)
  return h ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function StreamTable({
  streams,
  now,
  selected,
  onSelect,
}: {
  streams: HistoryStream[]
  now: number
  /** `platform:key` of the stream shown in detail. */
  selected?: string | null
  onSelect?: (s: HistoryStream) => void
}) {
  const [all, setAll] = useState(false)
  const rows = all ? streams : streams.slice(0, FIRST)
  const num = 'px-3 py-2.5 text-right font-mono tabular-nums'
  return (
    <div className="flex flex-col gap-3">
      <div
        tabIndex={0}
        role="region"
        aria-label="Streams"
        className="fc-scroll -mx-4 overflow-x-auto focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none sm:mx-0 sm:rounded-control"
      >
        <table className="w-full min-w-[780px] border-collapse text-sm" data-testid="history-table">
          <thead>
            <tr className="border-b border-line text-left text-[12.5px] text-text-3">
              <th scope="col" className="sticky left-0 z-[1] bg-surface-1 px-3 py-2 font-medium">
                Stream
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Length
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Avg
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Peak
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Chat
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Follows
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Subs
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Tips
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={`${s.platform}:${s.key}`}
                className={
                  selected === `${s.platform}:${s.key}`
                    ? 'border-b border-line/60 bg-accent-soft last:border-0'
                    : 'border-b border-line/60 last:border-0'
                }
              >
                <th
                  scope="row"
                  className="sticky left-0 z-[1] max-w-[190px] bg-surface-1 px-3 py-2.5 text-left font-normal sm:max-w-[300px]"
                >
                  <span className="flex items-center gap-2.5">
                    <PlatformMark platform={s.platform} size={15} />
                    <span className="min-w-0">
                      {onSelect ? (
                        <button
                          type="button"
                          dir="auto"
                          onClick={() => onSelect(s)}
                          aria-pressed={selected === `${s.platform}:${s.key}`}
                          className="block max-w-full truncate rounded-[4px] text-left font-semibold text-text underline-offset-2 hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                          title={s.title ?? undefined}
                        >
                          {s.title ? tameText(s.title) : PLATFORM_LABEL[s.platform]}
                        </button>
                      ) : (
                        <span
                          dir="auto"
                          className="block truncate font-semibold text-text"
                          title={s.title ?? undefined}
                        >
                          {s.title ? tameText(s.title) : PLATFORM_LABEL[s.platform]}
                        </span>
                      )}
                      <span className="block truncate text-[12.5px] text-text-3">
                        {when(s.started_at)}
                        {s.category ? ` · ${tameText(s.category)}` : ''}
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-3 py-2.5 font-mono whitespace-nowrap text-text-2 tabular-nums">
                  {s.ended_at === null ? 'Live' : length(streamMinutes(s, now))}
                </td>
                <td className={`${num} font-semibold text-text`}>{formatCount(s.avg_viewers)}</td>
                <td className={`${num} text-text-2`}>{formatCount(s.peak_viewers)}</td>
                <td className={`${num} text-text-2`}>{formatCount(s.chat_lines)}</td>
                <td className={`${num} text-text-2`}>{formatCount(s.follows)}</td>
                <td className={`${num} text-text-2`}>{formatCount(s.subs)}</td>
                <td className={`${num} whitespace-nowrap text-text-2`}>
                  {s.tips.length ? s.tips.map(formatMoney).join(' + ') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {streams.length > FIRST && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${formatCount(streams.length)}`}
        </Button>
      )}
    </div>
  )
}
