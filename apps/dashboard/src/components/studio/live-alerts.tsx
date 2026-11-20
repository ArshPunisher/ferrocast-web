// The live watch's words as one toast: a mistake while live stays on screen until it's fixed,
// then the same toast says so (green) and goes. Several at once are one line, the newest, with
// how many wait behind it (a stack of persistent toasts covered the Studio's picture). On every
// screen, the phone's too.

import { useEffect, useRef } from 'react'
import { toast, type ToastTone } from '@ferrocast/ui'
import { studioEngineApi, type FerroClient, type LiveAlert } from '@ferrocast/api'
import { useLive } from '../../lib/store'

/** Long enough to stay until fixed (each alert is cleared by its own "back" toast). */
const UNTIL_FIXED_MS = 30 * 60 * 1000

/** The toast's key: every live alert shares one place. */
const KEY = 'live:alerts'

/** How far "+6 dB" goes at most (the fader's top). */
const MAX_DB = 26

/**
 * The one-tap fix an alert offers (`unmute`, `+6 dB`), or none. It runs against the Studio's
 * mixer: gain is read fresh, so a fader moved since the alert is not undone.
 */
export function alertFix(
  alert: LiveAlert,
  client: FerroClient,
): { label: string; run: () => Promise<string> } | undefined {
  const name = alert.source
  if (!name) return undefined
  const api = studioEngineApi(client)
  if (alert.action === 'unmute')
    return {
      label: 'Unmute',
      run: async () => {
        await api.setAudio(name, { muted: false })
        return `${name} is on.`
      },
    }
  if (alert.action === 'gain_up')
    return {
      label: '+6 dB',
      run: async () => {
        const scene = (await api.scenes()).current
        const row = (await api.audio(scene)).find((a) => a.name === name)
        if (!row) throw new Error(`${name} isn't in the scene on air.`)
        const to = Math.min(MAX_DB, Math.round((row.volume_db + 6) * 10) / 10)
        await api.setAudio(name, { volume_db: to })
        return `${name} is at ${to} dB.`
      },
    }
  return undefined
}

/** The "this is on purpose" button an alert offers (a muted mic), or none: it silences the alert for the stream. */
export function alertDismiss(
  alert: LiveAlert,
  client: FerroClient,
): { label: string; run: () => Promise<string> } | undefined {
  if (alert.dismiss !== 'muted_on_purpose') return undefined
  const api = studioEngineApi(client)
  return {
    label: 'Muted on purpose',
    run: async () => {
      await api.silenceLiveAlert(alert.id)
      return 'Not said again for this stream.'
    },
  }
}

/**
 * Folds one alert frame into the ones still wrong (oldest first; one raised again moves to
 * the end), and says what the toast shows: the newest wrong one with the count behind it, or,
 * when this frame fixed the last one, its "back to normal" line.
 */
export function foldAlerts(
  active: LiveAlert[],
  alert: LiveAlert,
): {
  active: LiveAlert[]
  shown: {
    tone: ToastTone
    message: string
    detail?: string
    more: number
    fixed: boolean
    alert?: LiveAlert
  }
} {
  const rest = active.filter((a) => a.id !== alert.id)
  const next = alert.cleared ? rest : [...rest, alert]
  const top = next[next.length - 1]
  if (top)
    return {
      active: next,
      shown: {
        tone: top.level === 'error' ? 'error' : 'warn',
        message: top.message,
        ...(top.detail ? { detail: top.detail } : {}),
        more: next.length - 1,
        fixed: false,
        alert: top,
      },
    }
  return {
    active: next,
    shown: { tone: 'ok', message: alert.message, more: 0, fixed: true },
  }
}

export function LiveAlertToasts() {
  const alert = useLive((s) => s.studio.alert)
  const client = useLive((s) => s.conn?.client)
  const active = useRef<LiveAlert[]>([])
  useEffect(() => {
    if (!alert) return
    const r = foldAlerts(active.current, alert)
    active.current = r.active
    const fix = r.shown.alert && client ? alertFix(r.shown.alert, client) : undefined
    const dismiss = r.shown.alert && client ? alertDismiss(r.shown.alert, client) : undefined
    const said = (run: () => Promise<string>) => () => {
      run().then(
        (m) => toast({ tone: 'ok', message: m }),
        (e: unknown) =>
          toast({ tone: 'error', message: e instanceof Error ? e.message : 'That didn’t work.' }),
      )
    }
    toast({
      key: KEY,
      ...(fix ? { action: { label: fix.label, run: said(fix.run) } } : {}),
      ...(dismiss ? { action2: { label: dismiss.label, run: said(dismiss.run) } } : {}),
      tone: r.shown.tone,
      message: r.shown.message,
      detail: r.shown.detail,
      more: r.shown.more,
      ...(r.shown.fixed ? {} : { duration: UNTIL_FIXED_MS }),
    })
    // The alert is the trigger; a new client alone must not show a stale one again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert])
  return null
}
