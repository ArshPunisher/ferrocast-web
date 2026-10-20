// Impact hits for the motion designer (1.1): tiny Web Audio sounds, made on the spot, that
// land with each entrance and exit. Off unless the look switches on `impact_sounds`; they play
// at the look's own sound volume, and only where the alert's sound may play (the overlay's
// audio, the designer's sound toggle). OBS captures a browser source's audio like any sound.

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function context(): AudioContext | null {
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

/** Wakes the impact context; call it inside a click (WebKit only starts audio there). */
export function unlockImpactAudio(): void {
  context()
}

interface Out {
  a: AudioContext
  bus: GainNode
}

function noiseBuf(a: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === a.sampleRate) return noise
  noise = a.createBuffer(1, a.sampleRate, a.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}

function env(g: GainNode, t: number, at: number, peak: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + at)
  g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
}

function tone(
  o: Out,
  type: OscillatorType,
  f0: number,
  f1: number,
  t: number,
  dur: number,
  peak: number,
  at = 0.003,
  vib?: [number, number],
): void {
  const osc = o.a.createOscillator()
  const g = o.a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t)
  if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
  if (vib) {
    const l = o.a.createOscillator()
    const lg = o.a.createGain()
    l.frequency.value = vib[0]
    lg.gain.value = vib[1]
    l.connect(lg).connect(osc.frequency)
    l.start(t)
    l.stop(t + dur + 0.1)
  }
  env(g, t, at, peak, dur)
  osc.connect(g).connect(o.bus)
  osc.start(t)
  osc.stop(t + at + dur + 0.05)
}

function hiss(
  o: Out,
  t: number,
  dur: number,
  peak: number,
  type: BiquadFilterType,
  f0: number,
  f1?: number,
  q = 1,
  at = 0.003,
): void {
  const s = o.a.createBufferSource()
  s.buffer = noiseBuf(o.a)
  s.loop = true
  const f = o.a.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(f0, t)
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
  f.Q.value = q
  const g = o.a.createGain()
  env(g, t, at, peak, dur)
  s.connect(f).connect(g).connect(o.bus)
  s.start(t, Math.random() * 0.5)
  s.stop(t + at + dur + 0.05)
}

const R = Math.random
type Hit = (o: Out, t: number, k: number) => void

