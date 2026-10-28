// The "Go live to" panel: the platforms the Studio's picture goes to, each switched on or off
// here; adding, ordering and the rest open Go live's full list.

import { useEffect, useRef, useState } from 'react'
import {
  MAX_STREAM_TITLE,
  onCanvas,
  type DestinationView,
  type GoLiveView,
  type StudioSettings,
} from '@ferrocast/api'
import { DeviceMobile, Gauge, Plus } from '@phosphor-icons/react'
import { Button, Dialog, Input, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource, type Resource } from '../../../lib/hooks'
import { href } from '../../../lib/router'
import { useStudio } from '../common'
import { Logo, Platforms, RowText, useGoLive } from '../golive'
import { DockHeader } from './layout'
import { useDesk } from './common'
import { AutoConfigDialog } from './auto-config'

export function GoLiveDock({ res, view }: { res: Resource<GoLiveView>; view: GoLiveView | null }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  // Which platforms Manage edits: the wide picture's or the vertical one's.
  const [managing, setManaging] = useState<'main' | 'vertical' | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const desk = useDesk()
  const applyOptimized = (patch: Partial<StudioSettings>) =>
    void run('optimize', async () => {
      const cur = await desk.api.studioSettings()
      const r = await desk.api.setStudioSettings({ ...cur, ...patch })
      desk.prefs.set(r.settings)
      return r
    }).then((r) => {
      if (!r) return
      toast(
        r.restart
          ? { tone: 'warn', message: 'Optimized.', hint: r.restart }
          : { tone: 'ok', message: 'Optimized. The next stream uses these settings.' },
      )
    })
  const mine = view ? onCanvas(view.destinations, 'main') : []
  // Owner's pick G1: the vertical platforms in their own group under the wide ones.
  const tall = view ? onCanvas(view.destinations, 'vertical') : []
  // With the Studio, the vertical stream is always its vertical picture (cutting is for OBS).
  const cutting = view?.cut.source === 'cut'
  const reloadView = res.reload
  useEffect(() => {
    if (!cutting) return
    void api
      .setVerticalSource('canvas')
      .then(reloadView)
      .catch(() => undefined)
  }, [cutting, api, reloadView])
  const hasPicture = !!desk.scenes.data?.vertical
  /** A platform says the video is too much: the Studio's bitrate down to what it asks. */
  const fixBitrate = (kbps: number) =>
    void run('bitrate', async () => {
      const cur = await desk.api.studioSettings()
      const r = await desk.api.setStudioSettings({ ...cur, video_kbps: kbps })
      desk.prefs.set(r.settings)
      return r
    }).then((r) => {
      if (!r) return
      toast(
        r.restart
          ? {
              tone: 'warn',
              message: `Video bitrate set to ${kbps.toLocaleString()} kbps.`,
              hint: r.restart,
            }
          : { tone: 'ok', message: `Video bitrate set to ${kbps.toLocaleString()} kbps.` },
      )
    })
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
  const row = (d: DestinationView) => (
    <li key={d.id} className="flex items-start gap-2.5 px-3 py-2.5">
      <Logo kind={d.kind} />
      <div className="min-w-0 flex-1">
        <RowText d={d} fixBitrate={fixBitrate} />
      </div>
      {/* At the top, lined up with the name, however long the notes below. */}
      <Switch
        label={`Go live on ${d.name}`}
        hideLabel
        checked={d.enabled}
        disabled={busy !== null || !!d.blocked}
        onChange={(on) => toggle(d, on)}
      />
    </li>
  )
  return (
    <section aria-label="Go live to" className="flex min-h-0 flex-1 flex-col">
      {desk.prefs.data && (
        <AutoConfigDialog
          open={optimizing}
          onClose={() => setOptimizing(false)}
          s={desk.prefs.data}
          onApply={applyOptimized}
        />
      )}
      <DockHeader
        id="golive"
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              title="Test your upload and pick the bitrate for each platform, so the game and the stream both run smooth"
              onClick={() => setOptimizing(true)}
            >
              <Gauge size={15} weight="bold" aria-hidden /> Optimize
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setManaging('main')}>
              Manage
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {res.error && !view ? (
          <div className="p-3">
            <LoadError error={res.error} onRetry={res.reload} />
          </div>
        ) : !view ? (
          <Skeleton className="m-3 h-28" />
        ) : (
          <>
            {mine.length === 0 ? (
              <div className="flex flex-col items-start gap-3 p-3">
                <p className="m-0 text-[14.5px] text-text-2">No platforms yet.</p>
                <Button size="sm" variant="primary" onClick={() => setManaging('main')}>
                  Add a platform
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col" aria-label="Platforms">
                {mine.map(row)}
              </ul>
            )}
            {/* Shown whatever the wide list holds: the Vertical tab sends people here. */}
            <section aria-label="Vertical platforms">
              <h3 className="m-0 flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[12px] font-extrabold tracking-[0.06em] text-text-3 uppercase">
                <DeviceMobile size={14} weight="bold" aria-hidden />
                Vertical
                <span className="ml-auto font-semibold tracking-normal normal-case">
                  {hasPicture ? 'the vertical picture' : 'add it: Vertical, under the picture'}
                </span>
              </h3>
              {tall.length > 0 && <ul className="flex flex-col">{tall.map(row)}</ul>}
              <button
                type="button"
                onClick={() => setManaging('vertical')}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] font-semibold text-text-3 hover:text-text"
              >
                <Plus size={14} weight="bold" aria-hidden />
                Add a vertical destination
              </button>
            </section>
          </>
        )}
        <StreamTitle />
      </div>
      <Dialog
        open={managing !== null}
        onClose={() => setManaging(null)}
        size="lg"
        title={managing === 'vertical' ? 'Your vertical platforms' : 'Your platforms'}
      >
        {view && managing && <Platforms view={view} onSaved={res.reload} canvas={managing} />}
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
