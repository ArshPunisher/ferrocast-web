// A screen's or window's picture as it is now, for the cards it's picked from (the Add
// dialog and the drawer's Settings).

import { useEffect, useMemo, useRef, useState } from 'react'
import { studioEngineApi } from '@ferrocast/api'
import { useLive } from '../../../lib/store'

/** A screen or window as it looks now, over its card's icon once it comes (owner, 10 Nov:
 * "this should show the proper screen"; 17 Nov: windows too). One still when the card shows:
 * a short capture in the app (about 0.1 s), nothing left running, asked only once the card is
 * in view (a long window list mostly sits below). Where it can't be taken the icon stays. */
export function ScreenStill({
  id,
  label,
  window: win = false,
}: {
  id: unknown
  label: string
  window?: boolean
}) {
  // Without a connection (a form drawn on its own) the card keeps its icon.
  const client = useLive((st) => st.conn?.client ?? null)
  const api = useMemo(() => (client ? studioEngineApi(client) : null), [client])
  const [src, setSrc] = useState<string | null>(null)
  const [seen, setSeen] = useState(false)
  const spot = useRef<HTMLSpanElement>(null)
  const n = typeof id === 'number' ? id : Number(id)
  useEffect(() => {
    const el = spot.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const o = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setSeen(true)
    })
    o.observe(el)
    return () => o.disconnect()
  }, [seen])
  useEffect(() => {
    if (!api || !seen || !Number.isFinite(n)) return
    let alive = true
    api
      .screenStill(n, Math.min(640, Math.round(320 * (window.devicePixelRatio || 1))), win)
      .then((r) => alive && setSrc(r.image))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, n, win, seen])
  if (!src) return <span ref={spot} aria-hidden className="absolute inset-0" />
  return (
    <img
      src={src}
      alt={`What's on ${label} now`}
      // A window keeps its own shape (a tall one isn't cut to fit the card).
      className={`absolute inset-0 size-full ${win ? 'object-contain' : 'object-cover'}`}
      draggable={false}
    />
  )
}
