import type React from 'react'
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Check, Cursor, PlatformGlyph, type Platform } from '../components/marks'
import { C, EASE_OUT, FONT } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = Easing.bezier(...EASE_OUT)

type Line = {
  platform: Platform
  name: string
  color: string
  text: string
  at: number
  spam?: boolean
}

// Handles from packages/api/src/demo/seed.ts. `at` is the second the line arrives.
const LINES: Line[] = [
  {
    platform: 'twitch',
    name: 'kuro_neko',
    color: '#7fb4ff',
    text: 'that clutch was insane',
    at: 0.1,
  },
  {
    platform: 'youtube',
    name: 'Nakamura Ren',
    color: '#c9cfda',
    text: 'boa noite do Brasil!',
    at: 0.35,
  },
  { platform: 'kick', name: 'VoltViper', color: '#f6e05e', text: 'one more game, please', at: 0.6 },
  {
    platform: 'twitch',
    name: 'mira_exe',
    color: '#9be15d',
    text: 'yo chat, be nice to the new folks',
    at: 0.85,
  },
  {
    platform: 'twitch',
    name: 'cheap_viewers_dot_com',
    color: '#ff8a8a',
    text: 'Want 1,000 followers? Visit our site, cheap and fast',
    at: 1.6,
    spam: true,
  },
  {
    platform: 'youtube',
    name: 'cheap_viewers_dot_com',
    color: '#ff8a8a',
    text: 'Want 1,000 followers? Visit our site, cheap and fast',
    at: 1.85,
    spam: true,
  },
  {
    platform: 'kick',
    name: 'cheap_viewers_dot_com',
    color: '#ff8a8a',
    text: 'Want 1,000 followers? Visit our site, cheap and fast',
    at: 2.1,
    spam: true,
  },
  { platform: 'youtube', name: 'Priya Iyer', color: '#c9cfda', text: 'gg', at: 2.4 },
]

const LINE_H = 70

