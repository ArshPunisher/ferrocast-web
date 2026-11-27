// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DestinationQualityOptions,
  DestinationView,
  GoLiveQualityOptionsResponse,
  GoLiveView,
} from '@ferrocast/api'
import { useLive } from '../../lib/store'
import {
  buildQualitySummaryText,
  DestinationQualityPicker,
  formatRate,
  formatResFps,
  useQualityOptions,
} from './destination-quality-picker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function installDialogMock() {
  if (typeof HTMLDialogElement === 'undefined') return
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
    Object.defineProperty(this, 'open', { value: true, configurable: true })
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    Object.defineProperty(this, 'open', { value: false, configurable: true })
    this.dispatchEvent(new Event('close'))
  }
}

describe('quality summary formatting helpers', () => {
  it('formats kbps and Mbps cleanly', () => {
    expect(formatRate(6000)).toBe('6 Mbps')
    expect(formatRate(4500)).toBe('4.5 Mbps')
    expect(formatRate(800)).toBe('800 kbps')
  })

  it('formats landscape and portrait short-edge resolution labels cleanly', () => {
    expect(formatResFps(1920, 1080, 60)).toBe('1080p60')
    expect(formatResFps(2560, 1440, 60)).toBe('1440p60')
    expect(formatResFps(1080, 1920, 60)).toBe('1080p60')
    expect(formatResFps(1280, 720, 30)).toBe('720p30')
  })

  it('builds concise trigger readout for Same as main, auto-fit, OBS, and Custom', () => {
    const base: DestinationView = {
      id: 'twitch',
      name: 'Twitch',
      kind: 'twitch',
      canvas: 'main',
      account: 'a',
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
    }

    expect(buildQualitySummaryText(base, false)).toBe('1080p60 · 6 Mbps · auto')
    expect(buildQualitySummaryText(base, true)).toBe('Same as OBS')

    expect(
      buildQualitySummaryText(
        {
          ...base,
          id: 'youtube',
          resolved_quality: {
            ...base.resolved_quality!,
            auto_fitted: false,
            separate_encode: false,
            width: 2560,
            height: 1440,
            kbps: 12000,
          },
        },
        false,
      ),
    ).toBe('Same as main')

    expect(
      buildQualitySummaryText(
        {
          ...base,
          id: 'kick',
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
            group_id: 'g-kick',
            shared_with: [],
          },
        },
        false,
      ),
    ).toBe('720p30 · 3 Mbps')
  })
})

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
      width: 2560,
      height: 1440,
      fps: 60,
      kbps: 6000,
      codec: 'h264',
      audio_kbps: 160,
      auto_fitted: true,
      separate_encode: true,
      group_id: 'g-twitch',
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
    resolved: makeDest().resolved_quality!,
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

function makeResponse(
  destOpts: Record<string, DestinationQualityOptions> = { twitch: makeOpts() },
  overrides: Partial<GoLiveQualityOptionsResponse> = {},
): GoLiveQualityOptionsResponse {
  return {
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
    destinations: destOpts,
    ...overrides,
  }
}

