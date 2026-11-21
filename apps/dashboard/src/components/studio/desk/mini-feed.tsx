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
  const status = queue ? queueStatus({ paused, muted, waiting: queue.waiting.length }) : null
  const act = (key: string, fn: () => Promise<NonNullable<typeof queue>>) =>
    void run(key, fn, { once: true }).then((q) => q && setQueue(q))
  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-2 py-1.5">
      <div role="toolbar" aria-label="Alert controls" className="flex flex-wrap items-center gap-1">
        <IconButton
          size="xs"
          label={paused ? 'Resume alerts' : 'Pause alerts'}
          aria-pressed={paused}
          disabled={!queue || busy === 'q-pause'}
          className={cx(paused && 'bg-surface-3 text-text')}
          onClick={() => act('q-pause', paused ? client.queueResume : client.queuePause)}
        >
          {paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
        </IconButton>
        <IconButton
          size="xs"
          label="Skip this alert"
          disabled={!queue || !playing || busy === 'q-skip'}
          onClick={() => act('q-skip', client.queueSkip)}
        >
          <SkipForward size={15} weight="fill" />
        </IconButton>
        <IconButton
          size="xs"
          label={muted ? 'Unmute alert sounds' : 'Mute alert sounds'}
          aria-pressed={muted}
          disabled={!queue || busy === 'q-mute'}
          className={cx(muted && 'bg-surface-3 text-text')}
          onClick={() => act('q-mute', muted ? client.queueUnmute : client.queueMute)}
        >
          {muted ? <SpeakerSimpleSlash size={15} /> : <SpeakerSimpleHigh size={15} />}
        </IconButton>
        <IconButton
          size="xs"
          label="Send a test alert"
          disabled={busy === 'q-test'}
          onClick={() =>
            void run('q-test', () => client.test('follow'), { success: 'Test alert sent.' })
          }
        >
          <Flask size={15} />
        </IconButton>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
        <IconButton size="xs" label="Mark all as read" disabled={unread === 0} onClick={onMarkAll}>
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
      <div role="group" aria-label="Show event types" className="flex flex-wrap gap-1">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilter(f.id)}
            className={cx(
              'h-6 rounded-full border px-2 text-[13px] font-semibold',
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
        <p role="status" className="flex items-center gap-1.5 text-[13px] text-text-2">
          <BellSimpleSlash size={14} aria-hidden />
          {status}
        </p>
      )}
    </div>
  )
}

export function ReadMark({ unread, onRead }: { unread: boolean; onRead: () => void }) {
  if (!unread) return null
  return (
    <IconButton size="xs" label="Mark as read" onClick={onRead}>
      <Check size={14} />
    </IconButton>
  )
}
