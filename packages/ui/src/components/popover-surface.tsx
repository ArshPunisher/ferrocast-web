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

  const headerRect = visibleChromeRect('header')
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
  const top = up
    ? Math.max(bounds.top, anchor.top - gap - height)
    : Math.min(anchor.bottom + gap, Math.max(bounds.top, bounds.bottom - height))

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

  const setSurfaceRefs = (node: HTMLElement | null) => {
    localRef.current = node
    if (externalRef) externalRef.current = node
  }

  const anchorKey = anchorRect
    ? `${anchorRect.left},${anchorRect.top},${anchorRect.right},${anchorRect.bottom}`
    : ''
  const parentKey = parentMenuRect
    ? `${parentMenuRect.left},${parentMenuRect.top},${parentMenuRect.right},${parentMenuRect.bottom}`
    : ''

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      setHost(null)
      setAnchorWidth(null)
      return
    }
    const anchor = anchorRef?.current ?? anchorEl ?? null
    const dialog = anchor?.closest('dialog')
    const nextHost = dialog && dialog.isConnected ? dialog : document.body
    if (host !== nextHost) {
      setHost(nextHost)
      return
    }
    const el = localRef.current
    if (!el) return

    const aRect: RectBox | null = anchorRect ?? (anchor ? anchor.getBoundingClientRect() : null)
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
        width: el.offsetWidth || el.getBoundingClientRect().width || 200,
        height: el.offsetHeight || el.getBoundingClientRect().height || 0,
        scrollHeight: el.scrollHeight || el.offsetHeight || 0,
      },
      bounds,
      placement,
      align,
      gap,
      parentMenuRect,
    })

    setPos({
      ...computed,
      left: computed.left - originX,
      top: computed.top - originY,
    })
  }, [
    open,
    host,
    anchorEl,
    anchorRef,
    anchorKey,
    parentKey,
    anchorRect,
    parentMenuRect,
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
    if (!open || !host) return
    pushPopover(id)
    return () => removePopover(id)
  }, [open, host, id])

  useEffect(() => {
    if (!open || !host) return
    const el = localRef.current
    const anchor = anchorRef?.current ?? anchorEl ?? null
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(() => {
      setResizeTick((t) => t + 1)
      notifyPreviewOverlays()
    })
    if (el) ro.observe(el)
    if (anchor) ro.observe(anchor)
    return () => ro.disconnect()
  }, [open, host, anchorEl, anchorRef])

  useEffect(() => {
    if (!open || !host) return
    const onResize = () => {
      if (closeOnResize) onClose('resize')
      else setResizeTick((t) => t + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, host, closeOnResize, onClose])

  useEffect(() => {
    if (!open || !host || !dismissible) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      const anchor = anchorRef?.current ?? anchorEl ?? null
      if (localRef.current?.contains(target) || anchor?.contains(target)) return
      if (
        ignoreOutsideSelector &&
        target instanceof Element &&
        target.closest(ignoreOutsideSelector)
      )
        return
      if (shouldIgnoreOutsidePointerDown?.(e)) return
      onClose('outside')
    }
    const onDocKey = (e: KeyboardEvent) => {
      if (!closeOnEscape || e.key !== 'Escape') return
      if (e.defaultPrevented || !isTopPopover(id)) return
      e.preventDefault()
      e.stopPropagation()
      onClose('escape')
    }
    const onScroll = (e: Event) => {
      if (!closeOnScroll) return
      const t = e.target
      if (t instanceof Node && localRef.current?.contains(t)) return
      if (ignoreOutsideSelector && t instanceof Element && t.closest(ignoreOutsideSelector)) return
      onClose('scroll')
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
    host,
    dismissible,
    id,
    anchorEl,
    anchorRef,
    ignoreOutsideSelector,
    shouldIgnoreOutsidePointerDown,
    closeOnEscape,
    closeOnScroll,
    onClose,
  ])

  if (!open || typeof document === 'undefined') return null
  const portalTarget = host ?? document.body

  const mergedStyle: CSSProperties = {
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    maxHeight: pos?.maxHeight,
    maxWidth: pos?.maxWidth,
    ...(matchAnchorWidth && anchorWidth ? { minWidth: anchorWidth } : {}),
    ...(pos ? {} : { visibility: 'hidden' }),
    ...style,
  }

  const handleKeyDown: HTMLAttributes<HTMLElement>['onKeyDown'] = (e) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (closeOnTab && e.key === 'Tab') {
      onClose('tab')
    }
  }

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
        'fixed z-[80] overflow-y-auto overscroll-contain',
        'motion-safe:animate-[fc-fade_140ms_var(--fc-ease-out)]',
        className,
      )}
    >
      {children}
    </Tag>,
    portalTarget,
  )
}
