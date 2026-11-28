import { describe, expect, it } from 'vitest'
import type { DestinationQualityOptions, DestinationView, GoLiveView } from '@ferrocast/api'
import { buildDestinationRowVM, buildGoLiveDockVM } from './golive-list-model'

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
      group_id: 'g-twitch',
      shared_with: [],
    },
    switching_quality: false,
    quality_note: null,
    ...overrides,
  }
}

function makeView(overrides: Partial<GoLiveView> = {}): GoLiveView {
  return {
    ingest: 'rtmp://127.0.0.1:1935/live',
    obs: {
      connected: false,
      points_here: false,
      streaming: false,
      before: null,
      aitum: null,
      vertical: null,
    },
    live: false,
    stats: {
      kbps: 0,
      keyframe_interval_ms: null,
      video_codec: null,
      width: null,
      height: null,
      fps: null,
    },
    vertical_live: false,
    vertical_stats: {
      kbps: 0,
      keyframe_interval_ms: null,
      video_codec: null,
      width: null,
      height: null,
      fps: null,
    },
    encode_groups: [
      {
        id: 'main',
        canvas: 'main',
        width: 2560,
        height: 1440,
        fps: 60,
        kbps: 12000,
        codec: 'h264',
        members: ['youtube'],
        live_fps: 60,
        live_kbps: 12160,
        dropped_frames: 0,
        encode_ms: 1.8,
      },
      {
        id: 'g-twitch',
        canvas: 'main',
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 6000,
        codec: 'h264',
        members: ['twitch'],
        live_fps: 60,
        live_kbps: 6160,
        dropped_frames: 0,
        encode_ms: 1.2,
      },
    ],
    encode_budget: {
      status: 'ok',
      source: 'apple_silicon',
      used_mpx_s: 120,
      limit_mpx_s: 400,
      used_sessions: 2,
      max_sessions: 4,
    },
    destinations: [
      makeDest(),
      makeDest({
        id: 'youtube',
        kind: 'youtube',
        name: 'YouTube',
        account: 'yt-chan',
        resolved_quality: {
          width: 2560,
          height: 1440,
          fps: 60,
          kbps: 12000,
          codec: 'h264',
          audio_kbps: 160,
          auto_fitted: false,
          separate_encode: false,
          group_id: 'main',
          shared_with: [],
        },
      }),
      makeDest({
        id: 'kick',
        kind: 'kick',
        name: 'Kick',
        account: 'kick-user',
        enabled: false,
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
          group_id: 'g-kick',
          shared_with: [],
        },
      }),
    ],
    upload: null,
    protect: true,
    aitum_ok: false,
    auto_quality: true,
    cut: {
      source: 'canvas',
      config: {
        layout: 'camera_top',
        camera: { x: 0, y: 0, w: 0.3, h: 0.3 },
        game: { x: 0, y: 0, w: 1, h: 1 },
        camera_share: 35,
        width: 1080,
        height: 1920,
        fps: 30,
        kbps: 4500,
        encoder: 'auto',
      },
      state: null,
      ffmpeg: { state: 'ready' },
    },
    advanced: {
      rules: {
        slow_pct: 70,
        trouble_s: 4,
        calm_s: 10,
        first_pause_s: 60,
        max_pause_s: 600,
        first_to_pause: null,
      },
      keep_free_pct: 20,
      port: 1935,
      per: {},
    },
    ...overrides,
  }
}

