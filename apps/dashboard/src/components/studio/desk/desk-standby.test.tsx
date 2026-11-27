// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type Connectors,
  type DestinationView,
  type GoLiveView,
  type ScheduledStream,
  type StudioEngineStatus,
} from '@ferrocast/api'
import { useResource } from '../../../lib/hooks'
import { useLive } from '../../../lib/store'
import { DeskStandby } from './desk-standby'
import { StudioDesk } from './desk'
import {
  buildQuickChecks,
  formatResolutionSummary,
  pickNextPlan,
  resolveStandbyPhase,
  safeThumbUrl,
} from './standby-model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  const d = HTMLDialogElement.prototype as unknown as Record<string, unknown>
  d.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  d.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  if (!window.matchMedia) {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

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

function seedView(overrides: Partial<GoLiveView> = {}): GoLiveView {
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
    destinations: [],
    upload: null,
    protect: true,
    aitum_ok: false,
    auto_quality: true,
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
      ignore_service_limits: false,
    },
    cut: {
      source: 'canvas',
      config: {
        layout: 'camera_top',
        camera: { x: 0.74, y: 0.04, w: 0.24, h: 0.31 },
        game: { x: 0.22, y: 0, w: 0.56, h: 1 },
        camera_share: 38,
        width: 1080,
        height: 1920,
        fps: 30,
        kbps: 4500,
        encoder: 'auto',
      },
      state: null,
      ffmpeg: { state: 'ready' },
    },
    ...overrides,
  }
}

