import { describe, expect, it } from 'vitest'
import type { Connectors, DestinationView, ScheduledStream } from '@ferrocast/api'
import {
  buildQuickChecks,
  formatResolutionSummary,
  pickNextPlan,
  resolveStandbyPhase,
  safeThumbUrl,
} from './standby-model'

function dest(overrides: Partial<DestinationView> = {}): DestinationView {
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
    ...overrides,
  }
}

function conn(overrides: Partial<Connectors> = {}): Connectors {
  const base = {
    state: 'connected' as const,
    account: { name: 'streamer', avatar_url: null },
    detail: null,
    last_event_at: null,
  }
  const off = { state: 'disconnected' as const, account: null, detail: null, last_event_at: null }
  return {
    twitch: base,
    youtube: base,
    kick: off,
    facebook: off,
    obs: off,
    relay: off,
    ...overrides,
  }
}

describe('Studio S3 standby model', () => {
  it('resolves not_started, starting, and failed lifecycle states', () => {
    expect(resolveStandbyPhase({ available: true, starting: null, startError: null })).toBe(
      'not_started',
    )
    expect(resolveStandbyPhase({ available: true, starting: 'default', startError: null })).toBe(
      'starting',
    )
    expect(
      resolveStandbyPhase({
        available: true,
        starting: null,
        startError: { message: 'Audio device busy' },
      }),
    ).toBe('failed')
    expect(resolveStandbyPhase({ available: false, starting: null, startError: null })).toBe(
      'failed',
    )
  })

  it('allows only validated data:image URLs for standby thumbnails', () => {
    expect(safeThumbUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeThumbUrl('data:image/svg+xml;utf8,%3Csvg/%3E')).toBe(
      'data:image/svg+xml;utf8,%3Csvg/%3E',
    )
    expect(safeThumbUrl('javascript:alert(1)')).toBeNull()
    expect(safeThumbUrl('https://example.com/x.png')).toBeNull()
    expect(safeThumbUrl('')).toBeNull()
  })

  it('derives quick checks for preflight, start errors, and unique connection summaries', () => {
    const checks = buildQuickChecks({
      engineAvailable: true,
      destinations: [
        dest({ id: 'twitch', name: 'Twitch', enabled: true, connected: true }),
        dest({ id: 'youtube', name: 'YouTube', enabled: true, connected: true }),
      ],
      connectors: conn(),
      studioSettings: {
        width: 1920,
        height: 1080,
        fps: 60,
        video_kbps: 6000,
        audio_kbps: 160,
        encoder: 'hardware',
        vbr: true,
        keyframe_s: 2,
        profile: 'high',
        b_frames: false,
        scale: null,
        record_folder: null,
        record_folder_default: '/Users/demo/Movies/Ferrocast',
        record_format: 'mkv',
        record_quality: 'high',
        reconnect: true,
        reconnect_every_s: 5,
        reconnect_tries: 10,
        delay_s: 0,
        sample_rate: 48000,
        stereo: true,
        monitoring: null,
        hotkeys: {},
      },
      startError: { message: 'Microphone device is busy in another app.' },
    })
    const mic = checks.find((c) => c.id === 'mic')
    const connections = checks.find((c) => c.id === 'connections')
    expect(mic?.tone).toBe('danger')
    expect(mic?.value).toBe('Needs attention')
    expect(connections?.tone).toBe('ok')
    expect(connections?.value).toBe('2 ready')
    // Must not duplicate platform names outside Go live to.
    expect(connections?.value).not.toMatch(/Twitch|YouTube|Kick/i)
  })

  it('formats resolution summary cleanly', () => {
    expect(
      formatResolutionSummary({
        width: 1920,
        height: 1080,
        fps: 60,
      } as Parameters<typeof formatResolutionSummary>[0]),
    ).toBe('1920x1080 · 60 fps')
    expect(formatResolutionSummary(null)).toBeNull()
  })

  it('picks the closest upcoming scheduled stream first', () => {
    const now = 1_700_000_000_000
    const mk = (id: string, start_ms: number): ScheduledStream => ({
      id,
      info: { title: id },
      platforms: ['youtube'],
      start_ms,
      remind_minutes: 15,
      reminded: false,
      broadcasts: [],
    })
    expect(pickNextPlan([], now)).toBeNull()
    const picked = pickNextPlan([mk('later', now + 3_600_000), mk('soon', now + 600_000)], now)
    expect(picked?.id).toBe('soon')
  })
})
