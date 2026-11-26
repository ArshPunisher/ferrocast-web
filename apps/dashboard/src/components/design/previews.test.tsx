import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ResolvedLinks, Widget } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { ScenePreview, useSampleState } from './previews'
import { BUILTINS } from '@ferrocast/designs'

let root: Root | null = null

describe('design previews stability and error recovery', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null, links: null, labels: null })
  })

  it('keeps sample events and chat array references stable across async links/labels updates', async () => {
    const snapshots: { events: unknown; chat: unknown; links: ResolvedLinks | null | undefined }[] =
      []
    const widgets: Widget[] = []
    function Probe() {
      const st = useSampleState(widgets)
      snapshots.push({ events: st.events, chat: st.chat, links: st.links })
      return null
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Probe />)
    })
    await act(async () => {
      useLive.getState().setLinks({
        twitch: 'twitch.tv/arsh',
        youtube: null,
        kick: null,
        facebook: null,
        discord: null,
        instagram: null,
        x: null,
        tiktok: null,
        website: null,
        custom: [],
        socials: ['twitch.tv/arsh'],
        channel_name: 'Arsh',
        next_stream: null,
        next_stream_at: null,
      })
      useLive.getState().setLabels({ latest_follower: 'Mina' })
    })

    expect(snapshots.length).toBeGreaterThanOrEqual(2)
    expect(snapshots.at(-1)?.events).toBe(snapshots[0]?.events)
    expect(snapshots.at(-1)?.chat).toBe(snapshots[0]?.chat)
  })

  it('retries useCreatorPreview after a transient boot error instead of poisoning WeakSet', async () => {
    const design = BUILTINS.find((d) => d.kind === 'theme')!
    const linksSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('boot race'))
      .mockResolvedValue({
        custom: [],
        resolved: {
          twitch: 'twitch.tv/recovered',
          youtube: null,
          kick: null,
          facebook: null,
          discord: null,
          instagram: null,
          x: null,
          tiktok: null,
          website: null,
          custom: [],
          socials: ['twitch.tv/recovered'],
          channel_name: 'Recovered',
          next_stream: null,
          next_stream_at: null,
        },
      })
    const labelsSpy = vi.fn().mockResolvedValue({ latest_follower: 'RecoveredFan' })
    const client = { links: linksSpy, labels: labelsSpy }
    useLive.setState({ conn: { client } as never, links: null, labels: null })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<ScenePreview design={design} sceneKey="starting_soon" />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(linksSpy).toHaveBeenCalledTimes(1)
    expect(useLive.getState().links).toBeNull()

    // Remounting after transient failure must retry instead of permanently skipping this client.
    await act(async () => root?.unmount())
    root = createRoot(host)
    await act(async () => {
      root!.render(<ScenePreview design={design} sceneKey="starting_soon" />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(linksSpy).toHaveBeenCalledTimes(2)
    expect(useLive.getState().links?.twitch).toBe('twitch.tv/recovered')
  })
})
