import { describe, expect, it } from 'vitest'
import type { DestinationView, EncodeBudgetCheck } from '@ferrocast/api'
import {
  describeDestinationRate,
  describeSettingsBitrates,
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

  it('gives Direct WHIP/SRT sharing a capped main encode a heldBackNote without treating them as cap limiters', () => {
    const whip = dest({
      id: 'whip_1',
      kind: 'custom',
      name: 'Studio WHIP',
      direct: 'whip',
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'B-frames off for WebRTC',
        detail: 'Low-latency WebRTC sends no B-frames.',
      },
    })
    const srt = dest({
      id: 'srt_1',
      kind: 'custom',
      name: 'Studio SRT',
      direct: 'srt',
    })
    const summary = describeStreamCap(12000, [twitch, whip, srt])
    expect(summary.capped).toBe(true)
    expect(summary.limiter?.id).toBe('twitch')
    expect(summary.heldBackIds).toContain('whip_1')
    expect(summary.heldBackIds).toContain('srt_1')

    const whipRate = describeDestinationRate(whip, summary, { videoKbps: 12000 })
    expect(whipRate.rateLabel).toBe('6.2 Mbps')
    expect(whipRate.heldBackNote?.summary).toBe('Same stream as Twitch: 6.2 Mbps')

    const srtRate = describeDestinationRate(srt, summary, { videoKbps: 12000 })
    expect(srtRate.rateLabel).toBe('6.2 Mbps')
    expect(srtRate.heldBackNote?.summary).toBe('Same stream as Twitch: 6.2 Mbps')
  })

  it('gives each tied lowest-cap main destination its own cap note when offline without engine d.capped', () => {
    const twitchTwo = dest({ id: 'twitch_2', kind: 'twitch', name: 'Twitch Alt' })
    const summary = describeStreamCap(12000, [twitch, twitchTwo, youtube])
    expect(summary.capped).toBe(true)
    expect(summary.heldBackIds).toEqual(['youtube'])

    const first = describeDestinationRate(twitch, summary, { videoKbps: 12000 })
    const second = describeDestinationRate(twitchTwo, summary, { videoKbps: 12000 })
    expect(first.ownCapNote?.summary).toBe('Capped at 6,000 kbps for Twitch')
    expect(second.ownCapNote?.summary).toBe('Capped at 6,000 kbps for Twitch Alt')
    expect(second.heldBackNote).toBeNull()
  })
})

