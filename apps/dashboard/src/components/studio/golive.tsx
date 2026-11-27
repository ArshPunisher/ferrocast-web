// Go live everywhere (2.0): Studio's first tab. Owner's picks from the 22 Oct board: the
// platforms as one list in pause order (2A), setup in three steps that shrink to one line (3A),
// the upload check as a table (4B), a health line per platform while live (5A), and a dialog
// for a server of your own (7). API.md §4 "Go live everywhere".

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  Broadcast,
  CaretDown,
  CaretRight,
  CheckCircle,
  Copy,
  DotsSixVertical,
  Gauge,
  Info,
  LockSimple,
  Pause,
  Plus,
  Plug,
  Pulse,
  Stop,
  Trash,
  Warning,
  WarningCircle,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import {
  aitumClashes,
  allDestinationsFailed,
  andList,
  goliveApi,
  PASTE_BRANDS,
  goingTo,
  healthText,
  mbps,
  onCanvas,
  reconnectingText,
  type Canvas,
  type DestinationView,
  type GoLiveView,
  type RuleCode,
  type Service,
  type UploadCheck,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  InfoLine,
  InfoTip,
  Skeleton,
  Switch,
  cx,
  toast,
  Segmented,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { externalLink } from '../../lib/external'
import { useAction, useClient, useNow, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { href } from '../../lib/router'
import { useMode } from '../../lib/mode'
import { setPictureSource, usePictureSource } from '../../lib/picture'
import { describeDestinationRate, type DestinationRateDisplay } from './bitrate-summary'
import { AdvancedCard, ProtectionRule } from './golive-advanced'
import {
  AddDestinationFormBody,
  DIRECT_NAMES,
  Logo,
  ReachLine,
  liveStatus,
  platformTileTone,
  useAddDestinationState,
  usePlatformsListController,
  useQualityOptions,
} from './platform-shared'
import { PlatformsQualityModal } from './platforms-quality-modal'
import { buildQualitySummaryText } from './quality-modal-model'
import { useSaveOrder } from './save-order'
import { useStudio } from './common'
import { useObsHealth } from './obs'
import { InBar, StudioDesk } from './desk/desk'

export { Logo, liveStatus }

export function useGoLive() {
  const client = useClient()
  return useMemo(() => goliveApi(client), [client])
}

const NAMES: Record<Exclude<Service, 'custom'>, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
}

/** The view with newer readings on top: the live frame's destinations and numbers, and
 *  whether OBS is streaming from the OBS health reading (OBS starts and stops on its own). */
export function useMerged(view: GoLiveView | null): GoLiveView | null {
  const frame = useLive((s) => s.studio.golive)
  const health = useObsHealth()
  return useMemo(() => {
    if (!view) return null
    const obs = health ? { ...view.obs, streaming: health.streaming } : view.obs
    if (!frame) return { ...view, obs }
    return {
      ...view,
      obs,
      live: frame.live,
      stats: frame.stats,
      vertical_live: frame.vertical_live ?? view.vertical_live,
      vertical_stats: frame.vertical_stats ?? view.vertical_stats,
      destinations: frame.destinations,
      ...(frame.encode_groups ? { encode_groups: frame.encode_groups } : {}),
      ...(frame.encode_budget ? { encode_budget: frame.encode_budget } : {}),
      cut: {
        ...view.cut,
        state: frame.cut_state === undefined ? view.cut.state : frame.cut_state,
        ffmpeg: frame.ffmpeg ?? view.cut.ffmpeg,
      },
    }
  }, [view, frame, health])
}

export function GoLiveTab() {
  const api = useGoLive()
  const askedAt = useRef(0)
  const res = useResource(() => {
    askedAt.current = Date.now()
    return api.view()
  }, [api])
  const view = useMerged(res.data)
  // Share the latest HTTP Go live reading with StudioStatusBar so Health and Upload reflect
  // destination failures even when the live WebSocket isn't delivering golive frames (U5).
  useEffect(() => {
    if (res.data) useLive.getState().setGoLiveView(res.data, askedAt.current)
  }, [res.data])
  const [mode, setMode] = useMode('studio')
  const picture = usePictureSource()
  const live = !!view?.live
  const reload = res.reload
  // While live, OBS's side (Aitum Multistream's outputs) is read again every 15 s.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      if (!document.hidden) reload()
    }, 15_000)
    return () => clearInterval(t)
  }, [live, reload])
  if (res.error && !view) return <LoadError error={res.error} onRetry={res.reload} />
  if (!view)
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    )
  const set = (patch: Partial<GoLiveView>) => res.set((v) => ({ ...(v ?? view), ...patch }))
  const clashes = aitumClashes(view.obs.aitum, onCanvas(view.destinations, 'main'))
  const pick = (
    <Segmented
      label="Picture from"
      // The same size as the Studio's tabs beside it in the one-row header.
      size="sm"
      value={picture}
      options={[
        { value: 'ferrocast', label: 'Ferrocast' },
        { value: 'obs', label: 'OBS' },
      ]}
      onChange={setPictureSource}
    />
  )
  if (picture === 'ferrocast') return <StudioDesk res={res} view={view} lead={pick} />
  return (
    <>
      <InBar className="mb-4 flex">{pick}</InBar>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {view.live ? (
            <LiveCard view={view} onSaved={res.reload} />
          ) : (
            <AllFailedBanner view={view} />
          )}
          <Platforms view={view} onSaved={res.reload} onProtect={(protect) => set({ protect })} />
          {/* The extras (each platform's server and retries, the protection rule, the vertical
              numbers) fold away; open, they stay open on this computer. */}
          <button
            type="button"
            aria-expanded={mode === 'advanced'}
            aria-controls="golive-advanced"
            onClick={() => setMode(mode === 'advanced' ? 'simple' : 'advanced')}
            className="flex items-center gap-2 self-start rounded-control px-1 py-1 text-[14.5px] font-bold text-text-2 hover:text-text"
          >
            <CaretRight
              size={14}
              weight="bold"
              className={cx('transition-transform', mode === 'advanced' && 'rotate-90')}
            />
            Advanced settings
          </button>
          {mode === 'advanced' && <AdvancedCard view={view} onSaved={res.reload} />}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {!view.live && !view.aitum_ok && clashes.length > 0 && (
            <AitumNote names={clashes.map((c) => c.name)} onOk={() => set({ aitum_ok: true })} />
          )}
          <Setup view={view} onObs={(obs) => set({ obs })} onUpload={(upload) => set({ upload })} />
          {view.upload && <Upload view={view} onUpload={(upload) => set({ upload })} />}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- 5A: while live

/**
 * Calm one-line banner shown when every enabled destination on `canvas` reached terminal
 * `PushState::Failed` and the Studio stopped streaming (Contract C-1).
 */
export function AllFailedBanner({
  view,
  canvas = 'main',
  compact = false,
}: {
  view: GoLiveView
  canvas?: Canvas
  compact?: boolean
}) {
  const isLive = canvas === 'vertical' ? view.vertical_live : view.live
  if (isLive) return null
  const all = allDestinationsFailed(view.destinations, canvas)
  if (!all) return null
  return (
    <div
      role="alert"
      className={cx(
        'flex items-start gap-2 bg-danger-soft text-danger',
        compact
          ? 'border-b border-danger/25 px-3 py-2 text-[12.5px]'
          : 'rounded-panel border border-danger/30 px-4 py-3 text-[14px]',
      )}
    >
      <WarningCircle
        size={compact ? 15 : 18}
        weight="fill"
        className="mt-0.5 shrink-0"
        aria-hidden
      />
      <InfoLine
        detail={all.detail}
        label="More about why the stream stopped"
        className="min-w-0 flex-1"
      >
        <span className="font-semibold text-danger">{all.summary}</span>
      </InfoLine>
    </div>
  )
}

export function LiveCard({
  view,
  onSaved,
  canvas = 'main',
}: {
  view: GoLiveView
  onSaved: () => void
  canvas?: Canvas
}) {
  const now = useNow(1000)
  const api = useGoLive()
  const { run, busy } = useAction()
  // Ticked ones, and backups (sending, or waiting for a ticked one) though they aren't.
  const shown = onCanvas(view.destinations, canvas).filter(
    (d) => d.enabled || !!d.backup_for || !!d.standby_for,
  )
  // A backup on standby isn't counted: it isn't meant to be live.
  const on = shown.filter((d) => !d.standby_for)
  const live = on.filter((d) => d.health?.state === 'live')
  const paused = on.filter((d) => d.health?.state === 'paused').length
  const failed = on.filter((d) => d.health?.state === 'failed').length
  const out = live.reduce((a, d) => a + (d.health?.kbps ?? 0), 0)
  const since = Math.min(...on.map((d) => d.health?.since_ms ?? Infinity))
  const saver = useSaveOrder(api, onSaved)
  const stopTrying = (id: string) =>
    void run(`stop:${id}`, () =>
      saver.request(
        view.destinations.map((d) => ({ id: d.id, enabled: d.enabled && d.id !== id })),
      ),
    ).then((r) => r && onSaved())
  const resume = (d: DestinationView) =>
    void run(`resume:${d.id}`, () => api.resume(d.id).then(() => true), {
      success: d.health?.state === 'failed' ? `Retrying ${d.name}.` : `${d.name} is coming back.`,
    }).then((r) => r && onSaved())
  return (
    <Panel id={canvas === 'main' ? 'golive-live' : 'vertical-live'}>
      <div className="flex flex-col gap-3">
        <h2 className="sr-only">
          {canvas === 'main' ? 'Live on your platforms' : 'Vertical stream live'}
        </h2>
        {on.length === 0 && <NotSending canvas={canvas} />}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-[#c42339] px-3 font-mono text-[13px] font-extrabold tracking-[0.06em] text-white">
            <span className="size-[7px] rounded-full bg-white" aria-hidden />
            LIVE
          </span>
          {Number.isFinite(since) && (
            <b className="font-display text-[18px] tabular-nums">{elapsed(now - since)}</b>
          )}
          <span className="text-[14px] text-text-3">
            {live.length} of {on.length} live
            {paused > 0 ? ` · ${paused} paused` : ''}
            {failed > 0 ? ` · ${failed} failed` : ''} · {mbps(out)} going out
          </span>
        </div>
        <ul
          className="overflow-hidden rounded-panel border border-line"
          aria-label="Health per platform"
        >
          {shown.map((d) => {
            const isFailed = d.health?.state === 'failed'
            const rec =
              !d.standby_for && !d.backup_for && !d.blocked && d.health?.state === 'reconnecting'
                ? reconnectingText(d.health)
                : null
            const h = d.standby_for
              ? {
                  tone: 'off' as const,
                  label: 'On standby',
                  detail: `Sends only if ${d.standby_for} can’t.`,
                }
              : d.backup_for
                ? withBackup(healthText(d.health, d.blocked, d.kind), d.backup_for)
                : d.lighter_for_route
                  ? lighterForNow(healthText(d.health, d.blocked, d.kind))
                  : healthText(d.health, d.blocked, d.kind)
            return (
              <li
                key={d.id}
                className={cx(
                  'grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-3 last:border-b-0 sm:grid-cols-[30px_minmax(0,1fr)_auto]',
                  h.tone === 'warn' ? 'bg-warn-soft' : isFailed ? 'bg-danger-soft' : 'bg-surface-1',
                )}
              >
                <Logo kind={d.kind} />
                <div className="min-w-0">
                  {isFailed ? (
                    <InfoLine detail={h.detail ?? undefined} label={`More about ${d.name}`}>
                      <span className="flex items-start gap-1.5 text-[14.5px] font-bold text-danger">
                        <WarningCircle
                          size={15}
                          weight="fill"
                          className="mt-[3px] shrink-0"
                          aria-hidden
                        />
                        <span>
                          {d.name}: {h.label}
                        </span>
                      </span>
                    </InfoLine>
                  ) : rec ? (
                    <InfoLine detail={rec.detail ?? undefined} label={`More about ${d.name}`}>
                      <span className="flex items-start gap-1.5 text-[14.5px] font-bold text-warn">
                        <ArrowsClockwise size={14} className="mt-[3px] shrink-0" aria-hidden />
                        <span>
                          {d.name}: {rec.heading}
                        </span>
                      </span>
                      {rec.reason && (
                        <p className="m-0 text-[13.5px] break-words text-text-2">{rec.reason}</p>
                      )}
                    </InfoLine>
                  ) : (
                    <>
                      {/* Which stream key it sent to ("Key: Ferrocast · variable"), behind (i). */}
                      <InfoLine
                        detail={d.key_note ? `Key: ${d.key_note}` : undefined}
                        label={`Which stream key ${d.name} uses`}
                      >
                        <span
                          className={cx(
                            'flex items-start gap-1.5 text-[14.5px] font-bold',
                            h.tone === 'ok' && 'text-ok',
                            h.tone === 'warn' && 'text-warn',
                            h.tone === 'bad' && 'text-danger',
                            (h.tone === 'off' || h.tone === 'paused') && 'text-text-3',
                          )}
                        >
                          {/* On the first line when a long label wraps (a phone). */}
                          {h.tone === 'warn' ? (
                            <ArrowsClockwise size={14} className="mt-[3px] shrink-0" aria-hidden />
                          ) : h.tone === 'paused' ? (
                            <Pause
                              size={14}
                              weight="fill"
                              className="mt-[3px] shrink-0"
                              aria-hidden
                            />
                          ) : (
                            <span
                              className="mt-[7px] size-[7px] shrink-0 rounded-full bg-current"
                              aria-hidden
                            />
                          )}
                          <span>
                            {d.name}: {h.label}
                          </span>
                        </span>
                      </InfoLine>
                      {h.detail && (
                        <p className="m-0 text-[13.5px] text-text-3 tabular-nums">{h.detail}</p>
                      )}
                      {d.health?.state === 'paused' && d.health.until_ms > now && (
                        <p className="m-0 text-[13.5px] text-text-3 tabular-nums">
                          Back in {waitText(d.health.until_ms - now)} at the earliest.
                        </p>
                      )}
                    </>
                  )}
                </div>
                {isFailed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="col-start-2 justify-self-start sm:col-start-auto"
                    busy={busy === `resume:${d.id}`}
                    aria-label={`Retry ${d.name}`}
                    onClick={() => resume(d)}
                  >
                    Retry
                  </Button>
                ) : h.tone === 'paused' ? (
                  <Button
                    size="sm"
                    className="col-start-2 justify-self-start sm:col-start-auto"
                    busy={busy === `resume:${d.id}`}
                    onClick={() => resume(d)}
                  >
                    Resume now
                  </Button>
                ) : h.tone === 'warn' || h.tone === 'bad' ? (
                  <Button
                    size="sm"
                    className="col-start-2 justify-self-start sm:col-start-auto"
                    busy={busy === `stop:${d.id}`}
                    onClick={() => stopTrying(d.id)}
                  >
                    Stop trying
                  </Button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </li>
            )
          })}
        </ul>
        {(canvas === 'main' ? aitumClashes(view.obs.aitum, on, true) : []).map((c) => {
          const d = view.destinations.find((x) => x.id === c.id)
          if (d?.health?.state !== 'live') return null
          return (
            <div
              key={c.id}
              role="status"
              className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-text-2 sm:grid-cols-[16px_minmax(0,1fr)_auto]"
            >
              <Warning size={16} weight="fill" className="shrink-0 text-warn" aria-hidden />
              <span className="min-w-0">
                <b className="text-text">{c.name} is getting your stream twice</b> (from Ferrocast
                and from Aitum Multistream). Stop one to free about {mbps(d.health.kbps)} of upload.
              </span>
              <Button
                size="sm"
                className="col-start-2 justify-self-start sm:col-start-auto"
                busy={busy === `stop:${c.id}`}
                onClick={() => stopTrying(c.id)}
              >
                Stop Ferrocast’s copy
              </Button>
            </div>
          )
        })}
        <p className="m-0 text-[13.5px] text-text-3">
          Adding or removing a platform below doesn’t end the stream.
        </p>
      </div>
      {saver.dialog}
    </Panel>
  )
}

/** Every platform is switched off but the stream is still on air (a recording may need it). */
function NotSending({ canvas }: { canvas: Canvas }) {
  const studio = useStudio()
  const { run, busy } = useAction()
  const [ask, setAsk] = useState(false)
  return (
    <div role="status" className="flex flex-wrap items-center gap-3">
      <span className="min-w-0 flex-1 text-[14.5px] text-text-2">
        <b className="text-text">Live, not sending to any platform.</b> The stream and any recording
        keep going until you end the stream.
      </span>
      {canvas === 'main' && (
        <Button size="sm" variant="danger-ghost" onClick={() => setAsk(true)}>
          End stream
        </Button>
      )}
      <Dialog
        open={ask}
        onClose={() => setAsk(false)}
        title="End the stream?"
        description="Nothing is going to a platform now. Ending it also stops what depends on it, like a recording."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsk(false)}>
              Keep it on
            </Button>
            <Button
              variant="danger"
              busy={busy === 'end'}
              onClick={() =>
                void run('end', () => studio.setObsStream(false), {
                  success: 'The stream ended.',
                }).then(() => setAsk(false))
              }
            >
              End stream
            </Button>
          </>
        }
      />
    </div>
  )
}

/** `45 s`, then whole minutes rounded up: `2 min`. */
function waitText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

// ---------------------------------------------------------------- 2A: the platforms

export function Platforms({
  view,
  onSaved,
  onProtect,
  canvas = 'main',
  videoKbps,
  audioKbps,
}: {
  view: GoLiveView
  onSaved: () => void
  onProtect?: ((on: boolean) => void) | undefined
  canvas?: Canvas | undefined
  videoKbps?: number | undefined
  audioKbps?: number | undefined
}) {
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<DestinationView | null>(null)
  const [qualityModal, setQualityModal] = useState<{
    destId: string
    triggerEl: HTMLElement | null
  } | null>(null)
  const [mode] = useMode('studio')
  const isRemote = useLive((s) => s.remote !== null)

  const ctrl = usePlatformsListController({
    view,
    onSaved,
    onProtect,
    canvas,
    videoKbps,
    audioKbps,
  })
  const qualityOpts = useQualityOptions(view, Boolean(view), ctrl.usesObs, onSaved)
  const handleQualityUpdated = (nextView: GoLiveView) => {
    useLive.getState().setGoLiveView(nextView)
    onSaved()
  }

  const vertical = ctrl.verticalOnly
  const streaming = ctrl.streaming
  const panelDescription = vertical
    ? 'YouTube Shorts live, or a server of your own. Twitch and Kick take one live per channel.'
    : 'Drag to set what pauses first if your upload struggles: the bottom one.'
  const addAction = (
    <Button
      size="sm"
      icon={<Plus size={15} />}
      aria-label="Add a destination"
      onClick={() => setAdding(true)}
    >
      {/* Short on a phone, so the panel's name keeps its room. */}
      <span className="sm:hidden">Add</span>
      <span className="hidden sm:inline">Add a destination</span>
    </Button>
  )
  const content = (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5" aria-label="Platforms, top first">
        {ctrl.merged.map((d, i) => {
          const tone = platformTileTone(d, streaming)
          const StatusGlyph = tone.icon
          const rateInfo = describeDestinationRate(d, ctrl.capSummary, ctrl.rateOpts)
          const rateText = !streaming
            ? d.enabled && d.health?.state === 'failed'
              ? 'Failed'
              : (rateInfo.rateLabel ?? '')
            : liveStatus(d, streaming, rateInfo.kbps ?? ctrl.plan)
          const showRate =
            Boolean(rateText) &&
            !['Off', 'Failed', 'Reconnecting', 'Paused', 'Standby'].includes(rateText)
          return (
            <li
              key={d.id}
              data-platform-tile={d.id}
              draggable
              onDragStart={() => (ctrl.dragged.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (ctrl.dragged.current !== null) ctrl.move(ctrl.dragged.current, i)
                ctrl.dragged.current = null
              }}
              className={cx(
                'flex flex-col gap-2.5 rounded-[12px] border p-3.5 transition-colors',
                tone.tileCls,
              )}
            >
              <div className="flex flex-wrap items-start gap-2.5 sm:flex-nowrap sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center sm:gap-3">
                  <button
                    type="button"
                    className="grid size-8 shrink-0 cursor-grab place-items-center rounded-[calc(var(--fc-radius-control)-2px)] text-text-2 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                    aria-label={`Move ${d.name}: arrow up or down`}
                    onKeyDown={ctrl.onGripKey(i)}
                  >
                    <DotsSixVertical size={16} aria-hidden />
                  </button>
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2"
                  >
                    <Logo kind={d.kind} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <RowText
                      d={d}
                      hideRateBadges={Boolean(d.resolved_quality)}
                      statusBadge={
                        <span
                          className={cx(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
                            tone.badgeCls,
                          )}
                        >
                          <StatusGlyph size={12} weight="fill" aria-hidden />
                          <span>{tone.word}</span>
                        </span>
                      }
                      rateInfo={rateInfo}
                    />
                    <div className="mt-1">
                      <button
                        type="button"
                        data-quality-trigger={d.id}
                        disabled={ctrl.usesObs}
                        aria-haspopup="dialog"
                        aria-expanded={qualityModal?.destId === d.id}
                        aria-label={`Change quality for ${d.name}: ${buildQualitySummaryText(d, ctrl.usesObs)}`}
                        onClick={(e) =>
                          setQualityModal({ destId: d.id, triggerEl: e.currentTarget })
                        }
                        className="fc-press inline-flex h-[24px] max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 text-[12px] font-medium text-text-2 hover:border-line-strong hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                      >
                        <span className="truncate">{buildQualitySummaryText(d, ctrl.usesObs)}</span>
                        <CaretDown
                          size={11}
                          weight="bold"
                          className="shrink-0 opacity-75"
                          aria-hidden
                        />
                      </button>
                    </div>
                    {!streaming &&
                      d.enabled &&
                      d.health?.state === 'failed' &&
                      (() => {
                        const t = healthText(d.health, d.blocked, d.kind)
                        return (
                          <InfoLine
                            detail={t.detail ?? undefined}
                            label={`More about ${d.name}`}
                            className="mt-1"
                          >
                            <span className="text-[13px] font-semibold text-danger">{t.label}</span>
                          </InfoLine>
                        )
                      })()}
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {showRate && (
                    <span className="font-mono text-[13px] font-medium text-text-2 tabular-nums">
                      {rateText}
                    </span>
                  )}
                  {d.enabled && streaming && d.health?.state === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      busy={ctrl.busy === `retry:${d.id}`}
                      aria-label={`Retry ${d.name}`}
                      onClick={() =>
                        void ctrl
                          .run(`retry:${d.id}`, () => ctrl.api.resume(d.id).then(() => true), {
                            success: `Trying ${d.name} again.`,
                          })
                          .then((r) => r && onSaved())
                      }
                    >
                      Retry
                    </Button>
                  )}
                  {(d.kind === 'custom' || d.connected) && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pulse size={14} />}
                      busy={ctrl.busy === `test:${d.id}`}
                      aria-label={`Test connection to ${d.name}`}
                      onClick={() => ctrl.test(d)}
                    >
                      Test
                    </Button>
                  )}
                  {d.kind === 'custom' && (
                    <IconButton
                      label={`Remove ${d.name}`}
                      size="sm"
                      disabled={ctrl.busy === `rm:${d.id}`}
                      onClick={() => setRemoving(d)}
                    >
                      <Trash size={15} />
                    </IconButton>
                  )}
                  <Switch
                    label={`Stream to ${d.name}`}
                    hideLabel
                    checked={d.enabled}
                    disabled={ctrl.busy === 'order'}
                    onChange={(on) => ctrl.toggle(d.id, on)}
                  />
                </div>
              </div>
              {ctrl.tests[d.id] !== undefined && (
                <ReachLine r={ctrl.tests[d.id]!} className="pl-0 sm:pl-[92px]" />
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px]">
        <b className="font-semibold text-text">{goingTo(ctrl.merged)}.</b>
        <div className="flex flex-wrap items-center gap-2">
          {ctrl.uploadSummary ? (
            <>
              <span className="text-text-2">{ctrl.uploadSummary.line}</span>
              <InfoTip label="Why upload adds up">{ctrl.uploadSummary.detail}</InfoTip>
            </>
          ) : (
            vertical && (
              <InfoTip label="About vertical upload">
                Upload protection counts the vertical stream too: it pauses before the platforms on
                the Go live tab.
              </InfoTip>
            )
          )}
        </div>
      </div>
      {vertical ? null : (
        <div className="divide-y divide-line rounded-[12px] border border-line bg-surface-1">
          <div className="p-3.5">
            <Switch
              label="Upload protection"
              description="If your upload can’t carry every platform, the bottom one pauses for a while so the ones above stay smooth."
              checked={view.protect}
              disabled={ctrl.busy === 'protect'}
              onChange={ctrl.protect}
            />
            {mode === 'advanced' && view.protect && (
              <div className="mt-3">
                <ProtectionRule view={view} onSaved={onSaved} />
              </div>
            )}
          </div>
          <div className="p-3.5">
            <Switch
              label="Auto quality"
              description="If your upload struggles, the stream’s quality drops a little so it stays smooth, then comes back by itself."
              checked={view.auto_quality}
              disabled={ctrl.busy === 'auto-quality'}
              onChange={ctrl.autoQuality}
            />
          </div>
        </div>
      )}
    </div>
  )
  return (
    <>
      <Panel
        id="golive-platforms"
        title={vertical ? 'Where it goes' : 'Your platforms'}
        description={panelDescription}
        actions={addAction}
      >
        {content}
      </Panel>
      <PlatformsQualityModal
        open={qualityModal !== null}
        onClose={() => setQualityModal(null)}
        view={view}
        onSaved={onSaved}
        onUpdated={handleQualityUpdated}
        {...(onProtect ? { onProtect } : {})}
        initialDestId={qualityModal?.destId ?? null}
        canvasFilter={canvas}
        triggerEl={qualityModal?.triggerEl ?? null}
        usesObs={ctrl.usesObs}
        isRemote={isRemote}
        videoKbps={videoKbps}
        audioKbps={audioKbps}
        optionsResponse={qualityOpts.data}
        loading={qualityOpts.loading}
        error={qualityOpts.error}
        onReloadOptions={qualityOpts.reload}
      />
      <AddDestination
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onSaved}
        canvas={canvas}
      />
      {ctrl.saver.dialog}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this server'}?`}
        description="It stops getting your stream, and its stream key is deleted from this computer. You can add it again later with its key."
        size="sm"
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button
              variant="danger"
              busy={removing !== null && ctrl.busy === `rm:${removing.id}`}
              onClick={() => removing && ctrl.remove(removing, () => setRemoving(null))}
            >
              Remove
            </Button>
          </>
        }
      />
    </>
  )
}

/** One thing a destination's row has to say about itself that isn't "all good". */
interface RowNotice {
  key: string
  tone: 'warn' | 'danger'
  /** A word or two: what the chip says. */
  label: string
  /** All of it: what the screen reader hears and the panel under the row shows. */
  text: string
  /** The bitrate (kbps) that clears it, when lowering it does. */
  fixKbps?: number
  link?: { href: string; label: string }
}

const ISSUE_LABEL: Record<RuleCode, string> = {
  bitrate: 'Bitrate too high',
  codec: 'Wrong codec',
  keyint: 'Keyframes too far apart',
}

const KICK_MULTI =
  'Kick Partners must allow multistreaming: Creator Dashboard › Partner Income › Multistreaming, or type /multi on in your chat.'

/** The row's notices, shortest label first-class: the sentence is only in `text`. */
function rowNotices(d: DestinationView): RowNotice[] {
  const out: RowNotice[] = []
  // Live, the live line under the row already says it (Can't start, with its (i)): not twice.
  const liveLineSays =
    d.enabled && !!d.health && d.health.state !== 'waiting' && d.health.state !== 'stopped'
  if (d.blocked && !liveLineSays)
    out.push({
      key: 'blocked',
      tone: d.enabled ? 'danger' : 'warn',
      label: 'Can’t start',
      text: d.blocked,
    })
  if (d.enabled && d.kind === 'kick' && d.health?.state !== 'failed')
    out.push({
      key: 'kick',
      tone: 'warn',
      label: 'Kick Partner?',
      text: KICK_MULTI,
      link: { href: 'https://dashboard.kick.com/', label: 'Open Kick’s dashboard' },
    })
  if (d.backup_for)
    out.push({
      key: 'backup',
      tone: 'warn',
      label: 'Backup on',
      text: `Sending for ${d.backup_for}.`,
    })
  if (d.issues)
    for (const i of d.issues) {
      const text = i.detail
        ? i.detail.includes(i.summary)
          ? i.detail
          : `${i.summary}. ${i.detail}`
        : i.summary
      out.push({
        key: `${i.code}:${i.summary}`,
        tone: 'warn',
        label: ISSUE_LABEL[i.code] ?? 'Check this',
        text,
        ...(i.fix_kbps !== undefined ? { fixKbps: i.fix_kbps } : {}),
      })
    }
  else for (const r of d.rules) out.push({ key: r, tone: 'warn', label: 'Stream rule', text: r })
  return out
}

/**
 * A small status chip on the name line: the row keeps its height, whatever is wrong. The chip is
 * a button named by the whole text; pressed, the text (and the fix) opens under the row. With
 * room, the one-press fix sits next to the chip.
 */
function RowAlerts({
  d,
  notices,
  fixBitrate,
  compact,
}: {
  d: DestinationView
  notices: RowNotice[]
  fixBitrate?: ((kbps: number) => void) | undefined
  compact: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  if (notices.length === 0) return null
  const first = notices[0]!
  const danger = notices.some((n) => n.tone === 'danger')
  const fix = fixBitrate ? notices.find((n) => n.fixKbps !== undefined) : undefined
  const name = `${d.name}: ${notices.map((n) => n.text).join(' ')}`
  return (
    <>
      <button
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'relative inline-flex h-5 min-w-0 shrink items-center gap-1 rounded-full px-1.5 font-bold ring-1 transition-colors',
          'text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
          // A bigger touch target than the chip.
          'after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[""]',
          compact ? 'text-[11px]' : 'text-[11.5px]',
          danger
            ? 'bg-danger-soft ring-danger/40 hover:bg-danger/20'
            : 'bg-warn-soft ring-warn/40 hover:bg-warn/20',
        )}
      >
        <Warning
          size={12}
          weight="fill"
          className={cx('shrink-0', danger ? 'text-danger' : 'text-warn')}
          aria-hidden
        />
        <span className="min-w-0 truncate">{first.label}</span>
        {notices.length > 1 && <span className="shrink-0 text-text-2">+{notices.length - 1}</span>}
        <Info
          size={12}
          weight={open ? 'fill' : 'bold'}
          className="shrink-0 text-text-3"
          aria-hidden
        />
      </button>
      {fix && (
        <button
          type="button"
          onClick={() => fixBitrate?.(fix.fixKbps!)}
          className={cx(
            'hidden h-5 shrink-0 items-center rounded-full bg-surface-3 px-2 font-bold text-text ring-1 ring-line-strong @[19rem]:inline-flex',
            'hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
            compact ? 'text-[11px]' : 'text-[11.5px]',
          )}
        >
          Use {fix.fixKbps!.toLocaleString()}
        </button>
      )}
      {open && (
        <div
          id={id}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
            }
          }}
          className={cx(
            'basis-full rounded-control px-2 py-1.5 leading-snug text-text-2',
            compact ? 'text-[12.5px]' : 'text-[13.5px]',
            danger ? 'bg-danger-soft' : 'bg-warn-soft',
          )}
        >
          {notices.map((n) => (
            <p key={n.key} className="m-0 not-first:mt-1.5">
              <span className="break-words">{n.text}</span>
              {(n.link || (fixBitrate && n.fixKbps !== undefined)) && (
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  {fixBitrate && n.fixKbps !== undefined && (
                    <button
                      type="button"
                      onClick={() => fixBitrate(n.fixKbps!)}
                      className="inline-flex h-6 items-center rounded-full bg-warn-soft px-2 text-[12.5px] font-bold text-text ring-1 ring-warn/40 hover:bg-warn/20 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                    >
                      Use {n.fixKbps.toLocaleString()} kbps
                    </button>
                  )}
                  {n.link && (
                    <a
                      {...externalLink(n.link.href)}
                      className="inline-flex items-center gap-1 font-semibold text-accent-text underline-offset-2 hover:underline"
                    >
                      {n.link.label}
                      <ArrowSquareOut size={12} aria-hidden />
                    </a>
                  )}
                </span>
              )}
            </p>
          ))}
        </div>
      )}
    </>
  )
}

