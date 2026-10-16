import { useEffect, useMemo, useState } from 'react'
import { ChartLineUp, CopySimple, Pause, Play, SkipForward } from '@phosphor-icons/react'
import { formatCount, formatMoney, type Actor, type SessionStats } from '@ferrocast/api'
import { Button, EmptyState, Skeleton, copyText, toast } from '@ferrocast/ui'
import { Panel } from '../components/Panel'
import { EventRow } from '../components/EventRow'
import { QueuePanel, TestAlertMenu, TtsApprovals } from '../components/alerts-live'
import {
  ChatLine,
  ChatScroller,
  Composer,
  ViewerCardDialog,
  useChatActions,
  type ReplyTarget,
} from '../components/chat'
import { selectFeed, useLive } from '../lib/store'
import { useAction, useClient, useFocusHeldTail, useNow, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { ObsWarnings, StartShowButton } from '../components/studio/home'
import { DontMissLane } from '../components/studio/moments'

function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

function Stats({ stats, now }: { stats: SessionStats | null; now: number }) {
  const viewers = useLive((s) => s.viewers)
  const total = (viewers.twitch ?? 0) + (viewers.youtube ?? 0) + (viewers.kick ?? 0)
  const tiles: [string, string][] = stats
    ? [
        ['Watching now', formatCount(total)],
        ['Peak', formatCount(Math.max(stats.peak_viewers, total))],
        ['Follows', formatCount(stats.follows)],
        ['Subs', formatCount(stats.subs)],
        ['Tips', stats.tips.length ? stats.tips.map(formatMoney).join(' + ') : '0'],
        ['Bits', formatCount(stats.bits)],
      ]
    : []
  return (
    <Panel
      title="This stream"
      actions={
        stats?.live && stats.started_at ? (
          <span className="font-mono text-[12.5px] text-text-3 tabular-nums">
            live {duration(now - stats.started_at)}
          </span>
        ) : null
      }
    >
      {!stats ? (
        <div className="grid grid-cols-2 gap-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-2 gap-y-2">
          {tiles.map(([k, v]) => (
            <div key={k} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
              <dt className="text-[12px] text-text-3">{k}</dt>
              <dd
                className="mt-0.5 truncate font-mono text-[19px] font-semibold tracking-tight text-text tabular-nums"
                title={v}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  )
}

export function Home() {
  const client = useClient()
  const now = useNow(10_000)
  const events = useLive((s) => s.events)
  const chat = useLive((s) => s.chat)
  const deleted = useLive((s) => s.deleted)
  const held = useLive((s) => s.held)
  const queue = useLive((s) => s.queue)
  const setQueue = useLive((s) => s.setQueue)
  const stats = useResource((c) => c.sessionStats())
  const overlays = useResource((c) => c.overlays())
  const { run, busy } = useAction()
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [card, setCard] = useState<Actor | null>(null)
  const { actions, dialogs } = useChatActions(setReply, setCard)
  const feed = useMemo(() => selectFeed(events, 8), [events])
  // Keyboard focus on a chat line stays put while new messages arrive.
  const { items: peek, hold } = useFocusHeldTail(chat, 30)

  useEffect(() => {
    const t = setInterval(stats.reload, 20_000)
    return () => clearInterval(t)
  }, [stats.reload])

  const main = overlays.data?.[0]
  const copyUrl = async () => {
    if (!main) return
    const ok = await copyText(main.url)
    toast(
      ok
        ? {
            tone: 'ok',
            message: `Copied the “${main.name}” overlay URL.`,
            hint: 'Paste it into an OBS Browser source. Keep it private: anyone with it sees your alerts.',
          }
        : {
            tone: 'error',
            message: 'Couldn’t copy the URL.',
            hint: 'Open Overlays and copy it from there.',
          },
    )
  }
  const paused = queue?.paused ?? false

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-[-0.03em] text-text sm:text-3xl">
            {stats.data?.live ? 'You’re live' : 'Ready when you are'}
          </h1>
          <p className="mt-1 text-sm text-text-3">Everything for this stream, on one screen.</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <StartShowButton />
          <TestAlertMenu variant="primary" />
          <Button
            icon={paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
            busy={busy === 'pause'}
            onClick={() =>
              void run(
                'pause',
                async () => {
                  const q = paused ? await client.queueResume() : await client.queuePause()
                  setQueue(q)
                  return q
                },
                { success: paused ? 'Alerts resumed.' : 'Alerts paused.' },
              )
            }
          >
            {paused ? 'Resume alerts' : 'Pause alerts'}
          </Button>
          <Button
            icon={<SkipForward size={16} weight="fill" />}
            disabled={!queue?.playing}
            busy={busy === 'skip'}
            onClick={() =>
              void run('skip', async () => {
                const q = await client.queueSkip()
                setQueue(q)
                return q
              })
            }
          >
            Skip alert
          </Button>
          <Button icon={<CopySimple size={16} />} disabled={!main} onClick={() => void copyUrl()}>
            Copy overlay URL
          </Button>
          <a
            href={href({ name: 'recap' })}
            className="fc-press inline-flex h-10 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface-3 px-4 text-sm font-semibold whitespace-nowrap text-text hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <ChartLineUp size={16} />
            Stream recap
          </a>
        </div>
      </div>

      <TtsApprovals />
      <ObsWarnings />
      <DontMissLane />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <QueuePanel className="lg:col-span-7" />
        <div className="lg:col-span-5">
          <Stats stats={stats.data} now={now} />
        </div>

        {/* the bottom row shares one height on wide screens; each card scrolls inside itself */}
        <Panel
          title="Recent events"
          className="lg:col-span-7 lg:h-[clamp(24rem,55vh,40rem)]"
          bodyClassName="fc-scroll max-h-[28rem] overflow-x-hidden overflow-y-auto overscroll-contain lg:max-h-none"
          actions={
            <a
              href={href({ name: 'chat' })}
              className="rounded-control px-2 py-1 text-[13px] font-semibold text-accent-text hover:bg-surface-2"
            >
              All events
            </a>
          }
        >
          {feed.length === 0 ? (
            <EmptyState compact title="No events yet">
              Follows, subs, tips and raids land here. Hover one to replay it or see why it didn’t
              alert.
            </EmptyState>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {feed.map((e) => (
                <EventRow key={e.id} event={e} now={now} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Chat"
          className="lg:col-span-5 lg:h-[clamp(24rem,55vh,40rem)]"
          bodyClassName="flex flex-col gap-3"
          actions={
            <a
              href={href({ name: 'chat' })}
              className="rounded-control px-2 py-1 text-[13px] font-semibold text-accent-text hover:bg-surface-2"
            >
              Open chat
            </a>
          }
        >
          <div {...hold} className="flex min-h-0 flex-1 flex-col">
            <ChatScroller
              count={peek.length}
              className="h-72 lg:h-auto lg:flex-1"
              label="Latest chat"
            >
              {peek.length === 0 ? (
                <EmptyState compact title="Chat is quiet">
                  Messages from Twitch, YouTube and Kick appear here together.
                </EmptyState>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {peek.map((e) => (
                    <ChatLine
                      key={e.id}
                      event={e}
                      now={now}
                      deleted={deleted.has(e.source_id ?? '')}
                      held={held.get(e.id)}
                      actions={actions}
                      dense
                    />
                  ))}
                </ul>
              )}
            </ChatScroller>
          </div>
          <Composer reply={reply} onClearReply={() => setReply(null)} compact />
        </Panel>
      </div>
      {dialogs}
      <ViewerCardDialog actor={card} onClose={() => setCard(null)} />
    </div>
  )
}
