// Library entry: the dashboard renders its live previews with this same code (inside a
// Shadow DOM, with `@ferrocast/overlays/styles.css?inline`).

import type { RenderedAlert } from '@ferrocast/api/types'
import { el, themeOf } from './dom'
import { AlertsWidget } from './widgets/alerts'

export { createOverlay, type OverlayRuntime, type OverlayOptions } from './runtime'
export {
  connectOverlay,
  watchVisibility,
  type OverlayConnection,
  type ConnectOptions,
} from './connection'
export { THEME_IDS } from './dom'

/**
 * Plays one alert in `root` (the alert editor's stage). With `loop` it replays after a
 * short pause. Returns a cleanup that stops it.
 */
export function playAlertPreview(
  root: HTMLElement,
  alert: RenderedAlert,
  opts: { theme?: string; audio?: boolean; lowMotion?: boolean; loop?: boolean } = {},
): () => void {
  const shell = el('div', 'fc-ov fc-ov-preview')
  root.appendChild(shell)
  const mq =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const low = () => !!opts.lowMotion || !!mq?.matches
  shell.classList.toggle('is-low', low())
  let n = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const widget = new AlertsWidget(
    {
      id: 'preview',
      kind: 'alerts',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      config: { theme: themeOf(opts.theme), rule_ids: null },
    },
    {
      send: (data) => {
        // Previews never talk to the engine; acks only drive the loop.
        if (!opts.loop || stopped || !data.includes('"finished"')) return
        timer = setTimeout(play, 900)
      },
      audio: opts.audio ?? false,
      lowMotion: low,
      state: { goals: [], labels: {}, viewers: {}, events: [], chat: [] },
    },
  )
  widget.el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  shell.appendChild(widget.el)
  function play() {
    n += 1
    widget.onAlert({ ...alert, alert_id: `${alert.alert_id}#${n}` }, true)
  }
  play()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    widget.destroy()
    shell.remove()
  }
}
