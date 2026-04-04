import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReconnectingSocket, backoffDelay, DEFAULT_TUNING, type SocketLike } from '../src/socket'
import { LiveConnection, parseLiveFrame } from '../src/live'
import {
  parseOverlayFrame,
  helloFrame,
  ackFrame,
  visibilityFrame,
  MAX_FRAME_BYTES,
} from '../src/overlay-protocol'

class MockSocket implements SocketLike {
  static all: MockSocket[] = []
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  sent: string[] = []
  constructor(readonly url: string) {
    MockSocket.all.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  msg(data: unknown) {
    this.onmessage?.({ data })
  }
  drop() {
    this.readyState = 3
    this.onclose?.({})
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.readyState = 3
  }
}

beforeEach(() => {
  MockSocket.all = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('backoff', () => {
  it('grows exponentially, is jittered and capped', () => {
    const t = { baseMs: 500, maxMs: 15_000, silenceMs: 0 }
    expect(backoffDelay(0, t, () => 0)).toBe(250)
    expect(backoffDelay(0, t, () => 1)).toBe(500)
    expect(backoffDelay(3, t, () => 1)).toBe(4000)
    expect(backoffDelay(30, t, () => 1)).toBe(15_000)
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(i, DEFAULT_TUNING)
      expect(d).toBeGreaterThanOrEqual(250)
      expect(d).toBeLessThanOrEqual(15_000)
    }
  })
})

describe('ReconnectingSocket', () => {
  it('reconnects after a drop and says hello again', () => {
    const states: string[] = []
    let since = 0
    const rs = new ReconnectingSocket({
      url: () => `ws://x/o/t/ws`,
      factory: (u) => new MockSocket(u),
      onMessage: () => {},
      onState: (s) => states.push(s),
      onOpen: (send) => send(helloFrame(since)),
      random: () => 0,
    })
    rs.start()
    MockSocket.all[0]!.open()
    expect(MockSocket.all[0]!.sent).toEqual([helloFrame(0)])
    since = 41
    MockSocket.all[0]!.drop()
    expect(states.at(-1)).toBe('retrying')
    vi.advanceTimersByTime(250)
    expect(MockSocket.all).toHaveLength(2)
    MockSocket.all[1]!.open()
    expect(MockSocket.all[1]!.sent).toEqual([helloFrame(41)])
    rs.stop()
  })

  it('keeps one socket only, even when the factory throws', () => {
    let fail = true
    const rs = new ReconnectingSocket({
      url: () => 'ws://x',
      factory: (u) => {
        if (fail) throw new Error('nope')
        return new MockSocket(u)
      },
      onMessage: () => {},
      random: () => 0,
    })
    rs.start()
    expect(MockSocket.all).toHaveLength(0)
    fail = false
    vi.advanceTimersByTime(300)
    expect(MockSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(60_000)
    expect(MockSocket.all).toHaveLength(1)
    rs.stop()
  })

  it('closes a silent socket and retries (zombie after sleep)', () => {
    const rs = new ReconnectingSocket({
      url: () => 'ws://x',
      factory: (u) => new MockSocket(u),
      onMessage: () => {},
      tuning: { silenceMs: 1000 },
      random: () => 0,
    })
    rs.start()
    MockSocket.all[0]!.open()
    vi.advanceTimersByTime(900)
    MockSocket.all[0]!.msg('x')
    vi.advanceTimersByTime(900)
    expect(MockSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(400)
    vi.advanceTimersByTime(300)
    expect(MockSocket.all).toHaveLength(2)
    rs.stop()
  })

  it('pause closes and resume reconnects at once', () => {
    const rs = new ReconnectingSocket({
      url: () => 'ws://x',
      factory: (u) => new MockSocket(u),
      onMessage: () => {},
      random: () => 0,
    })
    rs.start()
    MockSocket.all[0]!.open()
    rs.pause()
    expect(MockSocket.all[0]!.readyState).toBe(3)
    vi.advanceTimersByTime(60_000)
    expect(MockSocket.all).toHaveLength(1)
    rs.resume()
    expect(MockSocket.all).toHaveLength(2)
    rs.stop()
  })

  it('stops for good when onClose says so (e.g. 4404 unknown token)', () => {
    const codes: number[] = []
    const rs = new ReconnectingSocket({
      url: () => 'ws://x',
      factory: (u) => new MockSocket(u),
      onMessage: () => {},
      onClose: (code) => {
        codes.push(code)
        return code === 4404 ? 'stop' : undefined
      },
      random: () => 0,
    })
    rs.start()
    const first = MockSocket.all[0]!
    first.open()
    first.onclose?.({ code: 1006 })
    vi.advanceTimersByTime(300)
    expect(MockSocket.all).toHaveLength(2)
    const second = MockSocket.all[1]!
    second.open()
    second.onclose?.({ code: 4404 })
    vi.advanceTimersByTime(120_000)
    expect(MockSocket.all).toHaveLength(2)
    expect(codes).toEqual([1006, 4404])
    expect(rs.state).toBe('closed')
  })

  it('ignores events from a socket it already replaced', () => {
    const got: unknown[] = []
    const rs = new ReconnectingSocket({
      url: () => 'ws://x',
      factory: (u) => new MockSocket(u),
      onMessage: (d) => got.push(d),
      random: () => 0,
    })
    rs.start()
    const first = MockSocket.all[0]!
    first.open()
    first.drop()
    vi.advanceTimersByTime(300)
    first.msg('late')
    expect(got).toEqual([])
    rs.stop()
  })
})

describe('live frames', () => {
  it('rejects malformed and future frames', () => {
    for (const bad of [
      42,
      '',
      'not json',
      '[]',
      'null',
      JSON.stringify({ v: 2, type: 'event', data: {} }),
      JSON.stringify({ v: 1, type: 'teleport', data: {} }),
      JSON.stringify({ v: 1, type: 'event', data: null }),
      JSON.stringify({ v: 1, type: 'event', data: { id: 1, seq: 'x', kind: {} } }),
      JSON.stringify({ v: 1, type: 'event', data: { id: 'a', seq: 1, kind: { nope: 1 } } }),
      'x'.repeat(1_000_001),
    ])
      expect(parseLiveFrame(bad)).toBeNull()
    expect(parseLiveFrame(JSON.stringify({ v: 1, type: 'hello', data: { seq: 3 } }))).toEqual({
      v: 1,
      type: 'hello',
      data: { seq: 3 },
    })
  })

  it('batches frames, drops duplicate events and resumes from the last seq', () => {
    const batches: number[] = []
    const urls: string[] = []
    const lc = new LiveConnection({
      url: (since) => {
        const u = `ws://x/live?since=${since ?? ''}`
        urls.push(u)
        return u
      },
      factory: (u) => new MockSocket(u),
      onFrames: (f) => batches.push(f.length),
      flushMs: 50,
      tuning: { baseMs: 100 },
    })
    lc.start()
    const s = MockSocket.all[0]!
    s.open()
    const ev = (id: string, seq: number) =>
      JSON.stringify({ v: 1, type: 'event', data: { id, seq, kind: { type: 'follow' } } })
    s.msg(ev('a', 5))
    s.msg(ev('b', 6))
    s.msg(ev('a', 5))
    s.msg('garbage')
    vi.advanceTimersByTime(60)
    expect(batches).toEqual([2])
    s.drop()
    vi.advanceTimersByTime(200)
    expect(urls.at(-1)).toBe('ws://x/live?since=6')
    lc.stop()
  })
})

describe('overlay frames', () => {
  const overlay = {
    id: 'o',
    name: 'n',
    url: 'u',
    width: 1920,
    height: 1080,
    widgets: [{ id: 'w', kind: 'chat', x: 0, y: 0, w: 10, h: 10, config: {} }],
    updated_at: 0,
  }
  it('accepts every documented frame', () => {
    const good = [
      {
        type: 'snapshot',
        data: { overlay, state: { goals: [], labels: {}, viewers: {}, events: [], chat: [] } },
      },
      { type: 'event', data: { id: 'e', seq: 1, platform: 'twitch', kind: { type: 'follow' } } },
      { type: 'alert', data: { alert_id: 'a', title: 't', body: '', duration_ms: 1000 } },
      { type: 'alert_hide', data: { alert_id: 'a' } },
      { type: 'state', data: { viewers: { twitch: 3 } } },
      { type: 'config', data: overlay },
      { type: 'delete_message', data: { platform: 'twitch', message_id: 'm' } },
      { type: 'delete_user', data: { platform: 'twitch', user_id: 'u' } },
      { type: 'clear_chat', data: { platform: null } },
      { type: 'tts', data: { id: 't', text: 'hello' } },
      { type: 'revoked', data: {} },
    ]
    for (const g of good)
      expect(parseOverlayFrame(JSON.stringify({ v: 1, seq: 1, ...g })), g.type).not.toBeNull()
  })
  it('drops malformed, unknown and oversized frames', () => {
    const bad = [
      undefined,
      '{',
      JSON.stringify({ v: 1, seq: 1, type: 'create_event', data: {} }),
      JSON.stringify({
        v: 1,
        type: 'event',
        data: { id: 'e', seq: 1, platform: 't', kind: { type: 'x' } },
      }),
      JSON.stringify({
        v: 1,
        seq: 1,
        type: 'snapshot',
        data: { overlay: { ...overlay, widgets: [{ id: 1 }] }, state: {} },
      }),
      JSON.stringify({
        v: 1,
        seq: 1,
        type: 'alert',
        data: { alert_id: 'a', title: 5, body: '', duration_ms: 1 },
      }),
      JSON.stringify({
        v: 1,
        seq: 1,
        type: 'alert',
        data: { alert_id: 'a', title: 't', body: '', duration_ms: 'NaN' },
      }),
      JSON.stringify({ v: 1, seq: 1, type: 'clear_chat', data: { platform: 7 } }),
      JSON.stringify({ v: 1, seq: 1, type: 'delete_user', data: { platform: 'twitch' } }),
      JSON.stringify({ v: 1, seq: 1, type: 'event', data: [] }),
      JSON.stringify({ v: 1, seq: 1, type: 'tts', data: { id: 't' } }),
      JSON.stringify({ v: 1, seq: 1, type: 'tts', data: { id: 1, text: 'x' } }),
      'x'.repeat(MAX_FRAME_BYTES + 1),
    ]
    for (const b of bad) expect(parseOverlayFrame(b)).toBeNull()
  })
  it('client frames are only hello, ack and visibility', () => {
    expect(JSON.parse(helloFrame(3))).toEqual({ v: 1, type: 'hello', data: { since_seq: 3 } })
    expect(JSON.parse(ackFrame('a', 'started'))).toEqual({
      v: 1,
      type: 'ack',
      data: { alert_id: 'a', phase: 'started' },
    })
    expect(JSON.parse(visibilityFrame(false))).toEqual({
      v: 1,
      type: 'visibility',
      data: { visible: false },
    })
  })
})
