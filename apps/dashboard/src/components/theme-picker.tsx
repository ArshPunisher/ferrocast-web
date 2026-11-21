// Settings › Appearance: the ten themes as cards, each with a small picture of the Studio in
// its own colours. A radio group (arrow keys move and choose, a screen reader hears the name,
// the kind and the description). The colours come from the theme's tokens via
// `data-theme-preview`, so a card never changes the page's own theme.

import { useId } from 'react'
import { Check } from '@phosphor-icons/react'
import { cx } from '@ferrocast/ui'
import type { ThemeId } from '@ferrocast/api'
import { THEMES } from '../lib/themes'

/** A Studio in miniature: rail, the picture area with the canvas, three docks. */
function Mini({ id }: { id: ThemeId }) {
  return (
    <span
      aria-hidden
      data-theme-preview={id}
      className="grid h-24 grid-cols-[14px_minmax(0,1fr)] overflow-hidden rounded-[8px] bg-[var(--fc-bg)] ring-1 ring-[var(--fc-line)]"
    >
      <span className="border-r border-[var(--fc-line)] bg-[var(--fc-surface-1)]" />
      <span className="grid min-w-0 grid-rows-[minmax(0,1fr)_30px] gap-1 p-1.5">
        <span className="grid min-h-0 place-items-center overflow-hidden rounded-[4px] bg-[var(--fc-stage)]">
          <span className="aspect-video h-4/5 rounded-[2px] bg-[var(--fc-canvas)] ring-1 ring-[var(--fc-line-strong)]" />
        </span>
        <span className="grid grid-cols-[1fr_1fr_1.3fr] gap-1">
          <span className="rounded-[4px] border border-[var(--fc-line)] bg-[var(--fc-surface-1)]" />
          <span className="rounded-[4px] border border-[var(--fc-line)] bg-[var(--fc-surface-1)]" />
          <span className="relative rounded-[4px] border border-[var(--fc-line)] bg-[var(--fc-surface-1)]">
            <span className="absolute inset-x-1 bottom-1 h-[3px] rounded-full bg-[var(--fc-accent)]" />
          </span>
        </span>
      </span>
    </span>
  )
}

export function ThemePicker({
  value,
  onChange,
}: {
  /** The chosen theme, or null while the app follows the computer. */
  value: ThemeId | null
  onChange: (id: ThemeId) => void
}) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      {THEMES.map((t) => {
        const on = t.id === value
        const describedBy = `${name}-${t.id}`
        return (
          <label
            key={t.id}
            className={cx(
              'fc-press relative grid cursor-pointer content-start gap-2 rounded-panel border bg-surface-1 p-2.5 transition-colors duration-150',
              'has-[:focus-visible]:shadow-[var(--fc-focus)]',
              on
                ? 'border-[var(--fc-pick)] shadow-[0_0_0_1px_var(--fc-pick)]'
                : 'border-line hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={t.id}
              checked={on}
              aria-describedby={describedBy}
              onChange={() => onChange(t.id)}
              className="sr-only"
            />
            <Mini id={t.id} />
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[14.5px] font-bold text-text">{t.name}</span>
              <span className="text-[12.5px] font-semibold text-text-3">
                {t.kind === 'dark' ? 'Dark' : 'Light'}
              </span>
            </span>
            <span id={describedBy} className="text-[13px] leading-snug text-text-2">
              {t.blurb}
            </span>
            {on && (
              <span
                aria-hidden
                className="fc-picked absolute top-3.5 right-3.5 grid size-5 place-items-center rounded-full"
              >
                <Check size={12} weight="bold" />
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}
