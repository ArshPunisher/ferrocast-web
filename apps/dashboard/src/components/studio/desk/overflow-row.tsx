// A toolbar that is always one row: what doesn't fit moves, least important first, into a
// "More" panel behind a three-dots button. Items stay mounted wherever they are, so a control
// with its own effects (or an open input) keeps working while it is in the panel.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DotsThree } from '@phosphor-icons/react'
import { IconButton, cx } from '@ferrocast/ui'

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
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLSpanElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const widths = useRef(new Map<string, number>())
  const blockedAt = useRef(0)
  const moved = new Set(order.slice(0, Math.min(n, order.length)))
  const nMoved = moved.size

  const fit = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    row.querySelectorAll<HTMLElement>(':scope > [data-ov]').forEach((el) => {
      if (el.offsetWidth > 0) widths.current.set(el.dataset.ov!, el.offsetWidth)
    })
    if (row.scrollWidth > row.clientWidth + 1) {
      blockedAt.current = row.clientWidth
      if (nMoved < order.length) setN(nMoved + 1)
      return
    }
    if (nMoved > 0 && row.clientWidth > blockedAt.current) {
      const w = widths.current.get(order[nMoved - 1]!) ?? 0
      const more = nMoved === 1 ? (moreRef.current?.offsetWidth ?? 26) + GAP : 0
      const slack = spacerRef.current?.offsetWidth ?? 0
      if (slack >= w + GAP + more + 2) setN(nMoved - 1)
    }
    // `order` is rebuilt each render; its content only changes with the items' ranks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nMoved, order.join('|')])

  useLayoutEffect(fit)
  useEffect(() => {
    const row = rowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fit())
    ro.observe(row)
    return () => ro.disconnect()
  }, [fit])
  // The panel closes on Escape or a press outside it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  useEffect(() => {
    if (nMoved === 0) setOpen(false)
  }, [nMoved])

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
          size="sm"
          label={label}
          aria-expanded={open}
          aria-haspopup="true"
          className={cx(open && 'bg-accent-soft! text-accent-text!')}
          onClick={() => setOpen((o) => !o)}
        >
          <DotsThree size={18} weight="bold" />
        </IconButton>
        {/* Always mounted, so a moved control keeps its effects; shown only when opened. */}
        <div
          role="group"
          aria-label={label}
          className={cx(
            open ? 'flex' : 'hidden',
            'absolute right-0 bottom-full z-50 mb-1.5 w-max max-w-[min(92vw,320px)] flex-col items-start gap-2 rounded-[10px] border border-line-strong bg-surface-1 p-2 text-[13px] text-text-2 shadow-lg',
          )}
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
        </div>
      </div>
    </div>
  )
}
