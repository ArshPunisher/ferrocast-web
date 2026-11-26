// Right-click menus for the Studio's panels, like OBS's: items with icons, ticks, sub-menus
// and separators. Opens at the pointer (or under the row from the keyboard's menu key),
// stays inside the window, and works with arrows, Enter and Escape.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
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
import { PopoverSurface, cx, type RectBox } from '@ferrocast/ui'

export type MenuItem =
  | { sep: true }
  /** A small title over the rows after it ("Move into"). */
  | { heading: string }
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
      /** The icon filled in this colour (a group's folder). */
      tone?: string
      /** A tick on the right, keeping the icon (the place it's in now). */
      here?: boolean
    }

type Entry = Exclude<MenuItem, { sep: true } | { heading: string }>
/** A line or a heading: not a row that can be picked. */
const isSep = (m: MenuItem): m is { sep: true } | { heading: string } =>
  'sep' in m || 'heading' in m

/** A narrow title row on top of a menu (owner's pick M1, 29 Oct): what it lists, how many. */
export interface MenuHead {
  title: string
  icon?: Icon
  count?: number
}

interface Open {
  anchorEl: HTMLElement
  anchorRect: RectBox
  align: 'start' | 'end'
  gap: number
  items: MenuItem[]
  label: string
  head?: MenuHead | undefined
}

/** A menu to open from onContextMenu or a trigger click, and the node to render once. */
export function useContextMenu(): {
  open: (e: ReactMouseEvent, label: string, items: MenuItem[], head?: MenuHead) => void
  menu: ReactNode
} {
  const [at, setAt] = useState<Open | null>(null)
  const back = useRef<HTMLElement | null>(null)
  const open = useCallback(
    (e: ReactMouseEvent, label: string, items: MenuItem[], head?: MenuHead) => {
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      back.current = el
      const vw = document.documentElement.clientWidth || window.innerWidth
      let anchorRect: RectBox
      let align: 'start' | 'end' = 'start'
      let gap = 0
      if (e.type === 'click') {
        const r = el.getBoundingClientRect()
        anchorRect = {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        }
        align = r.left + r.width / 2 > vw / 2 ? 'end' : 'start'
        gap = 6
      } else if (e.clientX === 0 && e.clientY === 0) {
        // From the keyboard (menu key, Shift+F10) there's no pointer: open under the row.
        const r = el.getBoundingClientRect()
        anchorRect = {
          left: r.left + 12,
          top: r.top,
          right: r.left + 12,
          bottom: r.bottom,
          width: 0,
          height: r.height,
        }
      } else {
        anchorRect = {
          left: e.clientX,
          top: e.clientY,
          right: e.clientX,
          bottom: e.clientY,
          width: 0,
          height: 0,
        }
      }
      setAt({ anchorEl: el, anchorRect, align, gap, items, label, head })
    },
    [],
  )
  const close = useCallback(() => {
    setAt(null)
    back.current?.focus?.()
  }, [])
  const menu = at ? (
    <MenuList
      items={at.items}
      label={at.label}
      head={at.head}
      anchorEl={at.anchorEl}
      anchorRect={at.anchorRect}
      align={at.align}
      gap={at.gap}
      onClose={close}
      root
    />
  ) : null
  return { open, menu }
}

