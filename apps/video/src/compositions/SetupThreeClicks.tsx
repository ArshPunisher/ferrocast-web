import type React from 'react'
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Check, Cursor, PlatformGlyph } from '../components/marks'
import { C, EASE_OUT, FONT } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = Easing.bezier(...EASE_OUT)

const STEPS = ['Connect', 'Pick a look', 'Add to OBS'] as const

/** Opacity and lift for a beat that lives between `from` and `to` (frames). */
function beat(frame: number, from: number, to: number, last = false) {
  const inn = interpolate(frame, [from, from + 12], [0, 1], { ...clamp, easing: ease })
  const out = last
    ? 0
    : interpolate(frame, [to - 8, to], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) })
  return {
    opacity: inn * (1 - out),
    y: (1 - inn) * 30 - out * 20,
    visible: frame >= from - 1 && (last || frame <= to),
  }
}

const ThemeTile: React.FC<{ id: string; label: string; size: number }> = ({ id, label, size }) => {
  const base: React.CSSProperties = {
    width: size,
    height: size * 0.62,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    background: 'linear-gradient(180deg, #1b2235, #0c0f17)',
  }
  const text = 'NovaRiver followed!'
  const fs = size * 0.085
  let inner: React.ReactNode
  switch (id) {
    case 'molten':
      inner = (
        <div
          style={{
            padding: `${fs * 0.7}px ${fs}px`,
            borderRadius: 12,
            background: 'linear-gradient(180deg, #1a1e25, #08090b)',
            border: '1px solid rgba(255,255,255,0.22)',
            boxShadow: '0 8px 20px -8px rgba(255,164,36,0.75)',
            color: C.text,
            fontFamily: FONT.display,
            fontWeight: 760,
            fontSize: fs,
            letterSpacing: '-0.02em',
          }}
        >
          {text}
        </div>
      )
      break
    case 'daylight':
      inner = (
        <div
          style={{
            padding: `${fs * 0.7}px ${fs}px`,
            borderRadius: 12,
            background: '#ffffff',
            color: '#0e1014',
            fontFamily: FONT.sans,
            fontWeight: 750,
            fontSize: fs,
            boxShadow: '0 8px 20px -10px rgba(0,0,0,0.6)',
          }}
        >
          {text}
        </div>
      )
      break
    case 'arcade':
      inner = (
        <div
          style={{
            padding: `${fs * 0.6}px ${fs * 0.8}px`,
            background: '#0a0b0d',
            border: '3px solid #eef0f4',
            boxShadow: `6px 6px 0 ${C.arc}`,
            color: '#eef0f4',
            fontFamily: FONT.mono,
            fontWeight: 800,
            fontSize: fs * 0.82,
            textTransform: 'uppercase',
          }}
        >
          {text}
        </div>
      )
      break
    case 'minimal':
      inner = (
        <div
          style={{
            color: '#ffffff',
            fontFamily: FONT.sans,
            fontWeight: 700,
            fontSize: fs * 1.05,
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
          }}
        >
          {text}
        </div>
      )
      break
    default:
      inner = (
        <div
          style={{
            padding: `${fs * 0.5}px ${fs * 0.9}px`,
            background: '#ffffff',
            color: '#0a0b0d',
            borderRadius: 10,
            rotate: '-4deg',
            fontFamily: FONT.display,
            fontWeight: 800,
            fontSize: fs * 0.95,
            whiteSpace: 'nowrap',
            boxShadow: `0 0 0 4px ${C.molten}, 0 10px 18px -8px rgba(0,0,0,0.8)`,
          }}
        >
          {text}
        </div>
      )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={base}>{inner}</div>
      <div
        style={{
          fontFamily: FONT.sans,
          fontWeight: 650,
          fontSize: Math.max(22, size * 0.075),
          color: C.text2,
        }}
      >
        {label}
      </div>
    </div>
  )
}

