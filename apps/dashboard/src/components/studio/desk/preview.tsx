// The stage: the live picture (a native view the app draws over this box, letterboxed like
// OBS's preview) and, under it, the scene on air and how scenes change.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Play,
  ProjectorScreen,
  SquaresFour,
  X,
} from '@phosphor-icons/react'
import { type EngineItem, type PreviewRect } from '@ferrocast/api'
import { Button, IconButton, InfoTip, Input, Select } from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { useAction } from '../../../lib/hooks'
import { useDesk, useEngine } from './common'
import { projectorItem, useContextMenu } from './menu'
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

/** Where the live picture goes: the app draws a native view exactly over this box. */
export function PreviewBox({ running }: { running: boolean }) {
  const api = useEngine()
  const ref = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
  useEffect(() => {
    const el = ref.current
    if (!running || !desktop || !el) return
    let raf = 0
    let last = ''
    const send = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      // Hidden while partly under the top bar, off the window or under a menu or panel.
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      const inView = r.top >= bar && r.bottom <= window.innerHeight && r.width > 1 && r.height > 1
      const rect: PreviewRect | null =
        inView && !covered(r)
          ? { x: r.left, y: r.top, w: r.width, h: r.height, vh: window.innerHeight }
          : null
      // The window's height is part of it: the native side places the view from the bottom.
      const key = JSON.stringify([rect, window.innerHeight])
      if (key === last) return
      last = key
      void api.preview(rect).catch(() => {
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
      void api.preview(null).catch(() => undefined)
    }
  }, [api, running, desktop])
  const editing = useStageEdit(ref, running && desktop)
  // The canvas is an exact 16:9 box fitted inside the stage, with room around it (no bars).
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-inset p-3 [container-type:size]">
      <div
        ref={ref}
        aria-label="Studio preview. Click a source to pick it, drag to move it, drag a handle to resize it, arrow keys nudge it."
        className="grid aspect-video w-[min(100cqw,100cqh*16/9)] touch-none place-items-center rounded-[10px] bg-[#0a0b0d] p-4 text-center text-[13px] text-[#9aa1ac] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent"
        {...editing}
      >
        {!desktop && 'The live picture shows in the Ferrocast app.'}
      </div>
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
}

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
          {t.kind !== 'cut_transition' && (
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
      </span>
      {inDesktopApp() && (
        <IconButton size="sm" label="Projectors and multiview" onClick={projectors}>
          <ProjectorScreen size={17} weight="bold" />
        </IconButton>
      )}
      {menu}
    </div>
  )
}
