import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { PLATFORM_LABEL, Roles, type Actor, type ChatPlatform } from '@ferrocast/api'
import { Button, EmptyState, IconButton, InfoTip, PlatformMark, Segmented, cx } from '@ferrocast/ui'
import {
  ChatLine,
  ChatScroller,
  Composer,
  HighlightBanner,
  ViewerCardDialog,
  useChatActions,
  type ReplyTarget,
} from '../components/chat'
import { EventRow } from '../components/EventRow'
import { NeedsPc } from '../components/remote'
import { isLimited, useLive } from '../lib/store'
import { isCloud } from '../lib/boot'
import { useAction, useClient, useNow } from '../lib/hooks'
import { useHeldItems, useHeldSync } from '../lib/held'
import { useFlushPage, useWidePage } from '../lib/wide'
import { FEED_FILTERS, filterEvents, type FeedFilter } from '../lib/mini-feed'
import {
  clampEventsWidth,
  defaultEventsWidth,
  eventsWidthBounds,
  loadSavedEventsWidth,
  saveEventsWidth,
  stepEventsWidth,
} from '../lib/chat-split'

type Filter = 'all' | ChatPlatform | 'facebook'

export function Chat() {
  useWidePage()
  useFlushPage()

  const now = useNow(15_000)
  const client = useClient()
  const { busy, run } = useAction()
  const chat = useLive((s) => s.chat)
  const deleted = useLive((s) => s.deleted)
  const held = useLive((s) => s.held)
  const events = useLive((s) => s.events)
  const queue = useLive((s) => s.queue)
  const setQueue = useLive((s) => s.setQueue)
  const connectors = useLive((s) => s.connectors)
  const [filter, setFilter] = useState<Filter>('all')
  const [hideBots, setHideBots] = useState(true)
  const [onlyHeld, setOnlyHeld] = useState(false)
  const [eventFilter, setEventFilter] = useState<FeedFilter>('all')
  useHeldSync()
  const heldItems = useHeldItems()
  const [tab, setTab] = useState<'chat' | 'events'>('chat')
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [card, setCard] = useState<Actor | null>(null)
  const { actions, dialogs } = useChatActions(setReply, setCard)
  // A mod's phone through Ferrocast's servers reads and moderates chat: no composer, no events.
  const remote = useLive((s) => s.remote)
  const mod = remote?.role === 'mod'
  // The PC is off, the cloud bot stands in (M10): its chat, bans; no sending, no events.
  const limited = isLimited(remote)
  // Cloud mode (CLOUD.md): chat to read; sending and moderating need the app on a PC.
  const cloud = isCloud(useLive((s) => s.conn))

  const splitRef = useRef<HTMLDivElement>(null)
  const eventsPaneRef = useRef<HTMLDivElement>(null)
  const dragRafRef = useRef(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [savedWidth, setSavedWidth] = useState<number | null>(() => loadSavedEventsWidth())
  const [dragging, setDragging] = useState(false)

  useLayoutEffect(() => {
    const el = splitRef.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.clientWidth)
      if (w > 0) setContainerWidth((prev) => (prev === w ? prev : w))
    }
    measure()
    if (typeof ResizeObserver !== 'function') return
    let raf = 0
    const schedule = () => {
      if (raf) return
      if (typeof requestAnimationFrame !== 'function') {
        measure()
        return
      }
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mod, limited])

  const bounds = useMemo(() => eventsWidthBounds(containerWidth), [containerWidth])
  const eventsWidth = useMemo(
    () =>
      savedWidth !== null
        ? clampEventsWidth(savedWidth, containerWidth)
        : defaultEventsWidth(containerWidth),
    [savedWidth, containerWidth],
  )

  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clampEventsWidth(next, containerWidth)
      setSavedWidth(clamped)
      saveEventsWidth(clamped)
    },
    [containerWidth],
  )

  useEffect(() => {
    return () => {
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current)
      delete document.body.dataset.dockDrag
    }
  }, [])

  const onSplitterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const containerW = splitRef.current?.getBoundingClientRect().width ?? containerWidth
    const startW = eventsPaneRef.current?.getBoundingClientRect().width ?? eventsWidth
    if (containerW <= 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDragging(true)
    document.body.dataset.dockDrag = '1'
    const x0 = e.clientX
    let latest = startW

    const onMove = (m: PointerEvent) => {
      latest = clampEventsWidth(startW - (m.clientX - x0), containerW)
      if (typeof requestAnimationFrame !== 'function') {
        setSavedWidth(latest)
        return
      }
      if (dragRafRef.current) return
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = 0
        setSavedWidth(latest)
      })
    }
    const finish = (endEvent?: PointerEvent) => {
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = 0
      }
      if (endEvent && endEvent.type === 'pointerup') {
        latest = clampEventsWidth(startW - (endEvent.clientX - x0), containerW)
      }
      setSavedWidth(latest)
      setDragging(false)
      delete document.body.dataset.dockDrag
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      saveEventsWidth(latest)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
  }

  const onSplitterKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = stepEventsWidth(eventsWidth, e.key, e.shiftKey, containerWidth)
    if (next === null) return
    e.preventDefault()
    commitWidth(next)
  }

  const lines = useMemo(() => {
    // "Held" lists every held message, also ones from before the chat on screen.
    const source = onlyHeld ? heldItems.map((h) => h.event) : chat
    return source.filter(
      (e) =>
        e.kind.type === 'chat_message' &&
        (filter === 'all' || e.platform === filter) &&
        !(hideBots && (e.kind.actor.roles & Roles.BOT) !== 0),
    )
  }, [chat, heldItems, onlyHeld, filter, hideBots])

  const recentEvents = useMemo(() => [...events].reverse().slice(0, 80), [events])
  const feed = useMemo(() => filterEvents(recentEvents, eventFilter), [recentEvents, eventFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    let total = 0
    for (const e of chat) {
      if (e.kind.type !== 'chat_message') continue
      c[e.platform] = (c[e.platform] ?? 0) + 1
      total++
    }
    return { byPlatform: c, total }
  }, [chat])

  const paused = queue?.paused ?? false
  const muted = queue?.muted ?? false
  const waiting = queue?.waiting.length ?? 0
  const queueDotTone = !queue ? 'bg-text-3/50' : paused || muted ? 'bg-warn' : 'bg-ok'
  const queueFooterText = !queue
    ? cloud
      ? 'Alert queue unavailable in cloud'
      : 'Alert queue offline'
    : paused
      ? 'Alert queue paused'
      : muted
        ? 'Alert sounds muted'
        : queue.playing
          ? 'Playing alert'
          : 'Alert queue active'

  const chatPane = (
    <section
      aria-labelledby="chat-title"
      className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface-1 shadow-1"
    >
      <header
        data-testid="chat-pane-header"
        className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 @[520px]:min-h-11 @[520px]:flex-nowrap @[520px]:py-0"
      >
        <h1
          id="chat-title"
          className="mr-auto font-display text-[17px] font-extrabold tracking-tight text-text"
        >
          Chat
        </h1>
        {/* min-w-0: with four platforms it wraps inside its pill and the bar grows, instead of pushing Hide bots out of sight. */}
        <Segmented
          label="Show chat from"
          className="min-w-0"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: 'all',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span>All</span>
                  <span className="hidden font-mono text-[12px] tabular-nums opacity-85 @[580px]:inline">
                    {counts.total}
                  </span>
                </span>
              ),
            },
            ...(['twitch', 'youtube', 'kick', 'facebook'] as const)
              .filter((p) => connectors?.[p].state !== 'off')
              .map((p) => ({
                value: p as Filter,
                title: `Only ${PLATFORM_LABEL[p]}`,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformMark platform={p} size={12} />
                    <span className="hidden font-mono text-[12.5px] tabular-nums @[420px]:inline">
                      {counts.byPlatform[p] ?? 0}
                    </span>
                  </span>
                ),
              })),
          ]}
        />
        {!limited && !cloud && (
          <button
            type="button"
            aria-pressed={onlyHeld}
            onClick={() => setOnlyHeld((v) => !v)}
            title="Messages waiting for a mod"
            className={cx(
              'fc-press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold',
              'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              onlyHeld
                ? 'border-warn bg-warn-soft text-text'
                : heldItems.length > 0
                  ? 'border-warn/60 bg-warn-soft/50 text-text hover:bg-warn-soft'
                  : 'border-line text-text-3 hover:bg-surface-2',
            )}
          >
            Held
            <span className="font-mono tabular-nums">{heldItems.length}</span>
            <span className="sr-only">
              {heldItems.length === 1 ? 'message' : 'messages'} waiting
            </span>
          </button>
        )}
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold whitespace-nowrap text-text-2">
          <input
            type="checkbox"
            checked={hideBots}
            onChange={(e) => setHideBots(e.target.checked)}
            className="size-4 accent-[var(--fc-accent)]"
          />
          Hide bots
        </label>
      </header>
      {!cloud && <HighlightBanner />}
      <ChatScroller count={lines.length} className="flex-1" label="Merged chat">
        {lines.length === 0 ? (
          onlyHeld ? (
            <EmptyState title="Nothing waiting for a mod">
              Messages a filter holds show here with Approve and Remove.
            </EmptyState>
          ) : (
            <EmptyState title="Chat is quiet">
              Messages from every connected platform appear here, newest at the bottom.
            </EmptyState>
          )
        ) : (
          <ul className="@container flex min-w-0 flex-col px-1 py-1.5 sm:px-2">
            {lines.map((e) => (
              <ChatLine
                key={e.id}
                event={e}
                now={now}
                deleted={deleted.has(e.source_id ?? '')}
                held={held.get(e.id)}
                actions={cloud ? null : actions}
              />
            ))}
          </ul>
        )}
      </ChatScroller>
      {(limited && !mod) || cloud ? (
        <div className="border-t border-line px-3 py-2.5">
          <NeedsPc>
            {cloud
              ? 'Sending messages and moderating need the Ferrocast app on your PC.'
              : 'Sending messages needs your PC.'}
          </NeedsPc>
        </div>
      ) : (
        !mod && (
          <div className="border-t border-line px-3 py-2.5">
            <Composer reply={reply} onClearReply={() => setReply(null)} />
          </div>
        )
      )}
    </section>
  )

  const feedPane = (
    <section
      aria-labelledby="events-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface-1 shadow-1"
    >
      <header
        data-testid="events-pane-header"
        className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3"
      >
        <div className="flex min-w-0 items-center gap-1">
          <h2
            id="events-title"
            className="truncate font-display text-[17px] font-extrabold tracking-tight text-text"
          >
            Events
          </h2>
          <InfoTip label="About events">
            Hover one to replay it, or to see why it didn’t alert.
          </InfoTip>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            aria-label="Filter events"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value as FeedFilter)}
            className="fc-select h-8 cursor-pointer appearance-none rounded-control border border-line-strong bg-inset pr-8 pl-2.5 text-[13px] font-semibold text-text hover:border-text-3 focus:border-accent-text focus:shadow-[0_0_0_3px_var(--fc-accent-soft)] focus:outline-none"
          >
            {FEED_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <IconButton
            size="sm"
            variant={paused ? 'secondary' : 'outline'}
            label={paused ? 'Resume queue' : 'Pause queue'}
            aria-pressed={paused}
            disabled={!queue || cloud || busy === 'q-pause'}
            onClick={() =>
              void run('q-pause', paused ? client.queueResume : client.queuePause, {
                once: true,
              }).then((q) => q && setQueue(q))
            }
          >
            {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
          </IconButton>
        </div>
      </header>
      <div className="fc-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2">
        {recentEvents.length === 0 ? (
          <EmptyState compact title="No events yet">
            Follows, subs, tips and raids land here.
          </EmptyState>
        ) : feed.length === 0 ? (
          <EmptyState
            compact
            title="Nothing of this type yet"
            action={
              <Button size="xs" variant="outline" onClick={() => setEventFilter('all')}>
                Show all events
              </Button>
            }
          />
        ) : (
          <ul className="flex min-w-0 flex-col">
            {feed.map((e) => (
              <EventRow key={e.id} event={e} now={now} />
            ))}
          </ul>
        )}
      </div>
      <footer
        data-testid="events-queue-footer"
        className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-2 px-3 text-[12.5px] font-medium text-text-2"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', queueDotTone)} />
          <span className="truncate" title={queueFooterText}>
            {queueFooterText}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-text-2 tabular-nums">
          {waiting} waiting
        </span>
      </footer>
    </section>
  )

  const showFeed = !mod && !limited

  return (
    <div
      ref={splitRef}
      // `--fc-top`: sticky header height (Shell); `--fc-banners`: notice strip above main.
      className="flex h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-86px-env(safe-area-inset-bottom))] min-h-[360px] flex-col gap-2.5 sm:h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-88px-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-24px-var(--fc-statusbar,0px))] lg:flex-row lg:gap-0"
    >
      {showFeed && (
        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'chat', label: 'Chat' },
            { value: 'events', label: 'Events' },
          ]}
          className="self-start lg:hidden"
        />
      )}
      <div
        className={cx(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          showFeed && tab !== 'chat' && 'max-lg:hidden',
        )}
      >
        {chatPane}
      </div>
      {showFeed && (
        <>
          <div
            role="separator"
            tabIndex={0}
            data-testid="chat-events-splitter"
            aria-label="Resize Chat and Events"
            aria-orientation="vertical"
            aria-valuemin={bounds.min}
            aria-valuemax={bounds.max}
            aria-valuenow={eventsWidth}
            title="Drag or use left and right arrow keys to resize"
            onPointerDown={onSplitterPointerDown}
            onDoubleClick={() => commitWidth(defaultEventsWidth(containerWidth))}
            onKeyDown={onSplitterKeyDown}
            className="group relative hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none select-none focus-visible:outline-none lg:flex"
          >
            <span
              aria-hidden="true"
              className={cx(
                'h-10 w-1 rounded-full transition-colors',
                dragging
                  ? 'bg-arc'
                  : 'bg-line-strong group-hover:bg-arc group-focus-visible:bg-arc group-focus-visible:shadow-[var(--fc-focus)]',
              )}
            />
          </div>
          <div
            ref={eventsPaneRef}
            data-testid="chat-events-pane"
            style={{ '--events-w': `${eventsWidth}px` } as CSSProperties}
            className={cx(
              'flex min-h-0 min-w-0 flex-1 flex-col lg:h-full lg:w-[var(--events-w)] lg:flex-none lg:shrink-0',
              tab !== 'events' && 'max-lg:hidden',
            )}
          >
            {feedPane}
          </div>
        </>
      )}
      {dialogs}
      <ViewerCardDialog actor={card} onClose={() => setCard(null)} />
    </div>
  )
}
