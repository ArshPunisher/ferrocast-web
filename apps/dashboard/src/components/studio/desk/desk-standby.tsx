// Studio > Go live pre-start view: S3 "Studio-Desk Silhouette" — a 16:9 standby stage on the
// left, a compact right dock with platforms (shown once), quick checks, and Planned streams,
// plus a full-width recent recordings strip below.

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarPlus,
  FilmSlate,
  HardDrive,
  Microphone,
  Play,
  Plug,
  ShieldWarning,
  Trash,
  VideoCamera,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  clipsApi,
  clipSize,
  onCanvas,
  relativeTime,
  scheduleApi,
  studioApi,
  type Clip,
  type GoLiveView,
  type ScheduledStream,
  type StudioEngineStatus,
  type StudioStartOptions,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  FerroGlyph,
  IconButton,
  InfoLine,
  InfoTip,
  Skeleton,
  cx,
} from '@ferrocast/ui'
import { useAction, useClient, useNow, useResource, type Resource } from '../../../lib/hooks'
import { go } from '../../../lib/router'
import { useLive } from '../../../lib/store'
import { isSafeModeLocked } from '../../safe-mode'
import { Logo, Platforms } from '../golive'
import { Plan, PlanDialog } from '../schedule'
import { KIND_LABEL } from '../clips/labels'
import { Thumb, useThumb } from '../clips/thumb'
import { useEngine } from './common'
import {
  buildQuickChecks,
  formatResolutionSummary,
  pickNextPlan,
  planTimingSummary,
  readStandbySnapshot,
  resolveStandbyPhase,
  safeThumbUrl,
  writeStandbySnapshot,
  type QuickCheckId,
  type QuickCheckTone,
  type StartChoice,
  type StartFailure,
} from './standby-model'

const WHEN = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const DOT_CLS: Record<QuickCheckTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-text-3',
}

const VALUE_CLS: Record<QuickCheckTone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-text-2',
}

function checkIcon(id: QuickCheckId) {
  switch (id) {
    case 'mic':
      return Microphone
    case 'camera':
      return VideoCamera
    case 'disk':
      return HardDrive
    case 'connections':
      return Plug
  }
}

