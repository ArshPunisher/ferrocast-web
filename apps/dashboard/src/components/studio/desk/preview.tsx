// The stage: the live picture (a native view the app draws over this box, letterboxed like
// OBS's preview) and, under it, the scene on air and how scenes change.

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  ArrowUUpLeft,
  ArrowFatRight,
  ArrowUUpRight,
  ArrowsLeftRight,
  BoundingBox,
  FrameCorners,
  Lock,
  LockOpen,
  LockSimple,
  LockSimpleOpen,
  ClockCounterClockwise,
  Columns,
  DeviceMobile,
  DotsThree,
  MoonStars,
  GearSix,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Plus,
  Trash,
  Play,
  ProjectorScreen,
  ShieldWarning,
  SquaresFour,
  Stack,
  X,
} from '@phosphor-icons/react'
import {
  type EngineItem,
  type EngineSettings,
  type EngineStudioOptions,
  type EngineTransform,
  type EngineTransition,
  type PreviewRect,
  type SafeModeStatus,
  type StudioStartOptions,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  InfoTip,
  Input,
  Select,
  Skeleton,
  cx,
} from '@ferrocast/ui'
import { isSafeModeLocked } from '../../safe-mode'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { shortcut } from '../../../lib/os'
import { installPreviewInput, picturesTakeMouse } from '../../../lib/preview-input'
import { done, useAction, useResource } from '../../../lib/hooks'
import { useDesk, useDeskStats, useEngine } from './common'
import { projectorItem, useContextMenu, type MenuItem } from './menu'
import { OverflowRow, type OverflowItem } from './overflow-row'
import { GuideOverlay, OverflowMask } from './preview-guides'
import { OptionsForm } from './options'
import { ArrangeButton } from './arrange'
import { GroupBox, HOLES_CHANGED, SnapOverlay, clearHints, setHints } from './snap-overlay'
import {
  frameOfBox,
  gapsFor,
  guidesFor,
  enqueueJob,
  marqueeHits,
  pickedGroup,
  revertCrop,
  queuedIds,
  revertBoxes,
  pickedBoxes,
  pickWith,
  rectOf,
  scaleGroup,
  snapReach,
  snapTargets,
  union,
  type BoxFor,
  type Rect,
} from './snap'
import { PausedCard, PerformanceToggle, PreviewPausedSync } from './performance'
import { HAS_SETTINGS, MatrixIcon, TRANSITIONS } from './transitions'

export { TRANSITIONS } from './transitions'
import {
  MOVE,
  at,
  boxOf,
  cropCursorFor,
  cropDrag,
  cursorFor,
  drag,
  addsToPick,
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

/** The zoom shortcuts: all of the canvas, then smaller to see what's off it. */
export const ZOOMS = [1, 0.75, 0.5] as const
/** How far the preview zooms: out to a quarter, in to four times the fit. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
/** One step of the zoom in and out buttons and keys. */
export const ZOOM_STEP = 1.25
export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

export interface StageSize {
  width: number
  height: number
}

const cleanZero = (n: number): number => (Object.is(n, -0) || Math.abs(n) < 1e-9 ? 0 : n)

/**
 * Fitted box size of an aspect-ratio canvas inside a stage content area (`stageW` × `stageH`).
 */
export function fitBoxSize(
  stageW: number,
  stageH: number,
  aspect = 16 / 9,
): { width: number; height: number } {
  if (!(stageW > 0 && stageH > 0 && aspect > 0)) return { width: 0, height: 0 }
  const width = Math.min(stageW, stageH * aspect)
  return { width, height: width / aspect }
}

/**
 * Zoom factor (relative to Fit = 1) that draws `canvasWidth` canvas pixels 1:1 with CSS pixels,
 * clamped to `[ZOOM_MIN, ZOOM_MAX]`. Returns `null` when dimensions are unavailable.
 */
export function pixelZoomForStage(canvasWidth: number, fitWidth: number): number | null {
  if (!(
    Number.isFinite(canvasWidth) &&
    Number.isFinite(fitWidth) &&
    canvasWidth > 0 &&
    fitWidth > 0
  ))
    return null
  return clampZoom(canvasWidth / fitWidth)
}

/**
 * Maximum `[x, y]` pan offset (px from stage centre) before a zoomed box leaves empty margin
 * inside the stage. Zero on an axis when the box already fits on that axis.
 */
export function zoomBoundsPan(
  zoom: number,
  fit: { width: number; height: number },
  stage: { width: number; height: number },
): [number, number] {
  return [
    Math.max(0, (fit.width * zoom - stage.width) / 2),
    Math.max(0, (fit.height * zoom - stage.height) / 2),
  ]
}

/** Clamps `pan` to `[-maxPan, +maxPan]` on each axis and normalises `-0`. */
export function clampPan(
  pan: readonly [number, number],
  maxPan: readonly [number, number],
): [number, number] {
  const cx = Math.min(maxPan[0], Math.max(-maxPan[0], pan[0]))
  const cy = Math.min(maxPan[1], Math.max(-maxPan[1], pan[1]))
  return [cleanZero(cx), cleanZero(cy)]
}

/**
 * Applies a scroll delta (`+dx/+dy` = scroll right/down, shifting the canvas left/up) and clamps
 * within `maxPan` so the canvas stays centred when it fits inside the stage.
 */
export function scrollPan(
  pan: readonly [number, number],
  delta: readonly [number, number],
  maxPan: readonly [number, number],
): [number, number] {
  return clampPan([pan[0] - delta[0], pan[1] - delta[1]], maxPan)
}

/**
 * Zooms by `k` keeping the picture point under `at` (the pointer, from the stage's centre) where
 * it is: the box sits centred in its stage and `pan` moves it, so the new pan follows from the
 * old one. When `bounds` is supplied, clamps the resulting pan to the overflow bounds so zooming
 * back to Fit or smaller recentres cleanly.
 */
export function zoomAt(
  zoom: number,
  pan: readonly [number, number],
  k: number,
  at: readonly [number, number],
  bounds?: { fit: { width: number; height: number }; stage: { width: number; height: number } },
): { zoom: number; pan: [number, number] } {
  const next = clampZoom(zoom * k)
  const r = next / zoom
  const raw: [number, number] = [
    cleanZero(at[0] - (at[0] - pan[0]) * r),
    cleanZero(at[1] - (at[1] - pan[1]) * r),
  ]
  const clamped = bounds ? clampPan(raw, zoomBoundsPan(next, bounds.fit, bounds.stage)) : raw
  return { zoom: next, pan: clamped }
}

/** The preview's zoom, whether every source shows its outline, and whether frames keep their
 * shape from every handle (locked) or stretch from the side ones, kept for this viewer. */
interface PreviewView {
  zoom: number
  /** Where the zoomed canvas sits against the stage's centre (px); not kept between runs. */
  pan: [number, number]
  /** Lock preview: sources can be picked but not moved, resized or nudged. */
  locked: boolean
  /** Guides over the canvas (EBU R95 action and title safe areas, a centre cross). */
  safe: { action: boolean; title: boolean; cross: boolean }
  /** What shows of a source that runs past the canvas: as it is, or hidden. */
  overflow: 'show' | 'hide'
  frames: boolean
  keep: boolean
  /** With the vertical picture on: both side by side, or one of them on its own. */
  view: PictureView
}
export type PictureView = 'both' | 'wide' | 'vertical'
const VIEWS: PictureView[] = ['wide', 'both', 'vertical']
const VIEW_KEY = 'fc-preview-view'
const viewSubs = new Set<() => void>()
let view: PreviewView = readView()

const stageSubs = new Set<() => void>()
let stageSize: StageSize | null = null

function displayedPan(v: PreviewView = view): [number, number] {
  const b = getStageBounds(v.zoom)
  return b ? clampPan(v.pan, b.maxPan) : v.pan
}

export function setStageSize(next: StageSize | null): void {
  if (stageSize?.width === next?.width && stageSize?.height === next?.height) return
  stageSize = next
  const b = getStageBounds(view.zoom)
  if (b) {
    const pan = clampPan(view.pan, b.maxPan)
    if (pan[0] !== view.pan[0] || pan[1] !== view.pan[1]) {
      view = { ...view, pan }
      for (const cb of viewSubs) cb()
    }
  }
  for (const cb of stageSubs) cb()
}

function useStageSize(): StageSize | null {
  return useSyncExternalStore(
    (cb) => {
      stageSubs.add(cb)
      return () => stageSubs.delete(cb)
    },
    () => stageSize,
  )
}

function getStageMetrics(): { fit: StageSize; stage: StageSize } | null {
  if (!stageSize) return null
  const fit = fitBoxSize(stageSize.width, stageSize.height)
  if (!(fit.width > 0 && fit.height > 0)) return null
  return { fit, stage: stageSize }
}

function getStageBounds(zoom: number): { maxPan: [number, number] } | null {
  const m = getStageMetrics()
  if (!m) return null
  return { maxPan: zoomBoundsPan(zoom, m.fit, m.stage) }
}

function readView(): PreviewView {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as Partial<PreviewView> | null
    if (v && typeof v.zoom === 'number' && Number.isFinite(v.zoom) && typeof v.frames === 'boolean')
      return {
        zoom: clampZoom(v.zoom),
        pan: [0, 0],
        locked: v.locked === true,
        safe: {
          action: v.safe?.action === true,
          title: v.safe?.title === true,
          cross: v.safe?.cross === true,
        },
        overflow: v.overflow === 'hide' ? 'hide' : 'show',
        frames: v.frames,
        keep: typeof v.keep === 'boolean' ? v.keep : true,
        view: VIEWS.find((x) => x === v.view) ?? 'both',
      }
  } catch {
    // Storage off (a private window): the defaults.
  }
  return {
    zoom: 1,
    pan: [0, 0],
    locked: false,
    safe: { action: false, title: false, cross: false },
    overflow: 'show',
    frames: true,
    keep: true,
    view: 'both',
  }
}

function viewSet(next: Partial<PreviewView>): void {
  const zoom = next.zoom !== undefined ? clampZoom(next.zoom) : view.zoom
  const rawPan: [number, number] = next.pan
    ? [cleanZero(next.pan[0]), cleanZero(next.pan[1])]
    : view.pan
  const b = getStageBounds(zoom)
  const pan = b ? clampPan(rawPan, b.maxPan) : rawPan
  const updated: PreviewView = { ...view, ...next, zoom, pan }
  if (
    updated.zoom === view.zoom &&
    updated.pan[0] === view.pan[0] &&
    updated.pan[1] === view.pan[1] &&
    updated.locked === view.locked &&
    updated.frames === view.frames &&
    updated.keep === view.keep &&
    updated.overflow === view.overflow &&
    updated.view === view.view &&
    updated.safe.action === view.safe.action &&
    updated.safe.title === view.safe.title &&
    updated.safe.cross === view.safe.cross
  )
    return
  view = updated
  try {
    const { pan: _pan, ...kept } = view
    localStorage.setItem(VIEW_KEY, JSON.stringify(kept))
  } catch {
    // Not kept; still applies now.
  }
  for (const cb of viewSubs) cb()
}

/** The view as it is now (for handlers that must not wait for a render). */
export const getPreviewView = (): PreviewView => view

export function usePreviewView(): [PreviewView, (next: Partial<PreviewView>) => void] {
  const v = useSyncExternalStore(
    (cb) => {
      viewSubs.add(cb)
      return () => viewSubs.delete(cb)
    },
    () => view,
  )
  return [v, viewSet]
}

/** A point from the middle of `el`, in px (where `zoomAt` takes it from). */
function pointerFromCentre(el: Element, x: number, y: number): [number, number] {
  const r = el.getBoundingClientRect()
  return [x - (r.left + r.width / 2), y - (r.top + r.height / 2)]
}

/** Lock preview on or off (the menu bar's Edit › Lock Preview). */
export function togglePreviewLock(): void {
  viewSet({ locked: !getPreviewView().locked })
}

/** Fit and centre the preview's canvas. */
export function fitPreview(): void {
  viewSet({ zoom: 1, pan: [0, 0] })
}

/** Zooms the preview by `k` round `at` (from the stage's centre). */
export function zoomView(k: number, at: [number, number] = [0, 0]): void {
  const v = getPreviewView()
  const m = getStageMetrics()
  const next = zoomAt(v.zoom, v.pan, k, at, m ?? undefined)
  viewSet({ zoom: next.zoom, pan: next.pan })
}

/** An element's background as 0xRRGGBB (what the app paints round the canvas). */
function bgOf(el: Element | null): number | undefined {
  if (!el) return undefined
  const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return undefined
  const [r, g, b] = m.map(Number)
  return ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0)
}

/**
 * The theme's second stripe colour round the canvas (`--fc-stage-b`) as 0xRRGGBB, or undefined
 * when it isn't a six-digit hex colour. The app draws diagonal stripes in the stage's colour and
 * this one over the part of a source that runs past the canvas.
 */
export function stripeOf(el: Element | null): number | undefined {
  if (!el) return undefined
  const m = /^#([0-9a-f]{6})$/i.exec(getComputedStyle(el).getPropertyValue('--fc-stage-b').trim())
  return m?.[1] ? parseInt(m[1], 16) : undefined
}

type Hole = { x: number; y: number; w: number; h: number; r: number }

