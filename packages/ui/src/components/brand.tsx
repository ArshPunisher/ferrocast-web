import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ICON_PATHS, type IconName } from '../platform-icons'
import { MARK_MAGNET, MARK_SPIKES, SPIKE_MARK_PATH, spikePath, type SpikeSpec } from '../ferro/mark'
import { mountFerrofluid } from '../ferro/ferrofluid'
import { cx } from '../cx'

type PlatformName = 'twitch' | 'youtube' | 'kick' | 'tips' | 'ferrocast'
const LABEL: Record<PlatformName, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tips: 'Tip',
  ferrocast: 'Ferrocast',
}
const COLOR: Record<PlatformName, string> = {
  twitch: 'text-twitch',
  youtube: 'text-youtube',
  kick: 'text-kick',
  tips: 'text-tips',
  ferrocast: 'text-accent-text',
}

/** The platform's glyph in its colour, announced by name. */
export function PlatformMark({
  platform,
  size = 14,
  className,
}: {
  platform: PlatformName
  size?: number
  className?: string
}) {
  if (platform === 'tips' || platform === 'ferrocast') {
    return (
      <span
        role="img"
        aria-label={LABEL[platform]}
        className={cx('inline-flex shrink-0', COLOR[platform], className)}
      >
        <FerroGlyph size={size} />
      </span>
    )
  }
  return (
    <svg
      role="img"
      aria-label={LABEL[platform]}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={cx('shrink-0', COLOR[platform], className)}
    >
      <path d={ICON_PATHS[platform as IconName]} />
    </svg>
  )
}

export function BrandIcon({
  name,
  size = 16,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={cx('shrink-0', className)}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

/** Single-colour mark for small sizes. */
export function FerroGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d={SPIKE_MARK_PATH} />
      <circle cx={MARK_MAGNET.cx} cy={MARK_MAGNET.cy} r={MARK_MAGNET.r} />
    </svg>
  )
}

/** The colour mark: chrome spikes and the cobalt magnet. */
export function LogoMark({
  size = 28,
  className,
  title,
}: {
  size?: number
  className?: string
  title?: string
}) {
  const id = useRef(`lm${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="14" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.32" stopColor="#c3cad6" />
          <stop offset="0.62" stopColor="#4a515d" />
          <stop offset="0.82" stopColor="#14171c" />
          <stop offset="1" stopColor="#2c323b" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="50" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3461f5" stopOpacity="0" />
          <stop offset="1" stopColor="#3461f5" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d={SPIKE_MARK_PATH} fill={`url(#${id}c)`} />
      <path d={SPIKE_MARK_PATH} fill={`url(#${id}r)`} />
      <circle cx={MARK_MAGNET.cx} cy={MARK_MAGNET.cy} r={MARK_MAGNET.r} fill="#3461f5" />
    </svg>
  )
}

export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <LogoMark size={size === 'sm' ? 22 : 28} />
      <span
        className={cx(
          'font-display font-bold tracking-[-0.03em] text-text',
          size === 'sm' ? 'text-[17px]' : 'text-xl',
        )}
      >
        ferrocast
      </span>
    </span>
  )
}

/**
 * The mark with live spikes for empty states and onboarding: they rise once when it
 * appears (a magnet arriving), then sit still. No infinite loop.
 */
export function FerroSpikes({
  size = 96,
  className,
  energy = 1,
}: {
  size?: number
  className?: string
  energy?: number
}) {
  const reduce = useReducedMotion()
  const flat: SpikeSpec[] = MARK_SPIKES.map((s) => ({ ...s, h: 1.5 }))
  const full: SpikeSpec[] = MARK_SPIKES.map((s) => ({ ...s, h: s.h * energy }))
  const id = useRef(`fs${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="14" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--fc-text)" />
          <stop offset="0.45" stopColor="var(--fc-text-3)" />
          <stop offset="1" stopColor="var(--fc-surface-3)" />
        </linearGradient>
      </defs>
      <motion.path
        fill={`url(#${id}c)`}
        initial={reduce ? false : { d: spikePath(flat) }}
        animate={{ d: spikePath(full) }}
        transition={{ type: 'spring', stiffness: 140, damping: 11, mass: 0.9, delay: 0.15 }}
      />
      <motion.circle
        cx={MARK_MAGNET.cx}
        r={MARK_MAGNET.r}
        fill="var(--fc-accent)"
        initial={reduce ? false : { cy: -6, opacity: 0 }}
        animate={{ cy: MARK_MAGNET.cy, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

export function EmptyState({
  title,
  children,
  action,
  className,
  compact,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 py-6' : 'gap-3 py-12',
        className,
      )}
    >
      <FerroSpikes size={compact ? 52 : 84} />
      <h3 className="font-display text-base font-semibold tracking-tight text-text">{title}</h3>
      {children && (
        <div className="max-w-[42ch] text-sm leading-relaxed text-text-3">{children}</div>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** The WebGL ferrofluid in a canvas, with the SVG mark as the fallback. */
export function FerroCanvas({
  className,
  background,
  accent = '#3461f5',
  light,
  label,
}: {
  className?: string
  background: string
  accent?: string
  light?: boolean
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let ok: boolean
    try {
      ok = !!document.createElement('canvas').getContext('webgl')
    } catch {
      ok = false
    }
    if (!ok) {
      setFailed(true)
      return
    }
    return mountFerrofluid(c, {
      background,
      accent,
      light: !!light,
      reducedMotion: !!reduce,
      onReady: () => setReady(true),
    })
  }, [background, accent, light, reduce])
  if (failed)
    return (
      <div
        className={cx('flex items-center justify-center', className)}
        role={label ? 'img' : undefined}
        aria-label={label}
      >
        <FerroSpikes size={140} />
      </div>
    )
  return (
    <canvas
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'transition-opacity duration-700',
        ready ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  )
}
