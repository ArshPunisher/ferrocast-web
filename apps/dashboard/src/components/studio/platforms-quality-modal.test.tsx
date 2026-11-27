import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ApiError,
  type DestinationView,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
} from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { buildQualitySummaryText } from './quality-modal-model'
import { PlatformsQualityModal } from './platforms-quality-modal'

let root: Root | null = null
let host: HTMLDivElement | null = null

function installDialogPolyfill() {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
  }
}

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
    destinations: [
      makeDest({
        id: 'twitch',
        kind: 'twitch',
        name: 'Twitch',
        enabled: true,
      }),
      makeDest({
        id: 'youtube',
        kind: 'youtube',
        name: 'YouTube',
        enabled: true,
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
      }),
      makeDest({
        id: 'kick',
        kind: 'kick',
        name: 'Kick',
        enabled: false,
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
      }),
    ],
    upload: null,
    protect: true,
    aitum_ok: false,
    auto_quality: true,
    encode_budget: {
      status: 'ok',
      source: 'apple_silicon',
      used_mpx_s: 221,
      limit_mpx_s: 995,
      used_sessions: 3,
      max_sessions: 5,
    },
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
        kbps: 6000,
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

const OPTS_1440: GoLiveQualityOptionsResponse = {
  source: 'studio',
  main: {
    width: 2560,
    height: 1440,
    fps: 60,
    kbps: 16000,
    codec: 'h264',
    audio_kbps: 160,
  },
  vertical: {
    width: 1080,
    height: 1920,
    fps: 30,
    kbps: 8000,
    codec: 'h264',
    audio_kbps: 160,
  },
  budget: {
    status: 'ok',
    source: 'apple_silicon',
    used_mpx_s: 221,
    limit_mpx_s: 995,
    used_sessions: 3,
    max_sessions: 5,
  },
  destinations: {
    twitch: {
      id: 'twitch',
      canvas: 'main',
      locked_reason: null,
      current: { mode: 'same_as_main' },
      resolved: {
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
        {
          id: '1080p60',
          label: '1080p60',
          quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: null },
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
        fps_choices: [30, 60],
        codecs: ['h264'],
        recommended_width: 1920,
        recommended_height: 1080,
        recommended_fps: 60,
        recommended_kbps: 6000,
      },
    },
    youtube: {
      id: 'youtube',
      canvas: 'main',
      locked_reason: null,
      current: { mode: 'same_as_main' },
      resolved: {
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
    },
    kick: {
      id: 'kick',
      canvas: 'main',
      locked_reason: null,
      current: { mode: 'same_as_main' },
      resolved: {
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
    },
  },
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  vi.unstubAllGlobals()
})

describe('buildQualitySummaryText pure helper', () => {
  it('formats auto-fitted, Same as main, OBS override, and custom labels consistently', () => {
    const base = makeDest({
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
    })
    expect(buildQualitySummaryText(base, false)).toBe('1080p60 · 6 Mbps · auto')
    expect(buildQualitySummaryText(base, true)).toBe('Same as OBS')
    expect(
      buildQualitySummaryText(
        makeDest({
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
        }),
        false,
      ),
    ).toBe('Same as main')
    expect(
      buildQualitySummaryText(
        makeDest({
          quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000, codec: null },
          resolved_quality: {
            width: 1280,
            height: 720,
            fps: 30,
            kbps: 3000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: true,
            group_id: 'g-custom',
            shared_with: [],
          },
        }),
        false,
      ),
    ).toBe('720p30 · 3 Mbps')
  })
})