describe('Modal A DestinationQualityPicker component', () => {
  afterEach(() => {
    useLive.setState({ conn: null })
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('opens Modal A with resolution/fps/bitrate controls, Match main switch, and restores focus on Escape', async () => {
    installDialogMock()
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)

    try {
      const dest = makeDest()
      await act(async () => {
        root.render(
          <DestinationQualityPicker
            dest={dest}
            allDestinations={[dest]}
            usesObs={false}
            live={true}
            optionsResponse={makeResponse()}
            loading={false}
            onUpdated={vi.fn()}
          />,
        )
      })

      const trigger = host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!
      expect(trigger.textContent).toContain('1440p60 · 6 Mbps · auto')

      await act(async () => {
        trigger.focus()
        trigger.click()
      })

      const modal = document.querySelector<HTMLDialogElement>('[data-quality-modal="twitch"]')
      expect(modal).not.toBeNull()
      expect(modal?.open).toBe(true)
      expect(modal?.textContent).toContain('Twitch quality')
      expect(modal?.textContent).toContain('Switches only Twitch. Your stream keeps going.')

      // Turn off Match main stream and pick 720p + 30 fps.
      const matchSwitch = modal!.querySelector<HTMLButtonElement>('button[role="switch"]')!
      expect(matchSwitch.getAttribute('aria-checked')).toBe('true')
      await act(async () => {
        matchSwitch.click()
      })
      expect(matchSwitch.getAttribute('aria-checked')).toBe('false')

      const res720 = Array.from(modal!.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === '720p',
      )!
      const fps30 = Array.from(modal!.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === '30',
      )!
      await act(async () => {
        res720.click()
        fps30.click()
      })
      expect(modal!.textContent).toContain('Twitch gets 720p30 at 6 Mbps')

      // Escape closes modal and restores focus to the trigger button.
      await act(async () => {
        modal!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })
      expect(document.querySelector('[data-quality-modal="twitch"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('shows hard limit banner and one-tap fix when bitrate exceeds max_kbps, and disables Apply until fixed', async () => {
    installDialogMock()
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)

    try {
      const dest = makeDest({
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
          group_id: 'g-tw',
          shared_with: [],
        },
      })
      await act(async () => {
        root.render(
          <DestinationQualityPicker
            dest={dest}
            allDestinations={[dest]}
            usesObs={false}
            live={false}
            optionsResponse={makeResponse({
              twitch: makeOpts({ current: dest.quality!, resolved: dest.resolved_quality! }),
            })}
            loading={false}
            onUpdated={vi.fn()}
          />,
        )
      })

      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      })

      const modal = document.querySelector<HTMLDialogElement>('[data-quality-modal="twitch"]')!
      const mbpsInput = modal.querySelector<HTMLInputElement>('input[type="number"]')!
      const applyBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Apply',
      )!

      // Enter 8 Mbps (> Twitch 6 Mbps ceiling).
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )!.set!
        setter.call(mbpsInput, '8')
        mbpsInput.dispatchEvent(new Event('input', { bubbles: true }))
        mbpsInput.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(modal.textContent).toContain('Twitch closes streams above 6 Mbps.')
      expect(applyBtn.disabled).toBe(true)

      const fixBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('Use 1080p60 · 6 Mbps'),
      )!
      expect(fixBtn).toBeTruthy()
      await act(async () => {
        fixBtn.click()
      })

      expect(modal.textContent).not.toContain('Twitch closes streams above 6 Mbps.')
      expect(mbpsInput.value).toBe('6')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('shows soft limit warning on 1440p Twitch while keeping Apply enabled, and calls PUT quality on Apply', async () => {
    installDialogMock()
    const nextView = { live: false, destinations: [] } as unknown as GoLiveView
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'PUT' && path === '/api/v1/golive/destinations/twitch/quality') {
        expect(body).toEqual({
          mode: 'custom',
          width: 2560,
          height: 1440,
          fps: 60,
          kbps: 6000,
          codec: null,
        })
        return nextView
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    const onUpdated = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)

    try {
      const dest = makeDest({
        quality: { mode: 'custom', width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
      })
      await act(async () => {
        root.render(
          <DestinationQualityPicker
            dest={dest}
            allDestinations={[dest]}
            usesObs={false}
            live={false}
            optionsResponse={makeResponse({
              twitch: makeOpts({ current: dest.quality! }),
            })}
            loading={false}
            onUpdated={onUpdated}
          />,
        )
      })

      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      })
      const modal = document.querySelector<HTMLDialogElement>('[data-quality-modal="twitch"]')!
      const res1440 = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('1440p'),
      )!
      await act(async () => {
        res1440.click()
      })

      expect(modal.textContent).toContain("Above Twitch's recommended 1080p")
      const applyBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Apply',
      )!
      expect(applyBtn.disabled).toBe(false)

      await act(async () => {
        applyBtn.click()
        await Promise.resolve()
      })
      expect(onUpdated).toHaveBeenCalledWith(nextView)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('locks destination on server/OBS locked_reason and renders 422 golive_switch_timeout with Try again', async () => {
    installDialogMock()
    const { ApiError } = await import('@ferrocast/api')
    const request = vi.fn(async (method: string) => {
      if (method === 'PUT') {
        throw new ApiError(422, 'golive_switch_timeout', 'Switch timed out waiting for a keyframe.')
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)

    try {
      const dest = makeDest()
      await act(async () => {
        root.render(
          <DestinationQualityPicker
            dest={dest}
            allDestinations={[dest]}
            usesObs={false}
            live={true}
            optionsResponse={makeResponse()}
            loading={false}
            onUpdated={vi.fn()}
          />,
        )
      })

      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
      })
      const modal = document.querySelector<HTMLDialogElement>('[data-quality-modal="twitch"]')!
      await act(async () => {
        modal.querySelector<HTMLButtonElement>('button[role="switch"]')!.click()
      })
      const applyBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Apply',
      )!
      await act(async () => {
        applyBtn.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(modal.textContent).toContain("Couldn't switch Twitch")
      expect(
        Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).some(
          (b) => b.textContent?.trim() === 'Try again',
        ),
      ).toBe(true)

      // OBS lock disables trigger.
      await act(async () => {
        root.render(
          <DestinationQualityPicker
            dest={dest}
            allDestinations={[dest]}
            usesObs={true}
            live={true}
            optionsResponse={makeResponse()}
            loading={false}
            onUpdated={vi.fn()}
          />,
        )
      })
      expect(
        host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')?.disabled,
      ).toBe(true)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('useQualityOptions stays gated while using OBS and fetches when active', async () => {
    const request = vi.fn(async () => makeResponse())
    useLive.setState({ conn: { client: { request } } as never })
    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)

    function Probe({ usesObs }: { usesObs: boolean }) {
      const q = useQualityOptions({ destinations: [] } as unknown as GoLiveView, true, usesObs)
      return <span data-status={q.data ? 'loaded' : 'idle'} />
    }

    try {
      await act(async () => {
        root.render(<Probe usesObs={true} />)
        await Promise.resolve()
      })
      expect(request).not.toHaveBeenCalled()

      await act(async () => {
        root.render(<Probe usesObs={false} />)
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(request).toHaveBeenCalledWith('GET', '/api/v1/golive/quality-options')
      expect(host.querySelector('[data-status]')?.getAttribute('data-status')).toBe('loaded')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
