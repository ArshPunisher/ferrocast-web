import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowsClockwise, Confetti, HandPalm, Trophy } from '@phosphor-icons/react'
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
  Skeleton,
  Switch,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'

function NewGiveaway({ onStarted }: { onStarted: (g: GiveawayView) => void }) {
  const client = useClient()
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
        cost: n,
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
      className="flex flex-col gap-4"
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
      <div className="grid grid-cols-2 gap-4">
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
      </div>
      <Switch
        label="Subscribers get 2 entries"
        description="Members and founders count too. You and bots can never enter."
        checked={subs}
        onChange={setSubs}
      />
      {err && !['prize', 'keyword', 'cost'].includes(err.field ?? '') && (
        <p role="alert" className="text-[13px] text-danger">
          {err.message}
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy} className="self-start">
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
            <p className="text-[12px] font-semibold text-accent-text">
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

/** Giveaways: start, watch entries come in, draw (and redraw) a winner. */
export function GiveawayPanel() {
  const client = useClient()
  const initial = useResource((c) => c.giveaway())
  const live = useLive((s) => s.giveaway)
  const { run, busy } = useAction()
  const [shown, setShown] = useState<GiveawayView | null>(null)
  const [composing, setComposing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
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
        <div className="flex flex-col gap-4">
          <div>
            <p dir="auto" className="font-display text-lg font-semibold tracking-tight text-text">
              {tameText(g.prize)}
            </p>
            <p className="mt-0.5 text-[13px] text-text-3">
              <span translate="no" className="font-mono text-text-2">
                {g.keyword}
              </span>{' '}
              to enter
              {g.cost > 0 ? ` · ${plural(g.cost, 'point', 'points')}` : ' · free'}
              {g.subscriber_bonus ? ' · subs get 2 entries' : ''}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            {[
              ['Entries', formatCount(g.entries)],
              ['Tickets', formatCount(g.tickets)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[12px] bg-surface-2 px-3 py-2">
                <dt className="text-[12px] text-text-3">{k}</dt>
                <dd
                  className="font-mono text-lg font-semibold text-text tabular-nums"
                  aria-live="polite"
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <WinnerCard g={g} />
          {g.entrants.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[13px] font-medium text-text-2 select-none hover:text-text">
                Who entered
              </summary>
              <ul className="fc-scroll mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                {g.entrants.slice(0, 200).map((e) => (
                  <li
                    key={`${e.platform}:${e.user_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12.5px] text-text-2"
                    title={`${PLATFORM_LABEL[e.platform]}${e.tickets > 1 ? ', 2 entries' : ''}`}
                  >
                    <PlatformMark platform={e.platform} size={11} />
                    <span dir="auto" className="max-w-[16ch] truncate">
                      {tameText(e.display_name)}
                    </span>
                    {e.tickets > 1 && <span className="font-mono text-[11px] text-text-3">×2</span>}
                  </li>
                ))}
              </ul>
              {g.entries > 200 && (
                <p className="mt-1.5 text-[12.5px] text-text-3">
                  And {formatCount(g.entries - 200)} more.
                </p>
              )}
            </details>
          )}
          {g.entries === 0 && g.open && (
            <EmptyState compact title="Waiting for entries">
              It’s been posted in chat. Entries show up here as they come in.
            </EmptyState>
          )}
          <div className="flex flex-wrap gap-2">
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
                <Button
                  variant="primary"
                  icon={<Trophy size={15} weight="fill" />}
                  disabled={g.entries === 0}
                  busy={busy === 'draw'}
                  onClick={() => act('draw', () => client.drawGiveaway())}
                >
                  Draw winner
                </Button>
                {g.open && (
                  <Button
                    icon={<HandPalm size={15} />}
                    busy={busy === 'close'}
                    onClick={() => act('close', () => client.closeGiveaway(), 'Entries closed.')}
                  >
                    Close entries
                  </Button>
                )}
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
            {!g.ended && (
              <Button variant="danger-ghost" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title="Cancel this giveaway?"
        description="Nobody wins, and everyone who paid points to enter gets them back."
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
