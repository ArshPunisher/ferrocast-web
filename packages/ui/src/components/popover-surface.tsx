import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import { notifyPreviewOverlays, usePreviewHole } from './preview-overlay-registry'

export type PopoverPlacement = 'bottom' | 'top' | 'right' | 'left'
export type PopoverAlign = 'start' | 'end' | 'center'

export interface RectBox {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface SafeBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ComputedPopoverPosition {
  left: number
  top: number
  maxHeight: number
  maxWidth: number
  placedSide: PopoverPlacement
}

export const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Returns visible focusable elements within `container`. */
export function findFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => {
    if (el.closest('[hidden], .hidden')) return false
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return false
    }
    return true
  })
}

const openPopoverStack: string[] = []

function pushPopover(id: string): void {
  const idx = openPopoverStack.indexOf(id)
  if (idx !== -1) openPopoverStack.splice(idx, 1)
  openPopoverStack.push(id)
}

function removePopover(id: string): void {
  const idx = openPopoverStack.indexOf(id)
  if (idx !== -1) openPopoverStack.splice(idx, 1)
}

function isTopPopover(id: string): boolean {
  return openPopoverStack[openPopoverStack.length - 1] === id
}

function visibleChromeRect(selector: string): DOMRect | null {
  const node = document.querySelector(selector)
  if (!node) return null
  const cs = getComputedStyle(node)
  if (cs.display === 'none' || cs.visibility === 'hidden') return null
  if (cs.position !== 'fixed' && cs.position !== 'sticky') return null
  const rect = node.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? rect : null
}

/**
 * Computes safe viewport bounds inset from sticky headers, visible top banners, the Studio
 * status bar, and the mobile bottom tab bar. Inside a modal `<dialog>` top layer, uses the
 * full viewport edges instead of page chrome behind the dialog backdrop.
 */
export function safeViewportBounds(edgePadding = 8, insideDialog = false): SafeBounds {
  const vw = document.documentElement.clientWidth || window.innerWidth
  const vh = document.documentElement.clientHeight || window.innerHeight
  if (insideDialog) {
    return {
      left: edgePadding,
      top: edgePadding,
      right: Math.max(edgePadding + 80, vw - edgePadding),
      bottom: Math.max(edgePadding + 60, vh - edgePadding),
    }
  }

  const hasAppHeader = document.querySelector('header[data-app-header]') !== null
  const headerRect = hasAppHeader
    ? visibleChromeRect('header[data-app-header]')
    : visibleChromeRect('header')
  const headerBottom =
    headerRect && headerRect.top <= 1 && headerRect.bottom > 0 ? headerRect.bottom : 0

  let bannerBottom = 0
  const bannersEl = document.querySelector('[data-banners-wrap]')
  if (bannersEl) {
    const bcs = getComputedStyle(bannersEl)
    if (bcs.display !== 'none' && bcs.visibility !== 'hidden') {
      const br = bannersEl.getBoundingClientRect()
      if (br.height > 0 && br.top >= -1 && br.top <= headerBottom + 2) {
        bannerBottom = br.bottom
      }
    }
  }

  const topChrome = Math.max(headerBottom, bannerBottom)
  const top = topChrome > 0 ? Math.max(edgePadding, topChrome + edgePadding) : edgePadding

  const footerRect = visibleChromeRect('footer[aria-label="Studio status"]')
  const navRect = visibleChromeRect('nav[data-tab-bar]')
  const statusCss = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--fc-statusbar') || '0',
  )
  const statusLimit = vh - (Number.isFinite(statusCss) ? Math.max(0, statusCss) : 0) - edgePadding
  const bottom = Math.max(
    top + 60,
    Math.min(
      vh - edgePadding,
      statusLimit,
      footerRect ? footerRect.top - edgePadding : vh - edgePadding,
      navRect ? navRect.top - edgePadding : vh - edgePadding,
    ),
  )

  return {
    left: edgePadding,
    top,
    right: Math.max(edgePadding + 80, vw - edgePadding),
    bottom,
  }
}

/**
 * Pure collision-aware positioning inside `bounds`. Flips vertical or horizontal placement when
 * the preferred side lacks room, clamps within `bounds`, and caps `maxWidth` / `maxHeight`.
 */
