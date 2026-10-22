// Start show / End show: the run with its steps, the pre-flight with one-click fixes, the
// Start dialog Home opens (two clicks to go live), and the checklist settings.

import { useEffect, useState } from 'react'
import { ArrowsClockwise, Broadcast, Play, Stop, Timer as TimerIcon } from '@phosphor-icons/react'
import {
  describeError,
  fieldError,
  type ObsScenes,
  type Preflight,
  type PreflightCheck,
  type ShowConfig,
  type ShowRun,
  type StreamPreset,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  Select,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useNow, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { StatusIcon, clock, useStudio } from './common'
import { useObsHealth } from './obs'

const STOP_DELAYS = [0, 10, 30, 60, 120, 300]

/**
 * OBS's Start / Stop Streaming from here. The watcher's 5-second reading keeps it current;
 * stopping asks first, because it ends the stream for everyone watching.
 */
export function StreamControl() {
  const studio = useStudio()
  const health = useObsHealth()
  const first = useResource(() => studio.obsStream(), [studio])
  const [mine, setMine] = useState<{ streaming: boolean; at: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const { run, busy } = useAction()
  // The newest of: what the last button press said, and the watcher's reading.
  const streaming =
    mine && (!health || mine.at >= health.at)
      ? mine.streaming
      : (health?.streaming ?? first.data?.streaming)
  const press = (on: boolean) =>
    void run('stream', () => studio.setObsStream(on), {
      success: (r) => (r.streaming ? 'OBS is streaming. You’re live.' : 'OBS stopped streaming.'),
    }).then((r) => {
      if (r) setMine({ streaming: r.streaming, at: Date.now() })
      setConfirm(false)
    })
  if (first.error && !health)
    return (
      <p className="flex items-center gap-2 text-[13.5px] text-text-2">
        <Broadcast size={16} className="shrink-0 text-text-3" aria-hidden="true" />
        Open OBS to start or stop streaming from here.
      </p>
    )
  if (streaming === undefined) return <Skeleton className="h-10" />
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
      <span className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-text">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full ${streaming ? 'bg-danger motion-safe:animate-pulse' : 'bg-text-3'}`}
        />
        <span role="status">{streaming ? 'OBS is streaming' : 'OBS isn’t streaming'}</span>
      </span>
      {streaming ? (
        <Button
          size="sm"
          variant="danger-ghost"
          icon={<Stop size={14} weight="fill" />}
          onClick={() => setConfirm(true)}
        >
          Stop streaming
        </Button>
      ) : (
        <Button
          size="sm"
          icon={<Broadcast size={15} />}
          busy={busy === 'stream'}
          onClick={() => press(true)}
        >
          Start streaming
        </Button>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Stop streaming?"
        description="OBS stops sending video, so the stream ends for everyone watching."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep streaming
            </Button>
            <Button variant="danger" busy={busy === 'stream'} onClick={() => press(false)}>
              Stop streaming
            </Button>
          </>
        }
      />
    </div>
  )
}

const PHASE: Record<
  ShowRun['phase'],
  { label: string; tone: 'accent' | 'ok' | 'neutral' | 'warn' }
> = {
  starting: { label: 'Starting Soon', tone: 'accent' },
  countdown: { label: 'Counting down', tone: 'accent' },
  live: { label: 'Live scene', tone: 'ok' },
  ended: { label: 'Ended', tone: 'neutral' },
}

/** The current show from the live socket, loaded once if no frame came yet. */
export function useShow(): [ShowRun | null | undefined, (r: ShowRun | null) => void] {
  const studio = useStudio()
  const live = useLive((s) => s.studio.show)
  const [loaded, setLoaded] = useState<ShowRun | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    studio
      .show()
      .then((r) => alive && setLoaded(r.show))
      .catch(() => alive && setLoaded(null))
    return () => {
      alive = false
    }
  }, [studio])
  return [live !== undefined ? live : loaded, setLoaded]
}

