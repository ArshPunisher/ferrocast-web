// Review fixes for Dashboard anywhere (M6): tickets instead of the device token in URLs,
// calls a phone's role can't make skipped before they leave the page, the live socket's
// close codes, an async socket URL, and the pairing countdown from receipt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { LiveConnection } from '../src/live'
import { REMOTE_CLOSE, linkSecondsLeft, phoneApi, remoteAllowed } from '../src/remote'
import { ReconnectingSocket, type SocketLike } from '../src/socket'

class Sock implements SocketLike {
  static all: Sock[] = []
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  constructor(readonly url: string) {
    Sock.all.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  closeWith(code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  send() {}
  close() {
    this.readyState = 3
  }
}

const TOKEN = 'fcr_dv_1.secret-of-the-device'

function phoneClient(role: 'owner' | 'mod', fetchLog: string[]) {
  let n = 0
  return new FerroClient({
    base: 'https://remote.example/r',
    token: TOKEN,
    fetch: async (url) => {
      fetchLog.push(url)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
    allow: (m, p) => remoteAllowed(role, m, p),
    ticket: async (kind) => ({
      ticket: `${kind === 'live' ? 'lt' : 'mt1'}_${++n}`,
      expires_in: kind === 'live' ? 60 : 300,
    }),
  })
}

beforeEach(() => {
  Sock.all = []
})
afterEach(() => vi.useRealTimers())

describe('a phone never puts its device token in a URL', () => {
  it('opens the live socket with a fresh single-use ticket each time', async () => {
    const c = phoneClient('owner', [])
    const a = await c.liveSocketUrl(7)
    const b = await c.liveSocketUrl()
    expect(a).toBe('wss://remote.example/r/api/v1/live?ticket=lt_1&since=7')
    expect(b).toBe('wss://remote.example/r/api/v1/live?ticket=lt_2')
    expect(a + b).not.toContain(TOKEN)
    expect(a + b).not.toContain('session=')
  })

  it('previews media with a media ticket, refreshed only near its end', async () => {
    const c = phoneClient('owner', [])
    expect(c.mediaUrl('m1')).toBe('https://remote.example/r/api/v1/media/m1')
    await c.refreshMediaTicket(0)
    expect(c.mediaUrl('m 1')).toBe('https://remote.example/r/api/v1/media/m%201?ticket=mt1_1')
    await c.refreshMediaTicket(200_000)
    expect(c.mediaUrl('m1')).toContain('ticket=mt1_1')
    await c.refreshMediaTicket(250_000)
    expect(c.mediaUrl('m1')).toContain('ticket=mt1_2')
    expect(c.mediaUrl('m1')).not.toContain(TOKEN)
  })

  it('keeps the session in the query on the PC itself', async () => {
    const c = new FerroClient({ base: 'http://127.0.0.1:1', token: 'tok' })
    expect(await c.liveSocketUrl(3)).toBe('ws://127.0.0.1:1/api/v1/live?session=tok&since=3')
    expect(c.mediaUrl('m1')).toBe('http://127.0.0.1:1/api/v1/media/m1?session=tok')
  })

  it('asks the relay for tickets with the token in Authorization only', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = []
    const api = phoneApi('https://remote.example/r', async (url, init) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ ticket: 'lt_x', expires_in: 60 }), {
        headers: { 'content-type': 'application/json' },
      })
    })
    expect(await api.ticket(TOKEN, 'live')).toEqual({ ticket: 'lt_x', expires_in: 60 })
    expect(seen[0]!.url).toBe('https://remote.example/r/v1/ticket')
    expect((seen[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(seen[0]!.init?.body).toBe('{"for":"live"}')
  })
})

describe('calls the role can’t make never leave the phone', () => {
  it('refuses them locally with the relay’s words, and sends the rest', async () => {
    const log: string[] = []
    const c = phoneClient('mod', log)
    for (const call of [
      () => c.settings(),
      () => c.queue(),
      () => c.panicConfig(),
      () => c.events({ limit: 5 }),
    ]) {
      const e = await call().catch((x: unknown) => x)
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).status).toBe(403)
      expect((e as ApiError).code).toBe('not_allowed_for_role')
    }
    await expect(c.downloadFile('/api/v1/studio/markers/export?format=csv')).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(log).toEqual([])
    await c.status()
    await c.chat(10)
    expect(log.map((u) => new URL(u).pathname)).toEqual(['/r/api/v1/status', '/r/api/v1/chat'])
    expect(c.may('POST', '/api/v1/mod/ban')).toBe(true)
    expect(c.may('POST', '/api/v1/updates/install')).toBe(false)
  })

