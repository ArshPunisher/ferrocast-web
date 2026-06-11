import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowBendUpLeft,
  ArrowDown,
  Clock,
  IdentificationCard,
  PaperPlaneRight,
  Prohibit,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  Roles,
  describeError,
  relativeTime,
  tameText,
  type Actor,
  type ChatPlatform,
  type FerroEvent,
  type Platform,
  type ViewerCard as ViewerCardData,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  PlatformMark,
  Segmented,
  Skeleton,
  Textarea,
  cx,
  toast,
} from '@ferrocast/ui'
import { done, useAction, useClient } from '../lib/hooks'
import { PointsAdjuster, pointsLabel } from './community/points'
import { useLive } from '../lib/store'

const SAFE_IMG =
  /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/]|data:image\/(png|gif|webp|jpeg);)/i

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
}

/** A name colour only when it passes WCAG AA (4.5:1) on the current theme's panel. */
let themeCache: { light: boolean; at: number } | null = null
function isLightTheme(): boolean {
  const now = Date.now()
  if (themeCache && now - themeCache.at < 1000) return themeCache.light
  const root = document.documentElement
  const light =
    root.dataset.theme === 'light' ||
    (!root.dataset.theme && matchMedia('(prefers-color-scheme: light)').matches)
  themeCache = { light, at: now }
  return light
}

/** A name colour only when it passes WCAG AA (4.5:1) on the current theme's panel. */
export function readableColor(color: string | null): string | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined
  const bg = isLightTheme() ? '#ffffff' : '#16191e'
  const [a, b] = [luminance(color), luminance(bg)]
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return ratio >= 4.5 ? color : undefined
}

/** For tests: forget the cached theme. */
export function resetThemeCache(): void {
  themeCache = null
}

function RoleChips({ roles }: { roles: number }) {
  const chips: { label: string; tone: 'accent' | 'ok' | 'warn' | 'neutral' }[] = []
  if (roles & Roles.BROADCASTER) chips.push({ label: 'Streamer', tone: 'accent' })
  if (roles & Roles.MODERATOR) chips.push({ label: 'Mod', tone: 'ok' })
  if (roles & Roles.VIP) chips.push({ label: 'VIP', tone: 'neutral' })
  if (roles & Roles.FIRST_TIME) chips.push({ label: 'First message', tone: 'warn' })
  if (roles & Roles.BOT) chips.push({ label: 'Bot', tone: 'neutral' })
  if (!chips.length) return null
  return (
    <>
      {chips.map((c) => (
        <Badge key={c.label} tone={c.tone} className="h-[18px] px-1.5 text-[10.5px]">
          {c.label}
        </Badge>
      ))}
    </>
  )
}

export function MessageText({ event }: { event: FerroEvent }) {
  if (event.kind.type !== 'chat_message') return null
  const { content, is_action } = event.kind
  const frags = content.fragments.length
    ? content.fragments
    : [{ type: 'text' as const, text: content.text }]
  return (
    <span dir="auto" className={cx('break-words [overflow-wrap:anywhere]', is_action && 'italic')}>
      {frags.map((f, i) => {
        switch (f.type) {
          case 'text':
            return <span key={i}>{tameText(f.text, 3)}</span>
          case 'mention':
            return (
              <span key={i} className="font-semibold text-accent-text">
                @{tameText(f.login)}
              </span>
            )
          case 'link':
            return (
              <span
                key={i}
                className="underline decoration-text-3 underline-offset-2"
                title={f.url}
              >
                {tameText(f.url)}
              </span>
            )
          case 'emote':
            return SAFE_IMG.test(f.url) ? (
              <img
                key={i}
                src={f.url}
                alt={f.name}
                title={f.name}
                height={24}
                className="inline-block h-6 w-auto align-middle"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span key={i}>{f.name}</span>
            )
        }
      })}
    </span>
  )
}