export function RowText({
  d,
  fixBitrate,
  compact = false,
  rateInfo,
  statusBadge,
  hideRateBadges = false,
}: {
  d: DestinationView
  /** The Studio streams: a button sets its video bitrate to what the warning asks for. */
  fixBitrate?: ((kbps: number) => void) | undefined
  /** The compact Studio's Go live panel: smaller type. */
  compact?: boolean
  /** Shared stream cap and effective rate context. */
  rateInfo?: DestinationRateDisplay | undefined
  /** Explicit status indicator badge on tile rows. */
  statusBadge?: React.ReactNode
  /** Hide legacy static rate pills when the interactive quality picker chip is shown. */
  hideRateBadges?: boolean
}) {
  const platform = d.kind !== 'custom' ? NAMES[d.kind] : null
  const notices = rowNotices(d)
  const capBadge = d.capped ?? rateInfo?.ownCapNote
  const showCompactRate =
    compact &&
    !!rateInfo?.rateLabel &&
    (!d.health || d.health.state === 'waiting' || d.health.state === 'stopped')
  return (
    <div className="@container min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <b
          className={cx(
            'min-w-0 truncate',
            compact ? 'text-[13.5px] leading-tight font-semibold' : 'text-[15px]',
            !d.enabled && 'text-text-2',
          )}
        >
          {d.name}
        </b>
        {statusBadge}
        <RowAlerts d={d} notices={notices} fixBitrate={fixBitrate} compact={compact} />
        {showCompactRate && (
          <span className="ml-auto shrink-0 font-mono text-[12px] font-medium text-text-3 tabular-nums">
            {rateInfo.rateLabel}
          </span>
        )}
      </div>
      <span
        className={cx(
          'flex min-w-0 items-center gap-1 text-text-2',
          compact ? 'text-[12.5px]' : 'text-[13.5px]',
        )}
      >
        {d.kind === 'custom' ? (
          <span className="min-w-0 truncate">
            {d.direct ? (
              <>
                {d.account ?? 'Your own server'} · {DIRECT_NAMES[d.direct]} from the Studio
              </>
            ) : (
              <>
                {d.brand ? `${PASTE_BRANDS.find((x) => x.id === d.brand)?.label ?? ''} · ` : ''}
                {d.account ?? 'Your own server'} · video only
              </>
            )}
          </span>
        ) : d.connected ? (
          <>
            <span className="min-w-0 truncate">
              {d.account ?? platform} ·{' '}
              {d.canvas === 'vertical' ? 'Ferrocast makes its stream' : `key from ${platform}`}
            </span>
            <LockSimple size={12} className="shrink-0" aria-label="kept safe" />
          </>
        ) : (
          // A plain link, not a pill: the tag looked heavy in the panel (owner, 28 Oct).
          <span className="min-w-0 truncate">
            Not connected ·{' '}
            <a
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
              href={href({ name: 'settings', section: 'accounts' })}
              aria-label={`Connect ${platform}`}
            >
              Connect
            </a>
          </span>
        )}
      </span>
      {d.standby_for && (
        <span className="block text-[13.5px] text-text-3">
          Backup for {d.standby_for}: sends only if it can’t
        </span>
      )}
      {!hideRateBadges && capBadge && (
        <InfoLine detail={capBadge.detail} label={`About ${d.name} limits`} className="mt-1">
          <span
            className={cx(
              'inline-flex max-w-full items-center rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text-2 ring-1 ring-line',
              compact ? 'text-[11.5px]' : 'text-[12px]',
            )}
          >
            {capBadge.summary}
          </span>
        </InfoLine>
      )}
      {!hideRateBadges && rateInfo?.heldBackNote && (
        <InfoLine
          detail={rateInfo.heldBackNote.detail}
          label={`About ${d.name} stream rate`}
          className="mt-1"
        >
          <span
            className={cx(
              'inline-flex max-w-full items-center rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text-2 ring-1 ring-line',
              compact ? 'text-[11.5px]' : 'text-[12px]',
            )}
          >
            {rateInfo.heldBackNote.summary}
          </span>
        </InfoLine>
      )}
    </div>
  )
}

