import type React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { AlertCard } from '../components/AlertCard'
import { C } from '../theme'

/**
 * An abstract "something is happening on stream" backdrop: layered dusk ridges drifting
 * slowly, a low sun, a soft vignette. Periodic over the composition so the loop is seamless.
 */
const Backdrop: React.FC<{ p: number }> = ({ p }) => {
  const { width, height } = useVideoConfig()
  const tau = Math.PI * 2
  const ridge = (amp: number, base: number, freq: number, phase: number, shift: number) => {
    const pts: string[] = []
    const steps = 48
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * (width + 200) - 100
      const u = (x / width) * freq * tau + phase + shift
      const y =
        base + amp * (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1.1) * 0.25 + Math.sin(u * 5.1) * 0.08)
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return `M-100,${height} L${pts.join(' L')} L${width + 100},${height} Z`
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(60% 50% at 70% 38%, rgba(98,128,220,0.32), rgba(10,11,13,0) 70%), linear-gradient(180deg, #121827 0%, #0d1220 45%, #090b10 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: width * 0.68 - 90,
          top: height * 0.3 - 90 + 6 * Math.sin(tau * p),
          width: 180,
          height: 180,
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, rgba(220,228,255,0.55), rgba(142,170,255,0.18) 60%, rgba(142,170,255,0))',
        }}
      />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path d={ridge(70, height * 0.58, 1.2, 0.4, tau * p)} fill="#151b2a" />
        <path d={ridge(60, height * 0.68, 1.6, 2.1, tau * p * 2)} fill="#10141f" />
        <path d={ridge(50, height * 0.8, 2.1, 4.2, tau * p * 3)} fill="#0b0e15" />
      </svg>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </AbsoluteFill>
  )
}

export const AlertFires: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames, width } = useVideoConfig()
  const p = frame / durationInFrames
  const scale = width / 1920
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Backdrop p={p} />
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 150 * scale }}
      >
        <AlertCard
          id="tip"
          t={frame - Math.round(0.6 * fps)}
          hold={Math.round(2.9 * fps)}
          platform="tips"
          platformLabel="Tip"
          title="Asha tipped ₹500!"
          body="Keep it up!"
          scale={scale}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 150 * scale }}
      >
        <AlertCard
          id="sub"
          t={frame - Math.round(4.3 * fps)}
          hold={Math.round(2.7 * fps)}
          platform="twitch"
          platformLabel="Twitch"
          title="PixelPanda subscribed for 6 months!"
          body="Six months already, love the streams"
          scale={scale}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