export function PreflightList({ pf, onFixed }: { pf: Preflight; onFixed: (p: Preflight) => void }) {
  const studio = useStudio()
  const { run, busy } = useAction()
  const row = (c: PreflightCheck) => (
    <li
      key={c.id}
      className="flex flex-col gap-1.5 rounded-control px-1 py-2 sm:flex-row sm:items-start sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusIcon status={c.status} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">{c.label}</p>
          <p className="text-[13.5px] break-words text-text-2">{c.detail}</p>
        </div>
      </div>
      {c.fix && (
        <div className="shrink-0 pl-[30px] sm:pl-0">
          {c.fix.href.startsWith('action:') ? (
            <Button
              size="sm"
              busy={busy === c.id}
              onClick={() =>
                void run(c.id, () => studio.preflightFix(c.fix!.href), { success: 'Fixed.' }).then(
                  (p) => p && onFixed(p),
                )
              }
            >
              {c.fix.label}
            </Button>
          ) : (
            <a
              href={c.fix.href}
              className="-ml-2 inline-block rounded-control px-2 py-1 text-[13.5px] font-semibold text-accent-text hover:bg-surface-2 sm:ml-0"
            >
              {c.fix.label}
            </a>
          )}
        </div>
      )}
    </li>
  )
  // Problems first; the checks that passed fold away so the fixes stand out.
  const issues = pf.checks.filter((c) => c.status === 'fail' || c.status === 'warn')
  const fine = pf.checks.filter((c) => c.status !== 'fail' && c.status !== 'warn')
  return (
    <div className="flex flex-col gap-1">
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Pre-flight problems">
          {issues.map(row)}
        </ul>
      )}
      {fine.length > 0 && (
        <details className="rounded-control" open={issues.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 rounded-control px-1 py-2 text-[13.5px] font-medium text-text-2 hover:text-text">
            <StatusIcon status="ok" />
            {fine.length} {fine.length === 1 ? 'check' : 'checks'} passed
          </summary>
          <ul className="flex flex-col gap-1" aria-label="Pre-flight checks that passed">
            {fine.map(row)}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Pre-flight, then Start: from Home this is the second click. */
export function StartShowDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const studio = useStudio()
  const [pf, setPf] = useState<Preflight | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { run, busy } = useAction()
  useEffect(() => {
    if (!open) return
    setPf(null)
    setErr(null)
    studio
      .preflight()
      .then(setPf)
      .catch((e: unknown) => setErr(describeError(e).message))
  }, [open, studio])
  const start = (force: boolean) =>
    void run('start', () => studio.startShow(force), {
      success: (r) =>
        r.show.phase === 'countdown'
          ? 'Show started: counting down to the live scene.'
          : 'Show started.',
    }).then((r) => r && onClose())
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start show"
      description="Checks first, then your go-live checklist runs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {pf && !pf.ready && (
            <Button busy={busy === 'start'} onClick={() => start(true)}>
              Start anyway
            </Button>
          )}
          <Button
            variant="primary"
            icon={<Play size={15} weight="fill" />}
            disabled={!pf?.ready}
            busy={busy === 'start'}
            onClick={() => start(false)}
          >
            Start show
          </Button>
        </>
      }
    >
      {err ? (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      ) : !pf ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          {!pf.ready && (
            <p role="status" className="mb-2 text-[13.5px] font-medium text-text-2">
              Fix the red items, or start anyway.
            </p>
          )}
          <PreflightList pf={pf} onFixed={setPf} />
        </>
      )}
    </Dialog>
  )
}

