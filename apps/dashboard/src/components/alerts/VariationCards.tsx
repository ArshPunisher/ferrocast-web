import { PLATFORM_LABEL, type Condition, type Variation } from '@ferrocast/api'
import { Plus, Trash } from '@phosphor-icons/react'
import { cx } from '@ferrocast/ui'

export function describeCondition(c: Condition | null): string {
  if (!c) return 'Default fallback (other alerts)'
  switch (c.type) {
    case 'amount_at_least':
      return c.currency ? `Amount ≥ ${c.currency} ${c.value}` : `Amount ≥ ${c.value}`
    case 'amount_below':
      return c.currency ? `Amount < ${c.currency} ${c.value}` : `Amount < ${c.value}`
    case 'tier_at_least':
      return `Tier ${c.tier} or higher`
    case 'months_at_least':
      return `${c.months}+ months`
    case 'platform_is':
      return `On ${PLATFORM_LABEL[c.platform] ?? c.platform}`
    case 'is_gifted':
      return 'When gifted'
    case 'has_message':
      return 'Has a message'
    case 'message_contains':
      return c.text ? `Message includes “${c.text}”` : 'Message check (empty)'
    case 'all':
      return c.of.length ? c.of.map(describeCondition).join(' + ') : 'All conditions'
    case 'any':
      return c.of.length ? c.of.map(describeCondition).join(' or ') : 'Any condition'
  }
}

function sharePercent(variations: Variation[], target: Variation): number | null {
  if (target.condition === null) return null
  const peers = variations.filter((v) => v.condition !== null && v.priority === target.priority)
  if (peers.length <= 1) return 100
  const total = peers.reduce((sum, v) => sum + Math.max(0, v.weight ?? 1), 0)
  const w = Math.max(0, target.weight ?? 1)
  if (total === 0) return Math.round(100 / peers.length)
  return Math.round((w / total) * 100)
}

export function VariationCards({
  variations,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  compact = false,
}: {
  variations: Variation[]
  selectedIndex: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDelete: (index: number) => void
  /** The editor's left dock: one column, tighter. */
  compact?: boolean
}) {
  const hasConditionals = variations.some((v) => v.condition !== null)

  return (
    <div className={cx(compact ? 'flex flex-col gap-2' : 'mb-5 flex flex-col gap-2.5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="fc-label">Variations ({variations.length})</span>
        <button
          type="button"
          onClick={onAdd}
          className="fc-press inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-[13.5px] font-semibold text-text-2 hover:border-text-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          <Plus size={14} aria-hidden="true" />
          Add a look
        </button>
      </div>

      <div
        role="group"
        aria-label="Alert variations"
        className={cx('grid grid-cols-1 gap-2', !compact && 'sm:grid-cols-2')}
      >
        {variations.map((v, i) => {
          const isDefault = v.condition === null
          const active = i === selectedIndex
          const w = v.weight ?? 1
          const pct = sharePercent(variations, v)
          const label = isDefault ? 'Default' : v.name || 'Untitled look'

          return (
            <div
              key={v.id}
              data-variation-card={v.id}
              data-active={active ? 'true' : undefined}
              className={cx(
                'relative flex items-start gap-2 rounded-control border transition-colors',
                compact ? 'p-2.5' : 'p-3',
                active
                  ? 'border-arc bg-arc-soft/35 shadow-1'
                  : 'border-line bg-surface-2/70 hover:border-line-strong',
              )}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(i)}
                className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold text-text">{label}</span>
                  {isDefault && (
                    <span className="rounded-full border border-line bg-surface-1 px-2 py-0.5 text-[11px] font-semibold text-text-2">
                      Default
                    </span>
                  )}
                  {!isDefault && v.priority !== 0 && (
                    <span className="rounded-full border border-line bg-surface-1 px-2 py-0.5 font-mono text-[11px] font-semibold text-text-2 tabular-nums">
                      P{v.priority}
                    </span>
                  )}
                  {v.custom_enabled && (
                    <span className="rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-text">
                      Custom HTML
                    </span>
                  )}
                </div>

                <p className="line-clamp-1 text-[12.5px] font-medium text-text-2">
                  {describeCondition(v.condition)}
                </p>

                <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-text-3 tabular-nums">
                  {!isDefault || hasConditionals ? (
                    <span data-variation-weight={w}>
                      {isDefault
                        ? 'Weight: fallback'
                        : w === 0 && pct === 0
                          ? 'Weight: 0 (paused)'
                          : `Weight: ${w}${pct !== null && pct < 100 ? ` (${pct}%)` : ''}`}
                    </span>
                  ) : (
                    <span>Weight: fallback</span>
                  )}
                  <span>{(v.duration_ms / 1000).toFixed(1)}s</span>
                </div>
              </button>

              {!isDefault && (
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => onDelete(i)}
                  className="shrink-0 rounded-full p-1 text-text-3 hover:bg-danger/10 hover:text-danger focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
