import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cx } from '@ferrocast/ui'

export interface MenuItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

/**
 * A small dropdown menu: opens from its trigger (origin-aware), arrow keys move, Escape
 * closes and returns focus, clicking outside closes. No portal: it stays inside the
 * scrolling panel it belongs to.
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

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
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
            style={{ transformOrigin: align === 'end' ? 'top right' : 'top left' }}
            className={cx(
              'absolute top-full z-40 mt-1.5 min-w-52 rounded-[12px] border border-line-strong bg-surface-1 p-1 shadow-pop',
              align === 'end' ? 'right-0' : 'left-0',
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
                    'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] font-medium',
                    'focus-visible:bg-surface-3 focus-visible:outline-none disabled:opacity-40',
                    it.danger
                      ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
                      : 'text-text hover:bg-surface-3',
                  )}
                >
                  {it.icon && <span className="shrink-0 text-text-3">{it.icon}</span>}
                  <span className="min-w-0 flex-1">{it.label}</span>
                  {it.hint && <span className="shrink-0 text-[12px] text-text-3">{it.hint}</span>}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
