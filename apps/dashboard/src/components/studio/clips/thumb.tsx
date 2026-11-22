// A clip's picture. FFmpeg makes it, so at most two are asked for at once (a full folder must
// not start a dozen encoders); each is remembered for the clip's size and date.

import { useEffect, useState } from 'react'
import { FilmStrip } from '@phosphor-icons/react'
import type { Clip, ClipsApi } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'

const CACHE_MAX = 300
/** Pictures by clip, kept per connection: two engines can list clips of the same name and size. */
let caches = new WeakMap<ClipsApi, Map<string, string | null>>()
const cacheOf = (api: ClipsApi): Map<string, string | null> => {
  let c = caches.get(api)
  if (!c) caches.set(api, (c = new Map()))
  return c
}
const waiting: (() => void)[] = []
let running = 0

/** Runs `fn` when a slot is free; a `live()` that has turned false by then skips it (the card
 * scrolled away or closed), so a long folder doesn't queue pictures nobody is looking at. */
function schedule<T>(fn: () => Promise<T>, live: () => boolean): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const go = () => {
      if (!live()) {
        waiting.shift()?.()
        resolve(null)
        return
      }
      running++
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--
          waiting.shift()?.()
        })
    }
    if (running < 2) go()
    else waiting.push(go)
  })
}

export const thumbKey = (c: Pick<Clip, 'id' | 'size' | 'modified'>) =>
  `${c.id}|${c.size}|${c.modified}`

/** For tests: forgets every picture. */
export function resetThumbs(): void {
  caches = new WeakMap()
}

export type ThumbState =
  { status: 'loading' } | { status: 'ready'; src: string } | { status: 'none' }

/** The picture of a clip, asked for once `enabled` (and remembered). Until then: loading. */
export function useThumb(
  api: ClipsApi,
  clip: Pick<Clip, 'id' | 'size' | 'modified'>,
  enabled = true,
): ThumbState {
  const key = thumbKey(clip)
  const [state, setState] = useState<ThumbState>(() => {
    const hit = cacheOf(api).get(key)
    return hit
      ? { status: 'ready', src: hit }
      : hit === null
        ? { status: 'none' }
        : { status: 'loading' }
  })
  useEffect(() => {
    if (!enabled) return
    const cache = cacheOf(api)
    const hit = cache.get(key)
    if (hit !== undefined) {
      setState(hit ? { status: 'ready', src: hit } : { status: 'none' })
      return
    }
    let alive = true
    setState({ status: 'loading' })
    schedule(
      () => api.thumbnail(clip.id),
      () => alive,
    )
      .then((r) => {
        if (!r) return
        const cache = cacheOf(api)
        cache.set(key, r.image)
        // The oldest go: a long folder's pictures don't all stay in memory.
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
        if (alive) setState({ status: 'ready', src: r.image })
      })
      .catch(() => {
        // Not kept: FFmpeg may arrive, or the file may finish being written.
        if (alive) setState({ status: 'none' })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, enabled])
  // Not asked for yet (off screen): the placeholder, not "no picture".
  return enabled ? state : { status: 'loading' }
}

/** The picture area: 16:9 (or 9:16 centred in it for a vertical one), with its three states. */
export function Thumb({
  state,
  vertical = false,
  className,
}: {
  state: ThumbState
  vertical?: boolean
  className?: string
}) {
  return (
    <div
      className={cx(
        'relative grid aspect-video w-full place-items-center overflow-hidden rounded-[10px] bg-inset',
        className,
      )}
    >
      {state.status === 'ready' && (
        <img
          src={state.src}
          alt=""
          width={vertical ? 180 : 320}
          height={vertical ? 320 : 180}
          loading="lazy"
          draggable={false}
          className={cx('size-full', vertical ? 'object-contain' : 'object-cover')}
        />
      )}
      {state.status === 'loading' && (
        <div className="fc-skeleton absolute inset-0" aria-hidden="true" />
      )}
      {state.status === 'none' && (
        <span
          aria-hidden="true"
          className="flex flex-col items-center gap-1 text-[13px] text-text-3"
          title="No picture could be taken from this clip (it may still be being written)."
        >
          <FilmStrip size={26} aria-hidden="true" />
          No picture
        </span>
      )}
    </div>
  )
}

/** True once the element has come near the window (and stays true): a long folder asks for
 * the pictures on screen, not all of them. Without IntersectionObserver (old webviews, tests)
 * every card counts as seen. */
export function useSeen(ref: { current: Element | null }): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen])
  return seen
}
