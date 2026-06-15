import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import type { LiveFrame } from '../src/types'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  vi.useFakeTimers()
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => {
  engine.dispose()
  vi.useRealTimers()
})

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )
const ok = { question: 'Which map?', options: ['Ascent', 'Bind'], duration_s: 60 }

describe('demo polls', () => {
  it('refuses bad polls with the engine’s field messages', async () => {
    const cases: [unknown, string][] = [
      [[], 'Send the poll'],
      [{ options: ['a', 'b'] }, 'question:'],
      [{ question: ' ', options: ['a', 'b'] }, 'question:'],
      [{ question: 'q', options: 'a,b' }, 'options:'],
      [{ question: 'q', options: ['a', 2] }, 'options:'],
      [{ question: 'q', options: ['a'] }, 'options:'],
      [{ question: 'q', options: ['a', 'A'] }, 'options:'],
      [{ ...ok, duration_s: 5 }, 'duration_s:'],
      [{ ...ok, duration_s: 1.5 }, 'duration_s:'],
      [{ ...ok, duration_s: '60' }, 'duration_s:'],
    ]
    for (const [body, prefix] of cases) {
      const e = await fail(client.request('POST', '/api/v1/polls', body))
      expect(e?.status, JSON.stringify(body)).toBe(400)
      expect(e?.message.startsWith(prefix), `${JSON.stringify(body)}: ${e?.message}`).toBe(true)
    }
  })

  it('runs a poll: live results, one at a time, ends once, then posts the result', async () => {
    expect(await client.poll()).toBeNull()
    const frames: LiveFrame[] = []
    const sock = engine.socket(client.liveUrl())
    sock.onmessage = (ev) => frames.push(JSON.parse(ev.data as string) as LiveFrame)
    await vi.advanceTimersByTimeAsync(1)
    const p = await client.startPoll(ok)
    expect(p.options.map((o) => o.text)).toEqual(['Ascent', 'Bind'])
    expect((await fail(client.startPoll(ok)))?.status).toBe(409)
    await vi.advanceTimersByTimeAsync(30_000)
    const mid = (await client.poll())!
    expect(mid.total).toBeGreaterThan(0)
    expect(frames.some((f) => f.type === 'poll')).toBe(true)
    const ended = await client.endPoll()
    expect(ended.closed).toBe(true)
    expect((await fail(client.endPoll()))?.status).toBe(409)
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await client.poll())!.total).toBe(ended.total)
    const said = frames.filter(
      (f) =>
        f.type === 'event' &&
        f.data.kind.type === 'chat_message' &&
        f.data.kind.content.text.startsWith('Poll closed'),
    )
    expect(said.length).toBe(3) // once per connected platform
    await client.clearPoll()
    expect((await fail(client.clearPoll()))?.code).toBe('poll_not_found')
    expect((await fail(client.endPoll()))?.code).toBe('poll_not_found')
  })
})
