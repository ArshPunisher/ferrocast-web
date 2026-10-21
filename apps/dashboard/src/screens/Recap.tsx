import { useMemo } from 'react'
import { ArrowClockwise, CopySimple } from '@phosphor-icons/react'
import {
  formatCount,
  plural,
  formatMoney,
  tameText,
  type Platform,
  type Recap as RecapData,
} from '@ferrocast/api'
import { Badge, Button, EmptyState, PlatformMark, Skeleton, copyText, toast } from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { RecapWriter } from '../components/smart'
import { useResource } from '../lib/hooks'
import { MarkersPanel } from '../components/studio/moments'
import { href } from '../lib/router'

function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`
}

/** "Ana, Bo and Cy". */
function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** The text the streamer pastes into chat, Discord or socials. */
export function thankYou(r: RecapData): string {
  if (!r.thanks.length) return 'Thank you all for hanging out today!'
  return `Thank you ${list(r.thanks)} for an amazing stream!`
}

function Who({ platform, name }: { platform: Platform; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PlatformMark platform={platform} size={13} />
      <span dir="auto" className="truncate text-sm font-medium text-text">
        {tameText(name)}
      </span>
    </span>
  )
}

function ListPanel<T>({
  title,
  rows,
  empty,
  render,
}: {
  title: string
  rows: T[]
  empty: string
  render: (row: T) => { key: string; who: { platform: Platform; name: string }; detail: string }
}) {
  return (
    <Panel title={title} actions={rows.length ? <Badge>{formatCount(rows.length)}</Badge> : null}>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-text-3">{empty}</p>
      ) : (
        <ul
          // Long lists scroll: focusable so keyboard users can scroll them too.
          tabIndex={0}
          aria-label={title}
          className="fc-scroll -mx-2 flex max-h-72 flex-col overflow-y-auto rounded-control focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          {rows.map((row) => {
            const r = render(row)
            return (
              <li
                key={r.key}
                className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5"
              >
                <Who {...r.who} />
                <span className="shrink-0 font-mono text-[13px] text-text-2 tabular-nums">
                  {r.detail}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function RecapBody({ r }: { r: RecapData }) {
  const text = useMemo(() => thankYou(r), [r])
  const start = r.started_at ?? 0
  const end = r.ended_at ?? Date.now()
  const tiles: [string, string][] = [
    ['Follows', formatCount(r.follows)],
    ['Subs', formatCount(r.subs)],
    ['Tips', r.tips.length ? r.tips.map(formatMoney).join(' + ') : '0'],
    ['Bits', formatCount(r.bits)],
    ['Peak viewers', formatCount(r.peak_viewers)],
    ['Messages', formatCount(r.messages)],
  ]
  const copy = async () => {
    const ok = await copyText(text)
    toast(
      ok
        ? { tone: 'ok', message: 'Thank-you copied. Paste it in chat, Discord or anywhere.' }
        : {
            tone: 'error',
            message: 'Couldn’t copy.',
            hint: 'Select the text and copy it yourself.',
          },
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-2">
        {r.live ? 'Live now' : 'Ended'} ·{' '}
        {new Date(start).toLocaleString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}{' '}
        · {duration(end - start)}
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-panel border border-line bg-surface-1 px-4 py-3">
            <dt className="text-[12.5px] text-text-3">{k}</dt>
            <dd
              className="mt-0.5 truncate font-mono text-xl font-semibold tracking-tight text-text tabular-nums"
              title={v}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <Panel
        title="Say thanks"
        description="Everyone who followed, subbed, tipped or raided, each once."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<CopySimple size={15} />}
            onClick={() => void copy()}
          >
            Copy
          </Button>
        }
      >
        <p
          dir="auto"
          className="rounded-control bg-surface-2 px-4 py-3 text-[15px] leading-relaxed text-text"
        >
          {tameText(text)}
        </p>
      </Panel>
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ListPanel
          title="Top chatters"
          rows={r.top_chatters}
          empty="Nobody chatted yet."
          render={(c) => ({
            key: `${c.platform}:${c.name}`,
            who: c,
            detail: `${formatCount(c.messages)} msgs`,
          })}
        />
        <ListPanel
          title="Subscribers"
          rows={r.subscribers}
          empty="No new subs or gifts this time."
          render={(s) => ({
            key: `${s.platform}:${s.name}`,
            who: s,
            detail: [
              s.months > 0 ? `${s.months} mo` : null,
              s.gifts > 0 ? `gifted ${formatCount(s.gifts)}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          })}
        />
        <ListPanel
          title="Tips and cheers"
          rows={r.tippers}
          empty="No tips this time."
          render={(t) => ({
            key: `${t.platform}:${t.name}`,
            who: t,
            detail: [
              ...t.amounts.map(formatMoney),
              t.bits > 0 ? `${formatCount(t.bits)} bits` : null,
            ]
              .filter(Boolean)
              .join(' + '),
          })}
        />
        <ListPanel
          title="Raids"
          rows={r.raiders}
          empty="No raids this time."
          render={(x) => ({
            key: `${x.platform}:${x.name}`,
            who: x,
            detail: plural(x.viewers, 'viewer', 'viewers'),
          })}
        />
        <ListPanel
          title="New followers"
          rows={r.new_followers}
          empty="No new followers this time."
          render={(f) => ({ key: `${f.platform}:${f.name}`, who: f, detail: '' })}
        />
      </div>
    </div>
  )
}

/** After (or during) a stream: the numbers, the people, and a thank-you to copy. */
export function Recap() {
  const recap = useResource((c) => c.recap())
  return (
    <div>
      <PageHeader
        title="Stream recap"
        description="Who showed up and who supported you, from Twitch, YouTube and Kick together."
        actions={
          <Button
            icon={<ArrowClockwise size={15} />}
            busy={recap.loading && !!recap.data}
            onClick={recap.reload}
          >
            Refresh
          </Button>
        }
      />
      {recap.error ? (
        <LoadError error={recap.error} onRetry={recap.reload} />
      ) : !recap.data ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the recap">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : recap.data.started_at === null ? (
        <EmptyState
          title="No stream yet"
          action={
            <a
              className="fc-press inline-flex h-10 items-center rounded-control border border-line-strong bg-surface-3 px-4 text-sm font-semibold text-text"
              href={href({ name: 'home' })}
            >
              Back to Home
            </a>
          }
        >
          Go live and the recap fills in by itself.
        </EmptyState>
      ) : (
        <>
          <RecapBody r={recap.data} />
          <div className="mt-5">
            <RecapWriter startedAt={recap.data.started_at} />
          </div>
          <div className="mt-5">
            <MarkersPanel since={recap.data.started_at} title="Moments to clip" />
          </div>
        </>
      )}
    </div>
  )
}
