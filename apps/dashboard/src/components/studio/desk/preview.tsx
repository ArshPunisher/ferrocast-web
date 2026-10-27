// The stage: the live picture (a native view the app draws over this box, letterboxed like
// OBS's preview) and, under it, the scene on air and how scenes change.

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  ArrowUUpLeft,
  ArrowFatRight,
  ArrowUUpRight,
  ArrowsLeftRight,
  BoundingBox,
  ClockCounterClockwise,
  Columns,
  DotsThree,
  MoonStars,
  GearSix,
  Plus,
  Trash,
  Play,
  ProjectorScreen,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import {
  type EngineItem,
  type EngineSettings,
  type EngineStudioOptions,
  type EngineTransition,
  type PreviewRect,
} from '@ferrocast/api'
import { Button, Dialog, IconButton, InfoTip, Input, Select, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { done, useAction, useResource } from '../../../lib/hooks'
import { useDesk, useEngine } from './common'
import { projectorItem, useContextMenu, type MenuItem } from './menu'
import { OptionsForm } from './options'
import {
  MOVE,
  at,
  boxOf,
  cursorFor,
  drag,
  cropDrag,
  fit,
  gripAt,
  inside,
  pick,
  type Box,
  type Crop,
  type Frame,
  type Grip,
  type Pt,
} from './stage-edit'

/** The app's view is this much bigger than the box on every side (points): room for the
 * outline and handles of a source at the canvas's edge, as OBS's preview has. */
const EDGE = 10

/** How far the preview can zoom out: all of the canvas, then smaller to see what's off it. */
export const ZOOMS = [1, 0.75, 0.5] as const

/** The preview's zoom and whether every source shows its outline, kept for this viewer. */
interface PreviewView {
  zoom: number
  frames: boolean
}
const VIEW_KEY = 'fc-preview-view'
const viewSubs = new Set<() => void>()
let view: PreviewView = readView()

function readView(): PreviewView {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as Partial<PreviewView> | null
    if (v && ZOOMS.some((z) => z === v.zoom) && typeof v.frames === 'boolean')
      return { zoom: v.zoom as number, frames: v.frames }
  } catch {
    // Storage off (a private window): the defaults.
  }
  return { zoom: 1, frames: true }
}

export function usePreviewView(): [PreviewView, (next: Partial<PreviewView>) => void] {
  const v = useSyncExternalStore(
    (cb) => {
      viewSubs.add(cb)
      return () => viewSubs.delete(cb)
    },
    () => view,
  )
  const set = (next: Partial<PreviewView>) => {
    view = { ...view, ...next }
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view))
    } catch {
      // Not kept; still applies now.
    }
    for (const cb of viewSubs) cb()
  }
  return [v, set]
}

/** An element's background as 0xRRGGBB (what the app paints round the canvas). */
function bgOf(el: Element | null): number | undefined {
  if (!el) return undefined
  const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return undefined
  const [r, g, b] = m.map(Number)
  return ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0)
}

type Hole = { x: number; y: number; w: number; h: number }

/** What can lie over the preview: menus, lists and panels (dialogs mark theirs). */
const OVER = '[role="menu"], [role="listbox"], [data-over-preview]'

/** The most holes the app takes; more than that and the picture hides instead. */
const MAX_HOLES = 16

/**
 * What lies over the box: the app's view can't be drawn under the page, so it leaves its
 * picture out where menus and panels are (`holes`, from the box's top left) and they show
 * there. Null: hide it all (a panel being dragged, or too much over it).
 */
export function overPreview(box: DOMRect, edge = EDGE): Hole[] | null {
  const r = new DOMRect(box.x - edge, box.y - edge, box.width + 2 * edge, box.height + 2 * edge)
  if (document.body.dataset.dockDrag) return null
  const holes: Hole[] = []
  for (const el of document.querySelectorAll(OVER)) {
    // A modal dialog's own box is the whole window; its panel says it's over the preview.
    if (el instanceof HTMLDialogElement) continue
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom)
      holes.push({ x: b.left - box.x, y: b.top - box.y, w: b.width, h: b.height })
  }
  return holes.length > MAX_HOLES ? null : holes
}

/** Where the live picture goes: the app draws it exactly on this box (its view reaches EDGE past it for handles). In Studio
 * Mode there are two: the preview being edited, and what's on air, with the ways to switch
 * between them in the middle. */
