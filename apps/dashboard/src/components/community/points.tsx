import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  ChatCircleDots,
  Coins,
  Crown,
  CurrencyCircleDollar,
  GearSix,
  Heart,
  MagnifyingGlass,
  Minus,
  Plus,
  Star,
  Sword,
  Trophy,
} from '@phosphor-icons/react'
import {
  POINTS_LIMITS,
  PLATFORM_LABEL,
  fieldError,
  formatCount,
  tameText,
  type LeaderboardEntry,
  type LoyaltyConfig,
  type Platform,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  Field,
  Input,
  PlatformMark,
  Sheet,
  Skeleton,
  Switch,
  cx,
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

const MEDAL = ['var(--fc-gold)', 'var(--fc-silver)', 'var(--fc-bronze)']

/** One person on the board: rank (a crown for the top three), face, name, points. */
function Row({ e, onPick, name }: { e: LeaderboardEntry; onPick: () => void; name: string }) {
  const letter =
    e.display_name
      .replace(/[^\p{L}\p{N}]/gu, '')
      .charAt(0)
      .toUpperCase() || '?'
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={`${e.display_name} · ${PLATFORM_LABEL[e.platform]}`}
        className="fc-press grid h-12 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 text-left hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <span className="grid place-items-center font-mono text-[15px] font-bold text-text-3 tabular-nums">
          {e.rank <= 3 ? (
            <Crown
              size={20}
              weight="fill"
              style={{ color: MEDAL[e.rank - 1] }}
              aria-label={`${e.rank}`}
            />
          ) : (
            e.rank
          )}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full font-display text-[13px] font-extrabold text-white"
            style={{ background: `var(--fc-${e.platform})` }}
          >
            {letter}
          </span>
          <span dir="auto" className="truncate font-bold text-text">
            {tameText(e.display_name)}
          </span>
        </span>
        <span className="font-mono text-[15.5px] font-bold text-text tabular-nums">
          {formatCount(e.points)}
        </span>
        <span className="sr-only">. Change {name}</span>
      </button>
    </li>
  )
}

/** The adjuster for one person, over the board or the full list. */
function Adjust({
  editing,
  setEditing,
  name,
  onChanged,
}: {
  editing: LeaderboardEntry | null
  setEditing: (e: LeaderboardEntry | null) => void
  name: string
  onChanged: () => void
}) {
  return (
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
              onChanged()
            }}
          />
        </div>
      )}
    </Dialog>
  )
}

/** The top 100 with a search, in a side panel. */
function AllViewers({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  const board = useResource((c) => (open ? c.leaderboard(100) : Promise.resolve([])), [open])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<LeaderboardEntry | null>(null)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = board.data ?? []
    return needle ? all.filter((e) => e.display_name.toLowerCase().includes(needle)) : all
  }, [board.data, q])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Top 100 viewers"
      tools={
        <label className="relative block">
          <MagnifyingGlass
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-3"
          />
          <Input
            aria-label="Find a viewer"
            data-keep-placeholder
            placeholder="Find a viewer…"
            className="pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      }
    >
      {board.error ? (
        <LoadError error={board.error} onRetry={board.reload} />
      ) : !board.data ? (
        <Skeleton className="h-80" />
      ) : shown.length === 0 ? (
        <p className="text-[15px] font-medium text-text-2">Nobody by that name.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line" aria-label={`Top 100 by ${name}`}>
          {shown.map((e) => (
            <Row
              key={`${e.platform}:${e.user_id}`}
              e={e}
              name={name}
              onPick={() => setEditing(e)}
            />
          ))}
        </ol>
      )}
      <Adjust editing={editing} setEditing={setEditing} name={name} onChanged={board.reload} />
    </Sheet>
  )
}

/** On the card: the top 10, in two columns where there's room. */
const ON_CARD = 10

