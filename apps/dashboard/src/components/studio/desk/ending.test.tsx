import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineStats, ShowRun } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { ControlBar } from './desk'
import { DockWorkspace } from './layout'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import {
  countdownSecondsLeft,
  formatCountdown,
  isCountingDown,
  isEnding,
  secondsLeft,
} from './ending'
import { OnAirButton } from './onair'

// End stream with a show that has an ending (S18 B1): the stream stays on air for the stop delay
// with nothing on screen, so a streamer who ends a bad stream waits 30 s. The desk now says it
// ("Ending in 28 s"), and Stop now asks the engine to stop at once ({ now: true }).

const step = (status: 'waiting' | 'done') => ({
  id: 'stop_stream',
  label: 'Stop streaming',
  status,
  detail: 'Streaming stops in 30 seconds.',
})
const run = (over: Partial<ShowRun> = {}): ShowRun => ({
  id: 'show-1',
  phase: 'ended',
  started_at: Date.now() - 60_000,
  countdown_ends_at: null,
  live_scene: null,
  ended_at: Date.now(),
  steps: [step('waiting')],
  ...over,
})

describe('the ending of a show', () => {
  it('is on only while the stream is on and the stop is still waiting', () => {
    expect(isEnding(run(), true)).toBe(true)
    expect(isEnding(run(), false)).toBe(false)
    expect(isEnding(run({ steps: [step('done')] }), true)).toBe(false)
    expect(isEnding(run({ phase: 'live' }), true)).toBe(false)
    expect(isEnding(null, true)).toBe(false)
    expect(isEnding(undefined, true)).toBe(false)
  })

  it('counts whole seconds down, never above the delay, whichever clock is wrong', () => {
    const t = 1_000_000
    expect(secondsLeft(t, 30, t, t)).toBe(30)
    expect(secondsLeft(t, 30, t, t + 1_500)).toBe(29)
    expect(secondsLeft(t, 30, t, t + 29_001)).toBe(1)
    expect(secondsLeft(t, 30, t, t + 60_000)).toBe(0)
    // The engine's clock an hour ahead: still this page's own 30 s.
    expect(secondsLeft(t + 3_600_000, 30, t, t + 1_000)).toBe(29)
    // The engine's clock behind: it ended 10 s ago by its own words.
    expect(secondsLeft(t - 10_000, 30, t, t)).toBe(20)
    expect(secondsLeft(t, null, t, t)).toBeNull()
    expect(secondsLeft(null, 30, t, t)).toBe(30)
  })
})

describe('U4: Show countdown on the desk on-air pill', () => {
  it('detects active countdowns and formats fixed-width mono digits', () => {
    const t = 1_000_000
    expect(isCountingDown(run({ phase: 'countdown', countdown_ends_at: t + 10_000 }))).toBe(true)
    expect(isCountingDown(run({ phase: 'countdown', countdown_ends_at: null }))).toBe(false)
    expect(isCountingDown(run({ phase: 'live', countdown_ends_at: t + 10_000 }))).toBe(false)
    expect(countdownSecondsLeft(t + 9_200, t)).toBe(10)
    expect(countdownSecondsLeft(t + 100, t)).toBe(1)
    expect(countdownSecondsLeft(t - 500, t)).toBe(0)
    expect(countdownSecondsLeft(null, t)).toBeNull()
    expect(formatCountdown(10)).toBe('00:10')
    expect(formatCountdown(9)).toBe('00:09')
    expect(formatCountdown(299)).toBe('04:59')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(3909)).toBe('1:05:09')
  })
})

describe('the Go live button while the show ends', () => {
  let root: Root | null = null
  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })
  const show = async (props: Partial<Parameters<typeof OnAirButton>[0]>) => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () =>
      root!.render(
        <OnAirButton kind="live" state="ending" time="01:20" onClick={() => {}} {...props} />,
      ),
    )
    return el.querySelector('button') as HTMLButtonElement
  }

  it('says Ending in N s, takes no press, and names the state for a screen reader', async () => {
    const onClick = vi.fn()
    const b = await show({ left: 28, onClick })
    expect(b.textContent).toContain('Ending in 28 s')
    await act(async () => b.click())
    expect(onClick).not.toHaveBeenCalled()
    expect(b.getAttribute('aria-disabled')).toBe('true')
    expect(b.getAttribute('aria-label')).toBe(
      'The stream is ending, it stops in 28 seconds (live 01:20)',
    )
  })

  it('says only Ending… when the delay is not known', async () => {
    const b = await show({ left: null })
    expect(b.textContent).toContain('Ending…')
    expect(b.textContent).not.toContain(' s')
  })
})

