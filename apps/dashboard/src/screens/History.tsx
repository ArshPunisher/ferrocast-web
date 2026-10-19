// `#/history`: Pro stream history (API.md §9.1). The relay keeps it; this screen reads the
// range picked with the chips and shows the numbers big, then the charts, then every stream.
// Without Pro it is ProPanel's one calm line; hidden when Pro isn't on sale and this relay
// lacks it (R-05, no nagging).

import { useMemo, useState, type ReactNode } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import {
  HISTORY_RANGES,
  formatCount,
  historyApi,
  historyRange,
  historySummary,
  proApi,
  proPanelState,
  type HistoryRange,
  type HistoryView,
} from '@ferrocast/api'
import { Button, EmptyState, Segmented, Skeleton } from '@ferrocast/ui'
import { LoadError, PageHeader } from '../components/Panel'
import { ProPanelView } from '../components/pro/ProPanel'
import { PlatformSplit, ViewersChart, WeeklyBars } from '../components/history/charts'
import { StreamTable } from '../components/history/StreamTable'
import { WeeklyEmail } from '../components/history/WeeklyEmail'
import { saveBlob } from '../components/studio/common'
import { useAction, useClient, useResource } from '../lib/hooks'
import { useLive } from '../lib/store'

function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 border-t border-line pt-5" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[15px] font-bold tracking-tight text-text">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Tiles({ v, now }: { v: HistoryView; now: number }) {
  const s = historySummary(v.streams, now)
  const tiles: [string, string][] = [
    ['Avg viewers', formatCount(s.avg_viewers)],
    ['Peak', formatCount(s.peak_viewers)],
    ['Streams', formatCount(s.streams)],
    ['Hours live', s.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })],
    ['Follows', formatCount(s.follows)],
    ['Subs', formatCount(s.subs)],
  ]
  return (
    <dl
      className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6"
      data-testid="history-tiles"
    >
      {tiles.map(([k, val], i) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] font-medium text-text-3">{k}</dt>
          <dd
            className={
              i === 0
                ? 'mt-1 truncate font-display text-4xl font-extrabold tracking-[-0.03em] text-molten-text tabular-nums sm:text-[44px]'
                : 'mt-1 truncate font-display text-3xl font-bold tracking-[-0.03em] text-text tabular-nums sm:text-4xl'
            }
            title={val}
          >
            {val}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading stream history">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-52" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-36 lg:col-span-2" />
        <Skeleton className="h-36" />
      </div>
    </div>
  )
}

function Body({ email, phone = false }: { email: boolean; phone?: boolean }) {
  const client = useClient()
  const [range, setRange] = useState<HistoryRange>('4w')
  // The range is fixed when picked, so a reload asks for the same window.
  const span = useMemo(() => historyRange(range, Date.now()), [range])
  const res = useResource((c) => historyApi(c).list(span), [span.from])
  const { busy, run } = useAction()
  const v = res.data
  const now = span.to

  const exportCsv = () =>
    void run(
      'export',
      async () => {
        const blob = await historyApi(client).exportCsv()
        saveBlob(blob, 'ferrocast-history.csv')
      },
      { success: 'History saved as a CSV file.' },
    )

  const empty = v && v.streams.length === 0
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Range"
          value={range}
          options={HISTORY_RANGES.map((r) => ({ value: r.value, label: r.label }))}
          onChange={setRange}
        />
        {/* Exports stay on the PC (a phone gets the numbers, not the file). */}
        {!phone && (
          <Button
            size="sm"
            icon={<DownloadSimple size={15} />}
            busy={busy === 'export'}
            disabled={!!empty}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        )}
      </div>
      {res.error && !v ? (
        <LoadError error={res.error} onRetry={res.reload} />
      ) : !v ? (
        <Loading />
      ) : empty ? (
        <EmptyState title="No streams yet" className="py-10">
          Your first stream will show up here after it ends.
        </EmptyState>
      ) : (
        <div
          className={
            res.loading
              ? 'flex flex-col gap-6 opacity-60 transition-opacity'
              : 'flex flex-col gap-6 transition-opacity'
          }
        >
          {res.error ? <LoadError error={res.error} onRetry={res.reload} /> : null}
          <Tiles v={v} now={now} />
          <Section title="Viewers">
            <ViewersChart streams={v.streams} from={v.from} to={v.to} />
          </Section>
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section title="Streams per week">
                <WeeklyBars weeks={v.weekly} />
              </Section>
            </div>
            <Section title="Platforms">
              <PlatformSplit counts={historySummary(v.streams, now).by_platform} />
            </Section>
          </div>
          <Section
            title="Every stream"
            aside={
              <span className="font-mono text-[12.5px] text-text-3 tabular-nums">
                {formatCount(v.streams.length)}
              </span>
            }
          >
            <StreamTable streams={v.streams} now={now} />
            {v.truncated && (
              <p className="text-[13px] text-text-3">
                {phone
                  ? 'Showing the newest 2,000. Export CSV on your PC has them all.'
                  : 'Showing the newest 2,000. Export CSV has them all.'}
              </p>
            )}
          </Section>
        </div>
      )}
      {email ? <WeeklyEmail /> : null}
    </div>
  )
}

export function History() {
  // An owner's phone can't read Pro's status (it stays on the PC); the relay answers the
  // history itself, also while the PC is off (M10).
  const phone = useLive((s) => s.remote?.role === 'owner')
  if (phone)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Stream history" />
        <Body email={false} phone />
      </div>
    )
  return <DesktopHistory />
}

function DesktopHistory() {
  const pro = useResource((c) => proApi(c).status())
  const view = pro.error ? null : pro.data
  const state = proPanelState(view, 'history')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stream history" />
      {pro.loading && !pro.data ? (
        <Loading />
      ) : state === 'hidden' ? (
        <EmptyState title="Not available here yet" />
      ) : (
        <ProPanelView pro={view} feature="history" id="history" title="Your streams">
          <Body email={!!view?.features.weekly_email} />
        </ProPanelView>
      )}
    </div>
  )
}
