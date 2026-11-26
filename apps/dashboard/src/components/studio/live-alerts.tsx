// The live watch's words as one toast: a mistake while live stays on screen until it's fixed,
// then the same toast says so (green) and goes. Several at once are one line, the newest, with
// how many wait behind it (a stack of persistent toasts covered the Studio's picture). On every
// screen, the phone's too.

import { useEffect, useRef } from 'react'
import { toast, type ToastTone } from '@ferrocast/ui'
import { studioEngineApi, type FerroClient, type LiveAlert } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { MAX_MIC_GAIN_DB, MIC_LEVEL_FILTER, freeName } from './desk/cleanmic'

/** Long enough to stay until fixed (each alert is cleared by its own "back" toast). */
const UNTIL_FIXED_MS = 30 * 60 * 1000

/** The toast's key: every live alert shares one place. */
const KEY = 'live:alerts'

/** Cap total digital boost (positive fader + gain_filter + compressor output_gain) at +20 dB. */
const MAX_TOTAL_BOOST_DB = 20

const round1 = (n: number) => Math.round(n * 10) / 10

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
        // Step 1: raise a turned-down fader toward 0 dB before adding filter gain; never exceed 0 dB.
        if (row.volume_db < -0.5) {
          const to = Math.min(0, round1(row.volume_db + 6))
          await api.setAudio(name, { volume_db: to })
          return `${name} is at ${to} dB.`
        }
        // Step 2: inspect existing gain_filter and compressor output_gain so total boost stays <= 20 dB.
        const filters = (await api.filters(name)) ?? []
        const boostFilters = filters.filter(
          (f) => f.enabled && (f.kind === 'gain_filter' || f.kind === 'compressor_filter'),
        )
        const settingsList = await Promise.all(
          boostFilters.map(async (f) => {
            const s =
              typeof api.filterSettings === 'function'
                ? await api.filterSettings(name, f.name)
                : undefined
            return [f, s ?? {}] as const
          }),
        )
        let gainBoost = 0
        let compBoost = 0
        let targetGain: { name: string; settings: Record<string, unknown>; db: number } | null =
          null
        for (const [f, s] of settingsList) {
          if (f.kind === 'gain_filter') {
            const rawDb = Number(s.db ?? 0)
            const db = Number.isFinite(rawDb) ? Math.max(0, rawDb) : 0
            gainBoost += db
            if (f.name === MIC_LEVEL_FILTER && targetGain === null) {
              targetGain = { name: f.name, settings: s, db }
            }
          } else if (f.kind === 'compressor_filter') {
            const rawOut = Number(s.output_gain ?? 0)
            if (Number.isFinite(rawOut) && rawOut > 0) compBoost += rawOut
          }
        }
        const faderBoost = Math.max(0, row.volume_db)
        const existingBoost = faderBoost + gainBoost + compBoost
        const headroom = Math.max(0, MAX_TOTAL_BOOST_DB - existingBoost)
        const oldGainDb = targetGain?.db ?? 0
        const gainCapLeft = Math.max(0, MAX_MIC_GAIN_DB - oldGainDb)
        const add = Math.min(6, Math.floor(headroom), Math.floor(gainCapLeft))
        if (add < 1) {
          await api.silenceLiveAlert(alert.id)
          return `${name} already has +${Math.round(existingBoost)} dB of boost. Raise your mic's hardware gain or move closer.`
        }
        if (row.volume_db < 0) {
          await api.setAudio(name, { volume_db: 0 })
        }
        if (targetGain) {
          await api.updateFilter(name, targetGain.name, {
            ...targetGain.settings,
            db: round1(oldGainDb + add),
          })
        } else {
          const filterName = freeName(
            MIC_LEVEL_FILTER,
            filters.map((f) => f.name),
          )
          await api.addFilter(name, {
            kind: 'gain_filter',
            name: filterName,
            settings: { db: add },
          })
          await api.editFilter(name, filterName, 'top')
        }
        const total = round1(existingBoost + add)
        return `Raised ${name} by +${add} dB (now +${total} dB total).`
      },
    }
  return undefined
}

/** The dismiss button an alert offers (`muted_on_purpose` or `quiet_ok`), silencing it for the stream. */
export function alertDismiss(
  alert: LiveAlert,
  client: FerroClient,
): { label: string; run: () => Promise<string> } | undefined {
  if (alert.dismiss !== 'muted_on_purpose' && alert.dismiss !== 'quiet_ok') return undefined
  const api = studioEngineApi(client)
  if (alert.dismiss === 'quiet_ok')
    return {
      label: 'Dismiss',
      run: async () => {
        await api.silenceLiveAlert(alert.id)
        return 'Won’t ask again this stream.'
      },
    }
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
  const silencedByUser = useRef(new Set<string>())
  useEffect(() => {
    if (!alert) return
    if (!alert.cleared) silencedByUser.current.delete(alert.id)
    const r = foldAlerts(active.current, alert)
    active.current = r.active
    if (alert.cleared && silencedByUser.current.has(alert.id)) {
      silencedByUser.current.delete(alert.id)
      if (r.shown.fixed) return
    }
    const shownAlert = r.shown.alert
    const fix = shownAlert && client ? alertFix(shownAlert, client) : undefined
    const dismiss = shownAlert && client ? alertDismiss(shownAlert, client) : undefined
    const silenceFromUser = (id: string) => {
      silencedByUser.current.add(id)
      active.current = active.current.filter((a) => a.id !== id)
    }
    const runAction = (run: () => Promise<string>, markSilencedId?: string) => () => {
      if (markSilencedId) silenceFromUser(markSilencedId)
      run().then(
        (m) => toast({ tone: 'ok', message: m }),
        (e: unknown) => {
          if (markSilencedId) silencedByUser.current.delete(markSilencedId)
          toast({ tone: 'error', message: e instanceof Error ? e.message : 'That didn’t work.' })
        },
      )
    }
    const onDismiss =
      shownAlert &&
      client &&
      (shownAlert.dismiss === 'quiet_ok' || shownAlert.id.startsWith('mic:quiet:'))
        ? () => {
            silenceFromUser(shownAlert.id)
            void studioEngineApi(client)
              .silenceLiveAlert(shownAlert.id)
              .catch(() => {
                silencedByUser.current.delete(shownAlert.id)
              })
          }
        : undefined
    toast({
      key: KEY,
      ...(fix ? { action: { label: fix.label, run: runAction(fix.run) } } : {}),
      ...(dismiss
        ? { action2: { label: dismiss.label, run: runAction(dismiss.run, shownAlert?.id) } }
        : {}),
      ...(onDismiss ? { onDismiss } : {}),
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
