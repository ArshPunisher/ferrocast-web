// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineLevel } from '@ferrocast/api'
import type { EngineApi } from './common'
import { Meter } from './mixer'
import {
  ATTACK_MS,
  FLOOR,
  POLL_MS,
  FROZEN_MS,
  STALE_MS,
  activeMeters,
  initialMeter,
  stepMeter,
  useLevelFeed,
  useLevelStatus,
  useSourceLost,
} from './meter-feed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('stepMeter ballistics', () => {
  it('attacks within a few frames and releases smoothly over about 300 ms', () => {
    let s = initialMeter()
    for (let t = 0; t < 4; t++) s = stepMeter(s, -6, 16.7, t * 16.7, 23.53, 23.53)
    expect(s.level).toBeGreaterThan(-15) // most of the way up after 4 frames
    expect(ATTACK_MS).toBeLessThan(50)
    s = stepMeter(s, -6, 2000, 2000, 23.53, 23.53)
    expect(s.level).toBe(-6)
    // Signal gone: after one release constant it has fallen about 63% of the way.
    const dropped = stepMeter(s, FLOOR, 300, 2300, 23.53, 23.53)
    const frac = (-6 - dropped.level) / (-6 - FLOOR)
    expect(frac).toBeGreaterThan(0.55)
    expect(frac).toBeLessThan(0.7)
    // A slower setting falls slower.
    const slow = stepMeter(s, FLOOR, 300, 2300, 8.57, 23.53)
    expect(slow.level).toBeGreaterThan(dropped.level)
  })

  it('holds the peak tick, then lets it fall', () => {
    let s = stepMeter(initialMeter(), -3, 16, 1000, 23.53, 23.53)
    s = stepMeter(s, FLOOR, 16, 2000, 23.53, 23.53)
    expect(s.hold).toBe(-3)
    s = stepMeter(s, FLOOR, 200, 3000, 23.53, 23.53)
    expect(s.hold).toBeLessThan(-3)
    expect(s.hold).toBeGreaterThan(-10)
  })
})

describe('live meters', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
    vi.useRealTimers()
  })

  it('polls at 30 Hz or better, draws without re-rendering, and stops when unmounted', async () => {
    let level = -40
    const api = {
      levels: vi.fn(async (): Promise<Record<string, EngineLevel>> => ({
        Mic: { peak: [level, level], magnitude: [level, level] },
      })),
    } as unknown as EngineApi
    let renders = 0
    function Probe() {
      renders++
      const feed = useLevelFeed(api, ['Mic'])
      return (
        <Meter
          feed={feed}
          feedName="Mic"
          muted={false}
          volumeDb={0}
          label="Mic volume"
          onVolume={() => undefined}
        />
      )
    }
    root = createRoot(host)
    await act(async () => {
      root!.render(<Probe />)
    })
    const afterMount = renders
    const cover = () => host.querySelector<HTMLElement>('.bg-inset\\/80')!
    const start = (api.levels as ReturnType<typeof vi.fn>).mock.calls.length
    level = -10
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    const calls = (api.levels as ReturnType<typeof vi.fn>).mock.calls.length - start
    expect(calls).toBeGreaterThanOrEqual(30)
    // The meters ask for the short window.
    expect((api.levels as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([['Mic'], 'fast'])
    expect(POLL_MS).toBeLessThanOrEqual(33)
    // The bar moved (-10 dB is 83% along) by style writes alone.
    expect(cover().style.transform).toMatch(/translate3d\(8\d(\.\d+)?%/)
    expect(renders).toBe(afterMount)
    act(() => root?.unmount())
    root = null
    expect(activeMeters()).toBe(0)
  })

  it('distinguishes connected silent meters from omitted or failing/stale unmetered feeds without extra renders', async () => {
    let mode: 'silent' | 'talking' | 'omitted' | 'error' = 'silent'
    let level = -100
    const api = {
      levels: vi.fn(async (): Promise<Record<string, EngineLevel>> => {
        if (mode === 'error') throw new Error('offline')
        if (mode === 'omitted') return {}
        return { Mic: { peak: [level, level], magnitude: [level, level] } }
      }),
    } as unknown as EngineApi

    let renders = 0
    let latestStatus = ''
    function StatusProbe() {
      renders++
      const feed = useLevelFeed(api, ['Mic'])
      latestStatus = useLevelStatus(feed, 'Mic')
      return <span data-status={latestStatus} />
    }

    root = createRoot(host)
    await act(async () => {
      root!.render(<StatusProbe />)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(latestStatus).toBe('connected')
    const afterConnected = renders

    // Oscillating speech keeps status 'connected' with zero re-renders.
    mode = 'talking'
    level = -12
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    level = -28
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(latestStatus).toBe('connected')
    expect(renders).toBe(afterConnected)

    // Engine returns {} omitting Mic (onboarding unstarted engine) -> transitions to 'disconnected'.
    mode = 'omitted'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(latestStatus).toBe('disconnected')

    // Recovers cleanly when Mic returns, even at silent -100 dB.
    mode = 'silent'
    level = -100
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(latestStatus).toBe('connected')

    // Engine stops/errors past STALE_MS -> transitions to 'disconnected'.
    mode = 'error'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_MS + 150)
    })
    expect(latestStatus).toBe('disconnected')
  })

  it('shows a sound whose level never moves as silent and not connected, and recovers when it moves', async () => {
    let level = -20
    const api = {
      levels: vi.fn(async (): Promise<Record<string, EngineLevel>> => ({
        // The unplugged USB sound repeats its last level; the other one is alive.
        Usb: { peak: [-20, -20], magnitude: [-30, -30] },
        Mic: {
          peak: [level, level],
          magnitude: [level, level],
        },
      })),
    } as unknown as EngineApi
    let lost = false
    function Probe() {
      const feed = useLevelFeed(api, ['Usb', 'Mic'])
      lost = useSourceLost(feed, 'Usb')
      return (
        <Meter
          feed={feed}
          feedName="Usb"
          muted={false}
          volumeDb={0}
          label="Usb volume"
          onVolume={() => undefined}
        />
      )
    }
    root = createRoot(host)
    await act(async () => {
      root!.render(<Probe />)
    })
    const cover = () => host.querySelector<HTMLElement>('.bg-inset\\/80')!
    // Moving a little each poll: alive. (Mic moves; Usb does not.)
    for (let i = 0; i < 20; i++) {
      level = -40 + (i % 3)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
    }
    expect(lost).toBe(false)
    expect(cover().style.transform).not.toMatch(/translate3d\(0(\.0+)?%/)
    // After FROZEN_MS of the same numbers the bar falls and it reads as not connected.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FROZEN_MS + 1500)
    })
    expect(lost).toBe(true)
    expect(cover().style.transform).toMatch(/translate3d\(0(\.0+)?%/)
  })
})