export function PreviewBox({ running }: { running: boolean }) {
  const api = useEngine()
  const { scenes } = useDesk()
  const studio = !!scenes.data?.preview
  const ref = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const programRef = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
  const [pv] = usePreviewView()
  useEffect(() => {
    const el = ref.current
    if (!running || !desktop || !el) return
    let raf = 0
    let last = ''
    const place = (box: HTMLElement | null): PreviewRect | null => {
      if (!box) return null
      const r = box.getBoundingClientRect()
      // Hidden while partly under the top bar, off the window or under a menu or panel.
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      const inView =
        r.top - EDGE >= bar && r.bottom + EDGE <= window.innerHeight && r.width > 1 && r.height > 1
      const bg = bgOf(box.closest('[data-stage-bg]'))
      const holes = inView ? overPreview(r) : null
      return holes
        ? {
            x: r.left,
            y: r.top,
            w: r.width,
            h: r.height,
            vh: window.innerHeight,
            ...(bg === undefined ? {} : { bg }),
            ...(holes.length ? { holes } : {}),
          }
        : null
    }
    // Without Studio Mode the app's view covers the whole stage and draws the canvas where its
    // box is, so the outlines of what's off the canvas show round it (zoomed out, more of it).
    const placeStage = (stage: HTMLElement | null, box: HTMLElement): PreviewRect | null => {
      if (!stage) return null
      const s = stage.getBoundingClientRect()
      const c = box.getBoundingClientRect()
      const bg = bgOf(stage)
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      const inView = s.top >= bar && s.bottom <= window.innerHeight && c.width > 1 && c.height > 1
      const holes = inView ? overPreview(s, 0) : null
      return holes
        ? {
            x: s.left,
            y: s.top,
            w: s.width,
            h: s.height,
            vh: window.innerHeight,
            canvas: { x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height },
            ...(bg === undefined ? {} : { bg }),
            ...(holes.length ? { holes } : {}),
          }
        : null
    }
    let again = 0
    let alive = true
    const send = () => {
      raf = 0
      if (!alive) return
      const rect = studio ? place(el) : placeStage(stageRef.current, el)
      const program = studio ? place(programRef.current) : null
      // While a menu or panel is open, look again shortly: one sliding in or away changes no
      // attribute the observers below see.
      window.clearTimeout(again)
      if (document.querySelector(OVER)) again = window.setTimeout(schedule, 120)
      // The window's height is part of it: the native side places the view from the bottom.
      const key = JSON.stringify([rect, program, window.innerHeight])
      if (key === last) return
      last = key
      void api.preview(rect, program).catch(() => {
        // Not placed: try again shortly, and on the next change.
        if (!alive) return
        if (last === key) last = ''
        window.clearTimeout(again)
        again = window.setTimeout(schedule, 500)
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    if (stageRef.current) ro.observe(stageRef.current)
    if (programRef.current) ro.observe(programRef.current)
    const mo = new MutationObserver(schedule)
    // Dialogs open by an attribute; floating panels say where they are in data-pos.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'data-dock-drag', 'data-pos'],
    })
    // A theme change repaints the stage round the canvas.
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(again)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      void api.preview(null, null).catch(() => undefined)
    }
  }, [api, running, desktop, studio])
  const editing = useStageEdit(ref, running && desktop)
  const screen =
    'grid aspect-video touch-none place-items-center rounded-[10px] bg-[#0a0b0d] p-4 text-center text-[14px] text-[#9aa1ac] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent'
  if (!studio)
    // The canvas is an exact 16:9 box fitted inside the stage (smaller when zoomed out), with
    // room around it for what's off the canvas. The whole stage takes clicks: a handle can be
    // grabbed outside the canvas.
    return (
      <div
        ref={stageRef}
        aria-label="Studio preview. Click a source to pick it, drag to move it, drag a handle to resize it, arrow keys nudge it."
        data-stage-bg
        className="grid min-h-0 flex-1 touch-none place-items-center bg-[var(--fc-stage)] p-3 outline-none select-none [container-type:size] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        {...editing}
      >
        <div
          ref={ref}
          style={{ '--fc-zoom': pv.zoom } as CSSProperties}
          className={cx(screen, 'w-[calc(min(100cqw,100cqh*16/9)*var(--fc-zoom))]')}
        >
          {!desktop && 'The live picture shows in the Ferrocast app.'}
        </div>
      </div>
    )
  // Studio Mode: two 16:9 boxes side by side with the switch between them.
  const half = 'w-[min(calc((100cqw-150px)/2),calc((100cqh-36px)*16/9))]'
  return (
    <div
      data-stage-bg
      className="flex min-h-0 flex-1 items-center justify-center gap-3 bg-[var(--fc-stage)] p-3 [container-type:size]"
    >
      <figure className="m-0 flex flex-col gap-3">
        <figcaption className="flex items-center gap-1.5 text-[13px] font-bold text-text-2">
          <span aria-hidden className="size-[7px] rounded-full bg-accent-text" />
          Preview: {scenes.data?.preview}
        </figcaption>
        <div
          ref={ref}
          aria-label="Studio Mode preview: edit here, then send it on air. Click a source to pick it, drag to move it, drag a handle to resize it."
          className={cx(screen, half)}
          {...editing}
        >
          {!desktop && 'The live picture shows in the Ferrocast app.'}
        </div>
      </figure>
      <SwitchColumn />
      <figure className="m-0 flex flex-col gap-3">
        <figcaption className="flex items-center gap-1.5 text-[13px] font-bold text-danger">
          <span aria-hidden className="size-[7px] rounded-full bg-danger-fill" />
          On air: {scenes.data?.current}
        </figcaption>
        <div ref={programRef} aria-label="What's on air" className={cx(screen, half)} />
      </figure>
    </div>
  )
}

/** OBS's Studio Mode defaults. */
const STUDIO_DEFAULTS: EngineStudioOptions = {
  swap: true,
  duplicate_scene: true,
  duplicate_sources: false,
  double_click: false,
}

/** Studio Mode's middle: Transition (the scene's own way in, or the Studio's), the T-bar,
 * swap, fade to black, and OBS's quick transitions, each one click. Right-click a quick one to
 * remove it; + adds one. */
