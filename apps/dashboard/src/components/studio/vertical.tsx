// Vertical (2.0, A2.3 and A2.4): Studio's second tab. Owner's pick 4B (24 Oct board): its own
// tab with where the upright picture comes from (a vertical canvas: the Studio's own, V2 of
// 28 Oct, or OBS's; or cut from the normal stream with the 5A editor) and where it goes
// (YouTube Shorts live, servers of your own). API.md §4 "Vertical" and "Cut from the stream".

import { useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, CheckCircle, DeviceMobile, Info, Plug } from '@phosphor-icons/react'
import {
  studioEngineApi,
  type GoLiveView,
  type VerticalObs,
  type VerticalSource,
} from '@ferrocast/api'
import { Button, InfoTip, Skeleton, cx } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { href } from '../../lib/router'
import { CutEditor, CutPreview, type CutShown } from './cut-editor'
import { useUsesObs } from '../../lib/picture'
import { ByHand, LiveCard, Platforms, useGoLive, useMerged } from './golive'

export function VerticalTab() {
  const api = useGoLive()
  const res = useResource(() => api.view(), [api])
  const view = useMerged(res.data)
  const live = !!view?.vertical_live
  const reload = res.reload
  // The layout being edited, shown in the phone (cutting only).
  const [shown, setShown] = useState<CutShown | null>(null)
  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 15_000)
    return () => clearInterval(t)
  }, [live, reload])
  if (res.error && !view) return <LoadError error={res.error} onRetry={res.reload} />
  if (!view)
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  const setVertical = (vertical: VerticalObs | null) =>
    res.set((v) => {
      const base = v ?? view
      return { ...base, obs: { ...base.obs, vertical } }
    })
  // Owner's pick T1: what phones see on the left, where it comes from and where it goes on
  // the right; cutting's layout editor below when that's the source.
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
        <Phone view={view} cut={view.cut.source === 'cut' ? shown : null} />
        <div className="flex min-w-0 flex-col gap-5">
          {view.vertical_live && <LiveCard view={view} onSaved={res.reload} canvas="vertical" />}
          <Source view={view} onVertical={setVertical} onSource={res.reload} />
          {view.cut.source === 'cut' && (
            <CutEditor cut={view.cut} onSaved={res.reload} onShown={setShown} />
          )}
          {/* This tab is for OBS streamers (the Studio has its vertical platforms in Go live), so
              where it goes is here. */}
          <Platforms view={view} onSaved={res.reload} canvas="vertical" />
        </div>
      </div>
    </div>
  )
}

/** What phones see, in a phone: the Studio's vertical picture (a fresh still every two
 * seconds), or the stream coming in from OBS's canvas; otherwise what to do. */