export function DeskStandby({
  status,
  view,
  res,
  starting,
  startError,
  onStart,
  onRetryStatus,
}: {
  status: StudioEngineStatus
  view: GoLiveView | null
  res: Resource<GoLiveView>
  starting: StartChoice | null
  startError: StartFailure | null
  onStart: (choice?: StartChoice, opts?: StudioStartOptions) => Promise<void>
  onRetryStatus: () => void
}) {
  const client = useClient()
  const engine = useEngine()
  const studio = useMemo(() => studioApi(client), [client])
  const schedule = useMemo(() => scheduleApi(client), [client])
  const clips = useMemo(() => clipsApi(client), [client])
  const connectors = useLive((s) => s.connectors)
  const obsHealth = useLive((s) => s.studio.health)
  const { run, busy } = useAction()
  const now = useNow(30_000)

  const [cached] = useState(() => readStandbySnapshot())
  const [managingPlatforms, setManagingPlatforms] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [allPlansOpen, setAllPlansOpen] = useState(false)

  // Every optional pre-start fetch catches gracefully: a cold real desktop engine may reject
  // live-scene queries before Start the Studio is pressed.
  const preflight = useResource(() => studio.preflight().catch(() => null), [studio])
  const showConfig = useResource(() => studio.showConfig().catch(() => null), [studio])
  const studioSettings = useResource(() => engine.studioSettings().catch(() => null), [engine])
  const collections = useResource(() => engine.shelf('collections').catch(() => null), [engine])
  const profiles = useResource(() => engine.shelf('profiles').catch(() => null), [engine])
  const scenes = useResource(() => engine.scenes().catch(() => null), [engine])
  const plansRes = useResource(() => schedule.list(), [schedule])
  const clipsRes = useResource(() => clips.list().catch(() => null), [clips])

  const collectionName = useMemo(() => {
    const c = collections.data
    const active = c?.list.find((item) => item.id === c.current)?.name
    return active ?? cached?.collection ?? 'Default collection'
  }, [collections.data, cached?.collection])

  const profileName = useMemo(() => {
    const p = profiles.data
    return p?.list.find((item) => item.id === p.current)?.name ?? null
  }, [profiles.data])

  const sceneName = scenes.data?.current ?? scenes.data?.scenes[0]?.name ?? cached?.scene ?? null
  const scenesCount = scenes.data?.scenes.length ?? 0

  const [fetchedThumb, setFetchedThumb] = useState<string | null>(null)
  useEffect(() => {
    const targetScene = scenes.data?.current ?? scenes.data?.scenes[0]?.name
    if (!targetScene) return
    let alive = true
    void engine
      .thumbnail(targetScene, 640)
      .then((r) => {
        if (!alive) return
        const clean = safeThumbUrl(r.image)
        if (clean) {
          setFetchedThumb(clean)
          writeStandbySnapshot({ scene: targetScene, collection: collectionName, image: clean })
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [engine, scenes.data, collectionName])

  const thumbSrc = fetchedThumb ?? safeThumbUrl(cached?.image) ?? null
  const resolutionLabel = formatResolutionSummary(studioSettings.data)
  const phase = resolveStandbyPhase({
    available: status.available,
    starting,
    startError,
  })
  const safeMode = status.safe_mode ?? null
  const locked = safeMode ? isSafeModeLocked(safeMode) : false

  const mainDestinations = useMemo(() => (view ? onCanvas(view.destinations, 'main') : []), [view])
  const armedCount = mainDestinations.filter((d) => d.enabled).length
  const verticalCount = useMemo(
    () => (view ? onCanvas(view.destinations, 'vertical').filter((d) => d.enabled).length : 0),
    [view],
  )

  const checks = useMemo(
    () =>
      buildQuickChecks({
        preflight: preflight.data,
        showConfig: showConfig.data,
        obsHealth,
        connectors,
        destinations: view?.destinations ?? [],
        studioSettings: studioSettings.data,
        startError,
        engineAvailable: status.available,
        engineDetail: status.detail,
      }),
    [
      preflight.data,
      showConfig.data,
      obsHealth,
      connectors,
      view?.destinations,
      studioSettings.data,
      startError,
      status.available,
      status.detail,
    ],
  )

  const hasDangerCheck = checks.some((c) => c.tone === 'danger')
  const hasWarnCheck = checks.some((c) => c.tone === 'warn')
  const plans = useMemo(() => plansRes.data ?? [], [plansRes.data])
  const nextPlan = useMemo(() => pickNextPlan(plans, now), [plans, now])
  const recentClips = useMemo(() => (clipsRes.data?.clips ?? []).slice(0, 3), [clipsRes.data])

  const triggerStart = (choice: StartChoice, opts?: StudioStartOptions) => {
    if (starting !== null) return
    void onStart(choice, opts)
  }

  const removePlan = (id: string) => {
    void run(`del:${id}`, () => schedule.remove(id), {
      success: 'Removed. A broadcast already made on a platform stays there.',
    }).then(() => plansRes.reload())
  }

  return (
    <div data-testid="studio-standby" className="flex min-w-0 flex-col gap-2.5">
      {phase === 'starting' && (
        <div
          role="status"
          aria-live="polite"
          data-testid="standby-starting-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent-line bg-accent-soft px-3 py-1.5 text-[13px] text-text"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="fc-busy shrink-0 text-accent-text" aria-hidden />
            <span className="font-semibold">Starting the Studio...</span>
            <span className="hidden text-text-2 sm:inline">
              Loading scenes, audio mixer, and capture devices.
            </span>
          </div>
          <InfoTip label="About starting the Studio">
            Ferrocast starts scenes and local audio devices in standby. Streaming never starts until
            you press Go live.
          </InfoTip>
        </div>
      )}

      {phase === 'failed' && (
        <div
          role="alert"
          data-testid="standby-failed-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-danger/35 bg-danger-soft px-3 py-1.5 text-[13px] text-text"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <WarningCircle
              size={16}
              weight="fill"
              className="mt-0.5 shrink-0 text-danger"
              aria-hidden
            />
            <InfoLine detail={startError?.hint} label="What to check" className="min-w-0 flex-1">
              <p className="m-0 break-words font-semibold text-text">
                {!status.available ? "The Studio can't start yet." : 'Could not start the Studio.'}{' '}
                <span className="font-normal text-text-2">
                  {startError?.message ??
                    status.detail ??
                    'The Studio engine did not finish starting.'}
                </span>
              </p>
            </InfoLine>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={starting !== null}
              onClick={() => (!status.available ? onRetryStatus() : triggerStart('default'))}
            >
              Retry
            </Button>
            {status.available && !safeMode?.active && (
              <Button
                size="xs"
                variant="ghost"
                disabled={starting !== null}
                onClick={() => triggerStart('normal', { safe_mode: true })}
              >
                Start in Safe Mode
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-2.5 lg:grid-cols-[minmax(0,1.72fr)_minmax(310px,1fr)] xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,1fr)]">
        {/* Left: 16:9 Standby Stage */}
        <section
          aria-label="Standby stage"
          className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-surface-1"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge
                tone={phase === 'starting' ? 'accent' : phase === 'failed' ? 'danger' : 'neutral'}
              >
                {phase === 'starting'
                  ? 'Starting'
                  : phase === 'failed'
                    ? 'Start failed'
                    : 'Standby'}
              </Badge>
              <span
                title={collectionName}
                className="max-w-[180px] truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-text-2"
              >
                {collectionName}
              </span>
              {profileName && (
                <span
                  title={profileName}
                  className="hidden max-w-[150px] truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-text-2 sm:inline-flex"
                >
                  {profileName}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-text-2">
              {scenesCount > 0 && (
                <span>
                  {scenesCount} scene{scenesCount === 1 ? '' : 's'}
                </span>
              )}
              <InfoTip label="About standby stage">
                Preview your standby scene before capture devices open. Nothing broadcasts until you
                click Go live.
              </InfoTip>
            </div>
          </header>

          <div className="p-2">
            <div
              data-testid="standby-stage-frame"
              className="relative aspect-video w-full overflow-hidden rounded-[10px] border border-line bg-[#141922]"
            >
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt={sceneName ? `${sceneName} last scene preview` : 'Standby scene preview'}
                  className={cx(
                    'h-full w-full object-cover transition-opacity duration-200',
                    phase === 'starting' ? 'opacity-45' : 'opacity-90',
                  )}
                />
              ) : (
                <div
                  className={cx(
                    'relative grid h-full w-full place-items-center bg-[#141922] text-center transition-opacity duration-200',
                    phase === 'starting' && 'opacity-50',
                  )}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 1px 1px, rgb(159 176 199 / 0.35) 1px, transparent 0)',
                      backgroundSize: '20px 20px',
                    }}
                  />
                  <div className="relative flex flex-col items-center gap-2 px-4">
                    <div className="grid size-11 place-items-center rounded-[12px] border border-white/10 bg-[#1b2230] text-[#c5d0e0]">
                      <FerroGlyph size={22} />
                    </div>
                    <p className="m-0 text-[13.5px] font-semibold text-[#e6edf6]">
                      {sceneName ?? 'Studio canvas ready'}
                    </p>
                  </div>
                </div>
              )}

              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0b0d12]/80 to-transparent"
              />

              <div className="pointer-events-none absolute inset-x-2.5 bottom-2 flex items-center justify-between gap-2">
                <span className="max-w-[65%] truncate rounded-full border border-white/15 bg-[#0b0d12]/85 px-2.5 py-0.5 text-[12px] font-semibold text-[#e6edf6]">
                  {sceneName ? `Last scene · ${sceneName}` : 'Studio standby'}
                </span>
                <span className="shrink-0 rounded-full border border-white/15 bg-[#0b0d12]/85 px-2.5 py-0.5 font-mono text-[11.5px] font-medium text-[#c5d0e0]">
                  {resolutionLabel ?? '16:9 canvas'}
                </span>
              </div>

              {phase === 'starting' && (
                <div className="absolute inset-0 grid place-items-center bg-[#0b0d12]/35">
                  <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0d12]/90 px-3.5 py-1.5 text-[13px] font-semibold text-[#ffffff]">
                    <span className="fc-busy" aria-hidden />
                    <span>Starting Studio...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-1 px-3.5 py-2">
            {status.available && safeMode?.active ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone="warn">
                    <ShieldWarning size={13} weight="fill" aria-hidden />
                    Safe Mode
                  </Badge>
                  <span className="truncate text-[13px] text-text-2">
                    {safeMode.collection_pending
                      ? 'Plugins, VSTs, and saved scenes are held back.'
                      : 'Plugins, VSTs, and auto-start are off.'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="primary"
                    size="sm"
                    busy={starting === 'scenes'}
                    disabled={starting !== null}
                    icon={<Play size={14} weight="fill" aria-hidden />}
                    onClick={() =>
                      triggerStart(
                        'scenes',
                        safeMode.collection_pending
                          ? { safe_mode: true, confirm_collection: true }
                          : { safe_mode: true },
                      )
                    }
                  >
                    {safeMode.collection_pending ? 'Load my scenes' : 'Start in Safe Mode'}
                  </Button>
                  {!locked && (
                    <Button
                      variant="outline"
                      size="sm"
                      busy={starting === 'normal'}
                      disabled={starting !== null}
                      onClick={() =>
                        triggerStart('normal', { safe_mode: false, confirm_collection: true })
                      }
                    >
                      Start normally
                    </Button>
                  )}
                  {safeMode.collection_pending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      busy={starting === 'blank'}
                      disabled={starting !== null}
                      onClick={() =>
                        triggerStart('blank', { safe_mode: true, confirm_collection: false })
                      }
                    >
                      Blank canvas
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-2">
                  <span className="truncate">
                    {!status.available
                      ? 'Studio runtime is required before starting.'
                      : phase === 'starting'
                        ? 'Opening scenes and mixer...'
                        : 'Desk ready in standby'}
                  </span>
                  <InfoTip label="About starting the Studio">
                    Start the Studio opens your scenes, sources, and audio mixer locally. Going live
                    always stays a separate confirmation.
                  </InfoTip>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Play size={15} weight="fill" aria-hidden />}
                  busy={starting === 'default'}
                  disabled={!status.available || (starting !== null && starting !== 'default')}
                  onClick={() => triggerStart('default')}
                >
                  Start the Studio
                </Button>
              </>
            )}
          </footer>
        </section>

        {/* Right: Go live dock mirror (Platforms ONCE + Quick checks + Planned streams) */}
        <aside
          aria-label="Pre-start dock"
          className="flex min-w-0 flex-col divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface-1"
        >
          {/* 1. Connected platforms (rendered strictly ONCE on the pre-start screen) */}
          <section aria-label="Go live to" className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-[13.5px] font-bold text-text">Go live to</h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-text-2">
                  {armedCount > 0 ? `${armedCount} armed` : 'Standby'}
                  {verticalCount > 0 ? ` · +${verticalCount} vertical` : ''}
                </span>
              </div>
              <Button size="xs" variant="ghost" onClick={() => setManagingPlatforms(true)}>
                Manage
              </Button>
            </div>

            {!view ? (
              <div className="flex flex-col gap-1">
                <Skeleton className="h-7" />
                <Skeleton className="h-7" />
              </div>
            ) : mainDestinations.length === 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-control border border-dashed border-line bg-surface-2/40 px-2.5 py-1.5 text-[12.5px] text-text-2">
                <span>No platforms added yet.</span>
                <Button size="xs" variant="secondary" onClick={() => setManagingPlatforms(true)}>
                  Add
                </Button>
              </div>
            ) : (
              <ul data-testid="standby-platforms" className="m-0 flex list-none flex-col gap-1 p-0">
                {mainDestinations.map((d) => {
                  const statusTone: QuickCheckTone = !d.enabled
                    ? 'neutral'
                    : d.blocked
                      ? 'warn'
                      : d.connected
                        ? 'ok'
                        : 'warn'
                  const stateLabel = !d.enabled
                    ? 'Off'
                    : d.blocked
                      ? 'Needs check'
                      : d.connected
                        ? 'Armed'
                        : 'Offline'
                  return (
                    <li
                      key={d.id}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-control border border-line bg-surface-2/50 px-2.5 py-1"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Logo kind={d.kind} size={16} />
                        <span className="truncate text-[13px] font-semibold text-text">
                          {d.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cx('size-1.5 rounded-full', DOT_CLS[statusTone])}
                        />
                        <span className={cx('text-[12px] font-semibold', VALUE_CLS[statusTone])}>
                          {stateLabel}
                        </span>
                        {d.blocked && <InfoTip label={`About ${d.name}`}>{d.blocked}</InfoTip>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* 2. Hardware & Readiness Quick Checks */}
          <section aria-label="Quick checks" className="px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[13.5px] font-bold text-text">Quick checks</h2>
              <Badge tone={hasDangerCheck ? 'danger' : hasWarnCheck ? 'warn' : 'ok'}>
                {hasDangerCheck ? 'Action needed' : hasWarnCheck ? 'Review' : 'Ready'}
              </Badge>
            </div>
            <div data-testid="standby-quick-checks" className="grid grid-cols-2 gap-1.5">
              {checks.map((check) => {
                const Icon = checkIcon(check.id)
                return (
                  <div
                    key={check.id}
                    data-check-id={check.id}
                    data-check-tone={check.tone}
                    className={cx(
                      'flex min-w-0 flex-col gap-0.5 rounded-control border px-2 py-1',
                      check.tone === 'danger'
                        ? 'border-danger/35 bg-danger-soft/60'
                        : check.tone === 'warn'
                          ? 'border-warn/35 bg-warn-soft/60'
                          : 'border-line bg-surface-2/45',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex min-w-0 items-center gap-1 text-[11.5px] font-semibold text-text-2">
                        <Icon size={13} weight="bold" aria-hidden />
                        <span className="truncate">{check.label}</span>
                      </span>
                      <InfoTip label={`About ${check.label}`}>{check.detail}</InfoTip>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cx('size-1.5 shrink-0 rounded-full', DOT_CLS[check.tone])}
                      />
                      <span
                        className={cx('truncate text-[12px] font-semibold', VALUE_CLS[check.tone])}
                      >
                        {check.value}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 3. Planned streams reachable inside the dock */}
          <section aria-label="Planned streams" className="flex flex-1 flex-col px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[13.5px] font-bold text-text">Planned streams</h2>
              <Button
                size="xs"
                variant="secondary"
                icon={<CalendarPlus size={14} aria-hidden />}
                onClick={() => setPlanOpen(true)}
              >
                Plan a stream
              </Button>
            </div>

            {plansRes.error && !plansRes.data ? (
              <div className="flex items-center justify-between gap-2 text-[12.5px] text-text-2">
                <span>Could not load schedule.</span>
                <Button size="xs" variant="ghost" onClick={plansRes.reload}>
                  Retry
                </Button>
              </div>
            ) : !plansRes.data ? (
              <Skeleton className="h-11" />
            ) : !nextPlan ? (
              <p className="m-0 text-[12.5px] leading-snug text-text-2">
                Nothing planned yet. Schedule a reminder before you go live.
              </p>
            ) : (
              <CompactPlanRow
                plan={nextPlan}
                totalCount={plans.length}
                now={now}
                busy={busy === `del:${nextPlan.id}`}
                onOpenAll={() => setAllPlansOpen(true)}
                onDelete={() => removePlan(nextPlan.id)}
              />
            )}
          </section>
        </aside>
      </div>

      {/* Bottom: Full-width recent streams & recordings strip */}
      <section
        aria-label="Recent recordings"
        data-testid="standby-recent-clips"
        className="min-w-0 rounded-panel border border-line bg-surface-1 px-3.5 py-2"
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h2 className="m-0 text-[13.5px] font-bold text-text">Recent recordings</h2>
            {recentClips.length > 0 && (
              <Badge tone="neutral">{clipsRes.data?.clips.length ?? recentClips.length}</Badge>
            )}
            <InfoTip label="About recent recordings">
              Your latest Studio recordings and replay clips. Open Clips to trim, caption, or
              export.
            </InfoTip>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => go({ name: 'studio', section: 'clips' })}
          >
            <span>Open clips</span>
            <ArrowRight size={13} aria-hidden />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {clipsRes.loading && !clipsRes.data ? (
            <>
              <Skeleton className="h-[54px]" />
              <Skeleton className="h-[54px]" />
              <Skeleton className="h-[54px]" />
            </>
          ) : recentClips.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-dashed border-line bg-surface-2/40 px-3 py-2 text-[12.5px] text-text-2 lg:col-span-3">
              <span className="flex items-center gap-2">
                <FilmSlate size={16} aria-hidden />
                <span>No recordings yet. Saved streams and replay clips will appear here.</span>
              </span>
            </div>
          ) : (
            recentClips.map((clip) => (
              <RecentClipCard
                key={clip.id}
                clip={clip}
                api={clips}
                now={now}
                onOpen={() => go({ name: 'studio', section: 'clips' })}
              />
            ))
          )}
        </div>
      </section>

      <Dialog
        compact
        open={managingPlatforms}
        onClose={() => setManagingPlatforms(false)}
        size="lg"
        title="Your platforms"
      >
        {view && managingPlatforms && <Platforms view={view} onSaved={res.reload} canvas="main" />}
      </Dialog>

      <PlanDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSaved={() => {
          setPlanOpen(false)
          plansRes.reload()
        }}
      />

      <Dialog
        compact
        open={allPlansOpen}
        onClose={() => setAllPlansOpen(false)}
        size="md"
        title="Planned streams"
      >
        <ul className="m-0 flex list-none flex-col gap-2.5 p-1">
          {plans.map((p) => (
            <Plan
              key={p.id}
              s={p}
              now={now}
              busy={busy === `del:${p.id}`}
              onDelete={() => removePlan(p.id)}
            />
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function CompactPlanRow({
  plan,
  totalCount,
  now,
  busy,
  onOpenAll,
  onDelete,
}: {
  plan: ScheduledStream
  totalCount: number
  now: number
  busy: boolean
  onOpenAll: () => void
  onDelete: () => void
}) {
  const [asking, setAsking] = useState(false)
  const made = plan.broadcasts.some((b) => b.id)
  return (
    <div className="flex items-start justify-between gap-2 rounded-control border border-line bg-surface-2/50 px-2.5 py-1.5">
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Remove ${plan.info.title ?? 'this plan'}?`}
        description="The broadcast already made on a platform stays there. Delete it on that platform too."
        confirm="Remove"
        onConfirm={() => {
          setAsking(false)
          onDelete()
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px] font-semibold text-text">
          {plan.info.title || 'Scheduled stream'}
        </p>
        <p className="m-0 truncate text-[12px] text-text-2">
          {WHEN.format(plan.start_ms)} · {planTimingSummary(plan, now)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {totalCount > 1 && (
          <Button size="xs" variant="ghost" onClick={onOpenAll}>
            +{totalCount - 1}
          </Button>
        )}
        <IconButton
          size="xs"
          label={`Remove ${plan.info.title ?? 'plan'}`}
          disabled={busy}
          onClick={() => (made ? setAsking(true) : onDelete())}
        >
          <Trash size={14} aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}

function RecentClipCard({
  clip,
  api,
  now,
  onOpen,
}: {
  clip: Clip
  api: ReturnType<typeof clipsApi>
  now: number
  onOpen: () => void
}) {
  const thumb = useThumb(api, clip, true)
  const ago = relativeTime(clip.modified, now)
  const whenText = ago === 'now' ? 'Just now' : `${ago} ago`
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fc-press flex min-w-0 items-center gap-2.5 rounded-control border border-line bg-surface-2/45 p-1.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
    >
      <span className="block w-[84px] shrink-0 overflow-hidden rounded-[7px]">
        <Thumb state={thumb} vertical={clip.kind === 'vertical'} className="rounded-[7px]!" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text">{clip.name}</span>
        <span className="mt-0.5 block truncate text-[12px] text-text-2">
          {KIND_LABEL[clip.kind]} · {clipSize(clip.size)} · {whenText}
        </span>
      </span>
    </button>
  )
}
