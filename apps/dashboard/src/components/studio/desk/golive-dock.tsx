// The "Go live to" panel: the platforms the Studio's picture goes to, each switched on or off
// here; adding, ordering and the rest open Go live's full list.

import { useEffect, useRef, useState } from 'react'
import {
  healthText,
  onCanvas,
  reconnectingText,
  type DestinationView,
  type GoLiveView,
  type StudioSettings,
} from '@ferrocast/api'
import { DeviceMobile, Gauge, GearSix, Plus } from '@phosphor-icons/react'
import { IconButton, Button, Dialog, InfoLine, Skeleton, Switch, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, type Resource } from '../../../lib/hooks'
import { AllFailedBanner, Logo, Platforms, RowText, useGoLive } from '../golive'
import { useSaveOrder } from '../save-order'
import { DockHeader } from './layout'
import { useDesk, useDeskStats } from './common'
import { AutoConfigDialog } from './auto-config'

export function GoLiveDock({ res, view }: { res: Resource<GoLiveView>; view: GoLiveView | null }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  // Which platforms Manage edits: the wide picture's or the vertical one's.
  const [managing, setManaging] = useState<'main' | 'vertical' | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const desk = useDesk()
  // While live, the stream on air takes it at once (frame rate, size, encoder, bitrate).
  const live = !!view?.live
  // On air, each destination's own line ("Live · 6.5 Mbps") comes from this reading, which no
  // frame brings for the Studio's own stream: read again now and then (S18 B5).
  const onAir = useDeskStats((s) => !!s?.stream && !s.stream.failed)
  const wasOnAir = useRef(onAir)
  const { reload } = res
  useEffect(() => {
    if (!onAir) {
      if (wasOnAir.current) reload()
      wasOnAir.current = false
      return
    }
    wasOnAir.current = true
    reload()
    const poll = () => {
      if (!document.hidden) reload()
    }
    const t = setInterval(poll, 5000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [onAir, reload])
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
          ? { tone: 'warn', message: 'Optimized.', hint: r.restart, detail: r.restart_detail }
          : {
              tone: 'ok',
              message: live
                ? 'Optimized. Your stream uses it now.'
                : 'Optimized. The next stream uses these settings.',
            },
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
              detail: r.restart_detail,
            }
          : { tone: 'ok', message: `Video bitrate set to ${kbps.toLocaleString()} kbps.` },
      )
    })
  const saver = useSaveOrder(api, () => res.reload())
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
    void run(`on:${d.id}`, () => saver.request(all)).then((r) => {
      if (!r) res.reload()
    })
  }
  const retry = (d: DestinationView) =>
    void run(`retry:${d.id}`, () => api.resume(d.id).then(() => true), {
      success: `Retrying ${d.name}.`,
    }).then((r) => {
      if (r) res.reload()
    })
  const canRetry = onAir || live
  const row = (d: DestinationView) => (
    <li key={d.id} className="flex items-start gap-2.5 border-b border-line py-1.5 pr-2 pl-3">
      <div className="mt-0.5 shrink-0">
        <Logo kind={d.kind} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <RowText d={d} fixBitrate={fixBitrate} compact />
        <LiveLine
          d={d}
          canRetry={canRetry}
          retrying={busy === `retry:${d.id}`}
          onRetry={() => retry(d)}
        />
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
          onSynced={(next) => desk.prefs.set(next)}
        />
      )}
      <DockHeader
        id="golive"
        actions={
          <>
            <Button
              size="xs"
              variant="ghost"
              title="Test your upload and pick the bitrate for each platform, so the game and the stream both run smooth"
              onClick={() => setOptimizing(true)}
            >
              <Gauge size={15} weight="bold" aria-hidden /> Optimize
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label="Manage platforms"
              onClick={() => setManaging('main')}
            >
              <GearSix size={15} />
            </IconButton>
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
            {!onAir && <AllFailedBanner view={view} compact />}
            {live && mine.length > 0 && !view.destinations.some((d) => d.enabled) && (
              <p
                role="status"
                className="m-0 border-b border-line px-3 py-2 text-[13.5px] text-text-2"
              >
                <b className="text-text">Live, not sending to any platform.</b> The stream and the
                recording keep going: End stream is in the bar above.
              </p>
            )}
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
              <h3 className="m-0 flex items-center gap-1.5 border-b border-line px-3 pt-2 pb-1.5 text-[12px] font-bold text-text-2">
                <DeviceMobile size={14} weight="bold" aria-hidden />
                Vertical
                <span className="ml-auto font-semibold text-text-2">
                  {hasPicture ? 'On vertical picture' : 'Under picture'}
                </span>
              </h3>
              {tall.length > 0 && <ul className="flex flex-col">{tall.map(row)}</ul>}
              <button
                type="button"
                onClick={() => setManaging('vertical')}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-text-2 hover:text-text"
              >
                <Plus size={14} weight="bold" aria-hidden />
                Add a vertical destination
              </button>
            </section>
          </>
        )}
      </div>
      <Dialog
        compact
        open={managing !== null}
        onClose={() => setManaging(null)}
        size="lg"
        title={managing === 'vertical' ? 'Your vertical platforms' : 'Your platforms'}
      >
        {view && managing && <Platforms view={view} onSaved={res.reload} canvas={managing} />}
      </Dialog>
      {saver.dialog}
    </section>
  )
}

