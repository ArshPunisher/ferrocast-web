import { describe, expect, it } from 'vitest'
import { parseLiveFrame } from '../src/live'

describe('live alerts', () => {
  it('are read including dismiss quiet_ok, and malformed ones refused', () => {
    const ok = {
      v: 1,
      type: 'live_alert',
      data: { id: 'mic:Mic', level: 'error', message: 'Mic hasn’t heard a sound.', cleared: false },
    }
    expect(parseLiveFrame(JSON.stringify(ok))).toEqual(ok)
    const quiet = {
      v: 1,
      type: 'live_alert',
      data: {
        id: 'mic:quiet:KREO',
        level: 'warn',
        message: 'KREO sounds quiet.',
        detail: 'No gain was changed. Tap +6 dB to boost it, or move closer to the mic.',
        cleared: false,
        source: 'KREO',
        action: 'gain_up',
        dismiss: 'quiet_ok',
      },
    }
    expect(parseLiveFrame(JSON.stringify(quiet))).toEqual(quiet)
    expect(
      parseLiveFrame(JSON.stringify({ ...ok, data: { id: 'mic:Mic', message: 'x' } })),
    ).toBeNull()
  })
})
