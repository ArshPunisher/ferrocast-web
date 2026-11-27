import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DestinationView, GoLiveView } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { setPictureSource } from '../../lib/picture'
import {
  AllFailedBanner,
  GoLiveTab,
  LiveCard,
  Platforms,
  RowText,
  liveStatus,
  useMerged,
} from './golive'
import { describeDestinationRate, describeStreamCap } from './bitrate-summary'
import { GoLiveDock, LiveLine } from './desk/golive-dock'
import { DeskProvider, type Desk } from './desk/common'
import { DockWorkspace } from './desk/layout'

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

  const longSummary =
    'Twitch takes up to 6,000 kbps of video; you’re sending 7,011 kbps. Lower the video bitrate to 5,500 kbps or less, or viewers may see it stutter.'
  const bitrateIssue = {
    code: 'bitrate' as const,
    summary: longSummary,
    detail: longSummary,
    fix_kbps: 5500,
  }

  it('a bitrate warning is a short chip on the name line; the sentence and the fix are behind it', async () => {
    const fixBitrate = vi.fn()
    const el = await renderNode(
      <RowText
        fixBitrate={fixBitrate}
        d={baseDest({ rules: [longSummary], issues: [bitrateIssue] })}
      />,
    )
    // The row keeps its two lines: nothing long is in it until the chip is pressed.
    expect(el.textContent).toContain('Bitrate too high')
    expect(el.textContent).not.toContain('7,011')
    expect(el.textContent).not.toContain('stutter')
    // The chip sits on the name's line, and it is a button named by the whole sentence.
    const chip = el.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(chip.getAttribute('aria-label')).toContain('you’re sending 7,011 kbps')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.parentElement?.querySelector('b')?.textContent).toBe('Twitch')
    await act(async () => chip.click())
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain('viewers may see it stutter')
    const fixBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Use 5,500 kbps'),
    ) as HTMLButtonElement
    await act(async () => fixBtn.click())
    expect(fixBitrate).toHaveBeenCalledWith(5500)
    // Escape closes it again.
    const panel = el.querySelector(`#${chip.getAttribute('aria-controls')}`) as HTMLElement
    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
  })

  it('with room the fix is one press next to the chip (hidden by a container query when narrow)', async () => {
    const fixBitrate = vi.fn()
    const el = await renderNode(
      <RowText fixBitrate={fixBitrate} d={baseDest({ issues: [bitrateIssue] })} />,
    )
    const inline = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent === 'Use 5,500',
    ) as HTMLButtonElement
    expect(inline).not.toBeUndefined()
    expect(inline.className).toContain('@[19rem]:inline-flex')
    await act(async () => inline.click())
    expect(fixBitrate).toHaveBeenCalledWith(5500)
  })

  it('keeps the legacy rules string fallback working when an older engine omits issues', async () => {
    const legacy = 'Twitch needs a keyframe at least every 2 s.'
    const el = await renderNode(<RowText d={baseDest({ rules: [legacy] })} />)
    expect(el.textContent).toContain('Stream rule')
    expect(el.textContent).not.toContain(legacy)
    const chip = el.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(chip.getAttribute('aria-label')).toContain(legacy)
    await act(async () => chip.click())
    expect(el.textContent).toContain(legacy)
  })

  it('several notices share one chip ("+2"); the panel lists them all', async () => {
    const el = await renderNode(
      <RowText
        d={baseDest({
          blocked: 'Connect your Twitch account first.',
          health: null,
          issues: [
            bitrateIssue,
            { code: 'keyint', summary: 'Keyframes every 4 s', detail: 'Set it to 2 s.' },
          ],
        })}
      />,
    )
    expect(el.querySelectorAll('button[aria-expanded]').length).toBe(1)
    expect(el.textContent).toContain('Can’t start')
    expect(el.textContent).toContain('+2')
    const chip = el.querySelector('button[aria-expanded]') as HTMLButtonElement
    await act(async () => chip.click())
    expect(el.textContent).toContain('Connect your Twitch account first.')
    expect(el.textContent).toContain('Set it to 2 s.')
  })

  it('the Kick multistreaming note is a chip too, with the link in the panel', async () => {
    const el = await renderNode(
      <RowText d={baseDest({ kind: 'kick', name: 'Kick', enabled: true, health: null })} />,
    )
    expect(el.textContent).toContain('Kick Partner?')
    expect(el.textContent).not.toContain('Creator Dashboard')
    const chip = el.querySelector('button[aria-expanded]') as HTMLButtonElement
    await act(async () => chip.click())
    expect(el.textContent).toContain('Creator Dashboard')
    expect(
      Array.from(el.querySelectorAll('a')).some((a) => a.textContent?.includes('dashboard')),
    ).toBe(true)
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

  it('LiveCard names the stream key a platform destination sent to, behind (i) and never inline', async () => {
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const view = baseView({
      live: true,
      destinations: [
        baseDest({
          id: 'youtube',
          kind: 'youtube',
          name: 'YouTube',
          key_note: 'Ferrocast · variable',
        }),
        baseDest({ id: 'twitch', kind: 'twitch', name: 'Twitch' }),
      ],
    })
    const el = await renderNode(<LiveCard view={view} onSaved={vi.fn()} />)
    expect(el.textContent).not.toContain('Ferrocast · variable')
    // Only the destination that has a key note has the button.
    expect(el.querySelector('button[aria-label="Which stream key Twitch uses"]')).toBeNull()
    const info = el.querySelector(
      'button[aria-label="Which stream key YouTube uses"]',
    ) as HTMLButtonElement
    expect(info).not.toBeNull()
    await act(async () => info.click())
    expect(el.textContent).toContain('Key: Ferrocast · variable')
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

  it('U6: LiveLine shows full short reconnect reason without truncate and puts retry details behind (i)', async () => {
    const dead = baseDest({
      id: 'c_dead',
      kind: 'custom',
      name: 'S25 Dead',
      health: {
        state: 'reconnecting',
        attempt: 3,
        retry_in_ms: 4000,
        reason: 'Couldn’t reach 127.0.0.1.',
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const el = await renderNode(<LiveLine d={dead} />)
    expect(el.textContent).toContain('Reconnecting, try 3')
    expect(el.textContent).toContain('Couldn’t reach 127.0.0.1.')
    expect(el.textContent).not.toContain('Trying again in 4 s.')
    expect(el.querySelector('.truncate')).toBeNull()

    const infoBtn = el.querySelector(
      'button[aria-label="More about S25 Dead"]',
    ) as HTMLButtonElement
    expect(infoBtn).not.toBeNull()
    expect(infoBtn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => infoBtn.click())
    expect(infoBtn.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain('Trying again in 4 s.')
  })

  it('U6: LiveLine splits long Kick reconnect advice so short reason shows in full and advice stays behind (i)', async () => {
    const kick = baseDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      health: {
        state: 'reconnecting',
        attempt: 2,
        retry_in_ms: 5000,
        reason:
          'Kick closed the stream. Kick took the stream and closed it at once: allow multistreaming in Kick’s settings.',
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const el = await renderNode(<LiveLine d={kick} />)
    expect(el.textContent).toContain('Reconnecting, try 2')
    expect(el.textContent).toContain('Kick closed the stream.')
    expect(el.textContent).not.toContain('allow multistreaming')
    const infoBtn = el.querySelector('button[aria-label="More about Kick"]') as HTMLButtonElement
    await act(async () => infoBtn.click())
    expect(el.textContent).toContain('allow multistreaming')
    expect(el.textContent).toContain('Trying again in 5 s.')
  })

  it('LiveCard says it is live and not sending when every platform is off, with End stream', async () => {
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const view = baseView({
      live: true,
      destinations: [baseDest({ id: 'twitch', enabled: false, health: null })],
    })
    const el = await renderNode(<LiveCard view={view} onSaved={vi.fn()} />)
    expect(el.textContent).toContain('Live, not sending to any platform.')
    expect(el.textContent).toContain('keep going')
    const end = [...el.querySelectorAll('button')].find((b) => b.textContent === 'End stream')
    expect(end).toBeTruthy()
  })
})

describe('RowText: a blocked row says it once', () => {
  const blocked = 'Connect your Twitch account first.'
  it('has a Can’t start chip before it goes live (nothing else says it)', async () => {
    const el = await renderNode(<RowText d={baseDest({ blocked, health: null })} />)
    expect(el.textContent).toContain('Can’t start')
  })

  it('leaves it to the live line once the row has a health (shown twice before)', async () => {
    const el = await renderNode(
      <RowText
        d={baseDest({
          blocked,
          health: { state: 'failed', attempts: 1, reason: 'x', since_ms: 0 } as never,
        })}
      />,
    )
    expect(el.textContent).not.toContain('Can’t start')
  })
})

describe('liveStatus', () => {
  const dest = (o: Partial<DestinationView>): DestinationView =>
    ({
      id: 'k',
      kind: 'kick',
      canvas: 'main',
      name: 'Kick',
      enabled: true,
      connected: true,
      health: { state: 'live', kbps: 6000, dropped: 0, since_ms: 0 },
      blocked: null,
      rules: [],
      ...o,
    }) as DestinationView
  it('shows an active backup by its health, an idle one as Standby, an off one as Off', () => {
    expect(liveStatus(dest({ enabled: false, backup_for: 'Twitch' }), true, 6000)).toBe('6.0 Mbps')
    expect(liveStatus(dest({ enabled: false }), true, 6000)).toBe('Off')
    expect(liveStatus(dest({ enabled: false, standby_for: 'Twitch' }), true, 6000)).toBe('Standby')
  })
})

describe('Setup in OBS mode when OBS is already streaming (Problem 3)', () => {
  it('offers Stop streaming in OBS alongside disabled Point OBS at Ferrocast and clears the block', async () => {
    localStorage.setItem('fc-golive-picture', 'obs')
    window.dispatchEvent(new CustomEvent('fc-picture-source', { detail: 'obs' }))
    let streaming = true
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'GET' && path === '/api/v1/golive') {
        return {
          ingest: 'rtmp://127.0.0.1:1935/live',
          obs: {
            connected: true,
            points_here: false,
            streaming,
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
        }
      }
      if (method === 'GET' && path === '/api/v1/obs/stream') return { streaming }
      if (method === 'POST' && path === '/api/v1/obs/stream') {
        streaming = Boolean((body as { on?: boolean })?.on)
        return { streaming }
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    const el = await renderNode(<GoLiveTab />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    const buttons = Array.from(el.querySelectorAll('button'))
    const pointBtn = buttons.find((b) => b.textContent?.includes('Point OBS at Ferrocast'))
    const stopBtn = buttons.find((b) => b.textContent?.includes('Stop streaming in OBS'))
    expect(pointBtn?.disabled).toBe(true)
    expect(stopBtn).toBeTruthy()
    await act(async () => stopBtn!.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/obs/stream', { on: false })
    expect(
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Point OBS at Ferrocast'),
      )?.disabled,
    ).toBe(false)
  })
})

describe('U2 Platforms and RowText shared-bitrate explanation', () => {
  it('shows consistent total rates, reconciles upload math, excludes blocked, and honors ignore_service_limits', async () => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    const tw = baseDest({
      id: 'twitch',
      kind: 'twitch',
      name: 'Twitch',
      health: null,
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'Capped at 6,000 kbps for Twitch',
        detail: 'Your 12,000 kbps stream is capped at 6,000 kbps.',
      },
    })
    const yt = baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube', health: null })
    const kick = baseDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      health: null,
      capped: {
        kbps: 6000,
        separate_encode: false,
        summary: 'Capped at 6,000 kbps for Twitch',
        detail: 'Your 12,000 kbps stream is capped at 6,000 kbps.',
      },
    })
    const view: GoLiveView = {
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
      destinations: [tw, yt, kick],
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
    }
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    const el = await renderNode(<Platforms view={view} onSaved={() => {}} videoKbps={12000} />)
    expect(el.textContent).toContain('Same stream as Twitch: 6.2 Mbps')
    expect(el.textContent).toContain('Capped at 6,000 kbps for Twitch')
    expect(el.textContent).toContain('3 places x 6.2 Mbps = 18.6 Mbps upload')
    const whyBtn = el.querySelector('button[aria-label="Why upload adds up"]') as HTMLButtonElement
    expect(whyBtn).not.toBeNull()
  })

  it('excludes blocked destinations and suppresses caps when ignore_service_limits is true', async () => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    const tw = baseDest({ id: 'twitch', kind: 'twitch', name: 'Twitch', health: null })
    const yt = baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube', health: null })
    const kick = baseDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      health: null,
      blocked: 'Connect Kick first.',
    })
    const view: GoLiveView = {
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
      destinations: [tw, yt, kick],
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
        ignore_service_limits: true,
      },
    }
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    const ignoredEl = await renderNode(
      <Platforms view={view} onSaved={() => {}} videoKbps={12000} />,
    )
    expect(ignoredEl.textContent).not.toContain('Same stream as Twitch')
    expect(ignoredEl.textContent).not.toContain('Capped at')
    expect(ignoredEl.textContent).toContain('2 places x 12 Mbps = 24 Mbps upload')
  })

  it('compact GoLiveDock RowText shows consistent 6.2 Mbps rate and "Same stream as Twitch: 6.2 Mbps" on YouTube', async () => {
    const tw = baseDest({ id: 'twitch', kind: 'twitch', name: 'Twitch', health: null })
    const yt = baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube', health: null })
    const kick = baseDest({ id: 'kick', kind: 'kick', name: 'Kick', health: null })
    const cap = describeStreamCap(12000, [tw, yt, kick])
    const rate = describeDestinationRate(yt, cap, { streamKbps: 6160, audioKbps: 160 })
    const rowEl = await renderNode(<RowText d={yt} rateInfo={rate} compact />)
    expect(rowEl.textContent).toContain('6.2 Mbps')
    expect(rowEl.textContent).toContain('Same stream as Twitch: 6.2 Mbps')
  })

  it('uses pl-0 sm:pl-[92px] on ReachLine in Platforms so mobile connection results are not over-indented', async () => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    const tw = baseDest({ id: 'twitch', kind: 'twitch', name: 'Twitch', health: null })
    const view: GoLiveView = {
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
      destinations: [tw],
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
    }
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'POST' && path.includes('/reach')) {
        return { ok: true, message: 'Reachable in 28 ms.' }
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    const el = await renderNode(<Platforms view={view} onSaved={() => {}} />)
    const testBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Test connection to Twitch',
    ) as HTMLButtonElement | undefined
    expect(testBtn).toBeDefined()
    await act(async () => {
      testBtn!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const reach = el.querySelector('[data-platform-tile="twitch"] [role="status"]')
    expect(reach).not.toBeNull()
    expect(reach!.className).toContain('pl-0')
    expect(reach!.className).toContain('sm:pl-[92px]')
    expect(reach!.className).not.toContain('pl-[86px]')
  })

  it('GoLiveDock allows turning off a destination that is enabled and blocked, while keeping off+blocked disabled', async () => {
    const tw = baseDest({
      id: 'twitch',
      kind: 'twitch',
      name: 'Twitch',
      enabled: true,
      connected: false,
      health: null,
      blocked: 'Connect Twitch first.',
    })
    const kick = baseDest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      enabled: false,
      connected: false,
      health: null,
      blocked: 'Connect Kick first.',
    })
    const view: GoLiveView = {
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
      destinations: [tw, kick],
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
    }
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'PUT' && path === '/api/v1/golive/destinations') {
        return { ok: true, destinations: (body as { destinations: unknown[] }).destinations }
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })
    const desk = {
      api: { studioSettings: vi.fn(), setStudioSettings: vi.fn() },
      scenes: { data: { current: 'Main', vertical: null }, reload: vi.fn() },
      prefs: { data: { video_kbps: 6000, audio_kbps: 160 }, set: vi.fn() },
      stats: null,
    } as unknown as Desk
    const res = {
      data: view,
      loading: false,
      error: null,
      reload: vi.fn(),
      set: vi.fn(),
    }

    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )

    try {
      const el = await renderNode(
        <DeskProvider value={desk}>
          <DockWorkspace
            stage={null}
            docks={(id) => (id === 'golive' ? <GoLiveDock res={res} view={view} /> : null)}
          />
        </DeskProvider>,
      )

      const twSwitch = el.querySelector(
        'button[role="switch"][aria-label="Go live on Twitch"]',
      ) as HTMLButtonElement
      const kickSwitch = el.querySelector(
        'button[role="switch"][aria-label="Go live on Kick"]',
      ) as HTMLButtonElement
      expect(twSwitch.disabled).toBe(false)
      expect(kickSwitch.disabled).toBe(true)

      await act(async () => {
        twSwitch.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(request).toHaveBeenCalledWith('PUT', '/api/v1/golive/destinations', {
        destinations: [
          { id: 'twitch', enabled: false },
          { id: 'kick', enabled: false },
        ],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Platforms does not reload the stream settings on every live frame', async () => {
    setPictureSource('ferrocast')
    const mk = (n: number): GoLiveView =>
      ({
        ingest: 'rtmp://127.0.0.1:1935/live',
        obs: { connected: false, points_here: false, streaming: false },
        live: true,
        stats: { kbps: 6000 + n },
        vertical_live: false,
        vertical_stats: { kbps: 0 },
        destinations: [baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube' })],
        upload: null,
        protect: true,
        aitum_ok: false,
        auto_quality: true,
        cut: { source: 'canvas', ffmpeg: { state: 'ready' }, state: null, config: { kbps: 4500 } },
        advanced: { rules: {}, per: {} },
      }) as unknown as GoLiveView
    const request = vi.fn(async () => ({ video_kbps: 6000, audio_kbps: 160 }))
    useLive.setState({ conn: { client: { request } } as never })
    await renderNode(<Platforms view={mk(0)} onSaved={() => {}} />)
    await act(async () => {
      setPictureSource('ferrocast')
      await Promise.resolve()
      await Promise.resolve()
    })
    const first = request.mock.calls.length
    expect(first).toBeGreaterThan(0)
    for (let i = 1; i <= 3; i++) {
      await act(async () => {
        root!.render(<Platforms view={mk(i)} onSaved={() => {}} />)
        await Promise.resolve()
      })
    }
    expect(request.mock.calls.length).toBe(first)
  })

  it('Platforms tags fetchedSettings with conn, refetches on view change, and prefers explicit audioKbps', async () => {
    setPictureSource('ferrocast')
    const yt = baseDest({ id: 'youtube', kind: 'youtube', name: 'YouTube', health: null })
    const makeView = (override: Partial<GoLiveView> = {}): GoLiveView => ({
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
      destinations: [yt],
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
      ...override,
    })

    let settingsA = { video_kbps: 8000, audio_kbps: 128 }
    const connA = {
      client: {
        request: vi.fn(async (_method: string, path: string) =>
          path.includes('/studio/engine/settings') ? settingsA : {},
        ),
      },
    }
    const connB = {
      client: {
        request: vi.fn(async () => new Promise(() => {})),
      },
    }

    useLive.setState({ conn: connA as never })
    const el = await renderNode(<Platforms view={makeView()} onSaved={() => {}} />)
    await act(async () => {
      setPictureSource('ferrocast')
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // 8000 + 128 = 8128 kbps -> 8.1 Mbps
    expect(el.textContent).toContain('8.1 Mbps')

    // Explicit audioKbps prop must beat fetchedSettings.audio_kbps even after initial fetch.
    await act(async () => {
      root!.render(
        <Platforms view={makeView()} onSaved={() => {}} videoKbps={6000} audioKbps={320} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    // 6000 + 320 = 6320 kbps -> 6.3 Mbps (NOT stale fetched audio_kbps 128 -> 6.1 Mbps)
    expect(el.textContent).toContain('6.3 Mbps')

    // Returning to unmanaged videoKbps refetches when view updates.
    settingsA = { video_kbps: 7000, audio_kbps: 160 }
    await act(async () => {
      root!.render(<Platforms view={makeView()} onSaved={() => {}} />)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(el.textContent).toContain('7.2 Mbps')

    // Switching conn must drop connA's tagged fetchedSettings immediately instead of leaking 7.2 Mbps.
    await act(async () => {
      useLive.setState({ conn: connB as never })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(el.textContent).not.toContain('7.2 Mbps')
    expect(el.textContent).toContain('6.2 Mbps')
  })
})

describe('per-destination quality integration in GoLiveDock and Platforms', () => {
  const mkView = (overrides: Partial<GoLiveView> = {}): GoLiveView =>
    ({
      ingest: null,
      obs: {
        connected: false,
        points_here: false,
        streaming: false,
        before: null,
        aitum: null,
        vertical: null,
      },
      live: false,
      stats: { kbps: 0, fps: 0, dropped: 0 },
      vertical_live: false,
      vertical_stats: { kbps: 0, fps: 0, dropped: 0 },
      encode_groups: [],
      encode_budget: {
        status: 'ok',
        source: 'apple_silicon',
        used_mpx_s: 120,
        limit_mpx_s: 400,
        used_sessions: 2,
        max_sessions: 4,
      },
      destinations: [
        {
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
          capped: {
            kbps: 6000,
            summary: 'Capped at 6,000 kbps for Twitch',
            detail: 'Twitch cap detail',
          },
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
        },
        {
          id: 'youtube',
          name: 'YouTube',
          kind: 'youtube',
          canvas: 'main',
          account: 'channel',
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
            kbps: 12000,
            codec: 'h264',
            audio_kbps: 160,
            auto_fitted: false,
            separate_encode: false,
            group_id: 'main',
            shared_with: [],
          },
        },
      ],
      upload: null,
      protect: true,
      aitum_ok: false,
      cut: {
        source: 'canvas',
        config: { layout: 'split', source: null },
        state: null,
        ffmpeg: 'ready',
      },
      advanced: {
        ignore_service_limits: false,
        per: {},
        server: { ip: 'auto', network: 'auto', low_latency: false, tcp_nodelay: false },
      },
      auto_quality: true,
      ...overrides,
    }) as unknown as GoLiveView

  it('renders List 3b fixed two-line rows, state tags, status popovers, footer problems/strip, and Modal A integration', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
      Object.defineProperty(this, 'open', { value: true, configurable: true })
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      Object.defineProperty(this, 'open', { value: false, configurable: true })
      this.dispatchEvent(new Event('close'))
    }
    setPictureSource('ferrocast')
    const view = mkView({
      live: true,
      destinations: [
        {
          ...mkView().destinations[0]!,
          health: { state: 'live', kbps: 6160, dropped: 0, since_ms: 1000 },
        },
        {
          ...mkView().destinations[1]!,
          health: {
            state: 'reconnecting',
            attempt: 2,
            retry_in_ms: 4000,
            reason: 'YouTube dropped the connection.',
            kbps: 0,
            dropped: 0,
            since_ms: 1000,
          },
        },
      ],
    })
    const nextView = mkView({
      live: true,
      destinations: view.destinations.map((d) =>
        d.id === 'twitch'
          ? {
              ...d,
              quality: { mode: 'custom', width: 1280, height: 720, fps: 30, kbps: 3000 },
              resolved_quality: {
                ...d.resolved_quality!,
                width: 1280,
                height: 720,
                fps: 30,
                kbps: 3000,
                auto_fitted: false,
              },
            }
          : d,
      ),
    })

    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/v1/golive/quality-options') {
        return {
          source: 'studio',
          main: { width: 2560, height: 1440, fps: 60, kbps: 12000, codec: 'h264', audio_kbps: 160 },
          vertical: null,
          budget: {
            status: 'ok',
            source: 'apple_silicon',
            used_mpx_s: 120,
            limit_mpx_s: 400,
            used_sessions: 2,
            max_sessions: 4,
          },
          destinations: {
            twitch: {
              id: 'twitch',
              canvas: 'main',
              locked_reason: null,
              current: { mode: 'same_as_main' },
              resolved: view.destinations[0]!.resolved_quality!,
              options: [
                {
                  id: 'same_as_main',
                  label: 'Same as main',
                  quality: { mode: 'same_as_main' },
                  resolved: { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
                  auto_fitted: true,
                  recommended: false,
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
            },
            youtube: {
              id: 'youtube',
              canvas: 'main',
              locked_reason: null,
              current: { mode: 'same_as_main' },
              resolved: view.destinations[1]!.resolved_quality!,
              options: [],
              custom_limits: null,
            },
          },
        }
      }
      if (method === 'PUT' && path === '/api/v1/golive/destinations/twitch/quality') {
        return nextView
      }
      if (method === 'GET' && path === '/api/v1/studio/settings') {
        return { video_kbps: 12000, audio_kbps: 160 }
      }
      return {}
    })

    useLive.setState({ conn: { client: { request } } as never })
    const res = { data: view, error: null, loading: false, reload: vi.fn(), set: vi.fn() }
    const desk = {
      scenes: { data: null, error: null, loading: false, reload: vi.fn(), set: vi.fn() },
      preflight: { data: null, error: null, loading: false, reload: vi.fn(), set: vi.fn() },
      prefs: {
        data: { video_kbps: 12000, audio_kbps: 160 },
        error: null,
        loading: false,
        reload: vi.fn(),
        set: vi.fn(),
      },
    } as unknown as Desk

    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    try {
      await act(async () => {
        root.render(
          <DeskProvider value={desk}>
            <DockWorkspace
              stage={null}
              docks={(id) =>
                id === 'golive' ? <GoLiveDock res={res as never} view={view} /> : null
              }
            />
          </DeskProvider>,
        )
        setPictureSource('ferrocast')
        await Promise.resolve()
        await Promise.resolve()
      })

      // List 3b tags, line 2, no top banner, footer summary + problems trigger.
      expect(host.querySelector('[data-golive-tag="twitch"]')?.textContent?.trim()).toBe('LIVE')
      expect(host.querySelector('[data-golive-tag="youtube"]')?.textContent?.trim()).toBe(
        'RECONNECTING',
      )
      expect(host.textContent).toContain('1080p60 · 6 Mbps · auto')
      expect(host.textContent).toContain('Reconnecting · try 2')
      const summary = host.querySelector('[data-golive-encode-summary]')
      expect(summary?.textContent).toContain('2 places · 18.3 Mbps · 2 encodes')
      expect(summary?.textContent).toContain('1 reconnecting')

      // Status line opens status popover on YouTube.
      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-status-trigger="youtube"]')?.click()
        await Promise.resolve()
      })
      const statusPop = document.querySelector('[data-golive-status-popover="youtube"]')
      expect(statusPop).not.toBeNull()
      expect(statusPop?.textContent).toContain('YouTube dropped the connection.')

      // Tapping Twitch quality trigger opens One Modal B, switches to Set my own, picks 720p30 + 3 Mbps, applies.
      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')!.click()
        await new Promise((r) => setTimeout(r, 0))
      })
      const modal = document.querySelector<HTMLDialogElement>('[data-platforms-modal]')!
      expect(modal).not.toBeNull()
      expect(modal.textContent).toContain('Twitch quality')
      const setOwnRadio = Array.from(
        modal.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
      ).find((b) => b.textContent?.includes('Set my own'))!
      await act(async () => {
        setOwnRadio.click()
      })
      const btn720 = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.startsWith('720p'),
      )!
      const btn30 = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === '30',
      )!
      const mbpsIn = modal.querySelector<HTMLInputElement>('input[type="number"]')!
      await act(async () => {
        btn720.click()
        btn30.click()
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )!.set!
        setter.call(mbpsIn, '3')
        mbpsIn.dispatchEvent(new Event('input', { bubbles: true }))
        mbpsIn.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const applyBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Apply',
      )!
      await act(async () => {
        applyBtn.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(res.set).toHaveBeenCalledWith(nextView)
      expect(res.reload).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
      useLive.setState({ conn: null })
      setPictureSource('ferrocast')
    }
  })

  it('renders whole-stream failures as compact footer strip in GoLiveDock without top banner', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    setPictureSource('ferrocast')
    const view = mkView({
      live: true,
      destinations: mkView().destinations.map((d) => ({
        ...d,
        health: {
          state: 'failed' as const,
          attempts: 3,
          reason: "Couldn't connect",
          detail: 'Ingest closed.',
          kbps: 0,
          dropped: 0,
          since_ms: 1000,
        },
      })),
    })
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    const res = { data: view, error: null, loading: false, reload: vi.fn(), set: vi.fn() }
    const desk = {
      scenes: { data: null, error: null, loading: false, reload: vi.fn(), set: vi.fn() },
      preflight: { data: null, error: null, loading: false, reload: vi.fn(), set: vi.fn() },
      prefs: {
        data: { video_kbps: 12000, audio_kbps: 160 },
        error: null,
        loading: false,
        reload: vi.fn(),
        set: vi.fn(),
      },
    } as unknown as Desk

    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    try {
      await act(async () => {
        root.render(
          <DeskProvider value={desk}>
            <DockWorkspace
              stage={null}
              docks={(id) =>
                id === 'golive' ? <GoLiveDock res={res as never} view={view} /> : null
              }
            />
          </DeskProvider>,
        )
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(host.textContent).not.toContain('Stream stopped: every platform refused')
      const strip = host.querySelector('[data-golive-footer-strip]')
      expect(strip?.textContent).toContain('Nothing is sending')
      expect(strip?.textContent).toContain('Retry all')
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
      useLive.setState({ conn: null })
    }
  })

  it('renders quality triggers inside Platforms dialog tiles and locks to Same as OBS when OBS is selected', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const view = mkView()
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/v1/golive/quality-options') {
        return {
          source: 'studio',
          main: { width: 2560, height: 1440, fps: 60, kbps: 12000, codec: 'h264', audio_kbps: 160 },
          vertical: null,
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
      }
      if (method === 'GET' && path === '/api/v1/studio/settings') {
        return { video_kbps: 12000, audio_kbps: 160 }
      }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })

    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    try {
      await act(async () => {
        root.render(<Platforms view={view} onSaved={vi.fn()} />)
        setPictureSource('ferrocast')
        await Promise.resolve()
      })
      expect(host.textContent).toContain('1080p60 · 6 Mbps · auto')
      expect(host.textContent).not.toContain('Capped at 6,000 kbps for Twitch')

      await act(async () => {
        setPictureSource('obs')
        await Promise.resolve()
      })
      const twitchTrigger = host.querySelector<HTMLButtonElement>('[data-quality-trigger="twitch"]')
      expect(twitchTrigger?.disabled).toBe(true)
      expect(twitchTrigger?.textContent).toContain('Same as OBS')
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
      useLive.setState({ conn: null })
      setPictureSource('ferrocast')
    }
  })
})

describe('useMerged: a saved change is newer than an older live frame', () => {
  function Probe({ view }: { view: GoLiveView }) {
    const merged = useMerged(view)
    return <span data-probe>{merged?.destinations[0]?.resolved_quality?.kbps}</span>
  }
  const dest = (kbps: number): DestinationView =>
    baseDest({
      resolved_quality: {
        width: 1280,
        height: 720,
        fps: 30,
        kbps,
        codec: 'h264',
        audio_kbps: 160,
        auto_fitted: false,
        separate_encode: false,
        group_id: 'main',
        shared_with: [],
      },
    })
  const viewWith = (kbps: number): GoLiveView =>
    ({
      destinations: [dest(kbps)],
      live: false,
      obs: { connected: false, points_here: false, streaming: false },
      stats: {},
      vertical_stats: {},
      cut: { source: 'canvas', ffmpeg: { state: 'ready' }, state: null },
    }) as unknown as GoLiveView

  it('keeps the saved numbers until a newer frame arrives', async () => {
    const frame = {
      live: false,
      stats: {},
      destinations: [dest(6000)],
    } as unknown as NonNullable<ReturnType<typeof useLive.getState>['studio']['golive']>
    useLive.setState((s) => ({
      studio: { ...s.studio, golive: frame },
      goliveFrameAt: 1000,
      goliveViewAt: 2000,
    }))
    useLive.setState({
      conn: { client: { request: vi.fn(async () => ({})) } } as never,
    })
    const el = await renderNode(<Probe view={viewWith(3000)} />)
    expect(el.querySelector('[data-probe]')?.textContent).toBe('3000')

    // A frame that arrives afterwards is authoritative again.
    await act(async () => {
      useLive.setState({ goliveFrameAt: 3000 })
    })
    expect(el.querySelector('[data-probe]')?.textContent).toBe('6000')
  })
})