const TWITCH_OPTS: DestinationQualityOptions = {
  id: 'twitch',
  canvas: 'main',
  locked_reason: null,
  current: { mode: 'same_as_main' },
  resolved: makeDest().resolved_quality!,
  options: [
    {
      id: 'same_as_main',
      label: 'Same as main',
      quality: { mode: 'same_as_main' },
      resolved: { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
      auto_fitted: true,
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
    fps_choices: [30, 60],
    codecs: ['h264'],
    recommended_width: 1920,
    recommended_height: 1080,
    recommended_fps: 60,
    recommended_kbps: 6000,
  },
}

describe('golive-list-model (List 3b API state mapping)', () => {
  it('maps live healthy destinations to LIVE tag, quality line 2, and upload bar shares', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: { state: 'live', kbps: 12160, dropped: 0, since_ms: 1000 },
          resolved_quality: {
            width: 2560,
            height: 1440,
            fps: 60,
            kbps: 12000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: false,
            group_id: 'main',
            shared_with: [],
          },
        }),
        makeDest({ id: 'kick', kind: 'kick', name: 'Kick', enabled: false }),
      ],
    })

    const vm = buildGoLiveDockVM(view, {
      usesObs: false,
      qualityOptionsById: { twitch: TWITCH_OPTS },
    })

    expect(vm.mainRows[0]).toMatchObject({
      tagKind: 'live',
      tagLabel: 'LIVE',
      pipTone: 'live',
      line2: { kind: 'quality', text: '1080p60 · 6 Mbps · auto' },
    })
    expect(vm.mainRows[1]).toMatchObject({
      tagKind: 'live',
      tagLabel: 'LIVE',
      pipTone: 'live',
      line2: { kind: 'quality', text: 'Same as main' },
    })
    expect(vm.mainRows[2]).toMatchObject({
      tagKind: 'off',
      tagLabel: 'OFF',
      pipTone: 'off',
      barDimmed: true,
    })
    expect(vm.mainRows[1]!.barPct).toBeGreaterThan(vm.mainRows[0]!.barPct)
    expect(vm.footer).toMatchObject({
      mode: 'summary',
      problems: [],
    })
  })

  it('maps disconnected offline to OFF + Connect popover and disconnected-while-live to ERROR + Reconnect', () => {
    const offlineView = makeView({
      live: false,
      destinations: [
        makeDest({ enabled: false, connected: false, blocked: 'Connect Twitch first.' }),
      ],
    })
    const offVm = buildGoLiveDockVM(offlineView, { usesObs: false, qualityOptionsById: {} })
    expect(offVm.mainRows[0]).toMatchObject({
      tagKind: 'off',
      tagLabel: 'OFF',
      pipTone: 'off',
      line2: { kind: 'status', tone: 'muted', text: 'Not connected · Connect' },
      popover: {
        title: "Twitch isn't connected",
        primaryAction: { kind: 'connect', label: 'Connect' },
      },
    })

    const discView = makeView({
      live: true,
      destinations: [
        makeDest({ enabled: true, connected: false, blocked: 'Sign-in expired.' }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: { state: 'live', kbps: 12160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const discVm = buildGoLiveDockVM(discView, { usesObs: false, qualityOptionsById: {} })
    expect(discVm.mainRows[0]).toMatchObject({
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      line2: { kind: 'status', tone: 'error', text: 'Disconnected' },
      popover: {
        title: 'Twitch disconnected',
        primaryAction: { kind: 'connect', label: 'Reconnect' },
      },
    })
  })

  it('maps switching_quality with optional optimistic target to SWITCHING state without inventing targets', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          switching_quality: true,
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })

    const withTarget = buildDestinationRowVM(view.destinations[0]!, view, {
      usesObs: false,
      maxUploadKbps: 6160,
      switchingTarget: '720p30 · 3 Mbps',
    })
    expect(withTarget).toMatchObject({
      tagKind: 'switching',
      tagLabel: 'SWITCHING',
      pipTone: 'work',
      line2: { kind: 'status', tone: 'work', spinner: true, text: 'Switching to 720p30 · 3 Mbps…' },
      popover: {
        title: 'Switching Twitch',
        primaryAction: null,
      },
    })

    const withoutTarget = buildDestinationRowVM(view.destinations[0]!, view, {
      usesObs: false,
      maxUploadKbps: 6160,
    })
    expect(withoutTarget.line2).toMatchObject({
      kind: 'status',
      tone: 'work',
      spinner: true,
      text: 'Switching quality…',
    })
  })

  it('maps reconnecting without hallucinated max attempts and uses non-422 popover action', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          health: {
            state: 'reconnecting',
            attempt: 2,
            retry_in_ms: 4200,
            reason: 'Twitch dropped the connection.',
            kbps: 0,
            dropped: 0,
            since_ms: 1000,
          },
        }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: { state: 'live', kbps: 12160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    const row = vm.mainRows[0]!
    expect(row).toMatchObject({
      tagKind: 'reconnecting',
      tagLabel: 'RECONNECTING',
      pipTone: 'warn',
      rowTint: 'warn',
      line2: { kind: 'status', tone: 'warn', spinner: true, text: 'Reconnecting · try 2' },
    })
    expect(row.line2.kind === 'status' ? row.line2.text : '').not.toContain('/5')
    expect(row.popover?.body).toContain('in 4 s')
    expect(row.popover?.primaryAction?.kind).toBe('test_connection')
    expect(vm.footer).toMatchObject({
      mode: 'summary',
      problemLinkText: '1 reconnecting',
      problemLinkTone: 'warn',
    })
  })

  it('maps failed push to ERROR with Retry (resume) and promotes all-failed live stream to compact footer strip', () => {
    const singleFailView = makeView({
      live: true,
      destinations: [
        makeDest({
          health: {
            state: 'failed',
            attempts: 3,
            reason: 'Stream key was not accepted.',
            detail: 'Twitch closed on publish.',
            kbps: 0,
            dropped: 0,
            since_ms: 1000,
          },
        }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: { state: 'live', kbps: 12160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vmSingle = buildGoLiveDockVM(singleFailView, { usesObs: false, qualityOptionsById: {} })
    expect(vmSingle.mainRows[0]).toMatchObject({
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      rowTint: 'error',
      line2: { kind: 'status', tone: 'error', text: 'Stream key was not accepted.' },
      popover: {
        body: 'Twitch closed on publish.',
        primaryAction: { kind: 'retry', label: 'Retry' },
      },
    })
    expect(vmSingle.footer).toMatchObject({
      mode: 'summary',
      problemLinkText: '1 problem',
      problemLinkTone: 'error',
    })

    const allFailView = makeView({
      live: true,
      destinations: [
        makeDest({
          health: {
            state: 'failed',
            attempts: 3,
            reason: "Couldn't connect",
            kbps: 0,
            dropped: 0,
            since_ms: 1000,
          },
        }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: {
            state: 'failed',
            attempts: 3,
            reason: "Couldn't connect",
            kbps: 0,
            dropped: 0,
            since_ms: 1000,
          },
        }),
      ],
    })
    const vmAll = buildGoLiveDockVM(allFailView, { usesObs: false, qualityOptionsById: {} })
    expect(vmAll.footer).toMatchObject({
      mode: 'strip',
      text: 'Nothing is sending',
      action: { kind: 'retry_all', label: 'Retry all' },
    })
  })

  it('maps vertical cut FFmpeg downloading with real percent to SWITCHING on vertical destination', () => {
    const view = makeView({
      vertical_live: true,
      cut: {
        source: 'cut',
        config: {
          layout: 'camera_top',
          camera: { x: 0, y: 0, w: 0.3, h: 0.3 },
          game: { x: 0, y: 0, w: 1, h: 1 },
          camera_share: 35,
          width: 1080,
          height: 1920,
          fps: 30,
          kbps: 4500,
          encoder: 'auto',
        },
        state: null,
        ffmpeg: { state: 'downloading', percent: 42 },
      },
      destinations: [
        makeDest(),
        makeDest({
          id: 'yt-shorts',
          kind: 'youtube',
          canvas: 'vertical',
          name: 'YouTube Shorts',
          enabled: true,
          health: { state: 'connecting', kbps: 0, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    expect(vm.verticalRows[0]).toMatchObject({
      tagKind: 'switching',
      tagLabel: 'SWITCHING',
      pipTone: 'work',
      barPct: 42,
      line2: { kind: 'status', tone: 'work', spinner: true, text: 'FFmpeg downloading 42%' },
    })
  })

  it('maps custom soft-limit note while keeping same_as_main clean and maps hard issues to ERROR with one-tap clamp', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          quality: {
            mode: 'custom',
            width: 2560,
            height: 1440,
            fps: 60,
            kbps: 6000,
            codec: 'h264',
          },
          quality_note: "Above Twitch's recommended 1080p",
          resolved_quality: {
            width: 2560,
            height: 1440,
            fps: 60,
            kbps: 6000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: true,
            group_id: 'g-tw',
            shared_with: [],
          },
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
        makeDest({
          id: 'kick',
          kind: 'kick',
          name: 'Kick',
          quality: {
            mode: 'custom',
            width: 1920,
            height: 1080,
            fps: 60,
            kbps: 10000,
            codec: 'h264',
          },
          resolved_quality: {
            width: 1920,
            height: 1080,
            fps: 60,
            kbps: 10000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: true,
            group_id: 'g-kick',
            shared_with: [],
          },
          issues: [
            {
              code: 'bitrate',
              summary: "Over Kick's 8 Mbps limit",
              detail: 'Kick takes up to 8 Mbps video.',
              fix_kbps: 8000,
            },
          ],
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, {
      usesObs: false,
      qualityOptionsById: { twitch: TWITCH_OPTS },
    })
    expect(vm.mainRows[0]).toMatchObject({
      tagKind: 'live',
      tagLabel: 'LIVE',
      line2: { kind: 'status', tone: 'warn', text: "Above Twitch's recommended 1080p" },
      popover: {
        title: 'Not recommended',
        primaryAction: { kind: 'open_quality', label: 'Open quality' },
      },
    })
    expect(vm.mainRows[1]).toMatchObject({
      tagKind: 'error',
      tagLabel: 'ERROR',
      line2: { kind: 'status', tone: 'error', text: "Over Kick's 8 Mbps limit" },
      popover: {
        primaryAction: {
          kind: 'set_quality',
          label: 'Use 8 Mbps',
          quality: {
            mode: 'custom',
            width: 1920,
            height: 1080,
            fps: 60,
            kbps: 8000,
            codec: 'h264',
          },
        },
      },
    })
    expect(vm.footer.mode === 'summary' ? vm.footer.problems.map((p) => p.destId) : []).toEqual([
      'kick',
    ])
  })

  it('maps encode_budget over and save errors to compact footer strip + row error with Match action', () => {
    const budgetView = makeView({
      live: true,
      encode_budget: {
        status: 'over',
        source: 'apple_silicon',
        used_mpx_s: 500,
        limit_mpx_s: 400,
        used_sessions: 3,
        max_sessions: 2,
      },
      destinations: [
        makeDest({
          id: 'twitch',
          kind: 'twitch',
          name: 'Twitch',
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          quality: {
            mode: 'custom',
            width: 2560,
            height: 1440,
            fps: 50,
            kbps: 12000,
            codec: 'h264',
          },
          resolved_quality: {
            width: 2560,
            height: 1440,
            fps: 50,
            kbps: 12000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: true,
            group_id: 'g-yt',
            shared_with: [],
          },
          health: { state: 'live', kbps: 12160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vmBudget = buildGoLiveDockVM(budgetView, { usesObs: false, qualityOptionsById: {} })
    expect(vmBudget.mainRows[1]).toMatchObject({
      tagKind: 'error',
      tagLabel: 'ERROR',
      line2: { kind: 'status', tone: 'error', text: 'Too many qualities' },
      popover: {
        primaryAction: { kind: 'set_quality', label: 'Match Twitch' },
      },
    })
    expect(vmBudget.footer).toMatchObject({
      mode: 'strip',
      text: 'PC limit: 2 qualities',
      action: { kind: 'match_to_share', label: 'Match to share' },
    })

    const saveErrVm = buildGoLiveDockVM(makeView(), {
      usesObs: false,
      qualityOptionsById: {},
      saveError: 'Network down.',
    })
    expect(saveErrVm.footer).toMatchObject({
      mode: 'strip',
      text: 'Couldn’t save. Changes weren’t applied.',
      action: { kind: 'retry_save', label: 'Try again' },
    })
  })
  it('keeps the stream going when a delivering destination only has a quality problem', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
          issues: [{ code: 'bitrate', summary: 'Over the limit', detail: 'x', fix_kbps: 5000 }],
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    expect(vm.footer).not.toMatchObject({ text: 'Nothing is sending' })
    expect(vm.mainRows[0]).toMatchObject({ tagKind: 'error' })
    expect(vm.footer.mode === 'summary' ? vm.footer.problems.length : -1).toBe(1)
  })

  it('does not say nothing is sending while an unticked backup is delivering', () => {
    const failed = {
      state: 'failed' as const,
      attempts: 3,
      reason: "Couldn't connect",
      kbps: 0,
      dropped: 0,
      since_ms: 1000,
    }
    const view = makeView({
      live: true,
      destinations: [
        makeDest({ health: failed }),
        // A backup that took over, though it is not ticked.
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          enabled: false,
          health: { state: 'live', kbps: 6000, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    expect(vm.footer).not.toMatchObject({ text: 'Nothing is sending' })
    // And with the backup not delivering either, the retry stays.
    const none = makeView({
      live: true,
      destinations: [makeDest({ health: failed })],
    })
    expect(
      buildGoLiveDockVM(none, { usesObs: false, qualityOptionsById: {} }).footer,
    ).toMatchObject({ text: 'Nothing is sending', action: { kind: 'retry_all' } })
  })

  it('shows LIVE only for destinations whose own push is delivering', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({ health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 } }),
        makeDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: { state: 'waiting', kbps: 0, dropped: 0, since_ms: 0 },
        }),
        makeDest({
          id: 'kick',
          kind: 'kick',
          name: 'Kick',
          health: { state: 'stopped', kbps: 0, dropped: 0, since_ms: 0 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    expect(vm.mainRows.map((r) => r.tagKind)).toEqual(['live', 'off', 'off'])
    expect(vm.mainRows[1]!.pipTone).toBe('off')
  })

  it('does not offer Match to share with a peer that already shares the same encode', () => {
    const shared = (id: string, name: string, group: string, shareWith: string) =>
      makeDest({
        id,
        name,
        kind: 'custom',
        quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000, codec: 'h264' },
        resolved_quality: {
          width: 1280,
          height: 720,
          fps: 30,
          kbps: 3000,
          codec: 'h264',
          audio_kbps: 160,
          auto_fitted: false,
          separate_encode: true,
          group_id: group,
          shared_with: [shareWith],
        },
        health: { state: 'live', kbps: 3160, dropped: 0, since_ms: 1000 },
      })
    const view = makeView({
      live: true,
      encode_budget: {
        status: 'over',
        source: 'apple_silicon',
        used_mpx_s: 500,
        limit_mpx_s: 400,
        used_sessions: 3,
        max_sessions: 2,
      },
      destinations: [
        shared('a', 'A', 'g-ab', 'B'),
        shared('b', 'B', 'g-ab', 'A'),
        makeDest({
          id: 'c',
          name: 'C',
          kind: 'custom',
          quality: {
            mode: 'custom',
            width: 1920,
            height: 1080,
            fps: 60,
            kbps: 6000,
            codec: 'h264',
          },
          resolved_quality: {
            ...makeDest().resolved_quality!,
            auto_fitted: false,
            group_id: 'g-c',
          },
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    // A shares its encode with B: moving A to C would leave both encodes running, so no match is
    // offered, only Manage.
    expect(vm.footer).toMatchObject({ mode: 'strip', action: { kind: 'manage' } })

    // With A alone in its encode, matching another encode does retire one.
    const alone = makeView({
      ...view,
      destinations: [
        {
          ...view.destinations[0]!,
          resolved_quality: {
            ...view.destinations[0]!.resolved_quality!,
            group_id: 'g-a',
            shared_with: [],
          },
        },
        {
          ...view.destinations[1]!,
          resolved_quality: {
            ...view.destinations[1]!.resolved_quality!,
            group_id: 'g-b',
            shared_with: [],
          },
        },
        view.destinations[2]!,
      ],
    })
    expect(
      buildGoLiveDockVM(alone, { usesObs: false, qualityOptionsById: {} }).footer,
    ).toMatchObject({
      action: { kind: 'match_to_share', destId: 'a', quality: { mode: 'custom', width: 1280 } },
    })
  })

  it('counts an unticked backup that took over as live', () => {
    const view = makeView({
      live: true,
      destinations: [
        makeDest({
          enabled: false,
          backup_for: 'youtube',
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        }),
      ],
    })
    const vm = buildGoLiveDockVM(view, { usesObs: false, qualityOptionsById: {} })
    expect(vm.mainRows[0]).toMatchObject({ tagKind: 'live' })
  })
})
