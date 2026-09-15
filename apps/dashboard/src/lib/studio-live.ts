// Studio's live frames (lane, markers, counters, show, OBS health, BRB) folded into one
// slice of the live store, so screens subscribe to just what they show.

import type { LaneItem, LiveFrame, ObsHealth, ShowRun } from '@ferrocast/api'

export interface StudioLive {
  /** `undefined` until a frame arrives (load it with the client). */
  lane: LaneItem[] | undefined
  /** The newest pinned moment, for the streamer-only sound. */
  added: { item: LaneItem; sound: string; volume: number } | null
  health: ObsHealth | null | undefined
  show: ShowRun | null | undefined
  brb: { on: boolean; scene: string } | null
  /** Bumped on every new marker, so marker lists refetch. */
  markers: number
  counters: Record<string, number>
}

export const EMPTY_STUDIO: StudioLive = {
  lane: undefined,
  added: null,
  health: undefined,
  show: undefined,
  brb: null,
  markers: 0,
  counters: {},
}

const TYPES = new Set(['lane', 'marker', 'counter', 'show', 'obs_health', 'brb'])

export function isStudioFrame(f: LiveFrame): boolean {
  return TYPES.has(f.type)
}

/** One frame into the slice; a new object only when something changed. */
export function reduceStudio(s: StudioLive, f: LiveFrame): StudioLive {
  switch (f.type) {
    case 'lane':
      return {
        ...s,
        lane: f.data.items,
        added: f.data.added
          ? { item: f.data.added, sound: f.data.sound, volume: f.data.volume }
          : s.added,
      }
    case 'marker':
      return { ...s, markers: s.markers + 1 }
    case 'counter':
      return { ...s, counters: { ...s.counters, [f.data.name]: f.data.value } }
    case 'show':
      return { ...s, show: f.data.show }
    case 'obs_health':
      return { ...s, health: f.data }
    case 'brb':
      return { ...s, brb: f.data }
    default:
      return s
  }
}
