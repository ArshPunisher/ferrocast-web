import type React from 'react'
import { SPARK, SPARK_SMALL } from '@ferrocast/ui/brand'
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

/** Where the f stands: the overlay scales the flourish from 50% 86% of its box. */
const BASE_Y = 64 * 0.86

/**
 * The Spark mark (packages/ui/src/brand.ts) with the overlay alert's flourish
 * (apps/overlays/src/styles/alert.css): `rise` scales the mark up from its base (0 = flat,
 * 1 = at rest, a little over 1 on the overshoot) and `drop` brings the split shard down
 * into place (0 = 18 px above and hidden, 1 = landed). `split` pushes the shard's halves
 * apart along their cut (0 = closed), used by the hero loop.
 */
export const SparkMark: React.FC<{
  size: number
  rise?: number
  drop?: number
  split?: number
  ink?: string
  molten?: string
  arc?: string
  style?: React.CSSProperties
}> = ({
  size,
  rise = 1,
  drop = 1,
  split = 0,
  ink = C.ink,
  molten = C.molten,
  arc = C.arc,
  style,
}) => {
  // The overlay drops the shard 18 px in a 92 px box: about 12.5 units of the 64 box.
  const dropY = -12.5 * (1 - drop)
  // The cut runs from (12,38) to (52,26) in bolt space; the upper half moves out along the
  // cut's normal (up and to the left), the lower half the opposite way.
  const nx = -0.287 * split * 6
  const ny = -0.958 * split * 6
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0, overflow: 'visible', ...style }}
    >
      <g
        transform={`translate(0 ${BASE_Y}) scale(1 ${Math.max(rise, 0.0001)}) translate(0 ${-BASE_Y})`}
      >
        <path d={SPARK.f} fill={ink} />
        <g transform={`translate(0 ${dropY})`} opacity={Math.min(Math.max(drop, 0), 1)}>
          <path d={SPARK.boltTop} fill={molten} transform={`translate(${nx} ${ny})`} />
          <path d={SPARK.boltBottom} fill={arc} transform={`translate(${-nx} ${-ny})`} />
        </g>
      </g>
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
