// The ready check after Start (owner, 30 Oct; Option 1 slim pill + upward card, 22 Nov):
// checks mics, cameras, captures, scenes and disk a few seconds after the Studio starts,
// sits as a slim 36 px pill bottom-right inside the right column (or above mobile bottom nav),
// expands upward on click, and restores from a quiet status-bar button when dismissed.

import { createContext, useContext, useEffect, useId, useRef } from 'react'
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  CircleNotch,
  ShieldCheck,
  WarningCircle,
  WarningOctagon,
  X,
} from '@phosphor-icons/react'
import type { EngineRecovered, Preflight, PreflightCheck } from '@ferrocast/api'
import { cx, usePreviewHole } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'
import { useStudio } from '../common'
import { useEngine } from './common'
import { captureChecks, recoveredWords, silentMics, studioProblems } from './ready'
import {
  clearReadyCheckPendingFocus,
  dismissReadyCheck,
  getReadyCheckState,
  resetReadyCheckState,
  restoreReadyCheck,
  setReadyCheckExpanded,
  setReadyCheckFound,
  startReadyCheckScanIfNeeded,
  useReadyCheckState,
} from './ready-check-state'

/** How long to listen to the mics: 6 looks, half a second apart. */
const LOOKS = 6

export type ReadyPlacement = 'right' | 'desk' | 'mobile' | 'inline'

export const ReadyPlacementContext = createContext<ReadyPlacement>('inline')

function SeverityIcon({
  tone,
  size = 15,
}: {
  tone: 'checking' | 'ok' | 'warn' | 'danger'
  size?: number
}) {
  if (tone === 'checking') {
    return (
      <CircleNotch
        size={size}
        weight="bold"
        className="shrink-0 text-accent-text motion-safe:animate-spin"
        aria-hidden
      />
    )
  }
  if (tone === 'ok') {
    return <CheckCircle size={size} weight="duotone" className="shrink-0 text-ok" aria-hidden />
  }
  if (tone === 'danger') {
    return (
      <WarningOctagon size={size} weight="duotone" className="shrink-0 text-danger" aria-hidden />
    )
  }
  return <WarningCircle size={size} weight="duotone" className="shrink-0 text-warn" aria-hidden />
}

function safeFixHref(raw: string): string | null {
  if (raw.startsWith('#/')) return raw
  return null
}

function formatSummary(n: number, blocking: number, checking: boolean): string {
  if (checking) return 'Checking…'
  if (n === 0) return 'All good'
  return blocking > 0 ? `${n} to fix (${blocking} blocking)` : `${n} to fix`
}

function firstCardControl(card: HTMLDivElement | null): HTMLElement | null {
  return (
    card?.querySelector<HTMLElement>('[data-rc-fix]') ??
    card?.querySelector<HTMLElement>('[data-rc-collapse]') ??
    null
  )
}