export function computePopoverPosition({
  anchor,
  surface,
  bounds,
  placement = 'bottom',
  align = 'start',
  gap = 6,
  parentMenuRect,
}: {
  anchor: RectBox
  surface: { width: number; height: number; scrollHeight: number }
  bounds: SafeBounds
  placement?: PopoverPlacement | undefined
  align?: PopoverAlign | undefined
  gap?: number | undefined
  parentMenuRect?: RectBox | null | undefined
}): ComputedPopoverPosition {
  const maxWidth = Math.max(80, bounds.right - bounds.left)
  const width = Math.min(surface.width, maxWidth)
  const naturalHeight = Math.max(surface.height, surface.scrollHeight)

  if (placement === 'right' || placement === 'left') {
    const parentBox = parentMenuRect ?? anchor
    const overlap = gap < 0 ? -gap : 0
    const step = gap < 0 ? 0 : gap
    const spaceRight = Math.max(0, bounds.right - (parentBox.right - overlap + step))
    const spaceLeft = Math.max(0, parentBox.left + overlap - step - bounds.left)
    const placeLeft =
      placement === 'left'
        ? !(width > spaceLeft && spaceRight > spaceLeft)
        : width > spaceRight && spaceLeft > spaceRight

    const rawLeft = placeLeft
      ? parentBox.left + overlap - step - width
      : parentBox.right - overlap + step
    const left = Math.max(bounds.left, Math.min(rawLeft, bounds.right - width))

    const maxHeight = Math.max(0, bounds.bottom - bounds.top)
    const height = Math.min(naturalHeight, maxHeight)
    const rawTop =
      align === 'end'
        ? anchor.bottom - height
        : align === 'center'
          ? anchor.top + anchor.height / 2 - height / 2
          : anchor.top - 6
    const top = Math.max(bounds.top, Math.min(rawTop, Math.max(bounds.top, bounds.bottom - height)))
    return {
      left,
      top,
      maxHeight,
      maxWidth,
      placedSide: placeLeft ? 'left' : 'right',
    }
  }

  const below = Math.max(0, bounds.bottom - (anchor.bottom + gap))
  const above = Math.max(0, anchor.top - gap - bounds.top)
  const up =
    placement === 'top'
      ? !(naturalHeight > above && below > above)
      : naturalHeight > below && above > below

  const available = up ? above : below
  const maxHeight = Math.min(bounds.bottom - bounds.top, Math.max(0, available))
  const height = Math.min(naturalHeight, maxHeight)
  const rawTop = up ? anchor.top - gap - height : anchor.bottom + gap
  const top = Math.max(bounds.top, Math.min(rawTop, Math.max(bounds.top, bounds.bottom - height)))

  const wantLeft =
    align === 'end'
      ? anchor.right - width
      : align === 'center'
        ? anchor.left + anchor.width / 2 - width / 2
        : anchor.left
  const left = Math.max(bounds.left, Math.min(wantLeft, bounds.right - width))

  return {
    left,
    top,
    maxHeight,
    maxWidth,
    placedSide: up ? 'top' : 'bottom',
  }
}

export type PopoverCloseReason = 'outside' | 'escape' | 'scroll' | 'resize' | 'tab'

export interface PopoverSurfaceProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'role' | 'children'
> {
  open: boolean
  onClose: (reason: PopoverCloseReason) => void
  /** Anchor element (used for positioning and detecting an enclosing `<dialog>`). */
  anchorEl?: HTMLElement | null | undefined
  /** Anchor ref (preferred when trigger ref is stable). */
  anchorRef?: RefObject<HTMLElement | null> | undefined
  /** Explicit virtual rect (e.g. pointer coordinates or parent menu item rect). */
  anchorRect?: RectBox | null | undefined
  /** Enclosing parent menu rect for horizontal submenu flipping. */
  parentMenuRect?: RectBox | null | undefined
  /** Element whose bounding rect constrains horizontal/vertical placement. */
  withinEl?: Element | null | undefined
  placement?: PopoverPlacement | undefined
  align?: PopoverAlign | undefined
  gap?: number | undefined
  edgePadding?: number | undefined
  matchAnchorWidth?: boolean | undefined
  as?: 'div' | 'ul' | undefined
  role?: AriaRole | undefined
  surfaceRef?: RefObject<HTMLElement | null> | undefined
  closeOnResize?: boolean | undefined
  closeOnScroll?: boolean | undefined
  closeOnEscape?: boolean | undefined
  closeOnTab?: boolean | undefined
  /** Focus target once positioned and visible on open. */
  focusOnOpen?: 'first' | 'surface' | undefined
  /** Selector for related floating elements (e.g. submenus) that don't trigger outside-close. */
  ignoreOutsideSelector?: string | undefined
  /** Custom outside pointerdown predicate (e.g. menu opened from a More panel button). */
  shouldIgnoreOutsidePointerDown?: ((e: PointerEvent) => boolean) | undefined
  /** Register outside-close / escape / scroll listeners (set false on submenus owned by root). */
  dismissible?: boolean | undefined
  /** Also skip registering/punching holes in PreviewOverlayRegistry (default false). */
  disableHole?: boolean | undefined
  children: ReactNode
}

