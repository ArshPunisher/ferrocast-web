// The Mini Feed bar over the Studio's event list: pause, skip and mute the alerts, filter the
// feed by type, mark events read, and send a test alert.

import {
  BellSimpleSlash,
  Check,
  Checks,
  Pause,
  Play,
  SkipForward,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Flask,
} from '@phosphor-icons/react'
import { Badge, IconButton, cx } from '@ferrocast/ui'
import { useAction, useClient } from '../../../lib/hooks'
import { useLive } from '../../../lib/store'
import { FEED_FILTERS, queueStatus, type FeedFilter } from '../../../lib/mini-feed'

export function MiniFeedBar({
  filter,
  onFilter,
  unread,
  onMarkAll,
}: {
  filter: FeedFilter
  onFilter: (f: FeedFilter) => void
  unread: number
  onMarkAll: () => void
}) {
  const client = useClient()
  const queue = useLive((s) => s.queue)
  const setQueue = useLive((s) => s.setQueue)
  const { busy, run } = useAction()
  const paused = queue?.paused ?? false
  const muted = queue?.muted ?? false
  const playing = queue?.playing != null
  // One queue action at a time: a slower answer can never overwrite a newer one.
  const inFlight = busy !== null && busy.startsWith('q-')
  const status = queue ? queueStatus({ paused, muted, waiting: queue.waiting.length }) : null
  const act = (key: string, fn: () => Promise<NonNullable<typeof queue>>) =>
    !inFlight && void run(key, fn, { once: true }).then((q) => q && setQueue(q))
  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-2 py-1.5">
      <div role="group" aria-label="Alert controls" className="flex flex-wrap items-center gap-1">
        <IconButton
          size="sm"
          label="Pause alerts"
          aria-pressed={paused}
          disabled={!queue}
          aria-disabled={inFlight || undefined}
          className={cx(paused && 'bg-surface-3 text-text')}
          onClick={() => act('q-pause', paused ? client.queueResume : client.queuePause)}
        >
          {paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
        </IconButton>
        <IconButton
          size="sm"
          label="Skip this alert"
          disabled={!queue || !playing}
          aria-disabled={inFlight || undefined}
          onClick={() => act('q-skip', client.queueSkip)}
        >
          <SkipForward size={15} weight="fill" />
        </IconButton>
        <IconButton
          size="sm"
          label="Mute alert sounds"
          aria-pressed={muted}
          disabled={!queue}
          aria-disabled={inFlight || undefined}
          className={cx(muted && 'bg-surface-3 text-text')}
          onClick={() => act('q-mute', muted ? client.queueUnmute : client.queueMute)}
        >
          {muted ? <SpeakerSimpleSlash size={15} /> : <SpeakerSimpleHigh size={15} />}
        </IconButton>
        <IconButton
          size="sm"
          label="Send a test alert"
          aria-disabled={inFlight || undefined}
          onClick={() =>
            !inFlight &&
            void run('q-test', () => client.test('follow'), { success: 'Test alert sent.' })
          }
        >
          <Flask size={15} />
        </IconButton>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
        <IconButton size="sm" label="Mark all as read" disabled={unread === 0} onClick={onMarkAll}>
          <Checks size={15} />
        </IconButton>
        <span aria-live="polite" className="ml-auto">
          {unread > 0 ? (
            <Badge tone="accent" title={`${unread} unread`}>
              {unread > 99 ? '99+' : unread} new
            </Badge>
          ) : (
            <span className="text-[13px] text-text-3">All read</span>
          )}
        </span>
      </div>
      <div role="group" aria-label="Show event types" className="flex flex-wrap gap-1.5">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilter(f.id)}
            className={cx(
              'h-8 rounded-full border px-3 text-[13px] font-semibold',
              'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              filter === f.id
                ? 'border-arc text-text'
                : 'border-line text-text-3 hover:bg-surface-2',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {status && (
        <p
          role="status"
          className="flex min-w-0 items-center gap-1.5 break-words [overflow-wrap:anywhere] text-[13px] text-text-2"
        >
          <BellSimpleSlash size={14} aria-hidden />
          {status}
        </p>
      )}
    </div>
  )
}

export function ReadMark({
  unread,
  label,
  onRead,
}: {
  unread: boolean
  label: string
  onRead: () => void
}) {
  if (!unread) return null
  return (
    <IconButton
      size="sm"
      label={label}
      onClick={(e) => {
        // The button goes away once read: keep the keyboard's place on the row.
        const row = e.currentTarget.closest('li')
        row?.setAttribute('tabindex', '-1')
        onRead()
        row?.focus()
      }}
    >
      <Check size={14} />
    </IconButton>
  )
}
