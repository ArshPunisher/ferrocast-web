// Home's welcome strip once Pro is on: three things worth setting up, one click each.
// Dismissable (remembered per subscription); arrives once with the unlock, still after that.

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CloudArrowUp, DiscordLogo, Robot, X, type Icon } from '@phosphor-icons/react'
import type { ProView } from '@ferrocast/api'
import { SparkMark } from '@ferrocast/ui'
import { href, type Route } from '../../lib/router'
import {
  PRO_UNLOCKED_EVENT,
  dismissWelcome,
  useProStatus,
  welcomeDismissed,
} from '../../lib/pro-status'

const STEPS: { icon: Icon; label: string; route: Route; feature: keyof ProView['features'] }[] = [
  { icon: Robot, label: 'Cloud bot', route: { name: 'bot' }, feature: 'cloud_bot' },
  {
    icon: DiscordLogo,
    label: 'Discord roles',
    route: { name: 'settings', section: 'discord' },
    feature: 'discord',
  },
  {
    icon: CloudArrowUp,
    label: 'Backups',
    route: { name: 'settings', section: 'data' },
    feature: 'backups',
  },
]

export function ProWelcome() {
  const pro = useProStatus()
  const reduce = useReducedMotion()
  const [hidden, setHidden] = useState(false)
  const [arrive, setArrive] = useState(false)
  useEffect(() => {
    const on = () => setArrive(true)
    window.addEventListener(PRO_UNLOCKED_EVENT, on)
    return () => window.removeEventListener(PRO_UNLOCKED_EVENT, on)
  }, [])
  if (!pro?.active || hidden || welcomeDismissed(pro)) return null
  // Only what this relay has (a step that leads nowhere is worse than none).
  const steps = STEPS.filter((s) => pro.features[s.feature])
  if (steps.length === 0) return null
  return (
    <motion.section
      key={arrive ? 'arrive' : 'still'}
      aria-labelledby="pro-welcome"
      data-testid="pro-welcome"
      initial={arrive ? (reduce ? { opacity: 0 } : { opacity: 0, y: -6 }) : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-panel border border-line bg-[linear-gradient(90deg,color-mix(in_srgb,var(--fc-brand-molten)_12%,transparent),var(--fc-accent-soft))] py-3.5 pr-2 pl-4"
    >
      <SparkMark size={34} />
      <div className="min-w-0">
        <h2 id="pro-welcome" className="text-[15.5px] font-semibold text-text">
          Pro is on. {steps.length === 3 ? 'Three things' : 'A few things'} worth setting up:
        </h2>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
          {steps.map((s) => (
            <li key={s.label}>
              <a
                href={href(s.route)}
                className="inline-flex items-center gap-1.5 rounded-[6px] text-[14.5px] font-medium text-text-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <s.icon size={16} className="text-accent-text" aria-hidden />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label="Hide this"
        onClick={() => {
          dismissWelcome(pro)
          setHidden(true)
        }}
        className="fc-press inline-flex size-9 items-center justify-center self-start rounded-control text-text-3 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <X size={16} />
      </button>
    </motion.section>
  )
}