export interface ChatActions {
  reply: (e: FerroEvent) => void
  remove: (e: FerroEvent) => void
  timeout: (e: FerroEvent, seconds: number) => void
  ban: (e: FerroEvent) => void
  card: (a: Actor) => void
  /** Touch screens: tap a line to get its actions in a sheet. */
  sheet: (e: FerroEvent) => void
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export const ChatLine = memo(function ChatLine({
  event,
  deleted,
  now,
  actions,
  dense,
  held,
}: {
  event: FerroEvent
  deleted: boolean
  /** The chat filter's reason, when it held this message for a mod. */
  held?: string | undefined
  now: number
  actions: ChatActions | null
  dense?: boolean
}) {
  if (event.kind.type !== 'chat_message') return null
  const a = event.kind.actor
  const color = readableColor(a.color)
  const mine = (a.roles & Roles.BROADCASTER) !== 0
  return (
    <li
      onClick={(ev) => {
        if (!actions || deleted || mine || !coarse()) return
        if ((ev.target as HTMLElement).closest('button')) return
        actions.sheet(event)
      }}
      className={cx(
        'fc-row group relative flex gap-2.5 rounded-control px-2 hover:bg-surface-2 focus-within:bg-surface-2',
        dense ? 'py-1' : 'py-1.5',
        deleted && 'opacity-45',
        held && !deleted && 'bg-warn-soft',
      )}
    >
      <PlatformMark platform={event.platform} size={14} className="mt-[3px]" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-text-2">
        <span className="mr-1.5 inline-flex flex-wrap items-center gap-1 align-baseline">
          <button
            type="button"
            disabled={!actions || a.id === null}
            onClick={() => actions?.card(a)}
            dir="auto"
            style={color ? { color } : undefined}
            className={cx(
              'max-w-[22ch] truncate text-left font-semibold enabled:hover:underline focus-visible:underline focus-visible:outline-none',
              !color && (mine ? 'text-accent-text' : 'text-text'),
            )}
            title={`${tameText(a.display_name)} on ${PLATFORM_LABEL[event.platform]}`}
          >
            {tameText(a.display_name)}
          </button>
          <RoleChips roles={a.roles} />
          {held && (
            <Badge tone="warn" className="h-[18px] px-1.5 text-[10.5px]" title={held}>
              Held for review
            </Badge>
          )}
        </span>
        {deleted ? (
          <span className="text-text-3 italic">Message deleted</span>
        ) : (
          <MessageText event={event} />
        )}
      </div>
      {actions && !deleted && !mine && (
        <div className="absolute top-0.5 right-1 hidden items-center gap-0.5 rounded-control border border-line bg-surface-1 p-0.5 shadow-2 group-hover:flex group-focus-within:flex">
          <IconButton
            size="sm"
            label="Reply on the same platform"
            onClick={() => actions.reply(event)}
          >
            <ArrowBendUpLeft size={15} />
          </IconButton>
          <IconButton size="sm" label="Delete message" onClick={() => actions.remove(event)}>
            <Trash size={15} />
          </IconButton>
          <IconButton
            size="sm"
            label="Time out for 10 minutes"
            onClick={() => actions.timeout(event, 600)}
          >
            <Clock size={15} />
          </IconButton>
          <IconButton
            size="sm"
            label="Ban everywhere"
            variant="danger-ghost"
            onClick={() => actions.ban(event)}
          >
            <Prohibit size={15} />
          </IconButton>
          <IconButton size="sm" label="Viewer card" onClick={() => actions.card(a)}>
            <IdentificationCard size={15} />
          </IconButton>
        </div>
      )}
      {!dense && (
        <time className="mt-[3px] shrink-0 font-mono text-[11px] text-text-3 tabular-nums group-hover:invisible group-focus-within:invisible">
          {relativeTime(event.received_at, now)}
        </time>
      )}
    </li>
  )
})

/** Keeps the newest line in view unless the reader scrolled up; then offers a jump button. */
export function ChatScroller({
  count,
  children,
  className,
  label,
}: {
  count: number
  children: ReactNode
  className?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)
  const stuckRef = useRef(true)
  stuckRef.current = stuck
  const [unseen, setUnseen] = useState(0)
  const last = useRef(count)
  const intent = useRef(0)
  const reduce = useReducedMotion()
  // Only a reader's own scroll unsticks the view; rows growing as they render must not.
  const markIntent = () => {
    intent.current = Date.now()
  }
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) el.scrollTop = el.scrollHeight
    })
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (stuck) el.scrollTop = el.scrollHeight
    else if (count > last.current) setUnseen((u) => u + (count - last.current))
    last.current = count
  }, [count, stuck])
  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (!atBottom && Date.now() - intent.current > 800) {
      el.scrollTop = el.scrollHeight
      return
    }
    setStuck(atBottom)
    if (atBottom) setUnseen(0)
  }
  return (
    <div className={cx('relative min-h-0', className)}>
      <div
        ref={ref}
        onScroll={onScroll}
        onWheel={markIntent}
        onTouchMove={markIntent}
        onKeyDown={markIntent}
        onPointerDown={markIntent}
        className="fc-scroll h-full overflow-y-auto overscroll-contain"
        role="log"
        aria-label={label}
        aria-live="off"
        tabIndex={0}
      >
        {children}
      </div>
      <AnimatePresence>
        {!stuck && (
          <motion.button
            type="button"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              const el = ref.current
              if (el) el.scrollTop = el.scrollHeight
              setStuck(true)
              setUnseen(0)
            }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-surface-1 px-3 py-1.5 text-[12.5px] font-semibold text-text shadow-pop"
          >
            <ArrowDown size={14} />
            {unseen > 0 ? `${unseen > 99 ? '99+' : unseen} new` : 'Latest'}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

type Target = 'all' | ChatPlatform

export interface ReplyTarget {
  event: FerroEvent
  name: string
}

export function Composer({
  reply,
  onClearReply,
  autoFocus,
  compact,
}: {
  reply: ReplyTarget | null
  onClearReply: () => void
  autoFocus?: boolean
  compact?: boolean
}) {
  const client = useClient()
  const connectors = useLive((s) => s.connectors)
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Target>('all')
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (reply) input.current?.focus()
  }, [reply])
  const connected = (p: ChatPlatform) => connectors?.[p].state === 'connected'
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      const r = await client.send(
        t,
        target === 'all' ? 'all' : [target],
        reply
          ? { platform: reply.event.platform, message_id: reply.event.source_id ?? reply.event.id }
          : undefined,
      )
      setText('')
      onClearReply()
      if (r.failed.length)
        toast({
          tone: 'warn',
          message: `Sent to ${r.sent.map((p) => PLATFORM_LABEL[p]).join(', ') || 'nowhere'}.`,
          hint: r.failed.map((f) => f.reason).join(' '),
        })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }
  const options: { value: Target; label: ReactNode; title?: string }[] = [
    { value: 'all', label: 'All' },
    ...(['twitch', 'youtube', 'kick'] as const).filter(connected).map((p) => ({
      value: p as Target,
      label: <PlatformMark platform={p} size={13} />,
      title: `Only ${PLATFORM_LABEL[p]}`,
    })),
  ]
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      className="flex flex-col gap-2"
    >
      {reply && (
        <div className="flex items-center gap-2 rounded-control border border-accent-line bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-text-2">
          <ArrowBendUpLeft size={14} className="shrink-0 text-accent-text" />
          <span className="min-w-0 flex-1 truncate">
            Replying to <span className="font-semibold text-text">{reply.name}</span> on{' '}
            {PLATFORM_LABEL[reply.event.platform]} only
          </span>
          <button
            type="button"
            onClick={onClearReply}
            aria-label="Cancel reply"
            className="inline-flex size-6 items-center justify-center rounded-[6px] hover:bg-surface-3"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {!reply && !compact && (
          <div className="mb-0.5 hidden shrink-0 sm:block">
            <Segmented
              label="Send to"
              size="sm"
              value={target}
              onChange={setTarget}
              options={options}
            />
          </div>
        )}
        <label className="sr-only" htmlFor="composer">
          Message
        </label>
        <Textarea
          id="composer"
          ref={input}
          autoFocus={autoFocus}
          rows={1}
          value={text}
          maxLength={500}
          enterKeyHint="send"
          placeholder={reply ? `Reply to ${reply.name}…` : 'Send a message to chat…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
            if (e.key === 'Escape' && reply) onClearReply()
          }}
          className="max-h-32 min-h-10 flex-1 resize-none py-2"
        />
        <Button
          type="submit"
          variant="primary"
          busy={sending}
          disabled={!text.trim()}
          aria-label="Send"
          className="h-10 px-3"
        >
          {!sending && <PaperPlaneRight size={17} weight="fill" />}
        </Button>
      </div>
    </form>
  )
}

