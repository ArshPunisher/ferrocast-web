import { useLayoutEffect, useRef, useState } from 'react'
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { FerroVideo } from '../components/ferro-gl'
import { C } from '../theme'

/**
 * The ferrofluid puddle under a magnet that circles out of frame. Everything is a pure
 * function of the frame and periodic over the composition, so frame 0 follows the last
 * frame without a seam: the magnet orbit, its strength, the spike "breathing", the
 * shader's wobble clock and the slow camera drift all complete whole cycles.
 */
const SS = 1.5

export const HeroLoop: React.FC = () => {
  const frame = useCurrentFrame()
  const { durationInFrames, width, height } = useVideoConfig()
  const canvas = useRef<HTMLCanvasElement>(null)
  const ff = useRef<FerroVideo | null>(null)
  const [handle] = useState(() => delayRender('WebGL ferrofluid'))
  const [error, setError] = useState<string | null>(null)

  const p = frame / durationInFrames // 0..1, one loop
  const tau = Math.PI * 2

  useLayoutEffect(() => {
    const c = canvas.current
    if (!c) return
    if (!ff.current) {
      try {
        ff.current = new FerroVideo(c, C.bg, C.accent)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        continueRender(handle)
        return
      }
    }
    const f = ff.current
    // Supersample 1.5x: the spike tips alias badly at 1x and the shader has no AA.
    const w = Math.round(width * SS)
    const h = Math.round(height * SS)
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    // The shader wobbles with sin(time * 1.7): two whole wobble periods per loop.
    const wobbleTime = p * ((4 * tau) / 1.7)
    f.spike = 1 + 0.12 * Math.sin(tau * p * 2)
    f.render(wobbleTime, {
      x: 0.5 * Math.cos(tau * p),
      z: -0.08 + 0.32 * Math.sin(tau * p),
      strength: 0.9 + 0.1 * Math.sin(tau * p * 2 + 1),
    })
    continueRender(handle)
  }, [frame, width, height, p, tau, handle])

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <canvas
        ref={canvas}
        style={{
          width: '100%',
          height: '100%',
          scale: String(1.04 + 0.015 * Math.sin(tau * p)),
          translate: `${10 * Math.sin(tau * p)}px ${6 * Math.cos(tau * p)}px`,
        }}
      />
      {error && (
        <AbsoluteFill style={{ color: C.danger, fontSize: 32, padding: 40 }}>
          WebGL failed: {error}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
