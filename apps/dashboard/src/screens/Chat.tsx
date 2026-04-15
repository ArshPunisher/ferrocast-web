import { useMemo, useState } from 'react'
import { PLATFORM_LABEL, Roles, type Actor, type ChatPlatform } from '@ferrocast/api'
import { EmptyState, PlatformMark, Segmented, cx } from '@ferrocast/ui'
import {
  ChatLine,
  ChatScroller,
  Composer,
  ViewerCardDialog,
  useChatActions,
  type ReplyTarget,
} from '../components/chat'
import { EventRow } from '../components/EventRow'
import { useLive } from '../lib/store'
import { useMediaQuery, useNow } from '../lib/hooks'

type Filter = 'all' | ChatPlatform

export function Chat() {
  const now = useNow(15_000)
  const chat = useLive((s) => s.chat)
  const deleted = useLive((s) => s.deleted)
  const held = useLive((s) => s.held)
  const events = useLive((s) => s.events)
  const connectors = useLive((s) => s.connectors)
  const [filter, setFilter] = useState<Filter>('all')
  const [hideBots, setHideBots] = useState(true)
  const [tab, setTab] = useState<'chat' | 'events'>('chat')
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [card, setCard] = useState<Actor | null>(null)
  const { actions, dialogs } = useChatActions(setReply, setCard)
  const wide = useMediaQuery('(min-width: 1024px)')

  const lines = useMemo(
    () =>
      chat.filter(
        (e) =>
          e.kind.type === 'chat_message' &&
          (filter === 'all' || e.platform === filter) &&
          !(hideBots && (e.kind.actor.roles & Roles.BOT) !== 0),
      ),
    [chat, filter, hideBots],
  )
  const feed = useMemo(() => [...events].reverse().slice(0, 80), [events])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of chat) c[e.platform] = (c[e.platform] ?? 0) + 1
    return c
  }, [chat])

  const chatPane = (
    <section
      aria-labelledby="chat-title"
      className="flex min-h-0 flex-1 flex-col rounded-panel border border-line bg-surface-1 shadow-1"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <h1
          id="chat-title"
          className="mr-auto font-display text-[17px] font-semibold tracking-tight"
        >
          Chat
        </h1>
        <Segmented
          label="Show chat from"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            ...(['twitch', 'youtube', 'kick'] as const)
              .filter((p) => connectors?.[p].state !== 'off')
              .map((p) => ({
                value: p as Filter,
                title: `Only ${PLATFORM_LABEL[p]}`,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformMark platform={p} size={12} />
                    <span className="hidden font-mono text-[11px] tabular-nums sm:inline">
                      {counts[p] ?? 0}
                    </span>
                  </span>
                ),
              })),
          ]}
        />
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-text-3">
          <input
            type="checkbox"
            checked={hideBots}
            onChange={(e) => setHideBots(e.target.checked)}
            className="size-4 accent-[var(--fc-accent)]"
          />
          Hide bots
        </label>
      </header>
      <ChatScroller count={lines.length} className="flex-1" label="Merged chat">
        {lines.length === 0 ? (
          <EmptyState title="Chat is quiet">
            Messages from every connected platform appear here, newest at the bottom.
          </EmptyState>
        ) : (
          <ul className="flex flex-col px-1 py-2 sm:px-2">
            {lines.map((e) => (
              <ChatLine
                key={e.id}
                event={e}
                now={now}
                deleted={deleted.has(e.source_id ?? '')}
                held={held.get(e.id)}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </ChatScroller>
      <div className="border-t border-line p-3 sm:p-4">
        <Composer reply={reply} onClearReply={() => setReply(null)} />
      </div>
    </section>
  )

  const feedPane = (
    <section
      aria-labelledby="events-title"
      className="flex min-h-0 flex-col rounded-panel border border-line bg-surface-1 shadow-1"
    >
      <header className="border-b border-line px-4 py-3">
        <h2 id="events-title" className="font-display text-[15px] font-semibold tracking-tight">
          Events
        </h2>
        <p className="mt-0.5 text-[12.5px] text-text-3">
          Hover an event to replay it or ask why it didn’t alert.
        </p>
      </header>
      <div className="fc-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {feed.length === 0 ? (
          <EmptyState compact title="No events yet" />
        ) : (
          <ul className="flex flex-col">
            {feed.map((e) => (
              <EventRow key={e.id} event={e} now={now} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )

  return (
    <div className="flex h-[calc(100dvh-56px-20px-88px-env(safe-area-inset-bottom))] min-h-[420px] flex-col gap-3 sm:h-[calc(100dvh-56px-28px-88px)] lg:h-[calc(100dvh-56px-28px-48px)] lg:flex-row lg:gap-5">
      {wide ? (
        <>
          {chatPane}
          <div className="flex w-[360px] shrink-0 flex-col xl:w-[400px]">{feedPane}</div>
        </>
      ) : (
        <>
          <Segmented
            label="View"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'chat', label: 'Chat' },
              { value: 'events', label: 'Events' },
            ]}
            className="self-start"
          />
          <div className={cx('flex min-h-0 flex-1 flex-col', tab !== 'chat' && 'hidden')}>
            {chatPane}
          </div>
          <div className={cx('flex min-h-0 flex-1 flex-col', tab !== 'events' && 'hidden')}>
            {feedPane}
          </div>
        </>
      )}
      {dialogs}
      <ViewerCardDialog actor={card} onClose={() => setCard(null)} />
    </div>
  )
}