describe('the desk bar while the show ends', () => {
  type Req = [string, string, unknown?]
  const calls: Req[] = []
  let root: Root | null = null

  const stats = {
    stream: { active: true, reconnecting: false, error: null, frames: 100 },
    record: null,
    canvas: { fps: 30 },
  } as unknown as EngineStats

  async function mount(shows: ShowRun | null, stopDelay = 30, withStats: EngineStats = stats) {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body])
      if (path.endsWith('/show/config'))
        return { start_stream: true, stop_stream: true, stop_delay_s: stopDelay }
      if (path.endsWith('/show/end')) return { show: run({ steps: [step('done')] }) }
      if (path.endsWith('/show')) return { show: shows }
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return []
    })
    useLive.setState({ conn: { client: { request } } as never })
    const desk = {
      stats: withStats,
      setStats: vi.fn(),
      openSettings: vi.fn(),
      prefs: { data: { confirm_end_stream: true }, reload: vi.fn() },
      api: { shelf: async () => ({ list: [], current: null }) },
      library: 0,
      refresh: vi.fn(),
    } as unknown as Desk
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () =>
      root!.render(
        <DeskProvider value={desk}>
          <DockWorkspace
            top={<ControlBar view={null} onStatus={vi.fn()} />}
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>,
      ),
    )
    // The show and its config are read on mount.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
  }
  const button = (name: RegExp | string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''),
    )

  beforeEach(() => {
    calls.length = 0
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
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
    useLive.setState({ conn: null })
  })

  it('shows Ending in N s and a Stop now that ends the show with now: true', async () => {
    await mount(run())
    expect(button(/Ending in \d+ s/)).toBeTruthy()
    const stop = button('Stop now')
    expect(stop).toBeTruthy()
    await act(async () => stop!.click())
    const ends = calls.filter((c) => c[1].endsWith('/show/end'))
    expect(ends).toHaveLength(1)
    expect(ends[0]?.[2]).toEqual({ now: true })
  })

  it('has no Stop now while the show is not ending', async () => {
    await mount(run({ phase: 'live', steps: [] }))
    expect(button('Stop now')).toBeUndefined()
    expect(button(/Ending in/)).toBeUndefined()
    expect(button(/^LIVE/)?.getAttribute('aria-label')).toContain('End stream')
    expect(button(/^LIVE/)?.querySelector('[data-countdown]')).toBeNull()
  })

  it('shows the Show countdown on the on-air pill while counting down (U4)', async () => {
    await mount(
      run({
        phase: 'countdown',
        countdown_ends_at: Date.now() + 10_000,
        ended_at: null,
        steps: [],
      }),
    )
    const liveBtn = button(/^LIVE/)
    expect(liveBtn).toBeTruthy()
    const cd = liveBtn?.querySelector('[data-countdown]')
    expect(cd?.textContent).toMatch(/^00:(09|10)$/)
    expect(liveBtn?.getAttribute('aria-label')).toMatch(/show starts in 00:(09|10)/)
  })

  it('a double press of Stop now asks once', async () => {
    await mount(run())
    const stop = button('Stop now')!
    await act(async () => {
      stop.click()
      stop.click()
    })
    expect(calls.filter((c) => c[1].endsWith('/show/end'))).toHaveLength(1)
  })

  it('says where a recording went when it is saved: its name, the path behind an (i), copy', async () => {
    const file = '/Users/me/Movies/Ferrocast/2026-11-20 04-42-51.mp4'
    const recording = {
      stream: null,
      record: { active: true, paused: false, file, frames: 300 },
      canvas: { fps: 30 },
    } as unknown as EngineStats
    await mount(null, 30, recording)
    await act(async () => button(/^REC/)!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const t = currentToasts().find((x) => x.message === 'Recording saved.')
    expect(t?.hint).toBe('2026-11-20 04-42-51.mp4')
    expect(t?.detail).toBe(file)
    expect(t?.action?.label).toBe('Copy path')
    currentToasts().forEach((x) => dismissToast(x.id))
  })

  it('does not ask for stream info when only a server of their own is on', async () => {
    // The stream info question is for platforms: a server of their own has no title to set.
    const view = {
      live: false,
      destinations: [
        { id: 'a', kind: 'custom', canvas: 'main', name: 'Local test', enabled: true },
      ],
    } as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const idle = { stream: null, record: null, canvas: { fps: 30 } } as unknown as EngineStats
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body])
      if (path.endsWith('/show/config'))
        return { start_stream: true, stop_stream: true, stop_delay_s: 30, style: 'just' }
      if (path.endsWith('/show')) return { show: null }
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return []
    })
    useLive.setState({ conn: { client: { request } } as never })
    const desk = {
      stats: idle,
      setStats: vi.fn(),
      openSettings: vi.fn(),
      prefs: { data: {}, reload: vi.fn() },
      api: { shelf: async () => ({ list: [], current: null }) },
      library: 0,
      refresh: vi.fn(),
    } as unknown as Desk
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () =>
      root!.render(
        <DeskProvider value={desk}>
          <DockWorkspace
            top={<ControlBar view={view} onStatus={vi.fn()} />}
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>,
      ),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    await act(async () => button('Go live')!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(document.body.textContent).not.toContain('No stream info yet')
  })

  it('Go live with a Show style sends { force: true, stream: true } without mutating ShowConfig', async () => {
    const view = {
      live: false,
      destinations: [
        { id: 'a', kind: 'custom', canvas: 'main', name: 'Local test', enabled: true },
      ],
    } as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const idle = { stream: null, record: null, canvas: { fps: 30 } } as unknown as EngineStats
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body])
      if (path.endsWith('/show/config'))
        return {
          starting_scene: 'Starting',
          countdown_s: 300,
          live_scene: null,
          start_stream: false,
          stop_stream: false,
          stop_delay_s: 30,
          discord: false,
          ending_scene: null,
        }
      if (path.endsWith('/show/start')) return { show: run({ phase: 'countdown', steps: [] }) }
      if (path.endsWith('/show')) return { show: null }
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return []
    })
    useLive.setState({ conn: { client: { request } } as never })
    const desk = {
      stats: idle,
      setStats: vi.fn(),
      openSettings: vi.fn(),
      prefs: { data: {}, reload: vi.fn() },
      api: { shelf: async () => ({ list: [], current: null }) },
      library: 0,
      refresh: vi.fn(),
    } as unknown as Desk
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () =>
      root!.render(
        <DeskProvider value={desk}>
          <DockWorkspace
            top={<ControlBar view={view} onStatus={vi.fn()} />}
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>,
      ),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    await act(async () => button('Go live')!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    // Must NEVER PUT /show/config when pressing Go live!
    expect(calls.filter((c) => c[0] === 'PUT' && c[1].endsWith('/show/config'))).toHaveLength(0)
    const starts = calls.filter((c) => c[0] === 'POST' && c[1].endsWith('/show/start'))
    expect(starts).toHaveLength(1)
    expect(starts[0]?.[2]).toEqual({ force: true, stream: true })
  })

  it('Go live with a Show style immediately refreshes stats & show so the button enters LIVE countdown state', async () => {
    const view = {
      live: false,
      destinations: [
        { id: 'a', kind: 'custom', canvas: 'main', name: 'Local test', enabled: true },
      ],
    } as never
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const idle = { stream: null, record: null, canvas: { fps: 30 } } as unknown as EngineStats
    const liveStats = {
      stream: { active: true, reconnecting: false, bytes: 0, frames: 1, dropped: 0, error: null },
      record: null,
      canvas: { fps: 30 },
    } as unknown as EngineStats
    let streaming = false
    let currentShow: ShowRun | null = null
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body])
      if (path.endsWith('/show/config'))
        return {
          starting_scene: 'Main',
          countdown_s: 300,
          live_scene: null,
          start_stream: false,
          stop_stream: false,
          stop_delay_s: 30,
          discord: false,
          ending_scene: null,
        }
      if (path.endsWith('/show/start')) {
        streaming = true
        currentShow = run({
          phase: 'countdown',
          countdown_ends_at: Date.now() + 300_000,
          ended_at: null,
          steps: [],
        })
        return { show: currentShow }
      }
      if (path.endsWith('/show')) return { show: currentShow }
      if (path.endsWith('/studio/engine/stats')) return streaming ? liveStats : idle
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return []
    })
    useLive.setState({ conn: { client: { request } } as never })
    function Harness() {
      const [st, setSt] = useState<EngineStats | null>(idle)
      const desk = {
        stats: st,
        setStats: setSt,
        openSettings: vi.fn(),
        prefs: { data: {}, reload: vi.fn() },
        api: {
          shelf: async () => ({ list: [], current: null }),
          stats: async () => (streaming ? liveStats : idle),
        },
        library: 0,
        refresh: vi.fn(),
      } as unknown as Desk
      return (
        <DeskProvider value={desk}>
          <DockWorkspace
            top={<ControlBar view={view} onStatus={vi.fn()} />}
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>
      )
    }
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () => root!.render(<Harness />))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    await act(async () => button('Go live')!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    const liveBtn = button(/^LIVE/)
    expect(liveBtn).toBeTruthy()
    expect(liveBtn?.querySelector('[data-countdown]')).toBeTruthy()
  })
})
