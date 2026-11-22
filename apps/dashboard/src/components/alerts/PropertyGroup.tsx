import { useId, useState, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cx } from '@ferrocast/ui'

/**
 * One collapsible group in the editor's right dock. The header is a real button (keyboard and
 * screen reader), the body is a labelled region; closed groups keep their state while the
 * look changes.
 */
export function PropertyGroup({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  /** A short line shown on the right while it is closed. */
  summary?: string | undefined
  defaultOpen?: boolean | undefined
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section
      data-property-group={title}
      className="rounded-control border border-line bg-surface-2/50"
    >
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="fc-press flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          <span className="font-display text-[15px] font-extrabold tracking-tight text-text">
            {title}
          </span>
          {!open && summary && (
            <span className="ml-auto min-w-0 truncate text-[13px] font-medium text-text-3">
              {summary}
            </span>
          )}
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden="true"
            className={cx(
              'shrink-0 text-text-3 transition-transform duration-200 motion-reduce:transition-none',
              open && 'rotate-180',
              open || !summary ? 'ml-auto' : '',
            )}
          />
        </button>
      </h2>
      <div id={id} hidden={!open} className="px-3 pb-3">
        <div className="flex flex-col gap-3.5">{children}</div>
      </div>
    </section>
  )
}
