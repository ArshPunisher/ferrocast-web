// A short two-note chime rendered to a WAV data URL, so demo alerts have a sound without
// shipping an audio file. 8-bit mono, 16 kHz, about 0.5 s: under 12 KB as base64.

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

let cached: string | null = null

export function chimeDataUrl(): string {
  if (cached) return cached
  const rate = 16_000
  const seconds = 0.55
  const n = Math.floor(rate * seconds)
  const data = new Uint8Array(44 + n)
  const view = new DataView(data.buffer)
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) data[o + i] = s.charCodeAt(i)
  }
  w(0, 'RIFF')
  view.setUint32(4, 36 + n, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  w(36, 'data')
  view.setUint32(40, n, true)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const f = t < 0.16 ? 1046.5 : 1568 // C6 then G6
    const local = t < 0.16 ? t : t - 0.16
    const env = Math.exp(-local * 9) * Math.min(1, local * 400)
    const v = Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(4 * Math.PI * f * t) * 0.15
    data[44 + i] = Math.max(0, Math.min(255, Math.round(128 + v * env * 100)))
  }
  cached = `data:audio/wav;base64,${toBase64(data)}`
  return cached
}