describe('One Modal B PlatformsQualityModal component', () => {
  it('opens a single dialog from Gear selecting first enabled platform, and from row selecting that platform', async () => {
    installDialogPolyfill()
    useLive.setState({ conn: { client: { request: vi.fn(async () => ({})) } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <PlatformsQualityModal
          open
          onClose={() => {}}
          view={makeView()}
          onSaved={() => {}}
          initialDestId={null}
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })

    const dialogs = document.querySelectorAll('dialog[open], [role="dialog"]')
    expect(dialogs).toHaveLength(1)
    const dialog = dialogs[0] as HTMLDialogElement
    expect(dialog.textContent).toContain('Your platforms')
    expect(dialog.textContent).toContain('Twitch quality')
    expect(
      dialog.querySelector('[data-platform-tile="twitch"]')?.getAttribute('data-selected'),
    ).toBe('true')
    expect(dialog.textContent).toContain('Upload protection')
    expect(dialog.textContent).toContain('Auto quality')

    // Re-open with Kick row target selects Kick in the same single dialog.
    await act(async () => {
      root!.render(
        <PlatformsQualityModal
          open
          onClose={() => {}}
          view={makeView({
            live: true,
            destinations: makeView().destinations.map((d) =>
              d.id === 'twitch'
                ? { ...d, health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 } }
                : d,
            ),
          })}
          onSaved={() => {}}
          initialDestId="kick"
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })
    expect(document.querySelectorAll('dialog[open], [role="dialog"]')).toHaveLength(1)
    expect(dialog.textContent).toContain('Kick quality')
    // Kick is disabled -> header must say Off, NOT Live now.
    expect(dialog.textContent).not.toContain('Live now')
    expect(dialog.textContent).toContain('Off')
  })

  it('shows Match main comparison, clicks Use 1080p60, applies custom quality, and keeps row in sync', async () => {
    installDialogPolyfill()
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'PUT' && path.includes('/destinations/twitch/quality')) {
        expect(body).toEqual({
          mode: 'custom',
          width: 1920,
          height: 1080,
          fps: 60,
          kbps: 6000,
          codec: null,
        })
        const customQuality: DestinationView['quality'] = {
          mode: 'custom',
          width: 1920,
          height: 1080,
          fps: 60,
          kbps: 6000,
          codec: null,
        }
        const updatedDest = makeDest({
          quality: customQuality,
          resolved_quality: {
            width: 1920,
            height: 1080,
            fps: 60,
            kbps: 6000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: true,
            group_id: 'g-tw-1080',
            shared_with: [],
          },
        })
        return makeView({
          destinations: [updatedDest, ...makeView().destinations.filter((d) => d.id !== 'twitch')],
        })
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    let currentView = makeView()
    const onUpdated = vi.fn((next: GoLiveView) => {
      currentView = next
      root!.render(
        <PlatformsQualityModal
          open
          onClose={() => {}}
          view={currentView}
          onSaved={() => {}}
          onUpdated={onUpdated}
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })

    await act(async () => {
      root!.render(
        <PlatformsQualityModal
          open
          onClose={() => {}}
          view={currentView}
          onSaved={() => {}}
          onUpdated={onUpdated}
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })

    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!
    expect(dialog.textContent).toContain('Main stream')
    expect(dialog.textContent).toContain('1440p60')
    expect(dialog.textContent).toContain('16 Mbps')
    expect(dialog.textContent).toContain('6 Mbps')
    expect(dialog.textContent).toContain('Bitrate capped at 6 Mbps, Twitch’s limit.')

    const use1080Btn = dialog.querySelector<HTMLButtonElement>('[data-soft-fix="1080p"]')!
    expect(use1080Btn.textContent).toContain('Use 1080p60')
    await act(async () => {
      use1080Btn.click()
    })

    // Switched to Set my own with a single neutral result card.
    const setOwnRadio = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent?.includes('Set my own'))!
    expect(setOwnRadio.getAttribute('aria-checked')).toBe('true')
    const results = dialog.querySelectorAll('[data-quality-result]')
    expect(results).toHaveLength(1)
    expect(results[0]!.textContent).toContain('Twitch gets 1080p60 at 6 Mbps')

    const applyBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    )!
    expect(applyBtn.disabled).toBe(false)
    expect(applyBtn.className).toContain('bg-btn-primary')
    expect(applyBtn.className).toContain('text-on-btn-primary')

    await act(async () => {
      applyBtn.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onUpdated).toHaveBeenCalled()
    expect(dialog.querySelector('[data-platform-tile="twitch"]')?.textContent).toContain(
      '1080p60 · 6 Mbps',
    )
  })

  it('keeps single dialog count === 1 when adding a destination inline, handles hard limit + fix, and supports mobile 375px back step', async () => {
    installDialogPolyfill()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: q.includes('max-width: 820px') || q.includes('max-width: 640px'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const trigger = document.createElement('button')
    trigger.textContent = 'Manage platforms'
    document.body.appendChild(trigger)
    trigger.focus()

    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const onClose = vi.fn()

    await act(async () => {
      root!.render(
        <PlatformsQualityModal
          open
          onClose={onClose}
          triggerEl={trigger}
          view={makeView()}
          onSaved={() => {}}
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })

    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!
    const panes = dialog.querySelector('[data-step]')!
    expect(panes.getAttribute('data-step')).toBe('list')

    // Click Add a destination -> inline in same dialog, NEVER a second dialog.
    const addBtn = dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!
    await act(async () => {
      addBtn.click()
    })
    expect(document.querySelectorAll('dialog[open], [role="dialog"]')).toHaveLength(1)
    expect(panes.getAttribute('data-step')).toBe('editor')
    expect(dialog.textContent).toContain('Add a destination')

    // Mobile back button returns to list step.
    const backBtn = dialog.querySelector<HTMLButtonElement>('[aria-label="Back to platforms"]')!
    await act(async () => {
      backBtn.click()
    })
    expect(panes.getAttribute('data-step')).toBe('list')

    // Tap Twitch row in mobile list -> slides to editor -> Set my own -> type over hard limit -> fix.
    const selectTwitch = dialog.querySelector<HTMLButtonElement>('[data-select-platform="twitch"]')!
    await act(async () => {
      selectTwitch.click()
    })
    expect(panes.getAttribute('data-step')).toBe('editor')

    const setOwnRadio = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent?.includes('Set my own'))!
    await act(async () => {
      setOwnRadio.click()
    })
    const numIn = dialog.querySelector<HTMLInputElement>('input[type="number"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(numIn, '9')
      numIn.dispatchEvent(new Event('input', { bubbles: true }))
      numIn.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(dialog.textContent).toContain('Twitch closes streams above 6 Mbps')
    const clampBtn = dialog.querySelector<HTMLButtonElement>('[data-hard-fix]')!
    await act(async () => {
      clampBtn.click()
    })
    expect(Number(numIn.value)).toBeLessThanOrEqual(6)

    // Escape closes and calls onClose cleanly.
    await act(async () => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces inline timeout/budget/limit errors inside editor without closing dialog', async () => {
    installDialogPolyfill()
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'PUT' && path.includes('/destinations/twitch/quality')) {
        throw new ApiError(422, 'golive_switch_timeout', 'No keyframe arrived in time.')
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const onClose = vi.fn()

    await act(async () => {
      root!.render(
        <PlatformsQualityModal
          open
          onClose={onClose}
          view={makeView({
            live: true,
            destinations: makeView().destinations.map((d) =>
              d.id === 'twitch'
                ? { ...d, health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 } }
                : d,
            ),
          })}
          onSaved={() => {}}
          initialDestId="twitch"
          usesObs={false}
          optionsResponse={OPTS_1440}
          loading={false}
          error={null}
          onReloadOptions={() => {}}
        />,
      )
    })

    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!
    const use1080 = dialog.querySelector<HTMLButtonElement>('[data-soft-fix="1080p"]')!
    await act(async () => {
      use1080.click()
    })
    const applyBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    )!
    await act(async () => {
      applyBtn.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Couldn't switch Twitch")
    expect(dialog.textContent).toContain('Try again')
  })
})
