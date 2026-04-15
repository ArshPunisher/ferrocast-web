import { describeError } from '@ferrocast/api'
import type { ReactNode } from 'react'
import { cx } from '@ferrocast/ui'

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
  as: Tag = 'section',
  description,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
  as?: 'section' | 'div'
  description?: ReactNode
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
          <div className="min-w-0">
            {title && (
              <h2
                id={headingId}
                className="truncate font-display text-[15px] font-semibold tracking-tight text-text"
              >
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[13px] text-text-3">{description}</p>}
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
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-[-0.025em] text-balance text-text sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-text-3">{description}</p>
        )}
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
      <p className="text-[13px] text-text-2">{hint}</p>
      <button
        type="button"
        onClick={onRetry}
        className="fc-press mt-1 rounded-control border border-line-strong bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text hover:border-text-3"
      >
        Try again
      </button>
    </div>
  )
}
