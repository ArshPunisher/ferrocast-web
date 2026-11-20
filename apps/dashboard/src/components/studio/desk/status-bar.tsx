// The window's status bar, like OBS's: along the bottom of the app, beside the sidebar (which
// keeps the full height), on every page while the Studio runs. Messages on the left; on the
// right the stream and recording times, CPU, frame rate, dropped frames and upload. A click on
// those opens Stats.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  andList,
  describeError,
  goliveApi,
  healthText,
  onCanvas,
  studioEngineApi,
  type DestinationView,
  type EngineStats,
  type StudioSettings,
} from '@ferrocast/api'
import { cx, toast } from '@ferrocast/ui'
import { captureWords, doctorFix, lastingProblem, type Strain } from './doctor'
import { useClient } from '../../../lib/hooks'
import { useEngineReading } from '../../../lib/engine-stats'
import { useLive } from '../../../lib/store'
import { StatsDialog, clock, droppedText, streamTime } from './stats-panel'

/** Its height (px): the sidebar, the page and the Studio's layout leave room for it. */
export const STATUS_BAR_PX = 28

export interface EffectiveHealth {
  score: number
  tone: 'ok' | 'warn' | 'danger'
  reason?: string
  detail?: string
}

export interface EffectiveStreamStatus {
  live: boolean
  health: EffectiveHealth | null
  uploadKbps: number | null
  destNote: { text: string; tone: 'text-warn' | 'text-danger'; detail?: string } | null
  streamStateLabel: string | null
}

/**
 * Reconciles the Studio encoder's stats with Go live's actual destination states (U5).
 * When the encoder pushes frames to the local hub while every enabled destination is dead,
 * failed, or reconnecting, Health and Upload must not report "Health 100" / "13.5 Mbit/s".
 */
