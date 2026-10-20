// The built-in alert sounds' recipes (Web Audio), from the owner-approved sound board
// (design/2026-10-20-options/5-sounds.html, option C: both the Crystal and the Felt set).
// They are not played live: `render.mjs` renders each one offline in Chromium into an MP3 in
// src/design/sounds/, so the dashboard, the overlay page and OBS all play the same file.
// Every random number comes from a seeded generator, so a render sounds the same every time.
// Plain browser script (no imports): it runs inside the render page and sets
// `window.FC_SOUNDS` and `window.FC_RENDER`.
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
  // Noise and the room's impulse use this one; reseeded before every render.
  let NR = rng(1)
  const buildChain = (ctx, dest) => {
    const input = ctx.createGain()
    const dry = ctx.createGain()
    dry.gain.value = 0.9
    const wet = ctx.createGain()
    wet.gain.value = 0.32
    const pre = ctx.createDelay(0.1)
    pre.delayTime.value = 0.018
    const conv = ctx.createConvolver()
    conv.buffer = impulse(ctx, 1.9, 3.2)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 7200
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 3
    comp.attack.value = 0.004
    comp.release.value = 0.18
    const master = ctx.createGain()
    master.gain.value = 0.9
    input.connect(dry).connect(comp)
    input.connect(pre).connect(hp).connect(conv).connect(tone).connect(wet).connect(comp)
    comp.connect(master).connect(dest)
    return { input, master }
  }
  const impulse = (ctx, seconds = 1.8, decay = 3) => {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const n = NR() * 2 - 1
        lp = lp * 0.55 + n * 0.45 // soften the tail a little
        d[i] = lp * Math.pow(1 - i / len, decay) * (i < 90 ? i / 90 : 1)
      }
    }
    return buf
  }
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12)
  // MIDI: C5 72, C6 84, C7 96
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

  function panNode(ctx, out, p) {
    if (!p || !ctx.createStereoPanner) return out
    const n = ctx.createStereoPanner()
    n.pan.value = Math.max(-1, Math.min(1, p))
    n.connect(out)
    return n
  }
  function env(ctx, g, at, peak, attack, dur, curve = 'exp') {
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur)
    else g.gain.linearRampToValueAtTime(0.0001, at + attack + dur)
  }
  function osc(
    ctx,
    out,
    {
      f,
      at,
      dur,
      type = 'sine',
      gain = 0.3,
      attack = 0.004,
      pan = 0,
      detune = 0,
      glide,
      glideT = 0.06,
      curve,
    },
  ) {
    if (f >= ctx.sampleRate * 0.45 || (glide && glide >= ctx.sampleRate * 0.45)) return null
    const o = ctx.createOscillator(),
      g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, at)
    o.detune.value = detune
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + glideT)
    env(ctx, g, at, gain, attack, dur, curve)
    o.connect(g).connect(panNode(ctx, out, pan))
    o.start(at)
    o.stop(at + attack + dur + 0.05)
    return o
  }
  // Glass / celesta bell: inharmonic partials, upper ones die first, plus a soft strike.
  function bell(
    ctx,
    out,
    {
      f,
      at,
      dur = 1,
      gain = 0.3,
      pan = 0,
      bright = 1,
      ratios = [1, 2.76, 5.4, 8.93],
      amps = [1, 0.32, 0.12, 0.05],
    },
  ) {
    ratios.forEach((r, i) => {
      const fr = f * r
      if (fr > Math.min(16000, ctx.sampleRate * 0.45)) return
      osc(ctx, out, {
        f: fr,
        at,
        dur: dur / (1 + i * 1.6),
        gain: gain * amps[i] * (i ? bright : 1),
        attack: 0.0025,
        pan: pan + (i % 2 ? 0.08 : -0.08),
      })
    })
    noise(ctx, out, {
      at,
      dur: 0.025,
      f0: Math.min(f * 4, 12000),
      q: 1.4,
      gain: gain * 0.18 * bright,
      pan,
    })
  }
  // Mallet (marimba-like): wood partials 1, 3.93, 9.2.
  function mallet(ctx, out, o) {
    bell(ctx, out, { ratios: [1, 3.93, 9.2], amps: [1, 0.22, 0.06], ...o })
  }
  // Electric piano: two-operator FM with a fast-decaying index, so it barks then rounds off.
  function ep(ctx, out, { f, at, dur = 1.4, gain = 0.25, pan = 0, index = 2.2, ratio = 1 }) {
    const c = ctx.createOscillator(),
      m = ctx.createOscillator(),
      mg = ctx.createGain(),
      g = ctx.createGain()
    c.frequency.value = f
    m.frequency.value = (f * ratio * 14) / 14
    mg.gain.setValueAtTime(f * index, at)
    mg.gain.exponentialRampToValueAtTime(f * 0.08, at + 0.35)
    m.connect(mg).connect(c.frequency)
    env(ctx, g, at, gain, 0.006, dur)
    c.connect(g).connect(panNode(ctx, out, pan))
    c.start(at)
    m.start(at)
    c.stop(at + dur + 0.1)
    m.stop(at + dur + 0.1)
    osc(ctx, out, { f: f * 2, at, dur: dur * 0.5, gain: gain * 0.12, pan })
  }
  // Kalimba / tine: sine body with a short metallic FM click.
  function tine(ctx, out, { f, at, dur = 0.9, gain = 0.3, pan = 0 }) {
    ep(ctx, out, { f, at, dur, gain, pan, index: 1.4, ratio: 3.5 })
    osc(ctx, out, { f: f * 5.9, at, dur: 0.06, gain: gain * 0.1, pan })
  }
  // Plucked string (Karplus-Strong), rendered into a buffer.
  function pluck(ctx, out, { f, at, dur = 1.2, gain = 0.3, pan = 0, damp = 0.996, r }) {
    const sr = ctx.sampleRate,
      n = Math.floor(sr * dur),
      p = Math.max(2, Math.round(sr / f))
    const buf = ctx.createBuffer(1, n, sr),
      d = buf.getChannelData(0),
      line = new Float32Array(p)
    for (let i = 0; i < p; i++) line[i] = (r ? r() : NR()) * 2 - 1
    let idx = 0,
      prev = 0
    for (let i = 0; i < n; i++) {
      const v = line[idx]
      const nv = damp * 0.5 * (v + prev)
      prev = v
      line[idx] = nv
      d[i] = v
      idx = (idx + 1) % p
    }
    const s = ctx.createBufferSource(),
      g = ctx.createGain(),
      lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = Math.min(9000, f * 7)
    s.buffer = buf
    g.gain.setValueAtTime(gain, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    s.connect(lp)
      .connect(g)
      .connect(panNode(ctx, out, pan))
    s.start(at)
  }
  function noise(
    ctx,
    out,
    {
      at,
      dur,
      f0 = 2000,
      f1,
      q = 1,
      gain = 0.2,
      attack = 0.002,
      pan = 0,
      type = 'bandpass',
      curve,
    },
  ) {
    const sr = ctx.sampleRate,
      n = Math.max(1, Math.floor(sr * (dur + attack + 0.02)))
    const buf = ctx.createBuffer(1, n, sr),
      d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = NR() * 2 - 1
    const s = ctx.createBufferSource(),
      bp = ctx.createBiquadFilter(),
      g = ctx.createGain()
    bp.type = type
    bp.Q.value = q
    bp.frequency.setValueAtTime(f0, at)
    if (f1) bp.frequency.exponentialRampToValueAtTime(f1, at + attack + dur)
    s.buffer = buf
    env(ctx, g, at, gain, attack, dur, curve)
    s.connect(bp)
      .connect(g)
      .connect(panNode(ctx, out, pan))
    s.start(at)
  }
  // Tiny high glints scattered after a sound, the "sparkle dust".
  function dust(
    ctx,
    out,
    { at, span = 0.5, count = 7, gain = 0.05, lo = 84, hi = 100, r, scale = [0, 2, 4, 7, 9] },
  ) {
    for (let i = 0; i < count; i++) {
      const oct = Math.floor(r() * ((hi - lo) / 12)),
        deg = scale[Math.floor(r() * scale.length)]
      const f = NOTE(lo + oct * 12 + deg)
      osc(ctx, out, {
        f,
        at: at + r() * span,
        dur: 0.18 + r() * 0.25,
        gain: gain * (0.5 + r() * 0.5),
        pan: r() * 1.6 - 0.8,
      })
    }
  }
  function pad(
    ctx,
    out,
    { notes, at, dur = 2, gain = 0.06, attack = 0.25, cutoff0 = 700, cutoff1 = 3800, trem = 0 },
  ) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.6
    lp.frequency.setValueAtTime(cutoff0, at)
    lp.frequency.exponentialRampToValueAtTime(cutoff1, at + attack + 0.3)
    const g = ctx.createGain()
    env(ctx, g, at, 1, attack, dur)
    if (trem) {
      const l = ctx.createOscillator(),
        lg = ctx.createGain()
      l.frequency.value = trem
      lg.gain.value = 0.18
      l.connect(lg).connect(g.gain)
      l.start(at)
      l.stop(at + dur + attack + 0.1)
    }
    lp.connect(g).connect(out)
    notes.forEach((n, i) => {
      ;[-7, 7].forEach((dt, k) =>
        osc(ctx, lp, {
          f: NOTE(n),
          at,
          dur: dur + attack,
          attack: 0.01,
          gain,
          type: k ? 'triangle' : 'sine',
          detune: dt,
          pan: (i / notes.length - 0.5) * 0.9 * (k ? 1 : -1),
          curve: 'lin',
        }),
      )
    })
  }

  const L = {}
  const def = (id, meta, fn) => (L[id] = { id, ...meta, fn })

  // Reference: today's Sparkle, exactly as the overlay plays it.
  def(
    'sparkle_v1',
    {
      name: 'Sparkle (today)',
      set: 'ref',
      len: 0.7,
      character: 'The current one, for comparison.',
    },
    (c, o, t) => {
      ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
        osc(c, o, { f, at: t + i * 0.07, dur: 0.4, gain: 0.3, attack: 0.015 }),
      )
    },
  )

  // Sparkle classic: the overlay's own Sparkle before 1.1, note for note (sounds.ts `tone`).
  def('sparkle_classic', { name: 'Sparkle classic', set: 'classic', len: 0.75 }, (c, o, t) => {
    ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const at = t + i * 0.07,
        dur = 0.4
      const g = c.createGain(),
        x = c.createOscillator()
      x.type = 'sine'
      x.frequency.setValueAtTime(f, at)
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(1, at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      x.connect(g).connect(o)
      x.start(at)
      x.stop(at + dur + 0.05)
    })
  })

  /* Set A: Crystal. Bright, glassy, cut through game audio. */
  def(
    'sparkle',
    {
      trim: 0.8,
      name: 'Sparkle',
      set: 'a',
      len: 1.5,
      use: 'Any alert',
      character:
        'The one that works, finished: a C-major glass arpeggio that spreads left to right, then a little dust.',
    },
    (c, o, t, r) => {
      ;[84, 88, 91, 96].forEach((n, i) =>
        bell(c, o, {
          f: NOTE(n),
          at: t + i * 0.062,
          dur: 1.1 - i * 0.08,
          gain: 0.26,
          pan: -0.45 + i * 0.3,
        }),
      )
      osc(c, o, { f: NOTE(108), at: t + 0.19, dur: 0.5, gain: 0.025 })
      dust(c, o, { at: t + 0.24, span: 0.45, count: 6, gain: 0.035, r })
    },
  )
  def(
    'glint',
    {
      trim: 1.5,
      name: 'Glint',
      set: 'a',
      len: 0.9,
      use: 'Follow',
      character: 'One clean ping with a fifth above it. Short enough for busy follow trains.',
    },
    (c, o, t) => {
      bell(c, o, { f: NOTE(91), at: t, dur: 0.8, gain: 0.3, pan: -0.1 })
      bell(c, o, { f: NOTE(98), at: t + 0.028, dur: 0.6, gain: 0.12, pan: 0.25, bright: 0.6 })
    },
  )
  def(
    'cascade',
    {
      name: 'Cascade',
      set: 'a',
      len: 1.4,
      use: 'Sub, membership',
      character:
        'A quick pentatonic run that climbs and lands. Feels like a level up without the arcade.',
    },
    (c, o, t, r) => {
      ;[86, 88, 91, 93, 95, 98].forEach((n, i) =>
        bell(c, o, {
          f: NOTE(n),
          at: t + i * 0.048,
          dur: i === 5 ? 1.1 : 0.45,
          gain: i === 5 ? 0.26 : 0.17,
          pan: Math.sin(i * 1.3) * 0.5,
          bright: 0.8,
        }),
      )
      dust(c, o, { at: t + 0.3, span: 0.4, count: 4, gain: 0.03, r })
    },
  )
  def(
    'bloom',
    {
      name: 'Bloom',
      set: 'a',
      len: 2.1,
      use: 'Big tip, gift bomb',
      character: 'A major-nine chord that opens up like a filter sweep, crowned by one high bell.',
    },
    (c, o, t, r) => {
      pad(c, o, {
        notes: [60, 64, 67, 71, 74],
        at: t,
        dur: 1.6,
        gain: 0.045,
        attack: 0.12,
        cutoff0: 500,
        cutoff1: 5200,
      })
      ;[72, 76, 79].forEach((n, i) =>
        bell(c, o, {
          f: NOTE(n),
          at: t + i * 0.03,
          dur: 1.2,
          gain: 0.12,
          pan: (i - 1) * 0.4,
          bright: 0.6,
        }),
      )
      bell(c, o, { f: NOTE(96), at: t + 0.24, dur: 1.3, gain: 0.2, pan: 0.15 })
      dust(c, o, { at: t + 0.3, span: 0.8, count: 9, gain: 0.03, r })
    },
  )
  def(
    'lift',
    {
      trim: 1.9,
      name: 'Lift',
      set: 'a',
      len: 1.5,
      use: 'Raid, host',
      character:
        'Air rushing upward that resolves into a bright open fifth. The tonal answer to Whoosh.',
    },
    (c, o, t) => {
      noise(c, o, {
        at: t,
        dur: 0.42,
        attack: 0.3,
        f0: 500,
        f1: 6000,
        q: 1.6,
        gain: 0.22,
        curve: 'lin',
      })
      noise(c, o, {
        at: t + 0.05,
        dur: 0.38,
        attack: 0.25,
        f0: 900,
        f1: 9000,
        q: 3,
        gain: 0.08,
        pan: 0.4,
        curve: 'lin',
      })
      bell(c, o, { f: NOTE(79), at: t + 0.4, dur: 1, gain: 0.2, pan: -0.25 })
      bell(c, o, { f: NOTE(86), at: t + 0.43, dur: 1, gain: 0.18, pan: 0.25 })
      bell(c, o, { f: NOTE(91), at: t + 0.5, dur: 0.9, gain: 0.14, pan: 0 })
    },
  )
  def(
    'tally',
    {
      trim: 1.15,
      name: 'Tally',
      set: 'a',
      len: 1.2,
      use: 'Tip, bits, Super Chat',
      character:
        'The coin interval (B to E) played on glass, not a square wave. Says "money" without the 8-bit.',
    },
    (c, o, t, r) => {
      bell(c, o, { f: NOTE(83), at: t, dur: 0.22, gain: 0.22, pan: -0.2 })
      bell(c, o, { f: NOTE(88), at: t + 0.075, dur: 0.95, gain: 0.28, pan: 0.15 })
      osc(c, o, { f: NOTE(100), at: t + 0.075, dur: 0.4, gain: 0.03, pan: 0.3 })
      dust(c, o, { at: t + 0.14, span: 0.35, count: 5, gain: 0.03, lo: 88, r })
    },
  )
  def(
    'halo',
    {
      name: 'Halo',
      set: 'a',
      len: 2.4,
      use: 'Milestone, hype train',
      character:
        'A soft A-major pad with a slow shimmer under a rising bell arpeggio. The big moment.',
    },
    (c, o, t, r) => {
      pad(c, o, {
        notes: [57, 61, 64, 69],
        at: t,
        dur: 1.9,
        gain: 0.05,
        attack: 0.28,
        trem: 5.5,
        cutoff1: 4200,
      })
      ;[81, 85, 88, 93, 97].forEach((n, i) =>
        bell(c, o, {
          f: NOTE(n),
          at: t + 0.16 + i * 0.09,
          dur: 1.1,
          gain: 0.16,
          pan: -0.5 + i * 0.25,
          bright: 0.85,
        }),
      )
      dust(c, o, { at: t + 0.6, span: 1, count: 10, gain: 0.025, lo: 93, r })
    },
  )
  def(
    'droplet',
    {
      trim: 1.7,
      name: 'Droplet',
      set: 'a',
      len: 1.0,
      use: 'Playful alerts, redeems',
      character:
        'A water-drop bloop that turns into a bell, with a smaller echo. Playful like Boing, but round.',
    },
    (c, o, t) => {
      osc(c, o, { f: 520, glide: 1500, glideT: 0.07, at: t, dur: 0.12, gain: 0.3, attack: 0.003 })
      bell(c, o, { f: NOTE(91), at: t + 0.06, dur: 0.75, gain: 0.18, pan: 0.1 })
      osc(c, o, { f: 760, glide: 2100, glideT: 0.06, at: t + 0.2, dur: 0.09, gain: 0.12, pan: 0.4 })
      bell(c, o, { f: NOTE(98), at: t + 0.24, dur: 0.5, gain: 0.07, pan: 0.4 })
    },
  )

  /* Set B: Felt. Warm, softer, sits under chill streams and music. */
  def(
    'kalimba',
    {
      name: 'Kalimba',
      set: 'b',
      len: 1.2,
      use: 'Follow',
      character: 'Two thumb-piano tines a third apart. Friendly and quiet.',
    },
    (c, o, t) => {
      tine(c, o, { f: NOTE(76), at: t, dur: 0.9, gain: 0.3, pan: -0.2 })
      tine(c, o, { f: NOTE(80), at: t + 0.1, dur: 1.0, gain: 0.26, pan: 0.2 })
    },
  )
  def(
    'marimba',
    {
      name: 'Marimba',
      set: 'b',
      len: 1.1,
      use: 'Sub, membership',
      character: 'A rolled C-major triad on wood. Warm, rhythmic, never shrill.',
    },
    (c, o, t) => {
      ;[72, 76, 79, 84].forEach((n, i) =>
        mallet(c, o, { f: NOTE(n), at: t + i * 0.06, dur: 0.7, gain: 0.26, pan: -0.3 + i * 0.2 }),
      )
    },
  )
  def(
    'glow',
    {
      trim: 1.1,
      name: 'Glow',
      set: 'b',
      len: 1.9,
      use: 'Tip, Super Chat',
      character: 'A strummed F-major-seven on an electric piano. Lo-fi lounge.',
    },
    (c, o, t) => {
      ;[65, 69, 72, 76].forEach((n, i) =>
        ep(c, o, { f: NOTE(n), at: t + i * 0.028, dur: 1.6, gain: 0.13, pan: -0.3 + i * 0.2 }),
      )
      ep(c, o, { f: NOTE(84), at: t + 0.18, dur: 1.2, gain: 0.08, pan: 0.3, index: 1.2 })
    },
  )
  def(
    'ember',
    {
      name: 'Ember',
      set: 'b',
      len: 1.5,
      use: 'Big tip (replaces Bass hit)',
      character:
        'A deep, tuned body hit with a mallet on top and a few crackles. Weight without the boom.',
    },
    (c, o, t, r) => {
      osc(c, o, { f: 92, glide: 55, glideT: 0.25, at: t, dur: 0.75, gain: 0.5, attack: 0.006 })
      mallet(c, o, { f: NOTE(57), at: t, dur: 0.8, gain: 0.22 })
      mallet(c, o, { f: NOTE(69), at: t + 0.012, dur: 0.9, gain: 0.14, pan: 0.15 })
      bell(c, o, { f: NOTE(88), at: t + 0.09, dur: 0.9, gain: 0.07, pan: -0.2, bright: 0.5 })
      for (let i = 0; i < 6; i++)
        noise(c, o, {
          at: t + 0.12 + r() * 0.6,
          dur: 0.012,
          f0: 2500 + r() * 3000,
          q: 4,
          gain: 0.08 + r() * 0.06,
          pan: r() * 1.4 - 0.7,
        })
    },
  )
  def(
    'pebble',
    {
      trim: 1.9,
      name: 'Pebble',
      set: 'b',
      len: 0.9,
      use: 'Chat highlight, redeem',
      character: 'Two drops into still water. The softest thing in the set.',
    },
    (c, o, t) => {
      osc(c, o, { f: 640, glide: 1250, glideT: 0.04, at: t, dur: 0.1, gain: 0.32 })
      osc(c, o, {
        f: 900,
        glide: 1700,
        glideT: 0.035,
        at: t + 0.12,
        dur: 0.09,
        gain: 0.22,
        pan: 0.3,
      })
      osc(c, o, { f: NOTE(86), at: t + 0.03, dur: 0.5, gain: 0.04, pan: -0.2 })
    },
  )
  def(
    'feather',
    {
      trim: 1.25,
      name: 'Feather',
      set: 'b',
      len: 1.4,
      use: 'TTS start, chat message',
      character:
        'A breath of air that settles on one soft note. Good before a voice reads a message.',
    },
    (c, o, t) => {
      noise(c, o, {
        at: t,
        dur: 0.35,
        attack: 0.16,
        f0: 1800,
        f1: 3400,
        q: 0.8,
        gain: 0.12,
        curve: 'lin',
      })
      osc(c, o, { f: NOTE(86), at: t + 0.16, dur: 1.0, gain: 0.14, type: 'triangle', attack: 0.03 })
      osc(c, o, { f: NOTE(93), at: t + 0.2, dur: 0.8, gain: 0.04, attack: 0.03, pan: 0.3 })
    },
  )
  def(
    'hearth',
    {
      name: 'Hearth',
      set: 'b',
      len: 2.0,
      use: 'Raid, gift bomb',
      character: 'A strummed D chord on nylon strings over a warm low note. Big, but cosy.',
    },
    (c, o, t, r) => {
      osc(c, o, { f: NOTE(38), at: t, dur: 1.4, gain: 0.22, attack: 0.01 })
      ;[50, 57, 62, 66, 69, 74].forEach((n, i) =>
        pluck(c, o, { f: NOTE(n), at: t + i * 0.035, dur: 1.7, gain: 0.2, pan: -0.5 + i * 0.2, r }),
      )
      bell(c, o, { f: NOTE(86), at: t + 0.3, dur: 1.2, gain: 0.08, pan: 0.2, bright: 0.5 })
    },
  )
  def(
    'wink',
    {
      trim: 1.4,
      name: 'Wink',
      set: 'b',
      len: 0.5,
      use: 'Frequent events',
      character: 'A tiny two-note blip. For alerts that fire every few seconds.',
    },
    (c, o, t) => {
      osc(c, o, { f: NOTE(79), at: t, dur: 0.07, gain: 0.2, attack: 0.003 })
      osc(c, o, { f: NOTE(86), at: t + 0.065, dur: 0.16, gain: 0.2, attack: 0.003 })
      osc(c, o, { f: NOTE(98), at: t + 0.065, dur: 0.1, gain: 0.02, pan: 0.3 })
    },
  )

  const seed = (id) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
  window.FC_SOUNDS = L
  /** Renders one sound to stereo PCM at `sr`, exactly as the board plays it at volume 100. */
  window.FC_RENDER = async (id, sr = 48000) => {
    const s = L[id]
    NR = rng(seed(id) ^ 0x5eed)
    const len = s.len + 0.7
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * len), sr)
    if (id === 'sparkle_v1' || id === 'sparkle_classic') {
      const v = ctx.createGain()
      v.gain.value = 0.35
      v.connect(ctx.destination)
      s.fn(ctx, v, 0.01, rng(seed(id)))
    } else {
      const bus = buildChain(ctx, ctx.destination)
      const g = ctx.createGain()
      g.gain.value = 0.9 * (s.trim || 1)
      g.connect(bus.input)
      s.fn(ctx, g, 0.01, rng(seed(id)))
    }
    const buf = await ctx.startRendering()
    return { sr, left: Array.from(buf.getChannelData(0)), right: Array.from(buf.getChannelData(1)) }
  }
})()
