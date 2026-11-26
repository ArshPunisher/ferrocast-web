import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient, type FerroEvent, type LiveFrame } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { useLive } from '../lib/store'
import { Home } from './Home'

let root: Root | null = null
let engine: DemoEngine | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  engine?.dispose()
  engine = null
  document.body.innerHTML = ''
  useLive.setState({
    conn: null,
    connectors: null,
    viewers: {},
    resyncs: 0,
    peakViewers: 0,
    streamStartedAt: null,
  })
})

function statValue(host: HTMLElement, label: string): string {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.textContent?.trim() === label) {
      const card = node.parentElement?.closest('div')?.parentElement
      const siblingText = node.parentElement?.nextElementSibling?.textContent?.trim()
      if (siblingText) return siblingText
      const nums = card?.textContent?.match(/[\d,.]+/)
      if (nums) return nums[0]
    }
    node = walker.nextNode()
  }
  return ''
}

async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for condition. Text: ${document.body.textContent ?? ''}`)
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15))
    })
  }
}

describe('Home live viewer and monotonic peak cards', () => {
  it('updates Watching now live, keeps Peak monotonic on drops, and subtracts offline platforms', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, setupDone: true })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    vi.spyOn(client, 'sessionStats').mockResolvedValue({
      live: true,
      started_at: 1_000_000,
      messages: 0,
      follows: 0,
      subs: 0,
      tips: [],
      bits: 0,
      peak_viewers: 10,
      viewers: { twitch: 10 },
    })
    const status = await client.status()
    useLive.setState({
      conn: { mode: 'local', client, socket: () => null } as never,
      connectors: {
        ...status.connectors,
        twitch: { ...status.connectors.twitch, state: 'connected' },
        youtube: { ...status.connectors.youtube, state: 'connected' },
      },
      status: {
        ...status,
        live: { twitch: true, youtube: true, kick: false },
      },
      viewers: { twitch: 10 },
      resyncs: 0,
      peakViewers: 0,
      streamStartedAt: null,
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Home />)
    })
    await waitFor(() => statValue(host, 'Watching now') === '10')

    expect(statValue(host, 'Watching now')).toBe('10')
    expect(statValue(host, 'Peak')).toBe('10')

    const viewerEvent = (
      platform: 'twitch' | 'youtube',
      count: number,
      seq: number,
    ): FerroEvent => ({
      id: `v-${seq}`,
      seq,
      channel: null,
      source_id: null,
      occurred_at: 1_000_000 + seq * 1000,
      received_at: 1_000_000 + seq * 1000,
      origin: 'live',
      platform,
      kind: { type: 'viewer_count', count },
    })

    // Live viewer counts rise to 150 total.
    await act(async () => {
      useLive
        .getState()
        .apply([
          { v: 1, type: 'event', data: viewerEvent('twitch', 100, 1) } as LiveFrame,
          { v: 1, type: 'event', data: viewerEvent('youtube', 50, 2) } as LiveFrame,
        ])
    })
    expect(statValue(host, 'Watching now')).toBe('150')
    expect(statValue(host, 'Peak')).toBe('150')

    // Viewer counts fluctuate downward while a periodic sessionStats reload returns stale Peak 10 or server Peak 150.
    await act(async () => {
      useLive
        .getState()
        .apply([{ v: 1, type: 'event', data: viewerEvent('twitch', 60, 3) } as LiveFrame])
    })
    expect(statValue(host, 'Watching now')).toBe('110')
    expect(statValue(host, 'Peak')).toBe('150')

    // One platform goes offline: Watching now drops to remaining live platform, Peak remains 150.
    await act(async () => {
      useLive.getState().apply([
        {
          v: 1,
          type: 'event',
          data: {
            id: 'off-1',
            seq: 4,
            channel: null,
            source_id: null,
            occurred_at: 1_005_000,
            received_at: 1_005_000,
            origin: 'live',
            platform: 'youtube',
            kind: { type: 'stream_offline' },
          },
        } as LiveFrame,
      ])
    })
    expect(statValue(host, 'Watching now')).toBe('60')
    expect(statValue(host, 'Peak')).toBe('150')
  })

  it('drops old stream peak immediately on stream_online and reloads stats without waiting 20s', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, setupDone: true })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const statsSpy = vi
      .spyOn(client, 'sessionStats')
      .mockResolvedValueOnce({
        live: false,
        started_at: 1_000_000,
        messages: 0,
        follows: 0,
        subs: 0,
        tips: [],
        bits: 0,
        peak_viewers: 200,
        viewers: {},
      })
      .mockResolvedValue({
        live: true,
        started_at: 2_000_000,
        messages: 0,
        follows: 0,
        subs: 0,
        tips: [],
        bits: 0,
        peak_viewers: 0,
        viewers: {},
      })
    const status = await client.status()
    useLive.setState({
      conn: { mode: 'local', client, socket: () => null } as never,
      connectors: status.connectors,
      status: {
        ...status,
        live: { twitch: false, youtube: false, kick: false },
      },
      viewers: {},
      resyncs: 0,
      peakViewers: 0,
      streamStartedAt: null,
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Home />)
    })
    await waitFor(() => statValue(host, 'Peak') === '200')

    await act(async () => {
      useLive.getState().apply([
        {
          v: 1,
          type: 'event',
          data: {
            id: 'on-2',
            seq: 10,
            channel: null,
            source_id: null,
            occurred_at: 2_000_000,
            received_at: 2_000_000,
            origin: 'live',
            platform: 'twitch',
            kind: { type: 'stream_online', title: 'Stream 2' },
          },
        } as LiveFrame,
      ])
    })

    expect(statValue(host, 'Peak')).toBe('0')
    await waitFor(() => statsSpy.mock.calls.length >= 2)
  })
})
