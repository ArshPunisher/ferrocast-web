// Applies a widget design's style (`config.style`, API.md §4 Overlays) to a live widget: its
// colours, font, corner radius and variant as theme variables, and on built-in widget
// designs the small Spark mark where the design puts it. Bad values are skipped, never
// passed to CSS.

import { BRAND_SPOTS, isColor } from '@ferrocast/api/design'
import type { WidgetStyle } from '@ferrocast/api/types'
import { fontStack } from './fonts'
import { sparkSvg } from './spark'

const VARS = [
  '--t-text',
  '--t-accent',
  '--t-fill',
  '--t-track',
  '--t-surface',
  '--t-flat',
  '--t-radius',
  '--t-display',
  '--t-case',
  '--t-text-2',
  '--w-size',
]

export function applyWidgetStyle(el: HTMLElement, config: unknown): void {
  const cfg = (typeof config === 'object' && config !== null ? config : {}) as {
    style?: unknown
    branded?: unknown
  }
  const style = (
    typeof cfg.style === 'object' && cfg.style !== null ? cfg.style : null
  ) as WidgetStyle | null
  for (const v of VARS) el.style.removeProperty(v)
  for (const n of Array.from(el.children)) if (n.classList.contains('fc-w-brand')) n.remove()
  if (!style) {
    delete el.dataset.variant
    el.classList.remove('is-styled')
    return
  }
  el.classList.add('is-styled')
  const set = (name: string, v: string | null) => {
    if (v !== null) el.style.setProperty(name, v)
  }
  const c = (v: unknown) => (isColor(v) ? (v as string) : null)
  set('--t-text', c(style.text))
  set('--t-text-2', c(style.muted) ?? c(style.text))
  set('--t-accent', c(style.accent))
  set('--t-fill', c(style.accent))
  set('--t-track', c(style.track))
  set('--t-surface', c(style.background))
  set('--t-flat', c(style.background))
  if (typeof style.radius === 'number' && Number.isFinite(style.radius))
    set('--t-radius', `${Math.min(Math.max(style.radius, 0), 64)}px`)
  if (typeof style.font === 'string') set('--t-display', fontStack(style.font))
  if (style.uppercase === true) set('--t-case', 'uppercase')
  if (typeof style.font_size === 'number' && Number.isFinite(style.font_size))
    set('--w-size', `${Math.min(Math.max(style.font_size, 8), 120)}px`)
  if (typeof style.variant === 'string' && /^[a-z_]{1,24}$/.test(style.variant))
    el.dataset.variant = style.variant
  else delete el.dataset.variant
  if (
    cfg.branded === true &&
    typeof style.brand === 'string' &&
    (BRAND_SPOTS as readonly string[]).includes(style.brand)
  ) {
    const mark = sparkSvg(`fc-w-brand spot-${style.brand}`)
    el.appendChild(mark)
  }
}
