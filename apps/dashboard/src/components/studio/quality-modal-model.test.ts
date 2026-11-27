import { describe, expect, it } from 'vitest'
import type {
  DestinationQualityOptions,
  DestinationView,
  GoLiveQualityOptionsResponse,
} from '@ferrocast/api'
import {
  buildMatchMainComparison,
  buildModalModel,
  buildQualitySummaryText,
  clampDraftToHardLimits,
  evaluateModalDraft,
  formatEditorHeaderStatus,
  initialDraftFromModel,
  mapQualityApiError,
  toDestinationQualityPayload,
} from './quality-modal-model'

function makeDest(overrides: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'twitch',
    kind: 'twitch',
    canvas: 'main',
    name: 'Twitch',
    account: 'streamer',
    enabled: true,
    connected: true,
    health: null,
    blocked: null,
    rules: [],
    issues: [],
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
      group_id: 'g-tw',
      shared_with: [],
    },
    ...overrides,
  }
}

function makeOpts(overrides: Partial<DestinationQualityOptions> = {}): DestinationQualityOptions {
  return {
    id: 'twitch',
    canvas: 'main',
    locked_reason: null,
    current: { mode: 'same_as_main' },
    resolved: {
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 6000,
      codec: 'h264',
      audio_kbps: 160,
      auto_fitted: true,
      separate_encode: true,
      group_id: 'g-tw',
      shared_with: [],
    },
    options: [
      {
        id: 'same_as_main',
        label: 'Same as main',
        quality: { mode: 'same_as_main' },
        resolved: { width: 2560, height: 1440, fps: 60, kbps: 6000, codec: 'h264' },
        auto_fitted: true,
        recommended: true,
        note: "Above Twitch's recommended 1080p",
        shares_encoder_with: [],
        allowed: true,
        disabled_reason: null,
      },
      {
        id: '1080p60',
        label: '1080p60 · 6 Mbps',
        quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
        resolved: { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
        auto_fitted: false,
        recommended: true,
        note: null,
        shares_encoder_with: [],
        allowed: true,
        disabled_reason: null,
      },
    ],
    custom_limits: {
      max_width: 2560,
      max_height: 1440,
      min_kbps: 500,
      max_kbps: 6000,
      fps_choices: [24, 30, 48, 60],
      codecs: ['h264'],
      recommended_width: 1920,
      recommended_height: 1080,
      recommended_fps: 60,
      recommended_kbps: 6000,
    },
    ...overrides,
  }
}

const RESPONSE_BASE: GoLiveQualityOptionsResponse = {
  source: 'studio',
  main: { width: 2560, height: 1440, fps: 60, kbps: 16000, codec: 'h264', audio_kbps: 160 },
  vertical: { width: 1080, height: 1920, fps: 60, kbps: 6000, codec: 'h264', audio_kbps: 160 },
  budget: {
    status: 'ok',
    source: 'apple_silicon',
    used_mpx_s: 120,
    limit_mpx_s: 400,
    used_sessions: 2,
    max_sessions: 4,
  },
  destinations: {},
}

describe('quality-modal-model (Modal A limits, clamping, budget, and API errors)', () => {
  it('builds resolution chips with soft dots from options.note and hard locks from custom_limits', () => {
    const twitchModel = buildModalModel({
      dest: makeDest(),
      destOpts: makeOpts(),
      response: RESPONSE_BASE,
    })
    const res1440 = twitchModel.resolutions.find((r) => r.short === 1440)
    expect(res1440).toMatchObject({ state: 'soft', label: '1440p' })
    expect(twitchModel.softNoteThresholdShort).toBe(1440)
    expect(twitchModel.bitrateRangeMaxKbps).toBeGreaterThan(6000)

    const kickModel = buildModalModel({
      dest: makeDest({ id: 'kick', kind: 'kick', name: 'Kick' }),
      destOpts: makeOpts({
        id: 'kick',
        options: [],
        custom_limits: {
          max_width: 1920,
          max_height: 1080,
          min_kbps: 500,
          max_kbps: 8000,
          fps_choices: [24, 30, 60],
          codecs: ['h264'],
          recommended_width: 1920,
          recommended_height: 1080,
          recommended_fps: 60,
          recommended_kbps: 8000,
        },
      }),
      response: RESPONSE_BASE,
    })
    expect(kickModel.resolutions.find((r) => r.short === 1440)).toMatchObject({ state: 'hard' })
    expect(kickModel.resolutions.find((r) => r.short === 1080)).toMatchObject({ state: 'ok' })
  })

  it('builds portrait resolution chips and locks FPS above platform fps_choices when main fps is higher', () => {
    const verticalDest = makeDest({
      id: 'ig',
      kind: 'custom',
      canvas: 'vertical',
      name: 'Instagram',
    })
    const model = buildModalModel({
      dest: verticalDest,
      destOpts: makeOpts({
        id: 'ig',
        canvas: 'vertical',
        options: [],
        custom_limits: {
          max_width: 1080,
          max_height: 1920,
          min_kbps: 500,
          max_kbps: 6000,
          fps_choices: [24, 30],
          codecs: ['h264'],
          recommended_width: 720,
          recommended_height: 1280,
          recommended_fps: 30,
          recommended_kbps: 3500,
        },
      }),
      response: RESPONSE_BASE,
    })
    expect(model.resolutions.map((r) => `${r.width}x${r.height}`)).toContain('1080x1920')
    expect(model.fpsOptions.find((f) => f.fps === 60)).toMatchObject({ fps: 60, locked: true })
    expect(model.fpsOptions.find((f) => f.fps === 30)).toMatchObject({ fps: 30, locked: false })
  })

  it('flags typed bitrate above hard limit as blocked and provides one-tap clamp fix', () => {
    const dest = makeDest()
    const opts = makeOpts()
    const modal = buildModalModel({ dest, destOpts: opts, response: RESPONSE_BASE })

    const evaluation = evaluateModalDraft(
      modal,
      {
        matchMain: false,
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 8000,
      },
      {
        dest,
        allDestinations: [dest],
        live: true,
      },
    )

    expect(evaluation.hardLimit).toMatchObject({
      reason: 'Twitch closes streams above 6 Mbps.',
      fixLabel: 'Use 1080p60 · 6 Mbps',
    })
    expect(evaluation.canApply).toBe(false)
    expect(evaluation.footerCopy).toBe('Switches only Twitch. Your stream keeps going.')

    const fixed = clampDraftToHardLimits(modal, {
      matchMain: false,
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 8000,
    })
    expect(fixed.kbps).toBe(6000)
  })

  it('evaluates soft limit note while keeping Apply allowed', () => {
    const dest = makeDest()
    const opts = makeOpts()
    const modal = buildModalModel({ dest, destOpts: opts, response: RESPONSE_BASE })

    const evaluation = evaluateModalDraft(
      modal,
      {
        matchMain: false,
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 6000,
      },
      {
        dest,
        allDestinations: [dest],
        live: false,
      },
    )

    expect(evaluation.hardLimit).toBeNull()
    expect(evaluation.softNote).toContain('recommended 1080p')
    expect(evaluation.canApply).toBe(true)
    expect(evaluation.footerCopy).toBe('Applies from your next stream.')
  })

  it('detects encode sharing with peer and detects PC encode budget exhaustion with one-tap Match fix', () => {
    const kick = makeDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
      resolved_quality: {
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: true,
        group_id: 'g-shared',
        shared_with: [],
      },
    })
    const yt = makeDest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
      resolved_quality: {
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: true,
        group_id: 'g-shared',
        shared_with: ['Kick'],
      },
    })
    const response: GoLiveQualityOptionsResponse = {
      ...RESPONSE_BASE,
      budget: {
        status: 'ok',
        source: 'apple_silicon',
        used_mpx_s: 200,
        limit_mpx_s: 400,
        used_sessions: 2,
        max_sessions: 2,
      },
    }
    const ytOpts = makeOpts({
      id: 'youtube',
      current: yt.quality!,
      resolved: yt.resolved_quality!,
      options: [],
      custom_limits: {
        max_width: 3840,
        max_height: 2160,
        min_kbps: 500,
        max_kbps: 51000,
        fps_choices: [24, 30, 50, 60],
        codecs: ['h264', 'hevc', 'av1'],
        recommended_width: 1920,
        recommended_height: 1080,
        recommended_fps: 60,
        recommended_kbps: 12000,
      },
    })

    const modal = buildModalModel({ dest: yt, destOpts: ytOpts, response })
    const sharingEval = evaluateModalDraft(
      modal,
      {
        matchMain: false,
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
      },
      {
        dest: yt,
        allDestinations: [kick, yt],
        live: true,
      },
    )
    expect(sharingEval.sharesWith).toEqual(['Kick'])
    expect(sharingEval.budgetExceeded).toBeNull()

    // Changing YouTube away from the shared encode exceeds max_sessions = 2 (main + shared + new YT = 3 > 2).
    const splitEval = evaluateModalDraft(
      modal,
      {
        matchMain: false,
        width: 2560,
        height: 1440,
        fps: 50,
        kbps: 12000,
      },
      {
        dest: yt,
        allDestinations: [
          kick,
          makeDest({
            id: 'main-tw',
            name: 'MainPeer',
            enabled: true,
            resolved_quality: {
              ...kick.resolved_quality!,
              width: 3840,
              height: 2160,
              group_id: 'g-other',
              separate_encode: true,
            },
          }),
          yt,
        ],
        live: true,
      },
    )
    expect(splitEval.budgetExceeded).toMatchObject({
      maxSessions: 2,
      matchLabel: 'Match Kick · 1080p60 · 6 Mbps',
    })
    expect(splitEval.canApply).toBe(false)
  })

  it('maps specific engine error codes clearly for golive_quality_locked, platform_limit_exceeded, encode_budget_exceeded, golive_switch_timeout', () => {
    expect(mapQualityApiError('golive_quality_locked', 'Turn OBS off first.', null)).toMatchObject({
      kind: 'locked',
      retryable: false,
    })
    expect(
      mapQualityApiError('platform_limit_exceeded', 'Kick max is 8000 kbps.', null),
    ).toMatchObject({
      kind: 'limit',
      canClamp: true,
    })
    expect(mapQualityApiError('encode_budget_exceeded', 'Too many encodes.', null)).toMatchObject({
      kind: 'budget',
    })
    expect(mapQualityApiError('golive_switch_timeout', 'Switch timed out.', null)).toMatchObject({
      kind: 'timeout',
      retryable: true,
    })
  })

  it('builds Match main comparison for Twitch 1440p60 16M -> 1440p60 6M + soft tip Use 1080p60', () => {
    const response1440: GoLiveQualityOptionsResponse = {
      ...RESPONSE_BASE,
      main: {
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 16000,
        codec: 'h264',
        audio_kbps: 160,
      },
    }
    const twitch = makeDest({
      id: 'twitch',
      kind: 'twitch',
      name: 'Twitch',
      quality: { mode: 'same_as_main' },
      resolved_quality: {
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: true,
        separate_encode: true,
        group_id: 'g-tw',
        shared_with: [],
      },
    })
    const opts = makeOpts({
      resolved: twitch.resolved_quality!,
      options: [
        {
          id: 'same_as_main',
          label: 'Same as main',
          quality: { mode: 'same_as_main' },
          resolved: { width: 2560, height: 1440, fps: 60, kbps: 6000, codec: 'h264' },
          auto_fitted: true,
          recommended: false,
          note: "Above Twitch's recommended 1080p",
          shares_encoder_with: [],
          allowed: true,
          disabled_reason: null,
        },
      ],
    })
    const modal = buildModalModel({ dest: twitch, destOpts: opts, response: response1440 })
    const cmp = buildMatchMainComparison(modal)

    expect(cmp.switchMatchLabel).toBe('Match main stream')
    expect(cmp.base).toMatchObject({
      resFps: '1440p60',
      rate: '16 Mbps',
      dims: '2560 × 1440',
    })
    expect(cmp.fitted).toMatchObject({
      resFps: '1440p60',
      rate: '6 Mbps',
      dims: '2560 × 1440',
    })
    expect(cmp.resCut).toBe(false)
    expect(cmp.fpsCut).toBe(false)
    expect(cmp.rateCut).toBe(true)
    expect(cmp.sharedCap).toBeNull()
    expect(cmp.reasons).toContain('Bitrate capped at 6 Mbps, Twitch’s limit.')
    expect(cmp.reasons).toContain('Runs as its own encode. Your recording keeps 1440p60.')
    expect(cmp.softTip).not.toBeNull()
    expect(cmp.softTip?.text).toContain('1080p60 is sharper')
    expect(cmp.softTip?.actionLabel).toBe('Use 1080p60')
    expect(cmp.softTip?.targetDraft).toEqual({
      matchMain: false,
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 6000,
    })
  })

  it('builds Match main comparison for Kick (1080p60 8M) and YouTube (same as main)', () => {
    const response1440: GoLiveQualityOptionsResponse = {
      ...RESPONSE_BASE,
      main: {
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 16000,
        codec: 'h264',
        audio_kbps: 160,
      },
    }
    const kick = makeDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      enabled: false,
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
        group_id: 'g-kick',
        shared_with: [],
      },
    })
    const kickOpts = makeOpts({
      id: 'kick',
      resolved: kick.resolved_quality!,
      options: [
        {
          id: 'same_as_main',
          label: 'Same as main',
          quality: { mode: 'same_as_main' },
          resolved: { width: 1920, height: 1080, fps: 60, kbps: 8000, codec: 'h264' },
          auto_fitted: true,
          recommended: true,
          note: null,
          shares_encoder_with: [],
          allowed: true,
          disabled_reason: null,
        },
      ],
      custom_limits: {
        max_width: 1920,
        max_height: 1080,
        min_kbps: 500,
        max_kbps: 8000,
        fps_choices: [30, 60],
        codecs: ['h264'],
        recommended_width: 1920,
        recommended_height: 1080,
        recommended_fps: 60,
        recommended_kbps: 8000,
      },
    })
    const kickModal = buildModalModel({ dest: kick, destOpts: kickOpts, response: response1440 })
    const kickCmp = buildMatchMainComparison(kickModal)
    expect(kickCmp.fitted).toMatchObject({
      resFps: '1080p60',
      rate: '8 Mbps',
      dims: '1920 × 1080',
    })
    expect(kickCmp.resCut).toBe(true)
    expect(kickCmp.rateCut).toBe(true)
    expect(kickCmp.reasons).toContain('Size lowered to 1080p, Kick’s limit.')
    expect(kickCmp.reasons).toContain('Bitrate capped at 8 Mbps, Kick’s limit.')
    expect(kickCmp.reasons).toContain('Runs as its own encode. Your recording keeps 1440p60.')
    expect(kickCmp.softTip).toBeNull()

    const yt = makeDest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      quality: { mode: 'same_as_main' },
      resolved_quality: {
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 16000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: false,
        group_id: 'main',
        shared_with: [],
      },
    })
    const ytOpts = makeOpts({
      id: 'youtube',
      resolved: yt.resolved_quality!,
      options: [
        {
          id: 'same_as_main',
          label: 'Same as main',
          quality: { mode: 'same_as_main' },
          resolved: { width: 2560, height: 1440, fps: 60, kbps: 16000, codec: 'h264' },
          auto_fitted: false,
          recommended: true,
          note: null,
          shares_encoder_with: [],
          allowed: true,
          disabled_reason: null,
        },
      ],
      custom_limits: {
        max_width: 3840,
        max_height: 2160,
        min_kbps: 500,
        max_kbps: 51000,
        fps_choices: [24, 30, 60],
        codecs: ['h264', 'hevc', 'av1'],
        recommended_width: 2560,
        recommended_height: 1440,
        recommended_fps: 60,
        recommended_kbps: 16000,
      },
    })
    const ytModal = buildModalModel({ dest: yt, destOpts: ytOpts, response: response1440 })
    const ytCmp = buildMatchMainComparison(ytModal)
    expect(ytCmp.anyCut).toBe(false)
    expect(ytCmp.reasons).toEqual(['Exactly the same picture, no extra work for your PC.'])
    expect(ytCmp.softTip).toBeNull()
  })

  it('uses vertical base and portrait dimensions for Shorts even if response.vertical is absent', () => {
    const shorts = makeDest({
      id: 'youtube_shorts',
      kind: 'youtube',
      canvas: 'vertical',
      name: 'YouTube Shorts',
      quality: { mode: 'same_as_main' },
      resolved_quality: {
        width: 1080,
        height: 1920,
        fps: 30,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: false,
        group_id: 'vertical',
        shared_with: [],
      },
    })
    const modelNoVertical = buildModalModel({
      dest: shorts,
      destOpts: makeOpts({
        id: 'youtube_shorts',
        canvas: 'vertical',
        resolved: shorts.resolved_quality!,
        options: [
          {
            id: 'same_as_main',
            label: 'Same as main',
            quality: { mode: 'same_as_main' },
            resolved: { width: 1080, height: 1920, fps: 30, kbps: 6000, codec: 'h264' },
            auto_fitted: false,
            recommended: true,
            note: null,
            shares_encoder_with: [],
            allowed: true,
            disabled_reason: null,
          },
        ],
        custom_limits: {
          max_width: 1080,
          max_height: 1920,
          min_kbps: 500,
          max_kbps: 15000,
          fps_choices: [24, 30, 60],
          codecs: ['h264', 'hevc'],
          recommended_width: 1080,
          recommended_height: 1920,
          recommended_fps: 30,
          recommended_kbps: 6000,
        },
      }),
      response: { ...RESPONSE_BASE, vertical: null },
    })
    const cmp = buildMatchMainComparison(modelNoVertical)
    expect(cmp.switchMatchLabel).toBe('Match vertical picture')
    expect(cmp.baseLabel).toBe('Vertical picture')
    expect(cmp.base.dims).toBe('1080 × 1920')
    expect(modelNoVertical.resolutions.map((r) => `${r.width}x${r.height}`)).toEqual([
      '1080x1920',
      '720x1280',
      '540x960',
    ])
  })

  it('shows engine shared-cap message when encode budget is full', () => {
    const ytFull = makeDest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'Shared cap: 1080p60 · 6 Mbps',
        detail:
          'Your PC can run 1 stream encode at once; lower main quality or turn off a platform.',
      },
      resolved_quality: {
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: true,
        separate_encode: false,
        group_id: 'main',
        shared_with: ['Twitch', 'Kick'],
      },
    })
    const modal = buildModalModel({
      dest: ytFull,
      destOpts: makeOpts({
        id: 'youtube',
        resolved: ytFull.resolved_quality!,
        options: [
          {
            id: 'same_as_main',
            label: 'Same as main',
            quality: { mode: 'same_as_main' },
            resolved: { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
            auto_fitted: true,
            recommended: false,
            note: null,
            shares_encoder_with: ['Twitch', 'Kick'],
            allowed: false,
            disabled_reason: 'PC encode budget exceeded',
          },
        ],
      }),
      response: {
        ...RESPONSE_BASE,
        budget: {
          status: 'over',
          source: 'apple_silicon',
          used_mpx_s: 360,
          limit_mpx_s: 200,
          used_sessions: 1,
          max_sessions: 1,
        },
      },
    })
    const cmp = buildMatchMainComparison(modal)
    expect(cmp.sharedCap).not.toBeNull()
    expect(cmp.sharedCap?.detail).toContain(
      'Your PC can run 1 stream encode at once; lower main quality or turn off a platform.',
    )
    expect(cmp.reasons.join(' ')).not.toContain('Runs as its own encode')
  })

  it('reports Live now only when that specific platform is live, and Off / Not live otherwise', () => {
    const liveTwitch = makeDest({
      enabled: true,
      connected: true,
      health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
    })
    const offKick = makeDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      enabled: false,
      connected: true,
      health: null,
    })
    const reconnectingKick = makeDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      enabled: true,
      connected: true,
      health: {
        state: 'reconnecting',
        attempt: 1,
        retry_in_ms: 2000,
        reason: "Kick's server didn't answer.",
        kbps: 0,
        dropped: 0,
        since_ms: 100,
      },
    })
    expect(formatEditorHeaderStatus(liveTwitch, true)).toMatchObject({
      text: 'Live now',
      tone: 'live',
    })
    expect(formatEditorHeaderStatus(offKick, true)).toMatchObject({
      text: 'Off',
      tone: 'muted',
    })
    expect(formatEditorHeaderStatus(liveTwitch, false)).toMatchObject({
      text: 'Not live',
      tone: 'muted',
    })
    expect(formatEditorHeaderStatus(reconnectingKick, true)).toMatchObject({
      text: 'Reconnecting',
      tone: 'work',
    })
  })

  it('keeps row summary text, draft mode switch payloads, and editor evaluation in agreement', () => {
    const initial = makeDest({
      id: 'twitch',
      quality: { mode: 'same_as_main' },
      resolved_quality: {
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: true,
        separate_encode: true,
        group_id: 'g-tw',
        shared_with: [],
      },
    })
    expect(buildQualitySummaryText(initial, false)).toBe('1440p60 · 6 Mbps · auto')

    const customDraft = {
      matchMain: false,
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 6000,
    }
    expect(toDestinationQualityPayload(customDraft)).toEqual({
      mode: 'custom',
      width: 1920,
      height: 1080,
      fps: 60,
      kbps: 6000,
      codec: null,
    })
    expect(toDestinationQualityPayload({ ...customDraft, matchMain: true })).toEqual({
      mode: 'same_as_main',
    })

    const updatedDest: DestinationView = {
      ...initial,
      quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: null },
      resolved_quality: {
        ...initial.resolved_quality!,
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        auto_fitted: false,
      },
    }
    const updatedModel = buildModalModel({
      dest: updatedDest,
      destOpts: makeOpts({
        current: updatedDest.quality!,
        resolved: updatedDest.resolved_quality!,
      }),
      response: RESPONSE_BASE,
    })
    const updatedDraft = initialDraftFromModel(updatedModel)
    const updatedEval = evaluateModalDraft(updatedModel, updatedDraft, {
      dest: updatedDest,
      allDestinations: [updatedDest],
      live: false,
    })
    expect(buildQualitySummaryText(updatedDest, false)).toBe('1080p60 · 6 Mbps')
    expect(`${updatedEval.effective.height}p${updatedEval.effective.fps}`).toBe('1080p60')
    expect(updatedEval.effective.kbps).toBe(6000)
    expect(updatedEval.isDirty).toBe(false)
  })
})
