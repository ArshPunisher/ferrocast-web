// A toolbar that is always one row: what doesn't fit moves, least important first, into a
// "More" panel behind a three-dots button. Items stay mounted wherever they are, so a control
// with its own effects (or an open input) keeps working while it is in the panel.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DotsThree } from '@phosphor-icons/react'
import { IconButton, PopoverSurface, cx, findFocusableElements } from '@ferrocast/ui'

export interface OverflowItem {
  key: string
  /** Draws the item; `panel` is true inside the More panel (labels can be spelt out there). */
  render: (panel: boolean) => ReactNode
  /** Lower goes into the panel first. Omit for an item that never moves. */
  rank?: number
  /** The flexible gap that pushes the following items to the end of the row. */
  spacer?: boolean
  /** Classes on the item's wrapper (a container-query show/hide goes here, not inside). */
  wrap?: string
}

const GAP = 10

export function OverflowRow({
  items,
  className,
  label = 'More tools',
}: {
  items: OverflowItem[]
  className?: string
  label?: string
}) {
  const order = items
    .filter((i) => i.rank !== undefined)
    .sort((a, b) => a.rank! - b.rank!)
    .map((i) => i.key)
  const orderKey = order.join('|')
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLSpanElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const pressedInPanelRef = useRef(false)
  const widths = useRef(new Map<string, number>())
  const moreWidth = useRef(26)
  const blockedAt = useRef(0)
  const lastOrderKey = useRef<string | null>(null)
  const verifyFitRef = useRef(false)
  const roRef = useRef<ResizeObserver | null>(null)
  const observedChildrenRef = useRef<Set<Element>>(new Set())
  const moved = new Set(order.slice(0, Math.min(n, order.length)))
  const nMoved = moved.size

  const fit = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    let childShrank = false
    row.querySelectorAll<HTMLElement>(':scope > [data-ov]').forEach((el) => {
      const key = el.dataset.ov!
      const w = el.offsetWidth
      const prev = widths.current.get(key)
      if (w > 0) {
        if (prev !== undefined && w < prev) childShrank = true
        widths.current.set(key, w)
      } else {
        if (prev !== undefined && prev > 0) childShrank = true
        widths.current.set(key, 0)
      }
    })
    if (childShrank) blockedAt.current = 0
    const measuredMore = moreRef.current?.offsetWidth ?? 0
    if (measuredMore > 0) moreWidth.current = measuredMore
    const moreW = moreWidth.current
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(row) : null
    const colGapRaw = cs ? parseFloat(cs.columnGap) : NaN
    const gap = Number.isFinite(colGapRaw) ? colGapRaw : GAP
    const padX = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0

    const overflow = row.scrollWidth - row.clientWidth
    if (overflow > 1) {
      blockedAt.current = row.clientWidth
      if (nMoved >= order.length) return
      let freed = 0
      let next = nMoved
      while (next < order.length && freed < overflow) {
        const w = widths.current.get(order[next]!) ?? 0
        // Moving the first item swaps in the More toggle; zero-width hidden items free 0px.
        const gain = next === 0 ? (w > 0 ? w - moreW : -moreW) : w > 0 ? w + gap : 0
        freed += gain
        next += 1
      }
      if (next !== nMoved) {
        verifyFitRef.current = true
        setN(next)
      }
      return
    }

    if (nMoved > 0 && row.clientWidth > blockedAt.current) {
      let slack: number
      if (spacerRef.current) {
        slack = spacerRef.current.offsetWidth
      } else {
        const parts: number[] = []
        row.querySelectorAll<HTMLElement>(':scope > [data-ov]').forEach((el) => {
          if (el.offsetWidth > 0) parts.push(el.offsetWidth)
        })
        if (moreW > 0) parts.push(moreW)
        const usedW = parts.reduce((acc, w) => acc + w, 0) + Math.max(0, parts.length - 1) * gap
        slack = Math.max(0, row.clientWidth - padX - usedW)
      }
      let next = nMoved
      while (next > 0) {
        const key = order[next - 1]!
        const w = widths.current.get(key) ?? 0
        if (w <= 0) {
          if (!widths.current.has(key)) break
          next -= 1
          continue
        }
        // Restoring the last item removes the More button and keeps the gap count unchanged.
        const needed = next === 1 ? w - moreW + 2 : w + gap + 2
        if (slack < needed) break
        slack -= next === 1 ? Math.max(0, w - moreW) : w + gap
        next -= 1
      }
      if (next !== nMoved) setN(next)
    }
    // `order` is rebuilt each render; its content only changes with item ranks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nMoved, orderKey])

  const fitRef = useRef(fit)
  fitRef.current = fit

  useLayoutEffect(() => {
    const row = rowRef.current
    const orderChanged = lastOrderKey.current !== orderKey
    if (orderChanged) {
      lastOrderKey.current = orderKey
      blockedAt.current = 0
      const orderSet = new Set(order)
      for (const k of [...widths.current.keys()]) {
        if (!orderSet.has(k)) widths.current.delete(k)
      }
      if (n > 0 && (order.length === 0 || order.some((k) => !widths.current.has(k)))) {
        setN(0)
        return
      }
      if (n > order.length) {
        setN(order.length)
        return
      }
    }
    const ro = roRef.current
    if (ro && row) {
      const currentEls = new Set<Element>([
        row,
        ...row.querySelectorAll(':scope > [data-ov], :scope > [data-more]'),
      ])
      for (const el of [...observedChildrenRef.current]) {
        if (!currentEls.has(el)) {
          ro.unobserve?.(el)
          observedChildrenRef.current.delete(el)
        }
      }
      for (const el of currentEls) {
        if (!observedChildrenRef.current.has(el)) {
          ro.observe(el)
          observedChildrenRef.current.add(el)
        }
      }
    }
    const overflows = row ? row.scrollWidth - row.clientWidth > 1 : false
    if (
      orderChanged ||
      verifyFitRef.current ||
      overflows ||
      typeof ResizeObserver === 'undefined'
    ) {
      verifyFitRef.current = false
      fit()
    }
  }, [fit, orderKey, items, n, nMoved, order])

  useEffect(() => {
    const row = rowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (raf) return
      if (typeof requestAnimationFrame !== 'function') {
        fitRef.current()
        return
      }
      raf = requestAnimationFrame(() => {
        raf = 0
        fitRef.current()
      })
    })
    roRef.current = ro
    const observed = observedChildrenRef.current
    observed.clear()
    for (const el of [row, ...row.querySelectorAll(':scope > [data-ov], :scope > [data-more]')]) {
      ro.observe(el)
      observed.add(el)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      roRef.current = null
      observed.clear()
    }
  }, [])

  // Track panel activation so opening a child portal menu doesn't treat that menu as outside click.
  useEffect(() => {
    if (!open) {
      pressedInPanelRef.current = false
      return
    }
    const onKey = (e: KeyboardEvent) => {
      // A menu opened with the keyboard (Enter or Space on a button in the panel).
      if ((e.key === 'Enter' || e.key === ' ') && panelRef.current?.contains(e.target as Node)) {
        pressedInPanelRef.current = true
      }
    }
    const onDown = (e: Event) => {
      const t = e.target as Element | null
      if (panelRef.current?.contains(t as Node)) {
        pressedInPanelRef.current = true
        return
      }
      if (pressedInPanelRef.current && t?.closest?.('[role="menu"]')) return
      pressedInPanelRef.current = false
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])
  useEffect(() => {
    if (nMoved === 0 && open) setOpen(false)
  }, [nMoved, open])

  return (
    <div
      ref={rowRef}
      data-overflow-row
      className={cx('flex min-w-0 flex-nowrap items-center', className)}
    >
      {items.map((it) =>
        it.spacer ? (
          <span key={it.key} ref={spacerRef} data-ov-spacer className="min-w-0 flex-1" />
        ) : moved.has(it.key) ? null : (
          <span
            key={it.key}
            data-ov={it.key}
            className={cx('flex flex-none items-center gap-1.5 empty:hidden', it.wrap)}
          >
            {it.render(false)}
          </span>
        ),
      )}
      <div ref={moreRef} data-more className={cx('relative flex-none', nMoved === 0 && 'hidden')}>
        <IconButton
          ref={moreBtnRef}
          size="sm"
          label={label}
          aria-expanded={open}
          aria-haspopup="true"
          className={cx(open && 'bg-accent-soft! text-accent-text!')}
          onClick={() => setOpen((o) => !o)}
        >
          <DotsThree size={18} weight="bold" />
        </IconButton>
        <PopoverSurface
          open={open && nMoved > 0}
          onClose={(reason) => {
            pressedInPanelRef.current = false
            setOpen(false)
            if (reason === 'escape') moreBtnRef.current?.focus()
          }}
          anchorRef={moreBtnRef}
          surfaceRef={panelRef}
          placement="top"
          align="end"
          gap={6}
          edgePadding={8}
          closeOnResize={false}
          role="group"
          aria-label={label}
          tabIndex={-1}
          focusOnOpen="first"
          onKeyDown={(e) => {
            if (e.key !== 'Tab') return
            const list = findFocusableElements(panelRef.current)
            if (list.length === 0) {
              e.preventDefault()
              pressedInPanelRef.current = false
              setOpen(false)
              moreBtnRef.current?.focus({ preventScroll: true })
              return
            }
            const active = document.activeElement as HTMLElement | null
            const atFirst = active === list[0] || active === panelRef.current
            const atLast = active === list[list.length - 1]
            if ((e.shiftKey && atFirst) || (!e.shiftKey && atLast)) {
              e.preventDefault()
              pressedInPanelRef.current = false
              setOpen(false)
              moreBtnRef.current?.focus({ preventScroll: true })
            }
          }}
          shouldIgnoreOutsidePointerDown={(e) => {
            const t = e.target as Element | null
            if (panelRef.current?.contains(t as Node)) {
              pressedInPanelRef.current = true
              return true
            }
            if (pressedInPanelRef.current && t?.closest?.('[role="menu"]')) return true
            pressedInPanelRef.current = false
            return false
          }}
          className="z-[75] flex w-max max-w-[min(calc(100vw-16px),320px)] flex-col items-start gap-2 rounded-[10px] border border-line-strong bg-surface-1 p-2 text-[13px] text-text-2 shadow-pop outline-none [&>*]:shrink-0"
        >
          {items
            .filter((i) => moved.has(i.key))
            .map((it) => (
              <div
                key={it.key}
                data-ov-panel={it.key}
                className="flex flex-wrap items-center gap-2 empty:hidden"
              >
                {it.render(true)}
              </div>
            ))}
        </PopoverSurface>
      </div>
    </div>
  )
}
