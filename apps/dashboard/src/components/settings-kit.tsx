// Settings, layout A (owner's pick, 10 Nov): like the Mac's System Settings. A page opens
// with its icon and one line; settings sit in titled groups, one row each: the name and a
// short line on the left, the control on the right. A setting that needs another one appears
// under it only while that one is on (no greyed-out controls with "turn on … first").

import { useId, type ComponentType, type ReactNode } from 'react'
import { Switch, cx } from '@ferrocast/ui'

/** The page's head: a coloured icon tile, the title and what the page is for. */
export function SettingsHead({
  icon: Icon,
  tone,
  title,
  description,
  aside,
}: {
  icon: ComponentType<{ size?: number; weight?: 'fill'; 'aria-hidden'?: boolean }>
  /** The tile's colour: a solid that white reads on (3:1 or more, it's a graphic). */
  tone: string
  title: string
  description?: ReactNode
  /** Something at the far end: a status chip or the page's one switch. */
  aside?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-center gap-3.5">
      <span
        className="grid size-11 shrink-0 place-items-center rounded-[12px] text-white"
        style={{ background: tone }}
      >
        <Icon size={22} weight="fill" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[24px] leading-tight font-bold tracking-[-0.025em] text-text">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[14.5px] text-text-3">{description}</p>}
      </div>
      {aside}
    </header>
  )
}

/** A titled group of rows in one card. `plain` keeps the rows without the card (a list
 *  that draws its own). */
export function Group({
  title,
  badge,
  note,
  plain,
  children,
  id,
}: {
  title?: ReactNode
  badge?: ReactNode
  /** A line under the card: what the group is about, or what applies to all of it. */
  note?: ReactNode
  plain?: boolean
  children: ReactNode
  id?: string
}) {
  const auto = useId()
  const heading = title ? `${id ?? auto}-group` : undefined
  return (
    <section id={id} aria-labelledby={heading} className="mb-7 scroll-mt-20 last:mb-0">
      {title && (
        <h3
          id={heading}
          className="mx-1 mb-2 flex items-center gap-2 text-[13.5px] font-bold text-text-3"
        >
          {title}
          {badge}
        </h3>
      )}
      {plain ? (
        children
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface-1 shadow-1">
          {children}
        </div>
      )}
      {note && <p className="mx-1 mt-2 text-[14px] text-text-3">{note}</p>}
    </section>
  )
}

/** One setting: its name and a short line on the left, its control on the right. With no
 *  control, `children` fill the row (a list, a form, a meter). `child` marks a setting that
 *  belongs to the one above it. */
export function Row({
  label,
  description,
  htmlFor,
  control,
  children,
  child,
  className,
}: {
  label?: ReactNode
  description?: ReactNode
  htmlFor?: string | undefined
  control?: ReactNode
  children?: ReactNode
  child?: boolean | undefined
  className?: string | undefined
}) {
  const head = label && (
    <div className="min-w-0 flex-[1_1_220px]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-[15px] font-semibold text-text">
          {label}
        </label>
      ) : (
        <div className="text-[15px] font-semibold text-text">{label}</div>
      )}
      {description && <div className="mt-0.5 text-[14px] text-text-3">{description}</div>}
    </div>
  )
  return (
    <div
      className={cx(
        'px-4 py-3.5 sm:px-5',
        child && 'bg-surface-2 sm:pl-9',
        control !== undefined && 'flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2.5',
        className,
      )}
    >
      {head}
      {control !== undefined && (
        <div className="flex max-w-full flex-wrap items-center gap-2">{control}</div>
      )}
      {children && <div className={label ? 'mt-3' : undefined}>{children}</div>}
    </div>
  )
}

/** A row whose control is a switch; the name is the switch's label. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  child,
}: {
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean | undefined
  child?: boolean | undefined
}) {
  const id = useId()
  return (
    <Row
      label={label}
      description={description}
      htmlFor={id}
      child={child}
      control={
        <Switch
          id={id}
          hideLabel
          label={label}
          checked={checked}
          onChange={onChange}
          disabled={disabled === true}
        />
      }
    />
  )
}