export function effectiveStreamStatus(
  stats: EngineStats,
  destinations: DestinationView[] | null,
  encoderKbps: number | null,
): EffectiveStreamStatus {
  const stream = stats.stream
  const rawLive = !!stream?.active && !stream.failed
  if (!rawLive) {
    return {
      live: false,
      health: null,
      uploadKbps: 0,
      destNote: null,
      streamStateLabel: stream?.failed ? 'Failed' : stream?.reconnecting ? 'Reconnecting' : null,
    }
  }
  const rawHealth = stats.health ?? null
  const rawScore = rawHealth?.score ?? 100
  const baseHealth: EffectiveHealth | null = rawHealth
    ? {
        score: rawHealth.score,
        tone: rawHealth.score < 50 ? 'danger' : rawHealth.score < 75 ? 'warn' : 'ok',
        ...(rawHealth.reason ? { reason: rawHealth.reason } : {}),
        ...(rawHealth.detail ? { detail: rawHealth.detail } : {}),
      }
    : null

  const main = destinations ? onCanvas(destinations, 'main') : []
  const liveBackups = new Set(
    main.filter((d) => d.backup_for && d.health?.state === 'live').map((d) => d.backup_for!),
  )
  const active = main.filter(
    (d) => (d.enabled && !d.standby_for && !liveBackups.has(d.name)) || !!d.backup_for,
  )
  const reported = active.filter(
    (d) =>
      d.blocked !== null ||
      (d.health !== null && d.health.state !== 'waiting' && d.health.state !== 'stopped'),
  )

  if (active.length > 0 && reported.length > 0) {
    const liveDests = reported.filter((d) => !d.blocked && d.health?.state === 'live')
    const failedDests = reported.filter((d) => d.health?.state === 'failed')
    const blockedDests = reported.filter((d) => d.blocked !== null && d.health?.state !== 'failed')
    const reconnectingDests = reported.filter(
      (d) => !d.blocked && d.health?.state === 'reconnecting',
    )
    const pausedDests = reported.filter((d) => !d.blocked && d.health?.state === 'paused')

    if (liveDests.length === 0) {
      if (failedDests.length > 0) {
        const first = failedDests[0]!
        const ht = healthText(first.health, first.blocked, first.kind)
        const text =
          failedDests.length === 1
            ? `${first.name}: ${ht.label}`
            : 'No platform is receiving the stream.'
        const detail = ht.detail ?? undefined
        return {
          live: true,
          health: { score: 0, tone: 'danger', reason: text, ...(detail ? { detail } : {}) },
          uploadKbps: 0,
          destNote: { text, tone: 'text-danger', ...(detail ? { detail } : {}) },
          streamStateLabel: 'Failed',
        }
      }
      if (reconnectingDests.length > 0) {
        const names = andList(reconnectingDests.map((d) => d.name))
        const text = `Reconnecting to ${names}…`
        const first = reconnectingDests[0]!
        const detail = first.health?.state === 'reconnecting' ? first.health.reason : undefined
        return {
          live: true,
          health: { score: 0, tone: 'warn', reason: text, ...(detail ? { detail } : {}) },
          uploadKbps: 0,
          destNote: { text, tone: 'text-warn', ...(detail ? { detail } : {}) },
          streamStateLabel: 'Reconnecting',
        }
      }
      if (blockedDests.length > 0) {
        const first = blockedDests[0]!
        const text = `${first.name} can’t start.`
        const detail = first.blocked ?? undefined
        return {
          live: true,
          health: { score: 0, tone: 'danger', reason: text, ...(detail ? { detail } : {}) },
          uploadKbps: 0,
          destNote: { text, tone: 'text-danger', ...(detail ? { detail } : {}) },
          streamStateLabel: 'Blocked',
        }
      }
      if (pausedDests.length > 0) {
        const text = 'All platforms paused to save upload.'
        return {
          live: true,
          health: { score: Math.min(rawScore, 40), tone: 'danger', reason: text },
          uploadKbps: 0,
          destNote: { text, tone: 'text-danger' },
          streamStateLabel: 'Paused',
        }
      }
      // Initial handshake (`connecting`): don't show a false Health 100 or upload rate yet.
      return {
        live: true,
        health: null,
        uploadKbps: 0,
        destNote: null,
        streamStateLabel: 'Connecting',
      }
    }

    // At least one destination is live: sum live destinations' upload, and degrade Health if
    // another enabled destination failed or is reconnecting.
    const destKbps = liveDests.reduce((sum, d) => sum + (d.health?.kbps ?? 0), 0)
    const uploadKbps = destKbps > 0 ? destKbps : (encoderKbps ?? 0)
    const bad = [...failedDests, ...blockedDests]
    if (bad.length > 0) {
      const ratio = Math.round((liveDests.length / active.length) * 100)
      const score = Math.min(rawScore, Math.min(65, ratio))
      const text = `${andList(bad.map((d) => d.name))} failed.`
      const tone: 'warn' | 'danger' = score < 50 ? 'danger' : 'warn'
      return {
        live: true,
        health: { score, tone, reason: text },
        uploadKbps,
        destNote: { text, tone: tone === 'danger' ? 'text-danger' : 'text-warn' },
        streamStateLabel: null,
      }
    }
    if (reconnectingDests.length > 0) {
      const score = Math.min(rawScore, 70)
      const text = `Reconnecting to ${andList(reconnectingDests.map((d) => d.name))}…`
      return {
        live: true,
        health: { score, tone: 'warn', reason: text },
        uploadKbps,
        destNote: { text, tone: 'text-warn' },
        streamStateLabel: null,
      }
    }
    return {
      live: true,
      health: baseHealth,
      uploadKbps,
      destNote: null,
      streamStateLabel: null,
    }
  }

  if (stream?.reconnecting) {
    return {
      live: true,
      health: { score: 0, tone: 'warn', reason: 'Reconnecting…' },
      uploadKbps: 0,
      destNote: null,
      streamStateLabel: 'Reconnecting',
    }
  }
  return {
    live: true,
    health: baseHealth,
    uploadKbps: encoderKbps ?? 0,
    destNote: null,
    streamStateLabel: null,
  }
}