export const BanEverywhere: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = (sec: number) => Math.round(sec * fps)

  const CLICK = s(4.6)
  const pressed = interpolate(frame, [CLICK - 3, CLICK, CLICK + 4], [0, 1, 0], clamp)
  // Each spam line squeezes out with a small stagger after the click.
  const squeeze = (i: number) =>
    interpolate(frame, [CLICK + 4 + i * 3, CLICK + 20 + i * 3], [0, 1], {
      ...clamp,
      easing: Easing.bezier(0.65, 0, 0.35, 1),
    })
  const cardIn = spring({ frame: frame - s(3.0), fps, config: { damping: 16, stiffness: 160 } })
  const cardOut = interpolate(frame, [CLICK + 2, CLICK + 12], [0, 1], { ...clamp, easing: ease })
  const chipIn = spring({
    frame: frame - (CLICK + 22),
    fps,
    config: { damping: 13, stiffness: 150 },
  })
  const cursorMove = interpolate(frame, [s(3.4), CLICK - 4], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  })

  // Panel geometry
  const panelX = 980
  const panelY = 100
  const panelW = 820

  let y = 0
  let spamIndex = 0
  const rendered = LINES.map((l, idx) => {
    const appear = interpolate(frame, [s(l.at), s(l.at) + 10], [0, 1], { ...clamp, easing: ease })
    if (appear <= 0) return null
    const q = l.spam ? squeeze(spamIndex++) : 0
    const h = LINE_H * appear * (1 - q)
    const top = y
    y += h
    return (
      <div
        key={idx}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top,
          height: LINE_H,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 30px',
          opacity: appear * (1 - q * 0.9),
          // The squeeze: pinch sideways, then collapse into the line like a drop.
          scale: `${1 - q * 0.18} ${1 - q}`,
          transformOrigin: '50% 50%',
          translate: `0px ${(1 - appear) * 14}px`,
          background: l.spam ? `rgba(255, 93, 108, ${0.08 * (1 - q)})` : 'transparent',
          borderLeft: l.spam
            ? `3px solid rgba(255, 93, 108, ${0.7 * (1 - q)})`
            : '3px solid transparent',
        }}
      >
        <PlatformGlyph platform={l.platform} size={26} />
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 27,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: l.color, fontWeight: 700 }}>{l.name}</span>
          <span style={{ color: C.text2, fontWeight: 500 }}>
            {'  '}
            {l.text}
          </span>
        </div>
      </div>
    )
  })

  // Viewer card anchored under the last spam line
  const cardTop = panelY + 92 + 12 + LINE_H * LINES.length + 30
  const btn = { x: panelX + 60 + 330, y: cardTop + 116, w: 340, h: 70 }
  const cursorX = interpolate(cursorMove, [0, 1], [1480, btn.x + btn.w * 0.55])
  const cursorY = interpolate(cursorMove, [0, 1], [1080, btn.y + btn.h * 0.45])
  const cursorFade = interpolate(
    frame,
    [s(3.3), s(3.5), CLICK + 14, CLICK + 24],
    [0, 1, 1, 0],
    clamp,
  )

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(50% 60% at 72% 45%, rgba(51,212,255,0.1), rgba(10,11,13,0) 70%), radial-gradient(40% 50% at 20% 60%, rgba(255,164,36,0.06), rgba(10,11,13,0) 70%)',
        }}
      />
      {/* Headline */}
      <div style={{ position: 'absolute', left: 140, top: 330, width: 720 }}>
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: 760,
            fontSize: 112,
            lineHeight: 1.0,
            letterSpacing: '-0.035em',
            color: C.text,
            opacity: interpolate(frame, [0, 14], [0, 1], clamp),
            translate: `0px ${interpolate(frame, [0, 18], [24, 0], { ...clamp, easing: ease })}px`,
          }}
        >
          One ban.
          <br />
          <span style={{ color: C.accentText }}>Every platform.</span>
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: FONT.sans,
            fontSize: 32,
            lineHeight: 1.4,
            color: C.text2,
            maxWidth: 600,
            opacity: interpolate(frame, [8, 24], [0, 1], clamp),
          }}
        >
          Spam on Twitch, YouTube and Kick, gone from all three with one click.
        </div>
      </div>

      {/* Merged chat panel */}
      <div
        style={{
          position: 'absolute',
          left: panelX,
          top: panelY,
          width: panelW,
          height: 92 + 12 + LINE_H * LINES.length + 14,
          borderRadius: 28,
          border: `1px solid ${C.line}`,
          background: 'linear-gradient(180deg, #13161b, #0e1014)',
          boxShadow: '0 40px 100px -40px rgba(0,0,0,0.9)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 92,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '0 30px',
            borderBottom: `1px solid ${C.line}`,
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 32,
            color: C.text,
            letterSpacing: '-0.02em',
          }}
        >
          Chat
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            {(['twitch', 'youtube', 'kick'] as const).map((p) => (
              <div
                key={p}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: `1px solid ${C.lineStrong}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlatformGlyph platform={p} size={22} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', marginTop: 12 }}>{rendered}</div>
      </div>

      {/* Viewer card with the ban button */}
      <div
        style={{
          position: 'absolute',
          left: panelX + 40,
          top: cardTop,
          width: panelW - 80,
          padding: 30,
          borderRadius: 24,
          border: `1px solid ${C.lineStrong}`,
          background: '#16191e',
          boxShadow: '0 30px 80px -30px rgba(0,0,0,0.95)',
          opacity: Math.min(cardIn, 1) * (1 - cardOut),
          scale: String(interpolate(cardIn, [0, 1], [0.94, 1]) - cardOut * 0.04),
          translate: `0px ${(1 - Math.min(cardIn, 1)) * 18}px`,
          transformOrigin: '50% 0%',
          display: cardIn <= 0.001 ? 'none' : 'block',
        }}
      >
        <div style={{ fontFamily: FONT.sans, fontWeight: 700, fontSize: 28, color: C.text }}>
          cheap_viewers_dot_com
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 22, color: C.text3, marginTop: 6 }}>
          Same account name on Twitch, YouTube and Kick
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
          <div
            style={{
              height: 70,
              width: 300,
              borderRadius: 14,
              border: `1px solid ${C.lineStrong}`,
              background: C.surface3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.sans,
              fontWeight: 650,
              fontSize: 26,
              color: C.text,
            }}
          >
            Timeout 10 min
          </div>
          <div
            style={{
              height: 70,
              width: 340,
              borderRadius: 14,
              background: C.dangerFill,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.sans,
              fontWeight: 700,
              fontSize: 26,
              color: '#fff',
              scale: String(1 - pressed * 0.04),
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 ${pressed * 6}px rgba(255,93,108,0.25)`,
            }}
          >
            Ban everywhere
          </div>
        </div>
      </div>

      {/* Confirmation chip */}
      <div
        style={{
          position: 'absolute',
          left: panelX + panelW / 2,
          top: panelY + 92 + 12 + LINE_H * 5 + 40,
          translate: `-50% ${(1 - Math.min(chipIn, 1)) * 24}px`,
          opacity: Math.min(chipIn * 1.4, 1),
          scale: String(interpolate(chipIn, [0, 1], [0.9, 1])),
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          height: 76,
          padding: '0 30px 0 22px',
          borderRadius: 999,
          background: '#122a1f',
          border: '1px solid rgba(61,209,147,0.45)',
          fontFamily: FONT.sans,
          fontWeight: 650,
          fontSize: 28,
          color: C.text,
          whiteSpace: 'nowrap',
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.9)',
        }}
      >
        <Check size={34} progress={interpolate(frame, [CLICK + 26, CLICK + 40], [0, 1], clamp)} />
        Banned on Twitch, YouTube and Kick
      </div>

      {cursorFade > 0 && (
        <div style={{ opacity: cursorFade }}>
          <Cursor x={cursorX} y={cursorY} pressed={pressed} scale={1.15} />
        </div>
      )}
    </AbsoluteFill>
  )
}
