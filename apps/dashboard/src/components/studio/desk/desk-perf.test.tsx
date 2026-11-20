import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineLevel, EngineStats } from '@ferrocast/api'
import {
  DeskProvider,
  createDeskStatsStore,
  useDesk,
  useDeskStats,
  type Desk,
  type EngineApi,
} from './common'
import { useLevels } from './mixer'

let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const makeStats = (cpu: number, frames = 100): EngineStats => ({
  engine: {
    cpu,
    fps: 60,
    frame_ms: 2.1,
    lagged: 0,
    frames,
    memory_mb: 300,
    skipped: 0,
    encoded: frames,
    recovered: 0,
    restarts: 0,
  },
  scene: 'Gaming',
  history: { undo: null, redo: null },
  canvas: { width: 1920, height: 1080, fps: 60 },
  stream: {
    active: true,
    reconnecting: false,
    bytes: frames * 1000,
    frames,
    dropped: 0,
    error: null,
  },
  record: null,
  source_records: [],
  disk_free_mb: 25_000,
  replay: null,
  virtualcam: null,
  ndi: null,
  captures: [],
  sources: [],
  remux: null,
})

describe('DeskStatsStore render isolation', () => {
  it('does not re-render non-stats or slice-selected consumers when unrelated telemetry changes', async () => {
    const store = createDeskStatsStore()
    store.set(makeStats(10, 100))

    let dockRenders = 0
    let sliceRenders = 0
    let clockRenders = 0

    function StaticDock() {
      dockRenders++
      const { scene } = useDesk()
      return <div data-scene>{scene}</div>
    }

    function SliceConsumer() {
      sliceRenders++
      const canvasW = useDeskStats((s) => s?.canvas.width ?? 0)
      return <div data-canvas>{canvasW}</div>
    }

    function ClockConsumer() {
      clockRenders++
      const s = useDeskStats()
      return <div data-frames>{s?.stream?.frames ?? 0}</div>
    }

    const desk = { scene: 'Gaming', stats: null, setStats: store.set } as unknown as Desk
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <DeskProvider value={desk} statsStore={store}>
          <StaticDock />
          <SliceConsumer />
          <ClockConsumer />
        </DeskProvider>,
      )
    })

    expect(dockRenders).toBe(1)
    expect(sliceRenders).toBe(1)
    expect(clockRenders).toBe(1)

    // 1-second telemetry update (CPU/bytes/frames change, canvas & scene unchanged).
    await act(async () => {
      store.set(makeStats(14.5, 160))
    })

    expect(dockRenders).toBe(1)
    expect(sliceRenders).toBe(1)
    expect(clockRenders).toBe(2)
    expect(host.querySelector('[data-frames]')?.textContent).toBe('160')
  })
})

describe('useLevels polling efficiency', () => {
  it('pauses polling while document.hidden is true and skips sub-0.5 dB updates', async () => {
    vi.useFakeTimers()
    let hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

    let call = 0
    const responses: Record<string, EngineLevel>[] = [
      { Mic: { peak: [-20, -20], magnitude: [-24, -24], input_peak: [-20, -20] } },
      // Changes by < 0.1 dB -> must not trigger a React commit.
      { Mic: { peak: [-20.05, -20.04], magnitude: [-24, -24], input_peak: [-20, -20] } },
      // Real jump -> triggers commit when visible.
      { Mic: { peak: [-8, -8], magnitude: [-12, -12], input_peak: [-8, -8] } },
    ]
    const levelsSpy = vi.fn(async (): Promise<Record<string, EngineLevel>> => {
      const next = responses[Math.min(call, responses.length - 1)]!
      call++
      return next
    })
    const api = { levels: levelsSpy } as unknown as EngineApi

    let commits = 0
    function Probe() {
      commits++
      const lv = useLevels(api, ['Mic'])
      return <span data-peak>{lv.Mic?.peak[0] ?? 'none'}</span>
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(<Probe />)
    })
    expect(levelsSpy).toHaveBeenCalledTimes(1)
    const afterFirst = commits

    // The next ticks (within 0.05 dB): polled at about 30 a second, no extra React commit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(levelsSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(commits).toBe(afterFirst)

    // Hide tab -> polling stops completely across several seconds.
    hidden = true
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(1000)
    })
    const whileHidden = levelsSpy.mock.calls.length
    expect(whileHidden).toBeLessThan(6)

    // Show tab -> resumes immediately and picks up the -8 dB peak.
    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(levelsSpy.mock.calls.length).toBeGreaterThan(whileHidden)
    expect(host.querySelector('[data-peak]')?.textContent).toBe('-8')
  })
})
