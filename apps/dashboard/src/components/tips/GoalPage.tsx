// Pro: a goal page next to the tip page (`<tip page>/goal`, API.md §9.2): title, target,
// currency, an optional end date. The relay counts the verified tips it forwards in that
// currency (refunds come off) and draws the page; this shows the progress and the links.

import { useState } from 'react'
import { ArrowSquareOut, Check, CopySimple } from '@phosphor-icons/react'
import {
  TIP_BRAND_LIMITS,
  currencyDigits,
  describeError,
  formatMoney,
  majorToMinor,
  tipBrandApi,
  tipGoalProblem,
  type TipGoal,
} from '@ferrocast/api'
import { Button, Dialog, Field, Input, Select, copyText, toast, useFlash } from '@ferrocast/ui'
import { useClient } from '../../lib/hooks'
import { externalLink } from '../../lib/external'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const

type Draft = { title: string; target: string; currency: string; ends: string }

function day(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function draftOf(g: TipGoal | null, currency: string): Draft {
  if (!g) return { title: '', target: '', currency, ends: '' }
  const d = g.digits
  const major = d ? (g.target / 10 ** d).toFixed(d).replace(/\.0+$/, '') : String(g.target)
  return {
    title: g.title,
    target: major,
    currency: g.currency,
    ends: g.ends_at ? day(g.ends_at) : '',
  }
}

export const goalPct = (g: TipGoal) =>
  g.target > 0 ? Math.min(100, Math.floor((g.raised * 100) / g.target)) : 0

export function GoalPage({
  goal,
  hasPage,
  defaultCurrency,
  onSaved,
}: {
  goal: TipGoal | null
  /** A tip page exists (the goal page lives next to it). */
  hasPage: boolean
  defaultCurrency: string
  onSaved: (g: TipGoal | null) => void
}) {
  const client = useClient()
  const [d, setD] = useState<Draft>(() => draftOf(goal, defaultCurrency))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState<'save' | 'rm' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const problems = tipGoalProblem(d)
  const show = (k: keyof Draft) => (tried ? (problems[k] ?? null) : null)
  const saved = draftOf(goal, defaultCurrency)
  const dirty = !goal || JSON.stringify(saved) !== JSON.stringify(d)
  const currencyChange = goal !== null && d.currency.toUpperCase() !== goal.currency

  const save = async () => {
    setTried(true)
    if (Object.keys(problems).length) return
    setBusy('save')
    try {
      const cur = d.currency.trim().toUpperCase()
      const ends = d.ends ? new Date(`${d.ends}T23:59:59`).getTime() : null
      const g = await tipBrandApi(client).saveGoal({
        title: d.title.trim(),
        target: majorToMinor(d.target, cur) ?? 0,
        currency: cur,
        ends_at: ends,
      })
      onSaved(g)
      setD(draftOf(g, defaultCurrency))
      setTried(false)
      toast({ tone: 'ok', message: goal ? 'Goal saved.' : 'Your goal page is up.' })
    } catch (e) {
      const p = describeError(e)
      toast({ tone: 'error', message: p.message, hint: p.hint })
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('rm')
    try {
      await tipBrandApi(client).deleteGoal()
      onSaved(null)
      setConfirm(false)
      setD(draftOf(null, defaultCurrency))
      toast({ tone: 'ok', message: 'Goal page removed.' })
    } catch (e) {
      const p = describeError(e)
      toast({ tone: 'error', message: p.message, hint: p.hint })
    } finally {
      setBusy(null)
    }
  }

  if (!hasPage)
    return (
      <p className="text-[15px] text-text-2">
        Create your tip page first. The goal page sits next to it.
      </p>
    )

  const currencies = CURRENCIES.includes(d.currency as (typeof CURRENCIES)[number])
    ? CURRENCIES
    : [d.currency, ...CURRENCIES]

  return (
    <div className="flex flex-col gap-5">
      {goal && <Progress goal={goal} />}
      <form
        noValidate
        aria-label="Goal settings"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field
          label="Goal"
          error={show('title')}
          hint={`${Array.from(d.title).length}/${TIP_BRAND_LIMITS.goalTitleMax}`}
        >
          {(p) => (
            <Input
              {...p}
              name="goal_title"
              value={d.title}
              placeholder="New microphone…"
              onChange={(e) => setD({ ...d, title: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
          <Field label="Target" error={show('target')}>
            {(p) => (
              <Input
                {...p}
                name="goal_target"
                inputMode={currencyDigits(d.currency) ? 'decimal' : 'numeric'}
                value={d.target}
                placeholder="10,000"
                className="font-mono"
                onChange={(e) => setD({ ...d, target: e.target.value })}
              />
            )}
          </Field>
          <Field label="Currency" error={show('currency')}>
            {(p) => (
              <Select
                {...p}
                name="goal_currency"
                value={d.currency}
                onChange={(e) => setD({ ...d, currency: e.target.value })}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ends" optional error={show('ends')} className="col-span-2 sm:col-span-1">
            {(p) => (
              <Input
                {...p}
                name="goal_ends"
                type="date"
                value={d.ends}
                min={day(Date.now() + 86_400_000)}
                onChange={(e) => setD({ ...d, ends: e.target.value })}
              />
            )}
          </Field>
        </div>
        <p className="text-[14px] leading-snug text-text-2">
          {currencyChange
            ? `Changing to ${d.currency} starts the count again.`
            : `Only tips in ${d.currency || 'this currency'} count. Refunds come off.`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {goal ? (
            <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}>
              Remove goal
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!dirty}>
            {goal ? 'Save goal' : 'Start goal'}
          </Button>
        </div>
      </form>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Remove the goal page?"
        description="The link stops working and the count is deleted. Your tips aren’t touched."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy === 'rm'} onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  )
}

function Progress({ goal }: { goal: TipGoal }) {
  const pct = goalPct(goal)
  const money = (minor: number) => formatMoney({ minor, currency: goal.currency })
  return (
    <div className="rounded-[12px] border border-line bg-surface-2 p-4" data-testid="goal-progress">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[28px] leading-none font-bold tracking-[-0.02em] text-text tabular-nums">
          {money(goal.raised)}
        </span>
        <span className="text-[15px] text-text-2">of {money(goal.target)}</span>
        <span className="ml-auto text-[15px] font-semibold text-text tabular-nums">{pct}%</span>
      </p>
      <div
        role="progressbar"
        aria-label={goal.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="mt-2 text-[13.5px] text-text-2">
        {goal.tips === 1 ? '1 tip' : `${goal.tips} tips`}
        {goal.ended
          ? ', ended'
          : goal.ends_at
            ? `, ends ${new Date(goal.ends_at).toLocaleDateString()}`
            : ''}
      </p>
      {goal.page_url && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <code translate="no" className="font-mono text-[13.5px] break-all text-text-2">
            {goal.page_url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Copy text={goal.page_url} label="Copy link" what="Goal link" />
            {goal.overlay_url && (
              <Copy text={goal.overlay_url} label="Copy for OBS" what="OBS link" />
            )}
            <a
              {...externalLink(goal.page_url)}
              className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13.5px] font-semibold text-text hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              Open <ArrowSquareOut size={14} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function Copy({ text, label, what }: { text: string; label: string; what: string }) {
  const [copied, flash] = useFlash()
  return (
    <Button
      size="sm"
      aria-label={copied ? `${what} copied` : label}
      icon={copied ? <Check size={15} weight="bold" /> : <CopySimple size={15} />}
      onClick={() =>
        void copyText(text).then((ok) =>
          ok
            ? flash()
            : toast({
                tone: 'error',
                message: `Couldn’t copy the ${what.toLowerCase()}.`,
                hint: 'Select it and copy it by hand.',
              }),
        )
      }
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}
