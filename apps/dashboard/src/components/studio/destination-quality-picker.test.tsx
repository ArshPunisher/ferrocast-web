// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type CustomQualityLimits,
  type DestinationQualityOptions,
  type DestinationView,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
  type QualityOption,
} from '@ferrocast/api'
import { useLive } from '../../lib/store'
import {
  DestinationQualityPicker,
  buildCustomBitrates,
  buildCustomResolutions,
  curateQualityOptions,
  formatQualityChip,
} from './destination-quality-picker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeLimits(overrides: Partial<CustomQualityLimits> = {}): CustomQualityLimits {
  return {
    max_width: 2560,
    max_height: 1440,
    min_kbps: 1500,
    max_kbps: 10000,
    fps_choices: [30, 60],
    codecs: ['h264'],
    recommended_width: 1920,
    recommended_height: 1080,
    recommended_fps: 60,
    recommended_kbps: 6000,
    ...overrides,
  }
}

function makeOption(overrides: Partial<QualityOption> = {}): QualityOption {
  return {
    id: 'opt',
    label: '1080p60 · 6 Mbps',
    quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
    resolved: { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
    auto_fitted: false,
    recommended: false,
    note: null,
    shares_encoder_with: [],
    allowed: true,
    disabled_reason: null,
    ...overrides,
  }
}

function makeDest(overrides: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'twitch',
    name: 'Twitch',
    kind: 'twitch',
    canvas: 'main',
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
    ...overrides,
  }
}

function makeDestOpts(
  overrides: Partial<DestinationQualityOptions> = {},
): DestinationQualityOptions {
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
      group_id: 'g-twitch',
      shared_with: [],
    },
    options: [
      makeOption({
        id: 'same_as_main',
        label: 'Same as main',
        quality: { mode: 'same_as_main' },
        auto_fitted: true,
      }),
      makeOption({
        id: '1440p60',
        label: '1440p60 · 8 Mbps',
        quality: { mode: 'custom', width: 2560, height: 1440, fps: 60, kbps: 8000, codec: 'h264' },
        resolved: {
          width: 2560,
          height: 1440,
          fps: 60,
          kbps: 8000,
          codec: 'h264',
        },
        note: "Above Twitch's recommended 1080p",
      }),
      makeOption({
        id: '1080p60',
        label: '1080p60 · 6 Mbps',
        recommended: true,
      }),
      makeOption({
        id: '720p30',
        label: '720p30 · 3 Mbps',
        quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000, codec: 'h264' },
        resolved: {
          width: 1280,
          height: 720,
          fps: 30,
          kbps: 3000,
          codec: 'h264',
        },
      }),
    ],
    custom_limits: makeLimits(),
    ...overrides,
  }
}

function makeResponse(
  destOpts: DestinationQualityOptions = makeDestOpts(),
): GoLiveQualityOptionsResponse {
  return {
    source: 'studio',
    main: { width: 2560, height: 1440, fps: 60, kbps: 12000, codec: 'h264', audio_kbps: 160 },
    vertical: null,
    budget: {
      status: 'ok',
      source: 'nvenc_default',
      used_mpx_s: 120,
      limit_mpx_s: 360,
      used_sessions: 2,
      max_sessions: 3,
      note: null,
    },
    destinations: { [destOpts.id]: destOpts },
  }
}

function makeMinimalView(destinations: DestinationView[]): GoLiveView {
  return {
    live: true,
    vertical_live: false,
    destinations,
    encode_groups: [],
  } as unknown as GoLiveView
}

function flush(): Promise<void> {
  return new Promise((r) => window.setTimeout(r, 0))
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let requestMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  requestMock = vi.fn(async () => ({}))
  useLive.setState({
    conn: {
      client: { request: requestMock },
    } as never,
  })
})

afterEach(async () => {
  const prev = root
  root = null
  await act(async () => prev?.unmount())
  host?.remove()
  host = null
  useLive.setState({ conn: null })
})

