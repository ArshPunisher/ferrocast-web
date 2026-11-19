// The live watch's words as one toast: a mistake while live stays on screen until it's fixed,
// then the same toast says so (green) and goes. Several at once are one line, the newest, with
// how many wait behind it (a stack of persistent toasts covered the Studio's picture). On every
// screen, the phone's too.

import { useEffect, useRef } from 'react'
import { toast, type ToastTone } from '@ferrocast/ui'
import type { LiveAlert } from '@ferrocast/api'
import { useLive } from '../../lib/store'

/** Long enough to stay until fixed (each alert is cleared by its own "back" toast). */
const UNTIL_FIXED_MS = 30 * 60 * 1000

/** The toast's key: every live alert shares one place. */
const KEY = 'live:alerts'

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
  shown: { tone: ToastTone; message: string; detail?: string; more: number; fixed: boolean }
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
      },
    }
  return {
    active: next,
    shown: { tone: 'ok', message: alert.message, more: 0, fixed: true },
  }
}

export function LiveAlertToasts() {
  const alert = useLive((s) => s.studio.alert)
  const active = useRef<LiveAlert[]>([])
  useEffect(() => {
    if (!alert) return
    const r = foldAlerts(active.current, alert)
    active.current = r.active
    toast({
      key: KEY,
      tone: r.shown.tone,
      message: r.shown.message,
      detail: r.shown.detail,
      more: r.shown.more,
      ...(r.shown.fixed ? {} : { duration: UNTIL_FIXED_MS }),
    })
  }, [alert])
  return null
}
