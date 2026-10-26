// `#/history`: Insights (API.md §9.1, 1.4). The relay keeps stream history: a free account
// the last 30 days, Pro a year. This screen reads the range picked with the chips and shows
// the numbers big, then the charts per stream, the best times to stream, top supporters
// (from this PC's own log) and every stream. A range past what the plan keeps gets one calm
// Pro line, never a lock screen; without an account, one line on how to keep history.
// Hidden when this relay has no history at all.

import { useMemo, useState, type ReactNode } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import {
  ApiError,
  HISTORY_RANGES,
  formatCount,
  historyApi,
  historyRange,
  historySummary,
  insightsApi,
  proApi,
  type HistoryRange,
  type HistoryStream,
  type HistoryView,
} from '@ferrocast/api'
import { Button, EmptyState, Segmented, Skeleton } from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { ProChip } from '../components/pro/ProChip'
import { PlatformSplit, ViewersChart, WeeklyBars } from '../components/history/charts'
import { BestTimes, PerStream, StreamDetail, TopSupporters } from '../components/history/insights'
import { href } from '../lib/router'
import { startSignIn } from '../components/account/parts'
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
        <h3 className="font-display text-[18px] font-extrabold tracking-tight text-text">
          {title}
        </h3>
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
          <dt className="text-[14px] font-medium text-text-3">{k}</dt>
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

/** The calm line for a range past what a free account keeps (never shown to viewers). */
function KeptNote({ v }: { v: HistoryView }) {
  if (!v.limited || v.plan !== 'free') return null
  return (
    <p className="text-[14.5px] text-text-2" data-testid="history-limited">
      Showing the last {v.keep_days ?? 30} days, what a free account keeps. Pro keeps a year of
      insights.{' '}
      <a
        href={href({ name: 'plans' })}
        className="font-semibold text-accent-text underline-offset-2 hover:underline"
      >
        See Pro
      </a>
    </p>
  )
}

/** No Pro and no account on this PC: how to keep history (free). */
function NeedsAccount() {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-panel border border-line bg-surface-2 p-4"
      data-testid="history-account"
    >
      <p className="text-[16px] font-semibold text-text">Sign in to keep your stream history</p>
      <p className="text-[14.5px] text-text-2">
        A free Ferrocast account keeps the last 30 days of streams, with charts, best times and a
        CSV. Pro keeps a year.
      </p>
      <Button size="sm" onClick={() => void startSignIn()}>
        Sign in
      </Button>
    </div>
  )
}

function Body({ email, phone = false }: { email: boolean; phone?: boolean }) {
  const client = useClient()
  const [range, setRange] = useState<HistoryRange>('4w')
  // The range is fixed when picked, so a reload asks for the same window.
  const span = useMemo(() => historyRange(range, Date.now()), [range])
  const res = useResource((c) => historyApi(c).list(span), [span.from])
  // Top supporters come from this PC's own log, for the range the history shows.
  const sup = useResource(
    (c) =>
      phone
        ? Promise.resolve(null)
        : insightsApi(c).supporters({ from: res.data?.from ?? span.from, to: span.to }),
    [res.data?.from ?? span.from, phone],
  )
  const [picked, setPicked] = useState<HistoryStream | null>(null)
  const { busy, run } = useAction()
  const v = res.data
  const now = span.to
  const needsAccount = res.error instanceof ApiError && res.error.code === 'account_required'

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
      {needsAccount ? (
        <NeedsAccount />
      ) : res.error && !v ? (
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
          <KeptNote v={v} />
          <Tiles v={v} now={now} />
          <Section title="Viewers">
            <ViewersChart streams={v.streams} from={v.from} to={v.to} />
          </Section>
          <Section title="Stream by stream">
            <PerStream
              streams={v.streams}
              selected={picked ? `${picked.platform}:${picked.key}` : null}
              onSelect={setPicked}
            />
            {picked &&
            v.streams.some((s) => s.key === picked.key && s.platform === picked.platform) ? (
              <div className="rounded-panel border border-line bg-surface-2 p-4">
                <StreamDetail stream={picked} />
              </div>
            ) : null}
          </Section>
          <Section title="Best times to stream">
            <BestTimes streams={v.streams} now={now} />
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
          {!phone && (
            <Section title="Top supporters">
              {sup.error ? (
                <LoadError error={sup.error} onRetry={sup.reload} />
              ) : (
                <TopSupporters data={sup.data ?? null} />
              )}
            </Section>
          )}
          <Section
            title="Every stream"
            aside={
              <span className="font-mono text-[13.5px] text-text-3 tabular-nums">
                {formatCount(v.streams.length)}
              </span>
            }
          >
            <StreamTable
              streams={v.streams}
              now={now}
              selected={picked ? `${picked.platform}:${picked.key}` : null}
              onSelect={setPicked}
            />
            {v.truncated && (
              <p className="text-[14px] text-text-3">
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
        <PageHeader title="Insights" />
        <Body email={false} phone />
      </div>
    )
  return <DesktopHistory />
}

function DesktopHistory() {
  const pro = useResource((c) => proApi(c).status())
  const view = pro.error ? null : pro.data
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Insights"
        description="Your streams over time, the best times to stream and the people who support you."
      />
      {pro.loading && !pro.data ? (
        <Loading />
      ) : !view?.features.history ? (
        <EmptyState title="Not available here yet" />
      ) : (
        <Panel id="history" title="Your streams" actions={view.active ? <ProChip /> : undefined}>
          <Body email={!!view.features.weekly_email && view.active} />
        </Panel>
      )}
    </div>
  )
}
