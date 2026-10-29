import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowsClockwise,
  Confetti,
  Gift,
  HandPalm,
  MagnifyingGlass,
  Trophy,
} from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  POINTS_LIMITS,
  fieldError,
  formatCount,
  plural,
  tameText,
  type GiveawayView,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  PlatformMark,
  Sheet,
  Skeleton,
  Switch,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { isCloud } from '../../lib/boot'

function NewGiveaway({ onStarted }: { onStarted: (g: GiveawayView) => void }) {
  const client = useClient()
  // Cloud mode has no points (they live in the app's viewer database): entry is free.
  const cloud = isCloud(useLive((s) => s.conn))
  const [prize, setPrize] = useState('')
  const [keyword, setKeyword] = useState('!join')
  const [cost, setCost] = useState('0')
  const [subs, setSubs] = useState(false)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    setErr(null)
    const n = Number(cost.replace(/[,\s_]/g, '') || '0')
    if (!Number.isInteger(n) || n < 0 || n > POINTS_LIMITS.maxAdjust) {
      setErr({ field: 'cost', message: 'Use a whole number from 0 to 1,000,000,000.' })
      setBusy(false)
      return
    }
    try {
      const g = await client.startGiveaway({
        prize,
        keyword,
        cost: cloud ? 0 : n,
        subscriber_bonus: subs,
      })
      onStarted(g)
      toast({ tone: 'ok', message: `Giveaway started. Viewers type ${g.keyword} to enter.` })
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  const errFor = (f: string) => (err?.field === f ? err.message : null)
  return (
    <form
      className="flex flex-1 flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        void start()
      }}
    >
      <Field label="Prize" error={errFor('prize')}>
        {(p) => (
          <Input
            {...p}
            value={prize}
            maxLength={100}
            placeholder="A Steam key for Hades II…"
            onChange={(e) => setPrize(e.target.value)}
          />
        )}
      </Field>
      <div className={cloud ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <Field label="Keyword" error={errFor('keyword')}>
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              spellCheck={false}
              value={keyword}
              maxLength={33}
              onChange={(e) => setKeyword(e.target.value.replace(/\s/g, ''))}
            />
          )}
        </Field>
        {!cloud && (
          <Field label="Cost in points" hint="0 makes it free." error={errFor('cost')}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                className="font-mono tabular-nums"
                value={cost}
                maxLength={13}
                onChange={(e) => setCost(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>
      <Switch
        label="Subscribers get 2 entries"
        description="Members count too. You and bots can never enter."
        checked={subs}
        onChange={setSubs}
      />
      {err && !['prize', 'keyword', 'cost'].includes(err.field ?? '') && (
        <p role="alert" className="text-[14.5px] text-danger">
          {err.message}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        busy={busy}
        icon={<Gift size={16} weight="fill" />}
        className="mt-auto self-end"
      >
        Start giveaway
      </Button>
    </form>
  )
}

function WinnerCard({ g }: { g: GiveawayView }) {
  const reduce = useReducedMotion()
  const w = g.winners.at(-1)
  return (
    <AnimatePresence mode="wait" initial={false}>
      {w && (
        <motion.div
          key={`${w.platform}:${w.user_id}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3 rounded-panel border border-accent-line bg-accent-soft px-4 py-3"
          role="status"
        >
          <Trophy
            size={26}
            weight="fill"
            className="shrink-0 text-accent-text"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-accent-text">
              {g.winners.length > 1 ? `Winner (draw ${g.winners.length})` : 'Winner'}
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <PlatformMark platform={w.platform} size={15} />
              <span dir="auto" className="truncate font-display text-xl font-bold text-text">
                {tameText(w.display_name)}
              </span>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A small avatar: the name's first letter on its platform's colour. */
function Face({
  name,
  platform,
}: {
  name: string
  platform: GiveawayView['entrants'][number]['platform']
}) {
  const letter =
    name
      .replace(/[^\p{L}\p{N}]/gu, '')
      .charAt(0)
      .toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-surface-1 font-display text-[13px] font-extrabold text-white"
      style={{ background: `var(--fc-${platform})` }}
    >
      {letter}
    </span>
  )
}

/** Everyone who entered, with a search: the list in a side panel, never a tiny scroll box. */
function EntriesSheet({
  g,
  open,
  onClose,
}: {
  g: GiveawayView
  open: boolean
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle
      ? g.entrants.filter((e) => e.display_name.toLowerCase().includes(needle))
      : g.entrants
  }, [g.entrants, q])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Entries · ${formatCount(g.entries)}`}
      tools={
        <label className="relative block">
          <MagnifyingGlass
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-3"
          />
          <Input
            aria-label="Find someone who entered"
            data-keep-placeholder
            placeholder="Find someone…"
            className="pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      }
    >
      {shown.length === 0 ? (
        <p className="text-[15px] font-medium text-text-2">Nobody by that name.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label="Who entered">
          {shown.map((e) => (
            <li
              key={`${e.platform}:${e.user_id}`}
              className="flex h-12 items-center gap-3"
              title={PLATFORM_LABEL[e.platform]}
            >
              <Face name={e.display_name} platform={e.platform} />
              <span dir="auto" className="min-w-0 flex-1 truncate font-bold text-text">
                {tameText(e.display_name)}
              </span>
              <span className="text-[14px] font-semibold text-text-3">
                {e.tickets > 1 ? '2 entries' : '1 entry'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {g.entries > g.entrants.length && (
        <p className="mt-3 text-[14.5px] text-text-3">
          And {formatCount(g.entries - g.entrants.length)} more.
        </p>
      )}
    </Sheet>
  )
}

/** Giveaways: start, watch entries come in, draw (and redraw) a winner. */
export function GiveawayPanel() {
  const client = useClient()
  const initial = useResource((c) => c.giveaway())
  const live = useLive((s) => s.giveaway)
  const { run, busy } = useAction()
  const [shown, setShown] = useState<GiveawayView | null>(null)
  const [composing, setComposing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [seeing, setSeeing] = useState(false)
  useEffect(() => {
    if (initial.data) setShown(initial.data)
  }, [initial.data])
  useEffect(() => {
    if (live !== undefined) setShown(live)
  }, [live])
  const g = composing ? null : shown
  const act = (key: string, fn: () => Promise<GiveawayView>, success?: string) =>
    void run(key, fn, success ? { success } : {}).then((v) => v && setShown(v))
  return (
    <Panel
      title="Giveaway"
      icon={<Gift weight="fill" />}
      tone="var(--fc-accent)"
      className="h-full"
      bodyClassName="flex flex-col"
      description="Viewers enter by typing a keyword in chat, on any platform."
      actions={
        g && !g.ended ? (
          <Badge tone={g.open ? 'ok' : 'neutral'}>
            {g.open ? 'Taking entries' : 'Entries closed'}
          </Badge>
        ) : null
      }
    >
      {initial.error ? (
        <LoadError error={initial.error} onRetry={initial.reload} />
      ) : initial.loading && !shown ? (
        <Skeleton className="h-56" />
      ) : !g ? (
        <NewGiveaway
          onStarted={(v) => {
            setShown(v)
            setComposing(false)
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-3.5">
          <div>
            <p
              dir="auto"
              title={g.prize}
              className="truncate font-display text-[17px] font-bold tracking-tight text-text"
            >
              {tameText(g.prize)}
            </p>
            <p className="mt-0.5 text-[14.5px] font-medium text-text-2">
              <span translate="no" className="font-mono font-bold text-[var(--fc-molten-text)]">
                {g.keyword}
              </span>{' '}
              to enter
              {g.cost > 0 ? ` · ${plural(g.cost, 'point', 'points')}` : ' · free'}
              {g.subscriber_bonus ? ' · subs get 2 entries' : ''}
            </p>
          </div>
          {/* The count, big and centred; the latest faces under it. */}
          <dl className="my-auto flex justify-center gap-10 py-2 text-center">
            {[
              ['Entries', formatCount(g.entries)],
              ['Tickets', formatCount(g.tickets)],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col-reverse items-center">
                <dt className="text-[14px] font-semibold text-text-3">{k}</dt>
                <dd
                  className="font-display text-[44px] leading-none font-extrabold tracking-tight text-text tabular-nums"
                  aria-live="polite"
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {g.entrants.length > 0 && (
            <button
              type="button"
              onClick={() => setSeeing(true)}
              className="fc-press mx-auto flex max-w-full items-center gap-2.5 rounded-control px-2 py-1 hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <span className="flex">
                {g.entrants
                  .slice(-5)
                  .reverse()
                  .map((e, i) => (
                    <span key={`${e.platform}:${e.user_id}`} className={i > 0 ? '-ml-2' : ''}>
                      <Face name={e.display_name} platform={e.platform} />
                    </span>
                  ))}
              </span>
              <span className="min-w-0 truncate text-[14.5px] font-semibold text-text-2">
                {tameText(g.entrants.at(-1)?.display_name ?? '')}
                {g.entries > 1 ? ` and ${formatCount(g.entries - 1)} more` : ''}
              </span>
              <span className="shrink-0 text-[14.5px] font-bold text-accent-text">See all</span>
            </button>
          )}
          <WinnerCard g={g} />
          {g.entries === 0 && g.open && (
            <EmptyState compact title="Waiting for entries">
              It’s been posted in chat. Entries show up here as they come in.
            </EmptyState>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
            {!g.ended && (
              <Button variant="danger-ghost" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            )}
            <span className="flex-1" />
            {g.ended ? (
              <Button
                variant="primary"
                icon={<Confetti size={15} />}
                onClick={() => setComposing(true)}
              >
                New giveaway
              </Button>
            ) : g.winners.length === 0 ? (
              <>
                {g.open && (
                  <Button
                    variant="ghost"
                    icon={<HandPalm size={15} />}
                    aria-label="Close entries"
                    busy={busy === 'close'}
                    onClick={() => act('close', () => client.closeGiveaway(), 'Entries closed.')}
                  >
                    Close
                  </Button>
                )}
                <Button
                  variant="primary"
                  icon={<Trophy size={15} weight="fill" />}
                  disabled={g.entries === 0}
                  busy={busy === 'draw'}
                  onClick={() => act('draw', () => client.drawGiveaway())}
                >
                  Draw winner
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  busy={busy === 'end'}
                  onClick={() => act('end', () => client.endGiveaway(), 'Giveaway finished.')}
                >
                  Finish
                </Button>
                <Button
                  icon={<ArrowsClockwise size={15} />}
                  busy={busy === 'redraw'}
                  disabled={g.winners.length >= g.entries}
                  onClick={() => act('redraw', () => client.redrawGiveaway())}
                >
                  Redraw
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {g && <EntriesSheet g={g} open={seeing} onClose={() => setSeeing(false)} />}
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title="Cancel this giveaway?"
        description="Nobody wins. Points paid to enter go back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'cancel'}
              onClick={() =>
                void run('cancel', () => client.cancelGiveaway()).then((r) => {
                  setConfirmCancel(false)
                  if (!r) return
                  setShown(null)
                  toast({
                    tone: 'ok',
                    message:
                      r.refunded > 0
                        ? `Giveaway cancelled. Refunded ${formatCount(r.refunded)} ${r.refunded === 1 ? 'person' : 'people'}.`
                        : 'Giveaway cancelled.',
                  })
                })
              }
            >
              Cancel giveaway
            </Button>
          </>
        }
      />
    </Panel>
  )
}