export function ShowPanel() {
  const studio = useStudio()
  const [show, setShow] = useShow()
  const [starting, setStarting] = useState(false)
  const now = useNow(1000)
  const { run, busy } = useAction()
  const act = (key: string, fn: () => Promise<{ show: ShowRun }>, success: string) =>
    void run(key, fn, { success }).then((r) => r && setShow(r.show))
  const left = show?.countdown_ends_at ? (show.countdown_ends_at - now) / 1000 : null
  const active = show && show.phase !== 'ended'
  return (
    <Panel
      title="Show"
      actions={show ? <Badge tone={PHASE[show.phase].tone}>{PHASE[show.phase].label}</Badge> : null}
    >
      {show === undefined ? (
        <Skeleton className="h-28" />
      ) : (
        <div className="flex flex-col gap-4">
          <StreamControl />
          {show?.phase === 'countdown' && left !== null && (
            <p
              className="flex items-center gap-2 font-mono text-3xl font-semibold tabular-nums text-text"
              aria-live="polite"
            >
              <TimerIcon size={26} className="text-accent-text" aria-hidden="true" />
              {clock(left)}
              <span className="sr-only">until the live scene</span>
            </p>
          )}
          {!show && (
            <p className="text-sm text-text-2">
              Sets your stream info, shows Starting Soon, counts down, then goes live.
            </p>
          )}
          {show && show.steps.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="What the show did">
              {show.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-2.5 text-sm">
                  <StatusIcon status={s.status} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-medium text-text">{s.label}</span>
                    {s.detail && (
                      <span className="block text-[13.5px] break-words text-text-2">
                        {s.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {!active && (
              <Button
                variant="primary"
                icon={<Play size={15} weight="fill" />}
                onClick={() => setStarting(true)}
              >
                Start show
              </Button>
            )}
            {show?.phase === 'countdown' && (
              <>
                <Button
                  variant="primary"
                  busy={busy === 'skip'}
                  onClick={() =>
                    act('skip', () => studio.skipCountdown(), 'Switched to the live scene.')
                  }
                >
                  Go live now
                </Button>
                <Button
                  busy={busy === 'cancel'}
                  onClick={() =>
                    act('cancel', () => studio.cancelCountdown(), 'Countdown stopped.')
                  }
                >
                  Cancel countdown
                </Button>
              </>
            )}
            {show?.phase === 'starting' && show.live_scene && (
              <Button
                variant="primary"
                busy={busy === 'live'}
                onClick={() => act('live', () => studio.liveScene(), 'Switched to the live scene.')}
              >
                Switch to {show.live_scene}
              </Button>
            )}
            {active && (
              <Button
                variant="danger-ghost"
                icon={<Stop size={15} weight="fill" />}
                busy={busy === 'end'}
                onClick={() =>
                  act('end', () => studio.endShow(), 'Show ended. Thanks posted in chat.')
                }
              >
                End show
              </Button>
            )}
          </div>
        </div>
      )}
      <StartShowDialog open={starting} onClose={() => setStarting(false)} />
    </Panel>
  )
}

export function PreflightPanel() {
  const studio = useStudio()
  const pf = useResource(() => studio.preflight(), [studio])
  const [checking, setChecking] = useState(false)
  const recheck = () => {
    setChecking(true)
    studio
      .preflight()
      .then((p) => {
        pf.set(p)
        const n = p.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length
        toast({
          key: 'preflight',
          tone: n ? 'warn' : 'ok',
          message: n ? `${n} ${n === 1 ? 'thing' : 'things'} to fix.` : 'All checks passed.',
        })
      })
      .catch((e: unknown) => {
        const d = describeError(e)
        toast({ key: 'preflight', tone: 'error', message: d.message, hint: d.hint })
      })
      .finally(() => setChecking(false))
  }
  return (
    <Panel
      title="Pre-flight"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowsClockwise size={14} />}
          busy={checking}
          onClick={recheck}
        >
          Check again
        </Button>
      }
    >
      <p className="mb-2 text-[13.5px] text-text-2">
        What could go wrong at go-live, with the fix.
      </p>
      {pf.error ? (
        <LoadError error={pf.error} onRetry={pf.reload} />
      ) : !pf.data ? (
        <Skeleton className="h-40" />
      ) : (
        <PreflightList pf={pf.data} onFixed={(p) => pf.set(p)} />
      )}
    </Panel>
  )
}

const COUNTDOWNS = [0, 60, 120, 180, 300, 600, 900]

export function ShowSettings({
  presets,
  scenes,
}: {
  presets: StreamPreset[]
  scenes: ObsScenes | null
}) {
  const studio = useStudio()
  const cfg = useResource(() => studio.showConfig(), [studio])
  const inputs = useResource(() => studio.obsInputs().catch(() => []), [studio])
  const [draft, setDraft] = useState<ShowConfig | null>(null)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const { run, busy } = useAction()
  const c = draft ?? cfg.data
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!c) return <Skeleton className="h-64" />
  const set = (p: Partial<ShowConfig>) => setDraft({ ...c, ...p })
  const names = scenes?.scenes.map((s) => s.name) ?? []
  const withCurrent = (v: string | null) => (v && !names.includes(v) ? [v, ...names] : names)
  const sceneSelect = (label: string, key: 'starting_scene' | 'live_scene' | 'ending_scene') => (
    <Field label={label} error={err?.field === key ? err.message : null}>
      {(p) => (
        <Select
          {...p}
          value={c[key] ?? ''}
          onChange={(e) => set({ [key]: e.target.value || null })}
        >
          <option value="">Don’t switch</option>
          {withCurrent(c[key]).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
  const audio = (inputs.data ?? []).filter((i) =>
    /input_capture|coreaudio_input|pulse_input|alsa|jack/.test(i.kind),
  )
  const cams = (inputs.data ?? []).filter((i) => /dshow|av_capture|v4l2|camera/.test(i.kind))
  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  const save = () =>
    void run(
      'save',
      async () => {
        setErr(null)
        try {
          const saved = await studio.saveShowConfig(c)
          cfg.set(saved)
          setDraft(null)
          toast({ tone: 'ok', message: 'Checklist saved.' })
          return saved
        } catch (e) {
          setErr(fieldError(e))
          throw e
        }
      },
      { quiet: true },
    )
  return (
    <Panel
      title="Go-live checklist"
      description="Runs when you press Start show."
      actions={
        <Button size="sm" variant="primary" disabled={!draft} busy={busy === 'save'} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Stream info preset">
          {(p) => (
            <Select
              {...p}
              value={c.preset_id ?? ''}
              onChange={(e) => set({ preset_id: e.target.value || null })}
            >
              <option value="">Keep what’s there</option>
              {presets.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sceneSelect('Starting scene', 'starting_scene')}
          <Field label="Countdown" error={err?.field === 'countdown_s' ? err.message : null}>
            {(p) => (
              <Select
                {...p}
                value={c.countdown_s}
                onChange={(e) => set({ countdown_s: Number(e.target.value) })}
              >
                {(COUNTDOWNS.includes(c.countdown_s)
                  ? COUNTDOWNS
                  : [...COUNTDOWNS, c.countdown_s]
                ).map((s) => (
                  <option key={s} value={s}>
                    {s === 0
                      ? 'No countdown'
                      : s < 60
                        ? `${s} seconds`
                        : `${s / 60} minute${s === 60 ? '' : 's'}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {sceneSelect('Live scene', 'live_scene')}
          {sceneSelect('Ending scene', 'ending_scene')}
        </div>
        {!scenes && (
          <p className="text-[13.5px] text-text-2">Open OBS to pick scenes from a list.</p>
        )}
        <div className="flex flex-col gap-3">
          <Switch
            label="Turn alerts on"
            checked={c.alerts_on}
            onChange={(v) => set({ alerts_on: v })}
          />
          <Switch
            label="Turn the bot and timers on"
            checked={c.bot_on}
            onChange={(v) => set({ bot_on: v })}
          />
          <Switch
            label="Post the Discord go-live message"
            description="The message from Settings, Discord."
            checked={c.discord}
            onChange={(v) => set({ discord: v })}
          />
          <Switch
            label="Start the replay buffer"
            description="So “clip that” and !clip work."
            checked={c.replay_buffer}
            onChange={(v) => set({ replay_buffer: v })}
          />
          <Switch
            label="Start streaming in OBS"
            description="Presses Start Streaming after the starting scene, so viewers see it during the countdown."
            checked={c.start_stream}
            onChange={(v) => set({ start_stream: v })}
          />
          <Switch
            label="End show: stop streaming in OBS"
            description="After the ending scene and the thank-you, so viewers see them first."
            checked={c.stop_stream}
            onChange={(v) => set({ stop_stream: v })}
          />
          {c.stop_stream && (
            <Field
              label="Stop after"
              className="sm:max-w-[16rem]"
              error={err?.field === 'stop_delay_s' ? err.message : null}
            >
              {(p) => (
                <Select
                  {...p}
                  value={c.stop_delay_s}
                  onChange={(e) => set({ stop_delay_s: Number(e.target.value) })}
                >
                  {(STOP_DELAYS.includes(c.stop_delay_s)
                    ? STOP_DELAYS
                    : [...STOP_DELAYS, c.stop_delay_s].sort((a, b) => a - b)
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s === 0
                        ? 'Right away'
                        : s < 60
                          ? `${s} seconds`
                          : `${s / 60} minute${s === 60 ? '' : 's'}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        {audio.length > 0 && (
          <fieldset>
            <legend className="text-[13.5px] font-medium text-text-2">
              Check these mics aren’t muted
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {audio.map((i) => (
                <label
                  key={i.name}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13.5px] text-text-2"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--fc-arc)]"
                    checked={c.mic_sources.includes(i.name)}
                    onChange={() => set({ mic_sources: toggleIn(c.mic_sources, i.name) })}
                  />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {cams.length > 0 && (
          <fieldset>
            <legend className="text-[13.5px] font-medium text-text-2">
              Check these cameras are shown
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {cams.map((i) => (
                <label
                  key={i.name}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13.5px] text-text-2"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--fc-arc)]"
                    checked={c.cam_sources.includes(i.name)}
                    onChange={() => set({ cam_sources: toggleIn(c.cam_sources, i.name) })}
                  />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field
          label="End show: thank-you in chat"
          optional
          hint="Use {thanks}, {follows}, {subs}, {duration}. Empty posts nothing."
          error={err?.field === 'recap_message' ? err.message : null}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={400}
              value={c.recap_message ?? ''}
              onChange={(e) =>
                set({ recap_message: e.target.value.trim() ? e.target.value : null })
              }
            />
          )}
        </Field>
        {err && !err.field && (
          <p role="alert" className="text-[13.5px] font-medium text-danger">
            {err.message}
          </p>
        )}
      </div>
    </Panel>
  )
}
