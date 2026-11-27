import { useEffect, useId, useLayoutEffect, type RefObject } from 'react'

export const PREVIEW_OVERLAYS_EVENT = 'fc:preview-overlays'
export const PREVIEW_HOLES_EVENT = 'fc:preview-holes'
export const PREVIEW_OVERLAY_ATTR = 'data-over-preview'
export const PREVIEW_GUIDE_ATTR = 'data-guide-hole'

/** Non-guide overlays allowed before hiding the native preview altogether. */
export const PREVIEW_MAX_OVERLAYS = 16
/** Total holes accepted by the native preview engine (`PREVIEW_HOLES`). */
export const PREVIEW_MAX_HOLES = 64
/** Single non-guide overlay stage coverage ratio above which we collapse to one full-stage hole. */
export const PREVIEW_FULL_COVER_RATIO = 0.85

export type PreviewHoleKind = 'overlay' | 'guide'
export type PreviewHoleTarget = Element | (() => DOMRect | null)

export interface PreviewOverlayOptions {
  target: PreviewHoleTarget
  kind?: PreviewHoleKind | undefined
  radius?: number | undefined
  getRect?: (() => DOMRect | null) | undefined
}

export interface RegisteredPreviewOverlay {
  id: string
  target: PreviewHoleTarget
  kind: PreviewHoleKind
  radius?: number | undefined
  getRect?: (() => DOMRect | null) | undefined
}

export interface PreviewHoleRect {
  x: number
  y: number
  w: number
  h: number
  r: number
}

export interface PreviewOverlaySnapshotItem extends PreviewHoleRect {
  id: string
  kind: PreviewHoleKind
}

export interface PreviewOverlaysEventDetail {
  version: number
  overlayCount: number
  guideCount: number
  overlays: PreviewOverlaySnapshotItem[]
}

const entries = new Map<string, RegisteredPreviewOverlay>()
const listeners = new Set<() => void>()
const observedEls = new Map<Element, number>()
let sharedRo: ResizeObserver | null = null
let roRaf = 0
let version = 0
let pendingEventRaf = 0

function ensureSharedObserver(): ResizeObserver | null {
  if (typeof ResizeObserver !== 'function') return null
  if (!sharedRo) {
    sharedRo = new ResizeObserver(() => {
      if (roRaf) return
      if (typeof requestAnimationFrame !== 'function') {
        notifyPreviewOverlays()
        return
      }
      roRaf = requestAnimationFrame(() => {
        roRaf = 0
        notifyPreviewOverlays()
      })
    })
  }
  return sharedRo
}

function observeOverlayResize(el: Element): void {
  const count = observedEls.get(el) ?? 0
  observedEls.set(el, count + 1)
  if (count === 0) ensureSharedObserver()?.observe(el)
}

function unobserveOverlayResize(el: Element): void {
  const count = observedEls.get(el) ?? 0
  if (count <= 1) {
    observedEls.delete(el)
    sharedRo?.unobserve(el)
  } else {
    observedEls.set(el, count - 1)
  }
}

function elementOf(entry: RegisteredPreviewOverlay): Element | null {
  return typeof entry.target === 'function' ? null : entry.target
}

export function isOverlayElementVisible(el: Element): boolean {
  if (!el.isConnected) return false
  if (typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
  }
  return true
}

function radiusOf(el: Element | null, explicit?: number): number {
  if (explicit !== undefined) return Math.max(0, Math.min(200, explicit))
  if (!el || typeof getComputedStyle !== 'function') return 0
  return Math.min(200, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0)
}

function resolveEntryRect(entry: RegisteredPreviewOverlay): {
  el: Element | null
  rect: DOMRect | null
} {
  const el = elementOf(entry)
  if (el) {
    if (typeof HTMLDialogElement !== 'undefined' && el instanceof HTMLDialogElement) {
      return { el, rect: null }
    }
    if (!isOverlayElementVisible(el)) return { el, rect: null }
    const rect = entry.getRect ? entry.getRect() : el.getBoundingClientRect()
    return { el, rect }
  }
  const rect = entry.getRect ? entry.getRect() : (entry.target as () => DOMRect | null)()
  return { el: null, rect }
}

function dispatchOverlayEvent(): void {
  pendingEventRaf = 0
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  const detail = getPreviewOverlaySnapshot()
  window.dispatchEvent(
    new CustomEvent<PreviewOverlaysEventDetail>(PREVIEW_OVERLAYS_EVENT, { detail }),
  )
}

function scheduleEventDispatch(): void {
  if (typeof window === 'undefined') return
  if (typeof requestAnimationFrame !== 'function') {
    dispatchOverlayEvent()
    return
  }
  if (!pendingEventRaf) {
    pendingEventRaf = requestAnimationFrame(dispatchOverlayEvent)
  }
}