export const SetupThreeClicks: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const s = (sec: number) => Math.round(sec * fps)
  const portrait = height > width
  const B1 = [0, s(3.3)] as const
  const B2 = [s(3.3), s(6.6)] as const
  const B3 = [s(6.6), s(10)] as const
  const step = frame < B2[0] ? 0 : frame < B3[0] ? 1 : 2

  // Beat 1: the device code
  const b1 = beat(frame, B1[0], B1[1])
  const codeChars = 'FRRO-4821'.split('')
  const connected = interpolate(frame, [s(1.9), s(2.2)], [0, 1], { ...clamp, easing: ease })

  // Beat 2: theme picker
  const b2 = beat(frame, B2[0], B2[1])
  const pickClick = s(5.1)
  const ring = spring({ frame: frame - pickClick, fps, config: { damping: 14, stiffness: 180 } })

  // Beat 3: Add to OBS
  const b3 = beat(frame, B3[0], B3[1], true)
  const obsClick = s(7.7)
  const obsPress = interpolate(frame, [obsClick - 3, obsClick, obsClick + 4], [0, 1, 0], clamp)
  const added = spring({
    frame: frame - (obsClick + 3),
    fps,
    config: { damping: 15, stiffness: 140 },
  })
  const caption = interpolate(frame, [s(8.6), s(9.1)], [0, 1], { ...clamp, easing: ease })

  const titleSize = portrait ? 104 : 120
  const stage: React.CSSProperties = portrait
    ? {
        position: 'absolute',
        left: 80,
        right: 80,
        top: 520,
        bottom: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }
    : {
        position: 'absolute',
        left: 860,
        right: 120,
        top: 120,
        bottom: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }

  const tileSize = portrait ? 290 : 280
  const tiles = [
    ['molten', 'Molten'],
    ['daylight', 'Daylight'],
    ['arcade', 'Arcade'],
    ['minimal', 'Minimal'],
    ['sticker', 'Sticker'],
  ] as const
  const cols = portrait ? 2 : 3
  const gap = 28
  const tilePos = (i: number) => ({
    x: (i % cols) * (tileSize + gap),
    y: Math.floor(i / cols) * (tileSize * 0.62 + 64),
  })
  const gridW = cols * tileSize + (cols - 1) * gap

  // Cursor path across beats 2 and 3
  const stageLeft = portrait ? 80 + (width - 160 - gridW) / 2 : 860 + (width - 980 - gridW) / 2
  const stageTop = portrait ? 520 : 120 + (height - 240 - 2 * (tileSize * 0.62 + 64)) / 2
  const moltenCenter = { x: stageLeft + tileSize * 0.5, y: stageTop + tileSize * 0.31 }
  const btnCenter = portrait
    ? { x: width / 2, y: 833 }
    : { x: 860 + (width - 980) / 2, y: height / 2 - 40 }
  const cursorP2 = interpolate(frame, [B2[0] + 6, pickClick - 4], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  })
  const cursorP3 = interpolate(frame, [B3[0] + 4, obsClick - 4], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  })
  const cursorX =
    frame < B3[0]
      ? interpolate(cursorP2, [0, 1], [width * 0.92, moltenCenter.x + 40])
      : interpolate(cursorP3, [0, 1], [moltenCenter.x + 40, btnCenter.x + 40])
  const cursorY =
    frame < B3[0]
      ? interpolate(cursorP2, [0, 1], [height * 0.95, moltenCenter.y + 10])
      : interpolate(cursorP3, [0, 1], [moltenCenter.y + 10, btnCenter.y + 6])
  const cursorOpacity = interpolate(
    frame,
    [B2[0], B2[0] + 8, obsClick + 18, obsClick + 30],
    [0, 1, 1, 0],
    clamp,
  )
  const press =
    interpolate(frame, [pickClick - 3, pickClick, pickClick + 4], [0, 1, 0], clamp) + obsPress

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: portrait
            ? 'radial-gradient(70% 45% at 50% 70%, rgba(51,212,255,0.1), rgba(10,11,13,0) 70%), radial-gradient(50% 30% at 50% 20%, rgba(255,164,36,0.06), rgba(10,11,13,0) 70%)'
            : 'radial-gradient(45% 60% at 72% 50%, rgba(51,212,255,0.1), rgba(10,11,13,0) 70%), radial-gradient(35% 45% at 18% 40%, rgba(255,164,36,0.06), rgba(10,11,13,0) 70%)',
        }}
      />

      {/* Steps and title */}
      <div
        style={{
          position: 'absolute',
          left: portrait ? 80 : 120,
          top: portrait ? 110 : 300,
          right: portrait ? 80 : undefined,
        }}
      >
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {STEPS.map((label, i) => {
            const on = i === step
            const done = i < step
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 52,
                  padding: '0 20px 0 12px',
                  borderRadius: 999,
                  border: `1px solid ${on ? C.accentLine : C.line}`,
                  background: on ? C.accentSoft : 'transparent',
                  fontFamily: FONT.sans,
                  fontWeight: 650,
                  fontSize: 24,
                  color: on ? C.text : done ? C.text2 : C.text3,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: on ? C.accent : done ? 'rgba(61,209,147,0.18)' : C.surface3,
                    color: on ? C.onAccent : '#fff',
                    fontSize: 17,
                    fontWeight: 750,
                  }}
                >
                  {done ? <Check size={22} progress={1} stroke={3.2} /> : i + 1}
                </div>
                {label}
              </div>
            )
          })}
        </div>
        <div style={{ position: 'relative', height: titleSize * 2.2, marginTop: 44 }}>
          {[
            ['Connect your channels.', b1],
            ['Pick a look.', b2],
            ['Add it to OBS.', b3],
          ].map(([t, b]) => {
            const bb = b as ReturnType<typeof beat>
            return bb.visible ? (
              <div
                key={t as string}
                style={{
                  position: 'absolute',
                  inset: 0,
                  fontFamily: FONT.display,
                  fontWeight: 760,
                  fontSize: titleSize,
                  lineHeight: 1.02,
                  letterSpacing: '-0.035em',
                  color: C.text,
                  maxWidth: portrait ? 900 : 700,
                  opacity: bb.opacity,
                  translate: `0px ${bb.y}px`,
                }}
              >
                {t as string}
              </div>
            ) : null
          })}
        </div>
      </div>

      {/* Beat 1: device code */}
      {b1.visible && (
        <div style={{ ...stage, opacity: b1.opacity, translate: `0px ${b1.y}px` }}>
          <div
            style={{
              width: portrait ? '100%' : 760,
              padding: 48,
              borderRadius: 32,
              border: `1px solid ${C.lineStrong}`,
              background: 'linear-gradient(180deg, #16191e, #101216)',
              boxShadow: '0 40px 100px -40px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <PlatformGlyph platform="twitch" size={48} />
              <div
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 720,
                  fontSize: 44,
                  color: C.text,
                  letterSpacing: '-0.02em',
                }}
              >
                Connect Twitch
              </div>
            </div>
            <div style={{ marginTop: 18, fontFamily: FONT.sans, fontSize: 28, color: C.text2 }}>
              Enter this code at twitch.tv/activate
            </div>
            <div
              style={{
                marginTop: 30,
                display: 'flex',
                gap: 8,
                fontFamily: FONT.mono,
                fontWeight: 700,
                fontSize: portrait ? 76 : 84,
                color: C.text,
              }}
            >
              {codeChars.map((ch, i) => {
                const a = interpolate(frame, [s(0.35) + i * 2, s(0.35) + i * 2 + 8], [0, 1], {
                  ...clamp,
                  easing: ease,
                })
                return (
                  <span
                    key={i}
                    style={{
                      opacity: a,
                      translate: `0px ${(1 - a) * 18}px`,
                      color: ch === '-' ? C.text3 : C.text,
                    }}
                  >
                    {ch}
                  </span>
                )
              })}
            </div>
            <div
              style={{
                marginTop: 34,
                height: 76,
                borderRadius: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '0 24px',
                fontFamily: FONT.sans,
                fontWeight: 650,
                fontSize: 28,
                background: connected > 0 ? `rgba(61,209,147,${0.14 * connected})` : C.surface3,
                border: `1px solid ${connected > 0.5 ? 'rgba(61,209,147,0.45)' : C.line}`,
                color: connected > 0.5 ? C.text : C.text3,
              }}
            >
              {connected > 0 ? (
                <Check size={36} progress={connected} />
              ) : (
                <span style={{ width: 36 }} />
              )}
              {connected > 0.5 ? 'Connected as NovaPlays' : 'Waiting for you to sign in'}
            </div>
          </div>
        </div>
      )}

      {/* Beat 2: themes */}
      {b2.visible && (
        <div
          style={{
            position: 'absolute',
            left: stageLeft,
            top: stageTop,
            width: gridW,
            opacity: b2.opacity,
            translate: `0px ${b2.y}px`,
          }}
        >
          {tiles.map(([id, label], i) => {
            const pos = tilePos(i)
            const a = interpolate(frame, [B2[0] + 4 + i * 2, B2[0] + 16 + i * 2], [0, 1], {
              ...clamp,
              easing: ease,
            })
            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  opacity: a,
                  translate: `0px ${(1 - a) * 20}px`,
                }}
              >
                <ThemeTile id={id} label={label} size={tileSize} />
                {id === 'molten' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: -8,
                      top: -8,
                      width: tileSize + 16,
                      height: tileSize * 0.62 + 16,
                      borderRadius: 22,
                      border: `4px solid ${C.accentText}`,
                      opacity: Math.min(ring, 1),
                      scale: String(interpolate(ring, [0, 1], [1.08, 1])),
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Beat 3: Add to OBS */}
      {b3.visible && (
        <div
          style={{
            ...stage,
            opacity: b3.opacity,
            translate: `0px ${b3.y}px`,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 40,
          }}
        >
          <div
            style={{
              height: 132,
              minWidth: 560,
              padding: '0 52px',
              borderRadius: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 22,
              fontFamily: FONT.sans,
              fontWeight: 750,
              fontSize: 46,
              color: added > 0.5 ? '#ffffff' : C.onAccent,
              background: added > 0.5 ? '#123a2a' : C.accent,
              border:
                added > 0.5 ? '1px solid rgba(61,209,147,0.5)' : '1px solid rgba(255,255,255,0.28)',
              boxShadow:
                added > 0.5
                  ? '0 30px 80px -30px rgba(0,0,0,0.9)'
                  : `inset 0 1px 0 rgba(255,255,255,0.28), 0 24px 60px -18px rgba(255,164,36,0.6)`,
              scale: String(1 - obsPress * 0.04),
              whiteSpace: 'nowrap',
            }}
          >
            {added > 0.5 ? (
              <>
                <Check
                  size={56}
                  progress={interpolate(added, [0.5, 1], [0, 1], clamp)}
                  stroke={3}
                />
                Added to scene Gameplay
              </>
            ) : (
              <>
                <PlatformGlyph platform="obs" size={52} color={C.onAccent} />
                Add to OBS
              </>
            )}
          </div>
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: portrait ? 34 : 36,
              fontWeight: 500,
              color: C.text2,
              opacity: caption,
              translate: `0px ${(1 - caption) * 16}px`,
              textAlign: 'center',
            }}
          >
            Three clicks to your first alert.
          </div>
        </div>
      )}

      {cursorOpacity > 0 && (
        <div style={{ opacity: cursorOpacity }}>
          <Cursor x={cursorX} y={cursorY} pressed={Math.min(press, 1)} scale={1.3} />
        </div>
      )}
    </AbsoluteFill>
  )
}