/** What can lie over the preview: menus, lists and panels (dialogs mark theirs). */
const OVER = '[role="menu"], [role="listbox"], [data-over-preview]'

/** The most holes the app takes; more than that and the picture hides instead. */
const MAX_HOLES = 16

/** The engine takes at most this many holes in all (`PREVIEW_HOLES` there); more is a 400 and the
 * picture would keep the last holes it had, painting over menus and guides. */
export const MAX_SENT_HOLES = 64

/** The guides' lines, the group box and the overflow mask are holes too, but not the kind of
 * crowd that hides the picture: they aren't counted against `MAX_HOLES`. They are against the
 * engine's limit, so when there are too many the ones that matter least (these) go first. */
const isGuide = (el: Element): boolean => el.hasAttribute('data-guide-hole')

/** The holes to send: menus and panels first and all of them, then as many guide holes as fit.
 * Null: too many menus and panels (hide the picture). */
function capHoles(first: Hole[], guides: Hole[]): Hole[] | null {
  if (first.length > MAX_HOLES) return null
  return [...first, ...guides.slice(0, Math.max(0, MAX_SENT_HOLES - first.length))]
}

/**
 * What lies over the box: the app's view can't be drawn under the page, so it leaves its
 * picture out where menus and panels are (`holes`, from the box's top left) and they show
 * there. Null: hide it all (a panel being dragged, or too much over it).
 */
export function overPreview(box: DOMRect, edge = EDGE): Hole[] | null {
  const r = new DOMRect(box.x - edge, box.y - edge, box.width + 2 * edge, box.height + 2 * edge)
  if (document.body.dataset.dockDrag) return null
  const holes: Hole[] = []
  const guides: Hole[] = []
  for (const el of document.querySelectorAll(OVER)) {
    // A modal dialog's own box is the whole window; its panel says it's over the preview.
    if (el instanceof HTMLDialogElement) continue
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) {
      // Its rounded corners too, so the picture shows round them, not a square of the page.
      const rad = Math.min(200, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0)
      const hole = { x: b.left - box.x, y: b.top - box.y, w: b.width, h: b.height, r: rad }
      ;(isGuide(el) ? guides : holes).push(hole)
    }
  }
  return capHoles(holes, guides)
}

/** Where the page's content shows: below the top bar, above the phone tab bar (when shown). */
function viewBand(): { top: number; bottom: number } {
  const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
  const tabs = document.querySelector('[data-tab-bar]')?.getBoundingClientRect()
  const bottom =
    tabs && tabs.height > 0 ? Math.min(tabs.top, window.innerHeight) : window.innerHeight
  return { top, bottom }
}

/**
 * The holes that leave the picture out under the top bar and the tab bar, so a stage only
 * partly in view still shows its live picture in the part you can see (a short window's
 * narrow layout never fits the whole stage, and it stayed empty). Null: none of it shows.
 * `edge` is how far the app's view reaches past the box (EDGE, or 0 for the whole stage).
 */
function clipToView(box: DOMRect, edge: number): Hole[] | null {
  const { top, bottom } = viewBand()
  if (box.bottom <= top || box.top >= bottom || box.width <= 1 || box.height <= 1) return null
  const holes: Hole[] = []
  const w = box.width + 2 * edge
  if (box.top - edge < top) holes.push({ x: -edge, y: -edge, w, h: top - box.top + edge, r: 0 })
  if (box.bottom + edge > bottom)
    holes.push({ x: -edge, y: bottom - box.top, w, h: box.bottom + edge - bottom, r: 0 })
  return holes
}

/** The menus and panels over the box and the parts out of view, or null to hide it all. */
function cutOut(box: DOMRect, edge: number): Hole[] | null {
  const clip = clipToView(box, edge)
  const over = clip && overPreview(box, edge)
  if (!clip || !over) return null
  // The clip holes (under the bars) and the menus and panels count; `over` is already capped, so
  // what is left of the room is for what it kept.
  const room = Math.max(0, MAX_SENT_HOLES - clip.length)
  return [...clip, ...over.slice(0, room)]
}

/** Where the live picture goes: the app draws it exactly on this box (its view reaches EDGE past it for handles). In Studio
 * Mode there are two: the preview being edited, and what's on air, with the ways to switch
 * between them in the middle. */
export function PreviewBox({ running }: { running: boolean }) {
  return (
    <>
      <PreviewPausedSync running={running} />
      <PreviewBoxes running={running} />
    </>
  )
}

