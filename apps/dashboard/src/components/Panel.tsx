import { describeError } from '@ferrocast/api'
import type { ReactNode } from 'react'
import { InfoTip, cx } from '@ferrocast/ui'

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
  as: Tag = 'section',
  description,
  scrolls,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
  as?: 'section' | 'div'
  description?: ReactNode
  /** The body scrolls inside the panel: it takes keyboard focus so arrows can scroll it. */
  scrolls?: boolean
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <Tag
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cx(
        'flex min-w-0 flex-col rounded-panel border border-line bg-surface-1 shadow-1',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-4 pt-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1">
            {title && (
              <h2
                id={headingId}
                className="truncate font-display text-[18px] font-extrabold tracking-tight text-text"
              >
                {title}
              </h2>
            )}
            {description && <InfoTip>{description}</InfoTip>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div
        className={cx(
          'min-h-0 flex-1 px-4 pb-4 sm:px-5',
          title || actions ? 'pt-2' : 'pt-4',
          bodyClassName,
        )}
        {...(scrolls && { tabIndex: 0 })}
      >
        {children}
      </div>
    </Tag>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.025em] text-balance text-text sm:text-[32px]">
          {title}
        </h1>
        {description && <InfoTip>{description}</InfoTip>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A friendly error block with a retry, for screens whose data didn't load. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const d = describeError(error)
  const msg = d.message
  const hint = d.hint ?? 'Try again in a moment.'
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-panel border border-danger/30 bg-danger-soft p-4"
    >
      <p className="text-sm font-semibold text-text">{msg}</p>
      <p className="text-[14px] text-text-2">{hint}</p>
      <button
        type="button"
        onClick={onRetry}
        className="fc-press mt-1 rounded-control border border-line-strong bg-surface-2 px-3 py-1.5 text-[14px] font-semibold text-text hover:border-text-3"
      >
        Try again
      </button>
    </div>
  )
}