/** A backup's health line says whom it sends for. */
function withBackup(
  h: ReturnType<typeof healthText>,
  forName: string,
): ReturnType<typeof healthText> {
  return { ...h, label: `${h.label} · sending for ${forName}` }
}

/** One moved to the lighter stream because its route is slow says so, and that it's for now. */
function lighterForNow(h: ReturnType<typeof healthText>): ReturnType<typeof healthText> {
  return {
    ...h,
    label: `${h.label} · Lighter stream for now`,
    detail: `${h.detail ? `${h.detail} · ` : ''}its route is slow; full quality again soon`,
  }
}

function AddDestination({
  open,
  onClose,
  onAdded,
  canvas = 'main',
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
  canvas?: Canvas
}) {
  const state = useAddDestinationState({ canvas, onAdded: () => onAdded(), onClose })
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a destination"
      sheetOnMobile
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button busy={state.busy === 'test'} disabled={!state.url.trim()} onClick={state.tryIt}>
            Test
          </Button>
          <Button
            variant="primary"
            busy={state.busy === 'add'}
            disabled={!state.canAdd}
            onClick={state.submit}
          >
            {state.submitLabel}
          </Button>
        </>
      }
    >
      <AddDestinationFormBody state={state} canvas={canvas} />
    </Dialog>
  )
}