function Leaderboard({ name }: { name: string }) {
  const board = useResource((c) => c.leaderboard(ON_CARD))
  const [editing, setEditing] = useState<LeaderboardEntry | null>(null)
  const [all, setAll] = useState(false)
  const rows = board.data ?? []
  return (
    <Panel
      title="Top viewers"
      icon={<Trophy weight="fill" />}
      tone="var(--fc-tips)"
      className="h-full"
      bodyClassName="flex flex-col"
      description={`By ${name}. Linked accounts share one balance; click someone to change theirs.`}
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
      ) : rows.length === 0 ? (
        <p className="text-[15px] font-medium text-text-2">
          Nobody has {name} yet. Viewers earn them by chatting live, following, subbing, tipping and
          raiding.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {/* One list, read in order; two columns where there's room. */}
          <ol
            className="gap-x-8 md:columns-2 [&>li]:break-inside-avoid [&>li]:border-b [&>li]:border-line"
            aria-label={`Leaderboard by ${name}`}
          >
            {rows.map((e) => (
              <Row
                key={`${e.platform}:${e.user_id}`}
                e={e}
                name={name}
                onPick={() => setEditing(e)}
              />
            ))}
          </ol>
          {rows.length >= ON_CARD && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-auto self-start text-accent-text!"
              onClick={() => setAll(true)}
            >
              See the top 100 <ArrowRight size={14} weight="bold" />
            </Button>
          )}
        </div>
      )}
      <Adjust editing={editing} setEditing={setEditing} name={name} onChanged={board.reload} />
      <AllViewers open={all} onClose={() => setAll(false)} name={name} />
    </Panel>
  )
}

const RATE_FIELDS: { key: keyof LoyaltyConfig; label: string; hint: string }[] = [
  { key: 'follow_bonus', label: 'Per follow', hint: 'Once per person.' },
  { key: 'sub_bonus', label: 'Per sub', hint: 'Gifters get it per gift.' },
  { key: 'tip_bonus', label: 'Per tip', hint: 'Tips, Super Chats, Bits, Kicks.' },
  { key: 'raid_bonus', label: 'Per raid', hint: 'To the raiding streamer.' },
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
    <div>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save(draft)
        }}
      >
        <Switch
          label={`Viewers earn ${cfg.name}`}
          description="You, bots and anonymous supporters never earn."
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
          <legend className="mb-1.5 text-[14.5px] font-medium text-text-2">
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
            <p role="alert" className="text-[14.5px] font-medium text-danger">
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
          <p role="alert" className="text-[14.5px] text-danger">
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
    </div>
  )
}

/** How points are earned, in a line of chips; Edit opens the form in a side panel. */
function PointsCard({ cfg, onSaved }: { cfg: LoyaltyConfig; onSaved: (c: LoyaltyConfig) => void }) {
  const [editing, setEditing] = useState(false)
  const chips: [ReactNode, string, string][] = [
    [
      <ChatCircleDots key="c" weight="fill" />,
      `${formatCount(cfg.per_interval)} / ${cfg.interval_min} min`,
      'For chatting',
    ],
    [<Heart key="h" weight="fill" />, formatCount(cfg.follow_bonus), 'Per follow'],
    [<Star key="s" weight="fill" />, formatCount(cfg.sub_bonus), 'Per sub'],
    [<CurrencyCircleDollar key="t" weight="fill" />, formatCount(cfg.tip_bonus), 'Per tip'],
    [<Sword key="r" weight="fill" />, formatCount(cfg.raid_bonus), 'Per raid'],
  ]
  return (
    <Panel
      title={cfg.name.charAt(0).toUpperCase() + cfg.name.slice(1)}
      icon={<Coins weight="fill" />}
      tone="var(--fc-tips)"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<GearSix size={15} />}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      }
    >
      {cfg.enabled ? (
        <ul className="flex flex-wrap gap-2" aria-label="How viewers earn">
          {chips.map(([icon, value, label]) => (
            <li
              key={label}
              title={label}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 font-semibold text-text"
            >
              <span aria-hidden="true" className="text-[var(--fc-tips)]">
                {icon}
              </span>
              <span className="sr-only">{label}: </span>
              <span className="tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] font-medium text-text-2">Off: viewers don’t earn {cfg.name}.</p>
      )}
      <Sheet open={editing} onClose={() => setEditing(false)} title={`Earning ${cfg.name}`}>
        <PointsSettings cfg={cfg} onSaved={onSaved} />
      </Sheet>
    </Panel>
  )
}

/** Points: the leaderboard and how they're earned. */
export function PointsSection({ beside }: { beside?: ReactNode }) {
  const cfg = useResource((c) => c.loyalty())
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!cfg.data)
    return (
      <div
        className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        aria-busy="true"
      >
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    )
  return (
    <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Leaderboard name={cfg.data.name} />
      <div className={cx('flex flex-col gap-5', '[&>:last-child]:flex-1')}>
        <PointsCard cfg={cfg.data} onSaved={(c) => cfg.set(c)} />
        {beside}
      </div>
    </div>
  )
}

export { Coins as PointsIcon }
