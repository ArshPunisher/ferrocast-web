// Safe Mode recovery screen and calm status bar (M11-03): shown after an unclean exit or
// `--safe-mode` launch so the streamer sees what was held back (plugins, VSTs, auto-start,
// saved scenes) and can load their scenes in Safe Mode or start normally.

import { useRef, useState } from 'react'
import {
  CardsThree,
  Package,
  Play,
  Record as RecordIcon,
  ShieldWarning,
  Sliders,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  describeError,
  studioEngineApi,
  type FerroClient,
  type SafeModeStatus,
  type StudioEngineStatus,
  type StudioStartOptions,
} from '@ferrocast/api'
import { Badge, Button, InfoLine, Wordmark, toast } from '@ferrocast/ui'
import { useClient } from '../lib/hooks'
import { useLive } from '../lib/store'

export type HeldBackKind = 'plugins' | 'vsts' | 'autostart' | 'scenes'

export interface HeldBackItem {
  id: HeldBackKind
  label: string
  detail: string
}

/** True when launched with `--safe-mode` (Normal Mode cannot be enabled without restarting). */
export function isSafeModeLocked(sm: SafeModeStatus): boolean {
  return Boolean(
    sm.active && !sm.offer && (!sm.unclean_exit || /--safe-mode/i.test(sm.reason ?? '')),
  )
}

/** The features currently held back in Safe Mode, each as one calm line + `(i)` detail. */
export function heldBackItems(sm: SafeModeStatus): HeldBackItem[] {
  const items: HeldBackItem[] = []
  if (sm.plugins_disabled) {
    items.push({
      id: 'plugins',
      label: 'Plugins paused',
      detail: 'Third-party effect, logic and panel plugins stay off until you start normally.',
    })
  }
  if (sm.vsts_disabled) {
    items.push({
      id: 'vsts',
      label: 'Audio VSTs paused',
      detail: 'Third-party VST3 audio filters stay off. Built-in audio filters still work.',
    })
  }
  if (sm.auto_start_disabled) {
    items.push({
      id: 'autostart',
      label: 'Auto-start off',
      detail: 'Recording and the replay buffer will not restart on their own after the crash.',
    })
  }
  if (sm.collection_pending) {
    items.push({
      id: 'scenes',
      label: 'Saved scenes held back',
      detail:
        'Your saved scene collection is untouched on disk until you load it or start normally.',
    })
  }
  return items
}

/** One short line and `(i)` detail for the persistent Safe Mode strip in the Shell. */
export function safeModeSummary(sm: SafeModeStatus): { line: string; detail: string } {
  const items = heldBackItems(sm)
  const names: string[] = []
  if (sm.plugins_disabled) names.push('plugins')
  if (sm.vsts_disabled) names.push('VSTs')
  if (sm.auto_start_disabled) names.push('auto-start')
  if (sm.collection_pending) names.push('saved scenes')

  let line: string
  if (names.length === 0) line = 'Safe Mode is on.'
  else if (names.length === 1) line = `Safe Mode: ${names[0]} held back.`
  else line = `Safe Mode: ${names.slice(0, -1).join(', ')} and ${names.at(-1)} held back.`

  const detailParts = [
    sm.reason?.trim() || 'Ferrocast started with protections on.',
    ...items.map((x) => x.detail),
  ]
  return { line, detail: detailParts.join(' ') }
}

/** Calls `POST /api/v1/studio/engine/start` and syncs the updated `safe_mode` into `useLive`. */
export async function resolveSafeMode(
  client: FerroClient,
  opts: StudioStartOptions,
): Promise<{ engine: StudioEngineStatus; next: SafeModeStatus | null }> {
  const engine = await studioEngineApi(client).start(opts)
  let next: SafeModeStatus | null = engine.safe_mode ?? null
  try {
    const fresh = await client.status()
    useLive.getState().setStatus(fresh)
    next = fresh.safe_mode?.active ? fresh.safe_mode : null
  } catch {
    useLive.getState().setSafeMode(next)
  }
  return { engine, next }
}

const HELD_ICONS: Record<HeldBackKind, typeof Package> = {
  plugins: Package,
  vsts: Sliders,
  autostart: RecordIcon,
  scenes: CardsThree,
}

type ActionKey = 'scenes' | 'normal' | 'blank'

