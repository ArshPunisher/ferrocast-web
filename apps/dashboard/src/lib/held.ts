// Held messages (API.md §4 Chat and moderation): the list, keeping it in step with the
// engine, and the two actions (Approve shows it in chat overlays, Remove deletes it).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, PLATFORM_LABEL, describeError, tameText, type FerroEvent } from '@ferrocast/api'
import { toast } from '@ferrocast/ui'
import { useClient } from './hooks'
import { useLive } from './store'

export interface HeldItem {
  event: FerroEvent
  reason: string
}

/** The held messages, oldest first, as the live store knows them. */
export function useHeldItems(): HeldItem[] {
  const held = useLive((s) => s.held)
  const heldEvents = useLive((s) => s.heldEvents)
  return useMemo(
    () =>
      [...held.entries()].flatMap(([id, reason]) => {
        const event = heldEvents.get(id)
        return event ? [{ event, reason }] : []
      }),
    [held, heldEvents],
  )
}

/**
 * Loads the engine's held list once and again after a resync, so messages held before
 * this dashboard opened (or handled by another mod meanwhile) are right.
 */
export function useHeldSync(): { error: unknown; loading: boolean; reload: () => void } {
  const client = useClient()
  const syncHeld = useLive((s) => s.syncHeld)
  const resyncs = useLive((s) => s.resyncs)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    client
      .held()
      .then((list) => {
        if (!alive) return
        syncHeld(list)
        setError(null)
      })
      .catch((e: unknown) => alive && setError(e))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [client, syncHeld, resyncs, tick])
  return { error, loading, reload: useCallback(() => setTick((t) => t + 1), []) }
}

/** Approve and Remove, with "another mod got there first" treated as done. */
export function useHeldActions(): {
  approve: (e: FerroEvent) => void
  remove: (e: FerroEvent) => void
  /** Messages with an Approve or Remove still on its way. */
  busy: ReadonlySet<string>
} {
  const client = useClient()
  const resolveHeld = useLive((s) => s.resolveHeld)
  // Every message with a request in flight: a double click sends one request (the second
  // would come back "another mod got there first", which isn't true).
  const inFlight = useRef(new Set<string>())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const act = useCallback(
    async (e: FerroEvent, how: 'released' | 'dropped') => {
      if (inFlight.current.has(e.id)) return
      inFlight.current.add(e.id)
      setBusy(new Set(inFlight.current))
      const name =
        e.kind.type === 'chat_message' ? tameText(e.kind.actor.display_name) : 'Their message'
      try {
        await (how === 'released' ? client.releaseHeld(e.id) : client.dropHeld(e.id))
        resolveHeld(e.id, how)
        toast({
          tone: 'ok',
          message:
            how === 'released'
              ? `Approved. ${name}’s message now shows in chat overlays.`
              : `Removed. ${name}’s message is deleted on ${PLATFORM_LABEL[e.platform]}.`,
        })
      } catch (err) {
        if (err instanceof ApiError && err.code === 'held_not_found') {
          // Another mod (or another window) already decided: nothing left to do here.
          resolveHeld(e.id, how)
          toast({ tone: 'info', message: 'Another mod already dealt with that message.' })
        } else {
          const d = describeError(err)
          toast({ tone: 'error', message: d.message, hint: d.hint })
        }
      } finally {
        inFlight.current.delete(e.id)
        setBusy(new Set(inFlight.current))
      }
    },
    [client, resolveHeld],
  )
  return {
    approve: useCallback((e) => void act(e, 'released'), [act]),
    remove: useCallback((e) => void act(e, 'dropped'), [act]),
    busy,
  }
}