// ---------------------------------------------------------------- 3A: set up once

/**
 * Aitum Multistream also streams to platforms ticked here: each would get the stream twice.
 * Board item 7 (24 Oct): say so once, show where in OBS, or "I use it on purpose".
 */
function AitumNote({ names, onOk }: { names: string[]; onOk: () => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const [how, setHow] = useState(false)
  const list = andList(names)
  const ok = () =>
    void run('aitum', () => api.setAitumOk(true), {
      success: 'Got it. Ferrocast warns you only if a platform gets the stream twice while live.',
    }).then((r) => r && onOk())
  return (
    <section
      aria-label="Aitum Multistream"
      className="flex flex-col gap-3 rounded-panel border border-warn/30 bg-warn-soft p-4 text-[14.5px] text-text-2"
    >
      <p className="m-0 flex gap-2.5">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <span>
          <b className="text-text">Aitum Multistream is also set up to send to {list}.</b> With
          Ferrocast sending too, {names.length === 1 ? 'it would' : 'they’d each'} get your stream
          twice. Turn off {names.length === 1 ? 'that output' : 'those outputs'} in OBS, or untick{' '}
          {names.length === 1 ? 'it' : 'them'} here.
        </span>
      </p>
      {how && (
        <p className="m-0 pl-7">
          In OBS, open the Aitum Multistream dock (Docks menu, Aitum Multistream). Each output has
          its own stream button; switch off {names.length === 1 ? 'the one' : 'the ones'} for {list}
          , or remove {names.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pl-7">
        <Button size="sm" aria-expanded={how} onClick={() => setHow(!how)}>
          {how ? 'Hide the steps' : 'Show me where in OBS'}
        </Button>
        <Button size="sm" variant="ghost" busy={busy === 'aitum'} onClick={ok}>
          I use it on purpose
        </Button>
      </div>
    </section>
  )
}

function Setup({
  view,
  onObs,
  onUpload,
}: {
  view: GoLiveView
  onObs: (o: GoLiveView['obs']) => void
  onUpload: (u: UploadCheck) => void
}) {
  const api = useGoLive()
  const studio = useStudio()
  const { run, busy } = useAction()
  const { obs, upload } = view
  const stopObs = () =>
    void run('stop-obs', () => studio.setObsStream(false), {
      success: 'OBS stopped streaming.',
    }).then((r) => r && onObs({ ...obs, streaming: r.streaming }))
  const point = () =>
    void run('point', () => api.pointObs(), { success: 'OBS now streams to Ferrocast.' }).then(
      (o) => o && onObs(o),
    )
  const restore = () =>
    void run('restore', () => api.restoreObs(), {
      success: (o) =>
        o.points_here ? null : `OBS streams to ${obs.before ?? 'its old setting'} again.`,
    }).then((o) => o && onObs(o))
  const test = () => void run('test', () => api.uploadCheck()).then((u) => u && onUpload(u))

  if (obs.points_here && upload)
    return (
      <Panel title="OBS" id="golive-setup">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
          <CheckCircle size={18} weight="fill" className="text-ok" aria-hidden />
          <span className="text-[14.5px] font-semibold">OBS sends to Ferrocast</span>
          {obs.before && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              icon={<ArrowCounterClockwise size={15} />}
              busy={busy === 'restore'}
              onClick={restore}
            >
              Put OBS back to {obs.before}
            </Button>
          )}
        </div>
        <ByHand />
      </Panel>
    )
  return (
    <Panel title="Set up once" id="golive-setup">
      <ol className="m-0 flex list-none flex-col p-0">
        <Step
          n={1}
          done={obs.connected}
          title={obs.connected ? 'OBS is connected' : 'Connect OBS'}
          info="Open OBS on this computer. Ferrocast finds it by itself, or check Settings, OBS."
        >
          {obs.connected ? null : (
            <>
              <a
                className="text-[14.5px] font-semibold text-accent-text hover:underline"
                href={href({ name: 'settings', section: 'obs' })}
              >
                OBS settings
              </a>
            </>
          )}
        </Step>
        <Step
          n={2}
          done={obs.points_here}
          title="Send OBS’s stream to Ferrocast"
          info="OBS streams to Ferrocast on this PC instead of straight to your platform. Your scenes and quality stay the same, and you can put it back any time."
        >
          {obs.points_here ? null : (
            <>
              {obs.streaming && <p className="text-warn">Stop streaming in OBS first.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  icon={<Plug size={16} />}
                  busy={busy === 'point'}
                  disabled={!obs.connected || obs.streaming}
                  onClick={point}
                >
                  Point OBS at Ferrocast
                </Button>
                {obs.connected && obs.streaming && (
                  <Button
                    icon={<Stop size={15} weight="fill" />}
                    busy={busy === 'stop-obs'}
                    onClick={stopObs}
                  >
                    Stop streaming in OBS
                  </Button>
                )}
              </div>
            </>
          )}
        </Step>
        <Step
          n={3}
          done={!!upload}
          title="Test your upload"
          info="Sends a few seconds of test data to Twitch’s test server. Nobody sees it."
        >
          {upload ? null : (
            <>
              <Button
                className="self-start"
                icon={<Gauge size={16} />}
                busy={busy === 'test'}
                onClick={test}
              >
                Test upload
              </Button>
            </>
          )}
        </Step>
      </ol>
      <ByHand />
    </Panel>
  )
}

function Step({
  n,
  done,
  title,
  info,
  children,
}: {
  n: number
  done: boolean
  title: string
  /** The step's explanation, behind the (i). */
  info?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-line py-3 first:border-t-0 first:pt-0.5">
      <span
        className={cx(
          'grid size-7 place-items-center rounded-full border font-mono text-[14px] font-extrabold',
          done
            ? 'border-ok bg-ok text-white'
            : 'border-accent-line bg-accent-soft text-accent-text',
        )}
        aria-hidden
      >
        {done ? <CheckCircle size={16} weight="bold" /> : n}
      </span>
      <div className="flex min-w-0 flex-col gap-2 text-[14px] text-text-2 [&_p]:m-0">
        <span className="flex items-center gap-1">
          <b className="text-[15px] text-text">
            {title}
            <span className="sr-only">{done ? ' (done)' : ''}</span>
          </b>
          {info && !done && <InfoTip>{info}</InfoTip>}
        </span>
        {children}
      </div>
    </li>
  )
}

/** OBS's Settings, Stream by hand: the server and key, for OBS on another way or a check. */
export function ByHand({ vertical = false }: { vertical?: boolean }) {
  const api = useGoLive()
  const [ingest, setIngest] = useState<{
    server: string
    key: string
    vertical_key: string
  } | null>(null)
  const { run, busy } = useAction()
  const copy = (text: string, what: string) =>
    void navigator.clipboard.writeText(text).then(
      () => toast({ tone: 'ok', message: `${what} copied.` }),
      () =>
        toast({
          tone: 'error',
          message: `Couldn’t copy the ${what.toLowerCase()}.`,
          hint: 'Select it and copy it by hand.',
        }),
    )
  return (
    <details
      className="mt-3 text-[14px] text-text-2"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !ingest)
          void run('ingest', () => api.ingest()).then((i) => i && setIngest(i))
      }}
    >
      <summary className="cursor-pointer font-semibold text-text-2 hover:text-text">
        {vertical ? 'Set it up by hand' : 'Set OBS up by hand'}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="m-0">
          {vertical
            ? 'Anything that sends a vertical stream can use these two (in Aitum Vertical: its settings, a stream output).'
            : 'In OBS open Settings, Stream, pick Custom, and paste these two.'}
        </p>
        {busy === 'ingest' && <Skeleton className="h-16" />}
        {ingest && (
          <>
            <CopyRow
              label="Server"
              value={ingest.server}
              onCopy={() => copy(ingest.server, 'Server')}
            />
            <CopyRow
              label="Stream key"
              value={'•'.repeat(16)}
              onCopy={() => copy(vertical ? ingest.vertical_key : ingest.key, 'Stream key')}
            />
          </>
        )}
      </div>
    </details>
  )
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-1.5">
      <span className="w-20 shrink-0 text-[13px] font-medium text-text-2">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-text">{value}</code>
      <IconButton label={`Copy ${label.toLowerCase()}`} size="sm" onClick={onCopy}>
        <Copy size={15} />
      </IconButton>
    </div>
  )
}