describe('quality helpers', () => {
  it('formats active, auto-fitted, custom, switching, and locked chips accurately', () => {
    const ytDest = makeDest({
      id: 'yt',
      name: 'YouTube',
      kind: 'youtube',
      resolved_quality: {
        width: 1920,
        height: 1080,
        fps: 60,
        kbps: 10000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: false,
        group_id: 'g-main',
        shared_with: [],
      },
    })
    expect(formatQualityChip(ytDest).text).toBe('Same as main')

    expect(formatQualityChip(makeDest()).text).toBe('1080p60 · 6 Mbps · auto')

    const customDest = makeDest({
      quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000 },
      resolved_quality: {
        width: 1280,
        height: 720,
        fps: 30,
        kbps: 3000,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: true,
        group_id: 'g-720',
        shared_with: [],
      },
    })
    expect(formatQualityChip(customDest).text).toBe('720p30 · 3 Mbps')

    expect(formatQualityChip(makeDest({ switching_quality: true })).text).toBe('Switching…')
    expect(
      formatQualityChip(makeDest(), makeDestOpts({ locked_reason: 'Enhanced Broadcast (auto)' }))
        .text,
    ).toBe('Enhanced (auto)')
    expect(formatQualityChip(makeDest(), null, { usesObs: true }).text).toBe('Same as OBS')
    expect(formatQualityChip(makeDest({ direct: 'srt' })).text).toBe('Full stream')
  })

  it('curates large option lists to at most 4 while keeping recommended, current, and shared', () => {
    const opts = makeDestOpts({
      current: { mode: 'custom', width: 1280, height: 720, fps: 60, kbps: 4500 },
      options: [
        makeOption({
          id: 'same_as_main',
          label: 'Same as main',
          quality: { mode: 'same_as_main' },
        }),
        makeOption({ id: '1440p60', label: '1440p60 · 8 Mbps' }),
        makeOption({ id: '1080p60', label: '1080p60 · 6 Mbps', recommended: true }),
        makeOption({ id: '1080p30', label: '1080p30 · 4.5 Mbps' }),
        makeOption({
          id: '720p60',
          label: '720p60 · 4.5 Mbps',
          quality: { mode: 'custom', width: 1280, height: 720, fps: 60, kbps: 4500 },
          shares_encoder_with: ['Kick'],
        }),
        makeOption({ id: '720p30', label: '720p30 · 3 Mbps' }),
      ],
    })
    const curated = curateQualityOptions(opts)
    expect(curated).toHaveLength(4)
    expect(curated.map((o) => o.id)).toContain('same_as_main')
    expect(curated.map((o) => o.id)).toContain('1080p60')
    expect(curated.map((o) => o.id)).toContain('720p60')
  })

  it('bounds custom resolutions and bitrates by platform hard max and vertical orientation', () => {
    const kickLimits = makeLimits({ max_width: 1920, max_height: 1080, max_kbps: 8000 })
    const kickRes = buildCustomResolutions(kickLimits, 'main', 1920, 1080, 'kick')
    expect(kickRes.some((r) => r.height > 1080)).toBe(false)
    expect(buildCustomBitrates(kickLimits).every((k) => k <= 8000)).toBe(true)

    const twitchRes = buildCustomResolutions(makeLimits(), 'main', 1920, 1080, 'twitch')
    const r1440 = twitchRes.find((r) => r.height === 1440)
    expect(r1440?.softNote).toBe("Above Twitch's recommended 1080p")

    const vertRes = buildCustomResolutions(
      makeLimits({
        max_width: 1080,
        max_height: 1920,
        recommended_width: 1080,
        recommended_height: 1920,
      }),
      'vertical',
      1080,
      1920,
      'tiktok',
    )
    expect(vertRes.map((r) => r.value)).toEqual(['1080x1920', '720x1280', '540x960'])
  })
})

