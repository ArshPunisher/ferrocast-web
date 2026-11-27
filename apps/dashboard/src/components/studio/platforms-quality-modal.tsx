import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  ArrowRight,
  Broadcast,
  CaretLeft,
  CheckCircle,
  Clock,
  DotsSixVertical,
  Lightning,
  LockSimple,
  Plus,
  Prohibit,
  Pulse,
  Trash,
  Warning,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  ApiError,
  goingTo,
  type Canvas,
  type DestinationQuality,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
} from '@ferrocast/api'
import { Button, IconButton, InfoTip, Skeleton, Switch, cx, usePreviewHole } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import { useMode } from '../../lib/mode'
import { ProtectionRule } from './golive-advanced'
import {
  AddDestinationFormBody,
  Logo,
  ReachLine,
  platformTileTone,
  useAddDestinationState,
  usePlatformsListController,
} from './platform-shared'
import {
  buildMatchMainComparison,
  buildModalModel,
  buildQualitySummaryText,
  evaluateModalDraft,
  formatEditorHeaderStatus,
  formatModalRate,
  formatModalResFps,
  initialDraftFromModel,
  mapQualityApiError,
  toDestinationQualityPayload,
  type ApiQualityErrorInfo,
  type ModalDraft,
} from './quality-modal-model'

export { useQualityOptions } from './platform-shared'

export interface PlatformsQualityModalProps {
  open: boolean
  onClose: () => void
  view: GoLiveView
  onSaved: () => void
  onUpdated?: ((nextView: GoLiveView) => void) | undefined
  onProtect?: ((on: boolean) => void) | undefined
  onOptimisticSwitch?: ((destId: string, label: string | null) => void) | undefined
  initialDestId?: string | null | undefined
  initialMode?: 'editor' | 'add' | undefined
  addCanvas?: Canvas | undefined
  canvasFilter?: Canvas | 'all' | undefined
  triggerEl?: HTMLElement | null | undefined
  usesObs: boolean
  isRemote?: boolean | undefined
  videoKbps?: number | undefined
  audioKbps?: number | undefined
  optionsResponse: GoLiveQualityOptionsResponse | null
  loading: boolean
  error: string | null
  onReloadOptions: () => void
}

function useIsCompactModal(): boolean {
  const query = '(max-width: 820px)'
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return compact
}