function standbyStatus(overrides: Partial<StudioEngineStatus> = {}): StudioEngineStatus {
  return {
    available: true,
    running: false,
    version: '3.4.0',
    renderer: 'Metal',
    detail: null,
    safe_mode: null,
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

  it('allows only validated base64 raster data:image URLs for standby thumbnails', () => {
    expect(safeThumbUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeThumbUrl('data:image/webp;base64,UklGRg==')).toBe('data:image/webp;base64,UklGRg==')
    expect(safeThumbUrl('data:image/svg+xml;utf8,%3Csvg/%3E')).toBeNull()
    expect(safeThumbUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(safeThumbUrl('data:image/png;base64,AAAA" onload="alert(1)')).toBeNull()
    expect(safeThumbUrl('javascript:alert(1)')).toBeNull()
    expect(safeThumbUrl('https://example.com/x.png')).toBeNull()
    expect(safeThumbUrl('')).toBeNull()
  })

  it('marks disk space as unverified (neutral) when preflight and obsHealth are absent', () => {
    const checks = buildQuickChecks({
      engineAvailable: true,
      preflight: null,
      obsHealth: null,
      showConfig: {
        preset_id: null,
        starting_scene: null,
        countdown_s: 0,
        live_scene: null,
        alerts_on: false,
        discord: false,
        bot_on: false,
        replay_buffer: false,
        start_stream: true,
        ending_scene: null,
        stop_stream: true,
        stop_delay_s: 0,
        recap_message: null,
        mic_sources: [],
        cam_sources: [],
        min_disk_gb: 5,
        platforms: [],
      },
    })
    const disk = checks.find((c) => c.id === 'disk')
    expect(disk?.tone).toBe('neutral')
  })

  it('counts distinct output and account problems without dropping either and deduplicates same platform', () => {
    const startErr = { message: 'Microphone device is busy in another app.' }
    const checksWithErr = buildQuickChecks({
      engineAvailable: true,
      destinations: [
        dest({ id: 'twitch', name: 'Twitch', enabled: true, connected: true }),
        dest({ id: 'youtube', name: 'YouTube', enabled: true, connected: true }),
      ],
      connectors: conn(),
      startError: startErr,
    })
    expect(checksWithErr.find((c) => c.id === 'mic')?.tone).toBe('danger')
    expect(checksWithErr.find((c) => c.id === 'connections')?.value).toBe('2 ready')

    // Distinct custom destination block + YouTube account needing sign-in => 2 problems.
    const distinctChecks = buildQuickChecks({
      engineAvailable: true,
      destinations: [
        dest({
          id: 'c_custom',
          kind: 'custom',
          name: 'Custom RTMP',
          enabled: true,
          connected: false,
          blocked: 'Missing stream URL',
        }),
      ],
      connectors: conn({
        youtube: {
          state: 'sign_in_needed',
          account: null,
          detail: 'Reconnect YouTube',
          last_event_at: null,
        },
      }),
    })
    const combinedConn = distinctChecks.find((c) => c.id === 'connections')
    expect(combinedConn?.tone).toBe('warn')
    expect(combinedConn?.value).toBe('2 need check')

    // Overlapping YouTube blocked output + YouTube account error => deduplicated to 1.
    const samePlatformChecks = buildQuickChecks({
      engineAvailable: true,
      destinations: [
        dest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          enabled: true,
          connected: false,
          blocked: 'Reconnect YouTube in Settings.',
        }),
      ],
      connectors: conn({
        youtube: {
          state: 'sign_in_needed',
          account: null,
          detail: 'Sign in needed',
          last_event_at: null,
        },
      }),
    })
    expect(samePlatformChecks.find((c) => c.id === 'connections')?.value).toBe('1 needs check')
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

  it('prefers an upcoming scheduled stream over a past stream even inside a 30-minute window', () => {
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
    const startedRecently = mk('started-10m-ago', now - 10 * 60_000)
    const startsSoon = mk('starts-in-10m', now + 10 * 60_000)
    expect(pickNextPlan([startedRecently, startsSoon], now)?.id).toBe('starts-in-10m')
    // Fallback when only past streams exist: most recent past stream.
    expect(pickNextPlan([mk('older', now - 20 * 60_000), startedRecently], now)?.id).toBe(
      'started-10m-ago',
    )
  })
})

describe('DeskStandby & StudioDesk Review Fixes', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => root.unmount())
    host.remove()
    localStorage.clear()
  })

  function installClient(
    handler: (method: string, path: string, body?: unknown) => Promise<unknown>,
  ) {
    const client = {
      request: vi.fn(handler),
    }
    const off = { state: 'disconnected' as const, account: null, detail: null, last_event_at: null }
    useLive.setState({
      conn: { client } as never,
      connectors: { twitch: off, youtube: off, kick: off, facebook: off, obs: off, relay: off },
      studio: { health: null } as never,
    })
    return client
  }

  it('does not render Planned streams inside DeskStandby (moved to Schedule tab)', async () => {
    installClient(async (method, path) => {
      if (path === '/api/v1/clips' && method === 'GET')
        return { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).not.toContain('Planned streams')
    const planBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Plan a stream'),
    )
    expect(planBtn).toBeUndefined()
  })

  it('shows a load error with Retry instead of "No recordings yet" when clips.list() fails', async () => {
    let failClips = true
    installClient(async (_method, path) => {
      if (path === '/api/v1/clips') {
        if (failClips) throw new ApiError(500, 'clips_failed', 'Could not read recordings folder.')
        return {
          folder: '/Movies/Ferrocast',
          ffmpeg_ready: true,
          youtube_connected: false,
          clips: [
            {
              id: 'clip-1.mp4',
              name: 'Clutch clip',
              kind: 'replay',
              ext: 'mp4',
              size: 1024 * 1024,
              modified: Date.now() - 60_000,
              has_captions: false,
            },
          ],
        }
      }
      if (path === '/api/v1/schedule') return { streams: [] }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    const clipsSection = host.querySelector('[data-testid="standby-recent-clips"]')!
    expect(clipsSection.textContent).not.toContain('No recordings yet')
    const alert = clipsSection.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    const retryBtn = Array.from(clipsSection.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    ) as HTMLButtonElement | undefined
    expect(retryBtn).toBeDefined()

    failClips = false
    await act(async () => {
      retryBtn!.click()
      await Promise.resolve()
    })
    expect(clipsSection.textContent).toContain('Clutch clip')
  })

  it('does not show Ready badge on Quick checks when readiness is unverified', async () => {
    installClient(async (_method, path) => {
      if (path === '/api/v1/schedule') return { streams: [] }
      if (path === '/api/v1/clips')
        return { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] }
      if (path === '/api/v1/show/config') {
        return {
          preset_id: null,
          starting_scene: null,
          countdown_s: 0,
          live_scene: null,
          alerts_on: false,
          discord: false,
          bot_on: false,
          replay_buffer: false,
          start_stream: true,
          ending_scene: null,
          stop_stream: true,
          stop_delay_s: 0,
          recap_message: null,
          mic_sources: [],
          cam_sources: [],
          min_disk_gb: 5,
          platforms: [],
        }
      }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    const checksSection = host.querySelector('section[aria-label="Quick checks"]')!
    const badgeText = checksSection.querySelector('span.rounded-full')?.textContent?.trim()
    expect(badgeText).not.toBe('Ready')
  })

  it('never pairs a cached image from SceneA with a label for SceneB when SceneB thumbnail fails', async () => {
    localStorage.setItem(
      'fc-studio-standby-scene',
      JSON.stringify({
        scene: 'SceneA',
        collection: 'Default',
        image: 'data:image/png;base64,AAAA',
        updatedAt: Date.now(),
      }),
    )

    installClient(async (_method, path) => {
      if (path === '/api/v1/studio/engine/scenes') {
        return {
          current: 'SceneB',
          scenes: [{ name: 'SceneB', items: 1, current: true, transition: null }],
          transition: { kind: 'fade_transition', ms: 300 },
        }
      }
      if (path.includes('/thumbnail')) {
        throw new ApiError(422, 'studio_not_running', 'No thumbnail while off')
      }
      if (path === '/api/v1/schedule') return { streams: [] }
      if (path === '/api/v1/clips')
        return { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    const frame = host.querySelector('[data-testid="standby-stage-frame"]')!
    const img = frame.querySelector('img')
    if (img) {
      expect(frame.textContent).not.toContain('Last scene · SceneB')
      expect(img.getAttribute('alt')).not.toContain('SceneB')
    } else {
      expect(frame.textContent).toContain('SceneB')
    }
  })

  it('refreshes Upload protection state after saving via Platforms Manage dialog', async () => {
    let protectState = true
    installClient(async (method, path, body) => {
      if (path === '/api/v1/golive/protection' && method === 'PUT') {
        protectState = (body as { on: boolean }).on
        return { destinations: [], protect: protectState }
      }
      if (path === '/api/v1/schedule') return { streams: [] }
      if (path === '/api/v1/clips')
        return { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView({ protect: protectState })), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    const manageBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Manage',
    ) as HTMLButtonElement
    await act(async () => manageBtn.click())

    const protectSwitch = Array.from(host.querySelectorAll('[role="switch"]')).find(
      (el) =>
        el.getAttribute('aria-label')?.includes('Upload protection') ||
        el.closest('label,div')?.textContent?.includes('Upload protection'),
    ) as HTMLButtonElement | undefined
    expect(protectSwitch).toBeDefined()
    expect(protectSwitch!.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      protectSwitch!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(protectState).toBe(false)
    expect(protectSwitch!.getAttribute('aria-checked')).toBe('false')
  })

  it('omits Planned streams in StudioDesk when studio engine status fails to load', async () => {
    installClient(async (_method, path) => {
      if (path === '/api/v1/studio/engine') {
        throw new ApiError(500, 'engine_down', 'Engine daemon not reachable.')
      }
      throw new ApiError(404, 'not_found', 'none')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return <StudioDesk res={res} view={res.data} />
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    expect(host.textContent).toContain('Try again')
    expect(host.textContent).not.toContain('Planned streams')
    const planBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Plan a stream'),
    )
    expect(planBtn).toBeUndefined()
  })

  it('passes inDialog to Platforms in DeskStandby so Manage opens without duplicate heading or nested panel', async () => {
    installClient(async (_method, path) => {
      if (path === '/api/v1/schedule') return { streams: [] }
      if (path === '/api/v1/clips')
        return { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] }
      throw new ApiError(422, 'studio_not_running', 'Off')
    })

    function Harness() {
      const res = useResource(() => Promise.resolve(seedView()), [])
      return (
        <DeskStandby
          status={standbyStatus()}
          view={res.data}
          res={res}
          starting={null}
          startError={null}
          onStart={async () => undefined}
          onRetryStatus={() => undefined}
        />
      )
    }

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await Promise.resolve()
    })

    const manageBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Manage',
    ) as HTMLButtonElement
    await act(async () => manageBtn.click())

    const dialog = host.querySelector('dialog') as HTMLElement | null
    expect(dialog).not.toBeNull()
    const headings = Array.from(dialog!.querySelectorAll('h1, h2, h3, [role="heading"]')).filter(
      (el) => el.textContent?.trim() === 'Your platforms',
    )
    expect(headings).toHaveLength(1)
    const platformsRoot = dialog!.querySelector('#golive-platforms')
    expect(platformsRoot?.tagName).toBe('DIV')
  })
})
