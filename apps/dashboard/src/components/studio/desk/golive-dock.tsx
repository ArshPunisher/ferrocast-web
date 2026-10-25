// The "Go live to" panel: the platforms the Studio's picture goes to, each switched on or off
// here; adding, ordering and the rest open Go live's full list.

import { useState } from 'react'
import { onCanvas, type DestinationView, type GoLiveView } from '@ferrocast/api'
import { Button, Dialog, Skeleton, Switch } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, type Resource } from '../../../lib/hooks'
import { Logo, Platforms, RowText, useGoLive } from '../golive'
import { DockHeader } from './layout'

export function GoLiveDock({ res, view }: { res: Resource<GoLiveView>; view: GoLiveView | null }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const [managing, setManaging] = useState(false)
  const mine = view ? onCanvas(view.destinations, 'main') : []
  const toggle = (d: DestinationView, enabled: boolean) => {
    if (!view) return
    // The engine wants every destination, in order, both pictures.
    const all = view.destinations.map((x) => ({
      id: x.id,
      enabled: x.id === d.id ? enabled : x.enabled,
    }))
    res.set((v) => ({
      ...(v ?? view),
      destinations: (v ?? view).destinations.map((x) => (x.id === d.id ? { ...x, enabled } : x)),
    }))
    void run(`on:${d.id}`, () => api.saveOrder(all)).then((r) => {
      if (!r) res.reload()
    })
  }
  return (
    <section aria-label="Go live to" className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id="golive"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setManaging(true)}>
            Manage
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {res.error && !view ? (
          <div className="p-3">
            <LoadError error={res.error} onRetry={res.reload} />
          </div>
        ) : !view ? (
          <Skeleton className="m-3 h-28" />
        ) : mine.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-3">
            <p className="m-0 text-[13.5px] text-text-2">No platforms yet.</p>
            <Button size="sm" variant="primary" onClick={() => setManaging(true)}>
              Add a platform
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col" aria-label="Platforms">
            {mine.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <Logo kind={d.kind} />
                <div className="min-w-0 flex-1">
                  <RowText d={d} />
                </div>
                <Switch
                  label={`Go live on ${d.name}`}
                  hideLabel
                  checked={d.enabled}
                  disabled={busy !== null || !!d.blocked}
                  onChange={(on) => toggle(d, on)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={managing} onClose={() => setManaging(false)} size="lg" title="Your platforms">
        {view && <Platforms view={view} onSaved={res.reload} />}
      </Dialog>
    </section>
  )
}
