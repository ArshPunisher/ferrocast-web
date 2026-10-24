// The sound element's sounds (25 Oct board "Sound on any screen"): six stingers played once
// and four loops played behind a screen. Like recipes.js they are rendered offline by
// `render.mjs --screen` into MP3 files in src/design/sounds/screen/, so OBS plays a real file.
// Loops render a little long and the tail is folded into the start, so they repeat without a
// seam. Every random number comes from a seeded generator: a render sounds the same each time.
// Plain browser script (no imports): it sets `window.FC_SCREEN` and `window.FC_RENDER`.
/* eslint-disable */
;(() => {
  function rng(seed) {
    let a = seed >>> 0
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  let R = rng(1)

  const noise = (c, secs, color = 'white') => {
    const n = Math.ceil(c.sampleRate * secs)
    const b = c.createBuffer(2, n, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      let last = 0
      for (let i = 0; i < n; i++) {
        const w = R() * 2 - 1
        // brown noise for rumble, white for air
        last = color === 'brown' ? (last + 0.02 * w) / 1.02 : w
        d[i] = color === 'brown' ? last * 3.5 : w
      }
    }
    const s = c.createBufferSource()
    s.buffer = b
    return s
  }
  const room = (c, secs = 2.2, decay = 3) => {
    const n = Math.floor(c.sampleRate * secs)
    const b = c.createBuffer(2, n, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, decay)
    }
    const v = c.createConvolver()
    v.buffer = b
    return v
  }
  /** A bus with some room on it: `wet` 0 to 1. */
  const bus = (c, dest, wet = 0.3, secs = 2.2) => {
    const input = c.createGain()
    const dry = c.createGain()
    dry.gain.value = 1
    const w = c.createGain()
    w.gain.value = wet
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 3
    input.connect(dry).connect(comp)
    input.connect(room(c, secs)).connect(w).connect(comp)
    comp.connect(dest)
    return input
  }
  const env = (g, at, peak, a, d) => {
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + a)
    g.gain.exponentialRampToValueAtTime(0.0001, at + a + d)
  }
  const pan = (c, v) => {
    const p = c.createStereoPanner()
    p.pan.value = v
    return p
  }

  const S = {}
  const def = (id, meta, fn) => (S[id] = { id, ...meta, fn })

  // ---------------------------------------------------------------- stingers

  def('whoosh', { len: 1.4 }, (c, o, t) => {
    const n = noise(c, 1.5)
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.4
    f.frequency.setValueAtTime(260, t)
    f.frequency.exponentialRampToValueAtTime(3600, t + 0.55)
    f.frequency.exponentialRampToValueAtTime(500, t + 1.25)
    const g = c.createGain()
    env(g, t, 0.9, 0.5, 0.8)
    const p = c.createStereoPanner()
    p.pan.setValueAtTime(-0.7, t)
    p.pan.linearRampToValueAtTime(0.7, t + 1.2)
    n.connect(f).connect(g).connect(p).connect(o)
    n.start(t)
  })

  def('riser', { len: 2.6 }, (c, o, t) => {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 6
    lp.frequency.setValueAtTime(300, t)
    lp.frequency.exponentialRampToValueAtTime(7000, t + 2.3)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 2.2)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.45)
    lp.connect(g).connect(o)
    for (const det of [-9, 0, 9]) {
      const x = c.createOscillator()
      x.type = 'sawtooth'
      x.detune.value = det
      x.frequency.setValueAtTime(110, t)
      x.frequency.exponentialRampToValueAtTime(880, t + 2.3)
      x.connect(lp)
      x.start(t)
      x.stop(t + 2.5)
    }
    const n = noise(c, 2.5)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(1500, t)
    hp.frequency.exponentialRampToValueAtTime(9000, t + 2.3)
    const ng = c.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.18, t + 2.25)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.45)
    n.connect(hp).connect(ng).connect(o)
    n.start(t)
  })

  def('impact', { len: 2.2 }, (c, o, t) => {
    const x = c.createOscillator()
    x.frequency.setValueAtTime(120, t)
    x.frequency.exponentialRampToValueAtTime(32, t + 0.9)
    const g = c.createGain()
    env(g, t, 1, 0.004, 1.5)
    x.connect(g).connect(o)
    x.start(t)
    x.stop(t + 1.6)
    const n = noise(c, 0.5)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(5000, t)
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.35)
    const ng = c.createGain()
    env(ng, t, 0.7, 0.002, 0.4)
    n.connect(lp).connect(ng).connect(o)
    n.start(t)
  })

  def('tick', { len: 0.16, dry: true }, (c, o, t) => {
    const x = c.createOscillator()
    x.type = 'square'
    x.frequency.value = 1320
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2400
    const g = c.createGain()
    env(g, t, 0.5, 0.002, 0.07)
    x.connect(bp).connect(g).connect(o)
    x.start(t)
    x.stop(t + 0.12)
  })

  def('chime', { len: 2.4 }, (c, o, t) => {
    ;[880, 1108.73, 1318.51, 1760].forEach((f, i) => {
      const at = t + i * 0.11
      for (const [mult, gain] of [
        [1, 0.22],
        [2.76, 0.05],
        [5.4, 0.02],
      ]) {
        const x = c.createOscillator()
        x.frequency.value = f * mult
        const g = c.createGain()
        env(g, at, gain, 0.006, 1.8 / mult)
        x.connect(g)
          .connect(pan(c, -0.4 + i * 0.27))
          .connect(o)
        x.start(at)
        x.stop(at + 2)
      }
    })
  })

  def('glitch', { len: 0.8 }, (c, o, t) => {
    for (let i = 0; i < 12; i++) {
      const at = t + i * 0.048 + R() * 0.012
      const x = c.createOscillator()
      x.type = R() > 0.5 ? 'square' : 'sawtooth'
      x.frequency.value = 180 + R() * 2400
      const g = c.createGain()
      env(g, at, 0.14, 0.001, 0.035)
      x.connect(g)
        .connect(pan(c, R() * 1.6 - 0.8))
        .connect(o)
      x.start(at)
      x.stop(at + 0.05)
    }
    const n = noise(c, 0.6)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const ng = c.createGain()
    ng.gain.setValueAtTime(0, t)
    for (let i = 0; i < 10; i++) ng.gain.setValueAtTime(R() > 0.55 ? 0.12 : 0, t + i * 0.055)
    ng.gain.setValueAtTime(0, t + 0.6)
    n.connect(hp).connect(ng).connect(o)
    n.start(t)
  })

  // ---------------------------------------------------------------- loops (8 s each)

  const LOOP = 8
  const FOLD = 1.5

  def('rain', { len: LOOP, loop: true }, (c, o, t, secs) => {
    const n = noise(c, secs)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 800
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 9000
    const g = c.createGain()
    g.gain.value = 0.16
    n.connect(hp).connect(lp).connect(g).connect(o)
    n.start(t)
    // drops on the window
    for (let i = 0; i < secs * 14; i++) {
      const at = t + R() * secs
      const x = c.createOscillator()
      x.frequency.setValueAtTime(2500 + R() * 2500, at)
      x.frequency.exponentialRampToValueAtTime(900 + R() * 600, at + 0.03)
      const dg = c.createGain()
      env(dg, at, 0.02 + R() * 0.04, 0.001, 0.04)
      x.connect(dg)
        .connect(pan(c, R() * 1.8 - 0.9))
        .connect(o)
      x.start(at)
      x.stop(at + 0.06)
    }
  })

  def('wind', { len: LOOP, loop: true }, (c, o, t, secs) => {
    const n = noise(c, secs)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.8
    bp.frequency.setValueAtTime(400, t)
    for (let i = 1; i <= secs; i++) bp.frequency.linearRampToValueAtTime(250 + R() * 650, t + i)
    const g = c.createGain()
    g.gain.setValueAtTime(0.35, t)
    for (let i = 1; i <= secs; i++) g.gain.linearRampToValueAtTime(0.2 + R() * 0.35, t + i)
    const p = c.createStereoPanner()
    p.pan.setValueAtTime(0, t)
    for (let i = 1; i <= secs; i++) p.pan.linearRampToValueAtTime(R() * 1.2 - 0.6, t + i)
    n.connect(bp).connect(g).connect(p).connect(o)
    n.start(t)
  })

  def('pad', { len: LOOP, loop: true }, (c, o, t, secs) => {
    // A minor ninth chord, slowly opening and closing.
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 2
    lp.frequency.setValueAtTime(700, t)
    lp.frequency.linearRampToValueAtTime(1800, t + secs / 2)
    lp.frequency.linearRampToValueAtTime(700, t + secs)
    const g = c.createGain()
    g.gain.value = 0.05
    lp.connect(g).connect(o)
    ;[110, 220, 261.63, 329.63, 493.88].forEach((f, i) => {
      for (const det of [-8, 8]) {
        const x = c.createOscillator()
        x.type = 'sawtooth'
        x.frequency.value = f
        x.detune.value = det
        x.connect(pan(c, det > 0 ? 0.35 : -0.35)).connect(lp)
        x.start(t)
        x.stop(t + secs)
      }
    })
  })

  def('hum', { len: LOOP, loop: true }, (c, o, t, secs) => {
    const n = noise(c, secs, 'brown')
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    const g = c.createGain()
    g.gain.value = 0.5
    n.connect(lp).connect(g).connect(o)
    n.start(t)
    // far traffic passing
    for (let i = 0; i < 3; i++) {
      const at = t + 0.5 + i * (secs / 3)
      const m = noise(c, 3)
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 500 + R() * 400
      const mg = c.createGain()
      mg.gain.setValueAtTime(0.0001, at)
      mg.gain.exponentialRampToValueAtTime(0.08, at + 1.3)
      mg.gain.exponentialRampToValueAtTime(0.0001, at + 2.8)
      const p = c.createStereoPanner()
      p.pan.setValueAtTime(-0.8, at)
      p.pan.linearRampToValueAtTime(0.8, at + 2.8)
      m.connect(bp).connect(mg).connect(p).connect(o)
      m.start(at)
    }
  })

  const seed = (id) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11)
  window.FC_SCREEN = S
  /**
   * Renders one sound to stereo PCM. A loop is rendered FOLD seconds long and its tail is
   * mixed into its start with equal-power fades, so the file repeats without a seam.
   */
  window.FC_RENDER = async (id, sr = 48000) => {
    const s = S[id]
    R = rng(seed(id) ^ 0x50d)
    const secs = s.loop ? s.len + FOLD : s.len + 1
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr)
    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(ctx.destination)
    const dest = s.dry ? out : bus(ctx, out, s.loop ? 0.18 : 0.3)
    s.fn(ctx, dest, 0, secs)
    const buf = await ctx.startRendering()
    let left = Array.from(buf.getChannelData(0))
    let right = Array.from(buf.getChannelData(1))
    if (s.loop) {
      const n = Math.round(sr * s.len)
      const f = Math.round(sr * FOLD)
      const fold = (ch) => {
        const o = ch.slice(0, n)
        for (let i = 0; i < f; i++) {
          const k = i / f
          o[i] = ch[i] * Math.sin((k * Math.PI) / 2) + ch[n + i] * Math.cos((k * Math.PI) / 2)
        }
        return o
      }
      left = fold(left)
      right = fold(right)
    }
    return { sr, left, right, loop: !!s.loop }
  }
})()
