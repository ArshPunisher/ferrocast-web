// Moderation's review list of held messages: the chat filter or panic mode kept them off
// chat overlays until a mod decides. The same Approve / Remove buttons sit on each held
// line in Chat.

import { Badge, EmptyState, PlatformMark, Skeleton } from '@ferrocast/ui'
import { tameText } from '@ferrocast/api'
import { LoadError, Panel } from './Panel'
import { HeldButtons, MessageText } from './chat'
import { useHeldActions, useHeldItems, useHeldSync } from '../lib/held'

/** Moderation's review list. */
export function HeldPanel() {
  const sync = useHeldSync()
  const items = useHeldItems()
  const { approve, remove, busy } = useHeldActions()
  return (
    <Panel
      id="held"
      title={
        <span className="inline-flex items-center gap-2">
          Held for review
          {items.length > 0 && <Badge tone="warn">{items.length}</Badge>}
        </span>
      }
      description="Messages the chat filter or panic mode kept off your overlays. Approve shows one; Remove deletes it on its platform."
    >
      {sync.error && items.length === 0 ? (
        <LoadError error={sync.error} onRetry={sync.reload} />
      ) : sync.loading && items.length === 0 ? (
        <Skeleton className="h-16" />
      ) : items.length === 0 ? (
        <EmptyState compact title="Nothing waiting">
          When a filter is set to “Hold it for a mod”, or panic mode holds first-time chatters,
          their messages wait here.
        </EmptyState>
      ) : (
        <ul className="-mx-2 flex flex-col" aria-label="Held messages">
          {items.map(({ event, reason }) => {
            const a = event.kind.type === 'chat_message' ? event.kind.actor : null
            return (
              <li
                key={event.id}
                className="flex flex-col gap-2 rounded-control px-2 py-2.5 hover:bg-surface-2 sm:flex-row sm:items-start"
              >
                <div className="flex min-w-0 flex-1 gap-2.5">
                  <PlatformMark platform={event.platform} size={15} className="mt-[3px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-text-2">
                      <span dir="auto" className="mr-1.5 font-semibold text-text">
                        {a ? tameText(a.display_name) : 'Someone'}
                      </span>
                      <MessageText event={event} />
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-text-3">{reason}</p>
                  </div>
                </div>
                <HeldButtons
                  event={event}
                  onApprove={approve}
                  onRemove={remove}
                  busy={busy.has(event.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