export const IMPACT_SOUNDS = {
  thud: (o, t, k) => {
    tone(o, 'sine', 170, 36, t, 0.36, 0.9 * k)
    tone(o, 'triangle', 95, 48, t, 0.2, 0.35 * k)
    hiss(o, t, 0.16, 0.55 * k, 'lowpass', 1600, 180)
  },
  boing: (o, t, k) => {
    tone(o, 'sine', 160, 420, t, 0.07, 0.4 * k)
    tone(o, 'sine', 420, 230, t + 0.06, 0.38, 0.35 * k, 0.005, [24, 30])
    hiss(o, t, 0.08, 0.25 * k, 'lowpass', 900, 200)
  },
  zap: (o, t, k) => {
    hiss(o, t, 0.1, 0.7 * k, 'highpass', 2500, 900)
    tone(o, 'sawtooth', 1900, 60, t, 0.24, 0.16 * k)
    tone(o, 'sine', 140, 40, t + 0.01, 0.3, 0.7 * k)
  },
  glitch: (o, t, k) => {
    for (let i = 0; i < 8; i++)
      tone(o, 'square', 160 + R() * 2400, 0, t + i * 0.045 + R() * 0.01, 0.025, 0.09 * k)
  },
  portal: (o, t, k) => {
    hiss(o, t, 0.5, 0.45 * k, 'bandpass', 280, 3400, 3, 0.25)
    tone(o, 'sine', 220, 900, t, 0.5, 0.12 * k, 0.2)
  },
  pop: (o, t, k) => {
    tone(o, 'sine', 300, 1000, t, 0.08, 0.55 * k)
    hiss(o, t, 0.04, 0.25 * k, 'highpass', 4000)
  },
  glass: (o, t, k) => {
    hiss(o, t, 0.14, 0.4 * k, 'highpass', 5000)
    for (let i = 0; i < 10; i++)
      tone(o, 'sine', 2200 + R() * 4200, 0, t + R() * 0.14, 0.18 + R() * 0.2, 0.06 * k)
  },
  glassIn: (o, t, k) => {
    for (let i = 0; i < 7; i++) tone(o, 'sine', 2600 + i * 420, 0, t + i * 0.025, 0.12, 0.06 * k)
    tone(o, 'sine', 140, 50, t + 0.18, 0.2, 0.4 * k)
  },
  chime: (o, t, k) => {
    tone(o, 'sine', 1318, 0, t, 0.9, 0.18 * k)
    tone(o, 'sine', 1976, 0, t + 0.07, 0.8, 0.12 * k)
    tone(o, 'triangle', 2637, 0, t + 0.12, 0.5, 0.05 * k)
  },
  whoosh: (o, t, k) => hiss(o, t, 0.32, 0.5 * k, 'bandpass', 450, 2600, 1.5, 0.1),
  whooshOut: (o, t, k) => hiss(o, t, 0.3, 0.5 * k, 'bandpass', 2600, 380, 1.5, 0.05),
  skid: (o, t, k) => {
    hiss(o, t, 0.24, 0.28 * k, 'bandpass', 2000, 900, 6)
    tone(o, 'sine', 120, 50, t, 0.16, 0.4 * k)
  },
  buzz: (o, t, k) => {
    ;[0, 0.09, 0.23, 0.36, 0.46].forEach((d, i) =>
      tone(o, 'sawtooth', 118, 0, t + d, i === 4 ? 0.5 : 0.05, 0.05 * k),
    )
    tone(o, 'sine', 1200, 0, t + 0.46, 0.25, 0.07 * k)
  },
  sizzle: (o, t, k) => {
    hiss(o, t, 0.7, 0.22 * k, 'highpass', 2500, 5000, 0.7, 0.06)
    tone(o, 'sine', 95, 55, t, 0.45, 0.45 * k)
  },
  dissolve: (o, t, k) => hiss(o, t, 0.8, 0.28 * k, 'bandpass', 4200, 900, 0.8, 0.25),
  suck: (o, t, k) => {
    tone(o, 'sine', 900, 70, t, 0.42, 0.28 * k, 0.05)
    hiss(o, t, 0.42, 0.3 * k, 'lowpass', 3500, 200, 1, 0.1)
  },
  blip: (o, t, k) => tone(o, 'sine', 1400, 2200, t, 0.06, 0.18 * k),
  flap: (o, t, k) => {
    hiss(o, t, 0.1, 0.45 * k, 'bandpass', 1000, 380, 2)
    hiss(o, t + 0.1, 0.12, 0.3 * k, 'bandpass', 800, 300, 2)
  },
  crt: (o, t, k) => {
    tone(o, 'square', 900, 80, t, 0.14, 0.07 * k)
    hiss(o, t, 0.06, 0.25 * k, 'highpass', 6000)
    tone(o, 'sine', 60, 40, t, 0.12, 0.3 * k)
  },
  fall: (o, t, k) => tone(o, 'sine', 1500, 260, t, 0.55, 0.1 * k, 0.02),
  click: (o, t, k) => {
    hiss(o, t, 0.018, 0.4 * k, 'highpass', 2800)
    tone(o, 'square', 1700, 0, t, 0.012, 0.03 * k)
  },
  tick: (o, t, k) => tone(o, 'sine', 2600 + R() * 400, 0, t, 0.025, 0.06 * k),
  coin: (o, t, k) => {
    tone(o, 'square', 988, 0, t, 0.07, 0.06 * k)
    tone(o, 'square', 1319, 0, t + 0.07, 0.32, 0.06 * k)
  },
  sparkle: (o, t, k) => {
    for (let i = 0; i < 5; i++)
      tone(o, 'sine', 2400 + R() * 2600, 0, t + i * 0.04 + R() * 0.02, 0.2, 0.04 * k)
  },
} satisfies Record<string, Hit>

export type ImpactSound = keyof typeof IMPACT_SOUNDS

/**
 * Plays one hit now. `k` is the alert's intensity (louder for bigger amounts, within
 * reason), `volume` the look's sound volume 0–100.
 */
export function playImpact(name: ImpactSound, k: number, volume: number): void {
  const hit = IMPACT_SOUNDS[name]
  if (!hit || !(volume > 0)) return
  const a = context()
  if (!a) return
  try {
    const bus = a.createGain()
    bus.gain.value = (Math.min(100, Math.max(0, volume)) / 100) * 0.5
    bus.connect(a.destination)
    hit({ a, bus }, a.currentTime + 0.005, Math.min(1.4, 0.7 + 0.3 * k))
    setTimeout(() => bus.disconnect(), 2500)
  } catch {
    /* a browser without Web Audio stays silent */
  }
}
