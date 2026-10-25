// The sound element's sounds (`layer` type `sound`): six stingers and four loops, real
// recordings from Freesound, all CC0 (sounds/screen-sounds.md lists each one), trimmed,
// levelled and looped by sounds/prepare-screen.py; or the streamer's own file from the media
// library. One audio context for the page; OBS hears it as the browser
// source's audio ("Control audio via OBS", which Ferrocast switches on).

import type { SoundLoop, Stinger } from '@ferrocast/api/types'

import whoosh from './sounds/screen/whoosh.mp3'
import riser from './sounds/screen/riser.mp3'
import impact from './sounds/screen/impact.mp3'
import tick from './sounds/screen/tick.mp3'
import chime from './sounds/screen/chime.mp3'
import glitch from './sounds/screen/glitch.mp3'
import rain from './sounds/screen/rain.mp3'
import wind from './sounds/screen/wind.mp3'
import pad from './sounds/screen/pad.mp3'
import hum from './sounds/screen/hum.mp3'

/** Each file, with its length in ms (printed by `prepare-screen.py`). */
export const SCREEN_SOUNDS: Record<Stinger | SoundLoop, { url: string; ms: number }> = {
  whoosh: { url: whoosh, ms: 2236 },
  riser: { url: riser, ms: 3061 },
  impact: { url: impact, ms: 4343 },
  tick: { url: tick, ms: 445 },
  chime: { url: chime, ms: 1544 },
  glitch: { url: glitch, ms: 2000 },
  rain: { url: rain, ms: 30000 },
  wind: { url: wind, ms: 30000 },
  pad: { url: pad, ms: 30000 },
  hum: { url: hum, ms: 30000 },
}

let ctx: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()

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

/** Wakes the context; the dashboard calls it inside a click (WebKit starts audio only there). */
export function unlockScreenAudio(): void {
  audio()
}

function load(a: AudioContext, url: string): Promise<AudioBuffer | null> {
  let b = buffers.get(url)
  if (!b) {
    b = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => a.decodeAudioData(data))
      .catch(() => {
        buffers.delete(url)
        return null
      })
    buffers.set(url, b)
  }
  return b
}

/** A playing sound: its loudness can change (ducking) and it can be stopped. */
export interface Playing {
  setVolume(v: number): void
  stop(): void
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7)

/**
 * Plays `url` at `volume` (0 to 1), once or looped. A sound stopped before it finished loading
 * never starts. Returns null when the page has no audio.
 */
export function playUrl(url: string, volume: number, loop = false, loopMs = 0): Playing | null {
  const a = audio()
  if (!a) return null
  const gain = a.createGain()
  gain.gain.value = clamp(volume)
  gain.connect(a.destination)
  let src: AudioBufferSourceNode | null = null
  let stopped = false
  void load(a, url).then((buf) => {
    if (!buf || stopped) return
    try {
      src = a.createBufferSource()
      src.buffer = buf
      if (loop) {
        src.loop = true
        // The file's own length, not the decoder's padding: the loop has no gap.
        if (loopMs > 0 && loopMs / 1000 < buf.duration) {
          src.loopStart = 0
          src.loopEnd = loopMs / 1000
        }
      }
      src.connect(gain)
      src.start()
    } catch {
      // no output device: stay quiet
    }
  })
  return {
    setVolume(v) {
      try {
        gain.gain.setTargetAtTime(clamp(v), a.currentTime, 0.25)
      } catch {
        gain.gain.value = clamp(v)
      }
    },
    stop() {
      stopped = true
      try {
        // A short fade, so a loop never ends on a click.
        gain.gain.setTargetAtTime(0, a.currentTime, 0.08)
        src?.stop(a.currentTime + 0.4)
      } catch {
        // already ended
      }
      setTimeout(() => gain.disconnect(), 600)
    },
  }
}

/** Plays a built-in screen sound. */
export function playScreenSound(
  name: Stinger | SoundLoop,
  volume: number,
  loop = false,
): Playing | null {
  const f = SCREEN_SOUNDS[name]
  return f ? playUrl(f.url, volume, loop, f.ms) : null
}
