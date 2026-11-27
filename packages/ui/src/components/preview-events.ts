export const PREVIEW_LIVE_RESIZE_EVENT = 'fc://preview-live-resize'
export const SCALE_CHANGED_EVENT = 'fc://scale-changed'
export const DIVIDER_DRAG_EVENT = 'fc:divider-drag'

export type PreviewResizeReason = 'window' | 'divider' | 'programmatic'

export interface PreviewLiveResizeStillHints {
  main?: string
  program?: string
  vertical?: string
}

export interface PreviewLiveResizePayload {
  active: boolean
  reason?: PreviewResizeReason
  seq?: number
  scale?: number
  width?: number
  height?: number
  still?: PreviewLiveResizeStillHints
}

export interface ScaleChangedPayload {
  scale: number
  previousScale?: number
  display?: string | number
}

export interface DividerDragPayload {
  active: boolean
  axis?: 'x' | 'y'
}

export function isValidScaleChangedPayload(value: unknown): value is ScaleChangedPayload {
  if (!value || typeof value !== 'object') return false
  const scale = (value as { scale?: unknown }).scale
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0
}

export function isValidPreviewLiveResizePayload(value: unknown): value is PreviewLiveResizePayload {
  if (!value || typeof value !== 'object') return false
  return typeof (value as { active?: unknown }).active === 'boolean'
}

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|avif);base64,[A-Za-z0-9+/=_-]+$/i
const SAFE_DATA_SVG_RE =
  /^data:image\/svg\+xml;(?:charset=utf-8,|base64,)[A-Za-z0-9+/=_%.,~!*-]+$/i

function hasUnsafeCssUrlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f) return true
  }
  return /["'\\()]/.test(value)
}

/** Validates still image URLs or data URIs before inserting them into CSS `url("...")`. */
export function isSafeStillUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || hasUnsafeCssUrlChar(url)) return false
  if (SAFE_DATA_IMAGE_RE.test(url) || SAFE_DATA_SVG_RE.test(url)) return true
  if (url.startsWith('blob:') && url.length > 5 && !/^blob:(?:javascript|vbscript|data):/i.test(url)) {
    return true
  }
  if (/^https?:\/\/[^/]/i.test(url)) return true
  if (url.startsWith('/') && !url.startsWith('//')) return true
  return false
}

export function dispatchPreviewLiveResize(detail: PreviewLiveResizePayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<PreviewLiveResizePayload>(PREVIEW_LIVE_RESIZE_EVENT, { detail }),
  )
}

export function dispatchScaleChanged(detail: ScaleChangedPayload) {
  if (typeof window === 'undefined' || !isValidScaleChangedPayload(detail)) return
  window.dispatchEvent(new CustomEvent<ScaleChangedPayload>(SCALE_CHANGED_EVENT, { detail }))
}

export function dispatchDividerDrag(detail: DividerDragPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<DividerDragPayload>(DIVIDER_DRAG_EVENT, { detail }))
}
