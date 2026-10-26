// Right-click menus for the Studio's panels, like OBS's: items with icons, ticks, sub-menus
// and separators. Opens at the pointer (or under the row from the keyboard's menu key),
// stays inside the window, and works with arrows, Enter and Escape.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow,
  CaretRight,
  Check,
  ClipboardText,
  CopySimple,
  Monitor,
  ProjectorScreen,
  type Icon,
} from '@phosphor-icons/react'
import { type EngineScreen } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'

export type MenuItem =
  | { sep: true }
  | {
      label: string
      icon?: Icon
      onSelect?: () => void
      /** A sub-menu instead of an action. */
      items?: MenuItem[]
      disabled?: boolean
      danger?: boolean
      /** Shows a tick (an option that's on). */
      checked?: boolean
      /** A shortcut shown on the right. */
      hint?: string
    }

type Entry = Exclude<MenuItem, { sep: true }>
const isSep = (m: MenuItem): m is { sep: true } => 'sep' in m

interface Open {
  x: number
  y: number
  items: MenuItem[]
  label: string
}

/** A menu to open from onContextMenu, and the node to render once. */
export function useContextMenu(): {
  open: (e: ReactMouseEvent, label: string, items: MenuItem[]) => void
  menu: ReactNode
} {
  const [at, setAt] = useState<Open | null>(null)
  const back = useRef<HTMLElement | null>(null)
  const open = useCallback((e: ReactMouseEvent, label: string, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    back.current = el
    // From the keyboard (menu key, Shift+F10) there's no pointer: open under the row.
    let { clientX: x, clientY: y } = e
    if (x === 0 && y === 0) {
      const r = el.getBoundingClientRect()
      x = r.left + 12
      y = r.bottom
    }
    setAt({ x, y, items, label })
  }, [])
  const close = useCallback(() => {
    setAt(null)
    back.current?.focus?.()
  }, [])
  const menu = at
    ? createPortal(
        <MenuList items={at.items} label={at.label} x={at.x} y={at.y} onClose={close} root />,
        document.body,
      )
    : null
  return { open, menu }
}