function SwitchColumn() {
  const { api, scenes, refresh } = useDesk()
  const { run, busy } = useAction()
  const { open, menu } = useContextMenu()
  const quick = scenes.data?.quick ?? []
  const options = scenes.data?.studio_options ?? STUDIO_DEFAULTS
  const black = !!scenes.data?.black
  const label = (t: EngineTransition) =>
    t.kind === 'cut_transition' || t.kind === 'obs_stinger_transition'
      ? (TRANSITIONS[t.kind] ?? t.kind)
      : `${TRANSITIONS[t.kind] ?? t.kind} ${(t.ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}s`
  const go = (q?: EngineTransition) =>
    void run('go', () => done(api.transitionNow(q))).then((ok) => ok && refresh())
  const save = (list: EngineTransition[]) =>
    void run('quick', () => done(api.setQuickTransitions(list))).then((ok) => ok && refresh())
  const setOptions = (o: Partial<EngineStudioOptions>) =>
    void run('options', () => done(api.setStudioOptions({ ...options, ...o }))).then(
      (ok) => ok && refresh(),
    )
  const adding = (e: React.MouseEvent) =>
    open(
      e,
      'Add a quick transition',
      Object.entries(TRANSITIONS).flatMap(([kind, name]) =>
        kind === 'cut_transition' || kind === 'obs_stinger_transition'
          ? [{ label: name, onSelect: () => save([...quick, { kind, ms: 0 }]) }]
          : [300, 500, 1000].map((ms) => ({
              label: `${name} ${ms / 1000}s`,
              onSelect: () => save([...quick, { kind, ms }]),
            })),
      ),
    )
  const optionsMenu = (e: React.MouseEvent) =>
    open(e, 'Studio Mode options', [
      {
        label: 'Swap after a transition',
        checked: options.swap,
        onSelect: () => setOptions({ swap: !options.swap }),
      },
      {
        label: 'Copy the scene on air',
        checked: options.duplicate_scene,
        onSelect: () => setOptions({ duplicate_scene: !options.duplicate_scene }),
      },
      {
        label: 'Copy its sources too',
        checked: options.duplicate_scene && options.duplicate_sources,
        disabled: !options.duplicate_scene,
        onSelect: () => setOptions({ duplicate_sources: !options.duplicate_sources }),
      },
      { sep: true },
      {
        label: 'Double-click a scene to send it on air',
        checked: options.double_click,
        onSelect: () => setOptions({ double_click: !options.double_click }),
      },
    ])
  // Centred when it fits; scrolls inside the stage when the stage is short.
  return (
    <div className="flex w-[130px] flex-none flex-col self-stretch overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]">
      <div className="my-auto flex flex-col items-stretch gap-1.5 px-0.5 py-1">
        <Button variant="primary" busy={busy === 'go'} onClick={() => go()}>
          <ArrowFatRight size={16} weight="fill" /> Transition
        </Button>
        <TBar />
        <div className="flex flex-wrap items-center justify-center gap-0.5">
          <IconButton
            size="sm"
            label="Swap the preview and what's on air"
            onClick={() =>
              void run('swap', () => done(api.swapScenes())).then((ok) => ok && refresh())
            }
          >
            <ArrowsLeftRight size={15} weight="bold" />
          </IconButton>
          <IconButton
            size="sm"
            label={black ? 'Fade back from black' : 'Fade to black'}
            aria-pressed={black}
            className={cx(black && 'bg-danger-fill text-white hover:bg-danger-fill')}
            onClick={() =>
              void run('black', () => done(api.fadeToBlack())).then((ok) => ok && refresh())
            }
          >
            <MoonStars size={15} weight={black ? 'fill' : 'bold'} />
          </IconButton>
          <IconButton size="sm" label="Studio Mode options" onClick={optionsMenu}>
            <DotsThree size={16} weight="bold" />
          </IconButton>
        </div>
        <span className="mt-1 text-center text-[12px] font-bold tracking-wide text-text-3 uppercase">
          Quick
        </span>
        {quick.map((q, i) => (
          <Button
            key={`${q.kind}-${q.ms}-${i}`}
            variant="secondary"
            size="sm"
            title="Right-click to remove"
            onClick={() => go(q)}
            onContextMenu={(e) =>
              open(e, label(q), [
                {
                  label: 'Remove',
                  icon: Trash,
                  danger: true,
                  onSelect: () => save(quick.filter((_, j) => j !== i)),
                },
              ])
            }
          >
            {label(q)}
          </Button>
        ))}
        {quick.length < 10 && (
          <IconButton
            size="sm"
            label="Add a quick transition"
            className="self-center"
            onClick={adding}
          >
            <Plus size={15} weight="bold" />
          </IconButton>
        )}
      </div>
      {menu}
    </div>
  )
}

/** The history list: steps to redo (furthest first), then steps to undo (newest first). Each
 * picks how many steps to take to get there. */
export function historyMenu(
  list: { undo: string[]; redo: string[] },
  steps: (redo: boolean, n: number) => void,
): MenuItem[] {
  return [
    ...list.redo
      .slice()
      .reverse()
      .map((label, i, all) => ({
        label: `Redo: ${label}`,
        onSelect: () => steps(true, all.length - i),
      })),
    ...(list.redo.length ? [{ sep: true as const }] : []),
    ...(list.undo.length
      ? list.undo.map((label, i) => ({
          label,
          hint: i === 0 ? '⌘Z' : undefined,
          onSelect: () => steps(false, i + 1),
        }))
      : [{ label: 'Nothing to undo yet', disabled: true }]),
  ]
}

