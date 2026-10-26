// The stage: the live picture (a native view the app draws over this box, letterboxed like
// OBS's preview) and, under it, the scene on air and how scenes change.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  ArrowUUpLeft,
  ArrowFatRight,
  ArrowUUpRight,
  ArrowsLeftRight,
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
  boxOf,
  cursorFor,
  drag,
  fit,
  gripAt,
  pick,
  type Box,
  type Frame,
  type Grip,
  type Pt,
} from './stage-edit'

/** True while something sits over the box: the native view can't be covered, so it hides. */
function covered(r: DOMRect): boolean {
  if (document.body.dataset.dockDrag) return true
  if (document.querySelector('dialog[open]')) return true
  for (const el of document.querySelectorAll(
    '[role="menu"], [role="listbox"], [data-over-preview]',
  )) {
    const b = el.getBoundingClientRect()
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) return true
  }
  return false
}

/** Where the live picture goes: the app draws a native view exactly over this box. In Studio
 * Mode there are two: the preview being edited, and what's on air, with the ways to switch
 * between them in the middle. */
export function PreviewBox({ running }: { running: boolean }) {
  const api = useEngine()
  const { scenes } = useDesk()
  const studio = !!scenes.data?.preview
  const ref = useRef<HTMLDivElement>(null)
  const programRef = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
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
      const inView = r.top >= bar && r.bottom <= window.innerHeight && r.width > 1 && r.height > 1
      return inView && !covered(r)
        ? { x: r.left, y: r.top, w: r.width, h: r.height, vh: window.innerHeight }
        : null
    }
    const send = () => {
      raf = 0
      const rect = place(el)
      const program = studio ? place(programRef.current) : null
      // The window's height is part of it: the native side places the view from the bottom.
      const key = JSON.stringify([rect, program, window.innerHeight])
      if (key === last) return
      last = key
      void api.preview(rect, program).catch(() => {
        // Not placed: the next change (or the same one) tries again.
        if (last === key) last = ''
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    if (programRef.current) ro.observe(programRef.current)
    const mo = new MutationObserver(schedule)
    // Dialogs open by an attribute; floating panels say where they are in data-pos.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'data-dock-drag', 'data-pos'],
    })
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      void api.preview(null, null).catch(() => undefined)
    }
  }, [api, running, desktop, studio])
  const editing = useStageEdit(ref, running && desktop)
  const screen =
    'grid aspect-video touch-none place-items-center rounded-[10px] bg-[#0a0b0d] p-4 text-center text-[13px] text-[#9aa1ac] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent'
  if (!studio)
    // The canvas is an exact 16:9 box fitted inside the stage, with room around it (no bars).
    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-inset p-3 [container-type:size]">
        <div
          ref={ref}
          aria-label="Studio preview. Click a source to pick it, drag to move it, drag a handle to resize it, arrow keys nudge it."
          className={cx(screen, 'w-[min(100cqw,100cqh*16/9)]')}
          {...editing}
        >
          {!desktop && 'The live picture shows in the Ferrocast app.'}
        </div>
      </div>
    )
  // Studio Mode: two 16:9 boxes side by side with the switch between them.
  const half = 'w-[min(calc((100cqw-150px)/2),calc((100cqh-30px)*16/9))]'
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-3 bg-inset p-3 [container-type:size]">
      <figure className="m-0 flex flex-col gap-1.5">
        <figcaption className="flex items-center gap-1.5 text-[12px] font-bold text-text-2">
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
      <figure className="m-0 flex flex-col gap-1.5">
        <figcaption className="flex items-center gap-1.5 text-[12px] font-bold text-danger">
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
          <InfoTip label="About Studio Mode">
            Edit the preview, then send it on air. With "Copy the scene on air" on, moving or hiding
            sources in the preview never touches the stream, even when both show the same scene.
            Drag the bar to mix by hand; let go near the end to finish, near the start to go back.
          </InfoTip>
        </div>
        <span className="mt-1 text-center text-[11px] font-bold tracking-wide text-text-3 uppercase">
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
}

/**
 * Pick, move and resize sources in the preview, as in OBS: click picks (the engine outlines
 * it), drag moves, the handles resize (corners keep the shape unless Shift is held), it snaps
 * to the canvas's edges and middle (Alt turns that off), arrows nudge (Shift: 10 pixels) and
 * a double-click opens its settings. The picture is a native view drawn over this box that
 * lets clicks through, so this box gets them.
 */