function PreviewBoxes({ running }: { running: boolean }) {
  const api = useEngine()
  const apiRef = useRef(api)
  apiRef.current = api
  const { scenes, canvas, setCanvas } = useDesk()
  const studio = !!scenes.data?.preview
  // The vertical picture beside the main one (not in Studio Mode, which is the main one's).
  const vertical = studio ? null : (scenes.data?.vertical ?? null)
  const tall = !!vertical
  const ref = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const programRef = useRef<HTMLDivElement>(null)
  const vRef = useRef<HTMLDivElement>(null)
  const vStageRef = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
  // Windows: the pictures take the mouse and the app plays it on the page here.
  useEffect(() => {
    if (!desktop || !running || !picturesTakeMouse()) return
    return installPreviewInput((css) => void api.previewCursor(css).catch(() => undefined))
  }, [api, desktop, running])
  const [pv] = usePreviewView()
  const stage = useStageSize()
  // Measure the active stage's inner content area so `100%` and scroll bounds stay exact and
  // independent of the current zoom level (works in both desktop and browser/demo mode).
  useEffect(() => {
    const el = studio || (tall && pv.view === 'vertical') ? null : stageRef.current
    if (!el) {
      setStageSize(null)
      return
    }
    const measure = () => {
      const cs = getComputedStyle(el)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const width = Math.max(0, el.clientWidth - padX)
      const height = Math.max(0, el.clientHeight - padY)
      setStageSize(width > 0 && height > 0 ? { width, height } : null)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return () => setStageSize(null)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setStageSize(null)
    }
  }, [studio, tall, pv.view])
  // ⌘/Ctrl + scroll (and a trackpad pinch, which arrives the same way) zooms round the pointer;
  // plain wheel / two-finger scroll pans inside the canvas area when it is larger than the view.
  // A listener of its own: React's wheel handler can't stop the page from zooming or scrolling.
  useEffect(() => {
    const els = [stageRef.current, vStageRef.current].filter((e): e is HTMLDivElement => !!e)
    const off = els.map((el) => {
      const onWheel = (e: WheelEvent) => {
        // Only the wide stage supports zoom/pan; never zoom or pan it from the vertical view.
        if (el !== stageRef.current || (tall && getPreviewView().view === 'vertical')) return
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          zoomView(Math.exp(-e.deltaY * 0.0025), pointerFromCentre(el, e.clientX, e.clientY))
          return
        }
        const m = getStageMetrics()
        if (!m) return
        const v = getPreviewView()
        const maxPan = zoomBoundsPan(v.zoom, m.fit, m.stage)
        if (maxPan[0] <= 0 && maxPan[1] <= 0) return
        e.preventDefault()
        const mult = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? m.stage.height : 1
        const rawDx = e.deltaX * mult
        const rawDy = e.deltaY * mult
        const dx = e.shiftKey && rawDx === 0 ? rawDy : rawDx
        const dy = e.shiftKey && rawDx === 0 ? 0 : rawDy
        viewSet({ pan: scrollPan(v.pan, [dx, dy], maxPan) })
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    })
    return () => off.forEach((f) => f())
  }, [studio, tall])
  // The scenes shown, for the still during a window resize (read there, not a reason to
  // place the picture again).
  const shown = useRef({ current: '', preview: '', vertical: '' })
  shown.current = {
    current: scenes.data?.current ?? '',
    preview: scenes.data?.preview ?? '',
    vertical: vertical?.current ?? '',
  }
  // One placement at a time, in the order asked, the newest waiting one winning: sent many a
  // frame (a menu sliding, a dialog opening), they could land out of order, and an older one
  // without the dialog's shade left the picture bright under it (owner's recording, 11 Nov).
  // One queue for the box's whole life, so a "take it away" from the last run of the effect
  // never lands after the next run's "put it here" (that hid the canvas after Start).
  // It answers true once placed, false when a newer one took its place unsent (CodeRabbit).
  const placer = useRef<(...args: Parameters<typeof api.preview>) => Promise<boolean>>(null!)
  if (!placer.current) {
    let sending = false
    let waiting: {
      run: () => Promise<void>
      done: (placed: boolean) => void
      failed: (e: unknown) => void
    } | null = null
    const pump = () => {
      if (sending || !waiting) return
      const { run, done, failed } = waiting
      waiting = null
      sending = true
      run()
        .then(() => done(true), failed)
        .finally(() => {
          sending = false
          pump()
        })
    }
    placer.current = (...args) =>
      new Promise<boolean>((done, failed) => {
        // A newer one replaces one not sent yet: that one counts as done.
        waiting?.done(false)
        waiting = { run: () => apiRef.current.preview(...args), done, failed }
        pump()
      })
  }
  useEffect(() => {
    const el = ref.current
    if (!running || !desktop || !el) return
    let raf = 0
    let last = ''
    // One placement at a time, in order, the newest waiting one winning (see `placer`).
    const put = placer.current
    const place = (box: HTMLElement | null): PreviewRect | null => {
      if (!box) return null
      const r = box.getBoundingClientRect()
      // Cut where the top bar, the tab bar, menus or panels lie over it; hidden off the window.
      const bg = bgOf(box.closest('[data-stage-bg]'))
      const stripe = stripeOf(box.closest('[data-stage-bg]'))
      const holes = cutOut(r, EDGE)
      return holes
        ? {
            x: r.left,
            y: r.top,
            w: r.width,
            h: r.height,
            vh: window.innerHeight,
            ...(bg === undefined ? {} : { bg }),
            ...(stripe === undefined ? {} : { stripe }),
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
      const stripe = stripeOf(stage)
      const holes = c.width > 1 && c.height > 1 ? cutOut(s, 0) : null
      return holes
        ? {
            x: s.left,
            y: s.top,
            w: s.width,
            h: s.height,
            vh: window.innerHeight,
            canvas: { x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height },
            ...(bg === undefined ? {} : { bg }),
            ...(stripe === undefined ? {} : { stripe }),
            ...(holes.length ? { holes } : {}),
          }
        : null
    }
    let again = 0
    let alive = true
    // Resizing the window: the web page lays out and paints a beat after the window itself,
    // and nothing native can follow what it paints (the owner's recording: a picture that
    // follows the window spills over the panels while the page catches up; one that trails
    // the page stutters; a hidden one leaves a black box). So for the resize the page shows a
    // still of the picture in the canvas's own box, part of the page and so always in step
    // with it, and the live picture comes back where things ended up once it settles.
    let resizing = 0
    let frozen = 0
    // On a Mac the app's view of the whole stage follows the window by itself, in the same
    // step as the window (as OBS's preview, a native widget in its window's layout), and the
    // app fits the picture in it: no still is shown for a window resize, the live picture
    // stays. The page's place for it, a beat behind, is sent when the resize settles.
    // (Studio Mode's two boxes and the vertical picture beside the main one are the page's
    // own and still take the still.)
    const follows = /Mac/.test(navigator.userAgent) && !studio && !tall
    let settle = 0
    let still: [PreviewRect | null, PreviewRect | null, PreviewRect | null] = [null, null, null]
    const boxes = () =>
      [el, studio ? programRef.current : null, tall ? vRef.current : null] as const
    const unfreeze = () => {
      frozen = 0
      for (const b of boxes()) {
        if (!b) continue
        b.style.backgroundImage = ''
        b.style.backgroundColor = ''
        b.style.opacity = ''
      }
    }
    const freeze = () => {
      const token = (frozen = performance.now())
      const names = studio
        ? [shown.current.preview, shown.current.current, null]
        : [shown.current.current, null, shown.current.vertical]
      const hide = () => {
        // Only while still resizing: once it settled the live picture is placed again, and
        // a still that came late must not hide it (CodeRabbit).
        if (frozen !== token || !alive || performance.now() >= resizing) return
        const off = (r: PreviewRect | null) => r && { ...r, opacity: 0 }
        last = JSON.stringify(['still', still])
        void put(off(still[0]), off(still[1]), off(still[2])).catch(() => undefined)
      }
      void Promise.all(
        boxes().map(async (b, i) => {
          const name = names[i]
          if (!b || !name) return
          const w = Math.min(640, Math.max(64, Math.round(b.clientWidth * devicePixelRatio)))
          const { image } = await api.thumbnail(name, w)
          const img = new Image()
          img.src = image
          await img.decode()
          if (frozen !== token) return
          // A scene's picture is clear where nothing is (the vertical one's bars above and
          // below a wide source): black under it, as the canvas draws.
          b.style.backgroundColor = '#000'
          b.style.backgroundImage = `url("${image}")`
          b.style.backgroundSize = '100% 100%'
        }),
      )
        .catch(() => undefined)
        // Hidden once the still is painted (or without one, if it couldn't be made).
        .then(() => requestAnimationFrame(hide))
    }
    const send = () => {
      raf = 0
      if (!alive) return
      window.clearTimeout(again)
      // The window is hidden or minimised (plan item 10, lighter): no live picture is drawn
      // for nobody to see, which saves the graphics card for the game; the stream and the
      // recording go on as before. It's placed again when the window shows.
      if (document.hidden) {
        if (last !== 'hidden') {
          last = 'hidden'
          void put(null, null, null).catch(() => undefined)
        }
        return
      }
      if (performance.now() < resizing) {
        // A panel is being dragged: placed again when it lands.
        if (resizing === Infinity) return
        again = window.setTimeout(
          () => {
            last = ''
            schedule()
          },
          resizing - performance.now() + 16,
        )
        return
      }
      let rect = studio ? place(el) : placeStage(stageRef.current, el)
      let program = studio ? place(programRef.current) : null
      let tallRect = tall && vRef.current ? placeStage(vStageRef.current, vRef.current) : null
      // Under a dialog the page is dimmed by its backdrop (rgb(4 5 8 / 0.62)): the app draws
      // the same over the picture.
      if (document.querySelector('dialog[open]')) {
        rect = rect && { ...rect, shade: 0.62 }
        program = program && { ...program, shade: 0.62 }
        tallRect = tallRect && { ...tallRect, shade: 0.62 }
      }
      // While an overlay menu or floating panel is animating, follow it smoothly; stop at rest
      // instead of spinning at 60 fps while idle.
      if (
        document.querySelector(OVER) &&
        document.getAnimations().some((a) => a.playState === 'running')
      )
        schedule()
      // The window's height is part of it: the native side places the view from the bottom.
      const key = JSON.stringify([rect, program, tallRect, window.innerHeight])
      still = [rect, program, tallRect]
      if (key === last) {
        if (frozen) unfreeze()
        return
      }
      last = key
      const thawing = frozen
      void put(rect, program, tallRect)
        .then((placed) => {
          // The live picture is back in place: the still goes a moment later, under it. One
          // replaced before it was sent leaves that to the one that replaced it.
          if (placed && thawing && frozen === thawing) window.setTimeout(unfreeze, 120)
        })
        .catch(() => {
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
    // The stage resized (a divider between panels dragged, a panel's edge, a bar above it):
    // the live picture follows it every frame. Ferrocast's own engine draws each frame at the
    // view's new size, so the picture keeps playing and the vertical one stays beside it
    // (owner's recording, 10 Nov: a still stood in during the drag, the timer stopped and the
    // vertical picture vanished; that still was for libobs, which left black strips).
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    if (stageRef.current) ro.observe(stageRef.current)
    if (programRef.current) ro.observe(programRef.current)
    if (vStageRef.current) ro.observe(vStageRef.current)
    if (vRef.current) ro.observe(vRef.current)
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
    // The edit overlays (marquee, group box, guides) move by style alone.
    window.addEventListener(HOLES_CHANGED, schedule)
    // Straight away when hidden: a hidden page gets no animation frames.
    const onVisible = () => (document.hidden ? send() : schedule())
    document.addEventListener('visibilitychange', onVisible)
    // A moved stage that changed no size and fired nothing above (a panel landing elsewhere,
    // a bar above it growing) would leave the picture where it was, over the panels (owner,
    // 29 Oct): looked at again now and then. Unchanged, nothing is sent.
    const watch = window.setInterval(() => !document.hidden && schedule(), 500)
    // While a panel is dragged the live picture can't stay (the drop zones are drawn over the
    // stage): a still of it shows in its place, as for a window resize, rather than a grey box
    // (owner's recording, 29 Oct). The live one comes back where the stage ends up.
    let dragging = false
    const dockWatch = new MutationObserver(() => {
      const on = !!document.body.dataset.dockDrag
      if (on && !dragging) {
        dragging = true
        resizing = Infinity
        if (!frozen) freeze()
      } else if (!on && dragging) {
        dragging = false
        resizing = 0
        last = ''
        schedule()
      }
    })
    dockWatch.observe(document.body, { attributes: true, attributeFilter: ['data-dock-drag'] })
    const resize = () => {
      if (!frozen) freeze()
      resizing = performance.now() + 180
      schedule()
    }
    const onResize = () => {
      if (!follows) return resize()
      window.clearTimeout(settle)
      // Placed exactly once the window stops (the app leaves the page's boxes out meanwhile).
      settle = window.setTimeout(() => {
        last = ''
        schedule()
      }, 320)
      schedule()
    }
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.clearTimeout(again)
      window.clearTimeout(settle)
      window.clearInterval(watch)
      dockWatch.disconnect()
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener(HOLES_CHANGED, schedule)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('resize', onResize)
      unfreeze()
      void put(null, null, null).catch(() => undefined)
    }
  }, [api, running, desktop, studio, tall])
  // The picture being edited takes the pointer; a press on the other one picks it instead.
  const onTall = tall && canvas === 'vertical'
  // The zoom, and where the zoomed canvas sits against the stage's centre (clamped so Fit stays
  // centred and never carries a stale pan offset after a resize or zoom-out).
  const pan = stage
    ? clampPan(pv.pan, zoomBoundsPan(pv.zoom, fitBoxSize(stage.width, stage.height), stage))
    : pv.pan
  const [panX, panY] = pan
  const boxStyle = {
    '--fc-zoom': pv.zoom,
    ...(panX || panY ? { transform: `translate(${panX}px, ${panY}px)` } : {}),
  } as CSSProperties
  // Re-sync native preview rects immediately when zoom, pan, or split view changes CSS transforms.
  useEffect(() => {
    if (running && desktop) window.dispatchEvent(new Event(HOLES_CHANGED))
  }, [running, desktop, pv.zoom, panX, panY, pv.view])
  const editing = useStageEdit(onTall ? vRef : ref, running && desktop)
  const screen = cx(
    // Square like the picture the app draws on it. In the app the picture covers it, so it's
    // left clear: if the page lags the window for a moment, the stage shows, never a black box.
    'relative grid aspect-video touch-none place-items-center p-4 text-center text-[14px] text-[#9aa1ac] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent',
    desktop && running ? 'bg-transparent' : 'bg-[#0a0b0d]',
  )
  if (tall) {
    // The wide picture and the tall one side by side (as OBS with a vertical canvas), nothing
    // above them (owner's pick P2), both at full brightness (owner, 28 Oct): a press on the
    // one not being edited picks it.
    const pick = (c: 'main' | 'vertical') => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        setCanvas(c)
      },
    })
    const label = (c: 'main' | 'vertical', on: boolean) =>
      `${c === 'main' ? 'Wide' : 'Vertical'} picture. ${
        on
          ? 'Click a source to pick it, drag to move it, drag a handle to resize it, arrow keys nudge it.'
          : 'Click to edit it.'
      }`
    const stageClass =
      'grid min-h-0 touch-none overscroll-contain grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-[var(--fc-stage)] p-3 outline-none select-none [container-type:size] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset'
    // One picture on its own (owner's pick X1): the other stage is hidden, so the app is told
    // to draw nothing for it, and the one shown fills the stage.
    const only = pv.view === 'both' ? null : pv.view
    return (
      <div className="flex min-h-16 flex-1 gap-px bg-line [container-type:size]">
        <div
          ref={stageRef}
          role="group"
          aria-label={label('main', !onTall)}
          data-stage-bg
          hidden={only === 'vertical'}
          className={cx(stageClass, 'min-w-0 flex-1', onTall && 'cursor-pointer')}
          {...(onTall ? pick('main') : editing)}
        >
          <div
            ref={ref}
            data-canvas-box
            style={boxStyle}
            className={cx(screen, 'w-[calc(min(100cqw,100cqh*16/9)*var(--fc-zoom))]')}
          >
            {!desktop && 'The live picture shows in the Ferrocast app.'}
            <PausedCard />
            <GuideOverlay safe={pv.safe} />
            <OverflowMask on={pv.overflow === 'hide'} />
            <EditHints boxRef={ref} active={!onTall} />
          </div>
        </div>
        <div
          ref={vStageRef}
          role="group"
          aria-label={label('vertical', onTall)}
          data-stage-bg
          hidden={only === 'wide'}
          className={cx(
            stageClass,
            // The tall picture as tall as the stage (owner, 28 Oct: not shrunk), with room on
            // its sides where what's off its canvas shows with its outline.
            only === 'vertical'
              ? 'min-w-0 flex-1 px-0! py-1.5!'
              : 'w-[calc(100cqh*9/16*1.3)] max-w-[45%] flex-none px-0! py-1.5!',
            !onTall && 'cursor-pointer',
          )}
          {...(onTall ? editing : pick('vertical'))}
        >
          <div ref={vRef} className={cx(screen, 'aspect-[9/16]! w-[min(100cqw,100cqh*9/16)] p-0!')}>
            {!desktop && 'Vertical'}
            <PausedCard compact />
            <GuideOverlay safe={pv.safe} />
            <EditHints boxRef={vRef} active={onTall} />
          </div>
        </div>
      </div>
    )
  }
  if (!studio)
    // The canvas is an exact 16:9 box fitted inside the stage (smaller when zoomed out), with
    // room around it for what's off the canvas. The whole stage takes clicks: a handle can be
    // grabbed outside the canvas.
    return (
      <div
        ref={stageRef}
        aria-label="Studio preview. Click a source to pick it, drag to move it, drag a handle to resize it, arrow keys nudge it."
        data-stage-bg
        className="grid min-h-16 flex-1 touch-none overscroll-contain grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-[var(--fc-stage)] p-3 outline-none select-none [container-type:size] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        {...editing}
      >
        <div
          ref={ref}
          data-canvas-box
          style={boxStyle}
          className={cx(screen, 'w-[calc(min(100cqw,100cqh*16/9)*var(--fc-zoom))]')}
        >
          {!desktop && 'The live picture shows in the Ferrocast app.'}
          <PausedCard />
          <GuideOverlay safe={pv.safe} />
          <OverflowMask on={pv.overflow === 'hide'} />
          <EditHints boxRef={ref} active />
        </div>
      </div>
    )
  // Studio Mode (owner's pick B, 11 Nov): the two pictures side by side as big as they fit,
  // every control in one bar under them. The app's view of each reaches EDGE (10) past its
  // box for the handles, so everything round a box keeps at least that clear: 24 between the
  // two, 12 to the label above and to the bar below (owner's recording, 11 Nov: the picture
  // ran over the bar and each other). Widths take off the 24 of padding and the 24 between;
  // heights the padding, the label (18), its gap and the bar (40).
  const half = 'w-[min(calc((100cqw-48px)/2),calc((100cqh-100px)*16/9))]'
  return (
    <div
      data-stage-bg
      className="flex min-h-16 flex-1 flex-col bg-[var(--fc-stage)] [container-type:size]"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center gap-6 p-3">
        <figure className="m-0 flex flex-col gap-3">
          <figcaption className="flex items-center gap-1.5 text-[12.5px] font-bold text-text-2">
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
            <EditHints boxRef={ref} active />
            <PausedCard compact />
          </div>
        </figure>
        <figure className="m-0 flex flex-col gap-3">
          <figcaption className="flex items-center gap-1.5 text-[12.5px] font-bold text-danger">
            <span aria-hidden className="size-[7px] rounded-full bg-danger-fill" />
            On air: {scenes.data?.current}
          </figcaption>
          <div ref={programRef} aria-label="What's on air" className={cx(screen, half)}>
            <PausedCard compact />
          </div>
        </figure>
      </div>
      <SwitchBar />
    </div>
  )
}

/** Turns the vertical picture on (a tall canvas with scenes of its own, beside the wide one),
 * or, when it's on, offers to take it away (its scenes go, so it asks first). */
/** The canvases' own shapes, drawn small: the view toggle's icons. */
function Shapes({ wide, tall }: { wide: boolean; tall: boolean }) {
  const both = wide && tall
  return (
    <span aria-hidden className="flex items-center gap-[2px]">
      {wide && (
        <span
          className={cx(
            'block rounded-[2px] border-[1.6px] border-current',
            both ? 'h-2 w-[11px]' : 'h-2.5 w-[15px]',
          )}
        />
      )}
      {tall && (
        <span
          className={cx(
            'block rounded-[2px] border-[1.6px] border-current',
            both ? 'h-2.5 w-1.5' : 'h-3 w-[7px]',
          )}
        />
      )}
    </span>
  )
}

/**
 * Which pictures the stage shows while the vertical one is on: wide only, both side by side,
 * or vertical only (owner's pick X1: right after the Vertical button). Showing one picks it
 * for editing too.
 */
function PictureViewPick() {
  const { scenes, setCanvas } = useDesk()
  const [pv, setPv] = usePreviewView()
  const on = !!scenes.data?.vertical && !scenes.data?.preview
  // One picture on its own is the one being edited.
  useEffect(() => {
    if (on && pv.view !== 'both') setCanvas(pv.view === 'wide' ? 'main' : 'vertical')
  }, [on, pv.view, setCanvas])
  if (!on) return null
  const name: Record<PictureView, string> = {
    wide: 'Wide picture only',
    both: 'Both pictures',
    vertical: 'Vertical picture only',
  }
  return (
    <div role="group" aria-label="Pictures shown" className="flex items-center gap-0.5">
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          title={name[v]}
          aria-label={name[v]}
          aria-pressed={pv.view === v}
          onClick={() => setPv({ view: v })}
          className={cx(
            'grid size-[26px] place-items-center rounded-[5px] outline-none focus-visible:shadow-[var(--fc-focus)]',
            pv.view === v
              ? 'bg-accent-soft text-accent-text'
              : 'text-text-2 hover:bg-surface-3 hover:text-text',
          )}
        >
          <Shapes wide={v !== 'vertical'} tall={v !== 'wide'} />
        </button>
      ))}
    </div>
  )
}