describe('v3.8 resolved_quality, separate encodes, and settings breakdown', () => {
  const studioBudget: EncodeBudgetCheck = {
    status: 'ok',
    source: 'apple_silicon',
    used_mpx_s: 373.25,
    limit_mpx_s: 995,
    used_sessions: 3,
    max_sessions: 8,
  }

  const youtube12 = dest({
    id: 'youtube',
    kind: 'youtube',
    name: 'YouTube',
    enabled: true,
    quality: { mode: 'same_as_main' },
    resolved_quality: {
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 12000,
      codec: 'h264',
      audio_kbps: 160,
      auto_fitted: false,
      separate_encode: false,
      group_id: 'main',
      shared_with: [],
    },
  })

  const twitch6Sep = dest({
    id: 'twitch',
    kind: 'twitch',
    name: 'Twitch',
    enabled: true,
    quality: { mode: 'same_as_main' },
    resolved_quality: {
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 6000,
      codec: 'h264',
      audio_kbps: 160,
      auto_fitted: true,
      separate_encode: true,
      group_id: 'g_1',
      shared_with: [],
    },
    capped: {
      kbps: 6000,
      separate_encode: true,
      summary: 'Capped at 6,000 kbps for Twitch',
      detail: 'Twitch gets its own 6,000 kbps stream while YouTube keeps 12,000 kbps.',
    },
  })

  const kick8Sep = dest({
    id: 'kick',
    kind: 'kick',
    name: 'Kick',
    enabled: true,
    quality: { mode: 'same_as_main' },
    resolved_quality: {
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 8000,
      codec: 'h264',
      audio_kbps: 160,
      auto_fitted: true,
      separate_encode: true,
      group_id: 'g_2',
      shared_with: [],
    },
    capped: {
      kbps: 8000,
      separate_encode: true,
      summary: 'Capped at 8,000 kbps for Kick',
      detail: 'Kick gets its own 8,000 kbps stream.',
    },
  })

  it('keeps YouTube uncapped and sums real separate-encode upload rates', () => {
    const cap = describeStreamCapFromView([youtube12, twitch6Sep, kick8Sep], 12000, {
      encodeBudget: studioBudget,
      source: 'studio',
    })
    expect(cap.capped).toBe(false)
    expect(cap.effectiveVideoKbps).toBe(12000)
    expect(cap.heldBackIds).toEqual([])

    const ytRate = describeDestinationRate(youtube12, cap, { videoKbps: 12000, audioKbps: 160 })
    const twRate = describeDestinationRate(twitch6Sep, cap, { videoKbps: 12000, audioKbps: 160 })
    const kickRate = describeDestinationRate(kick8Sep, cap, { videoKbps: 12000, audioKbps: 160 })
    expect(ytRate).toMatchObject({ kbps: 12160, rateLabel: '12 Mbps', heldBackNote: null })
    expect(twRate.rateLabel).toBe('6.2 Mbps')
    expect(kickRate.rateLabel).toBe('8.2 Mbps')

    const need = describeUploadNeed([youtube12, twitch6Sep, kick8Sep], {
      planKbps: 12160,
      vertical: false,
    })
    expect(need?.line).toBe('12 Mbps + 6.2 Mbps + 8.2 Mbps = 26.4 Mbps upload')
  })

  it('explains Pass-1 coalesced group sharing without holding back YouTube', () => {
    const twitchCoalesced = {
      ...twitch6Sep,
      resolved_quality: { ...twitch6Sep.resolved_quality!, shared_with: ['Kick'] },
    }
    const kickCoalesced = dest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      enabled: true,
      quality: { mode: 'same_as_main' },
      resolved_quality: {
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: true,
        separate_encode: true,
        group_id: 'g_1',
        shared_with: ['Twitch'],
      },
    })
    const cap = describeStreamCapFromView([youtube12, twitchCoalesced, kickCoalesced], 12000, {
      source: 'studio',
    })
    expect(cap.capped).toBe(false)
    expect(describeDestinationRate(youtube12, cap, { videoKbps: 12000 }).heldBackNote).toBeNull()
    const kickRate = describeDestinationRate(kickCoalesced, cap, { videoKbps: 12000 })
    expect(kickRate.rateLabel).toBe('6.2 Mbps')
    expect(kickRate.heldBackNote?.summary).toBe('Same stream as Twitch: 6.2 Mbps')
  })

  it('honors Pass-2 shared-cap fallback when encode budget collapses to 1 session', () => {
    const ytFallback = {
      ...youtube12,
      resolved_quality: {
        ...youtube12.resolved_quality!,
        kbps: 6000,
        auto_fitted: true,
        shared_with: ['Twitch'],
      },
    }
    const twFallback = {
      ...twitch6Sep,
      resolved_quality: {
        ...twitch6Sep.resolved_quality!,
        separate_encode: false,
        group_id: 'main',
        shared_with: ['YouTube'],
      },
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'Capped at 6,000 kbps for Twitch',
        detail: 'Shared fallback.',
      },
    }
    const cap = describeStreamCapFromView([ytFallback, twFallback], 12000, {
      encodeBudget: { ...studioBudget, max_sessions: 1, used_sessions: 1 },
      source: 'studio',
    })
    expect(cap.capped).toBe(true)
    expect(cap.effectiveVideoKbps).toBe(6000)
    expect(cap.settingsNote).toContain('Will send 6.0 Mbps.')
    expect(describeDestinationRate(ytFallback, cap, { videoKbps: 12000 }).heldBackNote?.summary).toBe(
      'Same stream as Twitch: 6.2 Mbps',
    )
  })

  it('formats concise one-line Settings platform bitrates across caps, resolutions, custom, and empty states', () => {
    const draft1080 = { videoKbps: 12000, width: 1920, height: 1080, fps: 60 }

    expect(
      describeSettingsBitrates(draft1080, [], { encodeBudget: studioBudget, source: 'studio' }),
    ).toMatchObject({ line: null, differsFromMain: false, items: [] })

    expect(
      describeSettingsBitrates(draft1080, [twitch6Sep], {
        encodeBudget: studioBudget,
        source: 'studio',
      }),
    ).toMatchObject({ line: 'Twitch 6 Mbps (max)', differsFromMain: true })

    expect(
      describeSettingsBitrates(
        { videoKbps: 6000, width: 1920, height: 1080, fps: 60 },
        [youtube12, twitch6Sep],
        { encodeBudget: studioBudget, source: 'studio' },
      ),
    ).toMatchObject({ line: 'YouTube, Twitch 6 Mbps', differsFromMain: false })

    const multi1080 = describeSettingsBitrates(draft1080, [youtube12, twitch6Sep, kick8Sep], {
      encodeBudget: studioBudget,
      source: 'studio',
    })
    expect(multi1080.differsFromMain).toBe(true)
    expect(multi1080.line).toBe('YouTube 12 · Twitch 6 · Kick 8 Mbps')
    expect(multi1080.detail).toContain('Twitch takes at most 6 Mbps')

    const multi1440 = describeSettingsBitrates(
      { videoKbps: 18000, width: 2560, height: 1440, fps: 60 },
      [youtube12, twitch6Sep, kick8Sep],
      { encodeBudget: studioBudget, source: 'studio' },
    )
    expect(multi1440.line).toBe('YouTube 18 · Twitch 6 · Kick 8 (1080p)')

    const withCustom = describeSettingsBitrates(
      draft1080,
      [
        youtube12,
        {
          ...twitch6Sep,
          quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000 },
        },
      ],
      { encodeBudget: studioBudget, source: 'studio' },
    )
    expect(withCustom.line).toBe('YouTube 12 · Twitch 3 (720p)')

    const fallbackOne = describeSettingsBitrates(draft1080, [youtube12, twitch6Sep, kick8Sep], {
      encodeBudget: { ...studioBudget, max_sessions: 1 },
      source: 'studio',
    })
    expect(fallbackOne.line).toBe('Shared 6 Mbps (Twitch max)')

    const ignored = describeSettingsBitrates(draft1080, [youtube12, twitch6Sep, kick8Sep], {
      encodeBudget: studioBudget,
      source: 'studio',
      ignoreServiceLimits: true,
    })
    expect(ignored.line).toBe('YouTube, Twitch, Kick 12 Mbps')
    expect(ignored.differsFromMain).toBe(false)
  })
})
