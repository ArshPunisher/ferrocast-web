import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ICON_PATHS, type IconName } from '../platform-icons'
import { MARK_MAGNET, MARK_SPIKES, spikePath, type SpikeSpec } from '../ferro/mark'
import { SPARK, SPARK_SMALL, WORDMARK_BOX, WORDMARK_LETTERS, WORDMARK_LIVE, WORDMARK_O } from '../brand'
import { Ferrofluid, mountFerrofluid } from '../ferro/ferrofluid'
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

// The Spark mark (packages/ui/src/brand.ts): the f is ink (currentColor), the shard's upper
// half molten amber and lower half arc cyan, both from the theme tokens.
const MOLTEN = { fill: 'var(--fc-brand-molten)' }
const ARC = { fill: 'var(--fc-brand-arc)' }
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')

/** Single-colour mark for small sizes (the heavier small-size drawing). */
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
      <path d={SPARK_SMALL.f} />
      <path d={SPARK_SMALL.bolt} />
    </svg>
  )
}

/** The colour mark. The f takes the text colour; the shard follows the theme. */
export function LogoMark({
  size = 28,
  className,
  title,
}: {
  size?: number
  className?: string
  title?: string
}) {
  const small = size <= 20
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cx('shrink-0 text-text', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {small ? (
        <>
          <path d={SPARK_SMALL.f} fill="currentColor" />
          <path d={SPARK_SMALL.bolt} style={ARC} />
        </>
      ) : (
        <>
          <path d={SPARK.f} fill="currentColor" />
          <path d={SPARK.boltTop} style={MOLTEN} />
          <path d={SPARK.boltBottom} style={ARC} />
        </>
      )}
    </svg>
  )
}

/** The outlined "ferrocast" wordmark; the live dot in the o is molten amber. */
export function WordmarkText({ height = 16, className }: { height?: number; className?: string }) {
  const id = `wm${safeId(useId())}`
  const b = WORDMARK_BOX
  const w = b.width + 20
  return (
    <svg
      viewBox={`-10 ${b.y} ${w} ${b.height}`}
      height={height}
      width={Math.round((w / b.height) * height * 10) / 10}
      className={cx('shrink-0 text-text', className)}
      aria-hidden="true"
    >
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={-50} y={0} width={b.width + 100} height={800}>
          <rect x={-50} width={b.width + 100} height={800} fill="#fff" />
          <circle cx={WORDMARK_LIVE.cx} cy={WORDMARK_LIVE.cy} r={WORDMARK_LIVE.notch} fill="#000" />
        </mask>
      </defs>
      <path d={WORDMARK_LETTERS} fill="currentColor" />
      <path d={WORDMARK_O} fill="currentColor" mask={`url(#${id})`} />
      <circle cx={WORDMARK_LIVE.cx} cy={WORDMARK_LIVE.cy} r={WORDMARK_LIVE.dot} style={MOLTEN} />
    </svg>
  )
}

/** Mark + outlined wordmark. The last child is the text, so headers can hide it on phones. */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      translate="no"
      role="img"
      aria-label="Ferrocast"
      className={cx('inline-flex items-center gap-1.5 text-text', className)}
    >
      <LogoMark size={size === 'sm' ? 22 : 26} />
      <span className="inline-flex">
        <WordmarkText height={size === 'sm' ? 13.5 : 16} />
      </span>
    </span>
  )
}

/**
 * The mark for empty states, loading and onboarding: the f settles and the two halves of
 * the shard land once, a beat apart. Never loops; still under reduced motion.
 */
export function SparkMark({ size = 96, className }: { size?: number; className?: string }) {
  const reduce = useReducedMotion()
  const spring = { type: 'spring' as const, stiffness: 260, damping: 18, mass: 0.7 }
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cx('shrink-0 text-text', className)}
      aria-hidden="true"
    >
      <motion.path
        d={SPARK.f}
        fill="currentColor"
        initial={reduce ? false : { opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d={SPARK.boltTop}
        style={MOLTEN}
        initial={reduce ? false : { opacity: 0, x: 5, y: -7 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ ...spring, delay: 0.18 }}
      />
      <motion.path
        d={SPARK.boltBottom}
        style={ARC}
        initial={reduce ? false : { opacity: 0, x: -5, y: 7 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ ...spring, delay: 0.28 }}
      />
    </svg>
  )
}

/**
 * The ferrofluid's spikes rising once toward a magnet. Only the fallback for the WebGL
 * ferrofluid (FerroCanvas) uses it now; the logo is the Spark mark above.
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
      <SparkMark size={compact ? 52 : 84} />
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
  accent = '#33d4ff',
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
    const ok = Ferrofluid.supported()
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