/** Where the T-bar goes when let go at `v`, as in OBS: near the end it finishes, near the start
 * it goes back, anywhere else it holds both scenes. */
export function tbarEnd(v: number): 'finish' | 'back' | 'hold' {
  return v >= 0.9 ? 'finish' : v <= 0.1 ? 'back' : 'hold'
}

/**
 * OBS's T-bar: drag the grip to mix from what's on air to the preview by hand. Only the grip
 * drags (a click on the track does nothing, as OBS fixed); let go near the end to finish, near
 * the start to go back, anywhere else to hold both. Arrow keys move it in tenths.
 */
function TBar() {
  const { api, scenes, refresh } = useDesk()
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<number | null>(null)
  const held = scenes.data?.tbar?.active ? (scenes.data.tbar.at ?? 0) : 0
  const shown = at ?? held
  // Not being dragged: the engine's place wins (a refused move, a transition, another screen).
  const dragging = useRef(false)
  useEffect(() => {
    if (!dragging.current) setAt(null)
  }, [held, scenes.data?.tbar?.active])
  // One request at a time; the newest place waits for the one before.
  const sending = useRef(false)
  const next = useRef<{ at: number; release: boolean } | null>(null)
  const send = (v: number, release: boolean) => {
    next.current = { at: v, release }
    if (sending.current) return
    const pump = async () => {
      sending.current = true
      while (next.current) {
        const n = next.current
        next.current = null
        try {
          await api.tbar(n.at, n.release)
        } catch {
          // A refused move (Studio Mode off, a transition running) leaves the bar where it is.
        }
        if (n.release) refresh()
      }
      sending.current = false
    }
    void pump()
  }
  const valueAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }
  const release = (v: number) => {
    send(v, true)
    // Near either end it snaps home, as in OBS.
    setAt(tbarEnd(v) === 'hold' ? v : null)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 0.1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -0.1
          : 0
    if (!step) return
    e.preventDefault()
    const v = Math.min(1, Math.max(0, Math.round((shown + step) * 10) / 10))
    setAt(v)
    // Keys step through the middle; only the very ends let go (finish, or back).
    if (v >= 1 || v <= 0) release(v)
    else send(v, false)
  }
  return (
    <div ref={track} className="relative mx-1 my-2 h-1.5 rounded-full bg-surface-3 select-none">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-accent/60"
        style={{ width: `${shown * 100}%` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="T-bar: drag to mix from on air to the preview"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown * 100)}
        aria-valuetext={shown === 0 ? 'On air' : `${Math.round(shown * 100)}% to the preview`}
        className="absolute top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-[4px] border border-line-strong bg-surface-1 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
        style={{ left: `${shown * 100}%` }}
        onKeyDown={onKey}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          setAt(shown)
        }}
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          const v = valueAt(e.clientX)
          setAt(v)
          send(v, false)
        }}
        onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          e.currentTarget.releasePointerCapture(e.pointerId)
          dragging.current = false
          release(valueAt(e.clientX))
        }}
        onPointerCancel={() => {
          dragging.current = false
          release(shown)
        }}
      />
    </div>
  )
}

/** A drag in the preview: the item, the box and pointer it started from, and the handle. */
interface Held {
  id: number
  from: Frame
  start: Pt
  grip: Grip
  /** The pointer moved enough to count as a drag (a click only picks). */
  moved: boolean
  last: Box | null
  /** Other sources picked with it, moved by the same amount (OBS's multi-select). */
  others: { id: number; from: Frame }[]
  /** Alt held on a handle: cropping, from this crop and source size once they're read. */
  crop: { from: Crop; size: { width: number; height: number } } | null | 'reading'
  lastCrop: Crop | null
}

/** What the next request for a source does (the newest replaces an older one). */
type Job = { box: Box; save: boolean } | { crop: Crop; save: boolean }

/**
 * Pick, move and resize sources in the preview, as in OBS: click picks (the engine outlines
 * it), ⌘-click (Ctrl on Windows) picks more, drag moves every picked source, the handles
 * resize (corners keep the shape unless Shift is held), Alt on a handle crops instead, it
 * snaps to the canvas's edges unless Alt is held, arrow keys nudge. A source inside a group
 * moves on its own once picked (in Sources, or by pressing inside it when picked); a click
 * on it picks its group, as in OBS.
 */