  it('an owner’s phone skips accounts, Pro and installing updates', async () => {
    const log: string[] = []
    const c = phoneClient('owner', log)
    expect(c.may('GET', '/api/v1/pro')).toBe(false)
    expect(c.may('POST', '/api/v1/updates/install')).toBe(false)
    expect(c.may('GET', '/api/v1/updates')).toBe(true)
    await expect(c.installUpdate()).rejects.toMatchObject({ status: 403 })
    expect(log).toEqual([])
  })

  it('the PC’s own dashboard is never limited', () => {
    const c = new FerroClient({ base: 'http://127.0.0.1:1', token: 't' })
    expect(c.may('POST', '/api/v1/updates/install')).toBe(true)
  })
})

describe('the live socket', () => {
  it('waits for an async URL, and drops one that arrives after stop', async () => {
    let resolve: (u: string) => void = () => {}
    const rs = new ReconnectingSocket({
      url: () => new Promise<string>((r) => (resolve = r)),
      factory: (u) => new Sock(u),
      onMessage: () => {},
    })
    rs.start()
    expect(Sock.all).toHaveLength(0)
    resolve('wss://x/live?ticket=1')
    await Promise.resolve()
    expect(Sock.all.map((s) => s.url)).toEqual(['wss://x/live?ticket=1'])
    rs.stop()
    rs.start()
    rs.stop()
    resolve('wss://x/live?ticket=late')
    await Promise.resolve()
    expect(Sock.all).toHaveLength(1)
  })

  it('a failed ticket retries with backoff', async () => {
    vi.useFakeTimers()
    let calls = 0
    const states: string[] = []
    const rs = new ReconnectingSocket({
      url: () =>
        ++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('wss://x/2'),
      factory: (u) => new Sock(u),
      onMessage: () => {},
      onState: (s) => states.push(s),
      random: () => 0,
    })
    rs.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)).toBe('retrying')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(Sock.all.map((s) => s.url)).toEqual(['wss://x/2'])
    rs.stop()
  })

  it('hands the close code over, and stops when told to (4401 removed)', async () => {
    const codes: number[] = []
    const lc = new LiveConnection({
      url: async () => 'wss://x/live',
      factory: (u) => new Sock(u),
      onFrames: () => {},
      onClose: (code) => {
        codes.push(code)
        return code === REMOTE_CLOSE.revoked ? 'stop' : undefined
      },
    })
    lc.start()
    await Promise.resolve()
    await Promise.resolve()
    Sock.all[0]!.open()
    Sock.all[0]!.closeWith(REMOTE_CLOSE.lagged)
    expect(codes).toEqual([4408])
    lc.stop()
    const lc2 = new LiveConnection({
      url: () => 'wss://x/live',
      factory: (u) => new Sock(u),
      onFrames: () => {},
      onClose: (code) => (code === REMOTE_CLOSE.revoked ? 'stop' : undefined),
    })
    lc2.start()
    const s = Sock.all.at(-1)!
    s.open()
    s.closeWith(REMOTE_CLOSE.revoked)
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(Sock.all.at(-1)).toBe(s)
  })
})

describe('the pairing countdown', () => {
  it('runs from when the link arrived, whatever the PC’s clock says', () => {
    const got = 1_000_000
    // `expires_at` from a relay whose clock is an hour ahead would say 70 minutes; ignore it.
    const link = { expires_at: got + 70 * 60_000, expires_in: 600 }
    expect(linkSecondsLeft(link, got, got)).toBe(600)
    expect(linkSecondsLeft(link, got, got + 599_500)).toBe(1)
    expect(linkSecondsLeft(link, got, got + 600_000)).toBe(0)
    expect(linkSecondsLeft({}, got, got + 1_000)).toBe(599)
  })
})
