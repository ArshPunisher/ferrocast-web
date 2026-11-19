import { ApiError, describeError, isAbortError, studioEngineApi } from '@ferrocast/api'

export type StudioEngineClient = ReturnType<typeof studioEngineApi>

/** Thumbnail capture target width (low resolution keeps engine stills fast and light). */
export const STILL_WIDTH = 240

/** Cache lifetime for a captured picker still frame. */
export const STILL_TTL_MS = 20_000

/** Max entries kept in memory across dialog reopens. */
const MAX_CACHE_ENTRIES = 96

/** Bound concurrent browser requests so scrolling or slow captures don't stampede the engine. */
export const MAX_CONCURRENT_STILLS = 3

export type StillOutcome =
  { status: 'ok'; image: string } | { status: 'unsupported' } | { status: 'error'; message: string }

interface CacheEntry {
  image: string
  at: number
}

const stillCache = new Map<string, CacheEntry>()

/** Set once if an older engine returns plain 404 (no structured code) for `/studio/engine/still`. */
let deviceStillUnsupported = false

interface QueuedTask {
  signal: AbortSignal | undefined
  run: () => void
  cancel: () => void
}

let inFlight = 0
const queue: QueuedTask[] = []

function makeAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') return reason
  const err = new Error('The operation was aborted.')
  err.name = 'AbortError'
  return err
}

function drainQueue(): void {
  while (inFlight < MAX_CONCURRENT_STILLS && queue.length > 0) {
    const next = queue.shift()
    if (!next) continue
    if (next.signal?.aborted) {
      next.cancel()
      continue
    }
    next.run()
  }
}

function scheduleStill<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(makeAbortError(signal.reason))
  return new Promise<T>((resolve, reject) => {
    let started = false
    const onAbortEarly = () => {
      if (started) return
      const idx = queue.indexOf(task)
      if (idx >= 0) queue.splice(idx, 1)
      reject(makeAbortError(signal?.reason))
    }
    const task: QueuedTask = {
      signal,
      cancel: () => {
        signal?.removeEventListener('abort', onAbortEarly)
        reject(makeAbortError(signal?.reason))
      },
      run: () => {
        started = true
        signal?.removeEventListener('abort', onAbortEarly)
        if (signal?.aborted) {
          reject(makeAbortError(signal.reason))
          drainQueue()
          return
        }
        inFlight += 1
        fn().then(
          (val) => {
            inFlight -= 1
            drainQueue()
            resolve(val)
          },
          (err) => {
            inFlight -= 1
            drainQueue()
            reject(err)
          },
        )
      },
    }
    signal?.addEventListener('abort', onAbortEarly, { once: true })
    queue.push(task)
    drainQueue()
  })
}

const CAPTURE_KEYS = new Set(['display', 'window', 'monitor', 'monitor_id', 'screen'])
const CAMERA_KINDS = new Set([
  'av_capture_input_v2',
  'macos-avcapture',
  'dshow_input',
  'v4l2_input',
])
const CAMERA_KEYS = new Set(['device', 'video_device_id', 'device_id'])
const SCREEN_KINDS = new Set(['screen_capture', 'monitor_capture', 'window_capture', 'xshm_input'])

/** True when this option represents a screen, window, camera or capture card that can show a still. */
export function isStillCapable(kind: string, optionKey: string): boolean {
  if (SCREEN_KINDS.has(kind) && CAPTURE_KEYS.has(optionKey)) return true
  if (CAMERA_KINDS.has(kind) && CAMERA_KEYS.has(optionKey)) return true
  return false
}

export function stillCacheKey(kind: string, optionKey: string, value: unknown): string {
  return `${kind}:${optionKey}:${String(value)}`
}

export function getCachedStill(key: string, now = Date.now()): string | null {
  const hit = stillCache.get(key)
  if (!hit) return null
  if (now - hit.at > STILL_TTL_MS) {
    stillCache.delete(key)
    return null
  }
  // Refresh LRU order cleanly.
  stillCache.delete(key)
  stillCache.set(key, hit)
  return hit.image
}

function setCachedStill(key: string, image: string, now = Date.now()): void {
  if (stillCache.has(key)) stillCache.delete(key)
  stillCache.set(key, { image, at: now })
  while (stillCache.size > MAX_CACHE_ENTRIES) {
    const oldest = stillCache.keys().next().value
    if (oldest === undefined) break
    stillCache.delete(oldest)
  }
}

export function invalidateStill(key: string): void {
  stillCache.delete(key)
}

export function invalidateKindStills(kind: string): void {
  const prefix = `${kind}:`
  for (const k of stillCache.keys()) {
    if (k.startsWith(prefix)) stillCache.delete(k)
  }
}

export function clearStillCache(): void {
  stillCache.clear()
  deviceStillUnsupported = false
}

/**
 * Fetches one low-res still frame for a source option, using the in-memory cache first, queueing
 * within `MAX_CONCURRENT_STILLS`, and aborting cleanly via `signal`.
 */
export async function fetchSourceStill({
  api,
  kind,
  optionKey,
  value,
  width = STILL_WIDTH,
  signal,
  bypassCache = false,
}: {
  api: StudioEngineClient
  kind: string
  optionKey: string
  value: unknown
  width?: number
  signal?: AbortSignal
  bypassCache?: boolean
}): Promise<StillOutcome> {
  if (!isStillCapable(kind, optionKey)) return { status: 'unsupported' }
  const cacheKey = stillCacheKey(kind, optionKey, value)
  if (!bypassCache) {
    const cached = getCachedStill(cacheKey)
    if (cached) return { status: 'ok', image: cached }
  } else {
    stillCache.delete(cacheKey)
  }

  const isLegacyMacScreen =
    kind === 'screen_capture' && (optionKey === 'display' || optionKey === 'window')
  const numericId = typeof value === 'number' ? value : Number(value)
  if (isLegacyMacScreen && !Number.isFinite(numericId)) {
    return { status: 'error', message: 'Preview unavailable' }
  }
  if (!isLegacyMacScreen && deviceStillUnsupported) {
    return { status: 'unsupported' }
  }

  try {
    const res = await scheduleStill(signal, () =>
      isLegacyMacScreen
        ? api.screenStill(numericId, width, optionKey === 'window', signal)
        : api.sourceStill(kind, optionKey, String(value), width, signal),
    )
    if (signal?.aborted) throw makeAbortError(signal.reason)
    if (!res.image) {
      return { status: 'error', message: 'No frame returned' }
    }
    setCachedStill(cacheKey, res.image)
    return { status: 'ok', image: res.image }
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) throw err
    // Unpatched engines return a bodyless 404 (`http_404`) for the newer `/studio/engine/still`
    // route; fall back silently to the kind icon rather than showing error badges on every camera.
    if (
      !isLegacyMacScreen &&
      err instanceof ApiError &&
      err.status === 404 &&
      err.code === 'http_404'
    ) {
      deviceStillUnsupported = true
      return { status: 'unsupported' }
    }
    return { status: 'error', message: describeError(err).message }
  }
}