/**
 * Shared floating surface for menus, popovers, submenus, and tooltips:
 * - Mounts only while `open === true`
 * - Portals to `document.body`, or directly into an enclosing `<dialog>` top layer
 * - Collision flips & viewport clamps safely away from headers, banners, statusbar, and tab bar
 * - Uses opacity-only motion (no layout-shifting scale/translateY during open)
 * - Registers in `PreviewOverlayRegistry` once positioned (never on frame 1 at `(0,0)`)
 */
export function PopoverSurface({
  open,
  onClose,
  anchorEl,
  anchorRef,
  anchorRect,
  parentMenuRect,
  withinEl,
  placement = 'bottom',
  align = 'start',
  gap = 6,
  edgePadding = 8,
  matchAnchorWidth = false,
  as = 'div',
  role,
  surfaceRef: externalRef,
  closeOnResize = true,
  closeOnScroll = true,
  closeOnEscape = true,
  closeOnTab = false,
  focusOnOpen,
  ignoreOutsideSelector,
  shouldIgnoreOutsidePointerDown,
  dismissible = true,
  disableHole = false,
  className,
  style,
  onKeyDown,
  children,
  ...rest
}: PopoverSurfaceProps) {
  const id = useId()
  const localRef = useRef<HTMLElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState<ComputedPopoverPosition | null>(null)
  const [anchorWidth, setAnchorWidth] = useState<number | null>(null)
  const [resizeTick, setResizeTick] = useState(0)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const ignoreDownRef = useRef(shouldIgnoreOutsidePointerDown)
  ignoreDownRef.current = shouldIgnoreOutsidePointerDown
  const anchorRectRef = useRef(anchorRect)
  anchorRectRef.current = anchorRect
  const parentMenuRectRef = useRef(parentMenuRect)
  parentMenuRectRef.current = parentMenuRect
  const styleMaxWRef = useRef(style?.maxWidth)
  styleMaxWRef.current = style?.maxWidth
  const openerRef = useRef<HTMLElement | null>(null)
  const didAutoFocusRef = useRef(false)

  const setSurfaceRefs = (node: HTMLElement | null) => {
    localRef.current = node
    if (externalRef) externalRef.current = node
  }

  const anchor = anchorRef?.current ?? anchorEl ?? null
  const enclosingDialog = anchor?.closest('dialog')
  const syncHost = anchor
    ? enclosingDialog && enclosingDialog.isConnected
      ? enclosingDialog
      : document.body
    : null
  const effectiveHost = syncHost ?? host

  const anchorKey = anchorRect
    ? `${anchorRect.left},${anchorRect.top},${anchorRect.right},${anchorRect.bottom}`
    : ''
  const parentKey = parentMenuRect
    ? `${parentMenuRect.left},${parentMenuRect.top},${parentMenuRect.right},${parentMenuRect.bottom}`
    : ''

  useLayoutEffect(() => {
    if (!open) {
      openerRef.current = null
      return
    }
    if (!openerRef.current && typeof document !== 'undefined') {
      const active = document.activeElement
      if (active instanceof HTMLElement && !localRef.current?.contains(active)) {
        openerRef.current = active
      }
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      setHost(null)
      setAnchorWidth(null)
      return
    }
    const curAnchor = anchorRef?.current ?? anchorEl ?? null
    const dialog = curAnchor?.closest('dialog')
    const nextHost = dialog && dialog.isConnected ? dialog : document.body
    if (host !== nextHost) {
      setHost(nextHost)
    }
    const el = localRef.current
    if (!el) return

    const aRect: RectBox | null =
      anchorRectRef.current ?? (curAnchor ? curAnchor.getBoundingClientRect() : null)
    if (!aRect) return

    if (matchAnchorWidth && aRect.width > 0) {
      setAnchorWidth((prev) => (prev === aRect.width ? prev : aRect.width))
    }

    const insideDialog = nextHost !== document.body
    let bounds = safeViewportBounds(edgePadding, insideDialog)
    if (withinEl) {
      const wr = withinEl.getBoundingClientRect()
      if (wr.width > 0 && wr.height > 0) {
        bounds = {
          left: Math.max(bounds.left, wr.left + edgePadding),
          top: Math.max(bounds.top, wr.top + edgePadding),
          right: Math.min(bounds.right, wr.right - edgePadding),
          bottom: Math.min(bounds.bottom, wr.bottom - edgePadding),
        }
      }
    }

    // Read authored CSS max-width before any viewport clamp inline maxWidth overrides it.
    const prevInlineMaxW = el.style.maxWidth
    const prevInlineMinW = el.style.minWidth
    el.style.maxWidth = styleMaxWRef.current !== undefined ? String(styleMaxWRef.current) : ''
    if (matchAnchorWidth) el.style.minWidth = ''
    const cssMaxRaw = getComputedStyle(el).maxWidth
    const cssMaxW = cssMaxRaw && cssMaxRaw !== 'none' ? parseFloat(cssMaxRaw) : NaN
    const naturalW = el.offsetWidth || el.getBoundingClientRect().width || 200
    const naturalH = el.offsetHeight || el.getBoundingClientRect().height || 0
    const naturalScrollH = el.scrollHeight || el.offsetHeight || 0
    el.style.maxWidth = prevInlineMaxW
    el.style.minWidth = prevInlineMinW

    const boundsMaxW = Math.max(80, bounds.right - bounds.left)
    const capW =
      Number.isFinite(cssMaxW) && cssMaxW > 0 ? Math.min(cssMaxW, boundsMaxW) : boundsMaxW
    const surfaceW = matchAnchorWidth
      ? Math.min(capW, Math.max(naturalW, aRect.width))
      : Math.min(capW, naturalW)

    // If the host element itself is transformed, `position: fixed` coordinates are relative to it.
    let originX = 0
    let originY = 0
    if (nextHost !== document.body && getComputedStyle(nextHost).transform !== 'none') {
      const hr = nextHost.getBoundingClientRect()
      originX = hr.left
      originY = hr.top
    }

    const computed = computePopoverPosition({
      anchor: aRect,
      surface: {
        width: surfaceW,
        height: naturalH,
        scrollHeight: naturalScrollH,
      },
      bounds,
      placement,
      align,
      gap,
      parentMenuRect: parentMenuRectRef.current,
    })

    const nextPos: ComputedPopoverPosition = {
      ...computed,
      left: computed.left - originX,
      top: computed.top - originY,
      maxWidth: capW,
    }

    setPos((prev) =>
      prev &&
      prev.left === nextPos.left &&
      prev.top === nextPos.top &&
      prev.maxHeight === nextPos.maxHeight &&
      prev.maxWidth === nextPos.maxWidth &&
      prev.placedSide === nextPos.placedSide
        ? prev
        : nextPos,
    )
  }, [
    open,
    host,
    anchorEl,
    anchorRef,
    anchorKey,
    parentKey,
    withinEl,
    placement,
    align,
    gap,
    edgePadding,
    matchAnchorWidth,
    resizeTick,
  ])

  usePreviewHole(localRef, {
    active: open && pos !== null && !disableHole,
    deps: [pos?.left, pos?.top, pos?.maxHeight, pos?.maxWidth],
  })

  useEffect(() => {
    if (!open || !pos) {
      if (!open) didAutoFocusRef.current = false
      return
    }
    if (!focusOnOpen || didAutoFocusRef.current) return
    didAutoFocusRef.current = true
    const el = localRef.current
    if (!el) return
    if (focusOnOpen === 'first') {
      const target = findFocusableElements(el)[0] ?? el
      target.focus({ preventScroll: true })
    } else {
      el.focus({ preventScroll: true })
    }
  }, [open, pos, focusOnOpen])

  useEffect(() => {
    if (!open || !effectiveHost || !dismissible || !closeOnEscape) return
    pushPopover(id)
    return () => removePopover(id)
  }, [open, effectiveHost, dismissible, closeOnEscape, id])

  useEffect(() => {
    if (!open || !effectiveHost) return
    const el = localRef.current
    const curAnchor = anchorRef?.current ?? anchorEl ?? null
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(() => {
      setResizeTick((t) => t + 1)
      notifyPreviewOverlays()
    })
    if (el) ro.observe(el)
    if (curAnchor) ro.observe(curAnchor)
    return () => ro.disconnect()
  }, [open, effectiveHost, anchorEl, anchorRef])

  useEffect(() => {
    if (!open || !effectiveHost) return
    const onResize = () => {
      if (closeOnResize) onCloseRef.current('resize')
      else setResizeTick((t) => t + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, effectiveHost, closeOnResize])

  useEffect(() => {
    if (!open || !effectiveHost || !dismissible) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      const curAnchor = anchorRef?.current ?? anchorEl ?? null
      if (localRef.current?.contains(target) || curAnchor?.contains(target)) return
      if (
        ignoreOutsideSelector &&
        target instanceof Element &&
        target.closest(ignoreOutsideSelector)
      )
        return
      if (ignoreDownRef.current?.(e)) return
      onCloseRef.current('outside')
    }
    const onDocKey = (e: KeyboardEvent) => {
      if (!closeOnEscape || e.key !== 'Escape') return
      if (e.defaultPrevented || !isTopPopover(id)) return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current('escape')
    }
    const ancestorScrolls = new Map<Element, { top: number; left: number }>()
    let curScrollEl: Element | null = anchorRef?.current ?? anchorEl ?? null
    while (curScrollEl) {
      ancestorScrolls.set(curScrollEl, { top: curScrollEl.scrollTop, left: curScrollEl.scrollLeft })
      curScrollEl = curScrollEl.parentElement
    }
    const docScroll = { top: window.scrollY, left: window.scrollX }
    const onScroll = (e: Event) => {
      if (!closeOnScroll) return
      const t = e.target
      // A scroll event arrives a frame after the scroll itself: one that began before this opened
      // (a focus that scrolled the trigger into view) reports the same position, so it is not a move.
      if (
        t instanceof Document &&
        window.scrollY === docScroll.top &&
        window.scrollX === docScroll.left
      )
        return
      if (t instanceof Node && localRef.current?.contains(t)) return
      if (ignoreOutsideSelector && t instanceof Element && t.closest(ignoreOutsideSelector)) return
      if (t instanceof Element) {
        if (ancestorScrolls.size > 0 && !ancestorScrolls.has(t)) return
        const prev = ancestorScrolls.get(t)
        if (prev && prev.top === t.scrollTop && prev.left === t.scrollLeft) return
      }
      onCloseRef.current('scroll')
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onDocKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onDocKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [
    open,
    effectiveHost,
    dismissible,
    id,
    anchorEl,
    anchorRef,
    ignoreOutsideSelector,
    closeOnEscape,
    closeOnScroll,
  ])

  if (!open || typeof document === 'undefined' || !effectiveHost) return null
  const portalTarget = effectiveHost

  const cappedMinWidth =
    matchAnchorWidth && anchorWidth
      ? pos
        ? Math.min(anchorWidth, pos.maxWidth)
        : anchorWidth
      : null

  const mergedStyle: CSSProperties = {
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    maxHeight: pos?.maxHeight,
    maxWidth: pos?.maxWidth,
    ...(cappedMinWidth !== null ? { minWidth: cappedMinWidth } : {}),
    ...(pos ? {} : { visibility: 'hidden' }),
    ...style,
  }

  const handleKeyDown: HTMLAttributes<HTMLElement>['onKeyDown'] = (e) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (closeOnTab && e.key === 'Tab') {
      e.preventDefault()
      const curAnchor = anchorRef?.current ?? anchorEl ?? null
      const opener = openerRef.current
      const focusTarget =
        opener &&
        opener.isConnected &&
        opener !== document.body &&
        opener !== document.documentElement
          ? opener
          : curAnchor?.matches(FOCUSABLE_SELECTOR)
            ? curAnchor
            : (curAnchor?.querySelector<HTMLElement>(`[aria-haspopup], ${FOCUSABLE_SELECTOR}`) ??
              null)
      onCloseRef.current('tab')
      if (focusTarget && focusTarget.isConnected) focusTarget.focus({ preventScroll: true })
    }
  }

  const hasZClass = /\bz-(?:\[|\d)/.test(className ?? '')
  const Tag = as
  return createPortal(
    <Tag
      {...rest}
      ref={setSurfaceRefs as never}
      role={role}
      data-over-preview={disableHole ? undefined : ''}
      data-popover-side={pos?.placedSide}
      style={mergedStyle}
      onKeyDown={handleKeyDown}
      className={cx(
        'fixed overflow-y-auto overscroll-contain',
        !hasZClass && 'z-[80]',
        'motion-safe:animate-[fc-fade_140ms_var(--fc-ease-out)]',
        className,
      )}
    >
      {children}
    </Tag>,
    portalTarget,
  )
}
