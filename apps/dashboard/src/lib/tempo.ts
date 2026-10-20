// Finds the tempo of an alert's own sound for "Land on the beat": an onset envelope (how
// sharply the loudness rises, 100 times a second) and the lag between beats that repeats best,
// searched between 70 and 170 BPM like the designer's tempo slider. Pure apart from decoding.

export const TEMPO_RANGE = [70, 170] as const
const RATE = 100
/** Bigger files would be decoded whole before the two-minute trim. */
export const MAX_SOUND_BYTES = 50 * 1024 * 1024

/** Mono samples → onset strength at 100 frames per second. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / RATE))
  const frames = Math.floor(samples.length / hop)
  const energy = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let e = 0
    const start = f * hop
    for (let i = start; i < start + hop; i++) {
      const v = samples[i] ?? 0
      e += v * v
    }
    energy[f] = Math.sqrt(e / hop)
  }
  const onset = new Float32Array(frames)
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, (energy[f] ?? 0) - (energy[f - 1] ?? 0))
  return onset
}

/**
 * The most likely tempo in BPM, or null when the sound has no steady beat (too short, too
 * quiet, or nothing repeats clearly enough).
 */
export function estimateBpm(samples: Float32Array, sampleRate: number): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null
  const env = onsetEnvelope(samples, sampleRate)
  // At least four beats at the slowest tempo.
  if (env.length < (60 / TEMPO_RANGE[0]) * RATE * 4) return null
  let mean = 0
  for (const v of env) mean += v
  mean /= env.length
  if (mean <= 1e-6) return null
  const x = Array.from(env, (v) => v - mean)
  const score = (lag: number) => {
    let s = 0
    for (let i = lag; i < x.length; i++) s += (x[i] ?? 0) * (x[i - lag] ?? 0)
    return s / (x.length - lag)
  }
  let zero = 0
  for (const v of x) zero += v * v
  zero /= x.length
  const at = (bpm: number) => {
    const lag = (60 / bpm) * RATE
    const lo = Math.floor(lag)
    const t = lag - lo
    return (1 - t) * score(lo) + t * score(lo + 1)
  }
  let best = -Infinity
  let bestBpm = 0
  for (let bpm = TEMPO_RANGE[0]; bpm <= TEMPO_RANGE[1]; bpm++) {
    const s = at(bpm)
    if (s > best) {
      best = s
      bestBpm = bpm
    }
  }
  if (!(best > zero * 0.08)) return null
  // Every other beat repeats too, so a slow pick may be half the real tempo: take the double
  // when it repeats nearly as well.
  const twice = bestBpm * 2
  if (twice <= TEMPO_RANGE[1]) {
    let b2 = twice
    let s2 = at(twice)
    for (const d of [-2, -1, 1, 2]) {
      const c = twice + d
      if (c > TEMPO_RANGE[1]) continue
      const sc = at(c)
      if (sc > s2) {
        b2 = c
        s2 = sc
      }
    }
    if (s2 >= best * 0.6) return b2
  }
  return bestBpm
}

/** Decodes a sound file and finds its tempo. Throws a plain message when it can't. */
export async function tempoOf(url: string): Promise<number> {
  const unloaded = 'The sound couldn’t be loaded. Try again, or set the tempo by hand.'
  let bytes: ArrayBuffer
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(unloaded)
    bytes = await res.arrayBuffer()
  } catch {
    throw new Error(unloaded)
  }
  if (bytes.byteLength > MAX_SOUND_BYTES)
    throw new Error(
      `That sound is ${(bytes.byteLength / 1048576).toFixed(0)} MB; tempo finding reads sounds up to 50 MB. Set the tempo by hand.`,
    )
  const C =
    globalThis.OfflineAudioContext ??
    (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  if (!C) throw new Error('This browser can’t read sounds. Set the tempo by hand.')
  const ctx = new C(1, 44_100, 44_100)
  let buf: AudioBuffer
  try {
    buf = await ctx.decodeAudioData(bytes)
  } catch {
    throw new Error('That sound file couldn’t be read. It may be damaged; set the tempo by hand.')
  }
  const ch = buf.getChannelData(0)
  // Two minutes is plenty to find a beat.
  const bpm = estimateBpm(ch.subarray(0, buf.sampleRate * 120), buf.sampleRate)
  if (bpm === null)
    throw new Error(
      'No steady beat found in this sound (it may be too short). Set the tempo by hand.',
    )
  return bpm
}
