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
})
