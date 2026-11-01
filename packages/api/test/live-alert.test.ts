import { describe, expect, it } from 'vitest'
import { parseLiveFrame } from '../src/live'

describe('live alerts', () => {
  it('are read, and malformed ones refused', () => {
    const ok = {
      v: 1,
      type: 'live_alert',
      data: { id: 'mic:Mic', level: 'error', message: 'Mic hasn’t heard a sound.', cleared: false },
    }
    expect(parseLiveFrame(JSON.stringify(ok))).toEqual(ok)
    expect(
      parseLiveFrame(JSON.stringify({ ...ok, data: { id: 'mic:Mic', message: 'x' } })),
    ).toBeNull()
  })
})