function VerticalToggle() {
  const { api, scenes, refresh, setCanvas } = useDesk()
  const { run, busy } = useAction()
  const on = !!scenes.data?.vertical
  // Studio Mode is the main picture's: the vertical one waits until it's off.
  if (scenes.data?.preview) return null
  // On and off, nothing more to it: off keeps its scenes and sources for next time (owner,
  // 28 Oct: they were removed with it).
  const flip = () =>
    void run('vertical', () => done(on ? api.stopVertical() : api.startVertical('Vertical')), {
      success: on ? 'Vertical picture off. Its scenes are kept.' : 'Vertical picture on.',
    }).then((ok) => {
      if (!ok) return
      setCanvas(on ? 'main' : 'vertical')
      refresh()
    })
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-pressed={on}
      busy={busy === 'vertical'}
      title={
        on
          ? 'Turn the vertical picture off (its scenes are kept)'
          : 'A vertical picture for Shorts, TikTok and Reels'
      }
      className={cx('gap-1.5', on ? 'bg-accent-soft! text-accent-text!' : 'text-text-2')}
      onClick={flip}
    >
      <DeviceMobile size={16} weight={on ? 'fill' : 'bold'} />
      Vertical
    </Button>
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
function SwitchBar() {
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
  // One 40px bar under the two pictures: quick transitions, the T-bar, swap, black, options,
  // and Transition at the end, where the eye lands. Set apart from the panels (owner's pick S2,
  // 11 Nov): a line along the top from Preview's blue to On air's red, each end tinted by its
  // side, as the pictures above.
  return (
    <div
      className="relative flex h-10 flex-none items-center gap-2 px-2.5 before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-[linear-gradient(90deg,var(--fc-arc),var(--fc-danger))] before:content-['']"
      style={{
        background:
          'linear-gradient(90deg, var(--fc-accent-soft) 0%, transparent 45%, transparent 55%, var(--fc-danger-soft) 100%), var(--fc-surface-1)',
      }}
    >
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {quick.map((q, i) => (
          <Button
            key={`${q.kind}-${q.ms}-${i}`}
            variant="outline"
            size="xs"
            className="shrink-0"
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
            size="xs"
            label="Add a quick transition"
            className="shrink-0"
            onClick={adding}
          >
            <Plus size={14} weight="bold" />
          </IconButton>
        )}
      </div>
      <span aria-hidden className="h-5 w-px flex-none bg-line-strong" />
      <div className="w-[min(220px,22%)] min-w-24 flex-none">
        <TBar />
      </div>
      <span className="flex-1" />
      <IconButton
        size="xs"
        label="Swap the preview and what's on air"
        onClick={() => void run('swap', () => done(api.swapScenes())).then((ok) => ok && refresh())}
      >
        <ArrowsLeftRight size={15} weight="bold" />
      </IconButton>
      <IconButton
        size="xs"
        label={black ? 'Fade back from black' : 'Fade to black'}
        aria-pressed={black}
        className={cx(black && 'bg-danger-fill text-white hover:bg-danger-fill')}
        onClick={() =>
          void run('black', () => done(api.fadeToBlack())).then((ok) => ok && refresh())
        }
      >
        <MoonStars size={15} weight={black ? 'fill' : 'bold'} />
      </IconButton>
      <IconButton size="xs" label="Studio Mode options" onClick={optionsMenu}>
        <DotsThree size={16} weight="bold" />
      </IconButton>
      <Button
        variant="primary"
        size="xs"
        className="flex-none"
        busy={busy === 'go'}
        onClick={() => go()}
      >
        <ArrowFatRight size={14} weight="fill" /> Transition
      </Button>
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
          hint: i === 0 ? shortcut('Z') : undefined,
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

const cropOf = (t: EngineTransform): Crop => ({
  left: t.crop_left,
  top: t.crop_top,
  right: t.crop_right,
  bottom: t.crop_bottom,
})

interface AfterCropBox {
  wait: Promise<void>
  compute: (base: Frame) => Box
  fallback: Box
  getBase: () => Frame | null
  computeBoxes?: () => BoxFor[]
}

/** A drag in the preview: the item, the box and pointer it started from, and the handle. */
interface Held {
  id: number
  scene: string
  from: Frame
  start: Pt
  grip: Grip
  /** The pointer moved enough to count as a drag (a click only picks). */
  moved: boolean
  last: Box | null
  /** Other sources picked with it, moved by the same amount (OBS's multi-select). */
  others: { id: number; from: Frame; cropAfter?: Held | null }[]
  /** Alt held on a handle: cropping, from the initial crop and source size once read. */
  crop: { from: Crop; size: { width: number; height: number } } | null | 'reading'
  cropRead?: Promise<EngineTransform | null>
  cropSettled?: Promise<void>
  cropDone?: () => void
  cropComplete?: boolean
  cropSeq?: number
  settledFrame?: Frame | null
  cropAfter?: Held | null
  lastAfterCrop?: AfterCropBox | null
  lastDelta: Pt | null
  lastCrop: Crop | null
  revertTo?: Crop | null
  postShift: Pt
  aborted: boolean
  /** A handle of the box round several picked sources: they are sized together, from these. */
  group?: { items: { id: number; frame: Frame; locked: boolean }[]; rect: Rect }
  /** The boxes of the last step of a group drag, for the step that saves. */
  lastBoxes?: BoxFor[]
}

/** What the next request for a source does (the newest replaces an older one). Several at once
 * (`boxes`) are one request, one undo step. */
type JobBody =
  | { box: Box; save: boolean }
  | { afterCrop: AfterCropBox; id?: number; ids?: number[]; save: boolean }
  | { crop: Crop; id?: number; save: boolean }
  | { pendingCrop: Held; id: number; save: boolean }
  | { boxes: BoxFor[]; save: boolean }

/** A request waiting its turn: for which scene (the picked one may change before it is sent),
 * and for which source when it is a single one. */
type Job = JobBody & { scene: string; id?: number }

/** A queue key is per scene: a nudge in the new scene never replaces one for the old. */
const queueKey = (scene: string, key: number | string) => `${scene}\u0001${key}`

/**
 * Key of the one request for several sources: the set of them, so a final batch for A and B is
 * never replaced by a later drag of C and D (a source's own key is its number).
 */
const manyKey = (boxes: BoxFor[]) =>
  `many:${boxes
    .map((b) => b.id)
    .sort((a, b) => a - b)
    .join(',')}`

/**
 * Pick, move and resize sources in the preview, as in OBS: click picks (the engine outlines
 * it), ⌘-click (Ctrl on Windows) picks more, drag moves every picked source, the handles
 * resize (corners keep the shape unless Shift is held; every handle does while the frame lock
 * is on), Alt on a handle crops instead, it
 * snaps to the canvas's edges unless Alt is held, arrow keys nudge. A source inside a group
 * moves on its own once picked (in Sources, or by pressing inside it when picked); a click
 * on it picks its group, as in OBS.
 */
export function useStageEdit(ref: React.RefObject<HTMLDivElement | null>, on: boolean) {
  const {
    api,
    scene,
    items,
    selected,
    select,
    also,
    pickMore,
    pickSet,
    setTransforming,
    prefs,
    itemMenu,
    size,
    canvas: pictureCanvas,
    scenes,
  } = useDesk()
  const { run } = useAction()
  const p = prefs.data
  // The edited picture's size (the vertical one's while it's picked).
  const canvas = size
  const [pv] = usePreviewView()
  const held = useRef<Held | null>(null)
  // A box dragged on empty canvas to pick every source it touches.
  const marquee = useRef<{
    start: Pt
    mode: 'replace' | 'add' | 'toggle'
    base: number[]
    moved: boolean
  } | null>(null)
  // Panning (space + drag, or the middle button) and pinching (two touches) the zoomed canvas.
  const panning = useRef<{ x: number; y: number; pan: [number, number] } | null>(null)
  const space = useRef(false)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    dist: number
    zoom: number
    pan: [number, number]
    mid: [number, number]
  } | null>(null)
  // Every source's outline shows while the pointer is over the preview (as OBS's hover
  // outlines), and goes when it leaves: a click elsewhere leaves only what's picked.
  const [over, setOver] = useState(false)
  const stageEl = useRef<HTMLDivElement | null>(null)
  const lastPointer = useRef<{ clientX: number; clientY: number; pointerType?: string } | null>(
    null,
  )
  const altHeld = useRef(false)
  const refreshCursorRef = useRef<(alt: boolean) => void>(() => undefined)
  const pendingCrops = useRef(new Map<string, Held>())
  const pendingFrames = useRef(new Map<string, Frame>())
  const cropSeq = useRef(0)
  const sending = useRef<{ busy: boolean; next: Map<string, Job> }>({
    busy: false,
    next: new Map(),
  })
  // Mac: the picture is a native view over the page, and AppKit puts the arrow back over it
  // whenever it redoes its cursor areas (the view resized, a menu's hole cut in it…), while
  // WebKit only sets a cursor when the page's changes, so a resize cursor could stay an arrow
  // (owner, 12 Nov). The app keeps the page's cursor on the view itself; Windows gets it from
  // the input the app plays on the page instead.
  // 'default' (the API takes a name, never ""): the app leaves the cursor to the page.
  const native = useRef('default')
  const tellNative = (css: string) => {
    const c = css || 'default'
    if (!on || picturesTakeMouse() || native.current === c) return
    native.current = c
    void api.previewCursor(c).catch(() => undefined)
  }
  useEffect(() => {
    if (!on) return
    return () => {
      if (native.current !== 'default') void api.previewCursor('default').catch(() => undefined)
      native.current = 'default'
    }
  }, [api, on])

  // The engine outlines whatever is picked here or in the Sources panel (and, with frames on,
  // every source in its own colour).
  const alsoKey = also.join(',')
  useEffect(() => {
    if (!on) return
    const frames = pv.frames && over
    const pickNone = selected === null && !frames
    const more = alsoKey ? alsoKey.split(',').map(Number) : []
    void api
      .select(pickNone ? null : { scene, id: selected, frames, also: more })
      .catch(() => undefined)
  }, [api, on, scene, selected, alsoKey, pv.frames, over])
  useEffect(() => {
    if (!on) return
    return () => void api.select(null).catch(() => undefined)
  }, [api, on])

  const list = items.data ?? []
  // Sources inside groups too: a picked one is found, moved and nudged like any other.
  const flat = list.flatMap((i) => [i, ...i.children])
  const where = (e: { clientX: number; clientY: number; pointerType?: string }) => {
    const el = ref.current
    if (!el || !canvas) return null
    const r = el.getBoundingClientRect()
    const f = fit(r, canvas)
    if (!(f.scale > 0)) return null
    return {
      p: { x: (e.clientX - r.left - f.ox) / f.scale, y: (e.clientY - r.top - f.oy) / f.scale },
      // Handles are 10 screen pixels; a little more is easier to grab.
      // A finger needs more: 22 px each way is a 44 px target.
      reach: (e.pointerType === 'touch' ? 22 : 9) / f.scale,
      least: 9 / f.scale,
      // Three screen pixels before a press becomes a drag.
      still: 3 / f.scale,
      // OBS's Snapping: how near (screen pixels), off when switched off.
      snap: p?.snapping === false ? 0 : snapReach(p?.snap_px ?? 10, f.scale),
    }
  }

  const put = (item: Pick<EngineItem, 'id' | 'frame'>) =>
    items.set((prev) =>
      (prev ?? []).map((i) => {
        const one = (x: EngineItem) =>
          x.id === item.id && item.frame ? { ...x, frame: item.frame } : x
        return { ...one(i), children: i.children.map(one) }
      }),
    )

  useEffect(() => {
    if (!sending.current.busy && sending.current.next.size === 0) {
      pendingFrames.current.clear()
    }
  }, [items.data, scene, on])

  // One request on the way at a time; for each source the newest waits and replaces older ones.
  const sceneNow = useRef(scene)
  sceneNow.current = scene
  const pump = () => {
    const q = sending.current
    if (q.busy) return
    const first = q.next.entries().next()
    if (first.done) return
    const [key, job] = first.value
    q.next.delete(key)
    q.busy = true
    // To the scene it was asked for in, whichever is picked by now.
    const execute = async (): Promise<EngineItem | EngineItem[]> => {
      if ('boxes' in job) {
        return api.setItemBoxes(job.scene, { items: job.boxes, save: job.save })
      }
      if ('box' in job) {
        return api.setItemBox(job.scene, job.id ?? 0, { ...job.box, save: job.save })
      }
      if ('afterCrop' in job) {
        await job.afterCrop.wait
        if (job.afterCrop.computeBoxes) {
          return api.setItemBoxes(job.scene, {
            items: job.afterCrop.computeBoxes(),
            save: job.save,
          })
        }
        const base = job.afterCrop.getBase()
        const box = base ? job.afterCrop.compute(base) : job.afterCrop.fallback
        return api.setItemBox(job.scene, job.id ?? 0, { ...box, save: job.save })
      }
      if ('pendingCrop' in job) {
        const pc = job.pendingCrop
        const k = queueKey(job.scene, pc.id)
        const drainShift = async (startFrame: Frame): Promise<EngineItem | EngineItem[] | null> => {
          let latest = startFrame
          let res: EngineItem | EngineItem[] | null = null
          while (pc.postShift.x !== 0 || pc.postShift.y !== 0) {
            const sx = pc.postShift.x
            const sy = pc.postShift.y
            pc.postShift.x = 0
            pc.postShift.y = 0
            const b = boxOf(latest)
            const shifted: Frame = [
              latest[0],
              latest[1],
              latest[2],
              latest[3],
              latest[4] + sx,
              latest[5] + sy,
            ]
            pendingFrames.current.set(k, shifted)
            if (job.scene === sceneNow.current && !queuedIds(sending.current.next).has(pc.id)) {
              put({ id: pc.id, frame: shifted })
            }
            const moved = await api.setItemBox(job.scene, pc.id, {
              ...b,
              x: b.x + sx,
              y: b.y + sy,
              save: true,
            })
            latest = moved.frame ?? shifted
            res = moved
          }
          pc.settledFrame = latest
          pendingFrames.current.set(k, latest)
          return res
        }
        try {
          let next: Crop | null = pc.revertTo ?? null
          if (!next) {
            const t = await (pc.cropRead ?? Promise.resolve(null))
            if (!t || pc.aborted || !pc.lastDelta) {
              return (await drainShift(pc.from)) ?? []
            }
            next = cropDrag(pc.from, pc.grip, pc.lastDelta, cropOf(t), {
              width: t.width,
              height: t.height,
            })
            pc.lastCrop = next
          }
          let cropped: EngineItem
          try {
            cropped = await api.setItemCrop(job.scene, pc.id, { ...next, save: true })
          } catch (err) {
            // Do not silently drop keyboard nudges queued while the crop request was in flight.
            if (pc.postShift.x !== 0 || pc.postShift.y !== 0) {
              await drainShift(pc.from).catch(() => undefined)
            } else {
              pc.settledFrame = pc.from
              pendingFrames.current.set(k, pc.from)
            }
            throw err
          }
          const shifted = await drainShift(cropped.frame ?? pc.from)
          return shifted ?? cropped
        } finally {
          pc.cropComplete = true
          if (pendingCrops.current.get(k) === pc) pendingCrops.current.delete(k)
          pc.cropDone?.()
        }
      }
      return api.setItemCrop(job.scene, job.id ?? 0, { ...job.crop, save: job.save })
    }
    const go = execute()
    const done = job.save ? run('move', () => go) : go.catch(() => undefined)
    void done
      .then((res) => {
        // Not for another scene's list, and not over a source that has a newer move waiting (the
        // screen already shows that one: this answer is older than what the user did since).
        if (job.scene !== sceneNow.current) return
        const waiting = queuedIds(sending.current.next)
        for (const item of Array.isArray(res) ? res : res ? [res] : []) {
          if (!waiting.has(item.id)) {
            pendingFrames.current.delete(queueKey(job.scene, item.id))
            put(item)
          }
        }
      })
      .finally(() => {
        q.busy = false
        if (q.next.size === 0) pendingFrames.current.clear()
        pump()
      })
  }
  const queue = (key: number | string, job: JobBody, forScene = scene) => {
    const q = sending.current
    const k = queueKey(forScene, key)
    // A newer request replaces an older one for the same source(s), keeping a save; requests
    // that overlap are sent in the order they were made.
    enqueueJob(q.next, k, {
      ...job,
      scene: forScene,
      ...(typeof key === 'number' ? { id: key } : {}),
    })
    pump()
  }
  const send = (id: number, b: Box, save: boolean, forScene = scene) =>
    queue(id, { box: b, save }, forScene)

  const frameOf = (id: number | null) => flat.find((i) => i.id === id)?.frame ?? null
  const pickedIds = [selected, ...also].filter((id): id is number => id !== null)

  // Where every source of the drag goes: the held one by the drag, the others by as much. Several
  // go in one request, so the whole drag is one undo step.
  const moveAll = (h: Held, b: Box, save: boolean) => {
    if (h.others.length === 0) return send(h.id, b, save, h.scene)
    const dx = b.x - h.from[4]
    const dy = b.y - h.from[5]
    const boxes: BoxFor[] = [{ id: h.id, ...b }]
    for (const o of h.others) {
      const ob = boxOf(o.from)
      boxes.push({ id: o.id, ...ob, x: ob.x + dx, y: ob.y + dy })
    }
    queue(manyKey(boxes), { boxes, save }, h.scene)
  }
  const settledFrameFor = (
    forScene: string,
    id: number,
    ca: Held | null | undefined,
    fallbackFrame: Frame,
  ): Frame =>
    (ca?.cropComplete ? ca.settledFrame : null) ??
    pendingFrames.current.get(queueKey(forScene, id)) ??
    fallbackFrame

  const pendingDragCrops = (h: Held): Promise<void>[] =>
    [h.cropAfter, ...h.others.map((o) => o.cropAfter)].flatMap((c) =>
      c?.cropSettled && !c.cropComplete ? [c.cropSettled] : [],
    )

  const afterCropIds = (h: Held): number[] => [h.id, ...h.others.map((o) => o.id)]

  const shiftedBoxesAfterCrop = (h: Held, dx: number, dy: number): BoxFor[] => {
    const hb = boxOf(settledFrameFor(h.scene, h.id, h.cropAfter, h.from))
    return [
      { id: h.id, ...hb, x: hb.x + dx, y: hb.y + dy },
      ...h.others.map((o) => {
        const ob = boxOf(settledFrameFor(h.scene, o.id, o.cropAfter, o.from))
        return { id: o.id, ...ob, x: ob.x + dx, y: ob.y + dy }
      }),
    ]
  }

  const enqueueFinalCrop = (h: Held, revertTo?: Crop) => {
    const k = queueKey(h.scene, h.id)
    pendingCrops.current.set(k, h)
    // Drop any unsent save:false live-drag crop so only the final save:true commit executes.
    const moveKey = queueKey(h.scene, `crop:${h.id}`)
    const staleMove = sending.current.next.get(moveKey)
    if (staleMove && !staleMove.save) sending.current.next.delete(moveKey)
    if (revertTo) h.revertTo = revertTo
    const seq = (h.cropSeq ??= ++cropSeq.current)
    queue(`crop:${h.id}:${seq}`, { pendingCrop: h, id: h.id, save: true }, h.scene)
  }

  const finish = (h: Held | null) => {
    clearHints()
    if (!h?.moved) {
      if (h?.cropDone) {
        h.cropComplete = true
        h.cropDone()
      }
      return
    }
    if (h.crop === 'reading' || h.lastCrop) {
      enqueueFinalCrop(h)
      return
    }
    if (h.lastAfterCrop) {
      if (h.lastAfterCrop.computeBoxes) {
        const ids = afterCropIds(h)
        queue(
          manyKey(ids.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0 }))),
          { afterCrop: h.lastAfterCrop, ids, save: true },
          h.scene,
        )
      } else {
        queue(h.id, { afterCrop: h.lastAfterCrop, save: true }, h.scene)
      }
    } else if (h.group && h.lastBoxes)
      queue(manyKey(h.lastBoxes), { boxes: h.lastBoxes, save: true }, h.scene)
    else if (h.last) moveAll(h, h.last, true)
  }

  // Cancel what is being dragged (Escape, a second finger starting a pinch): every source goes
  // back to where the drag found it, and what was in the air (hints, the marquee) goes.
  const abortDrag = () => {
    clearHints()
    marquee.current = null
    const h = held.current
    held.current = null
    if (!h) return
    h.aborted = true
    if (!h.moved) {
      h.cropDone?.()
      return
    }
    // A crop goes back to the crop the drag started with (nothing read yet: nothing changed).
    if (h.crop || h.lastCrop) {
      const original = revertCrop(h.crop)
      if (original && h.lastCrop) enqueueFinalCrop(h, original)
      else {
        h.cropComplete = true
        h.cropDone?.()
      }
      return
    }
    const waits = pendingDragCrops(h)
    if (waits.length > 0 && !h.group) {
      const wait = Promise.all(waits).then(() => undefined)
      if (h.others.length === 0) {
        const only = boxOf(h.from)
        queue(
          h.id,
          {
            afterCrop: {
              wait,
              compute: (base) => boxOf(base),
              fallback: only,
              getBase: () => settledFrameFor(h.scene, h.id, h.cropAfter, h.from),
            },
            save: true,
          },
          h.scene,
        )
      } else {
        const ids = afterCropIds(h)
        const only = boxOf(h.from)
        queue(
          manyKey(ids.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0 }))),
          {
            afterCrop: {
              wait,
              compute: (base) => boxOf(base),
              fallback: only,
              getBase: () => settledFrameFor(h.scene, h.id, h.cropAfter, h.from),
              computeBoxes: () => shiftedBoxesAfterCrop(h, 0, 0),
            },
            ids,
            save: true,
          },
          h.scene,
        )
      }
      return
    }
    const boxes = revertBoxes(h)
    const only = boxes[0]
    if (boxes.length === 1 && only) send(h.id, only, true, h.scene)
    else queue(manyKey(boxes), { boxes, save: true }, h.scene)
  }
  // The scene changed, or the editor went away, with a drag in the air: it is cancelled in the
  // scene it was made in (the queue remembers it), so no frozen guides or half drag are left.
  useEffect(() => abortDrag, [scene, on]) // eslint-disable-line react-hooks/exhaustive-deps

  // The picked sources that can be moved together, and the one box round them: where the
  // handles are, what the group moves and is sized by.
  const pg = pickedGroup(list, pickedIds)
  const together = pg.members.flatMap((i) =>
    i.frame ? [{ id: i.id, frame: i.frame, locked: i.locked }] : [],
  )
  const groupRect = !pv.locked ? pg.rect : null
  const groupFrame = (r: Rect): Frame => [r.right - r.left, 0, 0, r.bottom - r.top, r.left, r.top]
  // What snapping reaches for while these are dragged, from the settings: the canvas's edges and
  // middle and other sources' edges and middles.
  const snapOpts = {
    screen: p?.snap_screen ?? true,
    centre: p?.snap_center ?? true,
    others: p?.snap_sources ?? true,
  }
  // The guide lines and the distances to the nearest neighbours for a box now at `r`.
  const showHints = (r: Rect, moving: number[], enabled: boolean) => {
    if (!enabled || !canvas) return clearHints()
    const targets = snapTargets(list, moving)
    setHints({
      owner: ref.current,
      guides: guidesFor(r, targets, canvas, snapOpts),
      // The distances are to other sources: with snapping to sources off there are none.
      gaps: snapOpts.others ? gapsFor(r, targets) : [],
      marquee: null,
    })
  }

  const hoverCursorAt = (w: { p: Pt; reach: number; least: number }, alt: boolean) => {
    if (space.current) return { css: 'grab', native: 'grab' }
    if (pv.locked) {
      const hit = pick(list, w.p) ? 'pointer' : ''
      return { css: hit, native: hit }
    }
    const f = frameOf(selected)
    const g = f ? gripAt(f, w.p, w.reach, w.least) : null
    // The box round several picked has handles and a middle that moves it.
    const gf = groupRect ? groupFrame(groupRect) : null
    const gg = gf && !alt ? gripAt(gf, w.p, w.reach, w.least) : null
    if (gf && gg) {
      const css = cursorFor(gf, gg)
      return { css, native: css }
    }
    if (g && g.u >= 0 && f) {
      return { css: cropCursorFor(f, g, alt), native: cursorFor(f, g) }
    }
    if (gf && inside(gf, w.p) && !pick(list, w.p)) {
      return { css: 'move', native: 'move' }
    }
    if ((f && inside(f, w.p)) || g) {
      return { css: 'move', native: 'move' }
    }
    const overAny = pick(list, w.p) ? 'pointer' : ''
    return { css: overAny, native: overAny }
  }

  refreshCursorRef.current = (alt: boolean) => {
    altHeld.current = alt
    if (
      held.current ||
      panning.current ||
      marquee.current ||
      !lastPointer.current ||
      !stageEl.current
    )
      return
    const w = where(lastPointer.current)
    if (!w) return
    const cur = hoverCursorAt(w, alt)
    stageEl.current.style.cursor = cur.css
    tellNative(cur.native)
  }

  useEffect(() => {
    if (!on) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey !== altHeld.current) {
        refreshCursorRef.current(e.altKey)
      }
    }
    const onWindowBlur = () => {
      space.current = false
      refreshCursorRef.current(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [on])

  if (!on || !canvas) return {}
  return {
    tabIndex: 0,
    onPointerEnter: (e: PointerEvent<HTMLDivElement>) => {
      stageEl.current = e.currentTarget
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      }
      setOver(true)
      refreshCursorRef.current(e.altKey)
    },
    onPointerLeave: () => {
      if (!held.current) {
        setOver(false)
        lastPointer.current = null
      }
      tellNative('')
    },
    // Right-click: the Sources panel's menu for what's under the pointer, as in OBS (never the
    // web view's own Reload / Inspect menu).
    onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const w = where(e)
      if (!w) return
      const current = flat.find((i) => i.id === selected)
      const target =
        (current?.frame && current.visible && inside(current.frame, w.p) ? current : null) ??
        flat.find((i) => also.includes(i.id) && i.visible && i.frame && inside(i.frame, w.p)) ??
        pick(list, w.p) ??
        // Empty space inside the box round several picked: their menu (Group, Align, Space out),
        // not the empty canvas's.
        (groupRect && inside(groupFrame(groupRect), w.p)
          ? flat.find((i) => i.id === together[0]?.id)
          : null)
      itemMenu.current?.(e, target?.id ?? null)
    },
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      stageEl.current = e.currentTarget
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      }
      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.current.size === 2) {
          // A second finger: zoom and pan, not a drag of a source (that goes back where it was
          // picked up, saved, not left half moved), nor a box being dragged round some (its
          // points are the old view's).
          abortDrag()
          const [a, b] = [...touches.current.values()] as [
            { x: number; y: number },
            { x: number; y: number },
          ]
          const v = getPreviewView()
          pinch.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom: v.zoom,
            pan: displayedPan(v),
            mid: pointerFromCentre(e.currentTarget, (a.x + b.x) / 2, (a.y + b.y) / 2),
          }
          return
        }
      }
      if (e.button === 1 || (e.button === 0 && space.current)) {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        panning.current = { x: e.clientX, y: e.clientY, pan: displayedPan() }
        e.currentTarget.style.cursor = 'grabbing'
        return
      }
      if (e.button !== 0) return
      const w = where(e)
      if (!w) return
      // The element that takes the keys (the stage), not the inner box, which isn't focusable.
      e.currentTarget.focus({ preventScroll: true })
      // ⌘-click (Ctrl on Windows) picks or unpicks one more, as in OBS.
      // On empty canvas it starts a box to pick several (⌘/Ctrl toggles, Shift adds).
      const startMarquee = (mode: 'replace' | 'add' | 'toggle') => {
        e.currentTarget.setPointerCapture(e.pointerId)
        marquee.current = { start: w.p, mode, base: pickedIds, moved: false }
      }
      if (addsToPick(e)) {
        const t = pick(list, w.p)
        if (t) pickMore(t.id, 'toggle')
        else startMarquee('toggle')
        return
      }
      // The box round several picked sources: its handles size them together.
      if (groupRect && !e.altKey) {
        const g = gripAt(groupFrame(groupRect), w.p, w.reach, w.least)
        if (g && g.u >= 0) {
          e.currentTarget.setPointerCapture(e.pointerId)
          const items = together.filter((i) => !i.locked)
          held.current = {
            id: items[0]?.id ?? 0,
            scene,
            from: groupFrame(groupRect),
            start: w.p,
            grip: g,
            moved: false,
            last: null,
            others: [],
            crop: null,
            lastDelta: null,
            lastCrop: null,
            postShift: { x: 0, y: 0 },
            aborted: false,
            group: { items, rect: groupRect },
          }
          return
        }
      }
      const current = flat.find((i) => i.id === selected)
      let target: EngineItem | null = null
      let grip: Grip | null = null
      if (current?.frame && current.visible) {
        grip = gripAt(current.frame, w.p, w.reach, w.least)
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
        // Inside the box round several picked sources, over nothing: it moves them all.
        if (!target && groupRect && inside(groupFrame(groupRect), w.p)) {
          const first = together.find((i) => !i.locked)
          target = flat.find((i) => i.id === first?.id) ?? null
        }
      }
      if (!target || !grip || !target.frame) {
        // Empty canvas: a click drops the picks, a drag picks what the box touches.
        startMarquee(e.shiftKey ? 'add' : 'replace')
        return
      }
      const picked = pickedIds.includes(target.id)
      if (!picked) select(target.id)
      // A locked source, or a locked preview: picked, never dragged.
      if (target.locked || pv.locked) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const cropping = e.altKey && grip.u >= 0
      const k = queueKey(scene, target.id)
      const prevCrop = pendingCrops.current.get(k)
      const baseFrame =
        (prevCrop?.cropComplete ? prevCrop.settledFrame : null) ??
        pendingFrames.current.get(k) ??
        target.frame
      const h: Held = {
        id: target.id,
        scene,
        from: baseFrame,
        start: w.p,
        grip,
        moved: false,
        last: null,
        // A source dragged while its own group is picked too moves alone (the group can't be in
        // the same batch as one of its sources).
        others:
          picked &&
          grip.u < 0 &&
          !list.some((g) => pickedIds.includes(g.id) && g.children.some((c) => c.id === target.id))
            ? // The displayed group's members: a hidden picked source stays where it is.
              together.flatMap((i) => {
                if (i.id === target.id || i.locked) return []
                const ok = queueKey(scene, i.id)
                const oc = pendingCrops.current.get(ok)
                return [
                  {
                    id: i.id,
                    from:
                      (oc?.cropComplete ? oc.settledFrame : null) ??
                      pendingFrames.current.get(ok) ??
                      i.frame,
                    cropAfter: !cropping && oc?.cropSettled && !oc.cropComplete ? oc : null,
                  },
                ]
              })
            : [],
        crop: cropping ? 'reading' : null,
        cropAfter: !cropping && prevCrop?.cropSettled && !prevCrop.cropComplete ? prevCrop : null,
        lastAfterCrop: null,
        lastDelta: null,
        lastCrop: null,
        postShift: { x: 0, y: 0 },
        aborted: false,
      }
      held.current = h
      if (cropping) {
        h.cropComplete = false
        h.cropSettled = new Promise<void>((resolve) => {
          h.cropDone = resolve
        })
        // The initial crop and source size, while the engine anchors position on crop updates.
        const readInitial = () => api.transform(scene, target.id)
        const pendingRead =
          prevCrop?.cropSettled && !prevCrop.cropComplete
            ? prevCrop.cropSettled.then(readInitial)
            : readInitial()
        h.cropRead = pendingRead
          .then((t) => {
            if (h.aborted || held.current !== h) return t
            if (prevCrop?.cropComplete && prevCrop.settledFrame) h.from = prevCrop.settledFrame
            h.crop = { from: cropOf(t), size: { width: t.width, height: t.height } }
            if (h.moved && h.lastDelta) {
              const next = cropDrag(h.from, h.grip, h.lastDelta, h.crop.from, h.crop.size)
              h.lastCrop = next
              queue(`crop:${h.id}`, { crop: next, id: h.id, save: false }, h.scene)
            }
            return t
          })
          .catch(() => {
            if (held.current === h) h.crop = null
            return null
          })
      }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (pinch.current && touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [a, b] = [...touches.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        const from = pinch.current
        const k = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / from.dist
        const mid = pointerFromCentre(e.currentTarget, (a.x + b.x) / 2, (a.y + b.y) / 2)
        const z = zoomAt(from.zoom, from.pan, k, from.mid)
        // The fingers' middle moving is a pan as well.
        viewSet({
          zoom: z.zoom,
          pan: [z.pan[0] + mid[0] - from.mid[0], z.pan[1] + mid[1] - from.mid[1]],
        })
        return
      }
      if (panning.current) {
        const from = panning.current
        const raw: [number, number] = [
          from.pan[0] + e.clientX - from.x,
          from.pan[1] + e.clientY - from.y,
        ]
        const bounds = getStageBounds(getPreviewView().zoom)
        viewSet({ pan: bounds ? clampPan(raw, bounds.maxPan) : raw })
        return
      }
      stageEl.current = e.currentTarget
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      }
      altHeld.current = e.altKey
      const w = where(e)
      if (!w) return
      const m = marquee.current
      if (m) {
        if (!m.moved && Math.hypot(w.p.x - m.start.x, w.p.y - m.start.y) < w.still) return
        m.moved = true
        setHints({
          owner: ref.current,
          guides: [],
          gaps: [],
          marquee: { left: m.start.x, top: m.start.y, right: w.p.x, bottom: w.p.y },
        })
        return
      }
      const h = held.current
      if (!h) {
        const cur = hoverCursorAt(w, e.altKey)
        e.currentTarget.style.cursor = cur.css
        tellNative(cur.native)
        return
      }
      const d = { x: w.p.x - h.start.x, y: w.p.y - h.start.y }
      if (!h.moved && Math.hypot(d.x, d.y) < w.still) return
      h.moved = true
      if (h.crop) {
        h.lastDelta = d
        if (h.crop === 'reading') return
        const next = cropDrag(h.from, h.grip, d, h.crop.from, h.crop.size)
        h.lastCrop = next
        queue(`crop:${h.id}`, { crop: next, id: h.id, save: false }, h.scene)
        return
      }
      // Alt (Option) held: no snapping this once, as in OBS.
      const snap = e.altKey ? 0 : w.snap
      const movingIds = h.group
        ? h.group.items.map((i) => i.id)
        : [h.id, ...h.others.map((o) => o.id)]
      const to = {
        screen: snapOpts.screen,
        center: snapOpts.centre,
        others: snapOpts.others ? snapTargets(list, movingIds) : [],
      }
      if (h.group) {
        // A handle of the box round several: it sizes every one of them with it.
        const b = drag(h.from, h.grip, d, { free: e.shiftKey, keep: pv.keep, canvas, snap, to })
        const next: Rect = { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h }
        const boxes = scaleGroup(h.group.items, h.group.rect, next)
        h.last = b
        h.lastBoxes = boxes
        queue(manyKey(boxes), { boxes, save: false }, h.scene)
        showHints(next, movingIds, snap > 0)
        return
      }
      if (h.cropAfter?.cropComplete && h.cropAfter.settledFrame) {
        h.from = h.cropAfter.settledFrame
        h.cropAfter = null
        h.lastAfterCrop = null
      }
      for (const o of h.others) {
        if (o.cropAfter?.cropComplete && o.cropAfter.settledFrame) {
          o.from = o.cropAfter.settledFrame
          o.cropAfter = null
          h.lastAfterCrop = null
        }
      }
      const dragOpts = { free: e.shiftKey, keep: pv.keep, canvas, snap, to }
      let b: Box
      let shown: Rect
      if (h.others.length > 0 && h.grip.u < 0) {
        // Several picked sources move as one box: its bounds snap, and all go by the same.
        const frames = [h.from, ...h.others.map((o) => o.from)]
        const at = union(frames.map((f) => rectOf(f))) as Rect
        const moved = drag(groupFrame(at), h.grip, d, { canvas, snap, to })
        const dx = moved.x - at.left
        const dy = moved.y - at.top
        const hb = boxOf(h.from)
        b = { ...hb, x: hb.x + dx, y: hb.y + dy }
        shown = {
          left: at.left + dx,
          top: at.top + dy,
          right: at.right + dx,
          bottom: at.bottom + dy,
        }
      } else {
        b = drag(h.from, h.grip, d, dragOpts)
        shown = rectOf(frameOfBox(h.from, b))
      }
      const waits = pendingDragCrops(h)
      if (waits.length > 0) {
        const wait = Promise.all(waits).then(() => undefined)
        const after: AfterCropBox =
          h.others.length > 0 && h.grip.u < 0
            ? (() => {
                const dx = b.x - h.from[4]
                const dy = b.y - h.from[5]
                return {
                  wait,
                  compute: (base) => drag(base, h.grip, d, dragOpts),
                  fallback: b,
                  getBase: () => settledFrameFor(h.scene, h.id, h.cropAfter, h.from),
                  computeBoxes: () => shiftedBoxesAfterCrop(h, dx, dy),
                }
              })()
            : {
                wait,
                compute: (base) => drag(base, h.grip, d, dragOpts),
                fallback: b,
                getBase: () =>
                  (h.cropAfter?.cropComplete ? h.cropAfter.settledFrame : null) ??
                  pendingFrames.current.get(queueKey(h.scene, h.id)) ??
                  null,
              }
        h.last = b
        h.lastAfterCrop = after
        showHints(shown, movingIds, snap > 0)
        if (h.others.length > 0 && after.computeBoxes) {
          const ids = afterCropIds(h)
          queue(
            manyKey(ids.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0 }))),
            { afterCrop: after, ids, save: false },
            h.scene,
          )
        } else {
          queue(h.id, { afterCrop: after, save: false }, h.scene)
        }
        return
      }
      h.lastAfterCrop = null
      h.last = b
      showHints(shown, movingIds, snap > 0)
      moveAll(h, b, false)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      touches.current.delete(e.pointerId)
      if (touches.current.size < 2) pinch.current = null
      const m = marquee.current
      if (m) {
        marquee.current = null
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId)
        clearHints()
        const w = where(e)
        if (m.moved && w) {
          // Every source the box touches, joined to the picks as the modifier says.
          const hits = marqueeHits(list, {
            left: m.start.x,
            top: m.start.y,
            right: w.p.x,
            bottom: w.p.y,
          })
          pickSet(pickWith(m.mode === 'replace' ? [] : m.base, hits, m.mode))
        } else if (m.mode === 'replace') select(null)
        return
      }
      if (panning.current) {
        panning.current = null
        e.currentTarget.style.cursor = space.current ? 'grab' : ''
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId)
        return
      }
      const h = held.current
      held.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId)
      finish(h)
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      }
      refreshCursorRef.current(e.altKey)
    },
    // The browser or system took the pointer away without a pointerup or cancel (a system
    // dialog, Alt-Tab): a drag left hanging is saved as it is, not left on screen.
    onLostPointerCapture: () => {
      if (!held.current && !marquee.current) return
      const h = held.current
      held.current = null
      marquee.current = null
      clearHints()
      finish(h)
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
      touches.current.delete(e.pointerId)
      pinch.current = null
      panning.current = null
      marquee.current = null
      clearHints()
      const h = held.current
      held.current = null
      finish(h)
    },
    onKeyUp: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === ' ') {
        space.current = false
        if (!panning.current) e.currentTarget.style.cursor = ''
      }
    },
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
      space.current = false
      if (!panning.current) e.currentTarget.style.cursor = ''
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      // Space held: a drag pans the zoomed canvas.
      if (e.key === ' ') {
        e.preventDefault()
        space.current = true
        if (!panning.current) e.currentTarget.style.cursor = 'grab'
        return
      }
      // ⌘/Ctrl with + − 0: zoom in, out, back to fit (wide canvas only).
      if ((e.metaKey || e.ctrlKey) && ['=', '+', '-', '0'].includes(e.key)) {
        if (
          pictureCanvas === 'vertical' ||
          (Boolean(scenes?.data?.vertical) && pv.view === 'vertical')
        ) {
          return
        }
        e.preventDefault()
        if (e.key === '0') viewSet({ zoom: 1, pan: [0, 0] })
        else zoomView(e.key === '-' ? 1 / ZOOM_STEP : ZOOM_STEP)
        return
      }
      if (e.key === 'Escape') {
        // In a drag: cancel it. Otherwise: nothing picked.
        if (held.current || marquee.current) abortDrag()
        else select(null)
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
      const moving = pv.locked ? [] : pickedBoxes(list, pickedIds).filter((i) => !i.locked)
      if (!d || moving.length === 0) return
      e.preventDefault()
      const boxes: BoxFor[] = []
      for (const it of moving) {
        const k = queueKey(scene, it.id)
        const f = (pendingFrames.current.get(k) ?? it.frame) as Frame
        const b = boxOf(f)
        const shifted: Frame = [f[0], f[1], f[2], f[3], f[4] + d.x, f[5] + d.y]
        // Moved here at once, so a held key builds on each step before the engine answers.
        put({ id: it.id, frame: shifted })
        pendingFrames.current.set(k, shifted)
        const pc = pendingCrops.current.get(k)
        if (pc) {
          pc.postShift.x += d.x
          pc.postShift.y += d.y
        } else {
          boxes.push({ id: it.id, ...b, x: b.x + d.x, y: b.y + d.y })
        }
      }
      // One request for all of them, so a nudge of several is one undo step.
      if (boxes.length > 1) queue(manyKey(boxes), { boxes, save: true })
      else if (boxes[0]) send(boxes[0].id, boxes[0], true)
    },
  }
}

