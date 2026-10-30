import { describe, expect, it } from 'vitest'
import type { ShowConfig } from '@ferrocast/api'
import { DEFAULT_THANKS, applyStyle, routeOf, styleOf } from './show-style'

const base: ShowConfig = {
  preset_id: null,
  starting_scene: null,
  countdown_s: 0,
  live_scene: null,
  alerts_on: true,
  discord: false,
  bot_on: true,
  replay_buffer: false,
  start_stream: false,
  ending_scene: null,
  stop_stream: false,
  stop_delay_s: 15,
  recap_message: null,
  mic_sources: [],
  cam_sources: [],
  min_disk_gb: 10,
  platforms: [],
}
const scenes = ['Starting', 'Main', 'Just Chatting', 'Ending']

describe('show styles', () => {
  it('reads the style from the settings', () => {
    expect(styleOf(base)).toBe('just')
    expect(styleOf({ ...base, starting_scene: 'Starting', countdown_s: 300 })).toBe('countdown')
    expect(styleOf({ ...base, countdown_s: 60 })).toBe('countdown')
    expect(styleOf({ ...base, starting_scene: 'Starting', ending_scene: 'Ending' })).toBe('full')
    expect(styleOf({ ...base, countdown_s: 60, discord: true })).toBe('full')
    // An ending or Discord post with no countdown is still a show.
    expect(styleOf({ ...base, ending_scene: 'Ending' })).toBe('full')
    expect(styleOf({ ...base, discord: true })).toBe('full')
  })

  it('picks scenes by name and always streams', () => {
    const c = applyStyle(base, 'countdown', scenes)
    expect([c.starting_scene, c.countdown_s, c.live_scene]).toEqual(['Starting', 300, 'Main'])
    expect([c.start_stream, c.stop_stream, c.discord, c.ending_scene]).toEqual([
      true,
      true,
      false,
      null,
    ])
    expect(styleOf(c)).toBe('countdown')
    const f = applyStyle(base, 'full', scenes)
    expect([f.ending_scene, f.discord, f.replay_buffer, f.recap_message]).toEqual([
      'Ending',
      true,
      true,
      DEFAULT_THANKS,
    ])
    expect(styleOf(f)).toBe('full')
    const j = applyStyle(f, 'just', scenes)
    expect(styleOf(j)).toBe('just')
    expect(j.start_stream).toBe(true)
  })

  it('keeps what was picked by hand, and copes with no scenes', () => {
    const own = { ...base, starting_scene: 'Just Chatting', countdown_s: 120, recap_message: 'bye' }
    const f = applyStyle(own, 'full', scenes)
    expect([f.starting_scene, f.countdown_s, f.recap_message]).toEqual([
      'Just Chatting',
      120,
      'bye',
    ])
    const none = applyStyle(base, 'full', [])
    expect([none.starting_scene, none.live_scene, none.ending_scene]).toEqual([null, null, null])
    // Still a countdown, so still a show.
    expect(styleOf(none)).toBe('full')
  })

  it('draws the route', () => {
    expect(routeOf(base)).toEqual(['Your scene'])
    expect(routeOf(applyStyle(base, 'countdown', scenes))).toEqual(['Starting', '5:00', 'Main'])
    expect(routeOf(applyStyle(base, 'full', scenes))).toEqual([
      'Starting',
      '5:00',
      'Main',
      'Ending',
    ])
    expect(routeOf({ ...base, starting_scene: 'Starting', countdown_s: 90 })).toEqual([
      'Starting',
      '1:30',
    ])
  })
})
