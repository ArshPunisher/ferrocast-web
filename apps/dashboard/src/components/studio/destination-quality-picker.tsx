import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaretDown, Lightning, LockSimple, Prohibit, Warning, X } from '@phosphor-icons/react'
import {
  ApiError,
  goliveApi,
  type DestinationQuality,
  type DestinationView,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
} from '@ferrocast/api'
import { Button, InfoTip, Skeleton, Switch, cx, usePreviewHole } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import { Logo } from './golive'
import {
  buildModalModel,
  buildQualitySummaryText as buildQualitySummaryTextPure,
  evaluateModalDraft,
  formatModalRate,
  formatModalResFps,
  initialDraftFromModel,
  mapQualityApiError,
  toDestinationQualityPayload,
  type ApiQualityErrorInfo,
  type ModalDraft,
} from './quality-modal-model'

export function formatRate(kbps: number): string {
  return formatModalRate(kbps)
}

export function formatResFps(width: number, height: number, fps: number): string {
  return formatModalResFps(width, height, fps)
}

export function buildQualitySummaryText(
  dest: DestinationView,
  usesObs: boolean,
  peerNamesById?: Record<string, string>,
): string {
  return buildQualitySummaryTextPure(dest, usesObs, peerNamesById)
}

function qualityOptionsSig(view: GoLiveView | null): string {
  if (!view) return ''
  return view.destinations
    .map(
      (d) =>
        `${d.id}:${d.enabled ? 1 : 0}:${d.canvas}:${d.quality?.mode ?? 'same'}:${
          d.quality?.mode === 'custom'
            ? `${d.quality.width}x${d.quality.height}@${d.quality.fps}:${d.quality.kbps}`
            : ''
        }:${d.resolved_quality?.kbps ?? 0}`,
    )
    .join('|')
}

export function useQualityOptions(
  view: GoLiveView | null,
  enabled: boolean,
  usesObs: boolean,
  _onViewChanged?: () => void,
) {
  const client = useLive((s) => s.conn?.client)
  const [data, setData] = useState<GoLiveQualityOptionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const reqIdRef = useRef(0)

  const sig = qualityOptionsSig(view)

  const reload = useCallback(async () => {
    if (!enabled || usesObs || !client || !view) return
    const id = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await goliveApi(client).qualityOptions()
      if (reqIdRef.current === id) {
        setData(next)
      }
    } catch (e) {
      if (reqIdRef.current === id) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (reqIdRef.current === id) {
        setLoading(false)
      }
    }
  }, [client, enabled, usesObs, view])

  useEffect(() => {
    if (!enabled || usesObs || !client || !view) return
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, usesObs, sig])

  useEffect(() => {
    if (usesObs) {
      reqIdRef.current++
      setData(null)
      setLoading(false)
    }
  }, [usesObs])

  return { data, loading, error, reload }
}

export interface DestinationQualityModalProps {
  open: boolean
  onClose: () => void
  triggerEl?: HTMLElement | null | undefined
  dest: DestinationView
  allDestinations?: readonly DestinationView[] | undefined
  usesObs: boolean
  isRemote?: boolean | undefined
  live: boolean
  ffmpegDownloading?: boolean | undefined
  ffmpegPercent?: number | undefined
  ignoreServiceLimits?: boolean | undefined
  optionsResponse: GoLiveQualityOptionsResponse | null
  loading: boolean
  error?: Error | null | undefined
  onReloadOptions?: (() => void) | undefined
  onUpdated: (nextView: GoLiveView) => void
  onOptimisticSwitch?: ((destId: string, label: string | null) => void) | undefined
  destinationsById?: Record<string, { name: string; kind: DestinationView['kind'] }> | undefined
}

