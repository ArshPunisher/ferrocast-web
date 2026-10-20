// The built-in alert sounds, made with Web Audio (no files to ship or fetch). OBS captures a
// browser source's audio, so these play on stream like any uploaded sound.

import type { BuiltinSound } from '@ferrocast/api/types'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    const C =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = ctx ?? new C()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

/**
 * Makes (or wakes) the shared audio context. Call it from a click: WebKit (the Mac app's
 * window) only lets a context start inside the user's gesture, and a preview that plays a
 * moment later would otherwise stay silent.
 */
export function unlockAudio(): void {
  audio()
}

/** Plays a built-in sound at `volume` (0–100). Returns its length in ms (0 when silent). */
export function playBuiltin(name: BuiltinSound, volume: number): number {
  if (name === 'none') return 0
  const a = audio()
  if (!a) return 0
  try {
    const t = a.currentTime
    const out = a.createGain()
    out.gain.value = (Math.max(0, Math.min(100, volume)) / 100) * 0.35
    out.connect(a.destination)
    const tone = (
      f: number,
      at: number,
      dur: number,
      type: OscillatorType = 'sine',
      f2?: number,
    ) => {
      const o = a.createOscillator()
      const e = a.createGain()
      o.type = type
      o.frequency.setValueAtTime(f, t + at)
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + dur)
      e.gain.setValueAtTime(0.0001, t + at)
      e.gain.exponentialRampToValueAtTime(1, t + at + 0.015)
      e.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
      o.connect(e).connect(out)
      o.start(t + at)
      o.stop(t + at + dur + 0.05)
    }
    switch (name) {
      case 'chime':
        tone(880, 0, 0.5)
        tone(1318.5, 0.12, 0.7)
        return 820
      case 'coin':
        tone(988, 0, 0.09, 'square')
        tone(1319, 0.08, 0.35, 'square')
        return 450
      case 'boing':
        tone(180, 0, 0.5, 'triangle', 620)
        return 520
      case 'bass':
        tone(110, 0, 0.6, 'sine', 40)
        tone(220, 0, 0.15, 'square', 80)
        return 650
      case 'sparkle':
        ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.4))
        return 700
      case 'whoosh': {
        const len = 0.6
        const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++)
          d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length)
        const src = a.createBufferSource()
        const bp = a.createBiquadFilter()
        src.buffer = buf
        bp.type = 'bandpass'
        bp.frequency.setValueAtTime(400, t)
        bp.frequency.exponentialRampToValueAtTime(3200, t + len)
        src.connect(bp).connect(out)
        src.start(t)
        return 600
      }
    }
  } catch {
    return 0
  }
  return 0
}
