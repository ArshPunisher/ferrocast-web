// Auto-Configuration Wizard with real encoder stress benchmark, upload integration, and
// snapshot-backed rollback (30 s Keep/Undo timeout + first-minute dropped/lagged protection).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  Broadcast,
  CheckCircle,
  Cpu,
  Gauge,
  Lightning,
  Record,
  Sparkle,
  Timer,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  describeError,
  type AutoConfigAppliedSummary,
  type AutoConfigCandidate,
  type AutoConfigMode,
  type AutoConfigState,
  type LimitedBy,
  type StudioSettings,
} from '@ferrocast/api'
import { Badge, Button, Dialog, Input, cx, toast } from '@ferrocast/ui'
import { useGoLive } from '../golive'
import { useDeskOptional } from './common'
import { useLive } from '../../../lib/store'
import { hardwareEncoderName } from '../../../lib/os'

export interface Recommendation {
  video_kbps: number
  /** Sent smaller than the canvas, or null for the canvas's own size. */
  scale: [number, number] | null
  fps: number
  /** In words, for the summary. */
  why: string
}

/** The highest bitrate each platform takes (Kbps). */
const CAPS: Record<string, number> = { twitch: 6000, kick: 8000, youtube: 12000 }
const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  custom: 'Custom',
}
function formatPlatformList(kinds: string[]): string {
  return kinds.map((k) => PLATFORM_LABELS[k] ?? k).join(', ')
}

/** What to stream at, from the upload, the platforms on, how smooth, and the canvas. */
export function recommend(o: {
  upload_kbps: number
  /** Ids of the platforms switched on ("twitch", "youtube", "kick", or a server's). */
  platforms: string[]
  fps: 30 | 60
  canvas: [number, number]
}): Recommendation {
  const n = Math.max(1, o.platforms.length)
  // A quarter kept free: uploads vary, and chat, alerts and the rest share it.
  const share = (o.upload_kbps * 0.75) / n
  const cap = Math.min(12000, ...o.platforms.map((p) => CAPS[p] ?? 12000))
  const kbps = Math.max(1500, Math.min(cap, Math.floor(share / 500) * 500))
  let fps: number = o.fps
  let height: number
  if (fps === 60) {
    if (kbps >= 6000) height = 1080
    else if (kbps >= 3500) height = 720
    else {
      // Too little for 60: smoother at 30 than blocky at 60.
      fps = 30
      height = kbps >= 2500 ? 720 : 480
    }
  } else height = kbps >= 4500 ? 1080 : kbps >= 2500 ? 720 : 480
  const [cw, ch] = o.canvas
  const scale: [number, number] | null =
    height < ch ? [Math.round((cw * height) / ch / 2) * 2, height] : null
  const split = n > 1 ? ` shared by ${n} platforms` : ''
  // When the upload forced a step down, say what would help.
  const tight = fps < o.fps || kbps < 2500 ? ' Your upload is tight: a wired connection helps.' : ''
  return {
    video_kbps: kbps,
    scale,
    fps,
    why: `${(o.upload_kbps / 1000).toFixed(1)} Mbps upload${split}.${tight}`,
  }
}

export function AutoConfigDialog({
  open,
  onClose,
  s,
  onApply,
  onSynced,
}: {
  open: boolean
  onClose: () => void
  s: StudioSettings
  onApply: (patch: Partial<StudioSettings>) => void
  /** Called with refreshed settings after engine-managed apply or rollback so parent state stays synced. */
  onSynced?: (next: StudioSettings) => void
}) {
  return (
    <Dialog compact open={open} onClose={onClose} title="Set up for me" size="lg">
      {open && (
        <Wizard s={s} onApply={onApply} {...(onSynced ? { onSynced } : {})} onClose={onClose} />
      )}
    </Dialog>
  )
}

