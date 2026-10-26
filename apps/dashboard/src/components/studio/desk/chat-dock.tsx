// Chat and Events as Studio panels: Ferrocast's merged chat (Twitch, YouTube and Kick in one)
// and the event feed beside the preview, where OBS has one platform's chat dock at a time.

import { useMemo, useState } from 'react'
import { Roles, type Actor } from '@ferrocast/api'
import { EmptyState, cx } from '@ferrocast/ui'
import {
  ChatLine,
  ChatScroller,
  Composer,
  ViewerCardDialog,
  useChatActions,
  type ReplyTarget,
} from '../../chat'
import { EventRow } from '../../EventRow'
import { useNow } from '../../../lib/hooks'
import { useLive } from '../../../lib/store'
import { DockHeader } from './layout'

export function ChatDock() {
  const now = useNow(15_000)
  const chat = useLive((s) => s.chat)
  const deleted = useLive((s) => s.deleted)
  const held = useLive((s) => s.held)
  const [hideBots, setHideBots] = useState(true)
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [card, setCard] = useState<Actor | null>(null)
  const { actions, dialogs } = useChatActions(setReply, setCard)
  const lines = useMemo(
    () =>
      chat.filter(
        (e) =>
          e.kind.type === 'chat_message' && !(hideBots && (e.kind.actor.roles & Roles.BOT) !== 0),
      ),
    [chat, hideBots],
  )
  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id="chat"
        actions={
          <button
            type="button"
            aria-pressed={!hideBots}
            onClick={() => setHideBots((v) => !v)}
            className={cx(
              'h-7 rounded-full border px-2.5 text-[13.5px] font-semibold',
              'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              hideBots ? 'border-line text-text-3 hover:bg-surface-2' : 'border-arc text-text',
            )}
          >
            Bots
          </button>
        }
      />
      <ChatScroller count={lines.length} className="flex-1" label="Chat">
        {lines.length === 0 ? (
          <EmptyState compact title="Chat is quiet" />
        ) : (
          <ul className="flex flex-col px-1 py-1.5">
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
      <div className="border-t border-line p-2">
        <Composer compact reply={reply} onClearReply={() => setReply(null)} />
      </div>
      {dialogs}
      <ViewerCardDialog actor={card} onClose={() => setCard(null)} />
    </section>
  )
}

export function EventsDock() {
  const now = useNow(15_000)
  const events = useLive((s) => s.events)
  const feed = useMemo(() => [...events].reverse().slice(0, 80), [events])
  return (
    <section aria-label="Events" className="flex min-h-0 flex-1 flex-col">
      <DockHeader id="events" />
      <div className="fc-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {feed.length === 0 ? (
          <EmptyState compact title="No events yet" />
        ) : (
          <ul className="flex flex-col">
            {feed.map((e) => (
              <EventRow key={e.id} event={e} now={now} compact />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
