import { LogoMark, cx } from '@ferrocast/ui'

/** "Built-in" with the small Spark: built-ins show the mark on stream, your own designs never do. */
export function BrandChip({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      title="Built-in: shows a small Ferrocast mark on stream. Duplicate it for a copy without branding."
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 pr-2.5 pl-1.5 font-mono text-[11.5px] font-semibold text-text-2',
        className,
      )}
    >
      <LogoMark size={14} />
      {label ?? 'Built-in'}
    </span>
  )
}
