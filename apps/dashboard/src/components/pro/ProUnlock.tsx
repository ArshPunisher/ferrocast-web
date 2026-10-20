// The one-time "You're Pro" moment (design option B, Seam): right after Pro turns on, a
// dialog where the Spark assembles on a spring, "Pro" catches one molten sheen and what's now
// on staggers in, with the Sparkle sound. It plays once per subscription on this install and
// never again; under reduced motion everything is a short fade.

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CloudArrowUp, DeviceMobile, Robot, Waveform, type Icon } from '@phosphor-icons/react'
import type { ProView } from '@ferrocast/api'
import { Button, SparkMark } from '@ferrocast/ui'
import { playBuiltin } from '@ferrocast/overlays'
import { href } from '../../lib/router'
import { PRO_UNLOCKED_EVENT, markUnlockShown, unlockShown } from '../../lib/pro-status'

const ON: { icon: Icon; text: string }[] = [
  { icon: Robot, text: '24/7 cloud bot' },
  { icon: DeviceMobile, text: 'Dashboard from anywhere' },
  { icon: Waveform, text: 'Ferrocast voices' },
  { icon: CloudArrowUp, text: 'Cloud backups, Discord bot and more' },
]

/** Whether the unlock should play for this status now. */
export function shouldUnlock(p: ProView | null): p is ProView {
  return !!p && p.active && !unlockShown(p)
}

export function ProUnlock({ pro }: { pro: ProView | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!shouldUnlock(pro)) return
    // Remembered at once: a reload in the middle never plays it twice.
    markUnlockShown(pro)
    setOpen(true)
  }, [pro])

  useEffect(() => {
    const d = ref.current
    if (!d || !open) return
    if (!d.open) d.showModal()
    // The sound lands with the shard. A browser that blocks sound without a click stays quiet.
    const t = setTimeout(() => playBuiltin('sparkle', 70), 180)
    return () => clearTimeout(t)
  }, [open])

  const close = () => {
    ref.current?.close()
    setOpen(false)
    window.dispatchEvent(new Event(PRO_UNLOCKED_EVENT))
  }

  if (!open || !pro) return null
  const ease = [0.22, 1, 0.36, 1] as const
  const cloudBot = pro.features.cloud_bot
  return (
    <dialog
      ref={ref}
      aria-labelledby="fc-unlock-title"
      aria-describedby="fc-unlock-text"
      className="fc-unlock m-auto w-[min(380px,calc(100%-32px))] overflow-visible bg-transparent p-0 text-text"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === ref.current) close()
      }}
      data-testid="pro-unlock"
    >
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0.16 : 0.28, ease }}
        className="grid justify-items-center gap-3 rounded-panel border border-line-strong bg-surface-1 px-6 pt-6 pb-5 text-center shadow-pop"
      >
        <SparkMark size={76} />
        <h2
          id="fc-unlock-title"
          className="font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em]"
        >
          You’re <span className="fc-metal">Pro</span>
        </h2>
        <p id="fc-unlock-text" className="text-[14.5px] text-text-2">
          Thank you for backing Ferrocast. This is now on:
        </p>
        <ul className="mt-1 grid w-full gap-2 text-left">
          {ON.map((f, i) => (
            <motion.li
              key={f.text}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : 0.52 + i * 0.055, ease }}
              className="flex items-center gap-2.5 rounded-[10px] bg-surface-2 px-2.5 py-2 text-[14px]"
            >
              <f.icon size={18} className="shrink-0 text-accent-text" aria-hidden />
              {f.text}
            </motion.li>
          ))}
        </ul>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          {cloudBot ? (
            <a
              href={href({ name: 'bot' })}
              onClick={close}
              className="fc-press inline-flex h-10 items-center rounded-control bg-btn-primary px-4 text-sm font-semibold text-on-btn-primary hover:bg-btn-primary-hover focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              Set up the cloud bot
            </a>
          ) : (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          )}
          {cloudBot && (
            <Button variant="ghost" onClick={close}>
              Later
            </Button>
          )}
        </div>
      </motion.div>
    </dialog>
  )
}
