// The engine's notices as banners under the header: one at a time (the newest), one line, its
// detail behind an (i). The others wait behind a "+N more" that opens them all (and "Show one"
// folds them back), so a burst of warnings never stacks into a wall of banners.

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { InfoLine, cx } from '@ferrocast/ui'
import type { NoticeItem } from '../lib/store'

export function NoticeBanners({
  notices,
  dismiss,
}: {
  notices: NoticeItem[]
  dismiss: (id: number) => void
}) {
  const reduce = useReducedMotion()
  const [all, setAll] = useState(false)
  // A single one left has nothing to fold, so asking for "all" stops applying.
  const open = all && notices.length > 1
  const shown = open ? notices : notices.slice(-1)
  const waiting = notices.length - shown.length
  const last = shown[shown.length - 1]
  return (
    <AnimatePresence initial={false}>
      {shown.map((n) => (
        <motion.div
          key={n.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          role={n.level === 'error' ? 'alert' : 'status'}
          className={cx(
            'overflow-hidden border-b',
            n.level === 'warn' && 'border-warn/30 bg-warn-soft',
            n.level === 'error' && 'border-danger/30 bg-danger-soft',
            n.level === 'info' && 'border-line bg-surface-1',
          )}
        >
          <div className="flex items-start gap-3 px-4 py-2.5 text-sm sm:px-6">
            <InfoLine
              detail={n.detail}
              label="More about this notice"
              className="min-w-0 flex-1 pt-0.5"
            >
              <p className="text-text">{n.message}</p>
            </InfoLine>
            {n === last && (waiting > 0 || open) && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setAll(!open)}
                className="shrink-0 pt-0.5 font-semibold text-text-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {open ? 'Show one' : `+${waiting} more`}
              </button>
            )}
            {n.action && (
              <a
                href={n.action.href}
                className="shrink-0 pt-0.5 font-semibold text-accent-text hover:underline"
              >
                {n.action.label}
              </a>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(n.id)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-text-3 hover:bg-surface-3 hover:text-text"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
