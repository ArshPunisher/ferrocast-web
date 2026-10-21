// Goals on the Community page: what each goal counts, its progress (live from `goals` frames),
// a nudge by hand, a new goal and deleting one. The same engine paths in the app and in cloud
// mode (ferrocast docs/CLOUD.md §7.1); overlays show a goal through a Goal widget.

import { useEffect, useId, useState } from 'react'
import { Minus, Plus, Target, Trash } from '@phosphor-icons/react'
import {
  exponent,
  fieldError,
  formatCount,
  formatMoney,
  tameText,
  type Goal,
  type GoalKind,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'

const KINDS: { value: GoalKind; label: string; counts: string }[] = [
  { value: 'follows', label: 'Follows', counts: 'Counts new follows.' },
  { value: 'subs', label: 'Subs', counts: 'Counts new subs and gifted subs.' },
  { value: 'tips', label: 'Tips', counts: 'Counts tips and Super Chats in its currency.' },
  { value: 'bits', label: 'Bits', counts: 'Counts Bits cheered on Twitch.' },
  { value: 'custom', label: 'By hand', counts: 'Moves only when you nudge it.' },
]

function amount(g: Goal, n: number): string {
  if (g.kind === 'tips' && g.currency) {
    const minor = Math.round(n * 10 ** exponent(g.currency))
    return formatMoney({ minor, currency: g.currency })
  }
  return formatCount(n)
}

function NewGoal({ onCreated, onCancel }: { onCreated: (g: Goal) => void; onCancel: () => void }) {
  const client = useClient()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<GoalKind>('follows')
  const [target, setTarget] = useState('100')
  const [currency, setCurrency] = useState('INR')
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const errFor = (f: string) => (err?.field === f ? err.message : null)
  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const g = await client.createGoal({
        title: title.trim(),
        kind,
        target: Number(target),
        currency: kind === 'tips' ? currency.trim().toUpperCase() : null,
        starts_at: Date.now(),
        ends_at: null,
      })
      onCreated(g)
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-2 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Title" error={errFor('title')}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            value={title}
            maxLength={80}
            placeholder="A new mic"
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <div className={kind === 'tips' ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
        <Field label="Counts" hint={KINDS.find((k) => k.value === kind)?.counts}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Target" error={errFor('target')}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="font-mono tabular-nums"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
        {kind === 'tips' && (
          <Field label="Currency" error={errFor('currency')}>
            {(p) => (
              <Input
                {...p}
                className="font-mono uppercase"
                spellCheck={false}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.replace(/[^a-z]/gi, ''))}
              />
            )}
          </Field>
        )}
      </div>
      {err && !['title', 'target', 'currency'].includes(err.field ?? '') && (
        <p role="alert" className="text-[13.5px] text-danger">
          {err.message}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Create goal
        </Button>
      </div>
    </form>
  )
}

function GoalRow({
  g,
  busy,
  onNudge,
  onDelete,
}: {
  g: Goal
  busy: string | null
  onNudge: (delta: number) => void
  onDelete: () => void
}) {
  const id = useId()
  const pct =
    g.target > 0 ? Math.min(100, Math.round((Math.max(0, g.current) / g.target) * 100)) : 0
  const step = g.kind === 'tips' ? 10 : 1
  const label = KINDS.find((k) => k.value === g.kind)?.label ?? g.kind
  return (
    <li className="flex flex-col gap-2 py-3" data-testid="goal-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id={id} dir="auto" className="text-sm font-semibold break-words text-text">
            {tameText(g.title)}
          </p>
          <p className="text-[12.5px] text-text-3">
            {label}
            {g.kind === 'tips' && g.currency ? ` in ${g.currency}` : ''}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[13.5px] text-text-2 tabular-nums">
          {amount(g, g.current)} <span className="text-text-3">of {amount(g, g.target)}</span>
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          size="sm"
          variant="ghost"
          label={`Take ${amount(g, step)} off ${g.title}`}
          disabled={busy !== null}
          onClick={() => onNudge(-step)}
        >
          <Minus size={15} />
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label={`Add ${amount(g, step)} to ${g.title}`}
          disabled={busy !== null}
          onClick={() => onNudge(step)}
        >
          <Plus size={15} />
        </IconButton>
        <span className="flex-1" />
        <IconButton size="sm" variant="danger-ghost" label={`Delete ${g.title}`} onClick={onDelete}>
          <Trash size={15} />
        </IconButton>
      </div>
    </li>
  )
}

export function GoalsPanel() {
  const client = useClient()
  const res = useResource((c) => c.goals())
  const live = useLive((s) => s.goals)
  const { run, busy } = useAction()
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState<Goal | null>(null)
  // Progress moves as events arrive (`goals` frames).
  useEffect(() => {
    if (live) res.set(live)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])
  const goals = res.data
  const put = (g: Goal) => res.set((prev) => (prev ?? []).map((x) => (x.id === g.id ? g : x)))
  return (
    <Panel
      title="Goals"
      description="Show one on stream with a Goal widget in an overlay."
      actions={
        goals && goals.length > 0 && !adding ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={() => setAdding(true)}
          >
            New goal
          </Button>
        ) : null
      }
    >
      {res.error ? (
        <LoadError error={res.error} onRetry={res.reload} />
      ) : !goals ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-4">
          {adding && (
            <NewGoal
              onCancel={() => setAdding(false)}
              onCreated={(g) => {
                res.set((prev) => [...(prev ?? []).filter((x) => x.id !== g.id), g])
                setAdding(false)
              }}
            />
          )}
          {goals.length === 0 && !adding ? (
            <EmptyState
              compact
              title="No goals yet"
              action={
                <Button
                  variant="primary"
                  icon={<Target size={16} />}
                  onClick={() => setAdding(true)}
                >
                  Make a goal
                </Button>
              }
            >
              A goal counts follows, subs, Bits or tips as they arrive, so chat can see how close
              you are.
            </EmptyState>
          ) : (
            <ul className="-my-3 flex flex-col divide-y divide-line">
              {goals.map((g) => (
                <GoalRow
                  key={g.id}
                  g={g}
                  busy={busy}
                  onNudge={(delta) =>
                    void run(`nudge:${g.id}`, () => client.adjustGoal(g.id, delta)).then(
                      (v) => v && put(v),
                    )
                  }
                  onDelete={() => setLeaving(g)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        size="sm"
        title={leaving ? `Delete “${leaving.title}”?` : ''}
        description="Its progress goes with it. Goal widgets showing it go blank."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'delete'}
              onClick={() => {
                const g = leaving
                if (!g) return
                void run('delete', () => client.deleteGoal(g.id).then(() => true), {
                  success: 'Goal deleted.',
                }).then((ok) => {
                  if (!ok) return
                  res.set((prev) => (prev ?? []).filter((x) => x.id !== g.id))
                  setLeaving(null)
                })
              }}
            >
              Delete goal
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </Panel>
  )
}
