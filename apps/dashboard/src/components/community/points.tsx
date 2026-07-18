import { useState } from 'react'
import { Coins, Minus, Plus } from '@phosphor-icons/react'
import {
  ApiError,
  POINTS_LIMITS,
  PLATFORM_LABEL,
  describeError,
  formatCount,
  tameText,
  type LeaderboardEntry,
  type LoyaltyConfig,
  type Platform,
} from '@ferrocast/api'
import {
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

/** "1,200 points", "1 point". */
export function pointsLabel(n: number, name: string): string {
  const unit =
    n === 1 && name.length > 1 && name.endsWith('s') && !name.endsWith('ss')
      ? name.slice(0, -1)
      : name
  return `${formatCount(n)} ${unit}`
}

/** A 400 like "delta: they have…" split into its field and message. */
function fieldError(e: unknown): { field: string | null; message: string } {
  const d = describeError(e)
  if (e instanceof ApiError && e.status === 400) {
    const m = /^(\w+): (.*)$/.exec(d.message)
    if (m) return { field: m[1] ?? null, message: m[2] ?? d.message }
  }
  return { field: null, message: d.hint ? `${d.message} ${d.hint}` : d.message }
}

/**
 * Add or take away points for one person: an amount and two buttons. Used in the
 * leaderboard dialog and on the viewer card.
 */
export function PointsAdjuster({
  platform,
  userId,
  name,
  points,
  onChange,
}: {
  platform: Platform
  userId: string
  name: string
  points: number
  onChange: (points: number) => void
}) {
  const client = useClient()
  const [amount, setAmount] = useState('100')
  const [busy, setBusy] = useState<'add' | 'take' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const n = Number(amount.replace(/[,\s_]/g, ''))
  const valid = Number.isInteger(n) && n > 0 && n <= POINTS_LIMITS.maxAdjust
  const go = async (sign: 1 | -1) => {
    if (!valid) {
      setErr('Enter a whole number from 1 to 1,000,000,000.')
      return
    }
    setBusy(sign > 0 ? 'add' : 'take')
    setErr(null)
    try {
      const r = await client.adjustPoints(platform, userId, sign * n)
      onChange(r.points)
      toast({
        tone: 'ok',
        message: `${sign > 0 ? 'Gave' : 'Took'} ${pointsLabel(n, r.name)}. Now ${pointsLabel(r.points, r.name)}.`,
      })
    } catch (e) {
      setErr(fieldError(e).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Field label={`Change ${name}`} error={err}>
        {(p) => (
          <div className="flex items-stretch gap-2">
            <Input
              {...p}
              inputMode="numeric"
              value={amount}
              maxLength={13}
              className="w-0 min-w-0 flex-1 font-mono tabular-nums"
              onChange={(e) => {
                setAmount(e.target.value)
                setErr(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void go(1)
                }
              }}
            />
            <Button
              variant="primary"
              icon={<Plus size={15} weight="bold" />}
              busy={busy === 'add'}
              onClick={() => void go(1)}
            >
              Add
            </Button>
            <Button
              icon={<Minus size={15} weight="bold" />}
              busy={busy === 'take'}
              disabled={points === 0}
              onClick={() => void go(-1)}
            >
              Take
            </Button>
          </div>
        )}
      </Field>
    </div>
  )
}

function Leaderboard({ name }: { name: string }) {
  const board = useResource((c) => c.leaderboard(20))
  const [editing, setEditing] = useState<LeaderboardEntry | null>(null)
  const max = board.data?.[0]?.points ?? 0
  return (
    <Panel
      title="Leaderboard"
      description={`Top 20 by ${name}. Linked accounts share one balance.`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={board.reload}
          busy={board.loading && !!board.data}
        >
          Refresh
        </Button>
      }
    >
      {board.error ? (
        <LoadError error={board.error} onRetry={board.reload} />
      ) : !board.data ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : board.data.length === 0 ? (
        <EmptyState compact title="Nobody has points yet">
          Viewers earn {name} by chatting while you’re live, and with follows, subs, tips and raids.
        </EmptyState>
      ) : (
        <ol className="-mx-2 flex flex-col" aria-label={`Leaderboard by ${name}`}>
          {board.data.map((e) => (
            <li key={`${e.platform}:${e.user_id}`}>
              <button
                type="button"
                onClick={() => setEditing(e)}
                className="fc-press grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <span
                  className={
                    e.rank <= 3
                      ? 'font-mono text-sm font-bold text-accent-text tabular-nums'
                      : 'font-mono text-sm text-text-3 tabular-nums'
                  }
                >
                  {e.rank}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlatformMark platform={e.platform} size={13} />
                    <span dir="auto" className="truncate text-sm font-semibold text-text">
                      {tameText(e.display_name)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="block h-1 origin-left rounded-full bg-accent/70"
                    style={{ transform: `scaleX(${max > 0 ? Math.max(0.03, e.points / max) : 0})` }}
                  />
                </span>
                <span className="font-mono text-sm font-semibold text-text tabular-nums">
                  {formatCount(e.points)}
                </span>
                <span className="sr-only">. Change {name}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing ? tameText(editing.display_name) : 'Points'}
        description={
          editing ? (
            <span className="inline-flex items-center gap-1.5">
              <PlatformMark platform={editing.platform} size={13} />
              {PLATFORM_LABEL[editing.platform]} · {pointsLabel(editing.points, name)}
            </span>
          ) : null
        }
      >
        {editing && (
          <div className="pb-2">
            <PointsAdjuster
              platform={editing.platform}
              userId={editing.user_id}
              name={name}
              points={editing.points}
              onChange={(points) => {
                setEditing({ ...editing, points })
                board.reload()
              }}
            />
          </div>
        )}
      </Dialog>
    </Panel>
  )
}

const RATE_FIELDS: { key: keyof LoyaltyConfig; label: string; hint: string }[] = [
  { key: 'follow_bonus', label: 'Per follow', hint: 'Once per person.' },
  { key: 'sub_bonus', label: 'Per sub', hint: 'Gifters get it for each gift.' },
  { key: 'tip_bonus', label: 'Per tip', hint: 'Tips, Super Chats, Bits, Kicks.' },
  { key: 'raid_bonus', label: 'Per raid', hint: 'For the streamer who raided.' },
]

function PointsSettings({
  cfg,
  onSaved,
}: {
  cfg: LoyaltyConfig
  onSaved: (c: LoyaltyConfig) => void
}) {
  const client = useClient()
  const { run } = useAction()
  const [draft, setDraft] = useState(cfg)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (draft !== cfg && JSON.stringify(draft) === JSON.stringify(cfg)) setDraft(cfg)
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg)
  const save = async (next: Partial<LoyaltyConfig>) => {
    setBusy(true)
    setErr(null)
    try {
      onSaved(await client.saveLoyalty(next))
      toast({ tone: 'ok', message: 'Points settings saved.' })
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  const num = (k: keyof LoyaltyConfig, p: Record<string, unknown> = {}) => (
    <Input
      inputMode="numeric"
      className="font-mono tabular-nums"
      value={String(draft[k])}
      maxLength={7}
      {...p}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '')
        setDraft({ ...draft, [k]: v === '' ? 0 : Number(v) })
      }}
    />
  )
  const errFor = (k: string) => (err?.field === k ? err.message : null)
  return (
    <Panel title="Earning" description="Smart defaults are on. Change only what you want.">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save(draft)
        }}
      >
        <Switch
          label={`Viewers earn ${cfg.name}`}
          description="The streamer, bots and anonymous supporters never earn."
          checked={cfg.enabled}
          onChange={(enabled) =>
            void run('on', () => client.saveLoyalty({ enabled })).then((c) => {
              if (!c) return
              setDraft((d) => ({ ...d, enabled: c.enabled }))
              onSaved(c)
            })
          }
        />
        <Field
          label="Name"
          hint={`Chat uses !points${draft.name.trim() && !draft.name.includes(' ') && draft.name.trim().toLowerCase() !== 'points' ? ` and !${draft.name.trim().toLowerCase()}` : ''}.`}
          error={errFor('name')}
        >
          {(p) => (
            <Input
              {...p}
              value={draft.name}
              maxLength={20}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-text-2">
            For chatting while live
          </legend>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 text-sm text-text-2">
            <label className="sr-only" htmlFor="per-interval">
              Points each time
            </label>
            {num('per_interval', {
              id: 'per-interval',
              'aria-invalid': errFor('per_interval') ? true : undefined,
            })}
            <span aria-hidden="true">every</span>
            <label className="sr-only" htmlFor="interval-min">
              Every how many minutes
            </label>
            {num('interval_min', {
              id: 'interval-min',
              maxLength: 3,
              'aria-invalid': errFor('interval_min') ? true : undefined,
            })}
            <span aria-hidden="true">min</span>
          </div>
          {(errFor('per_interval') ?? errFor('interval_min')) && (
            <p role="alert" className="text-[12.5px] font-medium text-danger">
              {errFor('per_interval') ?? errFor('interval_min')}
            </p>
          )}
        </fieldset>
        <div className="grid grid-cols-2 gap-4">
          {RATE_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} error={errFor(f.key)}>
              {(p) => num(f.key, p)}
            </Field>
          ))}
        </div>
        {err && !err.field && (
          <p role="alert" className="text-[13px] text-danger">
            {err.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(cfg)}>
              Undo
            </Button>
          )}
          <Button type="submit" variant="primary" busy={busy} disabled={!dirty}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  )
}

/** Points: the leaderboard and how they're earned. */
export function PointsSection() {
  const cfg = useResource((c) => c.loyalty())
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!cfg.data)
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    )
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Leaderboard name={cfg.data.name} />
      <PointsSettings cfg={cfg.data} onSaved={(c) => cfg.set(c)} />
    </div>
  )
}

export { Coins as PointsIcon }
