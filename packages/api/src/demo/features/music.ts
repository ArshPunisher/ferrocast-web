// Music for the screens in the demo engine, matching the engine (`crates/engine/src/music.rs`,
// API.md §4 "Music for the screens"): the settings, a pretend song with a beat while something
// is set up, and `music` frames for the overlays (at most 15 a second).

import { MUSIC_DEFAULT, checkMusicConfig, type MusicConfig, type MusicView } from '../../music'
import type { MusicNow } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type Routed } from './host'

export interface MusicHost {
  /** Sends a `music` frame to the overlays that use it. */
  pushMusic(now: MusicNow): void
  now(): number
}

/** The demo's playlist: a new song every 40 s. */
const SONGS: [string, string][] = [
  ['Midnight City', 'M83'],
  ['Nightcall', 'Kavinsky'],
  ['Resonance', 'Home'],
]
const KEYS = ['beat_input', 'song', 'file'] as const

export class DemoMusic {
  private cfg: MusicConfig = clone(MUSIC_DEFAULT)
  private timer: ReturnType<typeof setInterval> | null = null
  private started = 0

  constructor(private readonly host: MusicHost) {}

  private on(): boolean {
    return this.cfg.beat_input !== null || this.cfg.song !== 'off'
  }

  /** What overlays get: a beat at 120 bpm and the playlist's song, while something is set up. */
  now(): MusicNow {
    if (!this.on()) return { playing: false, level: 0, title: null, artist: null }
    const t = (this.host.now() - this.started) / 1000
    const beat = this.cfg.beat_input ? 0.45 + 0.4 * Math.max(0, Math.sin(t * Math.PI * 2)) ** 6 : 0
    const song = this.cfg.song === 'off' ? null : SONGS[Math.floor(t / 40) % SONGS.length]
    return {
      playing: true,
      level: Math.round(beat * 100) / 100,
      title: song?.[0] ?? null,
      artist: song?.[1] ?? null,
    }
  }

  view(): MusicView {
    return { config: clone(this.cfg), now: this.now(), beat_problem: null, song_problem: null }
  }

  private run(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.host.pushMusic(this.now())
    if (!this.on() || typeof setInterval !== 'function') return
    this.started = this.started || this.host.now()
    this.timer = setInterval(() => this.host.pushMusic(this.now()), 1000 / 15)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg.length !== 1 || seg[0] !== 'music') return NOT_MINE
    if (method === 'GET') return this.view()
    if (method !== 'PUT') return NOT_MINE
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new HttpError(400, 'invalid', 'Send the settings to change.')
    const b = body as Record<string, unknown>
    const next: MusicConfig = clone(this.cfg)
    for (const k of KEYS) {
      if (!(k in b)) continue
      const v = b[k]
      if (k === 'song') {
        if (v !== 'off' && v !== 'player' && v !== 'file')
          throw new HttpError(400, 'invalid', 'song: must be text.')
        next.song = v
      } else if (v === null || (typeof v === 'string' && !v.trim())) next[k] = null
      else if (typeof v === 'string') next[k] = v
      else throw new HttpError(400, 'invalid', `${k}: must be text.`)
    }
    const err = checkMusicConfig(next)
    if (err) throw new HttpError(400, 'invalid', err)
    this.cfg = next
    this.run()
    return this.view()
  }
}
