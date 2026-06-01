import type React from 'react'
import { spikePath } from '@ferrocast/ui/ferro'
import { SPARK_SMALL } from '@ferrocast/ui/brand'
import { ICON_PATHS } from '@ferrocast/ui/platform-icons'
import { C } from '../theme'

export type Platform = 'twitch' | 'youtube' | 'kick' | 'tips' | 'obs'

const COLORS: Record<Platform, string> = {
  twitch: C.twitch,
  youtube: C.youtube,
  kick: C.kick,
  tips: C.tips,
  obs: C.text,
}

// The ferrofluid spikes (packages/ui/src/ferro/mark.ts), used only by the alert's spike
// flourish below. The logo itself is the Spark mark (packages/ui/src/brand.ts).
const SPIKES = [
  { x: 11, h: 9 },
  { x: 21.5, h: 18 },
  { x: 32, h: 28 },
  { x: 42.5, h: 18 },
  { x: 53, h: 9 },
]
const MAGNET = { cx: 32, cy: 9, r: 4 }

/** A platform glyph in its colour. Tips use the Ferrocast mark. */
export const PlatformGlyph: React.FC<{ platform: Platform; size: number; color?: string }> = ({
  platform,
  size,
  color,
}) => {
  if (platform === 'tips') return <FerroGlyph size={size} color={color ?? COLORS.tips} />
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d={ICON_PATHS[platform]} fill={color ?? COLORS[platform]} />
    </svg>
  )
}

export const FerroGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} style={{ flexShrink: 0 }}>
    <path d={SPARK_SMALL.f} fill={color} />
    <path d={SPARK_SMALL.bolt} fill={color} />
  </svg>
)

/**
 * The colour mark with spikes scaled by `energy` (0 = flat puddle, 1 = logo). Used for the
 * alert's "spike flourish": the drop rises when the alert lands.
 */
export const SpikeMark: React.FC<{ size: number; energy: number; magnet?: number; id: string }> = ({
  size,
  energy,
  magnet = 1,
  id,
}) => {
  const spikes = SPIKES.map((s) => ({ x: s.x, h: Math.max(1.2, s.h * energy) }))
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`${id}-c`} x1="0" y1="14" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.32" stopColor="#c3cad6" />
          <stop offset="0.62" stopColor="#4a515d" />
          <stop offset="0.82" stopColor="#14171c" />
          <stop offset="1" stopColor="#2c323b" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="50" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.accent} stopOpacity="0" />
          <stop offset="1" stopColor={C.accent} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path d={spikePath(spikes)} fill={`url(#${id}-c)`} />
      <path d={spikePath(spikes)} fill={`url(#${id}-r)`} />
      <circle
        cx={MAGNET.cx}
        cy={MAGNET.cy - (1 - magnet) * 14}
        r={MAGNET.r}
        fill={C.accent}
        opacity={magnet}
      />
    </svg>
  )
}

/** A check mark drawn by `progress` (0..1). */
export const Check: React.FC<{
  size: number
  progress: number
  color?: string
  stroke?: number
}> = ({ size, progress, color = C.ok, stroke = 3 }) => {
  const len = 30
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - progress)}
      />
    </svg>
  )
}

/** A plain arrow pointer for the "this is where you click" moments. */
export const Cursor: React.FC<{ x: number; y: number; pressed: number; scale?: number }> = ({
  x,
  y,
  pressed,
  scale = 1,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: 34 * scale,
      height: 44 * scale,
      scale: String(1 - pressed * 0.12),
      transformOrigin: '6px 4px',
      filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
      pointerEvents: 'none',
      zIndex: 10,
    }}
  >
    <svg viewBox="0 0 34 44" width={34 * scale} height={44 * scale}>
      <path
        d="M3 2 L3 34 L11 26.5 L16.5 39.5 L22.5 37 L17 24.5 L28 24.5 Z"
        fill="#f4f6fa"
        stroke="#0a0b0d"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  </div>
)
