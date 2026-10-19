// Live previews for gallery tiles and the scene and widget designers: the real overlay
// renderer with believable sample state, so every tile shows what OBS will show.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  anySample,
  namedActor,
  type Design,
  type FerroEvent,
  type Goal,
  type Overlay,
  type OverlayState,
  type Widget,
} from '@ferrocast/api'
import { OverlayPreview } from '../AlertStage'

const GOAL: Goal = {
  id: 'sample-goal',
  title: 'New mic',
  kind: 'subs',
  target: 50,
  currency: null,
  starts_at: 0,
  ends_at: null,
  current: 32,
}

const LABEL_TEXT: Record<string, string> = {
  latest_follower: 'NeelaMoth',
  latest_sub: 'rohanbuilds',
  latest_tip: '₹750 from Kavya_Plays',
  top_tip_session: '₹2,500 from MeeraDraws',
  session_follows: '41',
  session_subs: '7',
}

function sampleEvents(): FerroEvent[] {
  const out: FerroEvent[] = []
  for (const [i, k] of (
    ['follow', 'tip', 'subscription', 'raid', 'gift_batch'] as const
  ).entries()) {
    const e = anySample(k, Date.now() - i * 60_000)
    if (e) out.push({ ...e, id: `sample-${k}`, origin: 'live' })
  }
  return out
}

function sampleChat(): FerroEvent[] {
  const lines: [string, string][] = [
    ['Tarun.exe', 'that clutch was unreal'],
    ['pixel_paratha', 'hi from Pune!'],
    ['ishq_fps', 'what keyboard is that?'],
    ['NeelaMoth', 'GG'],
    ['MeeraDraws', 'lurking with chai'],
  ]
  return lines.map(([name, text], i) => ({
    id: `chat-${i}`,
    seq: i,
    platform: 'twitch',
    channel: null,
    source_id: `c${i}`,
    occurred_at: 0,
    received_at: 0,
    origin: 'live',
    kind: {
      type: 'chat_message',
      actor: { ...namedActor('twitch', name), id: `c${i}` },
      content: { text, fragments: [{ type: 'text', text }] },
      reply_to: null,
      is_action: false,
    },
  }))
}

/** Snapshot state that fills every widget in `widgets` (labels by their source, a goal, events, chat). */
export function useSampleState(widgets: Widget[]): OverlayState {
  const labelKey = JSON.stringify(
    widgets.flatMap((w) =>
      w.kind === 'label' ? [[w.id, w.config.source, w.config.template]] : [],
    ),
  )
  return useMemo(() => {
    const labels = Object.fromEntries(
      (JSON.parse(labelKey) as [string, string, string][]).map(([id, source, tpl]) => [
        id,
        tpl.replace(/\{(value|name)\}/g, LABEL_TEXT[source] ?? 'NeelaMoth'),
      ]),
    )
    return {
      goals: [GOAL],
      labels,
      viewers: { twitch: 412, youtube: 188 },
      events: sampleEvents(),
      chat: sampleChat(),
    }
  }, [labelKey])
}

/**
 * True once the element has come within `margin` of the viewport, and stays true. Gallery
 * grids hold dozens of full scenes; drawing only the ones near the screen keeps the first
 * paint cheap in software-rendered webviews (WebKitGTK on Linux), where painting all of
 * them at once stalled the page for tens of seconds.
 */
function useNear<T extends Element>(enabled: boolean, margin = '400px') {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(!enabled)
  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near, margin])
  return [ref, near] as const
}

/** One scene of a theme (or a scene design), drawn whole. */
export function ScenePreview({
  design,
  sceneKey,
  className,
  live = false,
  lazy = false,
}: {
  design: Design
  sceneKey?: string
  className?: string
  live?: boolean
  /** Draw the scene only once it is near the screen (gallery grids). */
  lazy?: boolean
}) {
  const [box, near] = useNear<HTMLDivElement>(lazy)
  const scene =
    design.kind === 'theme'
      ? (design.content.scenes.find((s) => s.key === sceneKey) ??
        design.content.scenes.find((s) => s.key === 'starting_soon') ??
        design.content.scenes[0])
      : design.kind === 'scene'
        ? design.content
        : null
  const widgets = scene?.layers ?? []
  const state = useSampleState(widgets)
  if (!scene) return null
  const overlay: Overlay = {
    id: `preview-${design.id}`,
    name: scene.name,
    url: '',
    width: scene.width,
    height: scene.height,
    widgets,
    updated_at: 0,
    design: null,
  }
  return (
    <div ref={box} className={className ?? 'relative aspect-video w-full'}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#2a3550,#0d1016_70%)]"
      />
      {near && (
        <OverlayPreview overlay={overlay} state={state} live={live} className="absolute inset-0" />
      )}
    </div>
  )
}

/** A widget design's widget on its own, with sample state. */
export function WidgetPreview({
  design,
  className,
  styleOverride,
  lazy = false,
}: {
  design: Design
  className?: string
  styleOverride?: Record<string, unknown>
  /** Draw the widget only once it is near the screen (gallery grids). */
  lazy?: boolean
}) {
  const [box, near] = useNear<HTMLDivElement>(lazy)
  const w = design.kind === 'widget' ? design.content : null
  const widget = w
    ? ({
        id: 'preview',
        kind: w.widget,
        x: 40,
        y: 40,
        w: w.w,
        h: w.h,
        config: {
          ...w.config,
          ...(w.widget === 'goal' ? { goal_id: GOAL.id } : {}),
          style: styleOverride ?? w.style,
          design_id: design.id,
          branded: design.branded,
        },
      } as Widget)
    : null
  const widgets = widget ? [widget] : []
  const state = useSampleState(widgets)
  if (!w || !widget) return null
  const width = Math.max(320, w.w + 80)
  const height = Math.max(180, w.h + 80)
  const overlay: Overlay = {
    id: `preview-${design.id}`,
    name: design.name,
    url: '',
    width,
    height,
    widgets,
    updated_at: 0,
    design: null,
  }
  return (
    <div ref={box} className={className ?? 'relative aspect-video w-full'}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,#3a2a20,#0d1016_70%)]"
      />
      {near && <OverlayPreview overlay={overlay} state={state} live className="absolute inset-0" />}
    </div>
  )
}