/**
 * While a destination is on air (or failed for this stream): how it is doing, on its own row
 * ("Live · 13.5 Mbps", "Reconnecting", or one calm failed line with the reason behind (i) and Retry).
 */
export function LiveLine({
  d,
  canRetry = false,
  retrying = false,
  onRetry,
}: {
  d: DestinationView
  canRetry?: boolean
  retrying?: boolean
  onRetry?: () => void
}) {
  const h = d.health
  if (!d.enabled || !h || h.state === 'waiting' || h.state === 'stopped') return null
  const t = healthText(h, d.blocked, d.kind)
  if (h.state === 'failed') {
    return (
      <div className="mt-0.5 flex flex-col items-start gap-1.5">
        <InfoLine detail={t.detail ?? undefined} label={`More about ${d.name}`} className="w-full">
          <span className="block text-[12px] font-semibold text-danger" aria-live="polite">
            {t.label}
          </span>
        </InfoLine>
        {canRetry && onRetry && (
          <Button
            size="xs"
            variant="outline"
            busy={retrying}
            onClick={onRetry}
            aria-label={`Retry ${d.name}`}
          >
            Retry
          </Button>
        )}
      </div>
    )
  }
  if (!d.blocked && h.state === 'reconnecting') {
    const rec = reconnectingText(h)
    return (
      <InfoLine
        detail={rec.detail ?? undefined}
        label={`More about ${d.name}`}
        className="mt-0.5 w-full"
      >
        <div className="flex flex-col text-[12px] leading-snug text-warn" aria-live="polite">
          <span className="font-semibold">{rec.heading}</span>
          {rec.reason && <span className="break-words">{rec.reason}</span>}
        </div>
      </InfoLine>
    )
  }
  if (d.blocked || h.state === 'paused') {
    return (
      <InfoLine
        detail={t.detail ?? undefined}
        label={`More about ${d.name}`}
        className="mt-0.5 w-full"
      >
        <span
          className={cx(
            'block text-[12px] leading-snug font-semibold',
            t.tone === 'bad' ? 'text-danger' : 'text-text-3',
          )}
          aria-live="polite"
        >
          {t.label}
        </span>
      </InfoLine>
    )
  }
  return (
    <span
      className={cx(
        'block truncate text-[12px] font-semibold',
        t.tone === 'ok' && 'text-ok',
        t.tone === 'warn' && 'text-warn',
        t.tone === 'bad' && 'text-danger',
        (t.tone === 'off' || t.tone === 'paused') && 'text-text-3',
      )}
      aria-live="polite"
    >
      {t.label}
      {t.detail ? ` · ${t.detail}` : ''}
    </span>
  )
}
