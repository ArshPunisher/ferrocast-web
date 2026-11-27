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
import { useQualityOptions } from './platform-shared'

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

  describe('one session at a time', () => {
    type ModalProps = React.ComponentProps<typeof PlatformsQualityModal>
    const base = (over: Partial<ModalProps> = {}): ModalProps => ({
      open: true,
      onClose: () => {},
      view: makeView(),
      onSaved: () => {},
      usesObs: false,
      optionsResponse: OPTS_1440,
      loading: false,
      error: null,
      onReloadOptions: () => {},
      ...over,
    })
    async function show(over: Partial<ModalProps> = {}, request?: (...a: never[]) => unknown) {
      installDialogPolyfill()
      useLive.setState({
        conn: { client: { request: request ?? vi.fn(async () => ({})) } } as never,
      })
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
      host = document.createElement('div')
      document.body.appendChild(host)
      root = createRoot(host)
      await act(async () => root!.render(<PlatformsQualityModal {...base(over)} />))
      return document.querySelector<HTMLDialogElement>('dialog[open]')!
    }
    const rerender = async (over: Partial<ModalProps>) =>
      act(async () => root!.render(<PlatformsQualityModal {...base(over)} />))
    const setOwn = async (dialog: HTMLElement) => {
      const radio = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
        (b) => b.textContent?.includes('Set my own'),
      )!
      await act(async () => radio.click())
    }
    const typeMbps = async (dialog: HTMLElement, value: string) => {
      const input = dialog.querySelector<HTMLInputElement>('input[type="number"]')!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )!.set!
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      return input
    }
    const apply = (dialog: HTMLElement) =>
      Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Apply',
      )!

    it('locks the editor when OBS sets the quality, so Apply cannot send a change', async () => {
      const dialog = await show({ usesObs: true, optionsResponse: null })
      expect(dialog.textContent).toContain('OBS sets the resolution')
      expect(dialog.querySelector('[role="radio"]')).toBeNull()
      expect(apply(dialog).disabled).toBe(true)
    })

    it('keeps a paired phone from editing quality, adding or removing from the dialog', async () => {
      const dialog = await show({ isRemote: true })
      expect(dialog.textContent).toContain('Change destination quality from your PC.')
      expect(
        dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!.disabled,
      ).toBe(true)
      expect(apply(dialog).disabled).toBe(true)
    })

    it('keeps edits per platform while the dialog is open and drops them when it reopens', async () => {
      const dialog = await show({ initialDestId: 'twitch' })
      await setOwn(dialog)
      await typeMbps(dialog, '4')
      const pick = async (id: string) =>
        act(async () =>
          dialog.querySelector<HTMLButtonElement>(`[data-select-platform="${id}"]`)!.click(),
        )
      await pick('youtube')
      expect(dialog.textContent).toContain('YouTube quality')
      await pick('twitch')
      expect(dialog.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('4')

      await rerender({ open: false, initialDestId: 'twitch' })
      await rerender({ open: true, initialDestId: 'twitch' })
      // Back to what is saved: Match main, no bitrate box.
      expect(dialog.querySelector('input[type="number"]')).toBeNull()
      expect(apply(dialog).disabled).toBe(true)
    })

    it('lets the bitrate box be cleared and typed with a decimal', async () => {
      const dialog = await show({ initialDestId: 'twitch' })
      await setOwn(dialog)
      const input = await typeMbps(dialog, '')
      expect(input.value).toBe('')
      await typeMbps(dialog, '4.5')
      expect(input.value).toBe('4.5')
      expect(dialog.textContent).toContain('Twitch gets')
      expect(dialog.textContent).toContain('4.5 Mbps')
      // The engine takes up to 60 Mbps for a custom server.
      expect(input.max).toBe('60')
    })

    it('does not let a finished save close a dialog that was reopened for another platform', async () => {
      let finish: (v: unknown) => void = () => {}
      const request = vi.fn(async (method: string, path: string) => {
        if (method === 'PUT' && path.includes('/destinations/twitch/quality')) {
          return new Promise((resolve) => {
            finish = resolve
          })
        }
        return {}
      })
      const onClose = vi.fn()
      const dialog = await show({ initialDestId: 'twitch', onClose }, request as never)
      await act(async () =>
        dialog.querySelector<HTMLButtonElement>('[data-soft-fix="1080p"]')!.click(),
      )
      await act(async () => {
        apply(dialog).click()
      })
      await rerender({ open: false, initialDestId: 'twitch', onClose })
      await rerender({ open: true, initialDestId: 'youtube', onClose })
      await act(async () => {
        finish(makeView())
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(onClose).not.toHaveBeenCalled()
      expect(dialog.textContent).toContain('YouTube quality')
    })

    it('keeps an edit made after reopening when an older save finishes', async () => {
      let finish: (v: unknown) => void = () => {}
      const request = vi.fn(async (method: string, path: string) => {
        if (method === 'PUT' && path.includes('/destinations/twitch/quality')) {
          return new Promise((resolve) => {
            finish = resolve
          })
        }
        return {}
      })
      const dialog = await show({ initialDestId: 'twitch' }, request as never)
      await act(async () =>
        dialog.querySelector<HTMLButtonElement>('[data-soft-fix="1080p"]')!.click(),
      )
      await act(async () => {
        apply(dialog).click()
      })
      await rerender({ open: false, initialDestId: 'twitch' })
      await rerender({ open: true, initialDestId: 'twitch' })
      await setOwn(dialog)
      await typeMbps(dialog, '3')
      await act(async () => {
        finish(makeView())
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(dialog.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('3')
    })

    it('does not close or reset a newer add form when an older add finishes', async () => {
      let finish: (v: unknown) => void = () => {}
      const request = vi.fn(async (method: string, path: string) => {
        if (method === 'POST' && path.endsWith('/golive/destinations')) {
          return new Promise((resolve) => {
            finish = resolve
          })
        }
        return {}
      })
      const dialog = await show({}, request as never)
      const fill = async (name: string, value: string) => {
        const input = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[name="${name}"]`,
        )!
        await act(async () => {
          const proto =
            input instanceof window.HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
          setter.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
      const open = async () =>
        act(async () =>
          dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!.click(),
        )
      await open()
      await fill('name', 'Relay')
      await fill('url', 'rtmp://example.com/live')
      await fill('stream-key', 'abc')
      await act(async () => {
        Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => b.textContent?.trim() === 'Add server')!
          .click()
      })
      // Cancel while it is pending, then open Add again.
      await act(async () =>
        Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => b.textContent?.trim() === 'Cancel')!
          .click(),
      )
      await open()
      await fill('name', 'Other')
      await act(async () => {
        finish({ id: 'custom_1', name: 'Relay' })
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(dialog.textContent).toContain('Paste a server address')
      expect(dialog.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Other')
    })

    it('shows the question about the list above both panes, so a phone sees it on the list step', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((q: string) => ({
          matches: q.includes('max-width: 820px'),
          media: q,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      )
      const request = vi.fn(async (method: string, path: string) => {
        if (method === 'PUT' && path.endsWith('/golive/destinations')) {
          throw new ApiError(409, 'golive_last_destination', 'That is the last one.', 'Confirm.')
        }
        return {}
      })
      const dialog = await show({ view: makeView({ live: true }) }, request as never)
      expect(dialog.querySelector('[data-step]')!.getAttribute('data-step')).toBe('list')
      const toggles = dialog.querySelectorAll<HTMLInputElement>('.fc-om-pane-l [role="switch"]')
      await act(async () => {
        toggles[0]!.click()
        await Promise.resolve()
        await Promise.resolve()
      })
      const ask = dialog.querySelector('[data-save-question]')
      expect(ask).not.toBeNull()
      expect(ask!.closest('.fc-om-pane-r')).toBeNull()
      // Closing drops the question; reopening does not bring it back.
      await rerender({ open: false })
      await rerender({ open: true })
      expect(dialog.querySelector('[data-save-question]')).toBeNull()
    })

    it('goes back from the add form with Escape, and lets an open tip take its own Escape', async () => {
      const onClose = vi.fn()
      const dialog = await show({ onClose })
      await act(async () =>
        dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!.click(),
      )
      expect(dialog.textContent).toContain('Paste a server address')
      await act(async () => {
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
      })
      expect(onClose).not.toHaveBeenCalled()
      expect(dialog.textContent).not.toContain('Paste a server address')

      // A tip that is open keeps Escape for itself.
      const tipBtn = dialog.querySelector<HTMLButtonElement>('button[aria-label]')!
      tipBtn.setAttribute('aria-expanded', 'true')
      await act(async () => {
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
      })
      expect(onClose).not.toHaveBeenCalled()
      tipBtn.setAttribute('aria-expanded', 'false')
      await act(async () => {
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('adds to the picture the list belongs to, and a plain Add after a vertical add goes to main', async () => {
      const typeUrl = async (dialog: HTMLElement, value: string) => {
        const input = dialog.querySelector<HTMLInputElement>('input[name="url"]')!
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )!.set!
          setter.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
      const onlyMain = 'sends the main picture only'
      // Vertical list: the form targets the vertical picture, which cannot take SRT.
      let dialog = await show({ canvasFilter: 'vertical', addCanvas: 'vertical' })
      await act(async () =>
        dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!.click(),
      )
      await typeUrl(dialog, 'srt://host:9000')
      expect(dialog.textContent).toContain(onlyMain)
      await act(async () => root!.unmount())
      host!.remove()
      document.body.innerHTML = ''

      // Opened to add a vertical one, cancelled, then a plain Add: back to the main picture.
      dialog = await show({ initialMode: 'add', addCanvas: 'vertical' })
      await typeUrl(dialog, 'srt://host:9000')
      expect(dialog.textContent).toContain(onlyMain)
      await act(async () =>
        Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => b.textContent?.trim() === 'Cancel')!
          .click(),
      )
      await act(async () =>
        dialog.querySelector<HTMLButtonElement>('[aria-label="Add a destination"]')!.click(),
      )
      await typeUrl(dialog, 'srt://host:9000')
      expect(dialog.textContent).not.toContain(onlyMain)
    })

    it('says in words why a resolution or frame rate is out of reach, not only in a hover tip', async () => {
      const dialog = await show({ initialDestId: 'kick' })
      await setOwn(dialog)
      expect(dialog.querySelector('[data-chip-reason="resolution"]')?.textContent).toContain(
        'Kick takes up to 1080p',
      )
    })

    it('gives the bitrate slider a spoken value in Mbps and keeps one radio in the tab order', async () => {
      const dialog = await show({ initialDestId: 'twitch' })
      await setOwn(dialog)
      const range = dialog.querySelector<HTMLInputElement>('input[type="range"]')!
      expect(range.getAttribute('aria-valuetext')).toMatch(/Mbps$/)
      const radios = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
      expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0])
    })
  })

  it('shares one options request between callers that ask in the same moment', async () => {
    installDialogPolyfill()
    const request = vi.fn(async () => OPTS_1440)
    useLive.setState({ conn: { client: { request } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    function Probe() {
      const q = useQualityOptions(makeView(), true, false)
      return (
        <button
          onClick={() => {
            void q.reload()
            void q.reload()
          }}
        >
          reload twice
        </button>
      )
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root!.render(<Probe />))
    await act(async () => {
      await Promise.resolve()
    })
    request.mockClear()
    await new Promise((r) => setTimeout(r, 60))
    await act(async () => host!.querySelector('button')!.click())
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('asks again when the inputs change, even right after a request started', async () => {
    installDialogPolyfill()
    const request = vi.fn(async () => OPTS_1440)
    useLive.setState({ conn: { client: { request } } as never })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    function Probe({ view }: { view: GoLiveView }) {
      useQualityOptions(view, true, false)
      return null
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root!.render(<Probe view={makeView()} />))
    const first = request.mock.calls.length
    // The source's picture changes (same bitrate, same destinations): a new answer is needed.
    const next = makeView({
      encode_groups: [
        {
          id: 'main',
          canvas: 'main',
          width: 1280,
          height: 720,
          fps: 60,
          kbps: 16000,
          codec: 'h264',
          members: ['youtube'],
          live_fps: null,
          live_kbps: null,
          dropped_frames: null,
          encode_ms: null,
        },
      ],
    })
    await act(async () => root!.render(<Probe view={next} />))
    expect(request.mock.calls.length).toBe(first + 1)
  })
})