/**
 * What the editor draws over a canvas box: the guides and distances while a source is dragged,
 * the box dragged to pick several, and the one box round the sources picked together.
 */
function EditHints({
  boxRef,
  active,
}: {
  boxRef: React.RefObject<HTMLDivElement | null>
  active: boolean
}) {
  const { items, selected, also, size } = useDesk()
  const [pv] = usePreviewView()
  if (!size) return null
  const ids = [selected, ...also].filter((id): id is number => id !== null)
  // The same sources the editor moves and sizes with (pickedGroup).
  const rect = active && !pv.locked ? pickedGroup(items.data ?? [], ids).rect : null
  return (
    <>
      <SnapOverlay boxRef={boxRef} canvas={size} />
      <GroupBox rect={rect} canvas={size} />
    </>
  )
}

/** The stage when the Studio isn't running: start it, or say why it can't. */
export function StageOff({
  available,
  detail,
  safeMode = null,
  onStart,
}: {
  available: boolean
  detail: string | null
  safeMode?: SafeModeStatus | null
  onStart: (opts?: StudioStartOptions) => Promise<void>
}) {
  const [busy, setBusy] = useState<'default' | 'scenes' | 'normal' | 'blank' | null>(null)
  const startWith = (key: 'default' | 'scenes' | 'normal' | 'blank', opts?: StudioStartOptions) => {
    if (busy !== null) return
    setBusy(key)
    void onStart(opts).finally(() => setBusy(null))
  }
  const locked = safeMode ? isSafeModeLocked(safeMode) : false
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#0a0b0d] p-6 text-center">
      {available ? (
        safeMode?.active ? (
          <div className="flex max-w-[44ch] flex-col items-center gap-3">
            <Badge tone="warn" className="border-[#f5b43c]/35! bg-[#f5b43c]/15! text-[#ffd27a]!">
              <ShieldWarning size={14} weight="fill" aria-hidden />
              Safe Mode
            </Badge>
            <p className="m-0 text-[15px] text-[#c3c8d1]">
              {safeMode.collection_pending
                ? 'Plugins, VSTs, auto-start and saved scenes are held back.'
                : 'Plugins, VSTs and auto-start are off.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="primary"
                busy={busy === 'scenes'}
                disabled={busy !== null}
                onClick={() =>
                  startWith(
                    'scenes',
                    safeMode.collection_pending
                      ? { safe_mode: true, confirm_collection: true }
                      : { safe_mode: true },
                  )
                }
              >
                <Play size={15} weight="fill" aria-hidden />
                {safeMode.collection_pending ? 'Load my scenes' : 'Start in Safe Mode'}
              </Button>
              {!locked && (
                <Button
                  variant="outline"
                  busy={busy === 'normal'}
                  disabled={busy !== null}
                  className="border-white/25! bg-white/8! text-white! hover:bg-white/15!"
                  onClick={() =>
                    startWith('normal', { safe_mode: false, confirm_collection: true })
                  }
                >
                  Start normally
                </Button>
              )}
              {safeMode.collection_pending && (
                <Button
                  variant="ghost"
                  busy={busy === 'blank'}
                  disabled={busy !== null}
                  className="text-[#c3c8d1]! hover:bg-white/10! hover:text-white!"
                  onClick={() => startWith('blank', { safe_mode: true, confirm_collection: false })}
                >
                  Blank canvas
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="m-0 max-w-[36ch] text-[15px] text-[#c3c8d1]">
              Your scenes come back where you left them.
            </p>
            <Button
              variant="primary"
              busy={busy === 'default'}
              onClick={() => startWith('default')}
            >
              <Play size={15} weight="fill" /> Start the Studio
            </Button>
          </div>
        )
      ) : (
        <p className="m-0 max-w-[48ch] text-[15px] text-[#c3c8d1]">{detail}</p>
      )}
    </div>
  )
}

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
const zoomButton = (on: boolean) =>
  cx(
    'h-[26px] rounded-[5px] px-2 text-[12.5px] font-semibold outline-none focus-visible:shadow-[var(--fc-focus)] disabled:opacity-40',
    on
      ? 'rounded-b-[3px] bg-surface-3 text-text shadow-[inset_0_-2px_0_var(--fc-accent-text)]'
      : 'text-text-2 hover:bg-surface-3 hover:text-text',
  )

function ToolButton({
  panel,
  text,
  label,
  size = 'sm',
  className,
  children,
  ...rest
}: {
  panel: boolean
  text: string
  label: string
  size?: 'xs' | 'sm'
  children: ReactNode
} & Omit<ComponentProps<typeof Button>, 'size' | 'variant' | 'children'>) {
  if (panel) {
    return (
      <Button
        size="xs"
        variant="ghost"
        aria-label={label}
        title={rest.title ?? label}
        className={cx('text-text-2', className)}
        {...rest}
      >
        {children}
        <span>{text}</span>
      </Button>
    )
  }
  return (
    <IconButton size={size} label={label} className={className} {...rest}>
      {children}
    </IconButton>
  )
}

function ViewControls({ panel = false }: { panel?: boolean }) {
  const { api, scene, scenes, items, selected, refresh, size } = useDesk()
  const { run } = useAction()
  const [pv, setPv] = usePreviewView()
  const stage = useStageSize()
  const c = size
  // One canvas pixel per screen pixel: derived strictly from the stage's fitted width (not from
  // the current zoomed box), so repeated clicks on 100% never drift or double-scale.
  const fitSize = stage ? fitBoxSize(stage.width, stage.height) : null
  const pixelZoom = c && fitSize ? pixelZoomForStage(c.width, fitSize.width) : null
  const clampedPan =
    stage && fitSize ? clampPan(pv.pan, zoomBoundsPan(pv.zoom, fitSize, stage)) : pv.pan
  const isCentered = Math.abs(clampedPan[0]) < 0.5 && Math.abs(clampedPan[1]) < 0.5
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
  const showZoom =
    !scenes.data?.preview && !(Boolean(scenes.data?.vertical) && pv.view === 'vertical')
  return (
    <>
      {it && cover && (
        // One small button in the bar: the words only where there's room (at 1280 the chip
        // pushed the transition controls onto a second line). The picture is drawn over the
        // page by the app, so this can't sit on it.
        <button
          type="button"
          title={`${it.name} is behind ${cover.name}. Bring it to front.`}
          aria-label={`${it.name} is behind ${cover.name}. Bring it to front`}
          onClick={() =>
            void run('order', () => done(api.itemOrder(scene, it.id, 0))).then(
              (ok) => ok && refresh(),
            )
          }
          className="flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-full bg-warn-soft px-1.5 text-[12px] font-semibold text-warn outline-none hover:brightness-95 focus-visible:shadow-[var(--fc-focus)] @[1440px]:max-w-[15rem] @[1440px]:px-2.5"
        >
          <Stack size={14} weight="bold" aria-hidden className="shrink-0" />
          <span className="hidden truncate @[1440px]:inline">Behind {cover.name} · To front</span>
        </button>
      )}
      {showZoom && (
        <div
          role="group"
          aria-label="Zoom"
          className={cx('flex items-center gap-0.5', panel && 'flex-wrap gap-1')}
        >
          {ZOOMS.map((z) => {
            const active = Math.abs(pv.zoom - z) < 0.005 && isCentered
            return (
              <button
                key={z}
                type="button"
                aria-pressed={active}
                aria-label={z === 1 ? 'Fit the canvas and centre it' : `Zoom ${z * 100}%`}
                title={z === 1 ? 'Fit the canvas and centre it (⌘0)' : undefined}
                onClick={() => setPv({ zoom: z, pan: [0, 0] })}
                className={zoomButton(active)}
              >
                {z === 1 ? 'Fit' : `${z * 100}%`}
              </button>
            )
          })}
          <button
            type="button"
            aria-label="Zoom 100%, canvas pixels"
            title="One canvas pixel per screen pixel"
            aria-pressed={pixelZoom !== null && Math.abs(pv.zoom - pixelZoom) < 0.005 && isCentered}
            disabled={pixelZoom === null}
            onClick={() => pixelZoom !== null && setPv({ zoom: pixelZoom, pan: [0, 0] })}
            className={zoomButton(
              pixelZoom !== null && Math.abs(pv.zoom - pixelZoom) < 0.005 && isCentered,
            )}
          >
            100%
          </button>
          <ToolButton
            panel={panel}
            text="Zoom out"
            size="sm"
            label="Zoom out (⌘−)"
            disabled={pv.zoom <= ZOOM_MIN}
            onClick={() => zoomView(1 / ZOOM_STEP)}
          >
            <MagnifyingGlassMinus size={16} weight="bold" aria-hidden />
          </ToolButton>
          <ToolButton
            panel={panel}
            text="Zoom in"
            size="sm"
            label="Zoom in (⌘+)"
            disabled={pv.zoom >= ZOOM_MAX}
            onClick={() => zoomView(ZOOM_STEP)}
          >
            <MagnifyingGlassPlus size={16} weight="bold" aria-hidden />
          </ToolButton>
        </div>
      )}
      {showZoom && !panel && <span aria-hidden className="h-5 w-px bg-line" />}
      <ToolButton
        panel={panel}
        text={pv.frames ? 'Outlines on' : 'Source outlines'}
        size="sm"
        label={pv.frames ? 'Hide source outlines' : 'Show every source’s outline'}
        aria-pressed={pv.frames}
        className={cx(pv.frames ? 'bg-accent-soft! text-accent-text!' : 'text-text-2')}
        onClick={() => setPv({ frames: !pv.frames })}
      >
        <BoundingBox size={17} weight={pv.frames ? 'fill' : 'regular'} aria-hidden />
      </ToolButton>
      <ToolButton
        panel={panel}
        text={pv.keep ? 'Keep shape' : 'Free stretch'}
        size="sm"
        label={
          pv.keep
            ? 'Frames keep their shape. Click to let the side handles stretch them'
            : 'Side handles stretch frames. Click to keep their shape'
        }
        aria-pressed={pv.keep}
        className={cx(pv.keep ? 'bg-accent-soft! text-accent-text!' : 'text-text-2')}
        onClick={() => setPv({ keep: !pv.keep })}
      >
        {pv.keep ? (
          <LockSimple size={17} weight="fill" aria-hidden />
        ) : (
          <LockSimpleOpen size={17} aria-hidden />
        )}
      </ToolButton>
    </>
  )
}

export function StageBar() {
  const { api, scenes, scene, kinds, openSettings, openTransitions, screens, refresh, size } =
    useDesk()
  const { c, history } = useDeskStats(
    (s) => ({ c: s?.canvas ?? null, history: s?.history ?? null }),
    (a, b) =>
      a.c?.width === b.c?.width &&
      a.c?.height === b.c?.height &&
      a.c?.fps === b.c?.fps &&
      a.history?.undo === b.history?.undo &&
      a.history?.redo === b.history?.redo,
  )
  const { run } = useAction()
  const { open, menu } = useContextMenu()
  const [pv, setPv] = usePreviewView()
  const guideItems: MenuItem[] = [
    { heading: 'Guides' },
    {
      label: 'Action safe area',
      hint: '93%',
      checked: pv.safe.action,
      onSelect: () => setPv({ safe: { ...pv.safe, action: !pv.safe.action } }),
    },
    {
      label: 'Title safe area',
      hint: '90%',
      checked: pv.safe.title,
      onSelect: () => setPv({ safe: { ...pv.safe, title: !pv.safe.title } }),
    },
    {
      label: 'Centre cross',
      checked: pv.safe.cross,
      onSelect: () => setPv({ safe: { ...pv.safe, cross: !pv.safe.cross } }),
    },
    { sep: true },
    { heading: 'Past the canvas' },
    {
      label: 'Show what runs past the canvas',
      checked: pv.overflow === 'show',
      onSelect: () => setPv({ overflow: 'show' }),
    },
    {
      label: 'Hide what runs past the canvas',
      checked: pv.overflow === 'hide',
      onSelect: () => setPv({ overflow: 'hide' }),
    },
  ]
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
  const named = scenes.data?.named_transitions ?? []
  const activeNamed = named.find((x) => x.default) ?? named[0] ?? null
  const matrixCount = scenes.data?.transition_matrix?.length ?? 0
  // The length being typed, with the transition it was typed for: if the default changes under
  // the field (another dashboard), the draft isn't written to the new one.
  const [draftMs, setDraftMs] = useState<{ for: string; ms: number } | null>(null)
  const lengthOwner = activeNamed?.name ?? t?.kind ?? ''
  const ms = draftMs && draftMs.for === lengthOwner ? draftMs.ms : null
  const [tuning, setTuning] = useState<string | null>(null)
  const kindsOn = (kinds.data?.transitions ?? []).filter((k) => TRANSITIONS[k.id])
  const set = async (kind: string, dur: number) => {
    const ok = await run('transition', async () => {
      if (activeNamed) {
        await api.updateNamedTransition(activeNamed.name, { ms: dur })
      } else {
        await api.setTransition({ kind, ms: dur })
      }
      return true
    })
    if (ok) scenes.reload()
  }
  const selectDefaultNamed = async (name: string) => {
    const ok = await run('transition', async () => {
      await api.setDefaultNamedTransition(name)
      return true
    })
    if (ok) scenes.reload()
  }
  const lengthInput = (panel: boolean) =>
    // A stinger lasts as long as its video.
    t && t.kind !== 'cut_transition' && t.kind !== 'obs_stinger_transition' ? (
      <span className="flex items-center gap-1.5">
        {panel && <span>Length</span>}
        <Input
          aria-label="Transition length in milliseconds"
          type="number"
          inputMode="numeric"
          min={0}
          max={20000}
          step={50}
          className="h-7! w-16! rounded-[5px]! px-2! py-0! text-right text-[13px]! tabular-nums"
          value={ms ?? t.ms}
          onChange={(e) =>
            setDraftMs(
              Number.isFinite(e.target.valueAsNumber)
                ? { for: lengthOwner, ms: e.target.valueAsNumber }
                : null,
            )
          }
          onBlur={() => {
            if (ms !== null && ms !== t.ms && ms >= 0 && ms <= 20000)
              void set(t.kind, Math.round(ms))
            setDraftMs(null)
          }}
        />
        <span aria-hidden>ms</span>
      </span>
    ) : null
  const items: OverflowItem[] = [
    {
      // The Scenes panel shows what's on air; here the name fits on wide screens. A set
      // width, so the buttons after it stay put when the scene or picture changes.
      key: 'name',
      wrap: 'hidden @[1440px]:flex',
      render: () => (
        <span
          title={scene}
          className="inline-block w-32 truncate font-display text-[16px] font-bold text-text"
        >
          {scene}
        </span>
      ),
    },
    {
      key: 'size',
      wrap: 'hidden @[1040px]:flex',
      render: () =>
        c && (
          <button
            type="button"
            title="Change the picture size"
            onClick={() => openSettings('picture')}
            className="rounded-[6px] px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-text-3 tabular-nums hover:bg-surface-3 hover:text-text"
          >
            {/* The edited picture's size: the vertical one's while it's picked. */}
            {size?.width ?? c.width}×{size?.height ?? c.height} · {c.fps}&nbsp;fps
          </button>
        ),
    },
    // One quiet strip (owner's pick S1): plain tools, blue when on, thin lines between the groups.
    {
      key: 'sep1',
      wrap: 'hidden @[1040px]:flex',
      render: () => <span aria-hidden className="h-5 w-px bg-line" />,
    },
    { key: 'view', rank: 6, render: (panel) => <ViewControls panel={panel} /> },
    {
      key: 'lock',
      rank: 8,
      render: (panel) => (
        <ToolButton
          panel={panel}
          text={pv.locked ? 'Unlock preview' : 'Lock preview'}
          size="sm"
          label={
            pv.locked
              ? 'Unlock the preview: sources can be moved again'
              : 'Lock the preview: sources can be picked but not moved or resized'
          }
          aria-pressed={pv.locked}
          className={cx(pv.locked ? 'bg-accent-soft! text-accent-text!' : 'text-text-2')}
          onClick={() => setPv({ locked: !pv.locked })}
        >
          {pv.locked ? (
            <Lock size={17} weight="fill" aria-hidden />
          ) : (
            <LockOpen size={17} aria-hidden />
          )}
        </ToolButton>
      ),
    },
    {
      key: 'arrange',
      rank: 7,
      render: (panel) => <ArrangeButton panel={panel} />,
    },
    {
      key: 'guides',
      rank: 7,
      render: (panel) =>
        scenes.data?.preview ? null : (
          <span className="flex items-center gap-1">
            <ToolButton
              panel={panel}
              text="Guides"
              size="sm"
              label="Guides: safe areas, centre cross, what runs past the canvas"
              aria-haspopup="menu"
              aria-pressed={
                pv.safe.action || pv.safe.title || pv.safe.cross || pv.overflow === 'hide'
              }
              className={cx(
                pv.safe.action || pv.safe.title || pv.safe.cross || pv.overflow === 'hide'
                  ? 'bg-accent-soft! text-accent-text!'
                  : 'text-text-2',
              )}
              onClick={(e) => open(e, 'Guides', guideItems)}
            >
              <FrameCorners size={17} weight="bold" aria-hidden />
            </ToolButton>
            {!panel && (
              <InfoTip label="About the guides">
                Safe areas mark where a TV or phone may crop the picture (EBU R95: action 93%,
                titles 90%). Hide what runs past the canvas to see only the picture that goes out.
              </InfoTip>
            )}
          </span>
        ),
    },
    {
      key: 'performance',
      rank: 5,
      render: (panel) => <PerformanceToggle panel={panel} />,
    },
    { key: 'sep2', render: () => <span aria-hidden className="h-5 w-px bg-line" /> },
    {
      key: 'vertical',
      rank: 5,
      render: () => (
        <span className="flex items-center gap-2">
          <VerticalToggle />
          <PictureViewPick />
        </span>
      ),
    },
    { key: 'spacer', spacer: true, render: () => null },
    {
      key: 'switch',
      render: () =>
        t && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="studio-transition"
              className="hidden whitespace-nowrap @[1240px]:inline"
            >
              Switch with
            </label>
            <Select
              id="studio-transition"
              aria-label="Switch with"
              className="h-7! w-28! rounded-[5px]! py-0! pr-7! pl-2! text-[13px]!"
              value={activeNamed ? activeNamed.name : t.kind}
              onChange={(e) => {
                if (named.length > 0) void selectDefaultNamed(e.target.value)
                else void set(e.target.value, t.ms)
              }}
            >
              {named.length > 0
                ? named.map((nt) => (
                    <option key={nt.name} value={nt.name}>
                      {nt.name}
                    </option>
                  ))
                : (kindsOn.length ? kindsOn : [{ id: t.kind, name: t.kind }]).map((k) => (
                    <option key={k.id} value={k.id}>
                      {TRANSITIONS[k.id] ?? k.name}
                    </option>
                  ))}
            </Select>
          </div>
        ),
    },
    {
      key: 'gear',
      rank: 2,
      render: (panel) =>
        t && (
          <span className="ml-1 flex flex-wrap items-center gap-1.5">
            {(HAS_SETTINGS.has(t.kind) || openTransitions) && (
              <ToolButton
                panel={panel}
                size="xs"
                text={`${TRANSITIONS[t.kind] ?? 'Transition'} settings`}
                label={
                  openTransitions
                    ? `Manage transition settings for ${activeNamed?.name ?? TRANSITIONS[t.kind] ?? 'Transition'}`
                    : `${TRANSITIONS[t.kind] ?? 'Transition'} settings`
                }
                onClick={() =>
                  openTransitions
                    ? openTransitions({
                        tab: 'list',
                        ...(activeNamed ? { transitionName: activeNamed.name } : {}),
                      })
                    : setTuning(t.kind)
                }
              >
                <GearSix size={16} weight="bold" aria-hidden />
              </ToolButton>
            )}
            {openTransitions && (
              <Button
                size="xs"
                variant="outline"
                aria-label="Open transitions and matrix"
                onClick={() => openTransitions({ tab: 'matrix' })}
              >
                <MatrixIcon />
                <span>Matrix</span>
                {matrixCount > 0 && <Badge tone="accent">{matrixCount}</Badge>}
              </Button>
            )}
          </span>
        ),
    },
    {
      key: 'length',
      rank: 1,
      render: (panel) =>
        t && lengthInput(panel) ? <span className="ml-1.5 flex">{lengthInput(panel)}</span> : null,
    },
    {
      key: 'tip',
      wrap: 'hidden @[960px]:flex',
      rank: 0,
      render: (panel) =>
        t &&
        !panel && (
          <InfoTip label="About switching scenes">
            How the picture changes when you click another scene.
          </InfoTip>
        ),
    },
    {
      key: 'studio',
      render: () => (
        <IconButton
          size="sm"
          label={
            scenes.data?.preview
              ? 'Leave Studio Mode'
              : 'Studio Mode: edit a scene before it goes on air'
          }
          aria-pressed={!!scenes.data?.preview}
          className={cx(scenes.data?.preview ? 'bg-accent-soft! text-accent-text!' : 'text-text-2')}
          onClick={() =>
            void run('studio', () => done(api.studioMode(!scenes.data?.preview))).then(
              (ok) => ok && refresh(),
            )
          }
        >
          <Columns size={17} weight="bold" />
        </IconButton>
      ),
    },
    {
      key: 'history',
      rank: 4,
      render: (panel) => (
        <span className={cx('flex items-center', panel && 'flex-wrap gap-1')}>
          <ToolButton
            panel={panel}
            text="Undo"
            size="sm"
            label={history?.undo ? `Undo ${history.undo} (${shortcut('Z')})` : 'Nothing to undo'}
            disabled={!history?.undo}
            onClick={() => step(false)}
          >
            <ArrowUUpLeft size={16} weight="bold" aria-hidden />
          </ToolButton>
          <ToolButton
            panel={panel}
            text="Redo"
            size="sm"
            label={
              history?.redo ? `Redo ${history.redo} (${shortcut('Z', true)})` : 'Nothing to redo'
            }
            disabled={!history?.redo}
            onClick={() => step(true)}
          >
            <ArrowUUpRight size={16} weight="bold" aria-hidden />
          </ToolButton>
          <ToolButton
            panel={panel}
            text="History"
            size="sm"
            label="History: step back to any change"
            onClick={historyList}
          >
            <ClockCounterClockwise size={16} weight="bold" aria-hidden />
          </ToolButton>
        </span>
      ),
    },
    {
      key: 'projectors',
      rank: 3,
      render: (panel) =>
        inDesktopApp() && (
          <ToolButton
            panel={panel}
            text="Projectors"
            size="sm"
            label="Projectors and multiview"
            onClick={projectors}
          >
            <ProjectorScreen size={17} weight="bold" aria-hidden />
          </ToolButton>
        ),
    },
  ]
  return (
    // Parts show by the bar's own width (not the window's), so it stays on one line: the
    // name and the picture size only where there's room for them, and what doesn't fit moves
    // into the More panel (OverflowRow).
    <div className="@container flex-none border-t border-line bg-surface-1">
      <OverflowRow
        items={items}
        className="fc-dock-bar gap-x-2 px-2 py-1 text-[13px] text-text-3 @[900px]:gap-x-2.5 @[900px]:px-2.5"
      />
      <div className="contents">
        {menu}
        <TransitionSettingsDialog kind={tuning} onClose={() => setTuning(null)} />
      </div>
    </div>
  )
}

/** A transition's own settings (OBS's Transition Properties), applied as they change. */
function TransitionSettingsDialog({ kind, onClose }: { kind: string | null; onClose: () => void }) {
  return (
    <Dialog
      compact
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
