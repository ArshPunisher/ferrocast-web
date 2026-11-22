import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DestinationView, EngineStats, GoLiveView } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { StudioStatusBar, effectiveStreamStatus } from './status-bar'

function baseStats(over: Partial<EngineStats> = {}): EngineStats {
  return {
    engine: { cpu: 2.1, fps: 60, frame_ms: 4, lagged: 0, frames: 600, memory_mb: 340 },
    canvas: { width: 2560, height: 1440, fps: 60 },
    health: { score: 100, verdict: 'great' },
    stream: {
      active: true,
      reconnecting: false,
      bytes: 1_700_000,
      frames: 60,
      dropped: 0,
      error: null,
    },
    record: null,
    ...over,
  }
}

function dest(over: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'dead',
    kind: 'custom',
    canvas: 'main',
    name: 'S25 Dead',
    account: '127.0.0.1',
    enabled: true,
    connected: true,
    health: null,
    blocked: null,
    rules: [],
    ...over,
  }
}

describe('U5: effectiveStreamStatus reflects destination state in Health and Upload', () => {
  it('drops Health to 0 (danger) and Upload to 0 when the only enabled destination failed', () => {
    const failed = dest({
      health: {
        state: 'failed',
        attempts: 6,
        reason: 'Couldn’t reach 127.0.0.1.',
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const res = effectiveStreamStatus(baseStats(), [failed], 13519)
    expect(res.live).toBe(true)
    expect(res.health?.score).toBe(0)
    expect(res.health?.tone).toBe('danger')
    expect(res.uploadKbps).toBe(0)
    expect(res.destNote?.text).toContain('Couldn’t reach 127.0.0.1.')
    expect(res.streamStateLabel).toBe('Failed')
  })

  it('drops Health to 0 (warn) and Upload to 0 while the only enabled destination is reconnecting', () => {
    const reconnecting = dest({
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
    const res = effectiveStreamStatus(baseStats(), [reconnecting], 13519)
    expect(res.health?.score).toBe(0)
    expect(res.health?.tone).toBe('warn')
    expect(res.uploadKbps).toBe(0)
    expect(res.destNote?.text).toBe('Reconnecting to S25 Dead…')
    expect(res.streamStateLabel).toBe('Reconnecting')
  })

  it('degrades Health and keeps live upload rate on partial failure (1 live + 1 failed)', () => {
    const good = dest({
      id: 'local',
      name: 'S25 Local',
      health: { state: 'live', kbps: 14000, dropped: 0, since_ms: 0 },
    })
    const dead = dest({
      health: {
        state: 'failed',
        attempts: 6,
        reason: 'Couldn’t reach 127.0.0.1.',
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const res = effectiveStreamStatus(baseStats(), [good, dead], 13519)
    expect(res.health?.score).toBe(50)
    expect(res.health?.tone).toBe('warn')
    expect(res.uploadKbps).toBe(14000)
    expect(res.destNote?.text).toBe('S25 Dead failed.')
  })

  it('keeps Health 100 and actual destination upload when every enabled destination is live', () => {
    const good = dest({
      id: 'local',
      name: 'S25 Local',
      health: { state: 'live', kbps: 14000, dropped: 0, since_ms: 0 },
    })
    const res = effectiveStreamStatus(baseStats(), [good], 13519)
    expect(res.health?.score).toBe(100)
    expect(res.health?.tone).toBe('ok')
    expect(res.uploadKbps).toBe(14000)
    expect(res.destNote).toBeNull()
  })

  it('omits Health and shows 0 upload during initial connecting handshake', () => {
    const connecting = dest({
      health: { state: 'connecting', kbps: 0, dropped: 0, since_ms: 0 },
    })
    const res = effectiveStreamStatus(baseStats(), [connecting], 13519)
    expect(res.health).toBeNull()
    expect(res.uploadKbps).toBe(0)
    expect(res.streamStateLabel).toBe('Connecting')
  })

  it('hides Health and zeros Upload when stream.failed is set', () => {
    const res = effectiveStreamStatus(
      baseStats({
        stream: {
          active: false,
          reconnecting: false,
          failed: true,
          reason: 'Couldn’t reach 127.0.0.1.',
          bytes: 1_700_000,
          frames: 60,
          dropped: 0,
          error: 'Couldn’t reach 127.0.0.1.',
        },
      }),
      null,
      13519,
    )
    expect(res.live).toBe(false)
    expect(res.health).toBeNull()
    expect(res.uploadKbps).toBe(0)
  })
})

describe('U5: StudioStatusBar DOM', () => {
  let root: Root | null = null

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({
      conn: null,
      goliveView: null,
      goliveViewAt: 0,
      goliveFrameAt: 0,
      studio: {
        lane: undefined,
        added: null,
        health: undefined,
        show: undefined,
        brb: null,
        markers: 0,
        counters: {},
        golive: undefined,
        alert: null,
        autoConfig: null,
      },
    })
  })

  it('renders Health 0 and Upload 0 kb/s when Go live reports the only destination reconnecting', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const stats = baseStats()
    const request = vi.fn(async (_method: string, path: string) => {
      if (path.endsWith('/studio/engine/stats')) return stats
      return {}
    })
    useLive.setState({
      conn: { client: { request } } as never,
      goliveView: {
        destinations: [
          dest({
            health: {
              state: 'reconnecting',
              attempt: 3,
              retry_in_ms: 4000,
              reason: 'Couldn’t reach 127.0.0.1.',
              kbps: 0,
              dropped: 0,
              since_ms: 0,
            },
          }),
        ],
      } as GoLiveView,
      goliveViewAt: Date.now(),
    })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<StudioStatusBar />))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const footer = host.querySelector('footer[aria-label="Studio status"]')
    expect(footer).not.toBeNull()
    expect(footer!.textContent).toContain('Health0')
    expect(footer!.textContent).not.toContain('Health100')
    expect(footer!.textContent).toContain('Upload0 kb/s')
    expect(footer!.textContent).toContain('Reconnecting to S25 Dead…')
  })
  it('says the last seconds of a delayed stream are still going out, with Stop now', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const stats = baseStats({
      stream: null,
      delay: { draining: true, remaining_s: 11.6, mb: 1.5 },
    })
    const request = vi.fn(async (_method: string, path: string) => {
      if (path.endsWith('/studio/engine/stats')) return stats
      return null
    })
    useLive.setState({ conn: { client: { request } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<StudioStatusBar />))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const footer = host.querySelector('footer[aria-label="Studio status"]')
    expect(footer!.textContent).toContain('Sending the last 12 s of your delayed stream…')
    const stop = host.querySelector('button[aria-label^="Stop now"]') as HTMLButtonElement | null
    expect(stop).not.toBeNull()
    await act(async () => stop!.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/studio/engine/stream', {
      on: false,
      discard_delay: true,
    })
  })
})
