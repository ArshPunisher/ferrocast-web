// Studio on Home: Start show (two clicks to go live), the show's state, and OBS warnings.

import { useState } from 'react'
import { Broadcast } from '@phosphor-icons/react'
import { Button } from '@ferrocast/ui'
import { href } from '../../lib/router'
import { useNow } from '../../lib/hooks'
import { clock } from './common'
import { useObsHealth } from './obs'
import { StartShowDialog, useShow } from './show'

export function StartShowButton() {
  const [open, setOpen] = useState(false)
  const [show] = useShow()
  const now = useNow(1000)
  const active = show && show.phase !== 'ended'
  if (active)
    return (
      <a
        href={href({ name: 'studio', section: 'show' })}
        className="fc-press inline-flex h-10 shrink-0 items-center gap-2 rounded-control border border-accent-line bg-accent-soft px-4 text-sm font-semibold whitespace-nowrap text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <Broadcast size={16} className="text-accent-text" aria-hidden="true" />
        {show.phase === 'countdown' && show.countdown_ends_at
          ? `Live in ${clock((show.countdown_ends_at - now) / 1000)}`
          : 'Show running'}
      </a>
    )
  return (
    <>
      <Button icon={<Broadcast size={16} />} onClick={() => setOpen(true)}>
        Start show
      </Button>
      <StartShowDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** One line per OBS warning (dropped frames, encoder lag, disk), only when there is one. */
export function ObsWarnings() {
  const h = useObsHealth()
  if (!h || h.warnings.length === 0) return null
  return (
    <section aria-label="OBS warnings" className="flex flex-col gap-2">
      {h.warnings.map((w) => (
        <div
          key={w.id}
          role="status"
          className={
            'flex flex-col gap-0.5 rounded-panel border px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ' +
            (w.level === 'error'
              ? 'border-danger/40 bg-danger-soft'
              : 'border-warn/40 bg-warn-soft')
          }
        >
          <p className="text-sm font-semibold text-text">OBS: {w.message}</p>
          <p className="min-w-0 flex-1 text-[13px] text-text-2">{w.hint}</p>
          <a
            href={href({ name: 'studio', section: 'obs' })}
            className="shrink-0 text-[13px] font-semibold text-accent-text hover:underline"
          >
            OBS health
          </a>
        </div>
      ))}
    </section>
  )
}
