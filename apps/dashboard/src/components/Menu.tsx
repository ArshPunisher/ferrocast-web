import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cx } from '@ferrocast/ui'

export interface MenuItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  /** Short, on the right (a shortcut or a state). */
  hint?: ReactNode
  /** A line under the label saying what the item does. */
  description?: ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

/**
 * A small dropdown menu: opens from its trigger (origin-aware), arrow keys move, Escape
 * closes and returns focus, clicking outside closes. It renders in a portal with fixed
 * coordinates, so a card with `overflow: hidden` can't cut it off, and opens upward when
 * there's no room below. Scrolling or resizing closes it rather than leaving it behind.
 */
export function Menu({
  trigger,
  items,
  align = 'start',
  label,
  className,
}: {
  trigger: (props: {
    onClick: () => void
    'aria-expanded': boolean
    'aria-haspopup': 'menu'
    'aria-controls': string
  }) => ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const reduce = useReducedMotion()
  // Where the open list sits on screen (fixed), and whether it opened upward.
  const [pos, setPos] = useState<{
    top: number
    left: number
    up: boolean
    maxHeight: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const el = list.current
    const box = wrap.current
    if (!el || !box) return
    // From layout sizes, not the on-screen rect: the list is still scaling in at this point.
    const b = box.getBoundingClientRect()
    const width = el.offsetWidth
    const gap = 8
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const want = align === 'end' ? b.right - width : b.left
    const left = Math.max(gap, Math.min(want, vw - gap - width))
    const below = vh - b.bottom - gap - 6
    const above = b.top - gap - 6
    const up = el.scrollHeight > below && above > below
    // A list taller than the room it gets scrolls inside itself.
    const maxHeight = Math.max(120, up ? above : below)
    const height = Math.min(el.scrollHeight, maxHeight)
    setPos({ top: up ? Math.max(gap, b.top - 6 - height) : b.bottom + 6, left, up, maxHeight })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    // Closing for a scroll or resize gives focus back to the trigger if it was in the list.
    const shut = () => {
      if (list.current?.contains(document.activeElement)) close()
      else setOpen(false)
    }
    window.addEventListener('resize', shut)
    // Any scroll except inside the list itself moves the trigger away from it.
    const onScroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) shut()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', shut)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!wrap.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(),
    )
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = () => {
    setOpen(false)
    wrap.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    )
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      buttons[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      buttons[buttons.length - 1]?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div
      ref={wrap}
      className={cx('relative inline-flex', className)}
      onKeyDown={open ? onKey : undefined}
    >
      {trigger({
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': id,
      })}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={list}
              id={id}
              role="menu"
              aria-label={label}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.1 } }
              }
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{
                transformOrigin: `${pos?.up ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                maxHeight: pos?.maxHeight,
                visibility: pos ? undefined : 'hidden',
              }}
              className={cx(
                'fixed z-[70] overflow-y-auto overscroll-contain rounded-[12px] border border-line-strong bg-surface-1 p-1 shadow-pop',
                items.some((it) => it.description) ? 'w-80 max-w-[calc(100vw-2rem)]' : 'min-w-52',
              )}
            >
              {items.map((it) => (
                <li key={it.key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(false)
                      // Give focus back to the trigger first, so a dialog the item opens
                      // returns focus there when it closes.
                      wrap.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
                      it.onSelect()
                    }}
                    className={cx(
                      'flex w-full gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] font-semibold',
                      it.description ? 'items-start py-2.5' : 'items-center py-2',
                      'focus-visible:bg-surface-3 focus-visible:outline-none disabled:opacity-40',
                      it.danger
                        ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
                        : 'text-text hover:bg-surface-3',
                    )}
                  >
                    {it.icon && (
                      <span
                        className={cx('shrink-0 text-text-3', it.description ? 'mt-0.5' : null)}
                      >
                        {it.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block">{it.label}</span>
                      {it.description && (
                        <span className="mt-0.5 block text-[12.5px] font-normal leading-snug text-text-3">
                          {it.description}
                        </span>
                      )}
                    </span>
                    {it.hint && <span className="shrink-0 text-[12px] text-text-3">{it.hint}</span>}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