/** Chat moderation actions with confirmation only where a mistake would hurt. */
export function useChatActions(
  setReply: (r: ReplyTarget | null) => void,
  openCard: (a: Actor) => void,
): { actions: ChatActions; dialogs: ReactNode } {
  const client = useClient()
  const { run, busy } = useAction()
  const [banning, setBanning] = useState<FerroEvent | null>(null)
  const [sheet, setSheet] = useState<FerroEvent | null>(null)
  const actions = useMemo<ChatActions>(
    () => ({
      reply: (e) =>
        e.kind.type === 'chat_message' &&
        setReply({ event: e, name: tameText(e.kind.actor.display_name) }),
      remove: (e) =>
        void run('del', () => client.deleteMessage(e.platform, e.source_id ?? e.id), {
          success: 'Message deleted.',
        }),
      timeout: (e) => {
        if (e.kind.type !== 'chat_message' || !e.kind.actor.id) return
        const name = tameText(e.kind.actor.display_name)
        void run(
          'to',
          () =>
            client.timeout(
              e.platform,
              e.kind.type === 'chat_message' ? (e.kind.actor.id ?? '') : '',
              600,
            ),
          {
            success: `${name} is timed out for 10 minutes.`,
          },
        )
      },
      ban: (e) => setBanning(e),
      card: openCard,
      sheet: (e) => setSheet(e),
    }),
    // Stable across renders so memo(ChatLine) can skip unchanged lines during a chat flood.
    [client, run, setReply, openCard],
  )
  const sheetActor = sheet?.kind.type === 'chat_message' ? sheet.kind.actor : null
  const target = banning?.kind.type === 'chat_message' ? banning.kind.actor : null
  const dialogs = (
    <>
      <Dialog
        open={sheet !== null}
        onClose={() => setSheet(null)}
        size="sm"
        title={sheetActor ? tameText(sheetActor.display_name) : 'Message'}
        description={
          sheet ? (
            <span className="line-clamp-3">
              <MessageText event={sheet} />
            </span>
          ) : null
        }
      >
        {sheet && sheetActor && (
          <div className="grid grid-cols-1 gap-2 pb-2">
            {(
              [
                [
                  'Reply on ' + PLATFORM_LABEL[sheet.platform],
                  () => actions.reply(sheet),
                  <ArrowBendUpLeft key="r" size={17} />,
                  false,
                ],
                ['Delete message', () => actions.remove(sheet), <Trash key="d" size={17} />, false],
                [
                  'Time out 10 minutes',
                  () => actions.timeout(sheet, 600),
                  <Clock key="t" size={17} />,
                  false,
                ],
                [
                  'Viewer card',
                  () => actions.card(sheetActor),
                  <IdentificationCard key="c" size={17} />,
                  false,
                ],
                ['Ban everywhere', () => actions.ban(sheet), <Prohibit key="b" size={17} />, true],
              ] as const
            ).map(([label, fn, icon, danger]) => (
              <Button
                key={label}
                size="lg"
                variant={danger ? 'danger' : 'secondary'}
                icon={icon}
                className="justify-start"
                onClick={() => {
                  setSheet(null)
                  fn()
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </Dialog>
      <BanDialog
        actor={target}
        platform={banning?.platform ?? null}
        busy={busy === 'ban'}
        onClose={() => setBanning(null)}
        onBan={(everywhere, reason) => {
          if (!target || !banning) return
          void run(
            'ban',
            () =>
              client.ban(
                {
                  platform: banning.platform,
                  user_id: target.id ?? '',
                  login: target.login ?? target.display_name,
                },
                everywhere,
                reason || undefined,
              ),
            {
              success: (r) =>
                r.failed.length
                  ? `Banned on ${r.banned.map((p) => PLATFORM_LABEL[p]).join(', ')}. Not on ${r.failed.map((f) => PLATFORM_LABEL[f.platform]).join(', ')}.`
                  : `${tameText(target.display_name)} is banned on ${r.banned.map((p) => PLATFORM_LABEL[p]).join(', ')}.`,
            },
          ).then((r) => r && setBanning(null))
        }}
      />
    </>
  )
  return { actions, dialogs }
}

export function BanDialog({
  actor,
  platform,
  busy,
  onClose,
  onBan,
}: {
  actor: Actor | null
  platform: Platform | null
  busy: boolean
  onClose: () => void
  onBan: (everywhere: boolean, reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [everywhere, setEverywhere] = useState(true)
  useEffect(() => {
    if (actor) {
      setReason('')
      setEverywhere(true)
    }
  }, [actor])
  return (
    <Dialog
      open={actor !== null}
      onClose={onClose}
      size="sm"
      title={actor ? `Ban ${tameText(actor.display_name)}?` : 'Ban'}
      description="They can't chat or come back with this account. You can unban them later from Moderation."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={() => onBan(everywhere, reason.trim())}>
            {everywhere
              ? 'Ban everywhere'
              : `Ban on ${platform ? PLATFORM_LABEL[platform] : 'this platform'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Where"
          value={everywhere ? 'all' : 'one'}
          onChange={(v) => setEverywhere(v === 'all')}
          options={[
            { value: 'all', label: 'Twitch, YouTube and Kick' },
            { value: 'one', label: platform ? `Only ${PLATFORM_LABEL[platform]}` : 'Only here' },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ban-reason" className="text-[13px] font-medium text-text-2">
            Reason <span className="font-normal text-text-3">optional, only mods see it</span>
          </label>
          <input
            id="ban-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spam, hate raid, scam link…"
            className="h-10 rounded-control border border-line-strong bg-inset px-3 text-sm text-text placeholder:text-text-3 focus:border-accent-text focus:outline-none"
          />
        </div>
      </div>
    </Dialog>
  )
}

export function ViewerCardDialog({ actor, onClose }: { actor: Actor | null; onClose: () => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const [card, setCard] = useState<ViewerCardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    if (!actor?.id) return
    let alive = true
    setCard(null)
    setError(null)
    setNote('')
    setSaved(null)
    client
      .viewer(actor.platform, actor.id)
      .then((c) => {
        if (!alive) return
        setCard(c)
        setNote(c.note)
        setSaved(c.note)
      })
      .catch((e: unknown) => {
        if (alive) {
          const d = describeError(e)
          setError(d.hint ? `${d.message} ${d.hint}` : d.message)
        }
      })
    return () => {
      alive = false
    }
  }, [actor, client])
  const saveNote = () => {
    // Only save a note we actually loaded and changed: never overwrite it with an empty draft.
    if (!actor?.id || !card || saved === null || note === saved) return
    void run('note', () => client.saveNote(actor.platform, actor.id ?? '', note), {
      success: 'Note saved.',
    }).then((r) => r && setSaved(r.text))
  }
  const fmtDate = (t: number | null) =>
    t
      ? new Date(t).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'Not following'
  return (
    <Dialog
      open={actor !== null}
      onClose={() => {
        saveNote()
        onClose()
      }}
      size="sm"
      title={actor ? tameText(actor.display_name) : 'Viewer'}
      description={
        actor ? (
          <span className="inline-flex items-center gap-1.5">
            <PlatformMark platform={actor.platform} size={13} />
            {PLATFORM_LABEL[actor.platform]}
            {actor.login ? ` · @${actor.login}` : ''}
          </span>
        ) : null
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : !card ? (
        <div className="grid grid-cols-2 gap-3" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="col-span-2 h-24" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2">
            {[
              ['Messages', card.messages.toLocaleString()],
              ['First seen', fmtDate(card.first_seen)],
              ['Following since', fmtDate(card.follows_since)],
              ['Timeouts', String(card.timeouts)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-control border border-line bg-surface-2 px-3 py-2">
                <dt className="text-[12px] text-text-3">{k}</dt>
                <dd className="mt-0.5 font-mono text-sm text-text tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-text-3">Points</span>
              <span className="font-mono text-sm font-semibold text-text tabular-nums">
                {pointsLabel(card.points, 'points')}
              </span>
            </p>
            <PointsAdjuster
              platform={card.platform}
              userId={card.user_id}
              name="points"
              points={card.points}
              onChange={(points) => setCard({ ...card, points })}
            />
          </div>
          {card.other_identities.length > 0 && (
            <p className="text-[13px] text-text-3">
              Also seen as{' '}
              {card.other_identities.map((o) => (
                <span key={o.platform} className="font-medium text-text-2">
                  @{o.login} on {PLATFORM_LABEL[o.platform]}
                </span>
              ))}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="viewer-note" className="text-[13px] font-medium text-text-2">
              Note <span className="font-normal text-text-3">only you and your mods see it</span>
            </label>
            <Textarea
              id="viewer-note"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Regular from the Sunday streams…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 't1'}
              onClick={() =>
                void run('t1', () => client.timeout(card.platform, card.user_id, 60), {
                  success: 'Timed out for 1 minute.',
                })
              }
            >
              Time out 1 min
            </Button>
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 't10'}
              onClick={() =>
                void run('t10', () => client.timeout(card.platform, card.user_id, 600), {
                  success: 'Timed out for 10 minutes.',
                })
              }
            >
              10 min
            </Button>
            {card.banned ? (
              <Button
                size="sm"
                variant="secondary"
                busy={busy === 'unban'}
                onClick={() =>
                  void run('unban', () => done(client.unban(card.platform, card.user_id)), {
                    success: 'Unbanned.',
                  }).then((ok) => ok && onClose())
                }
              >
                Unban
              </Button>
            ) : (
              <Button
                size="sm"
                variant="danger"
                busy={busy === 'ban'}
                onClick={() =>
                  void run(
                    'ban',
                    () =>
                      client.ban(
                        { platform: card.platform, user_id: card.user_id, login: card.login },
                        true,
                      ),
                    { success: 'Banned everywhere.' },
                  ).then((r) => r && onClose())
                }
              >
                Ban everywhere
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
