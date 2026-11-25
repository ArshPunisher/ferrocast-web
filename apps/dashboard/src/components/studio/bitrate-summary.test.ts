import { describe, expect, it } from 'vitest'
import type { DestinationView } from '@ferrocast/api'
import {
  describeDestinationRate,
  describeStreamCap,
  describeStreamCapFromView,
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

  it('no cap: uncapped platforms or bitrates at/below ceiling produce no cap warning and show chosen total rate', () => {
    const ytOnly = describeStreamCap(12000, [youtube])
    expect(ytOnly.capped).toBe(false)
    expect(ytOnly.effectiveVideoKbps).toBe(12000)
    expect(ytOnly.settingsNote).toBeNull()
    expect(describeDestinationRate(youtube, ytOnly, { streamKbps: 12160 }).rateLabel).toBe(
      '12 Mbps',
    )
    expect(describeDestinationRate(youtube, ytOnly, { streamKbps: 12160 }).heldBackNote).toBeNull()

    const sharp = describeStreamCap(6000, [twitch, youtube])
    expect(sharp.capped).toBe(false)
    expect(sharp.effectiveVideoKbps).toBe(6000)
    expect(sharp.settingsNote).toBeNull()

    const enhancedTwitch = dest({ ...twitch, enhanced: true })
    const enh = describeStreamCap(12000, [enhancedTwitch, youtube])
    expect(enh.capped).toBe(false)
    expect(enh.settingsNote).toBeNull()
  })

  it('ignore_service_limits: suppresses all caps, badges, and notes everywhere', () => {
    const ignored = describeStreamCap(12000, [twitch, youtube], { ignoreServiceLimits: true })
    expect(ignored.capped).toBe(false)
    expect(ignored.effectiveVideoKbps).toBe(12000)
    expect(ignored.settingsNote).toBeNull()

    const ignoredView = describeStreamCapFromView([twitch, youtube], 12000, {
      ignoreServiceLimits: true,
    })
    expect(ignoredView.capped).toBe(false)
    expect(ignoredView.settingsNote).toBeNull()

    const twRow = describeDestinationRate(twitch, ignored, {
      streamKbps: 12160,
      videoKbps: 12000,
      audioKbps: 160,
      ignoreServiceLimits: true,
    })
    const ytRow = describeDestinationRate(youtube, ignored, {
      streamKbps: 12160,
      videoKbps: 12000,
      audioKbps: 160,
      ignoreServiceLimits: true,
    })
    expect(twRow.ownCapNote).toBeNull()
    expect(twRow.rateLabel).toBe('12 Mbps')
    expect(ytRow.heldBackNote).toBeNull()
    expect(ytRow.rateLabel).toBe('12 Mbps')
  })

  it('offline vs live wording differs honestly in Stream settings', () => {
    const offline: StreamCapSummary = describeStreamCap(12000, [twitch, youtube, ytVertical])
    expect(offline.capped).toBe(true)
    expect(offline.effectiveVideoKbps).toBe(6000)
    expect(offline.limiter?.name).toBe('Twitch')
    expect(offline.settingsNote).toBe(
      'Will send 6.0 Mbps. Twitch takes at most 6 Mbps, and every place gets the same picture. Turn Twitch off to send 12 Mbps.',
    )

    const liveSummary = describeStreamCap(12000, [twitch, youtube], { live: true })
    expect(liveSummary.settingsNote).toBe(
      'Sending 6.0 Mbps on this stream; turning Twitch off applies from your next stream. Twitch takes at most 6 Mbps, and every place gets the same picture.',
    )

    // Total send rate (6000 + 160 = 6.2 Mbps) is consistent between row rate and badge.
    const twRow = describeDestinationRate(twitch, offline, { videoKbps: 12000, audioKbps: 160 })
    expect(twRow.rateLabel).toBe('6.2 Mbps')
    expect(twRow.heldBackNote).toBeNull()

    const ytRow = describeDestinationRate(youtube, offline, { videoKbps: 12000, audioKbps: 160 })
    expect(ytRow.rateLabel).toBe('6.2 Mbps')
    expect(ytRow.heldBackNote?.summary).toBe('Same stream as Twitch: 6.2 Mbps')
    expect(ytRow.heldBackNote?.detail).toContain('Twitch')

    const vertRow = describeDestinationRate(ytVertical, offline, {
      videoKbps: 12000,
      audioKbps: 160,
      verticalKbps: 4660,
    })
    expect(vertRow.heldBackNote).toBeNull()
    expect(vertRow.rateLabel).toBe('4.7 Mbps')
  })

  it('excludes direct, lighter_for_route, light, standby_for, and blocked from shared cap', () => {
    const directWhip = dest({
      id: 'c_whip',
      kind: 'custom',
      name: 'WebRTC',
      direct: 'whip',
      capped: {
        kbps: 12000,
        separate_encode: false,
        summary: 'B-frames off for WebRTC',
        detail: "B-frames are turned off for this stream because WebRTC (WHIP) can't carry them.",
      },
    })
    const directSrt = dest({ id: 'c_srt', kind: 'custom', name: 'SRT Box', direct: 'srt' })
    const lightTwitch = dest({ ...twitch, light: true })
    const autoLightKick = dest({ ...kick, lighter_for_route: true })
    const standbyTwitch = dest({ ...twitch, standby_for: 'YouTube' })

    // WHIP B-frames notice must NEVER count as a bitrate cap even when named "WebRTC".
    expect(describeStreamCap(12000, [youtube, directWhip]).capped).toBe(false)
    expect(describeStreamCapFromView([youtube, directWhip]).capped).toBe(false)
    expect(
      describeStreamCapFromView([
        youtube,
        {
          ...directWhip,
          capped: {
            kbps: 6000,
            separate_encode: false,
            summary: 'B-frames off for WebRTC',
            detail: '',
          },
        },
      ]).capped,
    ).toBe(false)

    // direct SRT, light, lighter_for_route, standby_for, and blocked do not cap YouTube.
    expect(
      describeStreamCap(12000, [youtube, directSrt, lightTwitch, autoLightKick, standbyTwitch])
        .capped,
    ).toBe(false)

    // Light and lighter_for_route destinations use min(video_kbps, 3000) + audioKbps = 3.2 Mbps (at 12 Mbps).
    const cap = describeStreamCap(12000, [youtube])
    expect(
      describeDestinationRate(lightTwitch, cap, { videoKbps: 12000, audioKbps: 160 }).rateLabel,
    ).toBe('3.2 Mbps')
    expect(
      describeDestinationRate(autoLightKick, cap, { videoKbps: 12000, audioKbps: 160 }).rateLabel,
    ).toBe('3.2 Mbps')
    // Below 3000 (e.g. 2000 video), light stays at chosen 2000 + 160 = 2.2 Mbps.
    expect(
      describeDestinationRate(lightTwitch, describeStreamCap(2000, [youtube]), {
        videoKbps: 2000,
        audioKbps: 160,
      }).rateLabel,
    ).toBe('2.2 Mbps')
  })

  it('drops cap summary while live if cap_failed reported via bitrate issue and missing capped badge', () => {
    const capFailedTwitch = dest({
      ...twitch,
      issues: [{ code: 'bitrate', message: 'Over 6 Mbps' } as never],
    })
    const summary = describeStreamCap(12000, [capFailedTwitch, youtube], { live: true })
    expect(summary.capped).toBe(false)
    expect(summary.settingsNote).toBeNull()
  })

  it('several caps: names strictest limiter and handles offline and live tied wording', () => {
    const summary = describeStreamCap(12000, [twitch, youtube, kick])
    expect(summary.capped).toBe(true)
    expect(summary.effectiveVideoKbps).toBe(6000)
    expect(summary.limiter?.name).toBe('Twitch')
    expect(summary.settingsNote).toBe(
      'Will send 6.0 Mbps. Twitch takes at most 6 Mbps (and Kick takes at most 8 Mbps), and every place gets the same picture. Turn Twitch and Kick off to send 12 Mbps.',
    )

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
      'Will send 6.0 Mbps. Twitch and Mirror take at most 6 Mbps, and every place gets the same picture. Turn them off to send 12 Mbps.',
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

  it('reconciles upload math arithmetically using the displayed rounded per-place rate', () => {
    const three = describeUploadNeed([twitch, youtube, kick], {
      planKbps: 6160,
      vertical: false,
      limiterName: 'Twitch',
      limiterKbps: 6000,
      audioKbps: 160,
    })
    expect(three?.line).toBe('3 places x 6.2 Mbps = 18.6 Mbps upload')
    expect(three?.detail).toContain('separate copy')
    expect(three?.detail).toContain('Twitch')

    const twoUncapped = describeUploadNeed([youtube, kick], {
      planKbps: 12160,
      vertical: false,
      audioKbps: 160,
    })
    expect(twoUncapped?.line).toBe('2 places x 12 Mbps = 24 Mbps upload')

    const mixed = describeUploadNeed(
      [
        { ...twitch, kbps: 6160 },
        { ...kick, light: true, kbps: 3160 },
      ],
      {
        planKbps: 6160,
        vertical: false,
        audioKbps: 160,
      },
    )
    expect(mixed?.line).toBe('6.2 Mbps + 3.2 Mbps = 9.4 Mbps upload')

    const one = describeUploadNeed([youtube], {
      planKbps: 6160,
      vertical: false,
    })
    expect(one?.line).toBe('1 place x 6.2 Mbps = 6.2 Mbps upload')

    const none = describeUploadNeed([], { planKbps: 6160, vertical: false })
    expect(none).toBeNull()
  })
})
