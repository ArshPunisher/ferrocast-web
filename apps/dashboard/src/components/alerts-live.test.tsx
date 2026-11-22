import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLive } from '../lib/store'
import { QueuePanel } from './alerts-live'

let root: Root | null = null

describe('QueuePanel empty/playing transition (Problem 6)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null, queue: null })
  })

  it('never renders Nothing playing and Playing now simultaneously during transition', async () => {
    useLive.setState({
      conn: { client: { request: vi.fn(async () => undefined) } } as never,
      queue: { paused: false, muted: false, playing: null, waiting: [] },
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<QueuePanel />))
    expect(host.textContent).toContain('Nothing playing')
    expect(host.textContent).not.toContain('Playing now')

    await act(async () => {
      useLive.setState({
        queue: {
          paused: false,
          muted: false,
          waiting: [],
          playing: {
            started_at: Date.now(),
            alert: {
              alert_id: 'a-1',
              event_id: 'e-1',
              rule_id: 'r-1',
              variation_id: 'v-1',
              kind: 'follow',
              platform: 'twitch',
              title: 'NightbotWannabe followed!',
              body: '',
              image: null,
              sound: null,
              volume: 80,
              duration_ms: 4000,
              layout: 'top',
              css: '',
              tts_text: null,
              tts_audio: null,
              test: true,
            },
          },
        },
      })
    })

    // Under mode="popLayout", both cards exist in DOM simultaneously during exit.
    // Under mode="wait", only one state renders at a time so they never overlap.
    const bothPresentDuringExit =
      host.textContent?.includes('Nothing playing') && host.textContent?.includes('Playing now')
    expect(bothPresentDuringExit).toBe(false)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })
    expect(host.textContent).toContain('Playing now')
    expect(host.textContent).not.toContain('Nothing playing')
  })
})