function Phone({ view, cut }: { view: GoLiveView; cut: CutShown | null }) {
  const client = useClient()
  const engine = useMemo(() => studioEngineApi(client), [client])
  const usesObs = useUsesObs()
  const studioCanvas = !usesObs && view.cut.source === 'canvas'
  const [image, setImage] = useState<string | null>(null)
  const [none, setNone] = useState(false)
  useEffect(() => {
    if (!studioCanvas) return
    let alive = true
    const take = async () => {
      try {
        const s = await engine.scenes()
        const scene = s.vertical?.current
        if (!scene) {
          if (alive) setNone(true)
          return
        }
        const { image: img } = await engine.thumbnail(scene, 360)
        if (alive) {
          setNone(false)
          setImage(img)
        }
      } catch {
        if (alive) setNone(true)
      }
    }
    void take()
    const t = setInterval(() => document.visibilityState === 'visible' && void take(), 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [engine, studioCanvas])
  const live = view.vertical_live
  const note = studioCanvas
    ? none
      ? 'No vertical picture yet'
      : null
    : view.cut.source === 'cut'
      ? cut
        ? null
        : 'Loading the picture…'
      : live
        ? null
        : 'Nothing coming in from OBS yet'
  return (
    <figure className="m-0 flex flex-col items-center gap-2.5 justify-self-center md:sticky md:top-4">
      <div className="rounded-[30px] border border-line-strong bg-black p-2 shadow-2">
        <div className="relative grid aspect-[9/16] h-[420px] place-items-center overflow-hidden rounded-[22px] bg-[#0a0b0d]">
          {cut && <CutPreview cut={cut.cut} image={cut.image} ratio={cut.ratio} width={236} bare />}
          {studioCanvas && image && !none && (
            <img
              src={image}
              alt="The vertical picture now"
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {note && <span className="px-6 text-center text-[13.5px] text-[#9aa1ac]">{note}</span>}
          {live && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-danger-fill px-2 py-0.5 text-[12px] font-extrabold text-white">
              <span aria-hidden className="size-1.5 rounded-full bg-white" />
              LIVE
            </span>
          )}
        </div>
      </div>
      <figcaption className="text-[13.5px] font-semibold text-text-3">What phones see</figcaption>
    </figure>
  )
}

/** Where the upright picture comes from, and pointing Aitum Vertical here. */
function Source({
  view,
  onVertical,
  onSource,
}: {
  view: GoLiveView
  onVertical: (v: VerticalObs | null) => void
  onSource: () => void
}) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const { obs } = view
  const v = obs.vertical
  const before = v?.before && /(^|\.)youtube\.com$/.test(v.before) ? 'YouTube' : v?.before
  const point = () =>
    void run('point', () => api.pointVertical(), {
      success: 'Aitum Vertical now streams to Ferrocast.',
    }).then((r) => r !== undefined && onVertical(r))
  const restore = () =>
    void run('restore', () => api.restoreVertical(), {
      success: `Aitum Vertical streams to ${before ?? 'its old setting'} again.`,
    }).then((r) => r !== undefined && onVertical(r))
  const source = view.cut.source
  // A vertical canvas is the Studio's own vertical picture, or OBS's for those who stream
  // from OBS.
  const usesObs = useUsesObs()
  const pick = (s: VerticalSource) =>
    s !== source &&
    void run(`source:${s}`, () => api.setVerticalSource(s), {
      success:
        s === 'cut'
          ? 'Ferrocast cuts the vertical picture from your stream.'
          : usesObs
            ? 'The vertical picture comes from OBS’s vertical canvas.'
            : 'The vertical picture comes from the Studio’s vertical scenes.',
    }).then((r) => r && onSource())
  return (
    <Panel title="Picture" description="Where the vertical picture comes from.">
      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Where the vertical picture comes from</legend>
        <Option
          title="Cut it from your stream"
          text={usesObs ? 'Any OBS' : 'Quick: no scenes to make'}
          info="Mark your camera and game once; Ferrocast stacks them upright. A small camera looks softer when made big."
          checked={source === 'cut'}
          busy={busy === 'source:cut'}
          onPick={() => pick('cut')}
        />
        {usesObs && (
          <Option
            title="OBS’s vertical canvas"
            text="Best quality"
            info="OBS sends a second, upright stream (Aitum Vertical, or OBS 32’s second canvas)."
            checked={source === 'canvas'}
            busy={busy === 'source:canvas'}
            onPick={() => pick('canvas')}
            found={v ? 'Aitum Vertical found' : null}
          />
        )}
      </fieldset>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-[14.5px] text-text-2 empty:hidden">
        {source === 'cut' || !usesObs ? null : !obs.connected ? (
          <p className="m-0">
            Open OBS on this computer first.{' '}
            <a
              className="font-semibold text-accent-text hover:underline"
              href={href({ name: 'settings', section: 'obs' })}
            >
              OBS settings
            </a>
          </p>
        ) : !v ? (
          <p className="m-0 flex gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
            <span>
              OBS doesn’t have Aitum Vertical. Install it from aitum.tv and reopen this tab, or send
              any vertical stream here by hand.
            </span>
          </p>
        ) : v.points_here ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
            <CheckCircle size={18} weight="fill" className="text-ok" aria-hidden />
            <span className="font-semibold text-text">Aitum Vertical sends to Ferrocast</span>
            {v.before && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                icon={<ArrowCounterClockwise size={15} />}
                busy={busy === 'restore'}
                disabled={v.streaming}
                onClick={restore}
              >
                Put it back to {before}
              </Button>
            )}
          </div>
        ) : (
          <>
            {v.streaming && <p className="m-0 text-warn">Stop the vertical stream in OBS first.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={<Plug size={16} />}
                busy={busy === 'point'}
                disabled={v.streaming}
                onClick={point}
              >
                Point Aitum Vertical at Ferrocast
              </Button>
              <InfoTip>
                Aitum Vertical’s first stream output goes to Ferrocast, which sends it on. Its
                canvas and quality stay the same, and you can put it back any time.
              </InfoTip>
            </div>
          </>
        )}
        {view.vertical_live && (
          <p className="m-0 flex items-center gap-2 text-text-3">
            <DeviceMobile size={16} aria-hidden />
            {view.vertical_stats.width ?? '?'} × {view.vertical_stats.height ?? '?'}
            {view.vertical_stats.fps ? ` at ${view.vertical_stats.fps} fps` : ''} coming in
          </p>
        )}
        {source === 'canvas' && usesObs && <ByHand vertical />}
      </div>
    </Panel>
  )
}

function Option({
  title,
  text,
  info,
  checked,
  busy,
  onPick,
  found,
}: {
  title: string
  text: string
  info: string
  checked: boolean
  busy?: boolean
  onPick: () => void
  found?: string | null
}) {
  return (
    <div className="relative">
      <label
        className={cx(
          'flex cursor-pointer flex-col gap-1 rounded-[12px] border p-3 pr-10 has-[:focus-visible]:shadow-[var(--fc-focus)]',
          checked
            ? 'border-arc shadow-[inset_0_0_0_1px_var(--fc-arc)]'
            : 'border-line hover:border-line-strong',
          busy && 'opacity-80',
        )}
      >
        <input
          type="radio"
          name="vertical-source"
          className="sr-only"
          checked={checked}
          disabled={busy}
          onChange={onPick}
        />
        <span className="flex items-center gap-2 text-[15px] font-bold text-text">
          <span
            aria-hidden
            className={cx(
              'size-4 shrink-0 rounded-full border',
              checked ? 'border-[5px] border-arc' : 'border-line-strong',
            )}
          />
          {title}
        </span>
        <span className="pl-6 text-[13.5px] text-text-2">{text}</span>
        {found && (
          <span className="inline-flex items-center gap-1.5 pl-6 text-[13px] font-semibold text-ok">
            <CheckCircle size={13} weight="fill" aria-hidden />
            {found}
          </span>
        )}
      </label>
      {/* Outside the label, so the option's name stays just its title. */}
      <span className="absolute top-2.5 right-2.5">
        <InfoTip>{info}</InfoTip>
      </span>
    </div>
  )
}