/** Notify subscribers and listeners that overlay rects or visibility changed. */
export function notifyPreviewOverlays(): void {
  version += 1
  for (const cb of [...listeners]) cb()
  scheduleEventDispatch()
}

/** Register an overlay or guide element/rect function so the native preview cuts a hole under it. */
export function registerPreviewHole(
  id: string,
  targetOrOptions: PreviewHoleTarget | PreviewOverlayOptions,
): () => void {
  const opts: PreviewOverlayOptions =
    typeof targetOrOptions === 'function' || 'nodeType' in targetOrOptions
      ? { target: targetOrOptions }
      : targetOrOptions
  const entry: RegisteredPreviewOverlay = {
    id,
    target: opts.target,
    kind: opts.kind ?? 'overlay',
    radius: opts.radius,
    getRect: opts.getRect,
  }
  const prev = entries.get(id)
  if (prev && prev.kind === 'overlay') {
    const prevEl = elementOf(prev)
    if (prevEl) unobserveOverlayResize(prevEl)
  }
  entries.set(id, entry)
  const el = elementOf(entry)
  if (entry.kind === 'overlay' && el) observeOverlayResize(el)
  notifyPreviewOverlays()
  return () => {
    if (entries.get(id) !== entry) return
    entries.delete(id)
    if (entry.kind === 'overlay' && el) unobserveOverlayResize(el)
    notifyPreviewOverlays()
  }
}

