import type React from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { PlatformGlyph, SparkMark } from '../components/marks'
import { C, EASE_OUT, FONT } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = Easing.bezier(...EASE_OUT)

/**
 * The Spark mark reacting to an alert. The mark rests; an alert lands: the f gathers and
 * springs up, the shard's molten and arc halves split along their cut and snap back
 * together with a flash, a ring of arc light spreads out and the alert chip rises under the
 * mark, then everything settles back to rest. Embers drift up off the shard the whole time.
 *
 * Everything is a pure function of the frame and periodic over the composition, so frame 0
 * follows the last frame without a seam: the reaction starts and ends at rest, the embers
 * and the ambient glow complete whole cycles.
 */

// Reaction beats, in frames of the 240-frame loop.
const GATHER = 26 // the f dips
const OPEN = 34 // the shard starts to split
const SNAP = 44 // halves close: flash, ring, rise
const CHIP_IN = 48
const CHIP_OUT = 172

/** Deterministic pseudo-random in 0..1. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  phase: rand(i, 1),
  x: (rand(i, 2) - 0.5) * 2,
  drift: (rand(i, 3) - 0.5) * 2,
  size: 3 + rand(i, 4) * 4,
  // Whole cycles per loop keep the loop seamless.
  cycles: 1 + Math.floor(rand(i, 5) * 2),
  molten: rand(i, 6) > 0.45,
}))

export const HeroLoop: React.FC = () => {
  const frame = useCurrentFrame()
  const { durationInFrames, width, height } = useVideoConfig()
  const p = frame / durationInFrames
  const tau = Math.PI * 2

  const markSize = Math.round(height * 0.44)
  const cx = width / 2
  const cy = height * 0.42

  // The f: a small gather before the alert, a springy rise on the snap, then rest.
  const rise = interpolate(
    frame,
    [0, GATHER, SNAP - 2, SNAP + 6, SNAP + 14, SNAP + 24, durationInFrames],
    [1, 1, 0.9, 1.07, 0.985, 1, 1],
    { ...clamp, easing: Easing.inOut(Easing.sin) },
  )
  // The shard halves part along their cut, then snap shut.
  const split = interpolate(frame, [OPEN, SNAP - 4, SNAP], [0, 1, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  })
  // Flash on the snap, decaying slowly.
  const flash = interpolate(frame, [SNAP - 1, SNAP + 2, SNAP + 90], [0, 1, 0], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  })
  // One ring of arc light from the shard.
  const ringT = interpolate(frame, [SNAP, SNAP + 70], [0, 1], { ...clamp, easing: ease })
  // The alert chip.
  const chipIn = interpolate(frame, [CHIP_IN, CHIP_IN + 14], [0, 1], { ...clamp, easing: ease })
  const chipOut = interpolate(frame, [CHIP_OUT, CHIP_OUT + 12], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.quad),
  })
  const chip = chipIn * (1 - chipOut)
  // Ambient breathing: one whole cycle per loop.
  const breathe = 0.5 + 0.5 * Math.sin(tau * p - Math.PI / 2)

  // The shard sits right of the f's stem, about (40, 34) in the 64 box.
  const shardX = cx + (markSize / 64) * 9
  const shardY = cy + (markSize / 64) * 2

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      {/* Ambient light: molten from above left, arc from below right. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 52% at 44% 34%, rgba(255,164,36,${0.1 + 0.04 * breathe + 0.12 * flash}), rgba(10,11,13,0) 70%), radial-gradient(46% 56% at 58% 56%, rgba(51,212,255,${0.08 + 0.03 * (1 - breathe) + 0.1 * flash}), rgba(10,11,13,0) 70%)`,
        }}
      />
      {/* A low floor line for the mark to stand on. */}
      <div
        style={{
          position: 'absolute',
          left: cx - markSize * 0.9,
          width: markSize * 1.8,
          top: cy + markSize * 0.36,
          height: markSize * 0.2,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, rgba(255,164,36,${0.14 + 0.2 * flash}), rgba(255,164,36,0))`,
          scale: `${1 + 0.08 * flash} 1`,
        }}
      />
      {/* Ring */}
      {ringT > 0 && ringT < 1 && (
        <div
          style={{
            position: 'absolute',
            left: shardX,
            top: shardY,
            width: markSize * 2.2,
            height: markSize * 2.2,
            marginLeft: -markSize * 1.1,
            marginTop: -markSize * 1.1,
            borderRadius: '50%',
            border: `2px solid rgba(51,212,255,${0.55 * (1 - ringT)})`,
            scale: String(0.2 + 0.8 * ringT),
          }}
        />
      )}
      {/* Embers drifting up off the shard. Each fades in and out inside its own cycle. */}
      {EMBERS.map((e, i) => {
        const u = (((p * e.cycles + e.phase) % 1) + 1) % 1
        const a = Math.sin(Math.PI * u) ** 2 * (0.5 + 0.5 * flash)
        const x = shardX + e.x * markSize * 0.18 + e.drift * u * markSize * 0.35
        const y = shardY - u * markSize * 0.95
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: e.size,
              height: e.size,
              marginLeft: -e.size / 2,
              marginTop: -e.size / 2,
              borderRadius: '50%',
              background: e.molten ? C.molten : C.arc,
              opacity: a * 0.8,
              boxShadow: `0 0 ${e.size * 2}px ${e.molten ? 'rgba(255,164,36,0.6)' : 'rgba(51,212,255,0.6)'}`,
            }}
          />
        )
      })}
      {/* The mark */}
      <div
        style={{
          position: 'absolute',
          left: cx - markSize / 2,
          top: cy - markSize / 2,
          filter: `drop-shadow(0 ${markSize * 0.05}px ${markSize * 0.08}px rgba(0,0,0,0.55))`,
        }}
      >
        <SparkMark size={markSize} rise={rise} split={split} />
      </div>
      {/* The alert chip */}
      {chip > 0 && (
        <div
          style={{
            position: 'absolute',
            left: cx,
            top: cy + markSize * 0.62,
            translate: `-50% ${(1 - chipIn) * 26 + chipOut * 12}px`,
            opacity: chip,
            scale: String(0.94 + 0.06 * chipIn),
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            height: 76,
            padding: '0 32px 0 24px',
            borderRadius: 999,
            border: `1px solid ${C.lineStrong}`,
            background: 'linear-gradient(180deg, #1a1e25, #0d0f13)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 60px -24px rgba(0,0,0,0.9), 0 10px 30px -18px rgba(255,164,36,0.5)',
            fontFamily: FONT.display,
            fontWeight: 720,
            fontSize: 32,
            letterSpacing: '-0.02em',
            color: C.text,
            whiteSpace: 'nowrap',
          }}
        >
          <PlatformGlyph platform="twitch" size={30} />
          NovaRiver followed!
        </div>
      )}
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </AbsoluteFill>
  )
}
