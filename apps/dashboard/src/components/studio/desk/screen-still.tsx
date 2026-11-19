import { useEffect, useMemo, useRef, useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { isAbortError, studioEngineApi } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import {
  STILL_WIDTH,
  fetchSourceStill,
  getCachedStill,
  isStillCapable,
  stillCacheKey,
} from './thumb-cache'

export type StillState = 'idle' | 'loading' | 'loaded' | 'error' | 'unsupported'

/**
 * Lazily fetches ONE low-resolution still frame for a capture tile (display, window, camera, or
 * capture card) once visible, caches it across reopens, shows a skeleton while loading, renders
 * a clear error badge on failure, and aborts the HTTP request immediately on hide or close.
 */
export function ScreenStill({
  id,
  label,
  window: win = false,
  kind = 'screen_capture',
  optionKey,
  refreshKey = 0,
  onStatusChange,
  compact = false,
}: {
  id: unknown
  label: string
  window?: boolean
  kind?: string
  optionKey?: string
  refreshKey?: number
  onStatusChange?: (status: StillState, retry: () => void) => void
  compact?: boolean
}) {
  const client = useLive((st) => st.conn?.client ?? null)
  const api = useMemo(() => (client ? studioEngineApi(client) : null), [client])
  const resolvedKey = optionKey ?? (win ? 'window' : 'display')
  const capable = isStillCapable(kind, resolvedKey)
  const cacheKey = stillCacheKey(kind, resolvedKey, id)

  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  const [retryCount, setRetryCount] = useState(0)
  const [result, setResult] = useState<{
    key: string
    status: StillState
    image: string | null
    error: string | null
  }>(() => {
    const cached = capable ? getCachedStill(cacheKey) : null
    return cached
      ? { key: cacheKey, status: 'loaded', image: cached, error: null }
      : { key: cacheKey, status: capable ? 'idle' : 'unsupported', image: null, error: null }
  })

  const spot = useRef<HTMLSpanElement>(null)
  const loadedForCurrentKey = result.key === cacheKey && result.status === 'loaded'

  useEffect(() => {
    if (!capable || !api) return
    const cached = refreshKey === 0 && retryCount === 0 ? getCachedStill(cacheKey) : null
    if (cached) {
      setResult({ key: cacheKey, status: 'loaded', image: cached, error: null })
      return
    }
    const el = spot.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.some((entry) => entry.isIntersecting)
        setInView((prev) => {
          if (intersecting) return true
          return prev && loadedForCurrentKey
        })
      },
      { rootMargin: '64px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [api, cacheKey, capable, loadedForCurrentKey, refreshKey, retryCount])

  useEffect(() => {
    if (!api || !capable || !inView) return
    const bypass = refreshKey > 0 || retryCount > 0
    if (!bypass) {
      const cached = getCachedStill(cacheKey)
      if (cached) {
        setResult({ key: cacheKey, status: 'loaded', image: cached, error: null })
        return
      }
    }
    const ac = new AbortController()
    setResult((prev) =>
      prev.key === cacheKey && prev.status === 'loaded' && !bypass
        ? prev
        : { key: cacheKey, status: 'loading', image: null, error: null },
    )
    fetchSourceStill({
      api,
      kind,
      optionKey: resolvedKey,
      value: id,
      width: STILL_WIDTH,
      signal: ac.signal,
      bypassCache: bypass,
    })
      .then((outcome) => {
        if (ac.signal.aborted) return
        if (outcome.status === 'ok') {
          setResult({ key: cacheKey, status: 'loaded', image: outcome.image, error: null })
        } else if (outcome.status === 'unsupported') {
          setResult({ key: cacheKey, status: 'unsupported', image: null, error: null })
        } else {
          setResult({ key: cacheKey, status: 'error', image: null, error: outcome.message })
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted || isAbortError(err)) return
        setResult({ key: cacheKey, status: 'error', image: null, error: 'Preview unavailable' })
      })
    return () => {
      ac.abort()
    }
  }, [api, cacheKey, capable, id, inView, kind, refreshKey, resolvedKey, retryCount])

  const status: StillState = result.key === cacheKey ? result.status : 'idle'
  const src = result.key === cacheKey ? result.image : null
  const errorMsg = result.key === cacheKey ? result.error : null

  useEffect(() => {
    onStatusChange?.(status, () => setRetryCount((n) => n + 1))
  }, [onStatusChange, status])

  return (
    <span
      ref={spot}
      data-still-state={status}
      aria-busy={status === 'loading' || undefined}
      className="pointer-events-none absolute inset-0"
    >
      {status === 'loading' && !src && (
        <span
          aria-hidden
          className="fc-skeleton pointer-events-none absolute inset-0 opacity-75 motion-reduce:animate-none"
        />
      )}
      {src && (
        <img
          src={src}
          alt=""
          aria-label={undefined}
          decoding="async"
          title={label}
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-100 transition-opacity duration-150 motion-reduce:transition-none"
        />
      )}
      {status === 'error' && !src && (
        <span
          title={errorMsg ?? 'Preview unavailable'}
          className={cx(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-inset/90 text-danger',
            compact ? 'p-0.5' : 'px-2 text-center',
          )}
        >
          <WarningCircle size={compact ? 14 : 20} weight="fill" aria-hidden />
          {!compact && (
            <span className="rounded-full bg-surface-1/95 px-2 py-0.5 text-[12px] font-semibold text-danger shadow-xs">
              Unavailable
            </span>
          )}
        </span>
      )}
    </span>
  )
}