export function ReadyCheck({
  recovered,
  onClose,
}: {
  recovered: EngineRecovered | null
  onClose: () => void
}) {
  const api = useEngine()
  const studio = useStudio()
  const placement = useContext(ReadyPlacementContext)
  const { run, busy } = useAction()
  const barState = useReadyCheckState()
  const found = barState?.found ?? null
  const expanded = barState?.expanded ?? Boolean(recovered)
  const dismissed = barState?.dismissed ?? false

  const rootRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const pillWrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  usePreviewHole(pillWrapRef, { active: !dismissed && !expanded, deps: [placement, !!found] })
  usePreviewHole(cardRef, {
    active: !dismissed && expanded,
    deps: [placement, found?.checks.length],
  })
  const pendingCardFocusRef = useRef(false)
  const pendingNextControlFocusRef = useRef(false)
  const cardId = useId()
  const headingId = useId()

  useEffect(() => {
    startReadyCheckScanIfNeeded(Boolean(recovered), async (isAlive, sleep) => {
      const cfg = await studio.showConfig().catch(() => null)
      const mics = cfg?.mic_sources ?? []
      const samples: Record<string, number[]> = Object.fromEntries(mics.map((m) => [m, []]))
      for (let i = 0; i < LOOKS && isAlive() && mics.length; i++) {
        await sleep(500)
        if (!isAlive()) return null
        const levels = await api.levels(mics).catch(() => ({}) as Record<string, never>)
        for (const m of mics) {
          const l = levels[m]
          if (l) samples[m]?.push(Math.max(l.peak[0], l.peak[1]))
        }
      }
      if (!mics.length) await sleep(3000)
      if (!isAlive()) return null
      const [pf, stats] = await Promise.all([
        studio.preflight().catch(() => ({ checks: [], ready: true }) as Preflight),
        api.stats().catch(() => null),
      ])
      if (!isAlive()) return null
      const problems = studioProblems(pf.checks)
      const checks = [
        ...problems,
        ...silentMics(samples, problems),
        ...captureChecks(stats?.captures),
      ]
      return { checks, ready: checks.length === 0 }
    })
  }, [api, studio, recovered, barState?.sessionId])

  const close = useRef(onClose)
  close.current = onClose

  // All good and nothing to say about a crash: shows briefly (5s) then hides cleanly.
  const clean = Boolean(found?.ready && !recovered)
  useEffect(() => {
    if (!clean) return
    const t = window.setTimeout(() => {
      resetReadyCheckState()
      close.current()
    }, 5000)
    return () => window.clearTimeout(t)
  }, [clean])

  const checks = found?.checks ?? []
  const n = checks.length
  const blocking = checks.filter((c) => c.status === 'fail').length

  // Restore focus to the pill trigger when collapsed or reopened from the status-bar control.
  useEffect(() => {
    if (!expanded && !dismissed && barState?.pendingFocus === 'pill') {
      pillRef.current?.focus({ preventScroll: true })
      clearReadyCheckPendingFocus()
    }
  }, [expanded, dismissed, barState?.pendingFocus])

  // Move focus into the card when opened from the pill, or advance after a focused Fix row disappears.
  useEffect(() => {
    if (!expanded || dismissed) {
      pendingCardFocusRef.current = false
      pendingNextControlFocusRef.current = false
      return
    }
    if (pendingCardFocusRef.current) {
      pendingCardFocusRef.current = false
      firstCardControl(cardRef.current)?.focus({ preventScroll: true })
      return
    }
    if (pendingNextControlFocusRef.current) {
      pendingNextControlFocusRef.current = false
      if (
        cardRef.current &&
        document.activeElement instanceof Node &&
        cardRef.current.contains(document.activeElement)
      ) {
        return
      }
      firstCardControl(cardRef.current)?.focus({ preventScroll: true })
    }
  }, [found, expanded, dismissed])

  // Escape closes the expanded card and returns focus to the pill trigger.
  useEffect(() => {
    if (!expanded || dismissed) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Let any open modal dialog or menu above Ready check handle Escape first.
      if (document.querySelector('dialog[open], [role="menu"]')) return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        active.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      const inside =
        rootRef.current && active instanceof Node ? rootRef.current.contains(active) : false
      if (!inside && active !== document.body) return
      e.preventDefault()
      setReadyCheckExpanded(false, true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [expanded, dismissed])

  const handleExpand = () => {
    pendingCardFocusRef.current = true
    setReadyCheckExpanded(true)
  }

  const handleCollapse = () => {
    setReadyCheckExpanded(false, true)
  }

  const handleDismiss = () => {
    if (clean) {
      resetReadyCheckState()
      onClose()
      return
    }
    dismissReadyCheck()
  }

  const handleFix = async (c: PreflightCheck) => {
    if (!c.fix || !c.fix.href.startsWith('action:') || busy === c.id) return
    const sessionId = barState?.sessionId
    if (sessionId === undefined) return
    const updated = await run(c.id, () => studio.preflightFix(c.fix!.href), { success: 'Fixed.' })
    const latest = getReadyCheckState()
    if (!updated || !latest || latest.sessionId !== sessionId) return
    // Check live focus ownership immediately before applying the result, while a focused Fix
    // button is still in the DOM (before removing its row drops focus).
    const active = document.activeElement
    const ownsFocusNow = Boolean(
      cardRef.current && active instanceof Node && cardRef.current.contains(active),
    )
    const ours = (latest.found?.checks ?? []).filter((x) => /^(silent|capture):/.test(x.id))
    const nextChecks = [...studioProblems(updated.checks), ...ours]
    if (nextChecks.length === 0) {
      pendingNextControlFocusRef.current = false
      setReadyCheckFound(sessionId, { checks: nextChecks, ready: true })
      setReadyCheckExpanded(false, ownsFocusNow)
      return
    }
    pendingNextControlFocusRef.current = ownsFocusNow
    setReadyCheckFound(sessionId, { checks: nextChecks, ready: false })
  }

  if (dismissed) return null

  const tone: 'checking' | 'ok' | 'warn' | 'danger' = !found
    ? 'checking'
    : n === 0
      ? 'ok'
      : blocking > 0
        ? 'danger'
        : 'warn'

  const summaryText = formatSummary(n, blocking, !found)
  const liveAnnouncement = !found
    ? 'Checking your mic, cameras and scenes…'
    : n === 0
      ? 'All good. You’re ready.'
      : `${n} ${n === 1 ? 'thing' : 'things'} to fix${blocking > 0 ? `, ${blocking} blocking` : ''}`

  const anchorClass =
    placement === 'right'
      ? 'pointer-events-none absolute right-2 bottom-2 z-20 max-w-[calc(100%-16px)]'
      : placement === 'desk'
        ? 'pointer-events-none absolute right-3 bottom-2 z-20 max-w-[calc(100%-24px)]'
        : placement === 'mobile'
          ? 'pointer-events-none fixed right-2.5 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[35] max-w-[calc(100vw-20px)]'
          : 'inline-flex max-w-full'

  const pillToneClass =
    tone === 'danger'
      ? 'border-danger/45'
      : tone === 'warn'
        ? 'border-warn/45'
        : tone === 'ok'
          ? 'border-ok/40'
          : 'border-line-strong'

  const pillSubClass =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'ok'
          ? 'text-ok'
          : 'text-text-2'

  const badgeClass =
    tone === 'ok'
      ? 'border-ok/40 bg-surface-1 text-ok'
      : tone === 'danger'
        ? 'border-danger/45 bg-surface-1 text-danger'
        : tone === 'warn'
          ? 'border-warn/45 bg-surface-1 text-warn'
          : 'border-line bg-surface-1 text-text-2'

  const cardWidthClass =
    placement === 'mobile' ? 'w-[min(355px,calc(100vw-20px))]' : 'w-[304px] max-w-full'

  return (
    <section
      ref={rootRef}
      aria-label="Ready check"
      className={cx(anchorClass, 'flex flex-col-reverse items-end gap-2')}
    >
      {/* Collapsed trigger pill (hidden while the card is expanded so the header summary is shown once). */}
      {!expanded && (
        <div
          ref={pillWrapRef}
          data-over-preview
          className={cx(
            'pointer-events-auto inline-flex max-w-full items-center rounded-full bg-surface-1 shadow-2 ring-1 ring-inset',
            // An inner ring, so the pill is exactly as tall as its button (the card lines up with it).
            pillToneClass.replace('border-', 'ring-'),
          )}
        >
          <button
            ref={pillRef}
            type="button"
            aria-expanded={false}
            onClick={handleExpand}
            className={cx(
              'fc-press inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full pr-2 pl-2.5 text-[12.5px] font-bold whitespace-nowrap text-text transition-[background-color,transform] duration-150 hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              !found && 'pr-3',
            )}
          >
            <SeverityIcon tone={tone} size={15} />
            <span className="min-w-0 truncate">
              <span>Ready check</span>
              <span className="text-text-3">{' · '}</span>
              <span className={cx('font-semibold', pillSubClass)}>{summaryText}</span>
            </span>
            <span
              className="ml-0.5 inline-grid shrink-0 place-items-center text-text-3"
              aria-hidden
            >
              <CaretUp size={13} weight="bold" />
            </span>
          </button>
          {found && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss ready check"
              title="Dismiss"
              className="fc-press mr-1 grid size-7 shrink-0 place-items-center rounded-full text-text-3 transition-colors hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <X size={13} weight="bold" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {expanded && (
        <div
          ref={cardRef}
          id={cardId}
          data-over-preview
          aria-labelledby={headingId}
          className={cx(
            'pointer-events-auto flex flex-col overflow-hidden rounded-panel border bg-surface-1 text-text shadow-pop motion-safe:animate-[fc-fade_150ms_var(--fc-ease-out)]',
            cardWidthClass,
            tone === 'danger' ? 'border-danger/45' : 'border-line-strong',
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-line bg-dock-head px-2.5 py-1.5">
            <SeverityIcon tone={tone} size={15} />
            <h2
              id={headingId}
              className="font-display text-[12.5px] font-bold whitespace-nowrap text-text"
            >
              Ready check
            </h2>
            <span
              className={cx(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
                badgeClass,
              )}
            >
              {summaryText}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              data-rc-collapse
              onClick={handleCollapse}
              aria-label="Collapse ready check"
              title="Collapse"
              className="fc-press grid size-6 shrink-0 place-items-center rounded-[6px] text-text-3 transition-colors hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <CaretDown size={14} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss ready check"
              title="Dismiss"
              className="fc-press grid size-6 shrink-0 place-items-center rounded-[6px] text-text-3 transition-colors hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </div>

          <div className="fc-scroll flex max-h-[min(200px,45dvh)] flex-col gap-1.5 overflow-y-auto p-2">
            {recovered && (
              <div className="flex flex-col gap-1 rounded-[8px] bg-surface-2 p-2.5 text-[12px] leading-snug text-text">
                {recoveredWords(recovered).map((l) => (
                  <p key={l} className="m-0">
                    {l}
                  </p>
                ))}
              </div>
            )}

            {!found ? (
              <p className="m-0 px-1 py-0.5 text-[12.5px] text-text-2">
                Checking your mic, cameras and scenes…
              </p>
            ) : n === 0 ? (
              <div className="flex items-center gap-2 px-1 py-0.5 text-[12.5px] font-semibold text-ok">
                <CheckCircle size={16} weight="duotone" aria-hidden />
                <span>All good. You’re ready.</span>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Ready check issues">
                {checks.map((c) => {
                  const fixAction = c.fix?.href.startsWith('action:') ?? false
                  const fixLink = c.fix && !fixAction ? safeFixHref(c.fix.href) : null
                  return (
                    <li
                      key={c.id}
                      className={cx(
                        'flex min-w-0 items-center gap-1.5 rounded-[8px] border px-2 py-1.5',
                        c.status === 'fail'
                          ? 'border-danger/40 bg-danger-soft'
                          : 'border-line bg-surface-2',
                      )}
                    >
                      <SeverityIcon tone={c.status === 'fail' ? 'danger' : 'warn'} size={15} />
                      <span
                        className="min-w-0 flex-1 truncate text-[12px] leading-tight"
                        title={`${c.label}: ${c.detail}`}
                      >
                        <b className="font-bold text-text">{c.label}</b>{' '}
                        <span className="text-text-2">{c.detail}</span>
                      </span>
                      {c.fix && fixAction && (
                        <button
                          type="button"
                          data-rc-fix
                          aria-disabled={busy === c.id || undefined}
                          aria-label={`Fix ${c.label}: ${c.fix.label}`}
                          title={c.fix.label}
                          onClick={() => void handleFix(c)}
                          className="fc-press inline-flex h-6 shrink-0 items-center rounded-[7px] bg-accent-soft px-2 text-[12px] font-bold whitespace-nowrap text-accent-text transition-colors hover:bg-[color-mix(in_srgb,var(--fc-arc)_20%,transparent)] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        >
                          {busy === c.id ? 'Fixing…' : 'Fix'}
                        </button>
                      )}
                      {c.fix && fixLink && (
                        <a
                          data-rc-fix
                          href={fixLink}
                          aria-label={`Fix ${c.label}: ${c.fix.label}`}
                          title={c.fix.label}
                          className="fc-press inline-flex h-6 shrink-0 items-center rounded-[7px] bg-accent-soft px-2 text-[12px] font-bold whitespace-nowrap text-accent-text no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--fc-arc)_20%,transparent)] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                        >
                          Fix
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** Quiet recall chip shown in the status bar (desktop) or tools bar (mobile) when dismissed. */
export function ReadyCheckRecallChip({
  variant = 'status-bar',
}: {
  variant?: 'status-bar' | 'mobile-bar'
}) {
  const bar = useReadyCheckState()
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (bar?.active && bar.dismissed && bar.pendingFocus === 'recall') {
      btnRef.current?.focus({ preventScroll: true })
      clearReadyCheckPendingFocus()
    }
  }, [bar?.active, bar?.dismissed, bar?.pendingFocus])

  if (!bar?.active || !bar.dismissed) return null

  const dotClass =
    bar.blocking > 0
      ? 'bg-danger'
      : bar.count > 0
        ? 'bg-warn'
        : bar.checking
          ? 'bg-accent-text'
          : 'bg-ok'

  const label = bar.count > 0 ? `Ready check (${bar.count})` : 'Ready check'
  const ariaLabel = bar.count > 0 ? `Show ready check (${bar.count} to fix)` : 'Show ready check'

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={restoreReadyCheck}
      aria-label={ariaLabel}
      title="Show ready check"
      className={cx(
        'fc-press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 font-semibold whitespace-nowrap text-text-2 transition-colors hover:border-accent-line hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        variant === 'status-bar' ? 'my-auto ml-2 h-5 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12px]',
      )}
    >
      <ShieldCheck size={12} weight="bold" aria-hidden />
      <span>{label}</span>
      <span aria-hidden className={cx('size-1.5 rounded-full', dotClass)} />
    </button>
  )
}
