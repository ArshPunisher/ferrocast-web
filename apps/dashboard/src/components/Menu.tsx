import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PopoverSurface, cx } from '@ferrocast/ui'

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
 * A small dropdown menu: opens from its trigger via `PopoverSurface` (portalled to `document.body`
 * or an enclosing `<dialog>` top layer so `overflow: hidden` never clips it), arrow keys move,
 * Escape closes and returns focus, clicking outside closes, and scrolling/resizing closes it.
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
  const list = useRef<HTMLElement>(null)

  const close = () => {
    setOpen(false)
    wrap.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(raf)
  }, [open])

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    )
    if (buttons.length === 0) return
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
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
    }
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
      <PopoverSurface
        as="ul"
        open={open}
        onClose={(reason) => {
          if (
            reason === 'escape' ||
            ((reason === 'scroll' || reason === 'resize') &&
              list.current?.contains(document.activeElement))
          ) {
            close()
          } else {
            setOpen(false)
          }
        }}
        anchorRef={wrap}
        surfaceRef={list}
        placement="bottom"
        align={align}
        gap={6}
        edgePadding={8}
        closeOnTab
        id={id}
        role="menu"
        aria-label={label}
        className={cx(
          'z-[70] rounded-[12px] border border-line-strong bg-surface-1 p-1 shadow-pop [&>*]:shrink-0',
          items.some((it) => it.description)
            ? 'w-80 max-w-[calc(100vw-2rem)]'
            : 'min-w-52 max-w-[calc(100vw-16px)]',
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
                'group flex w-full gap-2.5 rounded-[8px] px-2.5 text-left text-[15px] font-semibold',
                it.description ? 'items-start py-2.5' : 'items-center py-2',
                'focus-visible:outline-none disabled:opacity-40',
                // Under the pointer: a solid fill, as in the Studio's menus.
                it.danger
                  ? 'text-danger enabled:hover:bg-danger-fill enabled:hover:text-white focus-visible:bg-danger-fill focus-visible:text-white'
                  : 'text-text enabled:hover:bg-pick enabled:hover:text-on-pick focus-visible:bg-pick focus-visible:text-on-pick',
              )}
            >
              {it.icon && (
                <span
                  className={cx(
                    'shrink-0 text-text-3 group-enabled:group-hover:text-inherit group-focus-visible:text-inherit',
                    it.description ? 'mt-0.5' : null,
                  )}
                >
                  {it.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block">{it.label}</span>
                {it.description && (
                  <span className="mt-0.5 block text-[13.5px] font-normal leading-snug text-text-3 group-enabled:group-hover:text-inherit group-focus-visible:text-inherit">
                    {it.description}
                  </span>
                )}
              </span>
              {it.hint && (
                <span className="shrink-0 text-[13px] text-text-3 group-enabled:group-hover:text-inherit group-focus-visible:text-inherit">
                  {it.hint}
                </span>
              )}
            </button>
          </li>
        ))}
      </PopoverSurface>
    </div>
  )
}
