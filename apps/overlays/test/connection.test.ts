import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectOverlay, watchVisibility } from '../src/connection'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { FakeSocket, alert, chat, frame, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime
let send: (d: string) => boolean

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.all = []
  root = document.createElement('div')
  document.body.replaceChildren(root)
  rt = createOverlay(root, { send: (d) => void send(d), audio: false })
})
afterEach(() => {
  rt.destroy()
  vi.useRealTimers()
})

function connect() {
  return connectOverlay(
    rt,
    {
      url: 'ws://127.0.0.1:47820/o/tok/ws',
      factory: (u) => new FakeSocket(u),
      tuning: { baseMs: 100, maxMs: 1000 },
    },
    (s) => {
      send = s
    },
  )
}
const parsed = (s: FakeSocket) =>
  s.sent.map((x) => JSON.parse(x) as { type: string; data: Record<string, unknown> })

describe('overlay connection', () => {
  it('uses one socket, says hello, applies the snapshot', () => {
    const c = connect()
    expect(FakeSocket.all).toHaveLength(1)
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    expect(parsed(s)[0]).toEqual({ v: 1, type: 'hello', data: { since_seq: 0 } })
    s.push(snapshot())
    expect(root.querySelectorAll('.fc-w').length).toBe(6)
    c.stop()
  })

  it('drops malformed, oversized, wrong-version and early frames without throwing', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    s.push(frame('event', chat('early', 'before snapshot')))
    expect(() => {
      s.push('{not json')
      s.push('null')
      s.push(JSON.stringify({ v: 2, seq: 1, type: 'snapshot', data: {} }))
      s.push('x'.repeat(2_000_001))
      s.push(42)
    }).not.toThrow()
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
    s.push(snapshot())
    expect(root.textContent).not.toContain('before snapshot')
    c.stop()
  })

  it('ignores duplicate and out-of-order frames on one connection', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    const snap = snapshot()
    s.push(snap)
    const m = { v: 1, seq: snap.seq + 5, type: 'event', data: chat('a', 'once') }
    s.push(m)
    s.push(m)
    s.push({ ...m, seq: snap.seq + 2, data: chat('b', 'late replay') })
    const texts = [...root.querySelectorAll('.fc-text')].map((n) => n.textContent)
    expect(texts).toEqual(['once'])
    c.stop()
  })

  it('reconnects after a drop with hello since_seq = last seen, then resumes', () => {
    const c = connect()
    const s1 = FakeSocket.all[0] as FakeSocket
    s1.open()
    const snap = snapshot()
    s1.push(snap)
    s1.push({ v: 1, seq: snap.seq + 3, type: 'event', data: chat('a', 'one') })
    s1.drop()
    vi.advanceTimersByTime(200)
    expect(FakeSocket.all).toHaveLength(2)
    const s2 = FakeSocket.all[1] as FakeSocket
    s2.open()
    expect(parsed(s2)[0]).toEqual({ v: 1, type: 'hello', data: { since_seq: snap.seq + 3 } })
    // Before the new snapshot nothing applies; after it, frames flow again.
    s2.push({ v: 1, seq: 1, type: 'event', data: chat('b', 'too early') })
    s2.push({ ...snapshot(), seq: 1 })
    s2.push({ v: 1, seq: 2, type: 'event', data: chat('c', 'after resume') })
    expect(root.textContent).toContain('after resume')
    expect(root.textContent).not.toContain('too early')
    expect(c.lastSeq).toBe(snap.seq + 3)
    c.stop()
  })

  it('acks go out over the socket in order; config keeps the same socket', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    const snap = snapshot()
    s.push(snap)
    s.push({ ...frame('alert', alert('k1')), seq: snap.seq + 1 })
    vi.advanceTimersByTime(2400)
    s.push({
      ...frame('config', snap.type === 'snapshot' ? snap.data.overlay : (null as never)),
      seq: snap.seq + 2,
    })
    expect(FakeSocket.all).toHaveLength(1)
    const acks = parsed(s)
      .filter((f) => f.type === 'ack')
      .map((f) => f.data.phase)
    expect(acks).toEqual(['started', 'finished'])
    c.stop()
  })

  it('only ever sends hello, ack and visibility (R-36)', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    const snap = snapshot()
    s.push(snap)
    for (let i = 1; i <= 20; i++)
      s.push({ ...frame('event', chat('x', `m${i}`)), seq: snap.seq + i })
    s.push({ ...frame('alert', alert('r1')), seq: snap.seq + 30 })
    c.setVisible(false)
    c.setVisible(true)
    vi.advanceTimersByTime(5000)
    const types = new Set(parsed(s).map((f) => f.type))
    for (const t of types) expect(['hello', 'ack', 'visibility']).toContain(t)
    c.stop()
  })

  it('OBS hiding the source sends visibility and pauses; showing resumes', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    s.push(snapshot())
    const stop = watchVisibility((v) => c.setVisible(v))
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: false } }))
    expect(root.querySelector('.fc-ov')?.classList.contains('is-hidden')).toBe(true)
    expect(parsed(s).at(-1)).toEqual({ v: 1, type: 'visibility', data: { visible: false } })
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } }))
    expect(parsed(s).at(-1)).toEqual({ v: 1, type: 'visibility', data: { visible: true } })
    window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active: false } }))
    expect(root.querySelector('.fc-ov')?.classList.contains('is-hidden')).toBe(true)
    window.dispatchEvent(
      new CustomEvent('obsSourceActiveChanged', { detail: { active: 'nonsense' } }),
    )
    expect(root.querySelector('.fc-ov')?.classList.contains('is-hidden')).toBe(true)
    stop()
    c.stop()
  })

  it('a hidden page re-announces itself after a reconnect', () => {
    const c = connect()
    const s1 = FakeSocket.all[0] as FakeSocket
    s1.open()
    c.setVisible(false)
    s1.drop()
    vi.advanceTimersByTime(200)
    const s2 = FakeSocket.all[1] as FakeSocket
    s2.open()
    expect(parsed(s2).map((f) => f.type)).toEqual(['hello', 'visibility'])
    c.stop()
  })

  it('revoked stops reconnecting for good', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    const snap = snapshot()
    s.push(snap)
    s.push({ v: 1, seq: snap.seq + 1, type: 'revoked', data: {} })
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
    s.drop()
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.all).toHaveLength(1)
    c.stop()
  })

  it('revoked before any snapshot still stops', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    s.push({ v: 1, seq: 1, type: 'revoked', data: {} })
    s.drop()
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.all).toHaveLength(1)
    c.stop()
  })

  it('acks made while offline are sent after the next hello, oldest first, at most 20', () => {
    const c = connect()
    const s1 = FakeSocket.all[0] as FakeSocket
    s1.open()
    const snap = snapshot()
    s1.push(snap)
    s1.push({ ...frame('alert', alert('o1', { duration_ms: 1000 })), seq: snap.seq + 1 })
    s1.drop()
    vi.advanceTimersByTime(1000 + 300) // finishes while the socket is down
    const s2 = FakeSocket.all.at(-1) as FakeSocket
    s2.open()
    expect(parsed(s2).map((f) => `${f.type}:${String(f.data.phase ?? '')}`)).toEqual([
      'hello:',
      'ack:finished',
    ])
    c.stop()
  })

  it('keeps no more than 20 pending acks', () => {
    const c = connect()
    for (let i = 0; i < 30; i++)
      send(JSON.stringify({ v: 1, type: 'ack', data: { alert_id: `x${i}`, phase: 'failed' } }))
    send(JSON.stringify({ v: 1, type: 'visibility', data: { visible: true } }))
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    const acks = parsed(s).filter((f) => f.type === 'ack')
    expect(acks).toHaveLength(20)
    expect(acks[0]?.data.alert_id).toBe('x10')
    expect(parsed(s).filter((f) => f.type === 'visibility')).toHaveLength(0)
    c.stop()
  })

  it.each([4404, 4401])('a close with %i means the URL is gone: clear and stop', (code) => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    s.push(snapshot())
    s.readyState = 3
    s.onclose?.({ code })
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.all).toHaveLength(1)
    c.stop()
  })

  it('an ordinary close (1006) keeps reconnecting', () => {
    const c = connect()
    const s = FakeSocket.all[0] as FakeSocket
    s.open()
    s.readyState = 3
    s.onclose?.({ code: 1006 })
    vi.advanceTimersByTime(200)
    expect(FakeSocket.all).toHaveLength(2)
    c.stop()
  })
})
