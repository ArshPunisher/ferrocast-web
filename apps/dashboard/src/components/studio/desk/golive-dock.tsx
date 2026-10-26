// The "Go live to" panel: the platforms the Studio's picture goes to, each switched on or off
// here; adding, ordering and the rest open Go live's full list.

import { useRef, useState } from 'react'
import { MAX_STREAM_TITLE, onCanvas, type DestinationView, type GoLiveView } from '@ferrocast/api'
import { Button, Dialog, Input, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource, type Resource } from '../../../lib/hooks'
import { href } from '../../../lib/router'
import { useStudio } from '../common'
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
            <p className="m-0 text-[14.5px] text-text-2">No platforms yet.</p>
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
        <StreamTitle />
      </div>
      <Dialog open={managing} onClose={() => setManaging(false)} size="lg" title="Your platforms">
        {view && <Platforms view={view} onSaved={res.reload} />}
      </Dialog>
    </section>
  )
}

/** The title and category viewers see: the title is set everywhere from here (Enter), the
 * category in Stream info. */
function StreamTitle() {
  const studio = useStudio()
  const info = useResource(() => studio.streamInfo(), [studio])
  const { run, busy } = useAction()
  const last = info.data?.last?.info
  const [title, setTitle] = useState<string | null>(null)
  const shown = title ?? last?.title ?? ''
  // Enter submits and the field then blurs: one apply per edit.
  const applying = useRef(false)
  const apply = async () => {
    if (applying.current) return
    const t = shown.trim()
    if (!t || t === last?.title) return setTitle(null)
    applying.current = true
    const r = await run('title', () => studio.applyStreamInfo({ title: t })).finally(() => {
      applying.current = false
    })
    if (!r) return
    setTitle(null)
    info.reload()
    toast(
      r.failed > 0
        ? {
            tone: 'warn',
            message: `Title set on ${r.ok}, not on ${r.failed}.`,
            hint: 'Stream info shows why.',
          }
        : {
            tone: 'ok',
            message: r.ok > 0 ? 'Title set everywhere.' : 'Saved for your next stream.',
          },
    )
  }
  if (!info.data) return null
  return (
    <form
      className="flex flex-col gap-3 border-t border-line px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        void apply()
      }}
    >
      <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-text-2">
        Title
        <Input
          value={shown}
          maxLength={MAX_STREAM_TITLE}
          autoComplete="off"
          disabled={busy === 'title'}
          placeholder="What you're streaming…"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void apply()}
        />
      </label>
      <div className="flex items-center justify-between gap-2 text-[13.5px]">
        <span className="min-w-0 truncate text-text-2">
          <span className="font-semibold">Category</span>{' '}
          <span className="text-text">{last?.category?.name ?? 'Not set'}</span>
        </span>
        <a
          className="shrink-0 font-semibold text-accent-text hover:underline"
          href={href({ name: 'studio', section: 'info' })}
        >
          Change
        </a>
      </div>
    </form>
  )
}