function useStageEdit(ref: React.RefObject<HTMLDivElement | null>, on: boolean) {
  const {
    api,
    scene,
    items,
    selected,
    select,
    also,
    pickMore,
    edit,
    stats,
    setTransforming,
    prefs,
  } = useDesk()
  const { run } = useAction()
  const p = prefs.data
  const canvas = stats?.canvas ?? null
  const [pv] = usePreviewView()
  const held = useRef<Held | null>(null)
  const sending = useRef<{ busy: boolean; next: Map<number, Job> }>({
    busy: false,
    next: new Map(),
  })

  // The engine outlines whatever is picked here or in the Sources panel (and, with frames on,
  // every source in its own colour).
  const alsoKey = also.join(',')
  useEffect(() => {
    if (!on) return
    const pickNone = selected === null && !pv.frames
    const more = alsoKey ? alsoKey.split(',').map(Number) : []
    void api
      .select(pickNone ? null : { scene, id: selected, frames: pv.frames, also: more })
      .catch(() => undefined)
  }, [api, on, scene, selected, alsoKey, pv.frames])
  useEffect(() => {
    if (!on) return
    return () => void api.select(null).catch(() => undefined)
  }, [api, on])

  const list = items.data ?? []
  // Sources inside groups too: a picked one is found, moved and nudged like any other.
  const flat = list.flatMap((i) => [i, ...i.children])
  const where = (e: { clientX: number; clientY: number }) => {
    const el = ref.current
    if (!el || !canvas) return null
    const r = el.getBoundingClientRect()
    const f = fit(r, canvas)
    if (!(f.scale > 0)) return null
    return {
      p: { x: (e.clientX - r.left - f.ox) / f.scale, y: (e.clientY - r.top - f.oy) / f.scale },
      // Handles are 10 screen pixels; a little more is easier to grab.
      reach: 9 / f.scale,
      // Three screen pixels before a press becomes a drag.
      still: 3 / f.scale,
      // OBS's Snapping: how near (screen pixels), off when switched off.
      snap: p?.snapping === false ? 0 : (p?.snap_px ?? 10) / f.scale,
    }
  }

  const put = (item: EngineItem) =>
    items.set((prev) =>
      (prev ?? []).map((i) => {
        const one = (x: EngineItem) =>
          x.id === item.id && item.frame ? { ...x, frame: item.frame } : x
        return { ...one(i), children: i.children.map(one) }
      }),
    )

  // One request on the way at a time; for each source the newest waits and replaces older ones.
  const pump = () => {
    const q = sending.current
    if (q.busy) return
    const first = q.next.entries().next()
    if (first.done) return
    const [id, job] = first.value
    q.next.delete(id)
    q.busy = true
    const go =
      'box' in job
        ? api.setItemBox(scene, id, { ...job.box, save: job.save })
        : api.setItemCrop(scene, id, { ...job.crop, save: job.save })
    const done = job.save ? run('move', () => go) : go.catch(() => undefined)
    void done
      .then((item) => {
        if (item) put(item)
      })
      .finally(() => {
        q.busy = false
        pump()
      })
  }
  const queue = (id: number, job: Job) => {
    const q = sending.current
    // A save never gets replaced by a later move without one.
    const prev = q.next.get(id)
    q.next.set(id, { ...job, save: job.save || !!prev?.save })
    pump()
  }
  const send = (id: number, b: Box, save: boolean) => queue(id, { box: b, save })

  const frameOf = (id: number | null) => flat.find((i) => i.id === id)?.frame ?? null
  const pickedIds = [selected, ...also].filter((id): id is number => id !== null)

  // Where every source of the drag goes: the held one by the drag, the others by as much.
  const moveAll = (h: Held, b: Box, save: boolean) => {
    send(h.id, b, save)
    const dx = b.x - h.from[4]
    const dy = b.y - h.from[5]
    for (const o of h.others) {
      const ob = boxOf(o.from)
      send(o.id, { ...ob, x: ob.x + dx, y: ob.y + dy }, save)
    }
  }
  const finish = (h: Held | null) => {
    if (!h?.moved) return
    if (h.lastCrop) queue(h.id, { crop: h.lastCrop, save: true })
    else if (h.last) moveAll(h, h.last, true)
  }

  if (!on || !canvas) return {}
  return {
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const w = where(e)
      if (!w) return
      ref.current?.focus({ preventScroll: true })
      // ⌘-click (Ctrl on Windows) picks or unpicks one more, as in OBS.
      if (e.metaKey || e.ctrlKey) {
        const t = pick(list, w.p)
        if (t) pickMore(t.id, 'toggle')
        return
      }
      const current = flat.find((i) => i.id === selected)
      let target: EngineItem | null = null
      let grip: Grip | null = null
      if (current?.frame && current.visible) {
        grip = gripAt(current.frame, w.p, w.reach)
        // As in OBS, a press inside the picked source keeps it, even under another one: a
        // source behind a full-screen camera can still be moved.
        if (!grip && inside(current.frame, w.p)) grip = MOVE
        if (grip) target = current
      }
      // Inside another picked source: drag them all.
      if (!target) {
        const other = flat.find(
          (i) => also.includes(i.id) && i.visible && i.frame && inside(i.frame, w.p),
        )
        if (other) {
          target = other
          grip = MOVE
        }
      }
      if (!target) {
        target = pick(list, w.p)
        grip = MOVE
      }
      if (!target || !grip || !target.frame) {
        select(null)
        return
      }
      const picked = pickedIds.includes(target.id)
      if (!picked) select(target.id)
      if (target.locked) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const cropping = e.altKey && grip.u >= 0
      const h: Held = {
        id: target.id,
        from: target.frame,
        start: w.p,
        grip,
        moved: false,
        last: null,
        others:
          picked && grip.u < 0
            ? flat.flatMap((i) =>
                i.id !== target.id && pickedIds.includes(i.id) && !i.locked && i.frame
                  ? [{ id: i.id, from: i.frame }]
                  : [],
              )
            : [],
        crop: cropping ? 'reading' : null,
        lastCrop: null,
      }
      held.current = h
      if (cropping) {
        // The crop and the source's own size, to work the drag out in its pixels.
        void api
          .transform(scene, target.id)
          .then((t) => {
            if (held.current !== h) return
            h.crop = {
              from: {
                left: t.crop_left,
                top: t.crop_top,
                right: t.crop_right,
                bottom: t.crop_bottom,
              },
              size: { width: t.width, height: t.height },
            }
          })
          .catch(() => {
            if (held.current === h) h.crop = null
          })
      }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const w = where(e)
      if (!w) return
      const h = held.current
      if (!h) {
        // The cursor says what a press would do.
        const f = frameOf(selected)
        const g = f ? gripAt(f, w.p, w.reach) : null
        const over = g
          ? e.altKey
            ? 'crosshair'
            : cursorFor(f as Frame, g)
          : f && inside(f, w.p)
            ? 'move'
            : pick(list, w.p)
              ? 'pointer'
              : ''
        e.currentTarget.style.cursor = over
        return
      }
      const d = { x: w.p.x - h.start.x, y: w.p.y - h.start.y }
      if (!h.moved && Math.hypot(d.x, d.y) < w.still) return
      h.moved = true
      if (h.crop) {
        if (h.crop === 'reading') return
        const c = cropDrag(h.from, h.grip, d, h.crop.from, h.crop.size)
        h.lastCrop = c
        queue(h.id, { crop: c, save: false })
        return
      }
      const b = drag(h.from, h.grip, d, {
        free: e.shiftKey,
        canvas,
        // Alt (Option) held: no snapping this once, as in OBS.
        snap: e.altKey ? 0 : w.snap,
        to: {
          screen: p?.snap_screen ?? true,
          center: p?.snap_center ?? false,
          others:
            (p?.snap_sources ?? false)
              ? flat.flatMap((i) =>
                  i.id !== h.id && !h.others.some((o) => o.id === i.id) && i.visible && i.frame
                    ? [i.frame]
                    : [],
                )
              : [],
        },
      })
      h.last = b
      moveAll(h, b, false)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const h = held.current
      held.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId)
      finish(h)
    },
    onPointerCancel: () => {
      const h = held.current
      held.current = null
      finish(h)
    },
    onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => {
      const w = where(e)
      const it = w && pick(list, w.p)
      if (it) edit(it.name)
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        select(null)
        return
      }
      // ⌘E (Ctrl+E): Edit Transform for the picked source, as in OBS.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        const it = flat.find((i) => i.id === selected)
        if (it) {
          e.preventDefault()
          setTransforming({ scene, id: it.id, name: it.name })
        }
        return
      }
      const step = e.shiftKey ? 10 : 1
      const d = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      }[e.key]
      const moving = flat.filter((i) => pickedIds.includes(i.id) && i.frame && !i.locked)
      if (!d || moving.length === 0) return
      e.preventDefault()
      for (const it of moving) {
        const f = it.frame as Frame
        const b = boxOf(f)
        // Moved here at once, so a held key builds on each step before the engine answers.
        put({ ...it, frame: [f[0], f[1], f[2], f[3], f[4] + d.x, f[5] + d.y] })
        send(it.id, { ...b, x: b.x + d.x, y: b.y + d.y }, true)
      }
    },
  }
}

