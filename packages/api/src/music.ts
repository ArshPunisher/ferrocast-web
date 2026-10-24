// Music for the screens (API.md §4 "Music for the screens"): which OBS source the beat comes
// from and where the song's name comes from. Overlays get `music` frames (§6) with the result.

import type { FerroClient } from './client'
import type { MusicNow } from './types'

export type SongSource = 'off' | 'player' | 'file'

export interface MusicConfig {
  /** The OBS audio source the beat is read from ("Desktop Audio"); null = no beat. */
  beat_input: string | null
  song: SongSource
  /** The .txt file's full path, when `song` is `file`. */
  file: string | null
}

export interface MusicView {
  config: MusicConfig
  now: MusicNow
  /** A plain sentence with what to do, when the beat can't be read. */
  beat_problem: string | null
  song_problem: string | null
}

export const MUSIC_DEFAULT: MusicConfig = { beat_input: null, song: 'off', file: null }

/** engine::music::MusicConfig::validate */
export function checkMusicConfig(c: MusicConfig): string | null {
  if (c.beat_input !== null) {
    const n = c.beat_input
    if (!n.trim() || Array.from(n).length > 256 || /\p{Cc}/u.test(n))
      return 'beat_input: the name of an OBS audio source, up to 256 letters.'
  }
  if (c.file !== null) {
    const f = c.file
    const absolute = f.startsWith('/') || /^[a-z]:[\\/]/i.test(f) || f.startsWith('\\\\')
    if (Array.from(f).length > 1024 || /\p{Cc}/u.test(f) || !absolute)
      return 'file: pick the text file with its full path.'
    if (!/\.txt$/i.test(f)) return 'file: pick a .txt file (what Snip or Tuna write).'
  }
  if (c.song === 'file' && c.file === null) return "file: pick the text file the song's name is in."
  return null
}

export function musicApi(c: FerroClient) {
  return {
    get: () => c.request<MusicView>('GET', '/api/v1/music'),
    /** Changes only the fields sent. */
    save: (patch: Partial<MusicConfig>) => c.request<MusicView>('PUT', '/api/v1/music', patch),
  }
}
