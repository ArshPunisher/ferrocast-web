import { describe, expect, it } from 'vitest'
import type { DestinationView } from '@ferrocast/api'
import {
  describeDestinationRate,
  describeStreamCap,
  describeUploadNeed,
  type StreamCapSummary,
} from './bitrate-summary'

function dest(overrides: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'twitch',
    kind: 'twitch',
    canvas: 'main',
    name: 'Twitch',
    account: 'arsh_live',
    enabled: true,
    connected: true,
    health: null,
    blocked: null,
    rules: [],
    ...overrides,
  }
}

describe('U2 bitrate cap wording and math', () => {
  const youtube = dest({ id: 'youtube', kind: 'youtube', name: 'YouTube' })
  const twitch = dest({ id: 'twitch', kind: 'twitch', name: 'Twitch' })
  const kick = dest({ id: 'kick', kind: 'kick', name: 'Kick' })
  const ytVertical = dest({
    id: 'youtube_vertical',
    kind: 'youtube',
    canvas: 'vertical',
    name: 'YouTube Shorts',
  })

  it('no cap: uncapped platforms or bitrates at/below ceiling produce no cap warning and show chosen rate', () => {
    // Only YouTube enabled at 12 Mbps -> no cap
    const ytOnly = describeStreamCap(12000, [youtube])
    expect(ytOnly.capped).toBe(false)
    expect(ytOnly.effectiveVideoKbps).toBe(12000)
    expect(ytOnly.settingsNote).toBeNull()
    expect(describeDestinationRate(youtube, ytOnly, { streamKbps: 12160 }).rateLabel).toBe(
      '12 Mbps',
    )
    expect(describeDestinationRate(youtube, ytOnly, { streamKbps: 12160 }).heldBackNote).toBeNull()

    // Twitch + YouTube enabled at 6 Mbps (Sharp) -> 6000 <= 6000, no cap applies
    const sharp = describeStreamCap(6000, [twitch, youtube])
    expect(sharp.capped).toBe(false)
    expect(sharp.effectiveVideoKbps).toBe(6000)
    expect(sharp.settingsNote).toBeNull()

    // Twitch Enhanced Broadcasting removes the 6 Mbps ceiling
    const enhancedTwitch = dest({ ...twitch, enhanced: true })
    const enh = describeStreamCap(12000, [enhancedTwitch, youtube])
    expect(enh.capped).toBe(false)
    expect(enh.settingsNote).toBeNull()
  })

  it('one cap: Twitch at 6 Mbps caps shared encode for Twitch and YouTube and explains both', () => {
    const summary: StreamCapSummary = describeStreamCap(12000, [twitch, youtube, ytVertical])
    expect(summary.capped).toBe(true)
    expect(summary.effectiveVideoKbps).toBe(6000)
    expect(summary.limiter?.name).toBe('Twitch')
    expect(summary.settingsNote).toBe(
      'Sending 6.0 Mbps right now. Twitch takes at most 6 Mbps, and every place gets the same picture. Turn Twitch off to send 12 Mbps.',
    )

    // Twitch row stays explained by its cap
    const twRow = describeDestinationRate(twitch, summary, { streamKbps: 6160 })
    expect(twRow.rateLabel).toBe('6.0 Mbps')
    expect(twRow.heldBackNote).toBeNull()

    // YouTube row explains that it receives Twitch's capped shared stream
    const ytRow = describeDestinationRate(youtube, summary, { streamKbps: 6160 })
    expect(ytRow.rateLabel).toBe('6.0 Mbps')
    expect(ytRow.heldBackNote?.summary).toBe('Same stream as Twitch: 6.0 Mbps')
    expect(ytRow.heldBackNote?.detail).toContain('Twitch')

    // Vertical Shorts stream is separate and never held back by main Twitch cap
    const vertRow = describeDestinationRate(ytVertical, summary, {
      streamKbps: 6160,
      verticalKbps: 4500,
    })
    expect(vertRow.heldBackNote).toBeNull()
    expect(vertRow.rateLabel).toBe('4.5 Mbps')
  })

  it('several caps: names the strictest limiter and lists other capping platforms cleanly', () => {
    const summary = describeStreamCap(12000, [twitch, youtube, kick])
    expect(summary.capped).toBe(true)
    expect(summary.effectiveVideoKbps).toBe(6000)
    expect(summary.limiter?.name).toBe('Twitch')
    expect(summary.settingsNote).toBe(
      'Sending 6.0 Mbps right now. Twitch takes at most 6 Mbps (and Kick takes at most 8 Mbps), and every place gets the same picture. Turn Twitch and Kick off to send 12 Mbps.',
    )

    // Two destinations tied at the same lowest limit
    const altLow = dest({
      id: 'c_1',
      kind: 'custom',
      name: 'Mirror',
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'Capped at 6,000 kbps for Mirror',
        detail: '',
      },
    })
    const tied = describeStreamCap(12000, [twitch, altLow, youtube])
    expect(tied.capped).toBe(true)
    expect(tied.settingsNote).toBe(
      'Sending 6.0 Mbps right now. Twitch and Mirror take at most 6 Mbps, and every place gets the same picture. Turn them off to send 12 Mbps.',
    )
  })

  it('all off or blocked: turning off Twitch lifts the cap and all off emits no note or upload math', () => {
    const offAll = describeStreamCap(12000, [
      { ...twitch, enabled: false },
      { ...youtube, enabled: false },
      { ...kick, enabled: false },
    ])
    expect(offAll.capped).toBe(false)
    expect(offAll.effectiveVideoKbps).toBe(12000)
    expect(offAll.settingsNote).toBeNull()

    const blockedTwitch = describeStreamCap(12000, [
      { ...twitch, blocked: 'Connect Twitch first.' },
      youtube,
    ])
    expect(blockedTwitch.capped).toBe(false)
    expect(blockedTwitch.effectiveVideoKbps).toBe(12000)
    expect(blockedTwitch.settingsNote).toBeNull()
  })

  it('upload math shows N places x rate = total upload and calm explanation', () => {
    const three = describeUploadNeed([twitch, youtube, kick], {
      planKbps: 6160,
      vertical: false,
      limiterName: 'Twitch',
      limiterKbps: 6000,
    })
    expect(three?.line).toBe('3 places x 6.2 Mbps = 18 Mbps upload')
    expect(three?.detail).toContain('separate copy')
    expect(three?.detail).toContain('Twitch')

    const one = describeUploadNeed([youtube], {
      planKbps: 6160,
      vertical: false,
    })
    expect(one?.line).toBe('1 place x 6.2 Mbps = 6.2 Mbps upload')

    const none = describeUploadNeed([], { planKbps: 6160, vertical: false })
    expect(none).toBeNull()
  })
})