/** The stage when the Studio isn't running: start it, or say why it can't. */
export function StageOff({
  available,
  detail,
  onStart,
}: {
  available: boolean
  detail: string | null
  onStart: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#0a0b0d] p-6 text-center">
      {available ? (
        <div className="flex flex-col items-center gap-3">
          <p className="m-0 max-w-[36ch] text-[15px] text-[#c3c8d1]">
            Your scenes come back where you left them.
          </p>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              setBusy(true)
              // Spins until it started or failed (then it can be pressed again).
              void onStart().finally(() => setBusy(false))
            }}
          >
            <Play size={15} weight="fill" /> Start the Studio
          </Button>
        </div>
      ) : (
        <p className="m-0 max-w-[48ch] text-[15px] text-[#c3c8d1]">{detail}</p>
      )}
    </div>
  )
}

export const TRANSITIONS: Record<string, string> = {
  fade_transition: 'Fade',
  cut_transition: 'Cut',
  swipe_transition: 'Swipe',
  slide_transition: 'Slide',
  fade_to_color_transition: 'Fade to colour',
  wipe_transition: 'Wipe',
  obs_stinger_transition: 'Stinger',
}

/** Transitions with settings of their own (a direction, a colour, an image, a video). */
const HAS_SETTINGS = new Set([
  'swipe_transition',
  'slide_transition',
  'fade_to_color_transition',
  'wipe_transition',
  'obs_stinger_transition',
])

/** Under the picture: the scene on air and the transition between scenes. */
/** True when frame `a` covers all of frame `b` that's on the canvas (`w` × `h`): what's off
 * the canvas isn't seen anyway. */
export function covers(a: Frame, b: Frame, w: number, h: number): boolean {
  const clamp = (n: number, hi: number) => Math.min(Math.max(n, 0), hi)
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  return corners.every(([u, v]) => {
    const p = at(b, u, v)
    return inside(a, { x: clamp(p.x, w), y: clamp(p.y, h) })
  })
}

