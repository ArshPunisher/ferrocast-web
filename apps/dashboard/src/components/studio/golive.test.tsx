import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DestinationView, GoLiveView } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { AllFailedBanner, LiveCard, RowText } from './golive'
import { LiveLine } from './desk/golive-dock'

let root: Root | null = null

function baseDest(overrides: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'twitch',
    kind: 'twitch',
    canvas: 'main',
    name: 'Twitch',
    account: 'arsh_live',
    enabled: true,
    connected: true,
    health: { state: 'live', kbps: 6000, dropped: 0, since_ms: 0 },
    blocked: null,
    rules: [],
    ...overrides,
  }
}

async function renderNode(node: React.ReactElement): Promise<HTMLDivElement> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(node))
  return el
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
})

describe('RowText (Contract C-2 capped chip and structured issues)', () => {
  it('renders the calm capped chip and expands its detail when (i) is pressed', async () => {
    const detail =
      "Your 10,000 kbps stream is capped at 6,000 kbps H.264 (2 s keyframes, 1× VBV) so viewers don't stutter."
    const el = await renderNode(
      <RowText
        d={baseDest({
          capped: {
            kbps: 6000,
            separate_encode: false,
            summary: 'Capped at 6,000 kbps for Twitch',
            detail,
          },
        })}
      />,
    )
    expect(el.textContent).toContain('Capped at 6,000 kbps for Twitch')
    expect(el.textContent).not.toContain(detail)
    const infoBtn = el.querySelector(
      'button[aria-label="About Twitch limits"]',
    ) as HTMLButtonElement
    expect(infoBtn).not.toBeNull()
    expect(infoBtn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => infoBtn.click())
    expect(infoBtn.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain(detail)
  })

  it('renders structured issues with expandable detail and Use N kbps quick-fix button', async () => {
    const fixBitrate = vi.fn()
    const detail =
      'Over Twitch’s 6,000 kbps limit, viewers may buffer. Lower the bitrate to 5,500 kbps or less.'
    const el = await renderNode(
      <RowText
        fixBitrate={fixBitrate}
        d={baseDest({
          rules: [detail],
          issues: [
            {
              code: 'bitrate',
              summary: 'Over Twitch’s 6,000 kbps limit',
              detail,
              fix_kbps: 5500,
            },
          ],
        })}
      />,
    )
    expect(el.textContent).toContain('Over Twitch’s 6,000 kbps limit')
    expect(el.textContent).not.toContain('viewers may buffer')
    const infoBtn = el.querySelector(
      'button[aria-label="More about Over Twitch’s 6,000 kbps limit"]',
    ) as HTMLButtonElement
    await act(async () => infoBtn.click())
    expect(el.textContent).toContain('viewers may buffer')

    const fixBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Use 5,500 kbps'),
    ) as HTMLButtonElement
    expect(fixBtn).not.toBeUndefined()
    await act(async () => fixBtn.click())
    expect(fixBitrate).toHaveBeenCalledWith(5500)
  })

  it('keeps the legacy rules string fallback working when an older engine omits issues', async () => {
    const legacy = 'Twitch needs a keyframe at least every 2 s.'
    const el = await renderNode(<RowText d={baseDest({ rules: [legacy] })} />)
    expect(el.textContent).toContain(legacy)
  })
})

describe('Contract C-1: PushState failed UI', () => {
  function baseView(overrides: Partial<GoLiveView> = {}): GoLiveView {
    return {
      ingest: 'rtmp://127.0.0.1:1935/live',
      obs: {
        connected: true,
        points_here: true,
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

  it('LiveLine shows failed Kick destination as one line with multistream guidance behind (i) and Retry', async () => {
    const onRetry = vi.fn()
    const kick = baseDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      health: {
        state: 'failed',
        attempts: 3,
        reason: 'Kick refused the stream.',
        detail:
          'Kick took the stream and closed it at once: allow multistreaming in Kick’s settings, or turn Kick off.',
        refused: true,
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const el = await renderNode(<LiveLine d={kick} canRetry onRetry={onRetry} />)
    expect(el.textContent).toContain('Kick refused the stream.')
    expect(el.textContent).not.toContain('allow multistreaming')

    const infoBtn = el.querySelector('button[aria-label="More about Kick"]') as HTMLButtonElement
    expect(infoBtn).not.toBeNull()
    expect(infoBtn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => infoBtn.click())
    expect(infoBtn.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain('allow multistreaming')

    const retryBtn = el.querySelector('button[aria-label="Retry Kick"]') as HTMLButtonElement
    expect(retryBtn).not.toBeNull()
    await act(async () => retryBtn.click())
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('LiveCard renders failed destination with (i) disclosure and Retry wired to /golive/resume/{id}', async () => {
    const request = vi.fn(async () => undefined)
    useLive.setState({ conn: { client: { request } } as never })
    const onSaved = vi.fn()
    const view = baseView({
      live: true,
      destinations: [
        baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube' }),
        baseDest({
          id: 'kick',
          kind: 'kick',
          name: 'Kick',
          health: {
            state: 'failed',
            attempts: 3,
            reason: 'Kick refused the stream.',
            refused: true,
            kbps: 0,
            dropped: 0,
            since_ms: 0,
          },
        }),
      ],
    })
    const el = await renderNode(<LiveCard view={view} onSaved={onSaved} />)
    expect(el.textContent).toContain('1 of 2 live · 1 failed')
    expect(el.textContent).toContain('Kick: Kick refused the stream.')
    expect(el.textContent).not.toContain('Allow multistreaming')

    const infoBtn = el.querySelector('button[aria-label="More about Kick"]') as HTMLButtonElement
    await act(async () => infoBtn.click())
    expect(el.textContent).toContain('Allow multistreaming')

    const retryBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    ) as HTMLButtonElement
    expect(retryBtn).not.toBeUndefined()
    await act(async () => retryBtn.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/golive/resume/kick', {})
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('AllFailedBanner shows "Stream stopped: every platform refused" with details behind (i)', async () => {
    const view = baseView({
      live: false,
      destinations: [
        baseDest({
          id: 'kick',
          kind: 'kick',
          name: 'Kick',
          health: {
            state: 'failed',
            attempts: 3,
            reason: 'Kick refused the stream.',
            refused: true,
            kbps: 0,
            dropped: 0,
            since_ms: 0,
          },
        }),
        baseDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          health: {
            state: 'failed',
            attempts: 3,
            reason: 'Stream key was refused.',
            detail: 'YouTube refused the stream key.',
            refused: true,
            kbps: 0,
            dropped: 0,
            since_ms: 0,
          },
        }),
      ],
    })
    const el = await renderNode(<AllFailedBanner view={view} />)
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    expect(el.textContent).toContain('Stream stopped: every platform refused')
    expect(el.textContent).not.toContain('YouTube refused the stream key.')

    const infoBtn = el.querySelector(
      'button[aria-label="More about why the stream stopped"]',
    ) as HTMLButtonElement
    await act(async () => infoBtn.click())
    expect(el.textContent).toContain('Kick: Kick refused the stream.')
    expect(el.textContent).toContain('Allow multistreaming')
    expect(el.textContent).toContain('YouTube refused the stream key.')
  })
})
