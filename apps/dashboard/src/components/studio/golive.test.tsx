import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DestinationView, GoLiveView } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { AllFailedBanner, GoLiveTab, LiveCard, Platforms, RowText, liveStatus } from './golive'
import { describeDestinationRate, describeStreamCap } from './bitrate-summary'
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
})
