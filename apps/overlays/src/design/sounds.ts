// The built-in alert sounds. Each is a small MP3 rendered from the Web Audio recipes in
// ../../sounds/recipes.js (the owner-approved Crystal and Felt sets, plus Sparkle classic),
// so the dashboard's previews, the overlay page and OBS all play the very same file. OBS
// captures a browser source's audio, so these play on stream like any uploaded sound.
//
// Sounds saved before 1.1 (Chime, Coin, Whoosh, Boing, Bass hit) keep working: each plays
// the new sound closest to it (`resolveSound`), so nobody's alerts go quiet.

import { resolveSound } from '@ferrocast/api/design'
import type { BuiltinSound, PlayableSound } from '@ferrocast/api/types'

import sparkle from './sounds/sparkle.mp3'
import glint from './sounds/glint.mp3'
import cascade from './sounds/cascade.mp3'
import bloom from './sounds/bloom.mp3'
import lift from './sounds/lift.mp3'
import tally from './sounds/tally.mp3'
import halo from './sounds/halo.mp3'
import droplet from './sounds/droplet.mp3'
import kalimba from './sounds/kalimba.mp3'
import marimba from './sounds/marimba.mp3'
import glow from './sounds/glow.mp3'
import ember from './sounds/ember.mp3'
import pebble from './sounds/pebble.mp3'
import feather from './sounds/feather.mp3'
import hearth from './sounds/hearth.mp3'
import wink from './sounds/wink.mp3'
import sparkleClassic from './sounds/sparkle_classic.mp3'

/** Each sound's file and its length in ms (printed by `sounds/render.mjs`). */
const FILES: Record<PlayableSound, { url: string; ms: number }> = {
  sparkle: { url: sparkle, ms: 1770 },
  glint: { url: glint, ms: 1522 },
  cascade: { url: cascade, ms: 1808 },
  bloom: { url: bloom, ms: 1907 },
  lift: { url: lift, ms: 2069 },
  tally: { url: tally, ms: 1548 },
  halo: { url: halo, ms: 2388 },
  droplet: { url: droplet, ms: 1674 },
  kalimba: { url: kalimba, ms: 1659 },
  marimba: { url: marimba, ms: 1647 },
  glow: { url: glow, ms: 1869 },
  ember: { url: ember, ms: 1558 },
  pebble: { url: pebble, ms: 1509 },
  feather: { url: feather, ms: 1660 },
  hearth: { url: hearth, ms: 1620 },
  wink: { url: wink, ms: 1200 },
  sparkle_classic: { url: sparkleClassic, ms: 547 },
}

/** The file a built-in sound plays (`null` for none). Old ids give their new sound's file. */
export function builtinSoundUrl(name: BuiltinSound): string | null {
  // An id this build doesn't know (a design from a newer Ferrocast) plays nothing.
  return (FILES as Partial<Record<string, { url: string }>>)[resolveSound(name)]?.url ?? null
}

/** How long a built-in sound plays, in ms (0 for none). */
export function builtinSoundMs(name: BuiltinSound): number {
  return (FILES as Partial<Record<string, { ms: number }>>)[resolveSound(name)]?.ms ?? 0
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

/**
 * Makes (or wakes) the shared audio context. Call it from a click: WebKit (the Mac app's
 * window) only lets a context start inside the user's gesture, and a preview that plays a
 * moment later would otherwise stay silent.
 */
export function unlockAudio(): void {
  audio()
}

/** The decoded file, fetched once and kept (a failed load is tried again next time). */
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

/** Fetches and decodes sounds ahead of time, so the first preview starts at once. */
export function preloadBuiltins(names: readonly BuiltinSound[]): void {
  const a = audio()
  if (!a) return
  for (const n of names) {
    const url = builtinSoundUrl(n)
    if (url) void load(a, url)
  }
}

let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null
/** Bumped by every exclusive play and every stop: a preview still loading then never starts. */
let generation = 0

/** Stops the sound `playBuiltin` started, if it is still ringing (a preview list moving on). */
export function stopBuiltin(): void {
  generation++
  if (!current) return
  try {
    current.src.stop()
  } catch {
    // already ended
  }
  current = null
}

/**
 * Plays a built-in sound at `volume` (0–100), for the dashboard's previews. Returns its
 * length in ms (0 when silent). `exclusive` cuts the one playing before (a picker
 * previewing as the arrow keys move).
 */
export function playBuiltin(name: BuiltinSound, volume: number, exclusive = false): number {
  const url = builtinSoundUrl(name)
  if (!url) return 0
  const a = audio()
  if (!a) return 0
  if (exclusive) stopBuiltin()
  const gen = generation
  const gainValue = Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 70)) / 100
  void load(a, url).then((buf) => {
    if (!buf || (exclusive && gen !== generation)) return
    try {
      const src = a.createBufferSource()
      const gain = a.createGain()
      src.buffer = buf
      gain.gain.value = gainValue
      src.connect(gain).connect(a.destination)
      src.start()
      const me = { src, gain }
      if (exclusive) current = me
      src.onended = () => {
        if (current === me) current = null
      }
    } catch {
      // A context that can't play (no output device): stay quiet.
    }
  })
  return builtinSoundMs(name)
}
