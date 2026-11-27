import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, Question } from '@phosphor-icons/react'
import {
  actorOf,
  describeError,
  describeEvent,
  isAlertable,
  relativeTime,
  tameText,
  type FerroEvent,
  type WhyResult,
} from '@ferrocast/api'
import { Badge, Button, Dialog, IconButton, PlatformMark, Skeleton, cx } from '@ferrocast/ui'
import { useAction, useClient } from '../lib/hooks'
import { href } from '../lib/router'

const KIND_RULE: Record<string, string> = {
  follow: 'follow',
  subscription: 'sub',
  gift_batch: 'gift',
  platform_gift: 'bits',
  paid_message: 'superchat',
  tip: 'tip',
  raid: 'raid',
  reward_redemption: 'redeem',
}

export function EventRow({
  event,
  now,
  compact,
  unread,
  trailing,
}: {
  event: FerroEvent
  now: number
  compact?: boolean
  /** Mini Feed: an unread event gets a mark and a stronger row. */
  unread?: boolean
  trailing?: React.ReactNode
}) {
  const client = useClient()
  const { busy, run } = useAction()
  const [why, setWhy] = useState(false)
  const actor = actorOf(event)
  const d = describeEvent(event)
  const name = actor ? tameText(actor.anonymous ? 'Anonymous' : actor.display_name) : null
  const feedOnly = event.origin === 'backfill'
  const big =
    event.kind.type === 'tip' ||
    event.kind.type === 'paid_message' ||
    event.kind.type === 'raid' ||
    event.kind.type === 'gift_batch'
  return (
    <li
      data-unread={unread ? 'true' : undefined}
      className={cx(
        'group relative flex min-w-0 items-start gap-3 rounded-control px-2 py-2 hover:bg-surface-2 focus-within:bg-surface-2',
        unread && 'border-l-2 border-arc',
      )}
    >
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
        <PlatformMark platform={event.platform} size={14} />
      </span>
      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        <p className="text-sm leading-snug break-words [overflow-wrap:anywhere] text-text-2">
          {name && (
            <span
              dir="auto"
              className="font-semibold break-words [overflow-wrap:anywhere] text-text"
            >
              {name}
            </span>
          )}{' '}
          <span
            className={cx('break-words [overflow-wrap:anywhere]', big && 'font-medium text-text')}
          >
            {d.title}
          </span>
          {event.origin === 'test' && (
            <Badge className="ml-2 align-middle" tone="neutral">
              Test
            </Badge>
          )}
          {event.origin === 'replay' && (
            <Badge className="ml-2 align-middle" tone="neutral">
              Replay
            </Badge>
          )}
          {feedOnly && (
            <Badge
              className="ml-2 align-middle"
              tone="warn"
              title="Arrived after a reconnect, shown in the feed only"
            >
              Feed only
            </Badge>
          )}
        </p>
        {d.detail && !compact && (
          <p
            dir="auto"
            title={d.detail}
            className="mt-0.5 line-clamp-2 text-[14px] break-words [overflow-wrap:anywhere] text-text-3"
          >
            {d.detail}
          </p>
        )}
      </div>
      <time
        dateTime={new Date(event.received_at).toISOString()}
        title={new Date(event.received_at).toLocaleString()}
        className="mt-0.5 shrink-0 font-mono text-[12.5px] text-text-3 tabular-nums group-hover:invisible group-focus-within:invisible"
      >
        {relativeTime(event.received_at, now)}
      </time>
      <div
        className={cx(
          'pointer-events-none absolute top-1 flex items-center gap-0.5 rounded-control bg-surface-2 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
          trailing ? 'right-10' : 'right-1.5',
        )}
      >
        {isAlertable(event) && (
          <IconButton
            size="sm"
            label="Replay alert"
            disabled={busy !== null}
            onClick={() =>
              void run('replay', () => client.replay(event.id), { success: 'Replaying the alert.' })
            }
          >
            <ArrowCounterClockwise size={16} />
          </IconButton>
        )}
        <IconButton size="sm" label="Why did or didn't this alert?" onClick={() => setWhy(true)}>
          <Question size={16} />
        </IconButton>
      </div>
      {trailing && <div className="-my-1 shrink-0">{trailing}</div>}
      {why && <WhyDialog event={event} onClose={() => setWhy(false)} />}
    </li>
  )
}

export function WhyDialog({ event, onClose }: { event: FerroEvent; onClose: () => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const [result, setResult] = useState<WhyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    client
      .why(event.id)
      .then((r) => alive && setResult(r))
      .catch((e: unknown) => alive && setError(describeError(e).message))
    return () => {
      alive = false
    }
  }, [client, event.id])
  const actor = actorOf(event)
  const rule = KIND_RULE[event.kind.type]
  return (
    <Dialog
      open
      onClose={onClose}
      title={result?.alerted ? 'Why this alert played' : 'Why no alert played'}
      description={
        <>
          {actor ? (
            <span className="font-medium text-text">{tameText(actor.display_name)}</span>
          ) : (
            'This event'
          )}{' '}
          {describeEvent(event).title}
        </>
      }
      size="sm"
      footer={
        <>
          {rule && (
            <a
              href={href({ name: 'alerts', rule })}
              onClick={onClose}
              className="mr-auto text-[14px] font-semibold text-accent-text hover:underline"
            >
              Open the alert rule
            </a>
          )}
          {isAlertable(event) && (
            <Button
              variant="secondary"
              size="sm"
              busy={busy === 'replay'}
              onClick={() =>
                void run('replay', () => client.replay(event.id), {
                  success: 'Replaying the alert.',
                }).then(onClose)
              }
            >
              Replay alert
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : !result ? (
        <div className="flex flex-col gap-2 py-1" aria-busy="true">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.reasons.map((r) => (
            <li
              key={r}
              className="rounded-control border border-line bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-text-2"
            >
              {r}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
