// Vertical (2.0, A2.3 and A2.4): Studio's second tab. Owner's pick 4B (24 Oct board): its own
// tab with where the upright picture comes from (OBS's vertical canvas, or cut from the normal
// stream with the 5A editor) and where it goes (YouTube Shorts live, servers of your own).
// API.md §4 "Vertical" and "Cut from the stream".

import { useEffect } from 'react'
import { ArrowCounterClockwise, CheckCircle, DeviceMobile, Info, Plug } from '@phosphor-icons/react'
import type { GoLiveView, VerticalObs, VerticalSource } from '@ferrocast/api'
import { Button, Skeleton, cx } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useResource } from '../../lib/hooks'
import { href } from '../../lib/router'
import { CutEditor } from './cut-editor'
import { ByHand, LiveCard, Platforms, useGoLive, useMerged } from './golive'

export function VerticalTab() {
  const api = useGoLive()
  const res = useResource(() => api.view(), [api])
  const view = useMerged(res.data)
  const live = !!view?.vertical_live
  const reload = res.reload
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
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {view.vertical_live && <LiveCard view={view} onSaved={res.reload} canvas="vertical" />}
        {view.cut.source === 'cut' && <CutEditor cut={view.cut} onSaved={res.reload} />}
        <Platforms view={view} onSaved={res.reload} canvas="vertical" />
      </div>
      <Source view={view} onVertical={setVertical} onSource={res.reload} />
    </div>
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
  const pick = (s: VerticalSource) =>
    s !== source &&
    void run(`source:${s}`, () => api.setVerticalSource(s), {
      success:
        s === 'cut'
          ? 'Ferrocast cuts the vertical picture from your stream.'
          : 'The vertical picture comes from OBS’s vertical canvas.',
    }).then((r) => r && onSource())
  return (
    <Panel title="Vertical stream" description="Camera on top, game below, for people on phones.">
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">Where the vertical picture comes from</legend>
        <Option
          title="Cut it from your stream"
          text="Works with any OBS: mark your camera and game once, Ferrocast stacks them upright."
          checked={source === 'cut'}
          busy={busy === 'source:cut'}
          onPick={() => pick('cut')}
        />
        <Option
          title="OBS’s vertical canvas"
          text="Best quality. OBS sends a second, upright stream (Aitum Vertical, or OBS 32’s second canvas)."
          checked={source === 'canvas'}
          busy={busy === 'source:canvas'}
          onPick={() => pick('canvas')}
          found={v ? 'Aitum Vertical found' : null}
        />
      </fieldset>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-[13.5px] text-text-2">
        {source === 'cut' ? (
          <p className="m-0">
            The layout is on the left. Your camera from the normal stream is made bigger, so a small
            camera looks softer; OBS’s vertical canvas looks sharper.
          </p>
        ) : !obs.connected ? (
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
            <p className="m-0">
              Aitum Vertical’s first stream output will go to Ferrocast instead, which sends it on
              to the places on the left. Its canvas and quality stay the same.
            </p>
            {v.streaming && (
              <p className="m-0 text-warn">
                Stop the vertical stream in OBS first; this changes between streams.
              </p>
            )}
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
              <span className="text-[12.5px] text-text-3">You can put it back any time.</span>
            </div>
          </>
        )}
        {view.vertical_live && (
          <p className="m-0 flex items-center gap-2 text-text-3">
            <DeviceMobile size={16} aria-hidden />
            {view.vertical_stats.width ?? '?'} × {view.vertical_stats.height ?? '?'}
            {view.vertical_stats.fps ? ` at ${view.vertical_stats.fps} fps` : ''} coming in from OBS
          </p>
        )}
        {source === 'canvas' && <ByHand vertical />}
      </div>
    </Panel>
  )
}

function Option({
  title,
  text,
  checked,
  busy,
  onPick,
  found,
}: {
  title: string
  text: string
  checked: boolean
  busy?: boolean
  onPick: () => void
  found?: string | null
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer flex-col gap-1 rounded-[12px] border p-3 has-[:focus-visible]:shadow-[var(--fc-focus)]',
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
      <span className="flex items-center gap-2 text-[14px] font-bold text-text">
        <span
          aria-hidden
          className={cx(
            'size-4 shrink-0 rounded-full border',
            checked ? 'border-[5px] border-arc' : 'border-line-strong',
          )}
        />
        {title}
      </span>
      <span className="pl-6 text-[12.5px] text-text-2">{text}</span>
      {found && (
        <span className="inline-flex items-center gap-1.5 pl-6 text-[12px] font-semibold text-ok">
          <CheckCircle size={13} weight="fill" aria-hidden />
          {found}
        </span>
      )}
    </label>
  )
}