export function subscribePreviewOverlays(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getPreviewOverlays(): readonly RegisteredPreviewOverlay[] {
  return [...entries.values()]
}

export function getPreviewOverlaySnapshot(): PreviewOverlaysEventDetail {
  const overlays: PreviewOverlaySnapshotItem[] = []
  let overlayCount = 0
  let guideCount = 0
  for (const entry of entries.values()) {
    const { el, rect } = resolveEntryRect(entry)
    if (!rect || rect.width < 1 || rect.height < 1) continue
    const kind: PreviewHoleKind =
      entry.kind === 'guide' || el?.hasAttribute(PREVIEW_GUIDE_ATTR) ? 'guide' : 'overlay'
    if (kind === 'guide') guideCount += 1
    else overlayCount += 1
    overlays.push({
      id: entry.id,
      kind,
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
      r: radiusOf(el, entry.radius),
    })
  }
  return { version, overlayCount, guideCount, overlays }
}

export interface CollectPreviewHolesOptions {
  maxOverlays?: number | undefined
  maxHoles?: number | undefined
  fullCoverRatio?: number | undefined
  extraDomSelector?: string | undefined
  ignoreDockDrag?: boolean | undefined
}

/**
 * Collect box-relative holes from registered overlays (plus optional fallback DOM selector),
 * enforcing visibility filtering, >85% single-overlay stage collapse, and engine hole caps.
 * Returns `null` when dock dragging is active or non-guide overlays exceed `maxOverlays`.
 */
export function collectPreviewHoles(
  box: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>,
  edge = 0,
  opts: CollectPreviewHolesOptions = {},
): PreviewHoleRect[] | null {
  if (!opts.ignoreDockDrag && typeof document !== 'undefined' && document.body?.dataset?.dockDrag) {
    return null
  }
  if (box.width <= 0 || box.height <= 0) return []

  const maxOverlays = opts.maxOverlays ?? PREVIEW_MAX_OVERLAYS
  const maxHoles = opts.maxHoles ?? PREVIEW_MAX_HOLES
  const fullCoverRatio = opts.fullCoverRatio ?? PREVIEW_FULL_COVER_RATIO
  const boxArea = box.width * box.height

  const rx0 = box.x - edge
  const ry0 = box.y - edge
  const rx1 = box.x + box.width + edge
  const ry1 = box.y + box.height + edge

  const seen = new Set<Element>()
  const overlays: PreviewHoleRect[] = []
  const guides: PreviewHoleRect[] = []
  let fullStageCover = false

  const pushRect = (el: Element | null, b: DOMRect, kind: PreviewHoleKind, radius?: number) => {
    if (b.width < 1 || b.height < 1) return
    if (!(b.right > rx0 && b.left < rx1 && b.bottom > ry0 && b.top < ry1)) return
    const hole: PreviewHoleRect = {
      x: b.left - box.x,
      y: b.top - box.y,
      w: b.width,
      h: b.height,
      r: radiusOf(el, radius),
    }
    if (kind === 'guide' || el?.hasAttribute(PREVIEW_GUIDE_ATTR)) {
      guides.push(hole)
      return
    }
    if (boxArea > 0) {
      const ix = Math.max(0, Math.min(b.right, box.x + box.width) - Math.max(b.left, box.x))
      const iy = Math.max(0, Math.min(b.bottom, box.y + box.height) - Math.max(b.top, box.y))
      if ((ix * iy) / boxArea > fullCoverRatio) fullStageCover = true
    }
    overlays.push(hole)
  }

  for (const entry of entries.values()) {
    const { el, rect } = resolveEntryRect(entry)
    if (el) seen.add(el)
    if (!rect) continue
    pushRect(el, rect, entry.kind, entry.radius)
  }

  if (opts.extraDomSelector && typeof document !== 'undefined') {
    for (const el of document.querySelectorAll(opts.extraDomSelector)) {
      if (seen.has(el)) continue
      if (typeof HTMLDialogElement !== 'undefined' && el instanceof HTMLDialogElement) continue
      if (!isOverlayElementVisible(el)) continue
      pushRect(el, el.getBoundingClientRect(), 'overlay')
    }
  }

  if (overlays.length > maxOverlays) return null
  if (fullStageCover) {
    return maxHoles >= 1
      ? [{ x: -edge, y: -edge, w: box.width + 2 * edge, h: box.height + 2 * edge, r: 0 }]
      : null
  }
  if (overlays.length > maxHoles) return null
  return [...overlays, ...guides.slice(0, Math.max(0, maxHoles - overlays.length))]
}

function isElementRegistered(el: Element): boolean {
  const registeredEls = new Set<Element>()
  for (const entry of entries.values()) {
    const target = elementOf(entry)
    if (target) registeredEls.add(target)
  }
  let cur: Element | null = el
  while (cur) {
    if (registeredEls.has(cur)) return true
    cur = cur.parentElement
  }
  if (typeof HTMLDialogElement !== 'undefined' && el instanceof HTMLDialogElement) {
    for (const target of registeredEls) {
      if (el.contains(target)) return true
    }
  }
  return false
}

const UNREGISTERED_OVERLAY_SELECTOR =
  '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [role="tooltip"], [data-over-preview]'

/**
 * Dev/test invariant: returns any visible menu/listbox/dialog/tooltip or `[data-over-preview]`
 * overlapping `[data-stage-bg]` (or `stageEl`) that has no registered entry on itself or an ancestor.
 */
export function findUnregisteredPreviewOverlays(stageEl?: Element | null): Element[] {
  if (typeof document === 'undefined') return []
  const stages = stageEl ? [stageEl] : [...document.querySelectorAll('[data-stage-bg]')]
  const stageRects = stages
    .filter((s) => !s.hasAttribute('hidden'))
    .map((s) => s.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
  if (stageRects.length === 0) return []

  const bad: Element[] = []
  for (const el of document.querySelectorAll(UNREGISTERED_OVERLAY_SELECTOR)) {
    if (typeof HTMLDialogElement !== 'undefined' && el instanceof HTMLDialogElement) continue
    if (!isOverlayElementVisible(el)) continue
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    const overlaps = stageRects.some(
      (s) => b.right > s.left && b.left < s.right && b.bottom > s.top && b.top < s.bottom,
    )
    if (!overlaps) continue
    if (!isElementRegistered(el)) bad.push(el)
  }
  return bad
}

/** Clear all entries (tests only). */
export function resetPreviewOverlayRegistry(): void {
  entries.clear()
  observedEls.clear()
  sharedRo?.disconnect()
  sharedRo = null
  if (roRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(roRaf)
  }
  roRaf = 0
  if (pendingEventRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingEventRaf)
  }
  pendingEventRaf = 0
  version = 0
}

export interface UsePreviewHoleOptions {
  active?: boolean | undefined
  kind?: PreviewHoleKind | undefined
  radius?: number | undefined
  getRect?: (() => DOMRect | null) | undefined
  deps?: readonly unknown[] | undefined
}

/** Declaratively register a ref'd element in `PreviewOverlayRegistry` while active. */
export function usePreviewHole(
  ref: RefObject<Element | null>,
  options: boolean | UsePreviewHoleOptions = true,
): void {
  const id = useId()
  const opts: UsePreviewHoleOptions = typeof options === 'boolean' ? { active: options } : options
  const active = opts.active ?? true
  const kind = opts.kind
  const radius = opts.radius
  const getRect = opts.getRect

  useLayoutEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    return registerPreviewHole(id, { target: el, kind, radius, getRect })
  }, [active, id, kind, radius, getRect, ref])

  useEffect(() => {
    if (active) notifyPreviewOverlays()
    // Caller-supplied deps allow dynamic position/size props (e.g. drag coordinates) to emit updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...(opts.deps ?? [])])
}
