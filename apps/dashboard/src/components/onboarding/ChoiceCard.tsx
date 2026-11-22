import { cx } from '@ferrocast/ui'

/** Selectable option card matching Ferrocast's Liquid-Metal onboarding controls. */
export function ChoiceCard({
  name,
  checked,
  onPick,
  title,
  detail,
  badge,
  disabled,
}: {
  name: string
  checked: boolean
  onPick: () => void
  title: string
  detail: string
  badge?: string | undefined
  disabled?: boolean | undefined
}) {
  return (
    <label
      className={cx(
        'flex flex-col gap-1 rounded-[12px] border px-4 py-3 transition-colors has-[:focus-visible]:shadow-[var(--fc-focus)]',
        disabled
          ? 'cursor-not-allowed border-line opacity-60'
          : checked
            ? 'fc-picked cursor-pointer border-transparent'
            : 'cursor-pointer border-line hover:border-line-strong',
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onPick}
      />
      <span className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[15px] font-bold break-words text-text">{title}</span>
        {badge && (
          <span className="rounded-full border border-current px-2 py-px text-[12px] font-medium opacity-80">
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 text-[13.5px] leading-snug break-words text-text-2">{detail}</span>
    </label>
  )
}
