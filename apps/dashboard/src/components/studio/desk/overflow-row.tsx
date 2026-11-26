// A toolbar that is always one row: what doesn't fit moves, least important first, into a
// "More" panel behind a three-dots button. Items stay mounted wherever they are, so a control
// with its own effects (or an open input) keeps working while it is in the panel.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DotsThree } from '@phosphor-icons/react'
import { IconButton, PopoverSurface, cx } from '@ferrocast/ui'

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
  const moved = new Set(order.slice(0, Math.min(n, order.length)))
  const nMoved = moved.size

  const fit = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    row.querySelectorAll<HTMLElement>(':scope > [data-ov]').forEach((el) => {
      if (el.offsetWidth > 0) widths.current.set(el.dataset.ov!, el.offsetWidth)
    })
    const measuredMore = moreRef.current?.offsetWidth ?? 0
    if (measuredMore > 0) moreWidth.current = measuredMore
    const moreW = moreWidth.current

    const overflow = row.scrollWidth - row.clientWidth
    if (overflow > 1) {
      blockedAt.current = row.clientWidth
      if (nMoved >= order.length) return
      let freed = 0
      let next = nMoved
      while (next < order.length && freed < overflow) {
        const w = widths.current.get(order[next]!) ?? 0
        // Moving the first item swaps in the More toggle, reducing net horizontal gain.
        const gain = next === 0 ? w - moreW : w + GAP
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
      let slack = spacerRef.current
        ? spacerRef.current.offsetWidth
        : Math.max(0, row.clientWidth - row.scrollWidth)
      let next = nMoved
      while (next > 0) {
        const w = widths.current.get(order[next - 1]!) ?? 0
        if (w <= 0) break
        const more = next === 1 ? moreW + GAP : 0
        if (slack < w + GAP + more + 2) break
        slack -= w + GAP
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
    const orderChanged = lastOrderKey.current !== orderKey
    if (orderChanged) {
      lastOrderKey.current = orderKey
      blockedAt.current = 0
      if (nMoved > order.length) {
        setN(order.length)
        return
      }
    }
    if (orderChanged || verifyFitRef.current || typeof ResizeObserver === 'undefined') {
      verifyFitRef.current = false
      fit()
    }
  }, [fit, orderKey, items, nMoved, order.length])

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
    ro.observe(row)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
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
            className={cx('flex flex-none items-center empty:hidden', it.wrap)}
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
          className="z-[75] flex w-max max-w-[min(calc(100vw-16px),320px)] flex-col items-start gap-2 rounded-[10px] border border-line-strong bg-surface-1 p-2 text-[13px] text-text-2 shadow-pop [&>*]:shrink-0"
        >
          {items
            .filter((i) => moved.has(i.key))
            .map((it) => (
              <div
                key={it.key}
                data-ov-panel={it.key}
                className="flex items-center gap-2 empty:hidden"
              >
                {it.render(true)}
              </div>
            ))}
        </PopoverSurface>
      </div>
    </div>
  )
}