function MenuList({
  items,
  label,
  x,
  y,
  onClose,
  onBack,
  root,
}: {
  items: MenuItem[]
  label: string
  x: number
  y: number
  onClose: () => void
  /** A sub-menu: ArrowLeft goes back to its parent. */
  onBack?: () => void
  root?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null)
  const timer = useRef(0)

  // Kept inside the window: flipped left or up when it would run off.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 6
    let left = x
    let top = y
    if (left + r.width > window.innerWidth - pad)
      left = root ? Math.max(pad, x - r.width) : Math.max(pad, x - r.width - 220)
    if (top + r.height > window.innerHeight - pad)
      top = Math.max(pad, window.innerHeight - r.height - pad)
    setPos({ left, top })
  }, [x, y, root])

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      ?.focus()
  }, [])

  // The top menu closes on a click elsewhere, scrolling, resizing or leaving the window.
  useEffect(() => {
    if (!root) return
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-fc-menu]')) onClose()
    }
    const gone = () => onClose()
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('resize', gone)
    window.addEventListener('blur', gone)
    document.addEventListener('scroll', gone, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('resize', gone)
      window.removeEventListener('blur', gone)
      document.removeEventListener('scroll', gone, true)
    }
  }, [root, onClose])

  useEffect(() => () => clearTimeout(timer.current), [])

  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setSub({ i, x: r.right - 4, y: r.top - 6 })
  }

  const onKey = (e: ReactKeyboardEvent) => {
    // A sub-menu's keys stay in it.
    e.stopPropagation()
    const all = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        ':scope > [role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ]
    const at = all.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = all.length
      if (!n) return
      const next = e.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n
      all[next]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      ;(e.key === 'Home' ? all[0] : all[all.length - 1])?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (onBack) onBack()
      else onClose()
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault()
      e.stopPropagation()
      onBack()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-fc-menu
      tabIndex={-1}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[80] flex min-w-[210px] flex-col rounded-control border border-line-strong bg-surface-1 p-1 shadow-pop"
      style={pos}
    >
      {items.map((m, i) => {
        if (isSep(m)) return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
        const e = m as Entry
        const Ic = e.icon
        const hasSub = !!e.items?.length
        return (
          <div
            key={`${e.label}-${i}`}
            role={e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={e.checked !== undefined ? e.checked : undefined}
            aria-disabled={e.disabled || undefined}
            aria-haspopup={hasSub ? 'menu' : undefined}
            aria-expanded={hasSub ? sub?.i === i : undefined}
            tabIndex={-1}
            onPointerEnter={(ev) => {
              if (e.disabled) return
              ;(ev.currentTarget as HTMLElement).focus()
              clearTimeout(timer.current)
              const el = ev.currentTarget as HTMLElement
              timer.current = window.setTimeout(() => {
                if (hasSub) openSub(i, el)
                else setSub(null)
              }, 120)
            }}
            onClick={(ev) => {
              if (e.disabled) return
              if (hasSub) return openSub(i, ev.currentTarget as HTMLElement)
              onClose()
              e.onSelect?.()
            }}
            onKeyDown={(ev) => {
              if (e.disabled) return
              if (ev.key === 'Enter' || ev.key === ' ' || (ev.key === 'ArrowRight' && hasSub)) {
                ev.preventDefault()
                ev.stopPropagation()
                if (hasSub) return openSub(i, ev.currentTarget as HTMLElement)
                onClose()
                e.onSelect?.()
              }
            }}
            className={cx(
              'flex h-8 cursor-default items-center gap-2.5 rounded-[7px] px-2 text-[13px] font-semibold outline-none select-none',
              e.disabled
                ? 'text-text-3 opacity-60'
                : e.danger
                  ? 'text-danger focus:bg-danger-soft'
                  : 'text-text focus:bg-surface-3',
            )}
          >
            <span className="grid size-4 shrink-0 place-items-center">
              {e.checked ? (
                <Check size={14} weight="bold" className="text-accent-text" />
              ) : Ic ? (
                <Ic size={15} weight="bold" className={e.danger ? '' : 'text-text-2'} />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            {e.hint && (
              <span className="font-mono text-[11px] font-medium text-text-3">{e.hint}</span>
            )}
            {hasSub && <CaretRight size={12} weight="bold" className="text-text-3" />}
          </div>
        )
      })}
      {sub && (items[sub.i] as Entry | undefined)?.items && (
        <MenuList
          items={(items[sub.i] as Entry).items ?? []}
          label={(items[sub.i] as Entry).label}
          x={sub.x}
          y={sub.y}
          onClose={onClose}
          onBack={() => {
            const i = sub.i
            setSub(null)
            const rows = ref.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]')
            rows?.[items.slice(0, i).filter((m) => !isSep(m)).length]?.focus()
          }}
        />
      )}
    </div>
  )
}

/** "Copy filters" and "Paste filters" for a source, scene or sound, as OBS has them. */
export function filterItems(
  name: string,
  d: {
    filterClip: string | null
    setFilterClip: (n: string | null) => void
    paste: (from: string) => void
  },
): MenuItem[] {
  return [
    { label: 'Copy filters', icon: CopySimple, onSelect: () => d.setFilterClip(name) },
    {
      label: d.filterClip ? `Paste filters from ${d.filterClip}` : 'Paste filters',
      icon: ClipboardText,
      disabled: !d.filterClip || d.filterClip === name,
      onSelect: () => d.filterClip && d.paste(d.filterClip),
    },
  ]
}

/**
 * OBS's projector for a scene, source, what's on air or the multiview: in a window, or full
 * screen on one of the displays. Only in the Ferrocast app (the windows are its own).
 */
export function projectorItem(
  label: string,
  screens: EngineScreen[] | null,
  show: (screen: number | undefined, onTop?: boolean) => void,
): MenuItem {
  return {
    label,
    icon: ProjectorScreen,
    items: [
      { label: 'In a window', icon: AppWindow, onSelect: () => show(undefined) },
      {
        label: 'In a window, always on top',
        icon: AppWindow,
        onSelect: () => show(undefined, true),
      },
      ...(screens?.length ? [{ sep: true } as const] : []),
      ...(screens ?? []).map((s) => ({
        label: `Full screen on ${s.name}${s.main ? ' (main)' : ''}`,
        icon: Monitor,
        onSelect: () => show(s.index),
      })),
    ],
  }
}