export function PlatformsQualityModal({
  open,
  onClose,
  view,
  onSaved,
  onUpdated,
  onProtect,
  onOptimisticSwitch,
  initialDestId,
  initialMode = 'editor',
  addCanvas = 'main',
  canvasFilter = 'all',
  triggerEl,
  usesObs,
  isRemote: _isRemote = false,
  videoKbps,
  audioKbps,
  optionsResponse,
  loading,
  error,
  onReloadOptions,
}: PlatformsQualityModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const wasOpenRef = useRef(false)
  const lastActiveRef = useRef<HTMLElement | null>(null)
  const userEditedRef = useRef(false)
  const isCompact = useIsCompactModal()
  const [studioMode] = useMode('studio')

  const ctrl = usePlatformsListController({
    view,
    onSaved,
    onProtect,
    canvas: canvasFilter,
    videoKbps,
    audioKbps,
    usesObs,
  })

  const defaultSelectedId = useMemo(() => {
    if (initialDestId && ctrl.merged.some((d) => d.id === initialDestId)) return initialDestId
    return ctrl.merged.find((d) => d.enabled)?.id ?? ctrl.merged[0]?.id ?? null
  }, [initialDestId, ctrl.merged])

  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId)
  const [rightView, setRightView] = useState<'editor' | 'add'>(initialMode)
  const [mobileStep, setMobileStep] = useState<'list' | 'editor'>(() =>
    initialMode === 'add' || (isCompact && Boolean(initialDestId)) ? 'editor' : 'list',
  )
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<ApiQualityErrorInfo | null>(null)
  const [clampNotice, setClampNotice] = useState<string | null>(null)
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null)
  const [sliderShaking, setSliderShaking] = useState(false)

  // Initialize selection and mobile step only on open transition or explicit target change,
  // never resetting user navigation when background GoLive frames refresh `view`.
  const prevInitRef = useRef<{
    open: boolean
    destId: string | null | undefined
    mode: 'editor' | 'add'
  }>({ open: false, destId: initialDestId, mode: initialMode })

  const onReloadOptionsRef = useRef(onReloadOptions)
  onReloadOptionsRef.current = onReloadOptions

  useEffect(() => {
    const prev = prevInitRef.current
    const becameOpen = open && !prev.open
    const explicitTargetChanged =
      open && (prev.destId !== initialDestId || prev.mode !== initialMode)
    prevInitRef.current = { open, destId: initialDestId, mode: initialMode }

    if (becameOpen) {
      onReloadOptionsRef.current()
    }
    if (!becameOpen && !explicitTargetChanged) return
    setRightView(initialMode)
    if (initialDestId) {
      setSelectedId(initialDestId)
      setMobileStep(isCompact ? 'editor' : 'list')
    } else if (initialMode === 'add') {
      setMobileStep(isCompact ? 'editor' : 'list')
    } else {
      setSelectedId(defaultSelectedId)
      setMobileStep('list')
    }
    setConfirmRemoveId(null)
    setApiError(null)
    setClampNotice(null)
    setAppliedNotice(null)
    userEditedRef.current = false
  }, [open, initialDestId, initialMode, defaultSelectedId, isCompact])

  // Ensure selectedId stays valid if a custom destination is removed or added.
  useEffect(() => {
    if (!open) return
    if (selectedId && ctrl.merged.some((d) => d.id === selectedId)) return
    setSelectedId(ctrl.merged.find((d) => d.enabled)?.id ?? ctrl.merged[0]?.id ?? null)
  }, [open, selectedId, ctrl.merged])

  const selectedDest = useMemo(
    () => ctrl.merged.find((d) => d.id === selectedId) ?? ctrl.merged[0] ?? null,
    [ctrl.merged, selectedId],
  )

  const selectedDestOpts = selectedDest
    ? (optionsResponse?.destinations?.[selectedDest.id] ?? null)
    : null

  const model = useMemo(() => {
    if (!selectedDest) return null
    return buildModalModel({
      dest: selectedDest,
      destOpts: selectedDestOpts,
      response: optionsResponse,
    })
  }, [selectedDest, selectedDestOpts, optionsResponse])

  const [draft, setDraft] = useState<ModalDraft>(() =>
    model
      ? initialDraftFromModel(model)
      : { matchMain: true, width: 1920, height: 1080, fps: 60, kbps: 6000 },
  )

  // Reset draft cleanly whenever switching selected platform or receiving fresh engine state when clean.
  const prevDestIdRef = useRef<string | null>(selectedDest?.id ?? null)
  const prevQualitySigRef = useRef<string>('')
  const currentQualitySig = selectedDest
    ? `${selectedDest.id}:${JSON.stringify(selectedDestOpts?.current ?? selectedDest.quality ?? 'same')}:${selectedDestOpts?.resolved?.kbps ?? selectedDest.resolved_quality?.kbps ?? 0}`
    : 'none'

  useLayoutEffect(() => {
    if (!model) return
    const destChanged = prevDestIdRef.current !== model.dest.id
    const engineSynced = prevQualitySigRef.current !== currentQualitySig
    if (destChanged || (!userEditedRef.current && engineSynced)) {
      prevDestIdRef.current = model.dest.id
      prevQualitySigRef.current = currentQualitySig
      setDraft(initialDraftFromModel(model))
      if (destChanged) {
        userEditedRef.current = false
        setApiError(null)
        setClampNotice(null)
        setAppliedNotice(null)
      }
    }
  }, [model, currentQualitySig])

  usePreviewHole(dialogRef, {
    active: open,
    deps: [
      selectedDest?.id,
      rightView,
      mobileStep,
      draft.matchMain,
      confirmRemoveId,
      apiError?.kind,
    ],
  })

  // Manage native <dialog> lifecycle and focus return without nested dialogs.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      lastActiveRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          try {
            dialog.showModal()
          } catch {
            dialog.setAttribute('open', '')
          }
        } else {
          dialog.setAttribute('open', '')
        }
      }
      requestAnimationFrame(() => {
        const preferred =
          dialog.querySelector<HTMLElement>(
            isCompact && mobileStep === 'list'
              ? '[data-select-platform], button:not([disabled])'
              : '.fc-om-pane-r [role="radio"][aria-checked="true"], .fc-om-pane-r button:not([disabled]), .fc-om-pane-l [data-select-platform], button:not([disabled])',
          ) ?? dialog
        preferred.focus({ preventScroll: true })
      })
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      const back =
        triggerEl && document.contains(triggerEl)
          ? triggerEl
          : lastActiveRef.current && document.contains(lastActiveRef.current)
            ? lastActiveRef.current
            : null
      back?.focus({ preventScroll: true })
    }
  }, [open, triggerEl, isCompact, mobileStep])

  const liveForSelected = selectedDest
    ? selectedDest.canvas === 'vertical'
      ? view.vertical_live
      : view.live
    : false
  const ignoreLimits = Boolean(view.advanced?.ignore_service_limits)

  const evalResult = useMemo(() => {
    if (!model || !selectedDest) return null
    return evaluateModalDraft(model, draft, {
      dest: selectedDest,
      allDestinations: ctrl.merged,
      live: liveForSelected,
      budget: optionsResponse?.budget ?? view.encode_budget ?? null,
      ignoreServiceLimits: ignoreLimits,
    })
  }, [
    model,
    selectedDest,
    draft,
    ctrl.merged,
    liveForSelected,
    optionsResponse?.budget,
    view.encode_budget,
    ignoreLimits,
  ])

  const matchComparison = useMemo(
    () => (model ? buildMatchMainComparison(model, ignoreLimits) : null),
    [model, ignoreLimits],
  )

  const addState = useAddDestinationState({
    canvas: addCanvas,
    onAdded: (createdId) => {
      onSaved()
      onReloadOptions()
      if (createdId) setSelectedId(createdId)
    },
    onClose: () => {
      setRightView('editor')
      if (isCompact) setMobileStep('list')
    },
  })

  const ffmpegDownloading =
    selectedDest?.canvas === 'vertical' &&
    view.cut.source === 'cut' &&
    view.cut.ffmpeg.state === 'downloading'
  const ffmpegPercent =
    selectedDest?.canvas === 'vertical' &&
    view.cut.source === 'cut' &&
    view.cut.ffmpeg.state === 'downloading'
      ? view.cut.ffmpeg.percent
      : undefined
  const activeLockedReason =
    model?.lockedReason ??
    (ffmpegDownloading
      ? `Setting up vertical video${ffmpegPercent != null ? ` (${Math.round(ffmpegPercent)}%)` : ''}. Custom quality unlocks once ready.`
      : null)

  const commitDraft = (next: ModalDraft) => {
    userEditedRef.current = true
    setDraft(next)
    setApiError(null)
    setAppliedNotice(null)
    if (next.matchMain || next.kbps <= (model?.bitrateHardMaxKbps ?? next.kbps)) {
      setClampNotice(null)
    }
  }

  const handleApply = async (overrideQuality?: DestinationQuality) => {
    if (!selectedDest || !evalResult || submitting || selectedDest.switching_quality) return
    const payload = overrideQuality ?? toDestinationQualityPayload(draft)
    const effective =
      overrideQuality?.mode === 'custom'
        ? {
            width: overrideQuality.width,
            height: overrideQuality.height,
            fps: overrideQuality.fps,
            kbps: overrideQuality.kbps,
          }
        : evalResult.effective
    setSubmitting(true)
    setApiError(null)
    setAppliedNotice(null)
    try {
      if (liveForSelected && selectedDest.enabled) {
        onOptimisticSwitch?.(
          selectedDest.id,
          `${formatModalResFps(effective.width, effective.height, effective.fps)} · ${formatModalRate(effective.kbps)}`,
        )
      }
      const nextView = await ctrl.api.setQuality(selectedDest.id, payload)
      userEditedRef.current = false
      useLive.getState().setGoLiveView(nextView)
      onUpdated?.(nextView)
      onReloadOptions()
      onSaved()
      if (initialDestId) {
        onClose()
      } else {
        setAppliedNotice(
          `${selectedDest.name} updated to ${formatModalResFps(effective.width, effective.height, effective.fps)} · ${formatModalRate(effective.kbps)}.`,
        )
      }
    } catch (e: unknown) {
      onOptimisticSwitch?.(selectedDest.id, null)
      if (e instanceof ApiError) {
        setApiError(mapQualityApiError(e.code, e.message, selectedDest.name))
      } else {
        const msg = e instanceof Error ? e.message : 'Something went wrong.'
        setApiError(mapQualityApiError(null, msg, selectedDest.name))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      if (confirmRemoveId) {
        setConfirmRemoveId(null)
        return
      }
      if (ctrl.saver.ask) {
        ctrl.saver.dismissAsk()
        return
      }
      onClose()
      return
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (el) => !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true' && !el.hidden,
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const handleCancel = () => {
    if (rightView === 'add') {
      addState.reset()
      setRightView('editor')
      if (isCompact) setMobileStep('list')
      return
    }
    onClose()
  }

  const headerStatus = selectedDest ? formatEditorHeaderStatus(selectedDest, liveForSelected) : null
  const isSelectedBusy = submitting || Boolean(selectedDest?.switching_quality)
  const titleText = canvasFilter === 'vertical' ? 'Your vertical platforms' : 'Your platforms'
  const showBackInHeader = isCompact && (mobileStep === 'editor' || rightView === 'add')

  const confirmRemoveDest = confirmRemoveId
    ? (ctrl.merged.find((d) => d.id === confirmRemoveId) ?? null)
    : null

  return (
    <dialog
      ref={dialogRef}
      data-platforms-modal=""
      aria-modal="true"
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      onKeyDown={handleKeyDown}
      className="fc-golive-modal fc-om-dialog"
    >
      {open && (
        <div className="flex h-full min-h-0 flex-col bg-surface-1 text-text">
          {/* Unified Top Header (never clipped) */}
          <div className="fc-om-head">
            <div className="flex min-w-0 items-center gap-2">
              {showBackInHeader && (
                <IconButton
                  label="Back to platforms"
                  size="sm"
                  onClick={() => {
                    setConfirmRemoveId(null)
                    if (rightView === 'add') {
                      addState.reset()
                      setRightView('editor')
                    }
                    setMobileStep('list')
                  }}
                >
                  <CaretLeft size={16} weight="bold" />
                </IconButton>
              )}
              <h2 id={headingId} className="truncate font-display text-[15px] font-bold text-text">
                {titleText}
              </h2>
            </div>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>

          {/* Two-Pane Body (Side-by-side Desktop, Smooth 2-Step Drawer <= 820px) */}
          <div className="fc-om-stage">
            <div className="fc-om-panes" data-step={mobileStep}>
              {/* LEFT PANE: Platform List & Global Toggles */}
              <div
                id="golive-platforms"
                className="fc-om-pane-l"
                inert={isCompact && mobileStep === 'editor' ? true : undefined}
              >
                <div className="fc-om-ltools">
                  <p className="m-0 min-w-0 flex-1 text-[12px] leading-snug text-text-3">
                    Drag to set what pauses first: bottom pauses first.
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<Plus size={13} />}
                    aria-label="Add a destination"
                    onClick={() => {
                      addState.reset()
                      setConfirmRemoveId(null)
                      setRightView('add')
                      if (isCompact) setMobileStep('editor')
                    }}
                  >
                    Add a destination
                  </Button>
                </div>

                <ul className="fc-om-list" aria-label="Platforms, top first">
                  {ctrl.merged.map((d, i) => {
                    const selected = rightView === 'editor' && selectedDest?.id === d.id
                    const destLive = d.canvas === 'vertical' ? view.vertical_live : view.live
                    const tone = platformTileTone(d, destLive)
                    const destOpts = optionsResponse?.destinations?.[d.id]
                    const sameResolved =
                      destOpts?.options.find((o) => o.quality.mode === 'same_as_main')?.resolved ??
                      destOpts?.resolved ??
                      null
                    const baseSummary = buildQualitySummaryText(
                      d,
                      ctrl.usesObs,
                      undefined,
                      sameResolved
                        ? {
                            width: sameResolved.width,
                            height: sameResolved.height,
                            fps: sameResolved.fps,
                            kbps: sameResolved.kbps,
                            auto_fitted: Boolean(
                              destOpts?.options.find((o) => o.quality.mode === 'same_as_main')
                                ?.auto_fitted ?? d.resolved_quality?.auto_fitted,
                            ),
                          }
                        : null,
                    )
                    const rowQualityLine = d.enabled ? baseSummary : `Off · ${baseSummary}`

                    return (
                      <li
                        key={d.id}
                        data-platform-tile={d.id}
                        data-selected={selected ? 'true' : undefined}
                        draggable
                        onDragStart={() => (ctrl.dragged.current = i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (ctrl.dragged.current !== null) ctrl.move(ctrl.dragged.current, i)
                          ctrl.dragged.current = null
                        }}
                        className={cx('fc-om-row', selected && 'is-selected')}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="grid size-7 shrink-0 cursor-grab place-items-center rounded-[6px] text-text-3 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                            aria-label={`Move ${d.name}: arrow up or down`}
                            onKeyDown={ctrl.onGripKey(i)}
                          >
                            <DotsSixVertical size={15} aria-hidden />
                          </button>

                          <button
                            type="button"
                            data-select-platform={d.id}
                            aria-current={selected ? 'true' : undefined}
                            onClick={() => {
                              setConfirmRemoveId(null)
                              setRightView('editor')
                              setSelectedId(d.id)
                              if (isCompact) setMobileStep('editor')
                            }}
                            className="fc-om-row-select"
                          >
                            <Logo kind={d.kind} size={26} />
                            <span className="min-w-0 flex-1 text-left">
                              <span className="flex items-center gap-1.5">
                                <b className="truncate text-[13.5px] font-semibold text-text">
                                  {d.name}
                                </b>
                                {d.canvas === 'vertical' && (
                                  <span className="rounded-full bg-surface-3 px-1.5 py-px text-[10px] font-semibold text-text-2">
                                    Vertical
                                  </span>
                                )}
                                {d.enabled &&
                                  (tone.word === 'Live' ||
                                    tone.word === 'Reconnecting' ||
                                    tone.word === 'Failed') && (
                                    <span
                                      className={cx(
                                        'rounded-full px-1.5 py-px text-[10px] font-semibold',
                                        tone.badgeCls,
                                      )}
                                    >
                                      {tone.word}
                                    </span>
                                  )}
                              </span>
                              <span
                                data-row-quality={d.id}
                                className="block truncate text-[12px] text-text-2 tabular-nums"
                              >
                                {rowQualityLine}
                              </span>
                            </span>
                          </button>

                          <div className="flex shrink-0 items-center gap-1">
                            {(d.kind === 'custom' || d.connected) && (
                              <Button
                                size="xs"
                                variant="ghost"
                                aria-label={`Test connection to ${d.name}`}
                                busy={ctrl.busy === `test:${d.id}`}
                                onClick={() => ctrl.test(d)}
                              >
                                <Pulse size={14} aria-hidden />
                              </Button>
                            )}
                            {d.kind === 'custom' && (
                              <IconButton
                                size="xs"
                                variant="ghost"
                                label={`Remove ${d.name}`}
                                disabled={ctrl.busy === `rm:${d.id}`}
                                onClick={() => {
                                  setConfirmRemoveId(d.id)
                                  if (isCompact) setMobileStep('editor')
                                }}
                              >
                                <Trash size={14} />
                              </IconButton>
                            )}
                            <Switch
                              label={`Stream to ${d.name}`}
                              hideLabel
                              checked={d.enabled}
                              disabled={ctrl.busy === 'order' || (!d.enabled && Boolean(d.blocked))}
                              onChange={(on) => ctrl.toggle(d.id, on)}
                            />
                          </div>
                        </div>

                        {ctrl.tests[d.id] !== undefined && (
                          <ReachLine r={ctrl.tests[d.id]!} className="mt-1.5 pl-0 sm:pl-[92px]" />
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="fc-om-lfoot">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px]">
                    <b className="font-semibold text-text">{goingTo(ctrl.merged)}.</b>
                    {ctrl.uploadSummary && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-2">{ctrl.uploadSummary.line}</span>
                        <InfoTip label="Why upload adds up">{ctrl.uploadSummary.detail}</InfoTip>
                      </div>
                    )}
                  </div>

                  {canvasFilter !== 'vertical' && (
                    <div className="flex flex-col gap-2.5 pt-1">
                      <Switch
                        label="Upload protection"
                        description="If your upload can’t carry every platform, the bottom one pauses for a while so the ones above stay smooth."
                        checked={view.protect}
                        disabled={ctrl.busy === 'protect'}
                        onChange={ctrl.protect}
                      />
                      {studioMode === 'advanced' && view.protect && (
                        <ProtectionRule view={view} onSaved={onSaved} />
                      )}
                      <Switch
                        label="Auto quality"
                        description="If your upload struggles, the stream’s quality drops a little so it stays smooth, then comes back by itself."
                        checked={view.auto_quality}
                        disabled={ctrl.busy === 'auto-quality'}
                        onChange={ctrl.autoQuality}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Quality Editor or Inline Add / Confirm */}
              <div
                className="fc-om-pane-r"
                inert={isCompact && mobileStep === 'list' ? true : undefined}
              >
                {/* Inline Live Toggle Confirmation (replaces nested saver.dialog) */}
                {ctrl.saver.ask && (
                  <div
                    role="alert"
                    className="mx-5 mt-4 flex flex-col gap-2.5 rounded-[12px] border border-warn/45 bg-warn-soft/35 p-3.5"
                  >
                    <div className="flex items-start gap-2">
                      <Warning
                        size={17}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-warn"
                        aria-hidden
                      />
                      <div className="min-w-0 text-[13px] leading-snug">
                        <p className="m-0 font-semibold text-text">
                          {ctrl.saver.last
                            ? 'Stop sending to your last platform?'
                            : 'Your upload may not carry this'}
                        </p>
                        <p className="m-0 mt-0.5 text-text-2">
                          {ctrl.saver.ask.message} {ctrl.saver.ask.hint}{' '}
                          {ctrl.saver.askFailed ?? ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="outline" onClick={ctrl.saver.dismissAsk}>
                        {ctrl.saver.last ? 'Keep it on' : 'Not now'}
                      </Button>
                      <Button
                        size="xs"
                        variant={ctrl.saver.last ? 'danger' : 'primary'}
                        busy={ctrl.saver.askBusy}
                        onClick={ctrl.saver.confirmAsk}
                      >
                        {ctrl.saver.last ? 'Stop sending' : 'Add it anyway'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Inline Remove Custom Destination Confirm (replaces nested Remove dialog) */}
                {confirmRemoveDest && (
                  <div
                    role="alert"
                    className="mx-5 mt-4 flex flex-col gap-2.5 rounded-[12px] border border-danger/45 bg-danger-soft/35 p-3.5"
                  >
                    <div className="min-w-0 text-[13px] leading-snug">
                      <p className="m-0 font-semibold text-text">
                        Remove {confirmRemoveDest.name}?
                      </p>
                      <p className="m-0 mt-0.5 text-text-2">
                        It stops getting your stream, and its stream key is deleted from this
                        computer.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="outline" onClick={() => setConfirmRemoveId(null)}>
                        Keep it
                      </Button>
                      <Button
                        size="xs"
                        variant="danger"
                        busy={ctrl.busy === `rm:${confirmRemoveDest.id}`}
                        onClick={() =>
                          ctrl.remove(confirmRemoveDest, () => {
                            setConfirmRemoveId(null)
                            if (isCompact) setMobileStep('list')
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}

                {rightView === 'add' ? (
                  <>
                    <div className="fc-om-rhead">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-text-2">
                        <Broadcast size={18} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="m-0 truncate text-[15px] font-semibold text-text">
                          Add a destination
                        </h3>
                        <p className="m-0 text-[12px] text-text-2">
                          Paste a server address and stream key
                        </p>
                      </div>
                    </div>
                    <div className="fc-om-rbody">
                      <AddDestinationFormBody state={addState} canvas={addCanvas} />
                    </div>
                    <div className="fc-om-rfoot">
                      <span className="flex items-center gap-1.5 text-[12px] text-text-2">
                        <Clock size={14} aria-hidden />
                        Applies from your next stream.
                      </span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancel}>
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          busy={addState.busy === 'test'}
                          disabled={!addState.url.trim()}
                          onClick={addState.tryIt}
                        >
                          Test
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          busy={addState.busy === 'add'}
                          disabled={!addState.canAdd}
                          onClick={addState.submit}
                        >
                          {addState.submitLabel}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : selectedDest && model && evalResult && matchComparison && headerStatus ? (
                  <>
                    <div className="fc-om-rhead">
                      <Logo kind={selectedDest.kind} size={36} />
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 truncate text-[15px] font-semibold text-text">
                          {selectedDest.name} quality
                        </h3>
                        <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[12px] text-text-2">
                          {selectedDest.canvas === 'vertical' && <span>Upright picture ·</span>}
                          {headerStatus.tone === 'live' && (
                            <span
                              aria-hidden
                              className="inline-block size-2 rounded-full bg-[var(--fc-ok)]"
                            />
                          )}
                          <span
                            className={cx(
                              headerStatus.tone === 'live' && 'font-semibold text-[var(--fc-ok)]',
                              headerStatus.tone === 'work' &&
                                'font-semibold text-[var(--fc-accent-text)]',
                              headerStatus.tone === 'warn' && 'font-semibold text-[var(--fc-warn)]',
                              headerStatus.tone === 'bad' &&
                                'font-semibold text-[var(--fc-danger)]',
                            )}
                          >
                            {headerStatus.text}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="fc-om-rbody">
                      {error && (
                        <div
                          role="alert"
                          className="mb-3 flex items-center justify-between gap-2 rounded-[10px] border border-danger/35 bg-danger-soft/45 px-3 py-2 text-[12.5px] text-text"
                        >
                          <span>Couldn’t load quality options ({error}).</span>
                          <Button size="xs" variant="outline" onClick={onReloadOptions}>
                            Retry
                          </Button>
                        </div>
                      )}

                      {loading && !optionsResponse && (
                        <div
                          data-testid="quality-loading"
                          role="status"
                          className="mb-3 flex flex-col gap-2.5"
                        >
                          <Skeleton className="h-9 w-full rounded-[10px]" />
                          <Skeleton className="h-24 w-full rounded-[12px]" />
                        </div>
                      )}

                      {(!selectedDest.connected || selectedDest.blocked) && (
                        <div className="mb-3 flex items-start gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-text-2">
                          <WarningCircle
                            size={15}
                            weight="fill"
                            className="mt-0.5 shrink-0 text-text-3"
                            aria-hidden
                          />
                          <span>
                            {selectedDest.blocked ??
                              `Connect ${selectedDest.name} in Settings, Accounts to stream there.`}
                          </span>
                        </div>
                      )}

                      {(selectedDest.switching_quality || (isSelectedBusy && liveForSelected)) && (
                        <div
                          role="status"
                          className="mb-3 flex items-center gap-2 rounded-[10px] border border-accent-line/40 bg-accent-soft px-3 py-2 text-[12.5px] font-medium text-text"
                        >
                          Switching {selectedDest.name} stream…
                        </div>
                      )}

                      {evalResult.isReconnecting && (
                        <div
                          role="status"
                          className="mb-3 flex items-center gap-2 rounded-[10px] border border-warn/40 bg-warn-soft/50 px-3 py-2 text-[12.5px] text-text"
                        >
                          <Warning
                            size={15}
                            weight="fill"
                            className="shrink-0 text-warn"
                            aria-hidden
                          />
                          <span>
                            Waiting for {selectedDest.name} to reconnect — your change will apply as
                            soon as it’s back.
                          </span>
                        </div>
                      )}

                      {appliedNotice && !apiError && (
                        <div
                          role="status"
                          className="mb-3 flex items-center gap-2 rounded-[10px] border border-ok/35 bg-ok-soft/45 px-3 py-2 text-[12.5px] font-medium text-text"
                        >
                          <CheckCircle
                            size={15}
                            weight="fill"
                            className="shrink-0 text-ok"
                            aria-hidden
                          />
                          <span>{appliedNotice}</span>
                        </div>
                      )}

                      {apiError && (
                        <div
                          role="alert"
                          className="mb-3 flex flex-col gap-2 rounded-[10px] border border-danger/45 bg-danger-soft/45 p-3 text-[12.5px]"
                        >
                          <div className="flex items-start gap-2">
                            <Warning
                              size={16}
                              weight="fill"
                              className="mt-0.5 shrink-0 text-danger"
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="m-0 font-semibold text-text">{apiError.title}</p>
                              <p className="m-0 mt-0.5 text-text-2">{apiError.detail}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {apiError.retryable && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void handleApply()}
                              >
                                Try again
                              </Button>
                            )}
                            {apiError.canClamp && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  const clamped = evalResult.hardLimit?.fixedDraft ?? {
                                    ...draft,
                                    matchMain: false,
                                    kbps: Math.min(draft.kbps, model.bitrateHardMaxKbps),
                                  }
                                  commitDraft(clamped)
                                }}
                              >
                                Use {formatModalRate(model.bitrateHardMaxKbps)}
                              </Button>
                            )}
                            {apiError.kind === 'budget' && evalResult.budgetExceeded?.peer && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  void handleApply(evalResult.budgetExceeded!.peer!.quality)
                                }
                              >
                                {evalResult.budgetExceeded.matchLabel}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {activeLockedReason ? (
                        <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-4">
                          <div className="flex items-start gap-2.5">
                            <LockSimple
                              size={17}
                              className="mt-0.5 shrink-0 text-text-2"
                              aria-hidden
                            />
                            <div>
                              <p className="m-0 text-[13.5px] font-semibold text-text">
                                Quality follows {usesObs ? 'OBS' : 'its current source'}
                              </p>
                              <p className="m-0 mt-1 text-[12.5px] text-text-2">
                                {activeLockedReason}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between border-t border-line pt-2.5 text-[12.5px] text-text-2">
                            <span>Currently sends</span>
                            <span className="font-mono font-semibold text-text tabular-nums">
                              {formatModalResFps(
                                evalResult.effective.width,
                                evalResult.effective.height,
                                evalResult.effective.fps,
                              )}{' '}
                              · {formatModalRate(evalResult.effective.kbps)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {/* Two-option switch: Match main stream | Set my own */}
                          <div
                            role="radiogroup"
                            aria-label="Quality source"
                            className="fc-om-srcseg"
                            onKeyDown={(e) => {
                              if (
                                e.key === 'ArrowRight' ||
                                e.key === 'ArrowDown' ||
                                e.key === 'ArrowLeft' ||
                                e.key === 'ArrowUp'
                              ) {
                                e.preventDefault()
                                commitDraft({ ...draft, matchMain: !draft.matchMain })
                              }
                            }}
                          >
                            <button
                              type="button"
                              role="radio"
                              aria-checked={draft.matchMain}
                              onClick={() => commitDraft({ ...draft, matchMain: true })}
                              className={cx('fc-om-srcopt', draft.matchMain && 'is-on')}
                            >
                              {matchComparison.switchMatchLabel}
                            </button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={!draft.matchMain}
                              onClick={() => commitDraft({ ...draft, matchMain: false })}
                              className={cx('fc-om-srcopt', !draft.matchMain && 'is-on')}
                            >
                              Set my own
                            </button>
                          </div>

                          {draft.matchMain ? (
                            <div className="flex flex-col gap-3">
                              <div
                                data-quality-comparison=""
                                role="region"
                                aria-label="Quality comparison"
                                className="fc-om-cmpcard"
                              >
                                <div className="fc-om-cmp">
                                  <div className="fc-om-cmp-c">
                                    <span className="fc-om-cmp-k">{matchComparison.baseLabel}</span>
                                    <div className="fc-om-cmp-v">
                                      <span>{matchComparison.base.resFps}</span>
                                      <span className="text-text-3">·</span>
                                      <span>{matchComparison.base.rate}</span>
                                    </div>
                                    <span className="fc-om-cmp-sub">
                                      {matchComparison.base.dims}
                                    </span>
                                  </div>
                                  <ArrowRight
                                    size={16}
                                    className="shrink-0 text-text-3"
                                    aria-hidden
                                  />
                                  <div className="fc-om-cmp-c">
                                    <span className="fc-om-cmp-k">{selectedDest.name} gets</span>
                                    <div className="fc-om-cmp-v">
                                      <span
                                        className={cx(
                                          (matchComparison.resCut || matchComparison.fpsCut) &&
                                            'is-cut',
                                        )}
                                      >
                                        {matchComparison.fitted.resFps}
                                      </span>
                                      <span className="text-text-3">·</span>
                                      <span className={cx(matchComparison.rateCut && 'is-cut')}>
                                        {matchComparison.fitted.rate}
                                      </span>
                                    </div>
                                    <span
                                      className={cx(
                                        'fc-om-cmp-sub',
                                        matchComparison.resCut && 'is-cut',
                                      )}
                                    >
                                      {matchComparison.fitted.dims}
                                    </span>
                                  </div>
                                </div>

                                {matchComparison.softTip && (
                                  <div className="fc-om-cmptip" data-soft-tip="">
                                    <Warning
                                      size={15}
                                      weight="fill"
                                      className="mt-0.5 shrink-0 text-warn"
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1">
                                      {matchComparison.softTip.text}
                                    </span>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      data-soft-fix="1080p"
                                      onClick={() =>
                                        commitDraft(matchComparison.softTip!.targetDraft)
                                      }
                                    >
                                      {matchComparison.softTip.actionLabel}
                                    </Button>
                                  </div>
                                )}

                                {matchComparison.sharedCap && (
                                  <div className="fc-om-cmptip" data-budget-shared-cap="">
                                    <Warning
                                      size={15}
                                      weight="fill"
                                      className="mt-0.5 shrink-0 text-warn"
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1">
                                      {matchComparison.sharedCap.detail}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {!matchComparison.sharedCap && (
                                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-text-2">
                                  {matchComparison.reasons.map((line) => (
                                    <li key={line} className="flex items-start gap-2">
                                      <span
                                        aria-hidden
                                        className="mt-[6px] size-1.5 shrink-0 rounded-full bg-text-3"
                                      />
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              {/* Single Result Box (neutral unless genuine warn/bad) */}
                              <div
                                data-quality-result=""
                                className={cx(
                                  'fc-om-result',
                                  evalResult.resultTone === 'warn' && 'is-warn',
                                  evalResult.resultTone === 'bad' && 'is-bad',
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[13px] font-semibold text-text">
                                    {selectedDest.name} gets{' '}
                                    {formatModalResFps(
                                      evalResult.effective.width,
                                      evalResult.effective.height,
                                      evalResult.effective.fps,
                                    )}{' '}
                                    at {formatModalRate(evalResult.effective.kbps)}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center rounded-full border border-line bg-surface-1 px-2 py-0.5 text-[11px] font-semibold text-text-2">
                                      {evalResult.badgeText}
                                    </span>
                                    <InfoTip label={`About ${selectedDest.name} quality details`}>
                                      {evalResult.sharesWith.length > 0
                                        ? `Shares one encoder with ${evalResult.sharesWith.join(' & ')}.`
                                        : 'Uses its own video encode so your other platforms and recording keep their quality.'}
                                    </InfoTip>
                                  </span>
                                </div>
                                {(evalResult.hardLimit ||
                                  evalResult.budgetExceeded ||
                                  evalResult.softNote) && (
                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[12px]">
                                    <span className="min-w-0 flex-1 text-text-2">
                                      {evalResult.hardLimit?.reason ??
                                        (evalResult.budgetExceeded
                                          ? `Your PC can run ${evalResult.budgetExceeded.maxSessions} ${evalResult.budgetExceeded.maxSessions === 1 ? 'encode' : 'encodes'} at once.`
                                          : evalResult.softNote)}
                                    </span>
                                    {evalResult.hardLimit && (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        data-hard-fix=""
                                        onClick={() =>
                                          commitDraft(evalResult.hardLimit!.fixedDraft)
                                        }
                                      >
                                        {evalResult.hardLimit.fixLabel}
                                      </Button>
                                    )}
                                    {!evalResult.hardLimit &&
                                      evalResult.budgetExceeded?.peer &&
                                      evalResult.budgetExceeded.matchLabel && (
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => {
                                            const p = evalResult.budgetExceeded!.peer!
                                            if (p.quality.mode === 'custom') {
                                              commitDraft({
                                                matchMain: false,
                                                width: p.quality.width,
                                                height: p.quality.height,
                                                fps: p.quality.fps,
                                                kbps: p.quality.kbps,
                                              })
                                            } else {
                                              commitDraft({ ...draft, matchMain: true })
                                            }
                                          }}
                                        >
                                          {evalResult.budgetExceeded.matchLabel}
                                        </Button>
                                      )}
                                  </div>
                                )}
                              </div>

                              {/* Resolution chips */}
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[12px] font-semibold text-text-2">
                                    Resolution
                                  </span>
                                  <span className="flex items-center gap-3 text-[11px] text-text-3">
                                    <span className="inline-flex items-center gap-1">
                                      <Prohibit size={11} aria-hidden /> over limit
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        aria-hidden
                                        className="inline-block size-1.5 rounded-full bg-warn"
                                      />
                                      not recommended
                                    </span>
                                  </span>
                                </div>
                                <div
                                  role="group"
                                  aria-label="Resolution"
                                  className="flex flex-wrap gap-1.5"
                                >
                                  {model.resolutions.map((res) => {
                                    const selected =
                                      draft.width === res.width && draft.height === res.height
                                    const locked = res.state === 'hard' && !ignoreLimits
                                    return (
                                      <button
                                        key={`${res.width}x${res.height}`}
                                        type="button"
                                        disabled={locked}
                                        aria-pressed={selected}
                                        title={res.hardReason ?? res.softNote ?? undefined}
                                        onClick={() =>
                                          commitDraft({
                                            ...draft,
                                            matchMain: false,
                                            width: res.width,
                                            height: res.height,
                                          })
                                        }
                                        className={cx(
                                          'fc-press inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[12.5px] font-semibold tabular-nums',
                                          'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                                          locked && 'fc-om-chip-locked',
                                          !locked && selected
                                            ? 'border-accent-line bg-accent-soft text-text'
                                            : !locked &&
                                                'border-line bg-surface-2 text-text-2 hover:text-text',
                                        )}
                                      >
                                        {locked && <LockSimple size={11} aria-hidden />}
                                        {res.state === 'soft' && !locked && (
                                          <span
                                            aria-hidden
                                            className="size-1.5 rounded-full bg-warn"
                                          />
                                        )}
                                        <span>{res.label}</span>
                                        <span className="text-[11px] font-normal text-text-3">
                                          {res.width}×{res.height}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>

                              {/* Frame rate */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[12px] font-semibold text-text-2">
                                  Frame rate
                                </span>
                                <div
                                  role="group"
                                  aria-label="Frame rate"
                                  className="flex flex-wrap gap-1.5"
                                >
                                  {model.fpsOptions.map((f) => {
                                    const locked = f.locked && !ignoreLimits
                                    const selected = draft.fps === f.fps
                                    return (
                                      <button
                                        key={f.fps}
                                        type="button"
                                        disabled={locked}
                                        aria-pressed={selected}
                                        title={f.reason ?? undefined}
                                        onClick={() =>
                                          commitDraft({
                                            ...draft,
                                            matchMain: false,
                                            fps: f.fps,
                                          })
                                        }
                                        className={cx(
                                          'fc-press inline-flex items-center gap-1 rounded-[8px] border px-2.5 py-1 text-[12.5px] font-semibold tabular-nums',
                                          'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                                          locked && 'fc-om-chip-locked',
                                          !locked && selected
                                            ? 'border-accent-line bg-accent-soft text-text'
                                            : !locked &&
                                                'border-line bg-surface-2 text-text-2 hover:text-text',
                                        )}
                                      >
                                        {locked && <LockSimple size={11} aria-hidden />}
                                        <span>{f.fps}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>

                              {/* Bitrate input + ceiling slider */}
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label
                                    htmlFor={`${headingId}-kbps`}
                                    className="text-[12px] font-semibold text-text-2"
                                  >
                                    Bitrate (Mbps)
                                  </label>
                                  <span className="text-[12px] text-text-3 tabular-nums">
                                    {model.hasHardBitrateCeiling && !ignoreLimits
                                      ? `up to ${formatModalRate(model.bitrateHardMaxKbps)}`
                                      : 'No service ceiling'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    id={`${headingId}-kbps`}
                                    type="number"
                                    aria-label="Bitrate in Mbps"
                                    min={Number((model.bitrateMinKbps / 1000).toFixed(1))}
                                    max={51}
                                    step={0.5}
                                    value={Number((draft.kbps / 1000).toFixed(1))}
                                    onChange={(e) => {
                                      if (e.target.value.trim() === '') return
                                      const m = Number(e.target.value)
                                      if (!Number.isFinite(m)) return
                                      commitDraft({
                                        ...draft,
                                        matchMain: false,
                                        kbps: Math.round(m * 1000),
                                      })
                                    }}
                                    className={cx(
                                      'h-8 w-24 rounded-[8px] border bg-surface-2 px-2.5 font-mono text-[13px] font-semibold text-text tabular-nums focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                                      evalResult.hardLimit?.kind === 'bitrate'
                                        ? 'border-danger'
                                        : 'border-line-strong',
                                    )}
                                  />
                                  <div className="relative flex h-7 min-w-0 flex-1 items-center">
                                    {(() => {
                                      const span = Math.max(
                                        1,
                                        model.bitrateRangeMaxKbps - model.bitrateMinKbps,
                                      )
                                      const clampedVal = Math.max(
                                        model.bitrateMinKbps,
                                        Math.min(draft.kbps, model.bitrateRangeMaxKbps),
                                      )
                                      const fillPct =
                                        ((clampedVal - model.bitrateMinKbps) / span) * 100
                                      const ceilingPct =
                                        model.hasHardBitrateCeiling && !ignoreLimits
                                          ? Math.max(
                                              0,
                                              Math.min(
                                                100,
                                                ((model.bitrateHardMaxKbps - model.bitrateMinKbps) /
                                                  span) *
                                                  100,
                                              ),
                                            )
                                          : 100
                                      return (
                                        <div
                                          aria-hidden="true"
                                          className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full border border-line bg-surface-3"
                                        >
                                          {ceilingPct < 100 && (
                                            <div
                                              className="absolute inset-y-0 right-0 opacity-75"
                                              style={{
                                                left: `${ceilingPct}%`,
                                                background:
                                                  'repeating-linear-gradient(-45deg, var(--fc-danger-soft), var(--fc-danger-soft) 4px, transparent 4px, transparent 8px)',
                                              }}
                                            />
                                          )}
                                          <div
                                            className={cx(
                                              'absolute inset-y-0 left-0 rounded-l-full',
                                              evalResult.hardLimit?.kind === 'bitrate'
                                                ? 'bg-danger'
                                                : 'bg-accent-text',
                                            )}
                                            style={{ width: `${fillPct}%` }}
                                          />
                                        </div>
                                      )
                                    })()}
                                    <input
                                      type="range"
                                      aria-label="Bitrate slider in Mbps"
                                      min={model.bitrateMinKbps}
                                      max={model.bitrateRangeMaxKbps}
                                      step={250}
                                      value={Math.min(draft.kbps, model.bitrateRangeMaxKbps)}
                                      onChange={(e) => {
                                        const raw = Number(e.target.value)
                                        if (
                                          model.hasHardBitrateCeiling &&
                                          !ignoreLimits &&
                                          raw > model.bitrateHardMaxKbps
                                        ) {
                                          setSliderShaking(true)
                                          window.setTimeout(() => setSliderShaking(false), 300)
                                          setClampNotice(
                                            `Clamped at ${formatModalRate(model.bitrateHardMaxKbps)}, ${selectedDest.name}’s maximum.`,
                                          )
                                          commitDraft({
                                            ...draft,
                                            matchMain: false,
                                            kbps: model.bitrateHardMaxKbps,
                                          })
                                          return
                                        }
                                        setClampNotice(null)
                                        commitDraft({ ...draft, matchMain: false, kbps: raw })
                                      }}
                                      className={cx(
                                        'fc-golive-range relative z-10 w-full',
                                        sliderShaking && 'animate-pulse',
                                      )}
                                    />
                                  </div>
                                </div>
                                {clampNotice && (
                                  <p
                                    data-limit-stop=""
                                    className="m-0 text-[11.5px] font-medium text-warn"
                                  >
                                    {clampNotice}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right pane Footer */}
                    <div className="fc-om-rfoot">
                      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-2">
                        {liveForSelected ? (
                          <Lightning
                            size={14}
                            weight="fill"
                            className="shrink-0 text-ok"
                            aria-hidden
                          />
                        ) : (
                          <Clock size={14} className="shrink-0 text-text-3" aria-hidden />
                        )}
                        <span className="truncate">{evalResult.footerCopy}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancel}>
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          data-apply-quality=""
                          busy={isSelectedBusy}
                          disabled={!evalResult.canApply || Boolean(activeLockedReason)}
                          className="[&:not(:disabled)]:!text-white"
                          onClick={() => void handleApply()}
                        >
                          {isSelectedBusy
                            ? liveForSelected
                              ? 'Switching…'
                              : 'Saving…'
                            : apiError?.retryable
                              ? 'Try again'
                              : evalResult.applyLabel}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-text-2">
                    Add a destination on the left to adjust its quality.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
