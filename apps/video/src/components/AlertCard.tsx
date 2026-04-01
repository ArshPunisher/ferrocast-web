import type React from 'react'
import { Easing, interpolate, spring, useVideoConfig } from 'remotion'
import { C, EASE_OUT, FONT } from '../theme'
import { PlatformGlyph, SpikeMark, type Platform } from './marks'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/**
 * A Ferrocast alert in the default "Molten" theme: a glossy liquid-metal card that rises out
 * of its own puddle (scale-y from the bottom edge plus a clip reveal), the drop on the left
 * throws its spikes up, then everything drains back down on exit.
 *
 * `t` is the frame relative to the alert's start; `hold` is how long it stays (frames).
 */
export const AlertCard: React.FC<{
  t: number
  hold: number
  title: string
  body: string
  platform: Platform
  platformLabel: string
  id: string
  scale?: number
}> = ({ t, hold, title, body, platform, platformLabel, id, scale = 1 }) => {
  const { fps } = useVideoConfig()
  if (t < 0 || t > hold + 18) return null
  const rise = spring({ frame: t, fps, config: { damping: 15, stiffness: 120, mass: 0.9 } })
  const drain = interpolate(t, [hold, hold + 16], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.55, 0, 0.75, 0.2),
  })
  const spikes = spring({ frame: t - 6, fps, config: { damping: 9, stiffness: 140, mass: 0.7 } })
  const textIn = (delay: number) =>
    interpolate(t, [delay, delay + 14], [0, 1], { ...clamp, easing: Easing.bezier(...EASE_OUT) })
  const reveal = Math.min(rise, 1) * (1 - drain)

  return (
    <div
      style={{
        position: 'relative',
        width: (title.length > 24 ? 1140 : 880) * scale,
        scale: String(interpolate(drain, [0, 1], [1, 0.96])),
        translate: `0px ${interpolate(rise, [0, 1], [70, 0]) * scale + drain * 40 * scale}px`,
        opacity: interpolate(drain, [0, 0.8, 1], [1, 1, 0]),
        transformOrigin: '50% 100%',
      }}
    >
      {/* cobalt pool the card rises from */}
      <div
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          bottom: -26 * scale,
          height: 60 * scale,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, rgba(52,97,245,${0.55 * reveal}), rgba(52,97,245,0))`,
          scale: `${interpolate(rise, [0, 1], [0.3, 1])} 1`,
        }}
      />
      <div
        style={{
          position: 'relative',
          clipPath: `inset(${(1 - reveal) * 100}% 0 0 0 round ${28 * scale}px)`,
          scale: `1 ${interpolate(rise, [0, 1], [0.55, 1])}`,
          transformOrigin: '50% 100%',
          padding: 2 * scale,
          borderRadius: 28 * scale,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.06) 38%, rgba(142,170,255,0.22) 100%)',
          boxShadow: `0 ${30 * scale}px ${80 * scale}px -${30 * scale}px rgba(0,0,0,0.9), 0 ${10 * scale}px ${40 * scale}px -${20 * scale}px rgba(52,97,245,0.6)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 34 * scale,
            padding: `${34 * scale}px ${44 * scale}px ${34 * scale}px ${34 * scale}px`,
            borderRadius: 26 * scale,
            background:
              'radial-gradient(120% 140% at 50% 120%, rgba(52,97,245,0.28), rgba(52,97,245,0) 55%), linear-gradient(180deg, #1a1e25 0%, #0d0f13 55%, #08090b 100%)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* chrome sheen along the top edge */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '45%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0))',
            }}
          />
          <div
            style={{
              width: 132 * scale,
              height: 132 * scale,
              borderRadius: 24 * scale,
              background:
                'radial-gradient(80% 80% at 50% 85%, rgba(52,97,245,0.35), rgba(10,11,13,0) 70%), #0a0b0d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: `1px solid ${C.line}`,
            }}
          >
            <SpikeMark
              id={id}
              size={112 * scale}
              energy={spikes * (1 - drain)}
              magnet={Math.min(spikes, 1)}
            />
          </div>
          <div style={{ minWidth: 0, flex: 1, position: 'relative' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10 * scale,
                height: 38 * scale,
                padding: `0 ${16 * scale}px`,
                borderRadius: 999,
                border: `1px solid ${C.lineStrong}`,
                background: 'rgba(255,255,255,0.04)',
                fontFamily: FONT.sans,
                fontWeight: 600,
                fontSize: 21 * scale,
                color: C.text2,
                opacity: textIn(8),
                translate: `0px ${(1 - textIn(8)) * 10}px`,
              }}
            >
              <PlatformGlyph platform={platform} size={20 * scale} />
              {platformLabel}
            </div>
            <div
              style={{
                marginTop: 14 * scale,
                fontFamily: FONT.display,
                fontWeight: 760,
                fontSize: (title.length > 24 ? 54 : 62) * scale,
                lineHeight: 1.04,
                letterSpacing: '-0.03em',
                color: C.text,
                opacity: textIn(11),
                translate: `0px ${(1 - textIn(11)) * 16}px`,
              }}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 10 * scale,
                fontFamily: FONT.sans,
                fontWeight: 500,
                fontSize: 32 * scale,
                lineHeight: 1.3,
                color: C.text2,
                opacity: textIn(15),
                translate: `0px ${(1 - textIn(15)) * 12}px`,
              }}
            >
              {body}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