function Cell({
  label,
  children,
  tone,
}: {
  label: string
  children: React.ReactNode
  tone?: 'live' | 'warn' | 'danger' | undefined
}) {
  return (
    <span className="inline-flex h-full items-center gap-1.5 border-l border-line px-2.5 whitespace-nowrap">
      <span className={tone === 'live' ? 'font-bold text-danger' : 'text-text-3'}>{label}</span>
      <span
        className={cx(
          'font-mono font-semibold tabular-nums',
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-text',
        )}
      >
        {children}
      </span>
    </span>
  )
}

/** Counts from one read to the next: what went wrong in the last few seconds. */
type Counts = { lagged: number; skipped: number; dropped: number; at: number }

/**
 * Trouble while it happens, in words (OBS shows only the numbers): frames the computer drew
 * late (the game or the scenes are too heavy), frames the encoder skipped, frames the network
 * dropped. Shown for 10 s after it last happened.
 */
function useStrain(stats: EngineStats | null): { text: string; tone: string; what: Strain } | null {
  const last = useRef<Counts | null>(null)
  const [seen, setSeen] = useState<{ what: 'render' | 'encode' | 'network'; until: number } | null>(
    null,
  )
  useEffect(() => {
    if (!stats) {
      last.current = null
      return
    }
    const now = Date.now()
    const cur: Counts = {
      lagged: stats.engine.lagged,
      skipped: stats.engine.skipped ?? 0,
      dropped: stats.stream?.dropped ?? 0,
      at: now,
    }
    const prev = last.current
    last.current = cur
    if (!prev) return
    // A few missed frames now and then are normal; more than 1 in 30 a second isn't.
    const fps = stats.canvas.fps || 30
    const per = Math.max(1, (now - prev.at) / 1000)
    const bad = (d: number) => d / per > fps / 30
    // The upload: the Studio's own sender skipping, or most platforms behind at once (one
    // platform's own trouble shows in Go live, not here).
    const what =
      stats.stream?.upload_struggling ||
      (cur.dropped > prev.dropped && bad(cur.dropped - prev.dropped))
        ? 'network'
        : cur.skipped > prev.skipped && bad(cur.skipped - prev.skipped)
          ? 'encode'
          : cur.lagged > prev.lagged && bad(cur.lagged - prev.lagged)
            ? 'render'
            : null
    if (what) setSeen({ what, until: now + 10_000 })
  }, [stats])
  if (!seen || Date.now() > seen.until) return null
  const words = {
    render: {
      text: 'Your computer is falling behind: frames are late. Close heavy apps, lower the game’s settings, or press Optimize in Go live.',
      tone: 'text-warn',
    },
    encode: {
      text: 'The encoder is falling behind. Press Optimize in Go live: it picks the hardware encoder and a lighter bitrate.',
      tone: 'text-warn',
    },
    network: {
      text: 'Your upload can’t keep up: frames are dropped. Press Optimize in Go live, or use a wired connection.',
      tone: 'text-danger',
    },
  }[seen.what]
  return { ...words, what: seen.what }
}