function useStageEdit(ref: React.RefObject<HTMLDivElement | null>, on: boolean) {
  const { api, scene, items, selected, select, edit, stats, setTransforming } = useDesk()
  const { run } = useAction()
  const canvas = stats?.canvas ?? null
  const held = useRef<Held | null>(null)
  const sending = useRef<{ busy: boolean; next: (Box & { save: boolean; id: number }) | null }>({
    busy: false,
    next: null,
  })

  // The engine outlines whatever is picked here or in the Sources panel.
  useEffect(() => {
    if (!on) return
    void api.select(selected === null ? null : { scene, id: selected }).catch(() => undefined)
  }, [api, on, scene, selected])
  useEffect(() => {
    if (!on) return
    return () => void api.select(null).catch(() => undefined)
  }, [api, on])

  const list = items.data ?? []
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
      snap: 8 / f.scale,
    }
  }

  const put = (item: EngineItem) =>
    items.set((prev) =>
      (prev ?? []).map((i) => (i.id === item.id && item.frame ? { ...i, frame: item.frame } : i)),
    )

  // One change on the way at a time; the newest waits and replaces older ones.
  const pump = () => {
    const q = sending.current
    if (q.busy || !q.next) return
    const b = q.next
    q.next = null
    q.busy = true
    const go = api.setItemBox(scene, b.id, { x: b.x, y: b.y, w: b.w, h: b.h, save: b.save })
    const done = b.save ? run('move', () => go) : go.catch(() => undefined)
    void done
      .then((item) => {
        if (item) put(item)
      })
      .finally(() => {
        q.busy = false
        pump()
      })
  }
  const send = (id: number, b: Box, save: boolean) => {
    const q = sending.current
    // A save never gets replaced by a later move without one.
    q.next = { ...b, id, save: save || !!(q.next?.save && q.next.id === id) }
    pump()
  }

  const frameOf = (id: number | null) => list.find((i) => i.id === id)?.frame ?? null

  if (!on || !canvas) return {}
  return {
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const w = where(e)
      if (!w) return
      ref.current?.focus({ preventScroll: true })
      const current = list.find((i) => i.id === selected)
      let target: EngineItem | null = null
      let grip: Grip | null = null
      if (current?.frame && current.visible) {
        grip = gripAt(current.frame, w.p, w.reach)
        if (grip) target = current
      }
      if (!target) {
        target = pick(list, w.p)
        grip = MOVE
      }
      if (!target || !grip || !target.frame) {
        select(null)
        return
      }
      if (target.id !== selected) select(target.id)
      if (target.locked) return
      e.currentTarget.setPointerCapture(e.pointerId)
      held.current = {
        id: target.id,
        from: target.frame,
        start: w.p,
        grip,
        moved: false,
        last: null,
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
        const over = g ? cursorFor(f as Frame, g) : pick(list, w.p) ? 'pointer' : ''
        e.currentTarget.style.cursor = over
        return
      }
      const d = { x: w.p.x - h.start.x, y: w.p.y - h.start.y }
      // Three screen pixels before a press becomes a drag.
      if (!h.moved && Math.hypot(d.x, d.y) < w.snap * (3 / 8)) return
      h.moved = true
      const b = drag(h.from, h.grip, d, {
        free: e.shiftKey,
        canvas,
        snap: e.altKey ? 0 : w.snap,
      })
      h.last = b
      send(h.id, b, false)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const h = held.current
      held.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId)
      if (h?.moved && h.last) send(h.id, h.last, true)
    },
    onPointerCancel: () => {
      const h = held.current
      held.current = null
      if (h?.moved && h.last) send(h.id, h.last, true)
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
        const it = list.find((i) => i.id === selected)
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
      const it = list.find((i) => i.id === selected)
      if (!d || !it?.frame || it.locked) return
      e.preventDefault()
      const b = boxOf(it.frame)
      // Moved here at once, so a held key builds on each step before the engine answers.
      const f = it.frame
      put({ ...it, frame: [f[0], f[1], f[2], f[3], f[4] + d.x, f[5] + d.y] })
      send(it.id, { ...b, x: b.x + d.x, y: b.y + d.y }, true)
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
          <p className="m-0 max-w-[36ch] text-[14px] text-[#c3c8d1]">
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
        <p className="m-0 max-w-[48ch] text-[14px] text-[#c3c8d1]">{detail}</p>
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
  const show = (what: 'program' | 'multiview', screen: number | undefined) =>
    void run('projector', () =>
      api.projector({ what, ...(screen === undefined ? {} : { screen }) }),
    )
  const projectors = (e: React.MouseEvent) => {
    // A display plugged in since shows next time.
    screens.reload()
    open(e, 'Projectors', [
      projectorItem('On air', screens.data, (sc) => show('program', sc)),
      {
        ...projectorItem('Multiview', screens.data, (sc) => show('multiview', sc)),
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
    <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-1 px-3 py-2 text-[13px] text-text-3">
      <span className="font-display text-[15px] font-bold text-text">{scene}</span>
      {c && (
        <button
          type="button"
          title="Change the picture size"
          onClick={() => openSettings('picture')}
          className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-text-2 tabular-nums hover:text-text"
        >
          {c.width}×{c.height} · {c.fps}&nbsp;fps
        </button>
      )}
      <span className="flex-1" />
      {t && (
        <div className="flex items-center gap-2">
          <label htmlFor="studio-transition" className="hidden sm:inline">
            Switch with
          </label>
          <Select
            id="studio-transition"
            className="h-8! w-auto! py-0! text-[13px]"
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
            <>
              <Input
                aria-label="Transition length in milliseconds"
                type="number"
                inputMode="numeric"
                min={0}
                max={20000}
                step={50}
                className="h-8! w-20! py-0! text-right text-[13px] tabular-nums"
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
            </>
          )}
          <InfoTip label="About switching scenes">
            How the picture changes when you click another scene.
          </InfoTip>
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