function Big({
  on,
  icon: Icon,
  title,
  note,
  tone,
  onPick,
}: {
  on: boolean
  icon: typeof Broadcast
  title: string
  note: string
  tone: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      onClick={onPick}
      onKeyDown={(e) => {
        if (
          e.key !== 'ArrowLeft' &&
          e.key !== 'ArrowRight' &&
          e.key !== 'ArrowUp' &&
          e.key !== 'ArrowDown'
        )
          return
        e.preventDefault()
        const radios = Array.from(
          e.currentTarget
            .closest('[role="radiogroup"]')
            ?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        )
        const idx = radios.indexOf(e.currentTarget)
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
        const next = radios[(idx + step + radios.length) % radios.length]
        next?.focus()
        next?.click()
      }}
      className={cx(
        'fc-press flex flex-col gap-1.5 rounded-panel border px-4 py-3 text-left transition-colors',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        on ? 'fc-picked border-transparent' : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-[7px] text-white"
          style={
            on
              ? { background: 'color-mix(in srgb, var(--fc-on-pick) 18%, transparent)' }
              : { background: tone }
          }
        >
          <Icon size={15} weight="fill" aria-hidden />
        </span>
        <b className={cx('font-display text-[14.5px]', on ? 'text-inherit' : 'text-text')}>
          {title}
        </b>
      </span>
      <span className={cx('text-[13px] leading-snug', on ? 'opacity-90' : 'text-text-2')}>
        {note}
      </span>
    </button>
  )
}

function formatSummaryLine(a: AutoConfigAppliedSummary): string {
  const res = a.scale ? `${a.scale[0]}×${a.scale[1]}` : 'Canvas size'
  return `${a.label} · ${res} · ${a.fps} fps · ${(a.video_kbps / 1000).toFixed(1)} Mbps`
}

function phaseText(p: AutoConfigState['phase']): string {
  switch (p) {
    case 'upload':
      return 'Step 1 of 2: Upload bandwidth test'
    case 'discovering':
      return 'Step 2 of 2: Probing encoders'
    case 'encoding':
      return 'Step 2 of 2: Encoder stress benchmark'
    case 'picking':
      return 'Finishing recommendation'
    default:
      return 'Testing'
  }
}

function limitedLabel(l: LimitedBy): { text: string; tone: 'neutral' | 'warn' | 'ok' | 'accent' } {
  switch (l) {
    case 'headroom':
      return { text: 'Encoder headroom', tone: 'warn' }
    case 'upload':
      return { text: 'Upload bandwidth', tone: 'warn' }
    case 'platform_cap':
      return { text: 'Platform cap', tone: 'accent' }
    case 'balanced':
      return { text: 'Full headroom', tone: 'ok' }
  }
}

function CandidateList({ candidates }: { candidates: AutoConfigCandidate[] }) {
  if (candidates.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 text-[13px] font-bold tracking-wide text-text-2 uppercase">
          What was tested ({candidates.length})
        </h4>
        <span className="text-[12px] text-text-3">Hardware encoders tested before x264</span>
      </div>

      {/* Mobile card stack (< 640px) avoids cramped horizontal scroll at 375px */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label="Tested encoder candidates">
        {candidates.map((c, idx) => (
          <li
            key={`${c.encoder_backend}-${c.preset ?? ''}-${c.height}-${c.fps}-${idx}`}
            className="flex flex-col gap-1.5 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-[13px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-text">{c.label}</span>
              <Badge tone={c.passed ? 'ok' : 'danger'}>
                {c.passed ? `${c.headroom_pct.toFixed(0)}% headroom` : 'Too slow'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px] text-text-2 tabular-nums">
              <span>
                {c.width}×{c.height} · {c.fps} fps
              </span>
              <span>
                {c.encode_ms_avg.toFixed(1)} ms avg / {c.budget_ms.toFixed(1)} ms
              </span>
              <span>
                {c.skipped_frames} skip · {c.lagged_frames} lag
              </span>
              <span>
                CPU {c.cpu_pct !== null ? `${c.cpu_pct.toFixed(0)}%` : '-'} · GPU{' '}
                {c.gpu_pct !== null ? `${c.gpu_pct.toFixed(0)}%` : '-'}
              </span>
            </div>
            <p className="m-0 text-[12.5px] text-text-3">{c.reason}</p>
          </li>
        ))}
      </ul>

      {/* Desktop tabular comparison (>= 640px) */}
      <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface-1 sm:block">
        <table
          aria-label="Tested encoder candidates table"
          className="w-full border-collapse text-left text-[12px]"
        >
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11px] font-bold tracking-wide text-text-3 uppercase">
              <th className="py-2 pr-2 pl-3">Encoder</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Encode</th>
              <th className="px-2 py-2">Drops</th>
              <th className="px-2 py-2">Load</th>
              <th className="py-2 pr-3 pl-2 text-right">Headroom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {candidates.map((c, idx) => (
              <tr
                key={`${c.encoder_backend}-${c.preset ?? ''}-${c.height}-${c.fps}-${idx}`}
                className="align-top"
              >
                <td className="py-2 pr-2 pl-3">
                  <div className="flex flex-wrap items-center gap-1 font-semibold text-text">
                    <span>{c.label}</span>
                    <Badge tone={c.hardware ? 'accent' : 'neutral'}>
                      {c.hardware ? 'HW' : 'SW'}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-text-3">{c.reason}</div>
                </td>
                <td className="px-2 py-2 font-mono text-[12px] text-text-2 whitespace-nowrap tabular-nums">
                  <div>
                    {c.width}×{c.height}
                  </div>
                  <div className="text-[11px] text-text-3">{c.fps} fps</div>
                </td>
                <td className="px-2 py-2 font-mono text-[12px] text-text whitespace-nowrap tabular-nums">
                  <div>{c.encode_ms_avg.toFixed(1)} ms</div>
                  <div className="text-[11px] text-text-3">
                    p95 {c.encode_ms_p95.toFixed(1)} (/{c.budget_ms.toFixed(1)})
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-[12px] whitespace-nowrap tabular-nums">
                  <div
                    className={
                      c.skipped_frames + c.lagged_frames > 0
                        ? 'font-semibold text-danger'
                        : 'text-text-2'
                    }
                  >
                    {c.skipped_frames} skip
                  </div>
                  <div className="text-[11px] text-text-3">{c.lagged_frames} lag</div>
                </td>
                <td className="px-2 py-2 font-mono text-[12px] text-text-2 whitespace-nowrap tabular-nums">
                  <div>{c.cpu_pct !== null ? `${c.cpu_pct.toFixed(0)}% CPU` : '- CPU'}</div>
                  <div className="text-[11px] text-text-3">
                    {c.gpu_pct !== null ? `${c.gpu_pct.toFixed(0)}% GPU` : 'GPU -'}
                  </div>
                </td>
                <td className="py-2 pr-3 pl-2 text-right whitespace-nowrap">
                  <Badge tone={c.passed ? 'ok' : 'danger'}>
                    {c.passed ? `${c.headroom_pct.toFixed(0)}% free` : 'Failed'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function emptyIdleState(mode: AutoConfigMode = 'stream'): AutoConfigState {
  return {
    state: 'idle',
    job_id: null,
    mode,
    phase: null,
    progress_pct: 0,
    current_label: null,
    elapsed_ms: 0,
    estimated_total_ms: 0,
    candidates: [],
    upload_check: null,
    upload_error: null,
    picked: null,
    duration_ms: null,
    error: null,
    applied: null,
    confirmed: false,
    confirm_remaining_s: 0,
    watch_remaining_s: 0,
    first_minute_drops: 0,
    first_minute_lags: 0,
    rollback_trigger: null,
    rollback_reason: null,
    restored: null,
  }
}

function Wizard({
  s,
  onApply,
  onSynced,
  onClose,
}: {
  s: StudioSettings
  onApply: (patch: Partial<StudioSettings>) => void
  onSynced?: (next: StudioSettings) => void
  onClose: () => void
}) {
  const desk = useDeskOptional()
  const golive = useGoLive()
  const liveAutoConfig = useLive((l) => l.studio.autoConfig)

  const [use, setUse] = useState<AutoConfigMode>('stream')
  const [fps, setFps] = useState<30 | 60>(s.fps >= 50 ? 60 : 30)
  const [bench, setBench] = useState<AutoConfigState | null>(null)
  const [forceSetup, setForceSetup] = useState(false)
  const [requestError, setRequestError] = useState<{
    message: string
    hint?: string | null
  } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [kbpsOverride, setKbpsOverride] = useState<string>('')
  const prevStateRef = useRef<AutoConfigState['state'] | null>(null)

  const hasAutoConfigApi = typeof desk?.api.autoConfig === 'function'

  const syncSettingsFromEngine = useCallback(async () => {
    if (!desk?.api.studioSettings) return
    try {
      const latest = await desk.api.studioSettings()
      desk.prefs.set(latest)
      onSynced?.(latest)
    } catch {
      desk.prefs.reload()
    }
  }, [desk, onSynced])

  const loadState = useCallback(async () => {
    if (!hasAutoConfigApi || !desk) {
      setBench(emptyIdleState(use))
      return
    }
    try {
      const st = await desk.api.autoConfig()
      setBench(st)
      if (st.state === 'running' || st.state === 'applied') setForceSetup(false)
    } catch (e) {
      const d = describeError(e)
      setRequestError(d)
    }
  }, [hasAutoConfigApi, desk, use])

  useEffect(() => {
    void loadState()
  }, [loadState])

  useEffect(() => {
    if (!liveAutoConfig) return
    setBench(liveAutoConfig)
    if (liveAutoConfig.state === 'running' || liveAutoConfig.state === 'applied') {
      setForceSetup(false)
    }
  }, [liveAutoConfig])

  // Sync kbps editor when a new recommendation arrives.
  const pickedKbps = bench?.picked?.video_kbps
  useEffect(() => {
    if (pickedKbps !== undefined) setKbpsOverride(String(pickedKbps))
  }, [pickedKbps])

  // Poll while running or applied (also triggers settings sync if background auto-rollback fired).
  const activeState = bench?.state
  useEffect(() => {
    if (!hasAutoConfigApi || !desk) return
    if (activeState !== 'running' && activeState !== 'applied') return
    const ms = activeState === 'running' ? 250 : 500
    const id = setInterval(() => {
      void desk.api
        .autoConfig()
        .then((next) => {
          setBench(next)
          if (next.state === 'rolled_back') void syncSettingsFromEngine()
        })
        .catch(() => undefined)
    }, ms)
    return () => clearInterval(id)
  }, [hasAutoConfigApi, desk, activeState, syncSettingsFromEngine])

  useEffect(() => {
    const prev = prevStateRef.current
    const cur = bench?.state ?? null
    prevStateRef.current = cur
    if (prev && prev !== cur && (cur === 'rolled_back' || (prev === 'applied' && cur === 'done'))) {
      void syncSettingsFromEngine()
    }
  }, [bench?.state, syncSettingsFromEngine])

  const viewState: AutoConfigState = forceSetup
    ? emptyIdleState(use)
    : (bench ?? emptyIdleState(use))

  const liveDestinations = useLive(
    (l) => l.studio.golive?.destinations ?? l.goliveView?.destinations ?? null,
  )
  const [fetchedPlatforms, setFetchedPlatforms] = useState<string[] | null>(null)
  useEffect(() => {
    if (liveDestinations) return
    let dead = false
    golive
      .view()
      .then((v) => {
        if (dead) return
        setFetchedPlatforms(
          v.destinations.filter((d) => d.enabled && d.canvas === 'main').map((d) => d.kind),
        )
      })
      .catch(() => undefined)
    return () => {
      dead = true
    }
  }, [golive, liveDestinations])

  const platforms = useMemo(
    () =>
      liveDestinations
        ? liveDestinations.filter((d) => d.enabled && d.canvas === 'main').map((d) => d.kind)
        : (fetchedPlatforms ?? []),
    [liveDestinations, fetchedPlatforms],
  )

  const startBenchmark = async () => {
    setRequestError(null)
    setForceSetup(false)
    if (!hasAutoConfigApi || !desk) {
      // Legacy fallback when opened in an isolated mock test without engine auto-config API.
      setBusyAction('run')
      try {
        const up = await golive.uploadCheck()
        const r = recommend({
          upload_kbps: up.verdict.upload_kbps,
          platforms,
          fps,
          canvas: [s.width, s.height],
        })
        onApply({ video_kbps: r.video_kbps, scale: r.scale, fps: r.fps, encoder: 'hardware' })
        onClose()
      } catch (e) {
        setRequestError(describeError(e))
      } finally {
        setBusyAction(null)
      }
      return
    }
    setBusyAction('run')
    try {
      const next = await desk.api.startAutoConfigBenchmark({
        mode: use,
        fps_preference: fps,
        include_upload: use === 'stream',
      })
      setBench(next)
    } catch (e) {
      const d = describeError(e)
      setRequestError(d)
      setBench({ ...emptyIdleState(use), state: 'failed', mode: use, error: d.message })
    } finally {
      setBusyAction(null)
    }
  }

  const cancelBenchmark = async () => {
    if (!desk?.api.cancelAutoConfigBenchmark) return
    setBusyAction('cancel')
    try {
      const next = await desk.api.cancelAutoConfigBenchmark()
      setBench(next)
      setForceSetup(true)
    } catch (e) {
      setRequestError(describeError(e))
    } finally {
      setBusyAction(null)
    }
  }

  const applyRecommended = async () => {
    if (!desk?.api.applyAutoConfig || !viewState.picked) return
    const parsedKbps = Number(kbpsOverride)
    const videoKbps =
      Number.isFinite(parsedKbps) && parsedKbps >= 500 && parsedKbps <= 60000
        ? Math.round(parsedKbps)
        : viewState.picked.video_kbps
    setBusyAction('apply')
    setRequestError(null)
    try {
      const next = await desk.api.applyAutoConfig({
        encoder: viewState.picked.encoder,
        video_encoder: viewState.picked.video_encoder,
        encoder_settings: viewState.picked.encoder_settings,
        scale: viewState.picked.scale,
        fps: viewState.picked.fps,
        video_kbps: videoKbps,
        label: viewState.picked.label,
      })
      setBench(next)
      await syncSettingsFromEngine()
      if (!onSynced) {
        onApply({
          encoder: viewState.picked.encoder,
          video_encoder: viewState.picked.video_encoder,
          encoder_settings: viewState.picked.encoder_settings,
          scale: viewState.picked.scale,
          fps: viewState.picked.fps,
          video_kbps: videoKbps,
        })
      }
    } catch (e) {
      setRequestError(describeError(e))
    } finally {
      setBusyAction(null)
    }
  }

  const keepApplied = async () => {
    if (!desk?.api.keepAutoConfig) return
    setBusyAction('keep')
    try {
      const next = await desk.api.keepAutoConfig()
      setBench(next)
      toast({ tone: 'ok', message: 'Settings kept. First-minute protection stays on.' })
    } catch (e) {
      setRequestError(describeError(e))
    } finally {
      setBusyAction(null)
    }
  }

  const undoApplied = async () => {
    if (!desk?.api.undoAutoConfig) return
    setBusyAction('undo')
    try {
      const next = await desk.api.undoAutoConfig()
      setBench(next)
      await syncSettingsFromEngine()
    } catch (e) {
      setRequestError(describeError(e))
    } finally {
      setBusyAction(null)
    }
  }

  // 1. RUNNING STATE
  if (viewState.state === 'running') {
    const pct = Math.max(2, Math.min(100, viewState.progress_pct))
    const secs = (viewState.elapsed_ms / 1000).toFixed(1)
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[14px] font-bold text-text">
              <span className="fc-busy text-accent" aria-hidden />
              {phaseText(viewState.phase)}
            </span>
            <span className="font-mono text-[13px] font-semibold text-text-2 tabular-nums">
              {pct}% · {secs} s
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Benchmark progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-btn-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="m-0 text-[13px] text-text-2">
            {viewState.current_label ?? 'Encoding synthetic canvas load…'}
          </p>
          <p className="m-0 text-[12px] text-text-3">
            Takes about 20 to 30 seconds. Hardware encoders run first, then x264 presets. Nothing
            goes live to viewers.
          </p>
        </div>

        <CandidateList candidates={viewState.candidates} />

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            busy={busyAction === 'cancel'}
            onClick={() => void cancelBenchmark()}
          >
            Cancel test
          </Button>
        </div>
      </div>
    )
  }

  // 2. FAILED STATE
  if (viewState.state === 'failed') {
    const errText = viewState.error ?? requestError?.message ?? "The benchmark couldn't finish."
    const hint = requestError?.hint
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-panel border border-danger/40 bg-danger-soft px-4 py-3 text-[13.5px] text-text"
        >
          <WarningCircle
            size={20}
            weight="fill"
            className="mt-0.5 shrink-0 text-danger"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <b className="font-semibold text-text">{errText}</b>
            {hint && <span className="text-[13px] text-text-2">{hint}</span>}
          </div>
        </div>
        <CandidateList candidates={viewState.candidates} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setRequestError(null)
              setForceSetup(true)
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            busy={busyAction === 'run'}
            onClick={() => void startBenchmark()}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  // 3. APPLIED STATE (Keep / Undo + 30s countdown + 1st-min drop protection)
  if (viewState.state === 'applied' && viewState.applied) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div
          role="status"
          className={cx(
            'flex flex-col gap-2.5 rounded-panel border px-4 py-3.5',
            viewState.confirmed ? 'border-ok/50 bg-surface-2' : 'border-accent-line bg-surface-2',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-[15px] font-bold text-text">
              {viewState.confirmed ? (
                <CheckCircle size={20} weight="fill" className="text-ok" aria-hidden />
              ) : (
                <Timer size={20} weight="fill" className="text-accent-text" aria-hidden />
              )}
              {viewState.confirmed ? 'New settings kept' : 'Settings applied. Keep these changes?'}
            </span>
            {!viewState.confirmed ? (
              <Badge tone="warn" className="font-mono tabular-nums">
                Auto-undo in {viewState.confirm_remaining_s} s
              </Badge>
            ) : (
              <Badge tone="ok" className="font-mono tabular-nums">
                1st-min guard: {viewState.watch_remaining_s} s left
              </Badge>
            )}
          </div>

          <p className="m-0 font-mono text-[13px] font-semibold text-text tabular-nums">
            {formatSummaryLine(viewState.applied)}
          </p>

          <p className="m-0 text-[13px] text-text-2">
            {viewState.confirmed
              ? `Ferrocast is watching the first minute for dropped or lagged frames (${viewState.first_minute_drops} dropped, ${viewState.first_minute_lags} lagged so far).`
              : `Click Keep within ${viewState.confirm_remaining_s} s, or Ferrocast automatically restores your previous settings. First-minute protection (${viewState.watch_remaining_s} s) also reverts if frames drop or lag.`}
          </p>
        </div>

        {requestError && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {requestError.message}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="danger-ghost"
            icon={<ArrowCounterClockwise size={16} aria-hidden />}
            busy={busyAction === 'undo'}
            onClick={() => void undoApplied()}
          >
            Undo
          </Button>
          {!viewState.confirmed ? (
            <Button
              variant="primary"
              busy={busyAction === 'keep'}
              onClick={() => void keepApplied()}
            >
              Keep
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    )
  }

  // 4. ROLLED BACK STATE
  if (viewState.state === 'rolled_back') {
    const title =
      viewState.rollback_trigger === 'timeout'
        ? 'Rolled back automatically after 30 s'
        : viewState.rollback_trigger === 'dropped_frames'
          ? 'Rolled back automatically after dropped frames'
          : 'Restored your previous settings'
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-panel border border-warn/40 bg-warn-soft px-4 py-3.5"
        >
          <ArrowCounterClockwise
            size={20}
            weight="bold"
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <b className="font-display text-[15px] text-text">{title}</b>
            <p className="m-0 text-[13.5px] text-text-2">
              {viewState.rollback_reason ?? 'Previous Studio encoder settings are active again.'}
            </p>
            {viewState.restored && (
              <p className="m-0 mt-1 font-mono text-[12.5px] text-text tabular-nums">
                Active now: {formatSummaryLine(viewState.restored)}
              </p>
            )}
          </div>
        </div>

        <CandidateList candidates={viewState.candidates} />

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => setForceSetup(true)}>
            Run benchmark again
          </Button>
        </div>
      </div>
    )
  }

  // 5. DONE STATE (Honest Results UI + Apply)
  if (viewState.state === 'done' && viewState.picked) {
    const picked = viewState.picked
    const lim = limitedLabel(picked.limited_by)
    const uploadMbps = viewState.upload_check
      ? (viewState.upload_check.verdict.upload_kbps / 1000).toFixed(1)
      : null
    const testedDurationS = viewState.duration_ms ? (viewState.duration_ms / 1000).toFixed(1) : null
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col gap-2.5 rounded-panel border border-accent-line bg-surface-2 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkle size={18} weight="fill" className="text-accent-text" aria-hidden />
              <span className="font-display text-[15px] font-bold text-text">
                Recommended: {picked.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={picked.headroom_pct >= 28 ? 'ok' : 'warn'}>
                {picked.headroom_pct.toFixed(0)}% headroom
              </Badge>
              <Badge tone={lim.tone}>{lim.text}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-control border border-line bg-surface-1 px-3 py-2.5 sm:grid-cols-3">
            <div>
              <div className="text-[11.5px] font-semibold text-text-3 uppercase">Output</div>
              <div className="font-mono text-[14px] font-bold text-text tabular-nums">
                {picked.width}×{picked.height} · {picked.fps} fps
              </div>
              <div className="text-[12px] text-text-3">
                {picked.scale ? 'Scaled from canvas' : 'Native canvas size'}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-text-3 uppercase">Encoder</div>
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-text">
                <Cpu size={15} aria-hidden />
                <span>{picked.label}</span>
              </div>
              <div className="text-[12px] text-text-3">
                {picked.encoder === 'hardware' ? 'Hardware encoder' : 'Software x264'}
              </div>
            </div>
            <div>
              <label
                htmlFor="auto-config-kbps"
                className="block text-[11.5px] font-semibold text-text-3 uppercase"
              >
                Bitrate (Kbps)
              </label>
              <Input
                id="auto-config-kbps"
                aria-label="Bitrate (Kbps)"
                type="number"
                min={500}
                max={60000}
                step={250}
                value={kbpsOverride}
                onChange={(e) => setKbpsOverride(e.target.value)}
                className="mt-0.5 h-8 font-mono text-[13.5px] tabular-nums"
              />
            </div>
          </div>

          <p className="m-0 text-[13.5px] leading-snug text-text-2">{picked.why}</p>
          {(uploadMbps || testedDurationS) && (
            <p className="m-0 text-[12px] text-text-3 tabular-nums">
              {uploadMbps ? `Upload measured: ${uploadMbps} Mbps` : 'Local recording target'}
              {uploadMbps && testedDurationS ? ' · ' : ''}
              {testedDurationS ? `Benchmark finished in ${testedDurationS} s` : ''}
            </p>
          )}
        </div>

        <CandidateList candidates={viewState.candidates} />

        {requestError && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {requestError.message}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-text-3">
            Apply snapshots your old settings and protects the first minute automatically.
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setForceSetup(true)}>
              Run again
            </Button>
            <Button
              variant="primary"
              busy={busyAction === 'apply'}
              onClick={() => void applyRecommended()}
            >
              Apply settings
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // 6. IDLE STATE (Setup choices)
  return (
    <div className="flex flex-col gap-5 pt-1">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-text-2">
          What will you use Ferrocast for?
        </span>
        <div role="radiogroup" aria-label="Use" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Big
            on={use === 'stream'}
            icon={Broadcast}
            title="Streaming"
            note={`Tests upload speed and stresses ${hardwareEncoderName()} vs x264 to balance quality and platform limits.`}
            tone="var(--fc-accent)"
            onPick={() => setUse('stream')}
          />
          <Big
            on={use === 'record'}
            icon={Record}
            title="Recording"
            note="Stresses available encoders at canvas load to pick the highest quality without dropped frames."
            tone="#ef4444"
            onPick={() => setUse('record')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-text-2">Frame rate target</span>
        <div
          role="radiogroup"
          aria-label="Smoothness"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          <Big
            on={fps === 60}
            icon={Lightning}
            title="Smooth motion (60 fps)"
            note="Preferred for fast games and desktop capture."
            tone="var(--fc-arc)"
            onPick={() => setFps(60)}
          />
          <Big
            on={fps === 30}
            icon={Timer}
            title="Sharp detail (30 fps)"
            note="Leaves extra headroom for slower systems or lower upload."
            tone="#64748b"
            onPick={() => setFps(30)}
          />
        </div>
      </div>

      {use === 'stream' && (
        <p className="m-0 rounded-control border border-line bg-surface-2 px-3 py-2 text-[13px] text-text-2">
          {platforms.length > 0
            ? `Tests upload for ${formatPlatformList(platforms)} alongside an encoder stress benchmark (about 20 to 30 s). Nothing goes live.`
            : 'Turn on platforms in Go live first if you want platform bitrate limits included. Tests run safely offline too.'}
        </p>
      )}

      {requestError && (
        <div
          role="alert"
          className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-text"
        >
          <div>{requestError.message}</div>
          {requestError.hint && <div className="mt-0.5 text-text-2">{requestError.hint}</div>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          busy={busyAction === 'run'}
          onClick={() => void startBenchmark()}
          icon={<Gauge size={16} weight="bold" aria-hidden />}
        >
          Run benchmark
        </Button>
      </div>
    </div>
  )
}

/** Persistent non-blocking banner shown on Studio Desk during the 30 s Keep/Undo window and
 *  first-minute drop watch, or right after an automatic rollback. */
export function AutoConfigRollbackBar({
  onOpenWizard,
  onSynced,
}: {
  onOpenWizard?: () => void
  onSynced?: (next: StudioSettings) => void
}) {
  const desk = useDeskOptional()
  const liveAutoConfig = useLive((l) => l.studio.autoConfig)
  const [state, setState] = useState<AutoConfigState | null>(null)
  const [busy, setBusy] = useState<'keep' | 'undo' | null>(null)
  const [dismissedRollback, setDismissedRollback] = useState(false)
  const prevStateRef = useRef<AutoConfigState['state'] | null>(null)

  const refreshPrefs = useCallback(async () => {
    if (!desk) return
    try {
      const latest = await desk.api.studioSettings()
      desk.prefs.set(latest)
      onSynced?.(latest)
    } catch {
      desk.prefs.reload()
    }
  }, [desk, onSynced])

  useEffect(() => {
    if (!desk?.api.autoConfig) return
    void desk.api
      .autoConfig()
      .then((s) => setState(s))
      .catch(() => undefined)
  }, [desk])

  useEffect(() => {
    if (!liveAutoConfig) return
    setState(liveAutoConfig)
    if (liveAutoConfig.state === 'applied') setDismissedRollback(false)
  }, [liveAutoConfig])

  const stKind = state?.state
  useEffect(() => {
    if (!desk?.api.autoConfig || stKind !== 'applied') return
    const t = setInterval(() => {
      void desk.api
        .autoConfig()
        .then((next) => setState(next))
        .catch(() => undefined)
    }, 500)
    return () => clearInterval(t)
  }, [desk, stKind])

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = stKind ?? null
    if (prev === 'applied' && stKind === 'rolled_back') {
      setDismissedRollback(false)
      void refreshPrefs()
    }
  }, [stKind, refreshPrefs])

  if (!desk || !state) return null
  if (state.state === 'applied' && state.applied) {
    return (
      <div
        role="status"
        aria-label="Auto-config confirmation"
        className={cx(
          'flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-[13px]',
          state.confirmed
            ? 'border-ok/30 bg-ok-soft text-text'
            : 'border-accent-line bg-accent-soft text-text',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Timer size={16} weight="fill" className="shrink-0 text-accent-text" aria-hidden />
          <span className="font-semibold">
            {state.confirmed
              ? `Kept new encoder settings (${state.watch_remaining_s} s 1st-min drop guard active)`
              : `Testing new encoder settings: Keep within ${state.confirm_remaining_s} s or automatic undo`}
          </span>
          <span className="font-mono text-[12px] text-text-2 tabular-nums">
            {formatSummaryLine(state.applied)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenWizard && (
            <Button size="xs" variant="ghost" onClick={onOpenWizard}>
              Details
            </Button>
          )}
          <Button
            size="xs"
            variant="outline"
            busy={busy === 'undo'}
            onClick={async () => {
              setBusy('undo')
              try {
                const next = await desk.api.undoAutoConfig()
                setState(next)
                await refreshPrefs()
              } catch (e) {
                toast({ tone: 'error', message: describeError(e).message })
              } finally {
                setBusy(null)
              }
            }}
          >
            Undo
          </Button>
          {!state.confirmed && (
            <Button
              size="xs"
              variant="primary"
              busy={busy === 'keep'}
              onClick={async () => {
                setBusy('keep')
                try {
                  const next = await desk.api.keepAutoConfig()
                  setState(next)
                } catch (e) {
                  toast({ tone: 'error', message: describeError(e).message })
                } finally {
                  setBusy(null)
                }
              }}
            >
              Keep
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (
    state.state === 'rolled_back' &&
    !dismissedRollback &&
    state.rollback_trigger !== 'user_undo'
  ) {
    return (
      <div
        role="status"
        aria-label="Auto-config rollback notice"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-text"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ArrowCounterClockwise
            size={16}
            weight="bold"
            className="shrink-0 text-warn"
            aria-hidden
          />
          <span>{state.rollback_reason ?? 'Settings rolled back automatically.'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenWizard && (
            <Button size="xs" variant="outline" onClick={onOpenWizard}>
              View details
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setDismissedRollback(true)}>
            Dismiss
          </Button>
        </div>
      </div>
    )
  }

  return null
}
