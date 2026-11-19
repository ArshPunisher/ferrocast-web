import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, FerroClient, studioEngineApi, type FetchLike } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { ScreenStill, type StillState } from './screen-still'
import { clearStillCache, fetchSourceStill, invalidateKindStills } from './thumb-cache'

let roots: Root[] = []
const activeObservers: MockObserver[] = []

class MockObserver {
  cb: IntersectionObserverCallback
  targets: Element[] = []
  disconnected = false

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    activeObservers.push(this)
  }

  observe(el: Element) {
    this.targets.push(el)
  }

  disconnect() {
    this.disconnected = true
  }

  unobserve() {}
  takeRecords() {
    return []
  }
  root = null
  rootMargin = '64px'
  thresholds = [0]

  trigger(isIntersecting: boolean) {
    this.cb(
      this.targets.map(
        (target) =>
          ({
            target,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
          }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    )
  }
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  clearStillCache()
  activeObservers.length = 0
  vi.stubGlobal('IntersectionObserver', MockObserver)
})

afterEach(async () => {
  for (const r of roots) {
    await act(async () => r.unmount())
  }
  roots = []
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setClient(fetchFn: FetchLike) {
  const client = new FerroClient({ base: 'http://127.0.0.1:47820', token: 'tok', fetch: fetchFn })
  useLive.setState({
    conn: {
      mode: 'desktop',
      client,
      socket: () => {
        throw new Error('no socket in test')
      },
    },
  })
  return studioEngineApi(client)
}

async function mountStill(
  props: Partial<Parameters<typeof ScreenStill>[0]> & { id: unknown; label: string },
) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  await act(async () => {
    root.render(<ScreenStill {...props} />)
  })
  return { el, root }
}

const okJson = (image: string | null) =>
  new Response(JSON.stringify({ image }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('thumb-cache scheduler & caching', () => {
  it('caps concurrent still requests at 3 and drops aborted queued tasks before fetching', async () => {
    const resolvers: Array<() => void> = []
    let active = 0
    let maxActive = 0
    const urls: string[] = []
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      urls.push(url)
      active++
      maxActive = Math.max(maxActive, active)
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          active--
          reject(new DOMException('Aborted', 'AbortError'))
        })
        resolvers.push(() => {
          active--
          resolve(okJson(`data:image/jpeg;base64,${urls.length}`))
        })
      })
    })
    const api = studioEngineApi(
      new FerroClient({ base: 'http://127.0.0.1:47820', token: 'tok', fetch: fetchMock }),
    )

    const acQueued = new AbortController()
    const p1 = fetchSourceStill({ api, kind: 'screen_capture', optionKey: 'window', value: 1 })
    const p2 = fetchSourceStill({ api, kind: 'screen_capture', optionKey: 'window', value: 2 })
    const p3 = fetchSourceStill({ api, kind: 'screen_capture', optionKey: 'window', value: 3 })
    const p4 = fetchSourceStill({
      api,
      kind: 'screen_capture',
      optionKey: 'window',
      value: 4,
      signal: acQueued.signal,
    })
    const p5 = fetchSourceStill({ api, kind: 'screen_capture', optionKey: 'window', value: 5 })

    // Only 3 run immediately; #4 and #5 sit queued.
    expect(maxActive).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Aborting #4 while queued cancels it with ZERO HTTP request ever fired for window 4.
    acQueued.abort()
    await expect(p4).rejects.toMatchObject({ name: 'AbortError' })

    let allSettled = false
    const all = Promise.all([p1, p2, p3, p5]).then(() => {
      allSettled = true
    })
    while (!allSettled) {
      while (resolvers.length > 0) resolvers.shift()?.()
      await new Promise((r) => setTimeout(r, 5))
    }
    await all
    expect(urls.some((u) => u.includes('/screens/4/still'))).toBe(false)
    expect(urls.some((u) => u.includes('/screens/5/still'))).toBe(true)
  })

  it('degrades plain 404 on /studio/engine/still to unsupported, while treating null or structured error as error', async () => {
    const fetchUnpatched = vi.fn(async () => new Response('', { status: 404 }))
    const api1 = studioEngineApi(
      new FerroClient({ base: 'http://127.0.0.1:47820', token: 't', fetch: fetchUnpatched }),
    )
    await expect(
      fetchSourceStill({
        api: api1,
        kind: 'av_capture_input_v2',
        optionKey: 'device',
        value: 'cam-1',
      }),
    ).resolves.toEqual({ status: 'unsupported' })

    clearStillCache()
    const fetchErr = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'unavailable', message: 'Busy camera' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const api2 = studioEngineApi(
      new FerroClient({ base: 'http://127.0.0.1:47820', token: 't', fetch: fetchErr }),
    )
    await expect(
      fetchSourceStill({
        api: api2,
        kind: 'av_capture_input_v2',
        optionKey: 'device',
        value: 'cam-1',
      }),
    ).resolves.toEqual({ status: 'error', message: 'Busy camera' })
  })
})