export function SafeModeScreen({
  safeMode,
  onResolved,
}: {
  safeMode: SafeModeStatus
  onResolved: (next: SafeModeStatus | null, engine?: StudioEngineStatus) => void
}) {
  const client = useClient()
  const [busy, setBusy] = useState<ActionKey | null>(null)
  const [err, setErr] = useState<{ message: string; hint: string | null } | null>(null)
  const inFlight = useRef(false)

  const locked = isSafeModeLocked(safeMode)
  const held = heldBackItems(safeMode)
  const reason = safeMode.reason?.trim() || 'Ferrocast closed unexpectedly last time.'

  const choose = async (key: ActionKey, opts: StudioStartOptions, okMessage: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(key)
    setErr(null)
    try {
      const { engine, next } = await resolveSafeMode(client, opts)
      toast({ tone: 'ok', message: okMessage })
      onResolved(next, engine)
    } catch (e) {
      setErr(describeError(e))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return (
    <main
      aria-labelledby="safe-mode-heading"
      className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 text-text sm:px-6"
    >
      <div className="flex w-full max-w-[540px] flex-col gap-5">
        <Wordmark />

        <section className="flex flex-col gap-4 rounded-panel border border-line-strong bg-surface-1 p-5 shadow-2 sm:p-6">
          <div className="flex flex-col items-start gap-2.5">
            <Badge tone="warn">
              <ShieldWarning size={14} weight="fill" aria-hidden />
              Safe Mode
            </Badge>
            <h1
              id="safe-mode-heading"
              className="font-display text-[22px] leading-tight font-bold tracking-tight text-text sm:text-[26px]"
            >
              Started in Safe Mode
            </h1>
            <InfoLine
              detail="Safe Mode holds back add-ons and saved scenes so a broken plugin or source can't crash Ferrocast again. Nothing you saved was deleted."
              label="More about Safe Mode"
              className="w-full"
            >
              <p className="m-0 text-[15px] text-text-2">{reason}</p>
            </InfoLine>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-[13px] font-bold text-text-3">Held back for now</h2>
            {held.length === 0 ? (
              <p className="m-0 rounded-control border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-text-2">
                No features are currently held back.
              </p>
            ) : (
              <ul
                role="list"
                aria-label="Features held back in Safe Mode"
                className="m-0 flex list-none flex-col overflow-hidden rounded-control border border-line bg-surface-2 p-0"
              >
                {held.map((item) => {
                  const Icon = HELD_ICONS[item.id]
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-warn-soft text-warn"
                      >
                        <Icon size={15} weight="bold" />
                      </span>
                      <InfoLine
                        detail={item.detail}
                        label={`More about ${item.label}`}
                        className="min-w-0 flex-1 pt-0.5"
                      >
                        <span className="text-[14.5px] font-semibold text-text">{item.label}</span>
                      </InfoLine>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {err && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-danger"
            >
              <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              <InfoLine
                detail={err.hint ?? undefined}
                label="More about this error"
                className="min-w-0 flex-1"
              >
                <span className="text-[14px] font-semibold text-danger">{err.message}</span>
              </InfoLine>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
            {safeMode.collection_pending ? (
              <Button
                variant="primary"
                icon={<CardsThree size={16} weight="bold" aria-hidden />}
                busy={busy === 'scenes'}
                disabled={busy !== null}
                onClick={() =>
                  void choose(
                    'scenes',
                    { safe_mode: true, confirm_collection: true },
                    'Scenes loaded in Safe Mode.',
                  )
                }
                className="w-full sm:w-auto"
              >
                Load my scenes
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy !== null}
                onClick={() => onResolved(safeMode)}
                className="w-full sm:w-auto"
              >
                Continue in Safe Mode
              </Button>
            )}

            {!locked && (
              <Button
                variant="outline"
                icon={<Play size={15} weight="fill" aria-hidden />}
                busy={busy === 'normal'}
                disabled={busy !== null}
                onClick={() =>
                  void choose(
                    'normal',
                    { safe_mode: false, confirm_collection: true },
                    'Started normally.',
                  )
                }
                className="w-full sm:w-auto"
              >
                Start normally
              </Button>
            )}

            {safeMode.collection_pending && (
              <Button
                variant="ghost"
                busy={busy === 'blank'}
                disabled={busy !== null}
                onClick={() =>
                  void choose(
                    'blank',
                    { safe_mode: true, confirm_collection: false },
                    'Opened blank canvas in Safe Mode.',
                  )
                }
                className="w-full sm:ml-auto sm:w-auto"
              >
                Blank canvas
              </Button>
            )}
          </div>

          {locked && (
            <InfoLine
              detail="Restart Ferrocast without --safe-mode to turn plugins, VSTs and auto-start back on."
              label="More about starting normally"
            >
              <span className="text-[13px] text-text-3">
                Started with <code className="font-mono text-text-2">--safe-mode</code>.
              </span>
            </InfoLine>
          )}
        </section>
      </div>
    </main>
  )
}

/** Calm persistent one-line Safe Mode strip shown in the Shell while Safe Mode stays active. */
export function SafeModeBanner({ safeMode }: { safeMode: SafeModeStatus }) {
  const client = useClient()
  const [busy, setBusy] = useState<'scenes' | 'normal' | null>(null)
  const inFlight = useRef(false)

  if (!safeMode.active) return null

  const locked = isSafeModeLocked(safeMode)
  const { line, detail } = safeModeSummary(safeMode)

  const run = async (key: 'scenes' | 'normal', opts: StudioStartOptions, okMessage: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(key)
    try {
      await resolveSafeMode(client, opts)
      toast({ tone: 'ok', message: okMessage })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { detail: d.hint } : {}) })
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return (
    <div
      role="status"
      aria-label="Safe Mode"
      className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm sm:px-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <ShieldWarning
            size={16}
            weight="fill"
            className="mt-0.5 shrink-0 text-warn sm:mt-0"
            aria-hidden
          />
          <InfoLine detail={detail} label="More about Safe Mode" className="min-w-0 flex-1">
            <span className="font-semibold text-text">{line}</span>
          </InfoLine>
        </div>
        {(safeMode.collection_pending || !locked) && (
          <div className="flex flex-wrap items-center gap-2 pl-[26px] sm:pl-0">
            {safeMode.collection_pending && (
              <Button
                size="xs"
                variant="primary"
                busy={busy === 'scenes'}
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'scenes',
                    { safe_mode: true, confirm_collection: true },
                    'Scenes loaded in Safe Mode.',
                  )
                }
              >
                Load my scenes
              </Button>
            )}
            {!locked && (
              <Button
                size="xs"
                variant="outline"
                busy={busy === 'normal'}
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'normal',
                    { safe_mode: false, confirm_collection: true },
                    'Started normally.',
                  )
                }
              >
                Start normally
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