describe('DestinationQualityPicker component', () => {
  it('opens in a data-over-preview popover inside dialog/body, fires HOLES_CHANGED, and Escape keeps outer dialog open', async () => {
    const holeEvents = vi.fn()
    window.addEventListener('fc:preview-holes', holeEvents)

    const dialog = document.createElement('dialog')
    dialog.open = true
    const dialogRoot = document.createElement('div')
    dialog.append(dialogRoot)
    document.body.append(dialog)
    const onDialogKey = vi.fn()
    dialog.addEventListener('keydown', onDialogKey)

    const r = createRoot(dialogRoot)
    const resp = makeResponse()
    try {
      await act(async () => {
        r.render(
          <DestinationQualityPicker dest={makeDest()} qualityResponse={resp} onUpdated={vi.fn()} />,
        )
      })

      const trigger = dialogRoot.querySelector<HTMLButtonElement>(
        '[data-quality-trigger="twitch"]',
      )!
      expect(trigger.textContent).toContain('1080p60 · 6 Mbps · auto')

      await act(async () => {
        trigger.click()
        await flush()
      })

      const popover = dialog.querySelector<HTMLElement>('[data-quality-popover="twitch"]')
      expect(popover).not.toBeNull()
      expect(popover?.hasAttribute('data-over-preview')).toBe(true)
      expect(holeEvents).toHaveBeenCalled()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flush()
      })

      expect(dialog.querySelector('[data-quality-popover="twitch"]')).toBeNull()
      expect(onDialogKey).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(trigger)
    } finally {
      await act(async () => r.unmount())
      dialog.remove()
      window.removeEventListener('fc:preview-holes', holeEvents)
    }
  })

  it('supports keyboard traversal across disabled options, submits allowed choice, and exposes shared/soft-limit hints', async () => {
    const returnedView = makeMinimalView([makeDest({ switching_quality: true })])
    requestMock.mockResolvedValueOnce(returnedView)

    const opts = makeDestOpts({
      resolved: {
        ...makeDest().resolved_quality!,
        shared_with: ['YouTube'],
      },
      options: [
        makeOption({
          id: 'same_as_main',
          label: 'Same as main',
          quality: { mode: 'same_as_main' },
          allowed: false,
          disabled_reason: 'PC encode limit',
        }),
        makeOption({
          id: '1440p60',
          label: '1440p60 · 8 Mbps',
          note: "Above Twitch's recommended 1080p",
        }),
        makeOption({
          id: '1080p60',
          label: '1080p60 · 6 Mbps',
          recommended: true,
          shares_encoder_with: ['YouTube'],
        }),
      ],
    })

    const onUpdated = vi.fn()
    await act(async () => {
      root!.render(
        <DestinationQualityPicker
          dest={makeDest({
            resolved_quality: {
              ...makeDest().resolved_quality!,
              shared_with: ['YouTube'],
            },
          })}
          qualityResponse={makeResponse(opts)}
          onUpdated={onUpdated}
        />,
      )
    })

    expect(host!.textContent).toContain('shared with YouTube')
    await act(async () => {
      host!.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      await flush()
    })

    const options = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    expect(options).toHaveLength(3)
    const [opt0, opt1, opt2] = options
    expect(opt0?.getAttribute('aria-disabled')).toBe('true')
    expect(opt1?.textContent).toContain("Above Twitch's recommended 1080p")
    expect(opt2?.textContent).toContain('Best for Twitch')
    expect(opt2?.textContent).toContain('shared with YouTube')

    await act(async () => {
      opt0?.focus()
      opt0?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(opt1)

    await act(async () => {
      opt1?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(document.activeElement).toBe(opt2)

    await act(async () => {
      opt0?.click()
    })
    expect(requestMock).not.toHaveBeenCalled()

    await act(async () => {
      opt2?.click()
      await flush()
    })
    expect(requestMock).toHaveBeenCalledWith(
      'PUT',
      '/api/v1/golive/destinations/twitch/quality',
      opts.options[2]!.quality,
    )
    expect(onUpdated).toHaveBeenCalledWith(returnedView)
  })

  it('submits custom resolution/fps/bitrate/codec and keeps popover open with dismissible alert on 422', async () => {
    const onUpdated = vi.fn()
    const opts = makeDestOpts({
      custom_limits: makeLimits({ codecs: ['h264', 'hevc'] }),
    })

    await act(async () => {
      root!.render(
        <DestinationQualityPicker
          dest={makeDest()}
          qualityResponse={makeResponse(opts)}
          onUpdated={onUpdated}
        />,
      )
    })

    await act(async () => {
      host!.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      await flush()
    })

    const customBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Custom'),
    )!
    await act(async () => {
      customBtn.click()
    })

    const codecSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Codec"]')!
    expect(codecSelect).not.toBeNull()

    requestMock.mockRejectedValueOnce(
      new ApiError(422, 'invalid', 'Bitrate too high for destination', null),
    )

    const applyBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Apply',
    )!
    await act(async () => {
      applyBtn.click()
      await flush()
    })

    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Bitrate too high for destination')
    expect(document.querySelector('[data-quality-popover="twitch"]')).not.toBeNull()
    expect(onUpdated).not.toHaveBeenCalled()

    const dismiss = document.querySelector<HTMLButtonElement>('button[aria-label="Dismiss error"]')!
    await act(async () => {
      dismiss.click()
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows loading skeleton and fetch error retry states cleanly', async () => {
    const onReload = vi.fn()
    await act(async () => {
      root!.render(
        <DestinationQualityPicker
          dest={makeDest()}
          qualityResponse={null}
          optionsLoading
          onUpdated={vi.fn()}
        />,
      )
    })

    await act(async () => {
      host!.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      await flush()
    })
    expect(document.querySelector('[role="status"]')).not.toBeNull()

    await act(async () => {
      root!.render(
        <DestinationQualityPicker
          dest={makeDest()}
          qualityResponse={null}
          optionsError={new ApiError(500, 'busy', 'Engine busy', null)}
          onReloadOptions={onReload}
          onUpdated={vi.fn()}
        />,
      )
    })
    const retry = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Try again',
    )!
    await act(async () => {
      retry.click()
    })
    expect(onReload).toHaveBeenCalled()
  })
})
