// The live watch's words as toasts: a mistake while live stays on screen until it's fixed,
// then the same toast says so (green) and goes. On every screen, the phone's too.

import { useEffect } from 'react'
import { toast } from '@ferrocast/ui'
import { useLive } from '../../lib/store'

/** Long enough to stay until fixed (each alert is cleared by its own "back" toast). */
const UNTIL_FIXED_MS = 30 * 60 * 1000

export function LiveAlertToasts() {
  const alert = useLive((s) => s.studio.alert)
  useEffect(() => {
    if (!alert) return
    toast({
      key: `live:${alert.id}`,
      tone: alert.cleared ? 'ok' : alert.level === 'error' ? 'error' : 'warn',
      message: alert.message,
      ...(alert.cleared ? {} : { duration: UNTIL_FIXED_MS }),
    })
  }, [alert])
  return null
}