/** The preview's zoom and frames switch, and a note when the picked source is hidden behind
 * another (it still moves; its outline shows where it is). */
function ViewControls() {
  const { api, scene, scenes, items, selected, refresh, stats } = useDesk()
  const { run } = useAction()
  const [pv, setPv] = usePreviewView()
  const c = stats?.canvas
  const list = items.data ?? []
  const idx = list.findIndex((i) => i.id === selected)
  const it = idx >= 0 ? list[idx] : undefined
  const cover =
    it?.frame && it.visible && c
      ? list
          .slice(0, idx)
          .find(
            (o) => o.visible && o.frame && covers(o.frame, it.frame as Frame, c.width, c.height),
          )
      : undefined
  return (
    <>
      {it && cover && (
        <span className="flex min-w-0 items-center gap-2 rounded-full bg-warn-soft py-0.5 pr-1 pl-3 text-[13px] font-semibold text-warn">
          <span className="truncate">Behind {cover.name}</span>
          <button
            type="button"
            onClick={() =>
              void run('order', () => done(api.itemOrder(scene, it.id, 0))).then(
                (ok) => ok && refresh(),
              )
            }
            className="rounded-full bg-surface-1 px-2 py-0.5 text-[12.5px] font-bold text-text hover:bg-surface-2"
          >
            Bring to front
          </button>
        </span>
      )}
      {!scenes.data?.preview && (
        <div
          role="group"
          aria-label="Zoom"
          className="flex items-center rounded-full bg-surface-3 p-0.5"
        >
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={pv.zoom === z}
              onClick={() => setPv({ zoom: z })}
              className={cx(
                'rounded-full px-2 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums',
                pv.zoom === z ? 'bg-surface-1 text-text shadow-sm' : 'text-text-3 hover:text-text',
              )}
            >
              {z === 1 ? 'Fit' : `${z * 100}%`}
            </button>
          ))}
        </div>
      )}
      <IconButton
        size="sm"
        label={pv.frames ? 'Hide source outlines' : 'Show every source’s outline'}
        aria-pressed={pv.frames}
        className={cx(pv.frames && 'bg-accent-soft text-accent-text')}
        onClick={() => setPv({ frames: !pv.frames })}
      >
        <BoundingBox size={17} weight={pv.frames ? 'fill' : 'regular'} />
      </IconButton>
    </>
  )
}

