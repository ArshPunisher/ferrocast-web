import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError, type FerroClient } from '@ferrocast/api'
import { toast } from '@ferrocast/ui'
import { useLive } from './store'

export function useClient(): FerroClient {
  const conn = useLive((s) => s.conn)
  if (!conn) throw new Error('No connection yet')
  return conn.client
}

export interface Resource<T> {
  data: T | null
  error: unknown
  loading: boolean
  reload: () => void
  set: (v: T | ((prev: T | null) => T)) => void
}

/** Loads data once (and on `reload`), keeping the last good value while reloading. */
export function useResource<T>(
  load: (c: FerroClient) => Promise<T>,
  deps: unknown[] = [],
): Resource<T> {
  const client = useClient()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    let alive = true
    setLoading(true)
    loadRef
      .current(client)
      .then((v) => {
        if (!alive) return
        setData(v)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError(e)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, nonce, ...deps])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const set = useCallback((v: T | ((prev: T | null) => T)) => {
    setData((prev) => (typeof v === 'function' ? (v as (p: T | null) => T)(prev) : v))
  }, [])
  return { data, error, loading, reload, set }
}

/**
 * Runs an action, tracks busy state, and turns any failure into a toast with the engine's
 * own copy and hint. Resolves with the result, or undefined if it failed.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(
    async <T>(
      key: string,
      fn: () => Promise<T>,
      opts: { success?: string | ((v: T) => string | null); quiet?: boolean } = {},
    ): Promise<T | undefined> => {
      setBusy(key)
      try {
        const v = await fn()
        const msg = typeof opts.success === 'function' ? opts.success(v) : opts.success
        if (msg) toast({ tone: 'ok', message: msg })
        return v
      } catch (e) {
        if (!opts.quiet) {
          const d = describeError(e)
          toast({ tone: 'error', message: d.message, hint: d.hint })
        }
        return undefined
      } finally {
        setBusy(null)
      }
    },
    [],
  )
  return { busy, run }
}

/** Wraps a call that returns nothing so `run` can report success as `true`. */
export async function done(p: Promise<unknown>): Promise<true> {
  await p
  return true
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(q).matches : false,
  )
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}