/** The stream doctor's button beside a warning: the lightest change that helps, in one click. */
function FixButton({
  what,
  api,
  canvas,
  live,
  recording,
}: {
  what: Strain
  api: ReturnType<typeof studioEngineApi>
  canvas: { width: number; height: number }
  /** Streaming now (the stream on air takes a fix at once). */
  live: boolean
  recording: boolean
}) {
  const [settings, setSettings] = useState<StudioSettings | null>(null)
  const [busy, setBusy] = useState(false)
  // Done for this warning: the button goes until the next one.
  const [done, setDone] = useState(false)
  // The warning a fix's answer belongs to: a late answer for an earlier one changes nothing
  // here (CodeRabbit).
  const current = useRef(what)
  current.current = what
  useEffect(() => {
    let alive = true
    setDone(false)
    api
      .studioSettings()
      .then((v) => alive && setSettings(v))
      .catch(() => alive && setSettings(null))
    return () => {
      alive = false
    }
  }, [api, what])
  const fix = settings ? doctorFix(what, settings, canvas, live, recording) : null
  if (!fix || done) return null
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        const sentFor = what
        void api
          .setStudioSettings({ ...settings, ...fix.patch } as StudioSettings)
          .then((r) => {
            if (current.current === sentFor) {
              setDone(true)
              setSettings(r.settings)
            }
            toast(
              r.restart
                ? { tone: 'warn', message: fix.done, hint: r.restart, detail: r.restart_detail }
                : { tone: 'ok', message: fix.done },
            )
          })
          .catch((err: unknown) => {
            const d = describeError(err)
            toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
          })
          .finally(() => setBusy(false))
      }}
      className="my-1 shrink-0 rounded-[6px] bg-btn-soft px-2 text-[12px] font-bold text-molten-text hover:bg-btn-soft-hover focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:opacity-50"
    >
      {busy ? 'Fixing…' : fix.label}
    </button>
  )
}