export function StageBar() {
  const { api, scenes, scene, kinds, stats, openSettings, screens, refresh } = useDesk()
  const c = stats?.canvas
  const { run } = useAction()
  const { open, menu } = useContextMenu()
  const history = stats?.history
  const step = (redo: boolean) =>
    void run('undo', () => (redo ? api.redo() : api.undo()), {
      success: (r) => (r.done ? `${redo ? 'Redone' : 'Undone'}: ${r.done}` : null),
    }).then((r) => r && refresh())
  // Steps back (or forward) several at once from the history list.
  const steps = (redo: boolean, n: number) =>
    void run(
      'undo',
      async () => {
        let last = null as Awaited<ReturnType<typeof api.undo>> | null
        try {
          for (let k = 0; k < n; k++) last = await (redo ? api.redo() : api.undo())
        } catch (err) {
          // The steps before this one were taken: show them.
          refresh()
          throw err
        }
        return last
      },
      {
        success: () => (n > 1 ? `${redo ? 'Redone' : 'Undone'}: ${n} steps` : null),
      },
    ).then((r) => r && refresh())
  const historyList = async (e: React.MouseEvent) => {
    // The menu opens once the list is in, at the button.
    const el = e.currentTarget as HTMLElement
    const { clientX, clientY } = e
    const list = await api.history().catch(() => null)
    if (!list) return
    const at = { preventDefault() {}, stopPropagation() {}, currentTarget: el, clientX, clientY }
    open(at as unknown as React.MouseEvent, 'History', historyMenu(list, steps))
  }
  const show = (what: 'program' | 'multiview', screen: number | undefined, onTop?: boolean) =>
    void run('projector', () =>
      api.projector({
        what,
        ...(screen === undefined ? {} : { screen }),
        ...(onTop ? { on_top: true } : {}),
      }),
    )
  const projectors = (e: React.MouseEvent) => {
    // A display plugged in since shows next time.
    screens.reload()
    open(e, 'Projectors', [
      projectorItem('On air', screens.data, (sc, top) => show('program', sc, top)),
      {
        ...projectorItem('Multiview', screens.data, (sc, top) => show('multiview', sc, top)),
        icon: SquaresFour,
      },
      { sep: true },
      {
        label: 'Close all projectors',
        icon: X,
        onSelect: () => void run('projector', () => api.closeProjectors()),
      },
    ])
  }
  const t = scenes.data?.transition
  const [ms, setMs] = useState<number | null>(null)
  const [tuning, setTuning] = useState<string | null>(null)
  const kindsOn = (kinds.data?.transitions ?? []).filter((k) => TRANSITIONS[k.id])
  const set = async (kind: string, dur: number) => {
    const ok = await run('transition', async () => {
      await api.setTransition({ kind, ms: dur })
      return true
    })
    if (ok) scenes.reload()
  }
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-2 border-t border-line bg-surface-1 px-2.5 py-2 text-[14px] text-text-3 xl:gap-x-3 xl:px-3">
      {/* The Scenes panel shows what's on air; here the name fits on wide screens. */}
      <span className="hidden font-display text-[16px] font-bold text-text xl:inline">{scene}</span>
      {c && (
        <button
          type="button"
          title="Change the picture size"
          onClick={() => openSettings('picture')}
          className="hidden rounded-full xl:inline-block bg-surface-3 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-text-2 tabular-nums hover:text-text"
        >
          {c.width}×{c.height} · {c.fps}&nbsp;fps
        </button>
      )}
      <ViewControls />
      <span className="flex-1" />
      {t && (
        <div className="flex items-center gap-2">
          <label htmlFor="studio-transition" className="hidden 2xl:inline">
            Switch with
          </label>
          <Select
            id="studio-transition"
            aria-label="Switch with"
            className="h-8! w-auto! py-0! text-[14px]"
            value={t.kind}
            onChange={(e) => void set(e.target.value, t.ms)}
          >
            {(kindsOn.length ? kindsOn : [{ id: t.kind, name: t.kind }]).map((k) => (
              <option key={k.id} value={k.id}>
                {TRANSITIONS[k.id] ?? k.name}
              </option>
            ))}
          </Select>
          {HAS_SETTINGS.has(t.kind) && (
            <IconButton
              size="sm"
              label={`${TRANSITIONS[t.kind] ?? 'Transition'} settings`}
              onClick={() => setTuning(t.kind)}
            >
              <GearSix size={16} weight="bold" />
            </IconButton>
          )}
          {/* A stinger lasts as long as its video. */}
          {t.kind !== 'cut_transition' && t.kind !== 'obs_stinger_transition' && (
            <span className="flex items-center gap-2">
              <Input
                aria-label="Transition length in milliseconds"
                type="number"
                inputMode="numeric"
                min={0}
                max={20000}
                step={50}
                className="h-8! w-20! py-0! text-right text-[14px] tabular-nums"
                value={ms ?? t.ms}
                onChange={(e) =>
                  setMs(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null)
                }
                onBlur={() => {
                  if (ms !== null && ms !== t.ms && ms >= 0 && ms <= 20000)
                    void set(t.kind, Math.round(ms))
                  setMs(null)
                }}
              />
              <span aria-hidden>ms</span>
            </span>
          )}
          <span className="hidden xl:contents">
            <InfoTip label="About switching scenes">
              How the picture changes when you click another scene.
            </InfoTip>
          </span>
        </div>
      )}
      <IconButton
        size="sm"
        label={
          scenes.data?.preview
            ? 'Leave Studio Mode'
            : 'Studio Mode: edit a scene before it goes on air'
        }
        aria-pressed={!!scenes.data?.preview}
        className={cx(scenes.data?.preview && 'bg-accent-soft text-accent-text')}
        onClick={() =>
          void run('studio', () => done(api.studioMode(!scenes.data?.preview))).then(
            (ok) => ok && refresh(),
          )
        }
      >
        <Columns size={17} weight="bold" />
      </IconButton>
      <span className="flex items-center">
        <IconButton
          size="sm"
          label={history?.undo ? `Undo ${history.undo} (⌘Z)` : 'Nothing to undo'}
          disabled={!history?.undo}
          onClick={() => step(false)}
        >
          <ArrowUUpLeft size={16} weight="bold" />
        </IconButton>
        <IconButton
          size="sm"
          label={history?.redo ? `Redo ${history.redo} (⇧⌘Z)` : 'Nothing to redo'}
          disabled={!history?.redo}
          onClick={() => step(true)}
        >
          <ArrowUUpRight size={16} weight="bold" />
        </IconButton>
        <IconButton size="sm" label="History: step back to any change" onClick={historyList}>
          <ClockCounterClockwise size={16} weight="bold" />
        </IconButton>
      </span>
      {inDesktopApp() && (
        <IconButton size="sm" label="Projectors and multiview" onClick={projectors}>
          <ProjectorScreen size={17} weight="bold" />
        </IconButton>
      )}
      {menu}
      <TransitionSettingsDialog kind={tuning} onClose={() => setTuning(null)} />
    </div>
  )
}

/** A transition's own settings (OBS's Transition Properties), applied as they change. */
function TransitionSettingsDialog({ kind, onClose }: { kind: string | null; onClose: () => void }) {
  return (
    <Dialog
      open={kind !== null}
      onClose={onClose}
      title={`${kind ? (TRANSITIONS[kind] ?? kind) : 'Transition'} settings`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {kind && <TransitionSettingsForm key={kind} kind={kind} />}
    </Dialog>
  )
}

function TransitionSettingsForm({ kind }: { kind: string }) {
  const { api } = useDesk()
  const { run } = useAction()
  const loaded = useResource(
    () => Promise.all([api.options(kind), api.defaults(kind), api.transitionSettings(kind)]),
    [api, kind],
  )
  const [values, setValues] = useState<EngineSettings | null>(null)
  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-40" />
  const [opts, defaults, saved] = loaded.data
  const shown = values ?? { ...defaults, ...saved }
  return (
    <OptionsForm
      opts={opts}
      values={shown}
      onChange={(key, value) => {
        setValues({ ...shown, [key]: value })
        void run('transition', () => api.setTransitionSettings(kind, { [key]: value }))
      }}
    />
  )
}
