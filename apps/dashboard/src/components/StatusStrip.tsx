import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge, BrandIcon, PlatformMark, Skeleton, cx } from '@ferrocast/ui'
import {
  buildStatusChips,
  computeStatusStripLayout,
  type StatusChipItem,
  type StripCandidateKey,
} from '../lib/status-strip'
import { useLive } from '../lib/store'
import { isCloud } from '../lib/boot'
import { useUsesObs } from '../lib/picture'

export { stateCopy } from '../lib/status-strip'

const DOT: Record<string, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  off: 'bg-text-3/50',
}

function ConnectorIcon({ name, size }: { name: StatusChipItem['name']; size: number }) {
  return name === 'obs' ? (
    <BrandIcon name="obs" size={size} className="text-text-2" />
  ) : (
    <PlatformMark platform={name} size={size} />
  )
}

/**
 * One pill per connection. Degrades cleanly across widths (full labels -> icon + dot + count ->
 * top priority chip + `+N` overflow popover) so the top bar never scrolls horizontally.
 */
export function StatusStrip({ loading = false }: { loading?: boolean }) {
  const connectors = useLive((s) => s.connectors)
  const socket = useLive((s) => s.socket)
  const viewers = useLive((s) => s.viewers)
  // Go live everywhere: a platform whose copy of the stream is reconnecting shows it here too.
  const golive = useLive((s) => s.studio.golive)
  // Cloud mode has no OBS or relay link (its channels are set up on the Cloud page).
  const cloud = isCloud(useLive((s) => s.conn))
  // OBS's pill only for those who stream from OBS: with Ferrocast's Studio, "OBS
  // Disconnected" is noise.
  const usesObs = useUsesObs()

  const items = useMemo(
    () => (connectors ? buildStatusChips({ connectors, viewers, golive, usesObs, cloud }) : []),
    [connectors, viewers, golive, usesObs, cloud],
  )

  const itemSig = useMemo(
    () =>
      `${socket}|${items
        .map(
          (it) =>
            `${it.name}:${it.tone}:${it.stateLabel}:${it.viewersCompact ?? ''}:${it.late ? 1 : 0}:${it.streamIssue?.text ?? ''}`,
        )
        .join(',')}`,
    [items, socket],
  )

  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const [minWidths, setMinWidths] = useState<Partial<Record<StripCandidateKey, number>>>({})
  const [overflowStep, setOverflowStep] = useState<0 | 1 | 2>(0)
  const [open, setOpen] = useState(false)
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null)

  // Reset measured step-downs when chip contents change or container widens noticeably.
  const prevSig = useRef(itemSig)
  const lastClampWidth = useRef(0)
  useEffect(() => {
    if (prevSig.current !== itemSig) {
      prevSig.current = itemSig
      lastClampWidth.current = 0
      setMinWidths({})
      setOverflowStep(0)
    }
  }, [itemSig])

  const hasConnectors = connectors !== null
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const updateWidth = () => {
      const w = Math.floor(el.clientWidth)
      if (w > 0) {
        setAvailableWidth((prev) => (prev === w ? prev : w))
        if (w > lastClampWidth.current + 12) {
          setOverflowStep(0)
        }
      }
    }
    updateWidth()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(updateWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasConnectors])

  const computed = useMemo(
    () =>
      computeStatusStripLayout({
        items,
        socket,
        availableWidth,
        minWidths,
      }),
    [items, socket, availableWidth, minWidths],
  )

  const layout = useMemo(() => {
    if (computed.mode !== 'overflow') return computed
    return {
      ...computed,
      compactTopChip: computed.compactTopChip || overflowStep >= 1,
      compactSocket: computed.compactSocket || overflowStep >= 2,
    }
  }, [computed, overflowStep])

  // Real-DOM safety guard: measure initial container width synchronously before paint and step
  // down if font metrics make the chosen tier wider than the container.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const list = listRef.current
    if (!wrap) return
    const wrapW = Math.floor(wrap.clientWidth)
    if (wrapW <= 0) return
    if (availableWidth === null || availableWidth !== wrapW) {
      setAvailableWidth(wrapW)
    }
    if (!list) return
    const needed = Math.ceil(list.scrollWidth)
    if (needed <= wrapW + 0.5) return

    lastClampWidth.current = wrapW
    if (layout.mode === 'full' && layout.showViewerUnit) {
      setMinWidths((m) =>
        m['full-unit'] && m['full-unit'] >= needed + 2 ? m : { ...m, 'full-unit': needed + 2 },
      )
    } else if (layout.mode === 'full') {
      setMinWidths((m) =>
        m['full-short'] && m['full-short'] >= needed + 2 ? m : { ...m, 'full-short': needed + 2 },
      )
    } else if (layout.mode === 'icons') {
      setMinWidths((m) => (m.icons && m.icons >= needed + 2 ? m : { ...m, icons: needed + 2 }))
    } else if (overflowStep < 2) {
      setOverflowStep((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s))
    }
  }, [layout, availableWidth, overflowStep, itemSig])

  const closePopover = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Close the overflow popover if widening the viewport removes overflow items.
  useEffect(() => {
    if (open && layout.overflowItems.length === 0) setOpen(false)
  }, [open, layout.overflowItems.length])

  const measurePopoverPos = useCallback(() => {
    const trig = triggerRef.current
    if (!trig) return { left: 8, top: 56 }
    const b = trig.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const gap = 8
    const pw = popRef.current?.offsetWidth || Math.min(280, Math.max(160, vw - gap * 2))
    const left = Math.max(gap, Math.min(b.left, vw - gap - pw))
    const top = b.bottom + 6
    return { left, top }
  }, [])

  // Position the portal popover cleanly inside viewport edges.
  useLayoutEffect(() => {
    if (!open) {
      setPopPos(null)
      return
    }
    setPopPos(measurePopoverPos())
  }, [open, layout.overflowItems.length, availableWidth, measurePopoverPos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!triggerRef.current?.contains(target) && !popRef.current?.contains(target)) {
        closePopover(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePopover(true)
      }
    }
    const onScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && popRef.current?.contains(e.target as Node)) return
      closePopover(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('hashchange', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    const raf = requestAnimationFrame(() =>
      popRef.current?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true }),
    )
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('hashchange', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, closePopover])

  const onPopoverKeyDown = (e: React.KeyboardEvent) => {
    const links = Array.from(popRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
    if (links.length === 0) return
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      links[(idx + 1) % links.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      links[(idx - 1 + links.length) % links.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      links[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      links[links.length - 1]?.focus()
    }
  }

  if (loading && !connectors) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden" aria-busy="true">
        <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        <Skeleton className="hidden h-8 w-20 shrink-0 rounded-full sm:block" />
      </div>
    )
  }

  if (!connectors) return null
  if (items.length === 0 && socket === 'open') return null

  const compactChip = layout.mode === 'icons' || layout.mode === 'overflow'
  const socketText =
    socket === 'retrying'
      ? layout.compactSocket || compactChip
        ? layout.compactSocket
          ? 'Offline'
          : 'Reconnecting…'
        : 'Reconnecting to Ferrocast…'
      : layout.compactSocket
        ? 'Connecting'
        : 'Connecting…'

  return (
    <div ref={wrapRef} className="w-full min-w-0">
      <ul
        ref={listRef}
        aria-label="Connections"
        data-strip-mode={layout.mode}
        className="flex min-w-0 items-center gap-1.5 overflow-hidden"
      >
        {layout.visibleItems.map((it) => {
          const showCounts =
            it.viewersCompact !== undefined &&
            !(layout.mode === 'overflow' && layout.compactTopChip)
          return (
            <li key={it.name} className="shrink-0">
              <a
                href={it.href}
                title={it.title}
                className={cx(
                  'fc-press flex h-8 items-center rounded-full border text-[13.5px] font-medium whitespace-nowrap transition-colors',
                  'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                  compactChip ? 'gap-1.5 px-2' : 'gap-2 px-2.5 text-[14px]',
                  it.attention
                    ? 'border-line-strong bg-surface-2 text-text-2 hover:text-text'
                    : 'border-line bg-surface-1 text-text-2 hover:border-line-strong',
                )}
              >
                <span className="sr-only">{it.title}</span>
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <ConnectorIcon name={it.name} size={compactChip ? 14 : 13} />
                </span>
                {!compactChip && (
                  <span aria-hidden="true" className="text-text">
                    {it.label}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={cx(
                    'size-1.5 shrink-0 rounded-full',
                    it.streamIssue
                      ? it.streamIssue.danger
                        ? 'bg-danger'
                        : 'bg-warn'
                      : DOT[it.tone],
                  )}
                />
                {!compactChip && (it.tone !== 'ok' || it.name === 'obs') && (
                  <span aria-hidden="true" className="text-text-2">
                    {it.stateLabel}
                  </span>
                )}
                {!compactChip && it.late && (
                  <span
                    className="text-warn"
                    title="Kick events come through the Ferrocast relay, which is reconnecting. They'll catch up."
                  >
                    delayed
                  </span>
                )}
                {!compactChip && it.streamIssue && (
                  <span
                    className={cx(
                      'flex items-center gap-1.5',
                      it.streamIssue.danger ? 'text-danger' : 'text-warn',
                    )}
                    aria-hidden="true"
                  >
                    <span
                      className={cx(
                        'size-1.5 rounded-full',
                        it.streamIssue.danger ? 'bg-danger' : 'bg-warn',
                      )}
                    />
                    {it.streamIssue.text}
                  </span>
                )}
                {showCounts && (
                  <span aria-hidden="true" className="text-text-2">
                    <span className="font-mono text-[13px] tabular-nums">{it.viewersCompact}</span>
                    {!compactChip && layout.showViewerUnit && (
                      <span> {it.viewers === 1 ? 'viewer' : 'viewers'}</span>
                    )}
                  </span>
                )}
              </a>
            </li>
          )
        })}

        {layout.overflowItems.length > 0 && (
          <li className="shrink-0">
            <button
              ref={triggerRef}
              type="button"
              data-testid="connections-overflow"
              aria-expanded={open}
              aria-controls={popoverId}
              aria-label={`${layout.overflowItems.length} other connections${layout.overflowAttention !== 'none' ? ', attention needed' : ''}`}
              onClick={() => {
                if (open) {
                  setOpen(false)
                } else {
                  setPopPos(measurePopoverPos())
                  setOpen(true)
                }
              }}
              className={cx(
                'fc-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[13px] font-bold whitespace-nowrap transition-colors',
                'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                layout.overflowAttention === 'danger'
                  ? 'border-danger/50 bg-danger-soft text-danger hover:border-danger'
                  : layout.overflowAttention === 'warn'
                    ? 'border-warn/60 bg-warn-soft text-text hover:border-warn'
                    : 'border-line bg-surface-1 text-text-2 hover:border-line-strong hover:text-text',
              )}
            >
              <span>+{layout.overflowItems.length}</span>
              {layout.overflowAttention !== 'none' && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'size-1.5 rounded-full',
                    layout.overflowAttention === 'danger' ? 'bg-danger' : 'bg-warn',
                  )}
                />
              )}
            </button>
          </li>
        )}

        {socket !== 'open' && (
          <li className="shrink-0">
            <span
              role="status"
              className={cx(
                'flex h-8 items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft font-medium whitespace-nowrap text-warn',
                layout.compactSocket ? 'px-2 text-[12.5px]' : 'px-2.5 text-[13.5px]',
              )}
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warn" />
              {socketText}
            </span>
          </li>
        )}
      </ul>

      {open &&
        layout.overflowItems.length > 0 &&
        createPortal(
          <div
            ref={popRef}
            id={popoverId}
            role="region"
            aria-label="Other connections"
            data-over-preview
            data-testid="connections-overflow-popover"
            onKeyDown={onPopoverKeyDown}
            style={popPos ?? measurePopoverPos()}
            className="fixed z-[70] w-[min(280px,calc(100vw-16px))] rounded-[12px] border border-line-strong bg-surface-1 p-1.5 shadow-pop"
          >
            <ul className="flex flex-col gap-0.5">
              {layout.overflowItems.map((it) => {
                const badgeTone =
                  it.streamIssue?.danger || it.tone === 'danger'
                    ? 'danger'
                    : it.streamIssue || it.late || it.tone === 'warn'
                      ? 'warn'
                      : it.tone === 'ok'
                        ? 'ok'
                        : 'neutral'
                const badgeLabel = it.streamIssue
                  ? it.streamIssue.text
                  : it.late
                    ? 'Delayed'
                    : it.viewersCompact !== undefined
                      ? `${it.viewersCompact} ${it.viewers === 1 ? 'viewer' : 'viewers'}`
                      : it.stateLabel
                return (
                  <li key={it.name}>
                    <a
                      href={it.href}
                      title={it.title}
                      onClick={() => closePopover(false)}
                      className="flex items-center justify-between gap-2.5 rounded-[8px] px-2.5 py-2 text-[13.5px] transition-colors hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                    >
                      <span className="sr-only">{it.title}</span>
                      <span
                        aria-hidden="true"
                        className="flex min-w-0 items-center gap-2 font-semibold text-text"
                      >
                        <ConnectorIcon name={it.name} size={14} />
                        <span className="truncate">{it.label}</span>
                      </span>
                      <span aria-hidden="true" className="shrink-0">
                        <Badge tone={badgeTone}>
                          <span
                            className={cx(
                              'size-1.5 rounded-full',
                              it.streamIssue
                                ? it.streamIssue.danger
                                  ? 'bg-danger'
                                  : 'bg-warn'
                                : DOT[it.tone],
                            )}
                          />
                          {badgeLabel}
                        </Badge>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  )
}
