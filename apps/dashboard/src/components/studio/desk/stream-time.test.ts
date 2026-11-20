import { describe, expect, it } from 'vitest'
import { streamTime } from './stats-panel'

describe('streamTime', () => {
  it('is the engine frame count over the frame rate, whenever the page was opened', () => {
    // A stream 28 s old at 60 fps: 1,680 frames. A page opened now must still say 00:00:28,
    // not time counted from its own first look (that read 00:00:02 beside the header's 00:00:28).
    expect(streamTime({ frames: 28 * 60 }, 60)).toBe('00:00:28')
    expect(streamTime({ frames: 3600 * 60 + 61 * 60 }, 60)).toBe('01:01:01')
  })

  it('reads 00:00:00 before anything is sent and falls back to 30 fps', () => {
    expect(streamTime(null, 60)).toBe('00:00:00')
    expect(streamTime({}, 60)).toBe('00:00:00')
    expect(streamTime({ frames: 90 }, 0)).toBe('00:00:03')
  })
})
