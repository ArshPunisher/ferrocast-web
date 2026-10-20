import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { parseLiveFrame } from '../src/live'
import type { LiveFrame, UpdateInfo } from '../src/types'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  vi.useFakeTimers()
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
    sleep: async () => {},
  })
})
afterEach(() => {
  engine.dispose()
  vi.useRealTimers()
})

async function code(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code]
    throw e
  }
  throw new Error('expected an error')
}

function liveUpdates(): UpdateInfo[] {
  const got: UpdateInfo[] = []
  const sock = engine.socket(`ws://127.0.0.1:47820/api/v1/live?session=${DEMO_TOKEN}`)
  sock.onmessage = (ev) => {
    const f = parseLiveFrame(ev.data) as LiveFrame | null
    if (f?.type === 'update') got.push(f.data)
  }
  return got
}

describe('updates (demo engine, API.md §4 UpdateView)', () => {
  it('offers the update with notes, and never while live', async () => {
    const u = await client.updates()
    expect(u.latest).not.toBe(u.current)
    expect(u.notes).toContain('- ')
    expect(u.can_install).toBe(true)
    expect(u.install?.phase).toBe('idle')
    expect(await code(client.installUpdate())).toEqual([409, 'live'])
  })

  it('check, download with progress, ready, then restart', async () => {
    const frames = liveUpdates()
    const s = await client.settings()
    await client.saveSettings({ ...s, never_update_while_live: false })
    const checking = client.checkUpdates()
    await vi.advanceTimersByTimeAsync(800)
    const checked = await checking
    expect(checked.checking).toBe(false)
    expect(typeof checked.checked_at).toBe('number')

    expect(await code(client.restartForUpdate())).toEqual([409, 'not_ready'])
    await client.installUpdate()
    expect(await code(client.installUpdate())).toEqual([409, 'update_busy'])
    await vi.advanceTimersByTimeAsync(1000)
    const mid = await client.updates()
    expect(mid.install?.phase).toBe('downloading')
    expect(mid.install?.downloaded).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(6000)
    expect((await client.updates()).install?.phase).toBe('ready')
    expect(await code(client.installUpdate())).toEqual([409, 'restart_needed'])

    const phases = frames.map((f) => f.install?.phase).filter((p, i, a) => p !== a[i - 1])
    expect(phases).toEqual(['idle', 'downloading', 'installing', 'ready'])

    const r = await client.restartForUpdate()
    await vi.advanceTimersByTimeAsync(1000)
    const after = await client.updates()
    expect(after.current).toBe(r.restarting)
    expect(after.latest).toBeNull()
  })

  it('update frames with a bad shape are dropped', () => {
    const frame = (data: unknown) => JSON.stringify({ v: 1, type: 'update', data })
    expect(parseLiveFrame(frame({ current: '1.0.0', latest: null }))).not.toBeNull()
    expect(parseLiveFrame(frame({ current: 1, latest: null }))).toBeNull()
    expect(parseLiveFrame(frame({ current: '1.0.0', latest: null, install: 'x' }))).toBeNull()
    expect(parseLiveFrame(frame({ current: '1.0.0', latest: null, notes: 5 }))).toBeNull()
    const install = (phase: string, downloaded: unknown) => ({
      current: '1.0.0',
      latest: '1.0.1',
      install: { phase, version: '1.0.1', downloaded, total: null, error: null },
    })
    expect(parseLiveFrame(frame(install('downloading', 10)))).not.toBeNull()
    expect(parseLiveFrame(frame(install('verifying', 10)))).toBeNull()
    expect(parseLiveFrame(frame(install('downloading', '10')))).toBeNull()
  })
})
