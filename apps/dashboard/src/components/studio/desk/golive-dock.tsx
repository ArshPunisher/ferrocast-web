// The "Go live to" panel: List 3b rows (fixed two lines, state tag, matching icon pip,
// status popover, compact footer summary/strip) + unified One Modal B quality editor.

import { useEffect, useRef, useState } from 'react'
import {
  healthText,
  onCanvas,
  reconnectingText,
  type DestinationQuality,
  type DestinationView,
  type GoLiveView,
  type StudioSettings,
} from '@ferrocast/api'
import {
  CaretDown,
  CaretRight,
  CircleNotch,
  DeviceMobile,
  Gauge,
  GearSix,
  Plus,
  Warning,
} from '@phosphor-icons/react'
import {
  Button,
  IconButton,
  InfoLine,
  InfoTip,
  PopoverSurface,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { useAction, type Resource } from '../../../lib/hooks'
import { useUsesObs } from '../../../lib/picture'
import { useLive } from '../../../lib/store'
import { LoadError } from '../../Panel'
import { Logo, useGoLive } from '../golive'
import { PlatformsQualityModal, useQualityOptions } from '../platforms-quality-modal'
import {
  buildGoLiveDockVM,
  type DestinationRowVM,
  type FooterAction,
  type ListPipTone,
  type ListTagKind,
  type RowAction,
} from '../golive-list-model'
import { useSaveOrder } from '../save-order'
import { AutoConfigDialog } from './auto-config'
import { useDesk, useDeskStats } from './common'
import { DockHeader } from './layout'
import { useReadyCheckState } from './ready-check-state'

function tagBadgeClass(kind: ListTagKind): string {
  switch (kind) {
    case 'live':
      return 'bg-[var(--fc-ok-soft)] text-[var(--fc-ok)]'
    case 'reconnecting':
      return 'bg-[var(--fc-warn-soft)] text-[var(--fc-warn)]'
    case 'error':
      return 'bg-[var(--fc-danger-soft)] text-[var(--fc-danger)]'
    case 'switching':
      return 'bg-[var(--fc-accent-soft)] text-[var(--fc-accent-text)]'
    case 'off':
    default:
      return 'bg-surface-3 text-text-3'
  }
}

function pipToneClass(tone: ListPipTone, pulse: boolean): string {
  const base =
    tone === 'live'
      ? 'bg-[var(--fc-ok)] text-[var(--fc-ok)]'
      : tone === 'warn'
        ? 'bg-[var(--fc-warn)] text-[var(--fc-warn)]'
        : tone === 'error'
          ? 'bg-[var(--fc-danger)] text-[var(--fc-danger)]'
          : tone === 'work'
            ? 'bg-[var(--fc-accent-text)] text-[var(--fc-accent-text)]'
            : 'bg-text-3 text-text-3 opacity-55'
  return cx(
    'pointer-events-none absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-[var(--fc-surface-1)]',
    base,
    pulse && 'fc-golive-pip-pulse',
  )
}

export function GoLiveDock({ res, view }: { res: Resource<GoLiveView>; view: GoLiveView | null }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const readyState = useReadyCheckState()
  const hasFloatingReady = Boolean(readyState?.active && !readyState.dismissed)
  const [optimizing, setOptimizing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const lastFailedOrderRef = useRef<{ id: string; enabled: boolean }[] | null>(null)

  const [switchingTargets, setSwitchingTargets] = useState<Record<string, string>>({})
  const [platformModal, setPlatformModal] = useState<{
    mode: 'gear' | 'row' | 'add_vertical'
    destId: string | null
    triggerEl: HTMLElement | null
  } | null>(null)
  const [statusPop, setStatusPop] = useState<{
    destId: string
    anchorEl: HTMLElement
  } | null>(null)
  const [reachFeedback, setReachFeedback] = useState<
    Record<string, { ok: boolean; message: string } | undefined>
  >({})
  const [needsLookOpen, setNeedsLookOpen] = useState(false)
  // Opening the platforms dialog closes any other popover first, so only one dialog is ever open.
  const openPlatformModal = (next: NonNullable<typeof platformModal>) => {
    setStatusPop(null)
    setNeedsLookOpen(false)
    setPlatformModal(next)
  }
  // When an optimistic "Switching to ..." label was set and whether a frame showed the switch yet.
  const switchSeenRef = useRef<Record<string, { setAt: number; seen: boolean }>>({})
  const needsLookAnchorRef = useRef<HTMLButtonElement>(null)
  const statusPopRef = useRef<HTMLDivElement>(null)
  const needsLookPopRef = useRef<HTMLDivElement>(null)
  const statusAnchorRef = useRef<HTMLElement | null>(null)
  statusAnchorRef.current = statusPop?.anchorEl ?? null

  const desk = useDesk()
  const live = !!view?.live
  const onAir = useDeskStats((s) => !!s?.stream && !s.stream.failed)
  const wasOnAir = useRef(onAir)
  const { reload } = res

  useEffect(() => {
    if (!onAir) {
      if (wasOnAir.current) reload()
      wasOnAir.current = false
      return
    }
    wasOnAir.current = true
    reload()
    const poll = () => {
      if (!document.hidden) reload()
    }
    const t = setInterval(poll, 5000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [onAir, reload])

  // Clear an optimistic switching label once the engine has shown the switch and then finished it.
  // A frame that arrives before the engine marks the switch must not wipe it.
  useEffect(() => {
    if (!view) return
    setSwitchingTargets((prev) => {
      const keys = Object.keys(prev)
      if (keys.length === 0) return prev
      const next: Record<string, string> = {}
      let changed = false
      for (const k of keys) {
        const match = view.destinations.find((d) => d.id === k)
        const track = switchSeenRef.current[k] ?? { setAt: Date.now(), seen: false }
        switchSeenRef.current[k] = track
        if (match?.switching_quality) {
          track.seen = true
          next[k] = prev[k]!
        } else if (!track.seen && Date.now() - track.setAt < 15_000) {
          next[k] = prev[k]!
        } else {
          delete switchSeenRef.current[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [view])

  const applyOptimized = (patch: Partial<StudioSettings>) =>
    void run('optimize', async () => {
      const cur = await desk.api.studioSettings()
      const r = await desk.api.setStudioSettings({ ...cur, ...patch })
      desk.prefs.set(r.settings)
      return r
    }).then((r) => {
      if (!r) return
      toast(
        r.restart
          ? { tone: 'warn', message: 'Optimized.', hint: r.restart, detail: r.restart_detail }
          : {
              tone: 'ok',
              message: live
                ? 'Optimized. Your stream uses it now.'
                : 'Optimized. The next stream uses these settings.',
            },
      )
    })

  const mine = view ? onCanvas(view.destinations, 'main') : []
  const tall = view ? onCanvas(view.destinations, 'vertical') : []
  const cutting = view?.cut.source === 'cut'
  const reloadView = res.reload

  useEffect(() => {
    if (!cutting) return
    void api
      .setVerticalSource('canvas')
      .then(reloadView)
      .catch(() => undefined)
  }, [cutting, api, reloadView])

  const hasPicture = !!desk.scenes.data?.vertical
  const saver = useSaveOrder(api, () => {
    setSaveError(null)
    lastFailedOrderRef.current = null
    res.reload()
  })

  const submitOrder = (all: { id: string; enabled: boolean }[], tagKey: string) => {
    void run(tagKey, async () => {
      try {
        const result = await saver.request(all)
        if (result !== null) {
          setSaveError(null)
          lastFailedOrderRef.current = null
        }
        return result
      } catch (e) {
        lastFailedOrderRef.current = all
        setSaveError(e instanceof Error ? e.message : 'Save failed.')
        throw e
      }
    }).then(() => {
      res.reload()
    })
  }

  const toggle = (d: DestinationView, enabled: boolean) => {
    if (!view) return
    const all = view.destinations.map((x) => ({
      id: x.id,
      enabled: x.id === d.id ? enabled : x.enabled,
    }))
    res.set((v) => ({
      ...(v ?? view),
      destinations: (v ?? view).destinations.map((x) => (x.id === d.id ? { ...x, enabled } : x)),
    }))
    submitOrder(all, `on:${d.id}`)
  }

  const usesObs = useUsesObs()
  const isRemote = useLive((s) => s.remote !== null)
  const qualityOpts = useQualityOptions(view, Boolean(view), usesObs, res.reload)
  const reloadOptsRef = useRef(qualityOpts.reload)
  reloadOptsRef.current = qualityOpts.reload

  const prefsSig = desk.prefs.data
    ? `${desk.prefs.data.video_kbps}:${desk.prefs.data.width}x${desk.prefs.data.height}@${desk.prefs.data.fps}:${desk.prefs.data.scale?.join('x') ?? ''}:${desk.prefs.data.encoder}:${desk.prefs.data.vbr}:${desk.prefs.data.keyframe_s}:${desk.prefs.data.profile}:${desk.prefs.data.b_frames}`
    : null
  const seenPrefsSig = useRef<string | null>(null)
  useEffect(() => {
    if (!prefsSig) return
    if (seenPrefsSig.current === prefsSig) return
    seenPrefsSig.current = prefsSig
    reloadView()
    reloadOptsRef.current()
  }, [prefsSig, reloadView])

  const handleQualityUpdated = (nextView: GoLiveView) => {
    res.set(nextView)
    useLive.getState().setGoLiveView(nextView)
    res.reload()
    reloadOptsRef.current()
  }

  const applyDestinationQuality = (destId: string, quality: DestinationQuality) =>
    void run(`quality:${destId}`, async () => {
      const nextView = await api.setQuality(destId, quality)
      handleQualityUpdated(nextView)
      return true
    })

  const runRowAction = (d: DestinationView, action: RowAction, sourceEl?: HTMLElement | null) => {
    switch (action.kind) {
      case 'connect':
        setStatusPop(null)
        setNeedsLookOpen(false)
        if (typeof window !== 'undefined') {
          window.location.hash = '#/settings/accounts'
        }
        return
      case 'manage':
        setStatusPop(null)
        setNeedsLookOpen(false)
        openPlatformModal({
          mode: 'gear',
          destId: d.id,
          triggerEl: sourceEl ?? statusAnchorRef.current ?? needsLookAnchorRef.current,
        })
        return
      case 'open_quality':
        setStatusPop(null)
        setNeedsLookOpen(false)
        openPlatformModal({
          mode: 'row',
          destId: d.id,
          triggerEl: sourceEl ?? statusAnchorRef.current ?? needsLookAnchorRef.current,
        })
        return
      case 'set_quality':
        setStatusPop(null)
        setNeedsLookOpen(false)
        applyDestinationQuality(d.id, action.quality)
        return
      case 'retry':
        setStatusPop(null)
        setNeedsLookOpen(false)
        void run(`retry:${d.id}`, () => api.resume(d.id).then(() => true), {
          success: `Retrying ${d.name}.`,
        }).then((r) => {
          if (r) res.reload()
        })
        return
      case 'test_connection':
        void run(`reach:${d.id}`, async () => {
          const r = await api.testDestination(d.id)
          setReachFeedback((prev) => ({ ...prev, [d.id]: r }))
          return r
        })
        return
    }
  }

  const runFooterAction = (action: FooterAction) => {
    switch (action.kind) {
      case 'retry_save':
        if (lastFailedOrderRef.current) {
          submitOrder(lastFailedOrderRef.current, 'retry-save')
        } else {
          setSaveError(null)
          res.reload()
        }
        return
      case 'match_to_share':
        applyDestinationQuality(action.destId, action.quality)
        return
      case 'retry_all':
        void run('retry-all', async () => {
          // Each destination gets its own try; one refusing does not stop the others.
          const failed: string[] = []
          for (const id of action.destIds) {
            try {
              await api.resume(id)
            } catch {
              failed.push(view?.destinations.find((x) => x.id === id)?.name ?? id)
            }
          }
          res.reload()
          if (failed.length > 0) {
            toast({
              tone: 'warn',
              message: `Couldn’t restart ${failed.join(' and ')}.`,
              hint: 'The others were tried. Check the connection and try again.',
            })
            return false
          }
          return true
        })
        return
      case 'manage':
        openPlatformModal({ mode: 'gear', destId: null, triggerEl: null })
        return
    }
  }

  const vm = view
    ? buildGoLiveDockVM(view, {
        usesObs,
        qualityOptionsById: qualityOpts.data?.destinations ?? {},
        optionsResponse: qualityOpts.data,
        switchingTargets,
        saveError,
      })
    : null

  const row = (r: DestinationRowVM) => {
    const d = r.dest
    const isStatusOpen = statusPop?.destId === d.id
    return (
      <li
        key={d.id}
        data-golive-row={d.id}
        className={cx(
          'grid min-h-[62px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line px-3 py-2 transition-colors @[230px]:grid-cols-[auto_minmax(0,1fr)_36px_auto]',
          r.rowTint === 'warn' && 'bg-[color-mix(in_oklab,var(--fc-warn-soft)_42%,transparent)]',
          r.rowTint === 'error' && 'bg-[color-mix(in_oklab,var(--fc-danger-soft)_38%,transparent)]',
        )}
      >
        <div className="relative shrink-0">
          <Logo kind={d.kind} />
          <span
            aria-hidden
            data-golive-pip={d.id}
            className={pipToneClass(r.pipTone, r.pipPulse)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <b
              className="max-w-full min-w-0 truncate text-[14px] leading-tight font-bold text-text"
              title={d.name}
            >
              {d.name}
            </b>
            <span
              data-golive-tag={d.id}
              className={cx(
                'inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10px] font-bold tracking-[0.06em] uppercase',
                tagBadgeClass(r.tagKind),
              )}
            >
              {r.tagLabel}
            </span>
          </div>

          {r.line2.kind === 'quality' ? (
            <button
              type="button"
              data-quality-trigger={d.id}
              disabled={r.line2.disabled}
              aria-haspopup="dialog"
              aria-expanded={platformModal?.destId === d.id}
              aria-label={`Change quality for ${d.name}: ${r.line2.text}`}
              onClick={(e) => {
                if (r.line2.kind !== 'quality' || r.line2.disabled) return
                setStatusPop(null)
                setNeedsLookOpen(false)
                openPlatformModal({ mode: 'row', destId: d.id, triggerEl: e.currentTarget })
              }}
              className="inline-flex h-[20px] max-w-full min-w-0 items-center gap-1 text-left text-[12px] font-medium text-text-2 hover:text-text disabled:cursor-default disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fc-accent)]"
            >
              <span className="truncate" title={r.line2.text}>
                {r.line2.text}
              </span>
              {!r.line2.disabled && (
                <CaretDown size={11} weight="bold" className="shrink-0 opacity-75" aria-hidden />
              )}
            </button>
          ) : (
            <button
              type="button"
              data-status-trigger={d.id}
              aria-haspopup="dialog"
              aria-expanded={isStatusOpen}
              aria-label={`${d.name} status: ${r.line2.text}`}
              onClick={(e) => {
                setNeedsLookOpen(false)
                setStatusPop((prev) =>
                  prev?.destId === d.id ? null : { destId: d.id, anchorEl: e.currentTarget },
                )
              }}
              className={cx(
                'inline-flex h-[20px] max-w-full min-w-0 items-center gap-1 text-left text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fc-accent)]',
                r.line2.tone === 'error' && 'text-[var(--fc-danger)]',
                r.line2.tone === 'warn' && 'text-[var(--fc-warn)]',
                r.line2.tone === 'work' && 'text-[var(--fc-accent-text)]',
                r.line2.tone === 'muted' && 'text-text-3 hover:text-text',
              )}
            >
              {r.line2.icon === 'spin' && (
                <CircleNotch
                  size={12}
                  weight="bold"
                  className="shrink-0 animate-spin"
                  aria-hidden
                />
              )}
              {r.line2.icon === 'warn' && (
                <Warning size={12} weight="bold" className="shrink-0" aria-hidden />
              )}
              <span className="truncate" title={r.line2.text}>
                {r.line2.text}
              </span>
              <CaretRight size={11} weight="bold" className="shrink-0 opacity-75" aria-hidden />
            </button>
          )}
        </div>

        <div
          role="img"
          aria-label={r.barLabel}
          title={r.barLabel}
          className={cx(
            'hidden h-[5px] w-full overflow-hidden rounded-full bg-surface-3 @[230px]:block',
            r.barDimmed && 'opacity-45',
          )}
        >
          <div
            className={cx(
              'h-full rounded-full transition-[width] duration-200',
              r.barMode === 'progress' || r.tagKind === 'live'
                ? 'bg-[var(--fc-pick)]'
                : r.tagKind === 'error'
                  ? 'bg-[var(--fc-danger)]'
                  : r.tagKind === 'reconnecting'
                    ? 'bg-[var(--fc-warn)]'
                    : r.tagKind === 'switching'
                      ? 'bg-[var(--fc-accent)]'
                      : 'bg-text-3',
            )}
            style={{ width: `${r.barPct}%` }}
          />
        </div>

        <Switch
          hideLabel
          checked={d.enabled}
          disabled={busy === `on:${d.id}` || r.switchDisabled}
          label={`Go live on ${d.name}`}
          onChange={(on) => toggle(d, on)}
        />
      </li>
    )
  }

  const activeStatusRow =
    statusPop && vm
      ? ([...vm.mainRows, ...vm.verticalRows].find((r) => r.dest.id === statusPop.destId) ?? null)
      : null
  const footerStrip = vm?.footer.mode === 'strip' ? vm.footer : null
  const footerSummary = vm?.footer.mode === 'summary' ? vm.footer : null

  return (
    <section
      aria-label="Go live to"
      className={cx('@container flex min-h-0 flex-1 flex-col', hasFloatingReady && 'pb-12')}
    >
      {desk.prefs.data && (
        <AutoConfigDialog
          open={optimizing}
          onClose={() => setOptimizing(false)}
          s={desk.prefs.data}
          onApply={applyOptimized}
          onSynced={(next) => desk.prefs.set(next)}
        />
      )}
      <DockHeader
        id="golive"
        actions={
          <>
            <Button
              size="xs"
              variant="ghost"
              title="Test your upload and pick the bitrate for each platform, so the game and the stream both run smooth"
              onClick={() => setOptimizing(true)}
            >
              <Gauge size={15} weight="bold" aria-hidden /> Optimize
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label="Manage platforms"
              onClick={(e) =>
                openPlatformModal({ mode: 'gear', destId: null, triggerEl: e.currentTarget })
              }
            >
              <GearSix size={15} />
            </IconButton>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {res.error && !view ? (
          <div className="p-3">
            <LoadError error={res.error} onRetry={res.reload} />
          </div>
        ) : !view || !vm ? (
          <Skeleton className="m-3 h-28" />
        ) : (
          <>
            {mine.length === 0 ? (
              <div className="flex flex-col items-start gap-3 p-3">
                <p className="m-0 text-[14.5px] text-text-2">No platforms yet.</p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={(e) =>
                    openPlatformModal({ mode: 'gear', destId: null, triggerEl: e.currentTarget })
                  }
                >
                  Add a platform
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col" aria-label="Platforms">
                {vm.mainRows.map(row)}
              </ul>
            )}

            <section aria-label="Vertical platforms">
              <h3 className="m-0 flex items-center gap-1.5 border-b border-line px-3 pt-2.5 pb-1.5 text-[12px] font-bold text-text-2">
                <DeviceMobile size={14} weight="bold" aria-hidden />
                Vertical
                <span className="ml-auto font-semibold text-text-2">
                  {hasPicture ? 'On vertical picture' : 'Under picture'}
                </span>
              </h3>
              {tall.length > 0 && <ul className="flex flex-col">{vm.verticalRows.map(row)}</ul>}
              <button
                type="button"
                onClick={(e) =>
                  openPlatformModal({
                    mode: 'add_vertical',
                    destId: null,
                    triggerEl: e.currentTarget,
                  })
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-text-2 hover:text-text"
              >
                <Plus size={14} weight="bold" aria-hidden />
                Add a vertical destination
              </button>
            </section>
          </>
        )}
      </div>

      {/* List 3b Footer: Compact Problem Strip or Calm Summary + Problem Count */}
      {footerStrip && (
        <div
          data-golive-footer-strip=""
          role="alert"
          className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[color-mix(in_oklab,var(--fc-danger)_38%,transparent)] bg-[var(--fc-danger-soft)] px-3 py-2.5 text-[12.5px]"
        >
          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-[var(--fc-danger)]">
            <Warning size={14} weight="bold" className="shrink-0" aria-hidden />
            <span className="truncate" title={footerStrip.text}>
              {footerStrip.text}
            </span>
          </span>
          <Button
            size="xs"
            variant="outline"
            busy={busy === 'retry-all' || busy === 'retry-save'}
            className="shrink-0 border-[color-mix(in_oklab,var(--fc-danger)_45%,transparent)] text-[var(--fc-danger)]"
            onClick={() => runFooterAction(footerStrip.action)}
          >
            {footerStrip.action.label}
          </Button>
        </div>
      )}
      {footerSummary && (
        <div
          data-golive-encode-summary=""
          className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11.5px] font-medium text-text-3"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate" title={footerSummary.summaryText}>
              {footerSummary.summaryText}
            </span>
            {footerSummary.problemLinkText && (
              <button
                ref={needsLookAnchorRef}
                type="button"
                data-golive-problems-trigger=""
                aria-haspopup="dialog"
                aria-expanded={needsLookOpen}
                onClick={() => {
                  setStatusPop(null)
                  setNeedsLookOpen((v) => !v)
                }}
                className={cx(
                  'shrink-0 font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fc-accent)]',
                  footerSummary.problemLinkTone === 'error'
                    ? 'text-[var(--fc-danger)]'
                    : 'text-[var(--fc-warn)]',
                )}
              >
                {footerSummary.problemLinkText}
              </button>
            )}
          </div>
          {footerSummary.breakdown && (
            <InfoTip label="Stream encode breakdown">{footerSummary.breakdown}</InfoTip>
          )}
        </div>
      )}

      {/* Single-Row Status Popover */}
      <PopoverSurface
        open={Boolean(activeStatusRow?.popover)}
        closeOnScroll={false}
        onClose={(reason) => {
          const anchor = statusAnchorRef.current
          setStatusPop(null)
          if (reason === 'escape' || reason === 'tab') {
            anchor?.focus()
          }
        }}
        anchorRef={statusAnchorRef}
        surfaceRef={statusPopRef}
        placement="bottom"
        align="start"
        gap={6}
        edgePadding={8}
        role="dialog"
        aria-label={activeStatusRow ? `${activeStatusRow.dest.name} status` : 'Status'}
        className="w-[min(300px,calc(100vw-24px))] rounded-[12px] border border-line-strong bg-surface-1 p-3 shadow-pop"
      >
        {activeStatusRow?.popover && (
          <div data-golive-status-popover={activeStatusRow.dest.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              {activeStatusRow.line2.kind === 'status' && activeStatusRow.line2.icon === 'spin' && (
                <CircleNotch
                  size={14}
                  weight="bold"
                  className={cx(
                    'shrink-0 animate-spin',
                    activeStatusRow.popover.tone === 'warn'
                      ? 'text-[var(--fc-warn)]'
                      : 'text-[var(--fc-accent-text)]',
                  )}
                  aria-hidden
                />
              )}
              {activeStatusRow.line2.kind === 'status' && activeStatusRow.line2.icon === 'warn' && (
                <Warning
                  size={14}
                  weight="bold"
                  className={cx(
                    'shrink-0',
                    activeStatusRow.popover.tone === 'error'
                      ? 'text-[var(--fc-danger)]'
                      : 'text-[var(--fc-warn)]',
                  )}
                  aria-hidden
                />
              )}
              <p className="m-0 text-[13.5px] font-bold text-text">
                {activeStatusRow.popover.title}
              </p>
            </div>
            <p className="m-0 text-[12.5px] leading-snug text-text-2">
              {activeStatusRow.popover.body}
            </p>
            {reachFeedback[activeStatusRow.dest.id] && (
              <p
                role="status"
                className={cx(
                  'm-0 text-[12px] font-semibold',
                  reachFeedback[activeStatusRow.dest.id]!.ok
                    ? 'text-[var(--fc-ok)]'
                    : 'text-[var(--fc-danger)]',
                )}
              >
                {reachFeedback[activeStatusRow.dest.id]!.message}
              </p>
            )}
            {activeStatusRow.popover.primaryAction && (
              <div className="pt-0.5">
                <Button
                  size="xs"
                  variant={activeStatusRow.popover.tone === 'warn' ? 'primary' : 'outline'}
                  busy={busy === `reach:${activeStatusRow.dest.id}`}
                  onClick={() =>
                    runRowAction(
                      activeStatusRow.dest,
                      activeStatusRow.popover!.primaryAction!,
                      statusAnchorRef.current,
                    )
                  }
                >
                  {activeStatusRow.popover.primaryAction.label}
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverSurface>

      {/* Footer "Needs a look" Summary Popover */}
      <PopoverSurface
        open={Boolean(needsLookOpen && footerSummary && footerSummary.problems.length > 0)}
        closeOnScroll={false}
        onClose={(reason) => {
          setNeedsLookOpen(false)
          if (reason === 'escape' || reason === 'tab') {
            needsLookAnchorRef.current?.focus()
          }
        }}
        anchorRef={needsLookAnchorRef}
        surfaceRef={needsLookPopRef}
        placement="top"
        align="start"
        gap={6}
        edgePadding={8}
        role="dialog"
        aria-label="Needs a look"
        className="w-[min(340px,calc(100vw-24px))] rounded-[12px] border border-line-strong bg-surface-1 p-3 shadow-pop"
      >
        {footerSummary && (
          <div data-golive-needs-look="" className="flex flex-col gap-2.5">
            <h3 className="m-0 text-[13px] font-bold text-text">Needs a look</h3>
            <ul className="flex flex-col gap-2">
              {footerSummary.problems.map((p) => {
                const targetDest = view?.destinations.find((d) => d.id === p.destId)
                return (
                  <li
                    key={p.destId}
                    className="flex items-center justify-between gap-2.5 text-[12.5px]"
                  >
                    <div className="min-w-0">
                      <p className="m-0 truncate font-bold text-text" title={p.destName}>
                        {p.destName}
                      </p>
                      <p
                        className={cx(
                          'm-0 truncate font-medium',
                          p.tone === 'error' ? 'text-[var(--fc-danger)]' : 'text-[var(--fc-warn)]',
                        )}
                        title={p.reason}
                      >
                        {p.reason}
                      </p>
                    </div>
                    {targetDest && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => runRowAction(targetDest, p.action)}
                      >
                        {p.action.label}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </PopoverSurface>

      {/* Single unified One Modal B dialog for Manage platforms, row quality, and Add */}
      {view && (
        <PlatformsQualityModal
          open={platformModal !== null}
          onClose={() => setPlatformModal(null)}
          view={view}
          onSaved={res.reload}
          onUpdated={handleQualityUpdated}
          onOptimisticSwitch={(destId, label) => {
            if (label === null) delete switchSeenRef.current[destId]
            else switchSeenRef.current[destId] = { setAt: Date.now(), seen: false }
            setSwitchingTargets((prev) => {
              if (label === null) {
                const copy = { ...prev }
                delete copy[destId]
                return copy
              }
              return { ...prev, [destId]: label }
            })
          }}
          initialDestId={platformModal?.destId ?? null}
          initialMode={platformModal?.mode === 'add_vertical' ? 'add' : 'editor'}
          addCanvas={platformModal?.mode === 'add_vertical' ? 'vertical' : 'main'}
          canvasFilter="all"
          triggerEl={platformModal?.triggerEl ?? null}
          usesObs={usesObs}
          isRemote={isRemote}
          videoKbps={desk.prefs.data?.video_kbps}
          audioKbps={desk.prefs.data?.audio_kbps}
          optionsResponse={qualityOpts.data}
          loading={qualityOpts.loading}
          error={qualityOpts.error}
          onReloadOptions={qualityOpts.reload}
        />
      )}
      {saver.dialog}
    </section>
  )
}

/**
 * While a destination is on air (or failed for this stream): how it is doing, on its own row
 * ("Live · 13.5 Mbps", "Reconnecting", or one calm failed line with the reason behind (i) and Retry).
 */
export function LiveLine({
  d,
  canRetry = false,
  retrying = false,
  onRetry,
}: {
  d: DestinationView
  canRetry?: boolean
  retrying?: boolean
  onRetry?: () => void
}) {
  const h = d.health
  if (!d.enabled || !h || h.state === 'waiting' || h.state === 'stopped') return null
  const t = healthText(h, d.blocked, d.kind)
  if (h.state === 'failed') {
    return (
      <div className="mt-0.5 flex flex-col items-start gap-1.5">
        <InfoLine detail={t.detail ?? undefined} label={`More about ${d.name}`} className="w-full">
          <span className="block text-[12px] font-semibold text-danger" aria-live="polite">
            {t.label}
          </span>
        </InfoLine>
        {canRetry && onRetry && (
          <Button
            size="xs"
            variant="outline"
            busy={retrying}
            onClick={onRetry}
            aria-label={`Retry ${d.name}`}
          >
            Retry
          </Button>
        )}
      </div>
    )
  }
  if (!d.blocked && h.state === 'reconnecting') {
    const rec = reconnectingText(h)
    return (
      <InfoLine
        detail={rec.detail ?? undefined}
        label={`More about ${d.name}`}
        className="mt-0.5 w-full"
      >
        <div className="flex flex-col text-[12px] leading-snug text-warn" aria-live="polite">
          <span className="font-semibold">{rec.heading}</span>
          {rec.reason && <span className="break-words">{rec.reason}</span>}
        </div>
      </InfoLine>
    )
  }
  if (d.blocked || h.state === 'paused') {
    return (
      <InfoLine
        detail={t.detail ?? undefined}
        label={`More about ${d.name}`}
        className="mt-0.5 w-full"
      >
        <span
          className={cx(
            'block text-[12px] leading-snug font-semibold',
            t.tone === 'bad' ? 'text-danger' : 'text-text-3',
          )}
          aria-live="polite"
        >
          {t.label}
        </span>
      </InfoLine>
    )
  }
  return (
    <span
      className={cx(
        'block truncate text-[12px] font-semibold',
        t.tone === 'ok' && 'text-ok',
        t.tone === 'warn' && 'text-warn',
        t.tone === 'bad' && 'text-danger',
        (t.tone === 'off' || t.tone === 'paused') && 'text-text-3',
      )}
      aria-live="polite"
    >
      {t.label}
      {t.detail ? ` · ${t.detail}` : ''}
    </span>
  )
}