describe('ScreenStill lazy loading, skeleton, error/retry, cache and abort', () => {
  it('fetches lazily only once visible, shows skeleton while loading, and renders low-res frame', async () => {
    let resolveFetch!: (r: Response) => void
    const fetchMock = vi.fn<FetchLike>(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r
        }),
    )
    setClient(fetchMock)

    const { el } = await mountStill({ id: 101, label: 'OBS Studio', window: true })
    // Off-screen initially: 0 network calls!
    expect(fetchMock).toHaveBeenCalledTimes(0)
    expect(el.querySelector('[data-still-state]')?.getAttribute('data-still-state')).toBe('idle')

    // Enters viewport -> enters loading state with skeleton and low-res ?w=240
    await act(async () => {
      activeObservers[0]?.trigger(true)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/screens/101/still?w=240&window=true')
    expect(el.querySelector('.fc-skeleton')).not.toBeNull()
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull()

    await act(async () => {
      resolveFetch(okJson('data:image/jpeg;base64,frame101'))
    })
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,frame101')
    expect(el.querySelector('.fc-skeleton')).toBeNull()
  })

  it('serves cached stills instantaneously on reopen without re-fetching until invalidated', async () => {
    const fetchMock = vi.fn(async () => okJson('data:image/png;base64,cached'))
    setClient(fetchMock)

    const first = await mountStill({ id: 202, label: 'Browser', window: true })
    await act(async () => {
      activeObservers[0]?.trigger(true)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => first.root.unmount())

    // Second open renders cached frame straight away with 0 network calls.
    const second = await mountStill({ id: 202, label: 'Browser', window: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second.el.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,cached')

    // Explicit invalidation clears cache.
    invalidateKindStills('screen_capture')
    await act(async () => second.root.unmount())
    await mountStill({ id: 202, label: 'Browser', window: true })
    await act(async () => {
      activeObservers[activeObservers.length - 1]?.trigger(true)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts in-flight requests cleanly when unmounted / dialog closes', async () => {
    let seenSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      seenSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    setClient(fetchMock)

    const { root } = await mountStill({ id: 303, label: 'Game', window: true })
    await act(async () => {
      activeObservers[0]?.trigger(true)
    })
    expect(seenSignal?.aborted).toBe(false)

    await act(async () => {
      root.unmount()
    })
    expect(seenSignal?.aborted).toBe(true)
    expect(activeObservers[0]?.disconnected).toBe(true)
  })

  it('shows a tile error state on failure and recovers on retry', async () => {
    let count = 0
    const fetchMock = vi.fn(async () => {
      count++
      if (count === 1) return okJson(null)
      return okJson('data:image/jpeg;base64,recovered')
    })
    setClient(fetchMock)

    let latestStatus: StillState = 'idle'
    let doRetry: (() => void) | null = null
    const { el } = await mountStill({
      id: 'cam-1',
      kind: 'av_capture_input_v2',
      optionKey: 'device',
      label: 'FaceTime Camera',
      onStatusChange: (st, retry) => {
        latestStatus = st
        doRetry = retry
      },
    })

    await act(async () => {
      activeObservers[0]?.trigger(true)
    })
    expect(latestStatus).toBe('error')
    expect(el.textContent).toContain('Unavailable')

    await act(async () => {
      doRetry?.()
    })
    expect(latestStatus).toBe('loaded')
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,recovered')
  })

  it('exposes ApiError error message gracefully when screenStill rejects', async () => {
    const fetchMock = vi.fn(async () => {
      throw new ApiError(500, 'capture_failed', 'Window minimized')
    })
    setClient(fetchMock)
    const { el } = await mountStill({ id: 404, label: 'Minimized App', window: true })
    await act(async () => {
      activeObservers[0]?.trigger(true)
    })
    expect(el.querySelector('[data-still-state]')?.getAttribute('data-still-state')).toBe('error')
    expect(el.textContent).toContain('Unavailable')
  })
})
