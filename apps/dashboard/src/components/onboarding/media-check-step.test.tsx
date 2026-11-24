// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaCheckStep } from './MediaCheckStep'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FRAME_A = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>'
const FRAME_B = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text>B</text></svg>'

function makeEngine(over: Record<string, unknown> = {}) {
  return {
    status: vi.fn(async () => ({ available: true, running: true })),
    start: vi.fn(async () => ({ available: true, running: true })),
    kinds: vi.fn(async () => ({
      inputs: [
        { id: 'av_capture_input_v2', name: 'Camera' },
        { id: 'coreaudio_input_capture', name: 'Mic' },
      ],
      filters: [],
    })),
    scenes: vi.fn(async () => ({ current: 'Main', list: ['Main'] })),
    options: vi.fn(async (kind: string) => {
      if (kind === 'av_capture_input_v2') {
        return [
          {
            key: 'device',
            label: 'Device',
            type: 'list',
            choices: ['iPhone Camera'],
            values: ['iphone-cam'],
          },
        ]
      }
      return [
        {
          key: 'device_id',
          label: 'Device',
          type: 'list',
          choices: ['KREO KAST'],
          values: ['kreo-id'],
        },
      ]
    }),
    audio: vi.fn(async () => [
      {
        name: 'Mic/Aux',
        kind: 'coreaudio_input_capture',
        channel: 3,
        volume_db: 0,
        muted: false,
        monitor: 'off',
      },
    ]),
    settings: vi.fn(async () => ({ device_id: 'kreo-id' })),
    sources: vi.fn(async () => []),
    filters: vi.fn(async () => []),
    sourceStill: vi.fn(async () => ({ image: FRAME_A })),
    levels: vi.fn(async () => ({
      'Mic/Aux': { peak: [-18, -18], magnitude: [-24, -24] },
    })),
    update: vi.fn(async () => undefined),
    setAudio: vi.fn(async () => undefined),
    setChannel: vi.fn(async () => undefined),
    ...over,
  }
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
}

describe('MediaCheckStep camera preview polling (W3)', () => {
  let host: HTMLDivElement
  let root: Root | null = null
  let hidden = false

  beforeEach(() => {
    hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('refreshes snapshot automatically about every 1 s and keeps only one request in flight', async () => {
    let call = 0
    let pendingResolve: ((v: { image: string | null; error?: string | null }) => void) | null = null
    const engine = makeEngine({
      sourceStill: vi.fn(() => {
        call++
        if (call === 1) return Promise.resolve({ image: FRAME_A })
        if (call === 2) {
          return new Promise<{ image: string | null; error?: string | null }>((r) => {
            pendingResolve = r
          })
        }
        return Promise.resolve({ image: FRAME_B })
      }),
    })

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MediaCheckStep
          engine={engine as never}
          headingId="h"
          headingRef={{ current: null }}
          onBack={() => {}}
          onContinue={() => {}}
        />,
      )
      await flush()
    })

    expect(engine.sourceStill).toHaveBeenCalledTimes(1)
    expect(host.querySelector('img')?.getAttribute('src')).toBe(FRAME_A)

    // After 1000 ms, a 2nd request starts (slow, still pending).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)

    // Even after 4000 ms more while the 2nd request is in flight, no 3rd request launches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)

    // Resolve the 2nd request -> 1000 ms later the 3rd request launches.
    await act(async () => {
      pendingResolve?.({ image: FRAME_B })
      await flush()
    })
    expect(host.querySelector('img')?.getAttribute('src')).toBe(FRAME_B)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(3)
  })

  it('stops polling when page becomes hidden, resumes when visible, and stops on unmount', async () => {
    const engine = makeEngine()
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MediaCheckStep
          engine={engine as never}
          headingId="h"
          headingRef={{ current: null }}
          onBack={() => {}}
          onContinue={() => {}}
        />,
      )
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(1)

    // Page becomes hidden -> no polls happen while hidden.
    hidden = true
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(6000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(1)

    // Page returns visible -> resumes polling cleanly.
    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)

    // Unmount -> stops completely.
    await act(async () => root?.unmount())
    root = null
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)
  })

  it('shows waiting message on stopped picture, backs off to 5 s, keeps Refresh frame, and auto-resumes', async () => {
    let stillResult: { image: string | null; error?: string | null } = { image: FRAME_A }
    const engine = makeEngine({
      sourceStill: vi.fn(async () => stillResult),
    })

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MediaCheckStep
          engine={engine as never}
          headingId="h"
          headingRef={{ current: null }}
          onBack={() => {}}
          onContinue={() => {}}
        />,
      )
      await flush()
    })
    expect(host.querySelector('img')?.getAttribute('src')).toBe(FRAME_A)

    // Simulate iPhone sleeping / camera stopping (no frame).
    stillResult = { image: null }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain(
      'Waiting for your camera. An iPhone can switch off when it sleeps or locks: unlock it and keep it near. Ferrocast will pick it up again.',
    )
    expect(host.querySelector('button')?.textContent).toBeDefined()
    const refreshBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Refresh frame'),
    )
    expect(refreshBtn).toBeDefined()

    // Should back off to 5000 ms while failing (no call at 1000..4000 ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(2)

    // At 5000 ms total backoff, retries; iPhone unlocked -> returns FRAME_B and resumes 1 s cadence.
    stillResult = { image: FRAME_B }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(3)
    expect(host.querySelector('img')?.getAttribute('src')).toBe(FRAME_B)

    // Back to ~1 s checks once healthy again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(engine.sourceStill).toHaveBeenCalledTimes(4)
  })

  it('triggers immediate single-flight check when Refresh frame is pressed while waiting, and handles error backoff recovery', async () => {
    let stillCount = 0
    const engine = makeEngine({
      sourceStill: vi.fn(async () => {
        stillCount++
        if (stillCount === 1) return { image: FRAME_A }
        if (stillCount === 2) throw new Error('camera sleep disconnect')
        return { image: FRAME_B }
      }),
    })

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MediaCheckStep
          engine={engine as never}
          headingId="h"
          headingRef={{ current: null }}
          onBack={() => {}}
          onContinue={() => {}}
        />,
      )
      await flush()
    })
    expect(stillCount).toBe(1)

    // 1000 ms later -> transient error after having shown a frame -> enters waiting state + 5 s backoff.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await flush()
    })
    expect(stillCount).toBe(2)
    expect(host.textContent).toContain('Waiting for your camera. An iPhone can switch off')

    // Manual Refresh frame bypasses remaining backoff and immediately recovers.
    const refreshBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Refresh frame'),
    )
    expect(refreshBtn).toBeDefined()
    await act(async () => {
      refreshBtn!.click()
      await flush()
    })
    expect(stillCount).toBe(3)
    expect(host.querySelector('img')?.getAttribute('src')).toBe(FRAME_B)
  })
})
