// How should your stream start? (owner's pick D1 on desktop, P1 on a phone, 30 Oct): three
// ready-made styles; picking one saves at once, and the Go live button runs it. The details
// open under Customise.

import { useId, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle,
  HourglassMedium,
  Lightning,
  SlidersHorizontal,
  Sparkle,
  Warning,
} from '@phosphor-icons/react'
import type { ShowConfig } from '@ferrocast/api'
import { Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../Panel'
import { useAction, type Resource } from '../../lib/hooks'
import { useStudio } from './common'
import { STYLES, applyStyle, routeOf, styleOf, type ShowStyle } from './show-style'

const ICON = { just: Lightning, countdown: HourglassMedium, full: Sparkle } as const

function Route({ steps }: { steps: string[] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13.5px] font-bold text-text-2">
      {steps.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={13} aria-hidden className="text-text-3" />}
          {s}
        </span>
      ))}
    </span>
  )
}

export function ShowStylePicker({
  cfg,
  names,
  checks,
  onChecks,
  children,
}: {
  cfg: Resource<ShowConfig>
  /** The scene names to guess from (the Studio's, or OBS's). */
  names: string[]
  /** Pre-flight problems, shown as a badge that leads to them. */
  checks: number
  onChecks: () => void
  /** The details, under Customise. */
  children: ReactNode
}) {
  const studio = useStudio()
  const { run, busy } = useAction()
  const name = useId()
  const c = cfg.data
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!c) return <Skeleton className="h-56" />
  const now = styleOf(c)
  // Each style's route as it would be if picked (the picked one's as it is).
  const routes = Object.fromEntries(
    STYLES.map((s) => [s.id, routeOf(s.id === now ? c : applyStyle(c, s.id, names))]),
  ) as Record<ShowStyle, string[]>

  const pick = async (s: ShowStyle) => {
    if (s === now || busy) return
    const prev = c
    const next = applyStyle(c, s, names)
    cfg.set(next)
    const saved = await run('style', () => studio.saveShowConfig(next))
    if (saved) cfg.set(saved)
    else {
      cfg.set(prev)
      toast({ tone: 'error', message: 'That style wasn’t saved. Try again.' })
    }
  }

  // The cards and the list are two groups (one shows at a time): each needs its own name, or the
  // browser lets only one radio across both be checked.
  const radio = (s: ShowStyle, group: 'wide' | 'narrow') => (
    <input
      type="radio"
      name={`${name}-${group}`}
      value={s}
      checked={now === s}
      onChange={() => void pick(s)}
      className="sr-only"
    />
  )

  return (
    <section aria-labelledby={`${name}-h`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${name}-h`} className="font-display text-[19px] font-bold sm:text-[22px]">
            How should your stream start?
          </h2>
          <p className="hidden text-[14.5px] text-text-3 sm:block">
            It happens when you press Go live.
          </p>
        </div>
        {checks > 0 && (
          <button
            type="button"
            onClick={onChecks}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-[13.5px] font-bold text-warn"
          >
            <Warning size={14} weight="bold" aria-hidden />
            {checks}
            <span className="hidden sm:inline">{checks === 1 ? 'check' : 'checks'}</span>
            <span className="sr-only sm:hidden">
              {checks === 1 ? 'check' : 'checks'} to look at
            </span>
          </button>
        )}
      </div>

      {/* Desktop (D1): three cards. */}
      <div
        role="radiogroup"
        aria-labelledby={`${name}-h`}
        className="hidden gap-3 sm:grid sm:grid-cols-3"
      >
        {STYLES.map((s) => {
          const Icon = ICON[s.id]
          const on = now === s.id
          return (
            <label
              key={s.id}
              className={cx(
                'relative grid cursor-pointer content-start gap-2 rounded-panel border-[1.5px] bg-surface-1 p-4 transition-[border-color,box-shadow] duration-150 has-[:focus-visible]:shadow-[var(--fc-focus)]',
                on
                  ? 'border-accent-text shadow-[0_0_0_3px_var(--fc-accent-soft)]'
                  : 'border-line hover:border-line-strong',
              )}
            >
              {radio(s.id, 'wide')}
              {on && (
                <CheckCircle
                  size={22}
                  weight="fill"
                  aria-hidden
                  className="absolute top-3.5 right-3.5 text-accent-text"
                />
              )}
              <span
                className={cx(
                  'grid size-10 place-items-center rounded-[12px]',
                  on ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-text-2',
                )}
              >
                <Icon size={21} weight="bold" aria-hidden />
              </span>
              <span className="font-display text-[17px] font-bold">{s.title}</span>
              <span className="text-[14px] text-text-3">{s.blurb}</span>
              <Route steps={routes[s.id]} />
            </label>
          )
        })}
      </div>

      {/* Phone (P1): one row each, the route as its line. */}
      <div
        role="radiogroup"
        aria-labelledby={`${name}-h`}
        className="overflow-hidden rounded-panel border border-line bg-surface-1 sm:hidden"
      >
        {STYLES.map((s, i) => {
          const Icon = ICON[s.id]
          const on = now === s.id
          return (
            <label
              key={s.id}
              className={cx(
                'grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_22px] items-center gap-3 px-3.5 py-2.5 has-[:focus-visible]:shadow-[inset_var(--fc-focus)]',
                i > 0 && 'border-t border-line',
              )}
            >
              {radio(s.id, 'narrow')}
              <span
                className={cx(
                  'grid size-9 place-items-center rounded-[10px]',
                  on ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-text-2',
                )}
              >
                <Icon size={19} weight="bold" aria-hidden />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-[15.5px] font-bold">{s.title}</span>
                <Route steps={routes[s.id]} />
              </span>
              <span
                aria-hidden
                className={cx(
                  'size-[22px] rounded-full',
                  on ? 'border-[7px] border-accent-text' : 'border-2 border-line-strong',
                )}
              />
            </label>
          )
        })}
      </div>

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-control py-1 font-bold text-accent-text [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal size={16} weight="bold" aria-hidden />
          Customise
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    </section>
  )
}
