import { describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { ApiError, STATUS_COPY, describeError, parseRetryAfter } from '../src/errors'

type Call = { url: string; init: RequestInit | undefined }

function mockFetch(responses: (Response | Error)[]) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  return { fn, calls }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

describe('FerroClient', () => {
  it('sends the bearer token and parses JSON', async () => {
    const { fn, calls } = mockFetch([
      json(200, { version: '1', port: 1, live: {}, connectors: {}, setup_done: true }),
    ])
    const c = new FerroClient({ base: 'http://127.0.0.1:47820/', token: 'tok', fetch: fn })
    const s = await c.status()
    expect(s.version).toBe('1')
    expect(calls[0]?.url).toBe('http://127.0.0.1:47820/api/v1/status')
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('returns undefined for 204', async () => {
    const { fn } = mockFetch([new Response(null, { status: 204 })])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    await expect(c.deleteOverlay('a')).resolves.toBeUndefined()
  })

  it('encodes ids in paths', async () => {
    const { fn, calls } = mockFetch([json(200, {})])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    await c.overlay('../../etc/passwd')
    expect(calls[0]?.url).toBe('http://x/api/v1/overlays/..%2F..%2Fetc%2Fpasswd')
  })

  it.each([400, 401, 403, 404, 409, 413, 415, 422, 429] as const)(
    'turns a %i body into an ApiError with the engine copy',
    async (status) => {
      const { fn } = mockFetch([
        json(
          status,
          { error: { code: 'x_code', message: 'Engine says no.', hint: 'Do this.' } },
          { 'Retry-After': '7' },
        ),
      ])
      const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
      const err = await c.overlays().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ApiError)
      const e = err as ApiError
      expect(e.status).toBe(status)
      expect(e.code).toBe('x_code')
      expect(e.message).toBe('Engine says no.')
      expect(e.hint).toBe('Do this.')
      expect(e.retryAfter).toBe(7)
    },
  )

  it.each([400, 401, 403, 404, 409, 413, 415, 422, 429] as const)(
    'falls back to friendly copy when a %i has no body',
    async (status) => {
      const { fn } = mockFetch([new Response('<html>oops</html>', { status })])
      const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
      const e = (await c.overlays().catch((x: unknown) => x)) as ApiError
      expect(e.message).toBe(STATUS_COPY[status].message)
      expect(e.code).toBe(`http_${status}`)
    },
  )

  it('handles a 500 nobody documented', async () => {
    const { fn } = mockFetch([new Response('boom', { status: 500 })])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    const e = (await c.overlays().catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(500)
    expect(e.message).toMatch(/went wrong/)
  })

  it('waits out 503 "still starting" and then succeeds', async () => {
    const sleep = vi.fn(async () => {})
    const { fn } = mockFetch([
      json(503, { error: { code: 'starting', message: 'Starting' } }, { 'Retry-After': '1' }),
      json(503, undefined),
      json(200, []),
    ])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn, sleep })
    await expect(c.overlays()).resolves.toEqual([])
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('gives up on 503 after the retry budget', async () => {
    const sleep = vi.fn(async () => {})
    const { fn } = mockFetch(Array.from({ length: 4 }, () => json(503, undefined)))
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn, sleep, startupRetries: 3 })
    const e = (await c.overlays().catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(503)
    expect(e.message).toBe(STATUS_COPY[503].message)
  })

  it('never retries a save or a named 503', async () => {
    const sleep = vi.fn(async () => {})
    const named = () => json(503, { error: { code: 'mail_unavailable', message: 'Off' } })
    const { fn } = mockFetch([named(), named()])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn, sleep })
    await expect(c.request('PUT', '/api/v1/pro/history/email', { address: 'a@b.co' })).rejects.toMatchObject({
      code: 'mail_unavailable',
    })
    await expect(c.overlays()).rejects.toMatchObject({ code: 'mail_unavailable' })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('reports an unreachable engine as offline', async () => {
    const { fn } = mockFetch([new TypeError('Failed to fetch')])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    const e = (await c.status().catch((x: unknown) => x)) as ApiError
    expect(e.offline).toBe(true)
    expect(e.message).toBe("Can't reach Ferrocast.")
  })

  it('rejects unreadable JSON in a 200', async () => {
    const { fn } = mockFetch([new Response('{not json', { status: 200 })])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    const e = (await c.status().catch((x: unknown) => x)) as ApiError
    expect(e.code).toBe('bad_response')
  })

  it('ignores error bodies of the wrong shape', async () => {
    const { fn } = mockFetch([
      json(422, { error: 'just a string' }),
      json(422, { error: { code: 5, message: null } }),
    ])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    for (let i = 0; i < 2; i++) {
      const e = (await c.status().catch((x: unknown) => x)) as ApiError
      expect(e.message).toBe(STATUS_COPY[422].message)
    }
  })

  it('builds the live socket URL with the session in the query', () => {
    const c = new FerroClient({ base: 'http://127.0.0.1:47820', token: 'a b&c', fetch: vi.fn() })
    expect(c.liveUrl()).toBe('ws://127.0.0.1:47820/api/v1/live?session=a+b%26c')
    expect(c.liveUrl(42)).toContain('since=42')
  })

  it('sends multipart uploads without a JSON content type', async () => {
    const { fn, calls } = mockFetch([
      json(200, { id: 'm', kind: 'sound', name: 'a.mp3', bytes: 3, url: 'u' }),
    ])
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    await c.upload(new Blob(['abc'], { type: 'audio/mpeg' }), 'a.mp3')
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData)
    expect((calls[0]?.init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})

describe('errors', () => {
  it('parses Retry-After seconds and dates, clamped', () => {
    expect(parseRetryAfter('5')).toBe(5)
    expect(parseRetryAfter('-3')).toBe(0)
    expect(parseRetryAfter('99999')).toBe(300)
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('soon')).toBeNull()
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10)
  })
  it('describes unknown throwables without leaking them', () => {
    expect(describeError(new Error('stack trace stuff')).message).toBe('Something went wrong.')
    expect(describeError(new ApiError(409, 'name_taken', 'Taken', 'Pick another')).hint).toBe(
      'Pick another',
    )
  })
})
