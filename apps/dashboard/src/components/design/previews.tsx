// Live previews for gallery tiles and the scene and widget designers: the real overlay
// renderer with believable sample state, so every tile shows what OBS will show.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  anySample,
  namedActor,
  renderSafeTemplate,
  type Design,
  type FerroEvent,
  type Goal,
  type Overlay,
  type OverlayState,
  type ResolvedLinks,
  type Widget,
} from '@ferrocast/api'
import { beginLabelsLoad, beginLinksLoad, useLive } from '../../lib/store'
import { OverlayPreview } from '../AlertStage'
import { SAMPLE_CREDITS, SAMPLE_HIGHLIGHT } from '../community/preview'

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

export const SAMPLE_LABELS: Record<string, string> = {
  latest_follower: 'NeelaMoth',
  latest_sub: 'rohanbuilds',
  latest_gifter: 'Devika (5)',
  latest_tip: 'Kavya_Plays ₹750',
  latest_bits: 'Ananya 1,200 bits',
  latest_raid: 'VikramGG (48)',
  top_tip_session: 'MeeraDraws ₹2,500',
  top_supporter_session: 'MeeraDraws (₹2,500, 2 subs)',
  session_follows: '41',
  session_subs: '7',
  session_bits: '4,850',
  session_tips: '₹3,250',
  session_raids: '2',
  monthly_follows: '312',
  monthly_subs: '58',
  monthly_bits: '24,500',
  monthly_tips: '₹18,400',
  monthly_raids: '9',
  top_tip_monthly: 'MeeraDraws ₹5,000',
  top_supporter_monthly: 'Devika (15 subs, ₹3,500)',
  alltime_follows: '2,840',
  alltime_subs: '419',
  alltime_bits: '148,200',
  alltime_tips: '₹92,150',
  alltime_raids: '64',
  top_tip_alltime: 'AriaLive ₹12,000',
  top_supporter_alltime: 'Devika (45 subs, ₹8,000)',
  hype_train: 'Lv.2 · 8 events · 01:45',
}

/** Resolves overlay label values using real `/api/v1/labels` data and per-key sample fallbacks. */
export function resolvePreviewLabelMap(
  widgets: readonly Widget[],
  realLabels?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const w of widgets) {
    if (w.kind !== 'label') continue
    const source = w.config.source
    const real = realLabels?.[source]?.trim()
    const val = real || SAMPLE_LABELS[source] || 'NeelaMoth'
    out[w.id] = renderSafeTemplate(
      w.config.template,
      source === 'hype_train'
        ? {
            value: val,
            name: val,
            level: '2',
            count: '8',
            events: '8',
            contributors: '5',
            timer: '01:45',
            latest: 'NeelaMoth',
          }
        : { value: val, name: val },
    )
  }
  return out
}

const fetchedForClient = new WeakSet<object>()

/** Shared cached loader for creator links and real labels across gallery and grid previews. */
export function useCreatorPreview(): {
  links: ResolvedLinks | null
  labels: Record<string, string> | null
} {
  const links = useLive((s) => s.links)
  const labels = useLive((s) => s.labels)
  const conn = useLive((s) => s.conn)
  useEffect(() => {
    if (!conn) return
    const client = conn.client
    const cur = useLive.getState()
    if (cur.links !== null && cur.labels !== null) return
    if (fetchedForClient.has(client)) return
    fetchedForClient.add(client)
    const lkGen = beginLinksLoad()
    const lbGen = beginLabelsLoad()
    let failed = false
    void Promise.all([
      client.links?.().catch(() => {
        failed = true
        return null
      }) ?? Promise.resolve(null),
      client.labels?.().catch(() => {
        failed = true
        return null
      }) ?? Promise.resolve(null),
    ]).then(([lk, lb]) => {
      if (failed) fetchedForClient.delete(client)
      if (useLive.getState().conn?.client !== client) return
      if (lk) useLive.getState().setLinks(lk.resolved, lkGen)
      if (lb) useLive.getState().setLabels(lb, lbGen)
    })
  }, [conn])
  return { links, labels }
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

/** Snapshot state that fills every widget in `widgets`, preferring real creator links and labels. */
export function useSampleState(
  widgets: Widget[],
  overrides?: { links?: ResolvedLinks | null; labels?: Record<string, string> | null },
): OverlayState {
  const creator = useCreatorPreview()
  const realLabels = overrides?.labels !== undefined ? overrides.labels : creator.labels
  const realLinks = overrides?.links !== undefined ? overrides.links : creator.links
  const labelKey = JSON.stringify(
    widgets.flatMap((w) =>
      w.kind === 'label' ? [[w.id, w.config.source, w.config.template]] : [],
    ),
  )
  const events = useMemo(() => sampleEvents(), [])
  const chat = useMemo(() => sampleChat(), [])
  return useMemo(() => {
    const labelWidgets = (JSON.parse(labelKey) as [string, string, string][]).map(
      ([id, source, template]) =>
        ({ id, kind: 'label', x: 0, y: 0, w: 1, h: 1, config: { source, template } }) as Widget,
    )
    return {
      goals: [GOAL],
      labels: resolvePreviewLabelMap(labelWidgets, realLabels),
      viewers: { twitch: 412, youtube: 188 },
      events,
      chat,
      credits: SAMPLE_CREDITS,
      chat_highlight: SAMPLE_HIGHLIGHT,
      links: realLinks ?? null,
    }
  }, [labelKey, realLabels, realLinks, events, chat])
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

/** A saved overlay drawn whole with sample state (the Overlays page's cards). */
export function SavedOverlayPreview({
  overlay,
  className,
}: {
  overlay: Overlay
  className?: string
}) {
  const [box, near] = useNear<HTMLDivElement>(true)
  const state = useSampleState(overlay.widgets)
  return (
    <div ref={box} className={className ?? 'relative aspect-video w-full'}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#2a3550,#0d1016_70%)]"
      />
      {near && <OverlayPreview overlay={overlay} state={state} className="absolute inset-0" />}
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