export function StudioStatusBar() {
  const client = useClient()
  const api = useMemo(() => studioEngineApi(client), [client])
  const golive = useMemo(() => goliveApi(client), [client])
  const reading = useEngineReading(api.stats)
  const { stats, kbps } = reading
  const goliveFrame = useLive((s) => s.studio.golive)
  const goliveFrameAt = useLive((s) => s.goliveFrameAt)
  const goliveView = useLive((s) => s.goliveView)
  const goliveViewAt = useLive((s) => s.goliveViewAt)
  const destinations =
    goliveFrame && goliveFrameAt >= goliveViewAt
      ? goliveFrame.destinations
      : (goliveView?.destinations ?? goliveFrame?.destinations ?? null)
  const [open, setOpen] = useState(false)
  const on = !!stats
  const rawLive = !!stats?.stream?.active && !stats.stream.failed
  // Fallback poll only when live and neither the live socket nor GoLiveDock has refreshed Go live
  // destinations recently (e.g. viewing another page while the socket is blocked).
  useEffect(() => {
    if (!rawLive) return
    let alive = true
    const check = () => {
      if (!alive || document.hidden) return
      const st = useLive.getState()
      const freshAt = Math.max(st.goliveFrameAt, st.goliveViewAt)
      if (Date.now() - freshAt < 5500) return
      const askedAt = Date.now()
      void golive
        .view()
        .then((v) => {
          if (alive) useLive.getState().setGoLiveView(v, askedAt)
        })
        .catch(() => undefined)
    }
    const t = setInterval(check, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [rawLive, golive])
  const strain = useStrain(stats)
  // A capture on air that shows nothing, once it has for a few seconds.
  const seenCaptures = useRef(new Map<string, number>())
  const capture = stats
    ? lastingProblem(stats.captures ?? [], seenCaptures.current, Date.now())
    : null
  // The rest of the window leaves room for it while it shows.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fc-statusbar', on ? `${STATUS_BAR_PX}px` : '0px')
    return () => root.style.setProperty('--fc-statusbar', '0px')
  }, [on])
  if (!stats) return null
  const stream = stats.stream
  const rec = stats.record
  const eng = stats.engine
  const target = stats.canvas.fps || 30
  const effective = effectiveStreamStatus(stats, destinations, kbps)
  const live = effective.live
  const recording = !!rec?.active
  const slow = eng.fps > 0 && eng.fps < target * 0.95
  const dropped = stream?.dropped ?? 0
  const remux = stats.remux ?? null
  const health = effective.health
  const healthNote =
    effective.destNote ??
    (health && health.score < 75 && health.reason
      ? {
          text: `${health.score < 50 ? 'Stream health is poor' : 'Stream health is shaky'}: ${health.reason}.`,
          tone: health.score < 50 ? 'text-danger' : 'text-warn',
          // What to do about it, on hover: the bar keeps to one short line.
          ...(health.detail ? { detail: health.detail } : {}),
        }
      : null)
  const note = stream?.reconnecting
    ? { text: 'Reconnecting…', tone: 'text-warn' }
    : (stream?.error || stream?.failed) && (!stream.active || stream.failed)
      ? { text: stream.reason ?? stream.error ?? 'Stream stopped.', tone: 'text-danger' }
      : remux?.error
        ? { text: `The MP4 couldn't be made: ${remux.error}`, tone: 'text-danger' }
        : remux && !remux.done
          ? { text: `Making an MP4… ${Math.round(remux.percent)}%`, tone: 'text-text-2' }
          : rec?.paused
            ? { text: 'Recording paused', tone: 'text-warn' }
            : (strain ??
              (capture ? { text: captureWords(capture), tone: 'text-warn' } : healthNote))
  const shownUpload = effective.uploadKbps ?? 0
  const uploadTone =
    live && shownUpload === 0 && health && health.score === 0 && health.tone !== 'ok'
      ? health.tone
      : undefined
  return (
    <footer
      aria-label="Studio status"
      className="fixed right-0 bottom-0 left-[var(--fc-nav-w,15rem)] z-40 hidden items-stretch border-t border-line bg-surface-1 text-[12.5px] lg:flex"
      style={{ height: STATUS_BAR_PX }}
    >
      <span
        aria-live="polite"
        title={note && 'detail' in note && note.detail ? `${note.text} ${note.detail}` : note?.text}
        className={cx('flex min-w-0 flex-1 items-center truncate px-3 font-semibold', note?.tone)}
      >
        {note?.text}
      </span>
      {/* Only for the strain warnings (not reconnecting, errors or remuxing). */}
      {!strain && capture?.problem === 'permission' && note?.text === captureWords(capture) && (
        <button
          type="button"
          aria-label="Allow Ferrocast to record the screen"
          onClick={() =>
            void api
              .fixScreenAccess()
              .then(() =>
                toast({
                  tone: 'ok',
                  message: 'Turn Ferrocast on in the list macOS opened, then restart Ferrocast.',
                }),
              )
              .catch((err: unknown) => {
                const d = describeError(err)
                toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
              })
          }
          className="my-1 shrink-0 rounded-[6px] bg-btn-soft px-2 text-[12px] font-bold text-molten-text hover:bg-btn-soft-hover focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          Allow
        </button>
      )}
      {strain && note === strain && (
        <FixButton
          what={strain.what}
          api={api}
          canvas={stats.canvas}
          live={live}
          recording={recording}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open Stats"
        aria-label="Studio status: open Stats"
        className="flex h-full items-stretch transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-inset"
      >
        <Cell label={live ? 'LIVE' : 'Live'} tone={live ? 'live' : undefined}>
          {streamTime(stream, target)}
        </Cell>
        {health && (
          <Cell label="Health" tone={health.tone === 'ok' ? undefined : health.tone}>
            {health.score}
          </Cell>
        )}
        <Cell label={recording ? 'REC' : 'Rec'} tone={recording ? 'live' : undefined}>
          {/* Time recorded (frames over the frame rate): pauses don't count. */}
          {clock(((rec?.frames ?? 0) / target) * 1000)}
        </Cell>
        <Cell label="CPU">{eng.cpu.toFixed(1)}%</Cell>
        <Cell label="FPS" tone={slow ? 'warn' : undefined}>
          {eng.fps.toFixed(2)} / {target.toFixed(2)}
        </Cell>
        <Cell label="Dropped" tone={dropped > 0 ? 'warn' : undefined}>
          {droppedText(dropped, stream?.frames ?? 0)}
        </Cell>
        <Cell label="Upload" tone={uploadTone}>
          {shownUpload.toLocaleString()} kb/s
        </Cell>
      </button>
      <StatsDialog
        open={open}
        onClose={() => setOpen(false)}
        reading={reading}
        effectiveUploadKbps={effective.uploadKbps}
        streamStateLabel={effective.streamStateLabel}
      />
    </footer>
  )
}