function MenuList({
  items,
  label,
  head,
  anchorEl,
  anchorRect,
  parentMenuRect,
  align = 'start',
  gap = 0,
  focusSeq = 0,
  onClose,
  onBack,
  root,
}: {
  items: MenuItem[]
  label: string
  head?: MenuHead | undefined
  anchorEl: HTMLElement | null
  anchorRect: RectBox
  parentMenuRect?: RectBox | undefined
  align?: 'start' | 'end' | undefined
  gap?: number | undefined
  focusSeq?: number | undefined
  onClose: () => void
  /** A sub-menu: ArrowLeft goes back to its parent. */
  onBack?: () => void
  root?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const [sub, setSub] = useState<{
    i: number
    focusSeq: number
    itemEl: HTMLElement
    itemRect: RectBox
    parentRect: RectBox
  } | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    const focusFirst = () =>
      ref.current
        ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
        ?.focus({ preventScroll: true })
    focusFirst()
    const raf = requestAnimationFrame(focusFirst)
    return () => cancelAnimationFrame(raf)
  }, [focusSeq])

  // Close the root menu when the OS/browser window loses focus.
  useEffect(() => {
    if (!root) return
    window.addEventListener('blur', onClose)
    return () => window.removeEventListener('blur', onClose)
  }, [root, onClose])

  useEffect(() => () => clearTimeout(timer.current), [])

  const openSub = (i: number, el: HTMLElement, focusItem = false) => {
    if (focusItem) clearTimeout(timer.current)
    const r = el.getBoundingClientRect()
    const pr = ref.current?.getBoundingClientRect() ?? r
    setSub((prev) => ({
      i,
      focusSeq: focusItem ? (prev?.focusSeq ?? 0) + 1 : (prev?.focusSeq ?? 0),
      itemEl: el,
      itemRect: {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
      parentRect: {
        left: pr.left,
        top: pr.top,
        right: pr.right,
        bottom: pr.bottom,
        width: pr.width,
        height: pr.height,
      },
    }))
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
    <PopoverSurface
      open
      onClose={onClose}
      anchorEl={anchorEl}
      anchorRect={anchorRect}
      parentMenuRect={parentMenuRect}
      surfaceRef={ref}
      placement={root ? 'bottom' : 'right'}
      align={root ? align : 'start'}
      gap={gap}
      edgePadding={6}
      dismissible={!!root}
      ignoreOutsideSelector="[data-fc-menu]"
      closeOnEscape={false}
      closeOnTab={false}
      role="menu"
      aria-label={label}
      data-fc-menu=""
      tabIndex={-1}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
      // Taller than the window: it scrolls (an open sub-menu closes, its row moved).
      onScroll={(e) => {
        if (e.target !== e.currentTarget) return
        // A sub-menu about to open on hover would open for the row that moved away.
        clearTimeout(timer.current)
        setSub(null)
      }}
      className={cx(
        'flex min-w-[210px] max-w-[calc(100vw-12px)] flex-col rounded-control border border-line-strong bg-surface-1 p-1 shadow-pop outline-none [&>*]:shrink-0',
        root ? 'z-[80]' : 'z-[81]',
      )}
    >
      {head && (
        <div
          role="presentation"
          className="sticky -top-1 z-10 -mx-1 -mt-1 mb-1 flex h-[34px] items-center gap-2 rounded-t-[inherit] border-b border-line bg-surface-3 px-3.5 text-[11.5px] font-extrabold tracking-[0.08em] text-text-3 uppercase"
        >
          {head.icon && <head.icon size={14} weight="bold" aria-hidden />}
          {head.title}
          {head.count !== undefined && (
            <span className="ml-auto font-mono tracking-normal tabular-nums">{head.count}</span>
          )}
        </div>
      )}
      {items.map((m, i) => {
        if ('heading' in m)
          return (
            <div
              key={`head-${i}`}
              role="presentation"
              className="px-2 pt-1.5 pb-1 text-[12px] font-bold text-text-3 select-none"
            >
              {m.heading}
            </div>
          )
        if (isSep(m)) return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
        const e = m as Entry
        const Ic = e.icon
        const hasSub = !!e.items?.length
        return (
          <div
            key={`${e.label}-${i}`}
            role={
              e.checked !== undefined
                ? 'menuitemcheckbox'
                : e.here !== undefined
                  ? 'menuitemradio'
                  : 'menuitem'
            }
            aria-checked={e.checked ?? e.here}
            aria-disabled={e.disabled || undefined}
            aria-haspopup={hasSub ? 'menu' : undefined}
            aria-expanded={hasSub ? sub?.i === i : undefined}
            tabIndex={-1}
            onPointerEnter={(ev) => {
              if (e.disabled) return
              ;(ev.currentTarget as HTMLElement).focus({ preventScroll: true })
              clearTimeout(timer.current)
              const el = ev.currentTarget as HTMLElement
              timer.current = window.setTimeout(() => {
                if (hasSub) openSub(i, el)
                else setSub(null)
              }, 120)
            }}
            onClick={(ev) => {
              if (e.disabled) return
              if (hasSub) return openSub(i, ev.currentTarget as HTMLElement, true)
              onClose()
              e.onSelect?.()
            }}
            onKeyDown={(ev) => {
              if (e.disabled) return
              if (ev.key === 'Enter' || ev.key === ' ' || (ev.key === 'ArrowRight' && hasSub)) {
                ev.preventDefault()
                ev.stopPropagation()
                if (hasSub) return openSub(i, ev.currentTarget as HTMLElement, true)
                onClose()
                e.onSelect?.()
              }
            }}
            className={cx(
              'group flex h-8 cursor-default items-center gap-2.5 rounded-[7px] px-2 text-[14px] font-semibold outline-none select-none',
              // The row under the pointer: a solid fill like the system's menus, the same
              // colour as everything picked (an open sub-menu's row keeps it).
              e.disabled
                ? 'text-text-3 opacity-60'
                : e.danger
                  ? 'text-danger focus:bg-danger-fill focus:text-white'
                  : 'text-text focus:bg-pick focus:text-on-pick aria-expanded:bg-pick aria-expanded:text-on-pick',
            )}
          >
            <span className="grid size-4 shrink-0 place-items-center">
              {e.checked ? (
                <Check
                  size={14}
                  weight="bold"
                  className="text-accent-text group-focus:text-inherit group-aria-expanded:text-inherit"
                />
              ) : Ic ? (
                <Ic
                  size={15}
                  weight={e.tone ? 'fill' : 'bold'}
                  style={e.tone ? { color: e.tone } : undefined}
                  className={
                    e.danger || e.tone
                      ? ''
                      : 'text-text-2 group-focus:text-inherit group-aria-expanded:text-inherit'
                  }
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            {e.here && (
              <Check
                size={14}
                weight="bold"
                className="shrink-0 text-accent-text group-focus:text-inherit"
              />
            )}
            {e.hint && (
              <span className="font-mono text-[12px] font-medium text-text-3 group-focus:text-inherit">
                {e.hint}
              </span>
            )}
            {hasSub && (
              <CaretRight
                size={12}
                weight="bold"
                className="text-text-3 group-focus:text-inherit group-aria-expanded:text-inherit"
              />
            )}
          </div>
        )
      })}
      {sub && (items[sub.i] as Entry | undefined)?.items && (
        <MenuList
          items={(items[sub.i] as Entry).items ?? []}
          label={(items[sub.i] as Entry).label}
          anchorEl={sub.itemEl}
          anchorRect={sub.itemRect}
          parentMenuRect={sub.parentRect}
          gap={-4}
          focusSeq={sub.focusSeq}
          onClose={onClose}
          onBack={() => {
            const i = sub.i
            setSub(null)
            const rows = ref.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]')
            rows?.[items.slice(0, i).filter((m) => !isSep(m)).length]?.focus({
              preventScroll: true,
            })
          }}
        />
      )}
    </PopoverSurface>
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