export function DestinationQualityModal({
  open,
  onClose,
  triggerEl,
  dest,
  allDestinations = [],
  usesObs,
  isRemote = false,
  live,
  ffmpegDownloading = false,
  ffmpegPercent,
  ignoreServiceLimits = false,
  optionsResponse,
  loading,
  error,
  onReloadOptions,
  onUpdated,
  onOptimisticSwitch,
}: DestinationQualityModalProps) {
  const client = useLive((s) => s.conn?.client)
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const rateInputRef = useRef<HTMLInputElement>(null)
  const hostEl =
    typeof document !== 'undefined' ? (triggerEl?.closest('dialog') ?? document.body) : null

  const destOpts = optionsResponse?.destinations?.[dest.id] ?? null
  const model = useMemo(
    () => buildModalModel({ dest, destOpts, response: optionsResponse }),
    [dest, destOpts, optionsResponse],
  )

  const [draft, setDraft] = useState<ModalDraft>(() => initialDraftFromModel(model))
  const [mbpsText, setMbpsText] = useState(() =>
    String(Number((initialDraftFromModel(model).kbps / 1000).toFixed(2))),
  )
  const [submitting, setSubmitting] = useState(false)
  const [apiErr, setApiErr] = useState<ApiQualityErrorInfo | null>(null)
  const [trackShake, setTrackShake] = useState(false)
  const prevOpenRef = useRef(false)
  const lastSubmittedRef = useRef<DestinationQuality | null>(null)

  usePreviewHole(dialogRef, open)

  // Reset draft whenever modal freshly opens or target destination changes while open.
  useLayoutEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!open) return
    if (justOpened) {
      const next = initialDraftFromModel(model)
      setDraft(next)
      setMbpsText(String(Number((next.kbps / 1000).toFixed(2))))
      setApiErr(null)
      setSubmitting(false)
      lastSubmittedRef.current = null
    }
  }, [open, model])

  // Sync modal <dialog> top-layer state, transform origin from trigger, and initial focus.
  useEffect(() => {
    const el = dialogRef.current
    if (!el || !open) return

    if (triggerEl && typeof triggerEl.getBoundingClientRect === 'function') {
      const rect = triggerEl.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && typeof window !== 'undefined') {
        const vw = Math.max(1, window.innerWidth)
        const vh = Math.max(1, window.innerHeight)
        const modalW = Math.min(450, vw - 24)
        const modalH = Math.min(vh * 0.88, 640)
        const modalLeft = (vw - modalW) / 2
        const modalTop = (vh - modalH) / 2
        const cx = rect.left + rect.width / 2 - modalLeft
        const cy = rect.top + rect.height / 2 - modalTop
        el.style.setProperty('--fc-origin-x', `${Math.round(cx)}px`)
        el.style.setProperty('--fc-origin-y', `${Math.round(cy)}px`)
      }
    }

    if (!el.open && typeof el.showModal === 'function') {
      el.showModal()
    }

    // Move focus inside modal on open for keyboard & SR users.
    const focusables = el.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)',
    )
    const first =
      Array.from(focusables).find((node) => node.getAttribute('role') === 'switch') ?? focusables[0]
    first?.focus({ preventScroll: true })

    return () => {
      if (el.open && typeof el.close === 'function') {
        el.close()
      }
    }
  }, [open, triggerEl])

  const closeAndRestore = useCallback(() => {
    const el = dialogRef.current
    if (el?.open && typeof el.close === 'function') {
      el.close()
    }
    onClose()
    const restoreTarget = triggerEl
    if (restoreTarget && restoreTarget.isConnected) {
      restoreTarget.focus({ preventScroll: true })
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          if (restoreTarget.isConnected) restoreTarget.focus({ preventScroll: true })
        })
      }
    }
  }, [onClose, triggerEl])

  // Focus trap + Escape handling inside dialog.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeAndRestore()
      return
    }
    if (e.key === 'Tab') {
      const el = dialogRef.current
      if (!el) return
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"]):not(:disabled)',
        ),
      ).filter(
        (node) =>
          node.offsetParent !== null ||
          typeof window === 'undefined' ||
          node.getAttribute('role') !== null,
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const evalResult = useMemo(
    () =>
      evaluateModalDraft(model, draft, {
        dest,
        allDestinations: allDestinations.length > 0 ? allDestinations : [dest],
        live,
        budget: optionsResponse?.budget ?? null,
        ignoreServiceLimits,
      }),
    [model, draft, dest, allDestinations, live, optionsResponse?.budget, ignoreServiceLimits],
  )

  const effectiveLockedReason =
    model.lockedReason || (isRemote ? 'Change destination quality from your PC.' : null)
  const lockedAll =
    usesObs ||
    isRemote ||
    Boolean(effectiveLockedReason) ||
    ffmpegDownloading ||
    Boolean(dest.switching_quality) ||
    submitting
  const controlsDisabled = lockedAll || draft.matchMain

  const updateKbps = (nextKbps: number, syncInput = true) => {
    setApiErr(null)
    setDraft((prev) => ({ ...prev, matchMain: false, kbps: nextKbps }))
    if (syncInput) {
      setMbpsText(String(Number((nextKbps / 1000).toFixed(2))))
    }
  }

  const submitQuality = async (payload: DestinationQuality, optimisticLabel: string | null) => {
    if (!client || submitting) return
    setSubmitting(true)
    setApiErr(null)
    lastSubmittedRef.current = payload
    if (live && optimisticLabel) {
      onOptimisticSwitch?.(dest.id, optimisticLabel)
    }
    try {
      const nextView = await goliveApi(client).setQuality(dest.id, payload)
      onUpdated(nextView)
      closeAndRestore()
    } catch (e) {
      onOptimisticSwitch?.(dest.id, null)
      if (e instanceof ApiError) {
        setApiErr(mapQualityApiError(e.code, e.message, dest.name))
      } else {
        setApiErr(mapQualityApiError(null, e instanceof Error ? e.message : String(e), dest.name))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleApply = () => {
    if (!evalResult.canApply || lockedAll) return
    const payload = toDestinationQualityPayload(draft)
    const label = draft.matchMain
      ? 'Same as main'
      : `${formatResFps(draft.width, draft.height, draft.fps)} · ${formatRate(draft.kbps)}`
    void submitQuality(payload, label)
  }

  const handleApplyFixed = () => {
    if (!evalResult.hardLimit) return
    const fixed = evalResult.hardLimit.fixedDraft
    setApiErr(null)
    setDraft(fixed)
    setMbpsText(String(Number((fixed.kbps / 1000).toFixed(2))))
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => rateInputRef.current?.focus({ preventScroll: true }))
    } else {
      rateInputRef.current?.focus({ preventScroll: true })
    }
  }

  const handleMatchPeerFix = () => {
    const peer = evalResult.budgetExceeded?.peer
    if (!peer) return
    setApiErr(null)
    if (peer.quality.mode === 'same_as_main') {
      const same = model.sameAsMainResolved
      setDraft({
        matchMain: true,
        width: same?.width ?? draft.width,
        height: same?.height ?? draft.height,
        fps: same?.fps ?? draft.fps,
        kbps: same?.kbps ?? draft.kbps,
      })
      setMbpsText(String(Number(((same?.kbps ?? draft.kbps) / 1000).toFixed(2))))
    } else {
      setDraft({
        matchMain: false,
        width: peer.quality.width,
        height: peer.quality.height,
        fps: peer.quality.fps,
        kbps: peer.quality.kbps,
      })
      setMbpsText(String(Number((peer.quality.kbps / 1000).toFixed(2))))
    }
  }

  const minKbps = model.bitrateMinKbps
  const hardMaxKbps = model.bitrateHardMaxKbps
  const rangeMaxKbps = Math.max(minKbps + 500, model.bitrateRangeMaxKbps)
  const spanKbps = rangeMaxKbps - minKbps
  const limitPct = model.hasHardBitrateCeiling
    ? Math.max(0, Math.min(100, ((hardMaxKbps - minKbps) / spanKbps) * 100))
    : 100
  const rawFillPct = Math.max(
    0,
    Math.min(100, ((evalResult.effective.kbps - minKbps) / spanKbps) * 100),
  )
  const safeFillPct = Math.min(rawFillPct, limitPct)
  const overrunPct = rawFillPct > limitPct ? rawFillPct - limitPct : 0

  const mainResText = model.canvasMain
    ? `${formatResFps(model.canvasMain.width, model.canvasMain.height, model.canvasMain.fps)} · ${formatRate(model.canvasMain.kbps)}`
    : null
  const fittedSameText =
    model.sameAsMainResolved?.auto_fitted && model.sameAsMainResolved
      ? ` · fitted to ${formatResFps(
          model.sameAsMainResolved.width,
          model.sameAsMainResolved.height,
          model.sameAsMainResolved.fps,
        )} · ${formatRate(model.sameAsMainResolved.kbps)}`
      : ''

  if (!open || !hostEl) return null

  const hasHardResChips = model.resolutions.some((r) => r.state === 'hard')
  const hasSoftResChips = model.resolutions.some((r) => r.state === 'soft')
  const rateOver = evalResult.effective.kbps > hardMaxKbps || evalResult.effective.kbps < minKbps

  return createPortal(
    <dialog
      ref={dialogRef}
      data-quality-modal={dest.id}
      data-over-preview=""
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault()
        closeAndRestore()
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) closeAndRestore()
      }}
      onKeyDown={handleKeyDown}
      className="fc-golive-modal flex flex-col outline-none"
    >
      {/* Mobile bottom-sheet drag indicator */}
      <div
        aria-hidden
        className="mx-auto mt-2 hidden h-1 w-9 shrink-0 rounded-full bg-line-strong max-[560px]:block"
      />

      {/* Modal Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3.5 max-[560px]:pt-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo kind={dest.kind} size={34} />
          <div className="min-w-0">
            <h2
              id={titleId}
              className="m-0 truncate text-[16px] font-bold tracking-tight text-text"
            >
              {dest.name} quality
            </h2>
            <p
              className={cx(
                'm-0 text-[12px] font-semibold',
                live ? 'text-[var(--fc-accent-text)]' : 'text-text-3',
              )}
            >
              {live ? 'Live now' : 'Standby · next stream'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closeAndRestore}
          aria-label="Close"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fc-accent)]"
        >
          <X size={18} weight="bold" aria-hidden />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3.5">
        {loading && !destOpts ? (
          <div className="flex flex-col gap-3" aria-label="Loading quality options">
            <Skeleton className="h-12 w-full rounded-[11px]" />
            <Skeleton className="h-14 w-full rounded-[11px]" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 flex-1 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : (
          <>
            {/* Result Card */}
            <div
              data-quality-result=""
              className={cx(
                'flex flex-wrap items-center justify-between gap-2 rounded-[11px] border px-3.5 py-2.5 text-[14px]',
                evalResult.resultTone === 'bad' &&
                  'border-[color-mix(in_oklab,var(--fc-danger)_45%,transparent)] bg-[var(--fc-danger-soft)]',
                evalResult.resultTone === 'warn' &&
                  'border-[color-mix(in_oklab,var(--fc-warn)_45%,transparent)] bg-[var(--fc-warn-soft)]',
                evalResult.resultTone === 'ok' &&
                  'border-[color-mix(in_oklab,var(--fc-ok)_45%,transparent)] bg-[var(--fc-ok-soft)]',
                evalResult.resultTone === 'neutral' &&
                  'border-[color-mix(in_oklab,var(--fc-warn)_30%,var(--fc-line))] bg-[color-mix(in_oklab,var(--fc-warn-soft)_50%,var(--fc-surface-2))]',
              )}
            >
              <span className="font-semibold text-text">
                {dest.name} gets{' '}
                <strong
                  className={cx(
                    'font-mono font-bold tabular-nums',
                    evalResult.resultTone === 'bad'
                      ? 'text-[var(--fc-danger)]'
                      : 'text-[var(--fc-molten-text)]',
                  )}
                >
                  {formatResFps(
                    evalResult.effective.width,
                    evalResult.effective.height,
                    evalResult.effective.fps,
                  )}
                </strong>{' '}
                at{' '}
                <strong
                  className={cx(
                    'font-mono font-bold tabular-nums',
                    evalResult.resultTone === 'bad'
                      ? 'text-[var(--fc-danger)]'
                      : 'text-[var(--fc-molten-text)]',
                  )}
                >
                  {formatRate(evalResult.effective.kbps)}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cx(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] uppercase',
                    evalResult.badgeKind === 'shared'
                      ? 'bg-[var(--fc-ok-soft)] text-[var(--fc-ok)]'
                      : 'bg-[var(--fc-accent-soft)] text-[var(--fc-accent-text)]',
                  )}
                >
                  {evalResult.badgeText}
                </span>
                <InfoTip above label="About platform quality limits and automatic codec">
                  Ferrocast picks the best video codec automatically (H.264 where required by the
                  platform; HEVC or AV1 when supported and matching). Choosing the same resolution,
                  frame rate, and bitrate as another platform shares a single PC encode.
                </InfoTip>
              </span>
            </div>

            {/* Single Prioritized Status / Error Banner */}
            {(effectiveLockedReason || usesObs) && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-[11px] border border-[var(--fc-accent-line)] bg-[var(--fc-accent-soft)] px-3.5 py-2.5 text-[13px]"
              >
                <LockSimple
                  size={16}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-[var(--fc-accent-text)]"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="m-0 font-bold text-text">
                    {effectiveLockedReason || 'Quality matches OBS while OBS is your picture.'}
                  </p>
                  <p className="m-0 mt-0.5 text-text-2">
                    {isRemote
                      ? 'Quality settings are controlled directly on your PC.'
                      : 'Stop OBS or switch back to Ferrocast Studio to adjust this platform individually.'}
                  </p>
                </div>
              </div>
            )}

            {!effectiveLockedReason && !usesObs && ffmpegDownloading && (
              <div
                role="status"
                className="flex flex-col gap-2 rounded-[11px] border border-[var(--fc-accent-line)] bg-[var(--fc-accent-soft)] px-3.5 py-2.5 text-[13px]"
              >
                <p className="m-0 font-bold text-text">
                  Getting video tools…
                  {ffmpegPercent !== undefined ? ` ${Math.round(ffmpegPercent)}%` : ''}
                </p>
                <p className="m-0 text-text-2">
                  Ferrocast downloads FFmpeg once. Quality changes wait for it.
                </p>
                {ffmpegPercent !== undefined && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full bg-[var(--fc-accent)] transition-[width] duration-150"
                      style={{ width: `${Math.max(4, Math.min(100, ffmpegPercent))}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {!effectiveLockedReason && !usesObs && !ffmpegDownloading && apiErr && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-danger)_42%,transparent)] bg-[var(--fc-danger-soft)] px-3.5 py-2.5 text-[13px]"
              >
                <Warning
                  size={16}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-[var(--fc-danger)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-bold text-[var(--fc-danger)]">{apiErr.title}</p>
                  <p className="m-0 mt-0.5 text-text-2">{apiErr.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {apiErr.retryable && lastSubmittedRef.current && (
                      <Button
                        size="sm"
                        variant="outline"
                        busy={submitting}
                        onClick={() =>
                          void submitQuality(
                            lastSubmittedRef.current!,
                            draft.matchMain
                              ? 'Same as main'
                              : `${formatResFps(draft.width, draft.height, draft.fps)} · ${formatRate(draft.kbps)}`,
                          )
                        }
                      >
                        Try again
                      </Button>
                    )}
                    {apiErr.canClamp && evalResult.hardLimit && (
                      <Button size="sm" variant="outline" onClick={handleApplyFixed}>
                        {evalResult.hardLimit.fixLabel}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setApiErr(null)}
                      aria-label="Dismiss error"
                      className="text-[12px] font-semibold text-text-3 hover:text-text"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!effectiveLockedReason && !usesObs && !ffmpegDownloading && !apiErr && error && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-danger)_40%,transparent)] bg-[var(--fc-danger-soft)] px-3.5 py-2.5 text-[13px]"
              >
                <span className="text-[var(--fc-danger)] font-semibold">{error.message}</span>
                {onReloadOptions && (
                  <Button size="sm" variant="outline" onClick={onReloadOptions}>
                    Retry
                  </Button>
                )}
              </div>
            )}

            {!effectiveLockedReason &&
              !usesObs &&
              !ffmpegDownloading &&
              !apiErr &&
              evalResult.hardLimit && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-danger)_42%,transparent)] bg-[var(--fc-danger-soft)] px-3.5 py-2.5 text-[13px]"
                >
                  <Prohibit
                    size={16}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-[var(--fc-danger)]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-bold text-[var(--fc-danger)]">
                      {evalResult.hardLimit.reason}
                    </p>
                    <p className="m-0 mt-0.5 text-text-2">
                      Apply is off until it is inside the limit.
                    </p>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[color-mix(in_oklab,var(--fc-danger)_45%,transparent)] text-[var(--fc-danger)]"
                        onClick={handleApplyFixed}
                      >
                        {evalResult.hardLimit.fixLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

            {!effectiveLockedReason &&
              !usesObs &&
              !ffmpegDownloading &&
              !apiErr &&
              !evalResult.hardLimit &&
              evalResult.budgetExceeded && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-danger)_42%,transparent)] bg-[var(--fc-danger-soft)] px-3.5 py-2.5 text-[13px]"
                >
                  <Warning
                    size={16}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-[var(--fc-danger)]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-bold text-[var(--fc-danger)]">
                      Too many different qualities for this PC.
                    </p>
                    <p className="m-0 mt-0.5 text-text-2">
                      It can run {evalResult.budgetExceeded.maxSessions} at once. Match another
                      platform’s quality and they share one.
                    </p>
                    {evalResult.budgetExceeded.matchLabel && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[color-mix(in_oklab,var(--fc-danger)_45%,transparent)] text-[var(--fc-danger)]"
                          onClick={handleMatchPeerFix}
                        >
                          {evalResult.budgetExceeded.matchLabel}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {!effectiveLockedReason &&
              !usesObs &&
              !ffmpegDownloading &&
              !apiErr &&
              !evalResult.hardLimit &&
              !evalResult.budgetExceeded &&
              evalResult.isReconnecting && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-warn)_42%,transparent)] bg-[var(--fc-warn-soft)] px-3.5 py-2.5 text-[13px]"
                >
                  <Warning
                    size={16}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-[var(--fc-warn)]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="m-0 font-bold text-text">{dest.name} is reconnecting.</p>
                    <p className="m-0 mt-0.5 text-text-2">
                      The new quality applies as soon as it is back.
                    </p>
                  </div>
                </div>
              )}

            {!effectiveLockedReason &&
              !usesObs &&
              !ffmpegDownloading &&
              !apiErr &&
              !evalResult.hardLimit &&
              !evalResult.budgetExceeded &&
              !evalResult.isReconnecting &&
              evalResult.softNote && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-[11px] border border-[color-mix(in_oklab,var(--fc-warn)_42%,transparent)] bg-[var(--fc-warn-soft)] px-3.5 py-2.5 text-[13px]"
                >
                  <Warning
                    size={16}
                    weight="bold"
                    className="mt-0.5 shrink-0 text-[var(--fc-warn)]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="m-0 font-bold text-text">{evalResult.softNote}</p>
                    <p className="m-0 mt-0.5 text-text-2">
                      Viewers on slower internet may drop frames. You can still apply it.
                    </p>
                  </div>
                </div>
              )}

            {/* Match main stream Switch card */}
            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-line bg-surface-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="m-0 text-[13.5px] font-bold text-text">Match main stream</p>
                {mainResText && (
                  <p className="m-0 mt-0.5 text-[12px] text-text-3">
                    {mainResText}
                    {fittedSameText}
                  </p>
                )}
              </div>
              <Switch
                hideLabel
                checked={draft.matchMain}
                disabled={lockedAll}
                label="Match main stream"
                onChange={(checked) => {
                  setApiErr(null)
                  if (checked) {
                    const same = model.sameAsMainResolved
                    setDraft({
                      matchMain: true,
                      width: same?.width ?? draft.width,
                      height: same?.height ?? draft.height,
                      fps: same?.fps ?? draft.fps,
                      kbps: same?.kbps ?? draft.kbps,
                    })
                    if (same) {
                      setMbpsText(String(Number((same.kbps / 1000).toFixed(2))))
                    }
                  } else {
                    const base = model.sameAsMainResolved ?? {
                      width: draft.width,
                      height: draft.height,
                      fps: draft.fps,
                      kbps: draft.kbps,
                    }
                    setDraft({
                      matchMain: false,
                      width: base.width,
                      height: base.height,
                      fps: base.fps,
                      kbps: base.kbps,
                    })
                    setMbpsText(String(Number((base.kbps / 1000).toFixed(2))))
                  }
                }}
              />
            </div>

            {/* Resolution / FPS / Bitrate controls */}
            <div
              className={cx(
                'flex flex-col gap-3.5 transition-opacity',
                controlsDisabled && 'opacity-50',
              )}
            >
              {/* Resolution */}
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold tracking-[0.06em] uppercase text-text-3">
                  <span>Resolution</span>
                  {(hasHardResChips || hasSoftResChips) && (
                    <span className="inline-flex items-center gap-3 font-medium tracking-normal normal-case">
                      {hasHardResChips && (
                        <span className="inline-flex items-center gap-1">
                          <LockSimple size={11} weight="bold" aria-hidden />
                          over limit
                        </span>
                      )}
                      {hasSoftResChips && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden
                            className="inline-block size-2 rounded-full bg-[var(--fc-warn)]"
                          />
                          not recommended
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Resolution">
                  {model.resolutions.map((r) => {
                    const selected =
                      evalResult.effective.width === r.width &&
                      evalResult.effective.height === r.height
                    const isHard = r.state === 'hard'
                    return (
                      <button
                        key={r.short}
                        type="button"
                        disabled={controlsDisabled || isHard}
                        aria-pressed={selected}
                        title={r.hardReason ?? r.softNote ?? undefined}
                        onClick={() => {
                          setApiErr(null)
                          setDraft((prev) => ({
                            ...prev,
                            matchMain: false,
                            width: r.width,
                            height: r.height,
                          }))
                        }}
                        className={cx(
                          'relative inline-flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-mono tabular-nums transition-colors',
                          isHard
                            ? 'fc-golive-hatch border-line text-text-3 opacity-60 cursor-not-allowed'
                            : selected
                              ? 'border-[var(--fc-pick)] bg-[var(--fc-pick)] text-[var(--fc-on-pick)] font-bold shadow-xs'
                              : 'border-line-strong bg-surface-2 text-text hover:bg-surface-3',
                        )}
                      >
                        {r.label}
                        {isHard && <LockSimple size={12} weight="bold" aria-hidden />}
                        {r.state === 'soft' && (
                          <span
                            aria-hidden
                            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[var(--fc-warn)]"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Frame Rate */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-[0.06em] uppercase text-text-3">
                  <span>Frame rate</span>
                  <span className="font-medium tracking-normal normal-case">fps</span>
                </div>
                <div
                  className="grid grid-flow-col auto-cols-fr gap-1 rounded-[10px] border border-line bg-inset p-1"
                  role="group"
                  aria-label="Frame rate"
                >
                  {model.fpsOptions.map((f) => {
                    const selected = evalResult.effective.fps === f.fps
                    return (
                      <button
                        key={f.fps}
                        type="button"
                        disabled={controlsDisabled || f.locked}
                        aria-pressed={selected}
                        title={f.reason ?? undefined}
                        onClick={() => {
                          setApiErr(null)
                          setDraft((prev) => ({
                            ...prev,
                            matchMain: false,
                            fps: f.fps,
                          }))
                        }}
                        className={cx(
                          'inline-flex h-8 items-center justify-center gap-1 rounded-[7px] px-2 text-[13px] font-mono tabular-nums transition-colors',
                          f.locked
                            ? 'fc-golive-hatch text-text-3 opacity-55 cursor-not-allowed'
                            : selected
                              ? 'bg-surface-1 font-bold text-text shadow-1'
                              : 'text-text-2 hover:text-text',
                        )}
                      >
                        {f.fps}
                        {f.locked && <LockSimple size={11} weight="bold" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Bitrate */}
              <div>
                <div className="mb-1.5 text-[11px] font-bold tracking-[0.06em] uppercase text-text-3">
                  Bitrate
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    className={cx(
                      'inline-flex h-10 w-[132px] items-center gap-1.5 rounded-[10px] border bg-inset px-3 font-mono transition-colors',
                      rateOver && !draft.matchMain
                        ? 'border-[var(--fc-danger)] bg-[var(--fc-danger-soft)]'
                        : 'border-line-strong focus-within:border-[var(--fc-accent)]',
                    )}
                  >
                    <input
                      ref={rateInputRef}
                      type="number"
                      min={0.5}
                      max={60}
                      step={0.5}
                      disabled={controlsDisabled}
                      aria-label="Bitrate in Mbps"
                      value={
                        draft.matchMain
                          ? Number((evalResult.effective.kbps / 1000).toFixed(2))
                          : mbpsText
                      }
                      onChange={(e) => {
                        const raw = e.target.value
                        setMbpsText(raw)
                        const parsed = Number(raw)
                        if (Number.isFinite(parsed) && parsed > 0) {
                          updateKbps(Math.round(parsed * 1000), false)
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(mbpsText)
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                          setMbpsText(String(Number((draft.kbps / 1000).toFixed(2))))
                        }
                      }}
                      className={cx(
                        'w-full bg-transparent text-right text-[15px] font-bold tabular-nums outline-none',
                        rateOver && !draft.matchMain ? 'text-[var(--fc-danger)]' : 'text-text',
                      )}
                    />
                    <span className="shrink-0 text-[12px] font-semibold text-text-3">Mbps</span>
                  </label>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-3">
                    {model.hasHardBitrateCeiling && (
                      <LockSimple size={12} weight="bold" aria-hidden />
                    )}
                    {model.hasHardBitrateCeiling
                      ? `max ${formatRate(hardMaxKbps)}`
                      : `up to ${formatRate(hardMaxKbps)}`}
                  </span>
                </div>

                {/* Slider + Hatched Hard-Limit Stop */}
                <div
                  className={cx(
                    'relative mt-2.5 flex h-7 items-center',
                    trackShake && 'fc-golive-track-shake',
                  )}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-surface-3"
                  >
                    <div
                      className="h-full bg-[var(--fc-pick)] transition-[width] duration-75"
                      style={{ width: `${safeFillPct}%` }}
                    />
                    {model.hasHardBitrateCeiling && (
                      <div
                        className="fc-golive-bitrate-hatch absolute top-0 right-0 h-full border-l border-[color-mix(in_oklab,var(--fc-danger)_55%,transparent)]"
                        style={{ width: `${100 - limitPct}%` }}
                      />
                    )}
                    {overrunPct > 0 && (
                      <div
                        className="absolute top-0 h-full bg-[var(--fc-danger)]"
                        style={{ left: `${limitPct}%`, width: `${overrunPct}%` }}
                      />
                    )}
                  </div>
                  <input
                    type="range"
                    min={minKbps}
                    max={rangeMaxKbps}
                    step={500}
                    disabled={controlsDisabled}
                    aria-label="Bitrate slider in kbps"
                    value={Math.min(rangeMaxKbps, Math.max(minKbps, evalResult.effective.kbps))}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (model.hasHardBitrateCeiling && val > hardMaxKbps) {
                        updateKbps(hardMaxKbps, true)
                        setTrackShake(true)
                        setTimeout(() => setTrackShake(false), 240)
                        return
                      }
                      updateKbps(val, true)
                    }}
                    className="fc-golive-range relative z-10 w-full"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-line bg-surface-1 px-4 py-3 flex flex-col gap-2.5">
        <p className="m-0 flex items-center gap-1.5 text-[12px] font-medium text-text-3">
          {live && (
            <Lightning
              size={14}
              weight="fill"
              className="shrink-0 text-[var(--fc-warn)]"
              aria-hidden
            />
          )}
          <span>{evalResult.footerCopy}</span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={closeAndRestore}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            busy={submitting || Boolean(dest.switching_quality)}
            disabled={
              loading || lockedAll || (apiErr?.kind === 'timeout' ? false : !evalResult.canApply)
            }
            onClick={() => {
              if (apiErr?.kind === 'timeout' && lastSubmittedRef.current) {
                void submitQuality(
                  lastSubmittedRef.current,
                  draft.matchMain
                    ? 'Same as main'
                    : `${formatResFps(draft.width, draft.height, draft.fps)} · ${formatRate(draft.kbps)}`,
                )
              } else {
                handleApply()
              }
            }}
          >
            {dest.switching_quality
              ? 'Switching…'
              : ffmpegDownloading
                ? 'Waiting…'
                : apiErr?.kind === 'timeout'
                  ? 'Try again'
                  : evalResult.applyLabel}
          </Button>
        </div>
      </div>
    </dialog>,
    hostEl,
  )
}

export interface DestinationQualityPickerProps {
  dest: DestinationView
  allDestinations?: readonly DestinationView[] | undefined
  usesObs: boolean
  isRemote?: boolean | undefined
  live: boolean
  ffmpegDownloading?: boolean | undefined
  ffmpegPercent?: number | undefined
  ignoreServiceLimits?: boolean | undefined
  optionsResponse: GoLiveQualityOptionsResponse | null
  loading: boolean
  error?: Error | null | undefined
  onReloadOptions?: (() => void) | undefined
  onUpdated: (nextView: GoLiveView) => void
  onOptimisticSwitch?: ((destId: string, label: string | null) => void) | undefined
  compact?: boolean | undefined
  triggerClassName?: string | undefined
  triggerLabel?: string | undefined
  encodeGroups?: GoLiveView['encode_groups'] | undefined
  encodeBudget?: GoLiveView['encode_budget'] | undefined
  destinationsById?: Record<string, { name: string; kind: DestinationView['kind'] }> | undefined
}

export function DestinationQualityPicker({
  dest,
  allDestinations,
  usesObs,
  isRemote = false,
  live,
  ffmpegDownloading = false,
  ffmpegPercent,
  ignoreServiceLimits = false,
  optionsResponse,
  loading,
  error,
  onReloadOptions,
  onUpdated,
  onOptimisticSwitch,
  compact = false,
  triggerClassName,
  triggerLabel,
  destinationsById,
}: DestinationQualityPickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const summary = triggerLabel ?? buildQualitySummaryText(dest, usesObs)
  const autoFitDetail =
    !compact && !usesObs && dest.quality?.mode !== 'custom' && dest.resolved_quality?.auto_fitted
      ? `Adjusted automatically to ${formatResFps(
          dest.resolved_quality.width,
          dest.resolved_quality.height,
          dest.resolved_quality.fps,
        )} at ${formatRate(dest.resolved_quality.kbps)} to fit ${dest.name}.`
      : null

  return (
    <>
      <span className="inline-flex max-w-full items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          data-quality-trigger={dest.id}
          disabled={usesObs || isRemote}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Change quality for ${dest.name}: ${summary}`}
          title={isRemote ? 'Change destination quality from your PC.' : undefined}
          onClick={() => {
            if (usesObs || isRemote) return
            setOpen(true)
          }}
          className={cx(
            'inline-flex items-center gap-1 max-w-full truncate text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fc-accent)]',
            compact
              ? 'text-[12.5px] font-medium text-text-2 hover:text-text disabled:cursor-default disabled:opacity-70'
              : 'rounded-md border border-line bg-inset px-2 py-0.5 text-[12px] font-semibold text-text-2 hover:border-line-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
            triggerClassName,
          )}
        >
          <span className="truncate">{summary}</span>
          {!usesObs && !isRemote && (
            <CaretDown size={11} weight="bold" className="shrink-0 opacity-70" aria-hidden />
          )}
        </button>
        {autoFitDetail && (
          <InfoTip label={`Quality details for ${dest.name}`}>{autoFitDetail}</InfoTip>
        )}
      </span>

      <DestinationQualityModal
        open={open}
        onClose={() => setOpen(false)}
        triggerEl={triggerRef.current}
        dest={dest}
        allDestinations={allDestinations ?? []}
        usesObs={usesObs}
        isRemote={isRemote}
        live={live}
        ffmpegDownloading={ffmpegDownloading}
        ffmpegPercent={ffmpegPercent}
        ignoreServiceLimits={ignoreServiceLimits}
        optionsResponse={optionsResponse}
        loading={loading}
        error={error}
        onReloadOptions={onReloadOptions}
        onUpdated={onUpdated}
        onOptimisticSwitch={onOptimisticSwitch}
        destinationsById={destinationsById}
      />
    </>
  )
}
