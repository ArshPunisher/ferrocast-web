// The small (i) that holds a screen's explanations, so screens stay short (owner, 24 Oct:
// "very less text"). Opens on hover, focus or tap; Escape, tapping elsewhere or scrolling
// closes it. The text is always in the page for screen readers (the button describes itself
// with it), and the bubble is drawn in a portal so a card's edge never cuts it off.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from '@phosphor-icons/react'
import { cx } from '../cx'

const GAP = 6
const EDGE = 8

export function InfoTip({
  children,
  label = 'More info',
  id,
  className,
}: {
  children: ReactNode
  /** The button's name for screen readers ("About Upload protection"). */
  label?: string
  /** Use this id for the text (a field points `aria-describedby` at it). */
  id?: string
  className?: string
}) {
  const auto = useId()
  const textId = id ?? `${auto}-tip`
  const btn = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // Inside a modal dialog the bubble must be in it (the dialog sits above the page).
  const [host, setHost] = useState<HTMLElement | null>(null)
  const closing = useRef<number | undefined>(undefined)

  const show = () => {
    window.clearTimeout(closing.current)
    setHost(btn.current?.closest('dialog') ?? document.body)
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

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const b = btn.current?.getBoundingClientRect()
    const t = bubble.current?.getBoundingClientRect()
    if (!b || !t) return
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const left = Math.min(Math.max(b.left + b.width / 2 - t.width / 2, EDGE), vw - t.width - EDGE)
    const below = b.bottom + GAP + t.height <= vh - EDGE
    const top = below ? b.bottom + GAP : Math.max(EDGE, b.top - GAP - t.height)
    // A dialog can be transformed: "fixed" is then relative to it.
    const origin = host && host !== document.body ? host.getBoundingClientRect() : null
    setPos({ left: left - (origin?.left ?? 0), top: top - (origin?.top ?? 0) })
  }, [open, host])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setPinned(false)
      }
    }
    const away = (e: PointerEvent) => {
      const n = e.target as Node
      if (!btn.current?.contains(n) && !bubble.current?.contains(n)) {
        setOpen(false)
        setPinned(false)
      }
    }
    const scroll = () => {
      setOpen(false)
      setPinned(false)
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', away)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])

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
        onBlur={(e) => {
          if (!bubble.current?.contains(e.relatedTarget as Node | null)) hide()
        }}
        onClick={() => {
          window.clearTimeout(closing.current)
          setHost(btn.current?.closest('dialog') ?? document.body)
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
      <span id={textId} className="sr-only">
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubble}
            aria-hidden
            onPointerEnter={show}
            onPointerLeave={() => !pinned && hide()}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            className={cx(
              'fixed z-[1000] max-w-[min(300px,calc(100vw-16px))] rounded-[10px] border border-line bg-surface-1 px-3 py-2',
              'text-[14px] leading-snug font-normal tracking-normal text-pretty text-text-2 shadow-pop',
              'motion-safe:animate-[fc-tip_120ms_ease-out]',
            )}
          >
            {children}
          </div>,
          host ?? document.body,
        )}
    </>
  )
}