// ---------------------------------------------------------------- 4B: the upload table

function Upload({ view, onUpload }: { view: GoLiveView; onUpload: (u: UploadCheck) => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const u = view.upload
  const test = () => void run('test', () => api.uploadCheck()).then((r) => r && onUpload(r))
  return (
    <Panel
      title="Your upload"
      id="golive-upload"
      actions={
        u && (
          <Button size="sm" icon={<Gauge size={15} />} busy={busy === 'test'} onClick={test}>
            Check again
          </Button>
        )
      }
    >
      {!u ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[14.5px] text-text-2">
            Every platform is a full copy of your stream on your own internet. Test once before you
            go live: Ferrocast checks your speed and how far each platform’s server is, and says
            what fits.
          </p>
          <Button icon={<Gauge size={16} />} busy={busy === 'test'} onClick={test}>
            Test upload
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14.5px]">
              <thead>
                <tr className="text-left font-mono text-[12.5px] text-text-2 [&>th]:border-b [&>th]:border-line [&>th]:px-2.5 [&>th]:py-2 [&>th]:font-bold">
                  <th scope="col">Platform</th>
                  <th scope="col">Delay</th>
                  <th scope="col">Needs</th>
                </tr>
              </thead>
              <tbody>
                {u.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="[&>td]:border-b [&>td]:border-line [&>td]:px-2.5 [&>td]:py-2 [&>td]:whitespace-nowrap last:[&>td]:border-b-0"
                  >
                    <td className="font-semibold">{r.name}</td>
                    {r.problem ? (
                      <td colSpan={2} className="!whitespace-normal text-danger">
                        {r.problem}
                      </td>
                    ) : (
                      <>
                        <td
                          className={cx(
                            'tabular-nums',
                            (r.delay_ms ?? 0) > 100 ? 'font-semibold text-warn' : 'text-text-2',
                          )}
                        >
                          {r.delay_ms === null ? '–' : `${r.delay_ms} ms`}
                        </td>
                        <td className="tabular-nums text-text-2">{mbps(r.need_kbps)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[13.5px] text-text-3">
            Speed {mbps(u.verdict.upload_kbps)},{' '}
            {u.measured_by === 'twitch'
              ? 'measured through Twitch’s test mode'
              : 'measured with Cloudflare’s speed test'}
            . 20% is kept free for your game and chat.
          </p>
          <p
            className={cx(
              'm-0 font-display text-[16px] font-bold leading-snug',
              u.verdict.fits ? 'text-text' : 'text-warn',
            )}
          >
            {u.verdict.message}
          </p>
        </div>
      )}
    </Panel>
  )
}

/** Show tab's one line: where the stream goes, linking to Go live. */
export function GoingToLine() {
  const api = useGoLive()
  const res = useResource(() => api.view(), [api])
  const view = useMerged(res.data)
  if (!view) return null
  const main = onCanvas(view.destinations, 'main')
  const n = main.filter((d) => d.enabled).length
  return (
    <a
      href={href({ name: 'studio', section: 'golive' })}
      className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface-1 px-3 py-1.5 text-[14px] font-semibold text-text hover:border-text-3"
    >
      <Broadcast size={15} aria-hidden />
      {n === 0
        ? 'Go live everywhere: pick your platforms'
        : `${goingTo(main)} with Go live everywhere`}
      {view.live && <Badge tone="ok">Live</Badge>}
    </a>
  )
}
