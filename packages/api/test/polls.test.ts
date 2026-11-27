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

  it('reports capabilities, runs native+chat mixed polls, supports untimed polls, and handles Twitch reconnect', async () => {
    const caps = await client.pollCapabilities()
    expect(caps.platforms.map((c) => [c.platform, c.mode])).toEqual([
      ['twitch', 'native'],
      ['youtube', 'native'],
      ['kick', 'chat_fallback'],
    ])

    expect(await client.poll()).toBeNull()
    const frames: LiveFrame[] = []
    const sock = engine.socket(client.liveUrl())
    sock.onmessage = (ev) => frames.push(JSON.parse(ev.data as string) as LiveFrame)
    await vi.advanceTimersByTimeAsync(1)
    const p = await client.startPoll(ok)
    expect(p.options.map((o) => o.text)).toEqual(['Ascent', 'Bind'])
    expect(p.platforms?.map((s) => [s.platform, s.mode])).toEqual([
      ['twitch', 'native'],
      ['youtube', 'native'],
      ['kick', 'chat'],
    ])
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
      (f): f is Extract<LiveFrame, { type: 'event' }> =>
        f.type === 'event' &&
        f.data.kind.type === 'chat_message' &&
        f.data.kind.content.text.startsWith('Poll closed'),
    )
    expect(said.map((s) => s.data.platform)).toEqual(['kick'])
    await client.clearPoll()
    expect((await fail(client.clearPoll()))?.code).toBe('poll_not_found')
    expect((await fail(client.endPoll()))?.code).toBe('poll_not_found')

    // Untimed poll (`duration_s: null`) stays open past 30m until End is pressed.
    const untimed = await client.startPoll({
      question: 'Stay on boss?',
      options: ['Stay', 'Reset'],
      duration_s: null,
    })
    expect(untimed.ends_at).toBeNull()
    await vi.advanceTimersByTimeAsync(2_000_000)
    expect((await client.poll())?.closed).toBe(false)
    expect((await client.endPoll()).closed).toBe(true)
    await client.clearPoll()

    // Fallback when text exceeds native limits without truncating question/options.
    const longFallback = await client.startPoll({
      question: 'This question is deliberately over sixty characters to trigger Twitch fallback',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
      duration_s: 60,
    })
    expect(longFallback.platforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'twitch',
          mode: 'chat',
          state: 'failed_fallback',
          note: 'text_too_long_for_native',
        }),
        expect.objectContaining({
          platform: 'youtube',
          mode: 'chat',
          state: 'failed_fallback',
          note: 'options_count_unsupported_for_native',
        }),
      ]),
    )
    await client.clearPoll()

    // Missing Twitch poll scope exposes reconnect_needed, permits reconnect without 409, and restores native.
    engine.setTwitchPollScopeMissing(true)
    const beforeRecon = await client.pollCapabilities()
    expect(beforeRecon.platforms[0]).toMatchObject({
      platform: 'twitch',
      mode: 'reconnect_needed',
      reason: 'needs_scope',
    })
    const flow = await client.connect('twitch')
    expect(flow.flow).toBe('device_code')
    await vi.advanceTimersByTimeAsync(5_000)
    const afterRecon = await client.pollCapabilities()
    expect(afterRecon.platforms[0]).toMatchObject({
      platform: 'twitch',
      mode: 'native',
    })
  })
})

describe('community live frames are checked before the dashboard sees them', () => {
  it('drops malformed poll, giveaway and chatter frames', async () => {
    const { parseLiveFrame } = await import('../src/live')
    const f = (type: string, data: unknown) => JSON.stringify({ v: 1, type, data })
    expect(parseLiveFrame(f('poll', { poll: null }))).not.toBeNull()
    expect(parseLiveFrame(f('poll', { poll: 'x' }))).toBeNull()
    expect(parseLiveFrame(f('poll', { poll: {} }))).toBeNull()
    expect(parseLiveFrame(f('giveaway', { giveaway: { id: 'g' } }))).toBeNull()
    expect(parseLiveFrame(f('chatter', { kind: 'first' }))).toBeNull()
    expect(parseLiveFrame(f('chatter', { event_id: 'e', kind: 'other' }))).toBeNull()
    expect(
      parseLiveFrame(f('chatter', { event_id: 'e', kind: 'returning', days: 40 })),
    ).not.toBeNull()
  })
})
