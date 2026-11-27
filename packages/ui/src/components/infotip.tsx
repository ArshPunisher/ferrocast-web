// The small (i) that holds a screen's explanations, so screens stay short (owner, 24 Oct:
// "very less text"). Opens on hover, focus or tap; Escape, tapping elsewhere or scrolling
// closes it. The text is always in the page for screen readers (the button describes itself
// with it), and the bubble is drawn via PopoverSurface so edges never cut it off and the
// preview leaves room for it.

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Info } from '@phosphor-icons/react'
import { cx } from '../cx'
import { PopoverSurface } from './popover-surface'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function hasInteractive(node: ReactNode): boolean {
  let found = false
  Children.forEach(node, (child) => {
    if (found || !isValidElement<{ children?: ReactNode; tabIndex?: number }>(child)) return
    if (
      typeof child.type === 'string' &&
      (child.type === 'a' ||
        child.type === 'button' ||
        child.type === 'input' ||
        child.type === 'select' ||
        child.type === 'textarea')
    ) {
      found = true
      return
    }
    if (typeof child.props.tabIndex === 'number' && child.props.tabIndex >= 0) {
      found = true
      return
    }
    if (child.props.children !== undefined && hasInteractive(child.props.children)) {
      found = true
    }
  })
  return found
}

export function InfoTip({
  children,
  label = 'More info',
  id,
  className,
  above = false,
}: {
  children: ReactNode
  /** The button's name for screen readers ("About Upload protection"). */
  label?: string
  /** Use this id for the text (a field points `aria-describedby` at it). */
  id?: string
  className?: string
  /** Open over the button, not under it (when what's under it is what the tip is about). */
  above?: boolean
}) {
  const auto = useId()
  const textId = id ?? `${auto}-tip`
  const btn = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closing = useRef<number | undefined>(undefined)
  const interactive = hasInteractive(children)

  const show = () => {
    window.clearTimeout(closing.current)
    setOpen(true)
  }
  // A short wait, so the pointer can move onto the bubble (it may hold a link).
  const hide = () => {
    window.clearTimeout(closing.current)
    closing.current = window.setTimeout(() => {
      setOpen(false)
      setPinned(false)
    }, 120)
  }

  const close = useCallback(() => {
    window.clearTimeout(closing.current)
    setOpen(false)
    setPinned(false)
  }, [])

  const onFocusLeave = (related: EventTarget | null) => {
    const next = related as Node | null
    if (btn.current?.contains(next) || bubble.current?.contains(next)) return
    hide()
  }

  useEffect(() => () => window.clearTimeout(closing.current), [])

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-describedby={textId}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && hide()}
        onFocus={show}
        onBlur={(e) => onFocusLeave(e.relatedTarget)}
        onClick={() => {
          window.clearTimeout(closing.current)
          if (pinned) {
            setPinned(false)
            setOpen(false)
          } else {
            setPinned(true)
            setOpen(true)
          }
        }}
        className={cx(
          'relative inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-text-3 transition-colors',
          'hover:text-text-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
          // A bigger touch target than the icon.
          'after:absolute after:-inset-1.5 after:content-[""]',
          open && 'text-text-2',
          className,
        )}
      >
        <Info size={16} weight="bold" aria-hidden />
      </button>
      {!open && (
        <span id={textId} className="sr-only">
          {textOf(children)}
        </span>
      )}
      <PopoverSurface
        open={open}
        onClose={close}
        anchorRef={btn}
        surfaceRef={bubble}
        id={textId}
        role={interactive ? 'region' : 'tooltip'}
        aria-label={interactive ? label : undefined}
        placement={above ? 'top' : 'bottom'}
        align="center"
        gap={6}
        edgePadding={8}
        onBlur={(e) => onFocusLeave(e.relatedTarget)}
        onPointerEnter={show}
        onPointerLeave={() => !pinned && hide()}
        className="z-[1000] max-w-[min(300px,calc(100vw-16px))] rounded-[10px] border border-line bg-surface-1 px-3 py-2 text-[14px] leading-snug font-normal tracking-normal text-pretty text-text-2 shadow-pop"
      >
        {children}
      </PopoverSurface>
    </>
  )
}

/**
 * One short line with its (i): the rest opens in place, under the line, and closes again (no
 * bubble). For banners and toasts, where a floating bubble could sit under the layer that holds
 * them or be cut off at a phone's edge. Without `detail` it is just the line.
 */
export function InfoLine({
  children,
  detail,
  label = 'More about this',
  className,
}: {
  children: ReactNode
  detail?: string | undefined
  /** The button's name for screen readers ("More about this warning"). */
  label?: string
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  if (!detail) return <div className={className}>{children}</div>
  return (
    <div className={className}>
      <div className="flex items-start justify-start gap-1">
        <div className="min-w-0">{children}</div>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={cx(
            'relative -my-0.5 inline-grid size-6 shrink-0 place-items-center rounded-full text-text-3 transition-colors',
            'hover:text-text-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
            'after:absolute after:-inset-1.5 after:content-[""]',
            open && 'text-text-2',
          )}
        >
          <Info size={16} weight={open ? 'fill' : 'bold'} aria-hidden />
        </button>
      </div>
      {open && (
        <p id={id} className="mt-1 text-[14px] leading-snug break-words text-text-2">
          {detail}
        </p>
      )}
    </div>
  )
}
