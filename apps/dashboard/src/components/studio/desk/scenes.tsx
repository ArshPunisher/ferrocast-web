// The Scenes panel: click one to put it on air (through the transition), double-click to
// rename; add, copy, move up or down, remove.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowsLeftRight,
  Broadcast,
  Camera,
  CaretDoubleDown,
  CaretDoubleUp,
  CaretDown,
  CaretUp,
  Copy,
  DotsSixVertical,
  DownloadSimple,
  Funnel,
  ListBullets,
  PencilSimple,
  Plus,
  SquaresFour,
  Stack,
  StackPlus,
  Trash,
} from '@phosphor-icons/react'
import { type EngineScene, type EngineTransition } from '@ferrocast/api'
import { ConfirmDialog, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { done, useAction } from '../../../lib/hooks'
import { KindTile, useDesk } from './common'
import { DockHeader } from './layout'
import { ImportObsDialog } from './import-obs'
import { TRANSITIONS, transitionSummary } from './transitions'
import { pretty } from './settings'
import { filterItems, projectorItem, useContextMenu, type MenuItem } from './menu'

/** A name not used yet: "Scene 2", "Scene 3"… */
function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`
}

const GRID_KEY = 'fc-studio-scenes-grid'

/** OBS's Grid Mode for scenes, remembered on this computer. */
function useGrid(): [boolean, (on: boolean) => void] {
  const [grid, setGrid] = useState(() => {
    try {
      return localStorage.getItem(GRID_KEY) === '1'
    } catch {
      return false
    }
  })
  const set = (on: boolean) => {
    setGrid(on)
    try {
      localStorage.setItem(GRID_KEY, on ? '1' : '0')
    } catch {
      // Not kept (private window): it still works until the page reloads.
    }
  }
  return [grid, set]
}

/** How often each scene's picture in the grid is drawn again. */
const THUMB_MS = 2500

/**
 * Each scene's picture for the grid (PNG data URLs), drawn again every few seconds while the
 * grid is on screen and the window is visible, one scene at a time, as OBS's multiview.
 * Only in the app: from a phone they'd go through the relay.
 */
function useSceneThumbs(names: string[], on: boolean): Record<string, string> {
  const { api } = useDesk()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const key = names.join('\n')
  useEffect(() => {
    if (!on || !inDesktopApp() || !key) return
    let alive = true
    let timer = 0
    const list = key.split('\n')
    const round = async () => {
      if (document.visibilityState === 'visible') {
        for (const name of list) {
          if (!alive) return
          const t = await api.thumbnail(name, 256).catch(() => null)
          if (alive && t) setThumbs((m) => (m[name] === t.image ? m : { ...m, [name]: t.image }))
        }
      }
      if (alive) timer = window.setTimeout(() => void round(), THUMB_MS)
    }
    void round()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [api, on, key])
  return thumbs
}

/** A scene's "Show over every scene" (Exeldro's Downstream Keyer, built in): ticked when it is
 *  the top layer; choosing it again takes it off. */
export function topLayerItem(
  name: string,
  top: string | null,
  set: (scene: string | null) => void,
): MenuItem {
  return {
    label: 'Show over every scene',
    icon: StackPlus,
    checked: top === name,
    onSelect: () => set(top === name ? null : name),
  }
}

export function ScenesDock() {
  const desk = useDesk()
  const { api, scenes, refresh, edit, openTransitions } = desk
  const { busy, run } = useAction()
  const { open, menu } = useContextMenu()
  const [naming, setNaming] = useState<{ from: string | null; value: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [grid, setGrid] = useGrid()
  // The vertical picture's own scenes while it's the one picked.
  const tall = desk.canvas === 'vertical' ? (scenes.data?.vertical ?? null) : null
  const list = tall ? tall.scenes : scenes.data?.scenes
  const thumbs = useSceneThumbs(list?.map((s) => s.name) ?? [], grid)
  const keys = desk.prefs.data?.hotkeys ?? {}
  const studio = !tall && !!scenes.data?.preview
  const current = (tall ? tall.current : scenes.data?.current) ?? ''
  const preview = (studio ? scenes.data?.preview : null) ?? ''
  const selected = studio && preview ? preview : current
  const targetLabel = selected || (studio ? 'preview scene' : 'scene on air')
  const onAirNote = selected && selected === current ? ' (on air)' : ''
  // The top layer is the main picture's (not the vertical one's).
  const top = tall ? null : (scenes.data?.top_layer ?? null)
  const names = list?.map((s) => s.name) ?? []
  const at = names.indexOf(selected)
  const canDrag = names.length >= 2 && naming === null && busy === null

  const act = useCallback(
    async (key: string, f: () => Promise<unknown>) => {
      const ok = await run(key, () => done(f()))
      if (ok) refresh()
      return ok
    },
    [run, refresh],
  )

  // Keyboard and pointer reorder state.
  const scrollRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<string | null>(null)
  const [liveMsg, setLiveMsg] = useState<{ text: string; seq: number } | null>(null)

  const announceMove = useCallback((name: string, to: number, total: number) => {
    setLiveMsg((prev) => ({
      text: `Moved ${name} to position ${to + 1} of ${total}`,
      seq: (prev?.seq ?? 0) + 1,
    }))
  }, [])

  const moveSceneTo = useCallback(
    (name: string, to: number, total: number, keepFocus = false) => {
      if (keepFocus) pendingFocus.current = name
      void act(`move:${name}`, () => api.moveScene(name, to)).then((ok) => {
        if (ok) {
          announceMove(name, to, total)
        } else if (keepFocus && pendingFocus.current === name) {
          pendingFocus.current = null
        }
      })
    },
    [act, announceMove, api],
  )

  type SceneDrop = { name: string; after: boolean; to: number }
  const dragged = useRef<{
    name: string
    pointerId: number
    el: HTMLElement | null
    x: number
    y: number
    on: boolean
  } | null>(null)
  const pointerPos = useRef<{ x: number; y: number } | null>(null)
  const scrollRaf = useRef<number | null>(null)
  const suppressRef = useRef<{
    pointerId: number
    released: boolean
    timer: number | null
    cleanup: () => void
  } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<SceneDrop | null>(null)

  const clearSuppress = useCallback(() => {
    const s = suppressRef.current
    if (!s) return
    suppressRef.current = null
    if (s.timer !== null) window.clearTimeout(s.timer)
    s.cleanup()
  }, [])

  const armSuppressClick = useCallback(
    (pointerId: number, releasedNow: boolean) => {
      clearSuppress()
      const entry = {
        pointerId,
        released: releasedNow,
        timer: null as number | null,
        cleanup: () => undefined,
      }
      const startExpiry = () => {
        if (entry.timer !== null) window.clearTimeout(entry.timer)
        entry.released = true
        entry.timer = window.setTimeout(() => {
          if (suppressRef.current === entry) clearSuppress()
        }, 400)
      }
      const onClick = (ev: MouseEvent) => {
        if (suppressRef.current !== entry) return
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation()
        clearSuppress()
      }
      const onPointerDown = (ev: PointerEvent) => {
        if (suppressRef.current !== entry) return
        if (entry.released || ev.pointerType === 'mouse' || ev.isPrimary) {
          clearSuppress()
        }
      }
      const onKeyDown = (ev: KeyboardEvent) => {
        if (suppressRef.current !== entry) return
        if (ev.key === 'Enter' || ev.key === ' ') {
          clearSuppress()
        }
      }
      const onRelease = (ev: PointerEvent) => {
        if (suppressRef.current !== entry || ev.pointerId !== entry.pointerId) return
        if (!entry.released) startExpiry()
      }
      entry.cleanup = () => {
        window.removeEventListener('click', onClick, true)
        window.removeEventListener('pointerdown', onPointerDown, true)
        window.removeEventListener('keydown', onKeyDown, true)
        window.removeEventListener('pointerup', onRelease, true)
        window.removeEventListener('pointercancel', onRelease, true)
      }
      suppressRef.current = entry
      window.addEventListener('click', onClick, true)
      window.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('pointerup', onRelease, true)
      window.addEventListener('pointercancel', onRelease, true)
      if (releasedNow) startExpiry()
    },
    [clearSuppress],
  )

  useEffect(() => {
    const name = pendingFocus.current
    if (!name) return
    const el = btnRefs.current.get(name)
    if (el) {
      pendingFocus.current = null
      el.focus()
    }
  }, [list])

  const computeDrop = (x: number, y: number, fromName: string): SceneDrop | null => {
    const fromIdx = names.indexOf(fromName)
    if (fromIdx < 0 || !scrollRef.current) return null
    const els = Array.from(scrollRef.current.querySelectorAll<HTMLElement>('[data-scene-name]'))
    if (!els.length) return null
    let targetName: string | null = null
    let after = false

    if (!grid) {
      for (const el of els) {
        const name = el.dataset.sceneName
        if (!name) continue
        const r = el.getBoundingClientRect()
        if (y < r.top) {
          targetName = name
          after = false
          break
        }
        if (y <= r.bottom) {
          targetName = name
          after = y > r.top + r.height / 2
          break
        }
      }
      if (!targetName) {
        const last = els[els.length - 1]?.dataset.sceneName
        if (last) {
          targetName = last
          after = true
        }
      }
    } else {
      let bestDist = Infinity
      for (const el of els) {
        const name = el.dataset.sceneName
        if (!name) continue
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          targetName = name
          after = x > r.left + r.width / 2
          break
        }
        const cx = Math.max(r.left, Math.min(x, r.right))
        const cy = Math.max(r.top, Math.min(y, r.bottom))
        const dist = Math.hypot(x - cx, y - cy)
        if (dist < bestDist) {
          bestDist = dist
          targetName = name
          after = x > r.left + r.width / 2
        }
      }
    }

    if (!targetName) return null
    const withoutFrom = names.filter((n) => n !== fromName)
    const withoutIdx = withoutFrom.indexOf(targetName)
    if (withoutIdx < 0) return null
    const to = withoutIdx + (after ? 1 : 0)
    if (to === fromIdx) return null
    return { name: targetName, after, to }
  }

  const computeDropRef = useRef(computeDrop)
  computeDropRef.current = computeDrop

  const dragHandlers = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    cancel: (releasedNow?: boolean) => void
  } | null>(null)
  const windowListeners = useRef<{
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    cancel: () => void
    key: (e: KeyboardEvent) => void
  } | null>(null)

  const stopScrollLoop = useCallback(() => {
    if (scrollRaf.current !== null) {
      window.cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = null
    }
    pointerPos.current = null
  }, [])

  const detachDragListeners = useCallback(() => {
    stopScrollLoop()
    const wl = windowListeners.current
    if (!wl) return
    windowListeners.current = null
    window.removeEventListener('pointermove', wl.move)
    window.removeEventListener('pointerup', wl.up)
    window.removeEventListener('pointercancel', wl.cancel)
    window.removeEventListener('blur', wl.cancel)
    window.removeEventListener('keydown', wl.key, true)
  }, [stopScrollLoop])

  const endDragSession = useCallback((d: NonNullable<typeof dragged.current>) => {
    delete document.body.dataset.sceneDrag
    try {
      if (d.el?.hasPointerCapture?.(d.pointerId)) {
        d.el.releasePointerCapture(d.pointerId)
      }
    } catch {
      // Ignore if capture was already released.
    }
  }, [])

  const cancelDrag = useCallback(
    (releasedNow = true) => {
      const d = dragged.current
      dragged.current = null
      detachDragListeners()
      if (d) {
        endDragSession(d)
        if (d.on) armSuppressClick(d.pointerId, releasedNow)
      }
      setDragging(null)
      setGhost(null)
      setDrop(null)
    },
    [armSuppressClick, detachDragListeners, endDragSession],
  )

  const stepAutoScroll = useCallback(() => {
    scrollRaf.current = null
    const d = dragged.current
    const boxEl = scrollRef.current
    const pos = pointerPos.current
    if (!d || !d.on || !boxEl || !pos) return
    const box = boxEl.getBoundingClientRect()
    let delta = 0
    if (box.height > 0) {
      if (pos.y < box.top + 32 && boxEl.scrollTop > 0) delta = -8
      else if (pos.y > box.bottom - 32 && boxEl.scrollTop + boxEl.clientHeight < boxEl.scrollHeight)
        delta = 8
    }
    if (delta !== 0) {
      boxEl.scrollTop += delta
      const next = computeDropRef.current(pos.x, pos.y, d.name)
      setDrop((prev) =>
        prev?.name === next?.name && prev?.after === next?.after && prev?.to === next?.to
          ? prev
          : next,
      )
      scrollRaf.current = window.requestAnimationFrame(stepAutoScroll)
    }
  }, [])

  dragHandlers.current = {
    move: (e: PointerEvent) => {
      const d = dragged.current
      if (!d || e.pointerId !== d.pointerId) return
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        cancelDrag(true)
        return
      }
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
        d.on = true
        document.body.dataset.sceneDrag = '1'
        try {
          d.el?.setPointerCapture?.(e.pointerId)
        } catch {
          // Synthetic events without an active browser pointer cannot capture.
        }
        setDragging(d.name)
      }
      pointerPos.current = { x: e.clientX, y: e.clientY }
      if (scrollRef.current) {
        const boxEl = scrollRef.current
        const box = boxEl.getBoundingClientRect()
        if (box.height > 0) {
          if (e.clientY < box.top + 32) {
            boxEl.scrollTop -= 8
            if (scrollRaf.current === null && boxEl.scrollTop > 0)
              scrollRaf.current = window.requestAnimationFrame(stepAutoScroll)
          } else if (e.clientY > box.bottom - 32) {
            boxEl.scrollTop += 8
            if (
              scrollRaf.current === null &&
              boxEl.scrollTop + boxEl.clientHeight < boxEl.scrollHeight
            ) {
              scrollRaf.current = window.requestAnimationFrame(stepAutoScroll)
            }
          } else {
            if (scrollRaf.current !== null) {
              window.cancelAnimationFrame(scrollRaf.current)
              scrollRaf.current = null
            }
          }
        }
      }
      setGhost({ x: e.clientX, y: e.clientY })
      const next = computeDrop(e.clientX, e.clientY, d.name)
      setDrop((prev) =>
        prev?.name === next?.name && prev?.after === next?.after && prev?.to === next?.to
          ? prev
          : next,
      )
    },
    up: (e: PointerEvent) => {
      const d = dragged.current
      if (!d || e.pointerId !== d.pointerId) return
      dragged.current = null
      detachDragListeners()
      endDragSession(d)
      if (!d.on) return
      armSuppressClick(d.pointerId, true)
      const next = computeDrop(e.clientX, e.clientY, d.name)
      setDragging(null)
      setGhost(null)
      setDrop(null)
      if (!next) return
      moveSceneTo(d.name, next.to, names.length)
    },
    cancel: (releasedNow = true) => {
      cancelDrag(releasedNow)
    },
  }

  useEffect(() => {
    if (!canDrag && dragged.current) cancelDrag(true)
  }, [canDrag, cancelDrag])

  useEffect(
    () => () => {
      delete document.body.dataset.sceneDrag
      detachDragListeners()
      clearSuppress()
    },
    [clearSuppress, detachDragListeners],
  )

  const pressScene = (e: ReactPointerEvent<HTMLElement>, sceneName: string) => {
    if (!canDrag || e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag], input'))
      return
    if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('[data-drag-handle]'))
      return
    clearSuppress()
    detachDragListeners()
    dragged.current = {
      name: sceneName,
      pointerId: e.pointerId,
      el: e.currentTarget,
      x: e.clientX,
      y: e.clientY,
      on: false,
    }
    const wl = {
      move: (ev: PointerEvent) => dragHandlers.current?.move(ev),
      up: (ev: PointerEvent) => dragHandlers.current?.up(ev),
      cancel: () => dragHandlers.current?.cancel(true),
      key: (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && dragged.current) {
          ev.preventDefault()
          ev.stopPropagation()
          // Pointer button may still be held after Escape; hold suppression until release.
          dragHandlers.current?.cancel(false)
        }
      },
    }
    windowListeners.current = wl
    window.addEventListener('pointermove', wl.move)
    window.addEventListener('pointerup', wl.up)
    window.addEventListener('pointercancel', wl.cancel)
    window.addEventListener('blur', wl.cancel)
    window.addEventListener('keydown', wl.key, true)
  }
  const commitName = async () => {
    if (!naming) return
    const value = naming.value.trim()
    if (!value || value === naming.from) return setNaming(null)
    const ok = await act('name', () =>
      naming.from ? api.rename(naming.from, value) : api.addScene(value, !!tall),
    )
    if (ok) setNaming(null)
  }

  const shoot = (name: string) =>
    void run('shot', () => api.screenshot(name), {
      success: 'Screenshot saved with your recordings.',
    })
  const overrideBadge = (s: EngineScene, compactGrid: boolean) => {
    if ((!s.transition_name && !s.transition) || s.current) return null
    const label = s.transition_name ?? TRANSITIONS[s.transition!.kind] ?? s.transition!.kind
    return (
      <span
        title={`Transition override: ${label}`}
        className={cx(
          'shrink-0 items-center gap-1 rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-text',
          compactGrid ? 'inline-flex' : 'hidden @[230px]:inline-flex',
        )}
      >
        <ArrowsLeftRight size={11} weight="bold" aria-hidden />
        {!compactGrid && <span className="max-w-20 truncate">{label}</span>}
      </span>
    )
  }
  const sceneMenu = (scene: EngineScene, i: number): MenuItem[] => {
    const { name, current: onAir } = scene
    const t = scene.transition
    const namedList = scenes.data?.named_transitions ?? []
    const ms = scenes.data?.transition.ms ?? 300
    const setT = (next: EngineTransition | null) =>
      void act('transition', () => api.setSceneTransition(name, next))
    const setNamedOverride = (trName: string | null) =>
      void act('transition', () =>
        namedList.length > 0
          ? api.setTransitionMatrixRule({ from: null, to: name, transition: trName })
          : api.setSceneTransition(name, null),
      )
    return [
      {
        label: 'Put on air',
        icon: Broadcast,
        disabled: onAir,
        onSelect: () => void act(`go:${name}`, () => api.setCurrent(name)),
      },
      { sep: true },
      {
        label: 'Add scene',
        icon: Plus,
        onSelect: () => setNaming({ from: null, value: freeName('Scene', names) }),
      },
      {
        label: 'Duplicate',
        icon: Copy,
        onSelect: () => void act('copy', () => api.duplicateScene(name, freeName(name, names))),
      },
      {
        label: 'Rename',
        icon: PencilSimple,
        hint: 'F2',
        onSelect: () => setNaming({ from: name, value: name }),
      },
      {
        label: 'Order',
        icon: Stack,
        items: [
          {
            label: 'Up',
            icon: CaretUp,
            disabled: i <= 0,
            onSelect: () => moveSceneTo(name, i - 1, names.length),
          },
          {
            label: 'Down',
            icon: CaretDown,
            disabled: i >= names.length - 1,
            onSelect: () => moveSceneTo(name, i + 1, names.length),
          },
          {
            label: 'To the top',
            icon: CaretDoubleUp,
            disabled: i <= 0,
            onSelect: () => moveSceneTo(name, 0, names.length),
          },
          {
            label: 'To the bottom',
            icon: CaretDoubleDown,
            disabled: i >= names.length - 1,
            onSelect: () => moveSceneTo(name, names.length - 1, names.length),
          },
        ],
      },
      // A vertical scene is cut-only: there are no transitions to override (the engine would 404).
      ...((tall
        ? []
        : [
            { sep: true },
            {
              label: 'Transition override',
              icon: ArrowsLeftRight,
              items: [
                {
                  label: 'Use matrix / default',
                  checked: !scene.transition_name && !t,
                  onSelect: () => setNamedOverride(null),
                },
                { sep: true },
                ...(namedList.length > 0
                  ? namedList.map((nt) => ({
                      label: `${nt.name} (${transitionSummary(nt)})`,
                      checked: scene.transition_name === nt.name,
                      onSelect: () => setNamedOverride(nt.name),
                    }))
                  : Object.entries(TRANSITIONS).map(([kind, label]) => ({
                      label:
                        kind === 'cut_transition' || kind === 'obs_stinger_transition'
                          ? label
                          : `${label}, ${t?.kind === kind ? t.ms : ms} ms`,
                      checked: t?.kind === kind,
                      onSelect: () =>
                        setT({
                          kind,
                          ms: kind === 'cut_transition' ? 0 : t?.kind === kind ? t.ms : ms,
                        }),
                    }))),
                ...(openTransitions
                  ? [
                      { sep: true } as const,
                      {
                        label: 'Transitions and matrix...',
                        icon: ArrowsLeftRight,
                        onSelect: () => openTransitions({ tab: 'matrix' }),
                      },
                    ]
                  : []),
              ],
            },
          ]) as MenuItem[]),
      ...(tall
        ? []
        : [topLayerItem(name, top, (next) => void act('top', () => api.setTopLayer(next)))]),
      { label: 'Screenshot', icon: Camera, onSelect: () => shoot(name) },
      ...(inDesktopApp()
        ? [
            projectorItem(
              'Projector',
              desk.screens.data,
              (screen, onTop) =>
                void run('projector', () =>
                  api.projector({
                    what: 'source',
                    name,
                    ...(screen === undefined ? {} : { screen }),
                    ...(onTop ? { on_top: true } : {}),
                  }),
                ),
            ),
          ]
        : []),
      { label: 'Filters', icon: Funnel, onSelect: () => edit(name, 'filters') },
      ...filterItems(name, {
        ...desk,
        paste: (from) =>
          void run('filters', () => done(api.pasteFilters(name, from)), {
            success: `Filters pasted onto ${name}.`,
          }),
      }),
      { sep: true },
      {
        label: 'Remove',
        icon: Trash,
        danger: true,
        disabled: names.length < 2,
        onSelect: () => setRemoving(name),
      },
    ]
  }

  const nameInput = (
    <form
      className={cx('py-1', !grid && 'flex items-center gap-2.5 border-b border-line pr-2 pl-3')}
      onSubmit={(e) => {
        e.preventDefault()
        void commitName()
      }}
    >
      {/* The scene's icon stays while it's named, as in the list (owner, 28 Oct). */}
      {!grid && <KindTile kind="scene" size={20} />}
      <Input
        autoFocus
        data-autofocus
        aria-label={naming?.from ? `New name for ${naming.from}` : 'New scene name'}
        className="h-7! min-w-0 flex-1 rounded-[5px]! text-[13.5px]"
        maxLength={100}
        value={naming?.value ?? ''}
        onChange={(e) => setNaming((n) => n && { ...n, value: e.target.value })}
        onBlur={() => void commitName()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setNaming(null)
        }}
      />
    </form>
  )

  return (
    <section aria-label="Scenes" className="flex min-h-0 flex-1 flex-col">
      {ghost && dragging && (
        <div
          aria-hidden
          data-scene-ghost
          className="pointer-events-none fixed z-50 flex max-w-[260px] cursor-grabbing items-center gap-2 rounded-[10px] border border-[var(--fc-accent)] bg-surface-1 py-1.5 pr-3 pl-2 text-[13.5px] font-bold text-text shadow-pop"
          style={{ left: ghost.x + 14, top: ghost.y - 18 }}
        >
          <KindTile kind="scene" size={20} />
          <span className="truncate">{dragging}</span>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMsg ? <span key={liveMsg.seq}>{liveMsg.text}</span> : null}
      </p>
      <DockHeader
        id="scenes"
        {...(tall
          ? {
              info: (
                <span className="truncate rounded-full bg-accent-soft px-2 py-0.5 text-[12.5px] font-bold text-accent-text">
                  Vertical
                </span>
              ),
            }
          : {})}
        actions={
          <>
            <IconButton
              size="sm"
              label={grid ? 'Show scenes as a list' : 'Show scenes as a grid'}
              onClick={() => setGrid(!grid)}
            >
              {grid ? (
                <ListBullets size={16} weight="bold" />
              ) : (
                <SquaresFour size={16} weight="bold" />
              )}
            </IconButton>
            {openTransitions && !tall && (
              <IconButton
                size="sm"
                label="Manage transitions and matrix"
                onClick={() => openTransitions({ tab: 'matrix' })}
              >
                <ArrowsLeftRight size={16} weight="bold" />
              </IconButton>
            )}
            <IconButton size="sm" label="Import scenes from OBS" onClick={() => setImporting(true)}>
              <DownloadSimple size={16} weight="bold" />
            </IconButton>
            <IconButton
              size="sm"
              label="Add a scene"
              onClick={() => setNaming({ from: null, value: freeName('Scene', names) })}
            >
              <Plus size={16} weight="bold" />
            </IconButton>
          </>
        }
      />
      <div
        ref={scrollRef}
        className={cx('min-h-0 flex-1 overflow-y-auto', grid && 'p-1.5')}
        onContextMenu={(e) =>
          open(e, 'Scenes', [
            {
              label: 'Add scene',
              icon: Plus,
              onSelect: () => setNaming({ from: null, value: freeName('Scene', names) }),
            },
            {
              label: 'Import from OBS or Streamlabs',
              icon: DownloadSimple,
              onSelect: () => setImporting(true),
            },
            { sep: true },
            {
              label: 'Grid mode',
              icon: SquaresFour,
              checked: grid,
              onSelect: () => setGrid(!grid),
            },
          ])
        }
      >
        {scenes.error && !list ? (
          <LoadError error={scenes.error} onRetry={scenes.reload} />
        ) : !list ? (
          <Skeleton className="m-1.5 h-28" />
        ) : (
          <ul
            className={cx(
              grid
                ? 'grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5'
                : // Narrow (owner's pick N1): the extras go first, the name keeps its room.
                  '@container flex flex-col',
            )}
            onBlur={(e) => {
              if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
                pendingFocus.current = null
              }
            }}
            aria-label={
              studio ? 'Scenes, click to show in the preview' : 'Scenes, click to go on air'
            }
          >
            {list.map((s, i) => {
              const marker = drop?.name === s.name ? (drop.after ? 'after' : 'before') : null
              return (
                <li
                  key={s.name}
                  data-scene-name={s.name}
                  onPointerDown={(e) => pressScene(e, s.name)}
                  onLostPointerCapture={(e) => {
                    const d = dragged.current
                    if (d && d.on && e.pointerId === d.pointerId) cancelDrag(true)
                  }}
                  onClickCapture={(e) => {
                    if (suppressRef.current) {
                      e.preventDefault()
                      e.stopPropagation()
                      clearSuppress()
                    }
                  }}
                  className="relative min-w-0 select-none"
                >
                  {marker && (
                    <span
                      aria-hidden
                      data-drop-line
                      className={cx(
                        'pointer-events-none absolute z-10 rounded-full bg-accent',
                        grid
                          ? cx(
                              'top-1 bottom-1 w-[3px]',
                              marker === 'before' ? '-left-[4px]' : '-right-[4px]',
                            )
                          : cx(
                              'right-1 left-1 h-[3px]',
                              marker === 'before' ? '-top-[2px]' : '-bottom-[2px]',
                            ),
                      )}
                    />
                  )}
                  {naming?.from === s.name ? (
                    nameInput
                  ) : (
                    <button
                      ref={(el) => {
                        if (el) btnRefs.current.set(s.name, el)
                        else btnRefs.current.delete(s.name)
                      }}
                      type="button"
                      aria-current={s.current ? 'true' : undefined}
                      aria-keyshortcuts={
                        canDrag
                          ? grid
                            ? 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight'
                            : 'Alt+ArrowUp Alt+ArrowDown'
                          : undefined
                      }
                      title={grid ? s.name : undefined}
                      onClick={() => {
                        if (suppressRef.current) return
                        // Studio Mode: a click shows it in the preview; Transition sends it on air.
                        if (studio) {
                          if (!s.preview) void act(`pv:${s.name}`, () => api.setPreview(s.name))
                        } else if (!s.current) {
                          void act(`go:${s.name}`, () => api.setCurrent(s.name))
                        }
                      }}
                      onDoubleClick={() =>
                        // Studio Mode with "Double-click to send on air": straight on air, as in
                        // OBS; otherwise a double-click renames it.
                        studio && scenes.data?.studio_options?.double_click
                          ? void act(`go:${s.name}`, async () => {
                              await api.setPreview(s.name)
                              await api.transitionNow()
                            })
                          : setNaming({ from: s.name, value: s.name })
                      }
                      onContextMenu={(e) => {
                        desk.screens.reload()
                        open(e, s.name, sceneMenu(s, i))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'F2') {
                          setNaming({ from: s.name, value: s.name })
                          return
                        }
                        const dir =
                          e.key === 'ArrowUp' || (grid && e.key === 'ArrowLeft')
                            ? -1
                            : e.key === 'ArrowDown' || (grid && e.key === 'ArrowRight')
                              ? 1
                              : 0
                        if (
                          dir !== 0 &&
                          ((e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
                            (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey))
                        ) {
                          e.preventDefault()
                          const nextIdx = i + dir
                          if (!canDrag || nextIdx < 0 || nextIdx >= names.length) return
                          moveSceneTo(s.name, nextIdx, names.length, true)
                        }
                      }}
                      className={cx(
                        'group w-full text-left font-semibold text-text transition-[background-color,box-shadow,transform] duration-150',
                        grid
                          ? 'grid gap-1 rounded-control border border-line bg-surface-2 p-1 text-[13.5px] hover:border-line-strong active:scale-[0.98]'
                          : cx(
                              'flex min-h-8 items-center gap-2 border-b border-line pr-2 text-[13.5px] hover:bg-surface-2 [@media(pointer:coarse)]:min-h-[44px]',
                              canDrag ? 'pl-2' : 'pl-3',
                            ),
                        dragging === s.name &&
                          'opacity-50 outline-2 -outline-offset-2 outline-line-strong outline-dashed',
                        // What's picked: on air, or Studio Mode's preview being edited.
                        (studio ? s.preview : s.current) && 'fc-picked border-transparent',
                        // Studio Mode's preview in the list: the accent ring (on air keeps its red).
                        !grid &&
                          s.preview &&
                          !s.current &&
                          'shadow-[inset_0_0_0_1.5px_var(--fc-accent-text)]',
                      )}
                    >
                      {grid ? (
                        <>
                          {/* The scene's picture, as OBS's multiview: red ring and LIVE on air,
                              Arc and PREVIEW for Studio Mode's preview. */}
                          <span
                            className={cx(
                              'relative block overflow-hidden rounded-[calc(var(--fc-radius-control)-3px)] bg-inset',
                              tall ? 'mx-auto aspect-[9/16] h-24' : 'aspect-video',
                              s.current && 'shadow-[inset_0_0_0_2px_var(--fc-danger-fill)]',
                              s.preview &&
                                !s.current &&
                                'shadow-[inset_0_0_0_2px_var(--fc-accent-text)]',
                            )}
                          >
                            {thumbs[s.name] ? (
                              <img
                                src={thumbs[s.name]}
                                alt=""
                                className="size-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <span className="grid size-full place-items-center">
                                <KindTile kind="scene" size={26} />
                              </span>
                            )}
                            {(s.current || s.preview) && (
                              <span
                                className={cx(
                                  'absolute top-1.5 left-1.5 rounded-[4px] px-1.5 py-[3px] font-mono text-[10px] leading-none font-extrabold tracking-[0.06em]',
                                  s.current ? 'bg-danger-fill text-white' : 'bg-pick text-on-pick',
                                )}
                              >
                                {s.current ? 'LIVE' : 'PREVIEW'}
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5 px-1 pb-0.5">
                            {canDrag && (
                              <span
                                aria-hidden
                                data-drag-handle
                                className="flex shrink-0 touch-none items-center justify-center rounded-[4px] text-text-3 opacity-60 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:-ml-1 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
                              >
                                <DotsSixVertical size={13} weight="bold" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            {overrideBadge(s, true)}
                            {keys[`scene:${s.name}`] && (
                              <kbd className="shrink-0 rounded-[5px] border border-current/25 px-1 py-px font-mono text-[11px] font-bold opacity-80">
                                {pretty(keys[`scene:${s.name}`] as string)}
                              </kbd>
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          {canDrag && (
                            <span
                              aria-hidden
                              data-drag-handle
                              className="flex shrink-0 touch-none items-center justify-center rounded-[4px] py-1 text-text-3 opacity-60 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:-my-1 [@media(pointer:coarse)]:-ml-1 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
                            >
                              <DotsSixVertical size={14} weight="bold" />
                            </span>
                          )}
                          <KindTile
                            kind="scene"
                            size={20}
                            tone={s.current ? 'var(--fc-danger)' : undefined}
                          />
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          {overrideBadge(s, false)}
                          {top === s.name && (
                            <span
                              title="Shown over every scene"
                              className="shrink-0 text-accent-text"
                            >
                              <StackPlus size={15} weight="bold" aria-hidden />
                              <span className="sr-only">Shown over every scene</span>
                            </span>
                          )}
                          {s.preview && !s.current && (
                            <span className="hidden text-[12px] font-bold text-accent-text @[240px]:inline">
                              Preview
                            </span>
                          )}
                          {s.items > 0 && !s.current && (
                            <span className="hidden font-mono text-[12.5px] font-semibold text-text-3 tabular-nums @[240px]:inline">
                              {s.items}
                            </span>
                          )}
                          {s.current && (
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-bold text-danger">
                              <span
                                aria-hidden
                                className="size-2 rounded-full bg-danger-fill shadow-[0_0_0_3px_rgb(239_59_82/0.25)]"
                              />
                              {/* Only the dot when narrow; the words stay for screen readers. */}
                              <span className="sr-only @[240px]:not-sr-only">On air</span>
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
            {naming && naming.from === null && <li>{nameInput}</li>}
          </ul>
        )}
      </div>
      <footer className="fc-dock-bar flex h-8 flex-none items-center gap-0.5 border-t border-line px-1">
        <IconButton
          size="sm"
          label={`Move ${targetLabel} up`}
          disabled={at <= 0 || busy !== null}
          onClick={() => moveSceneTo(selected, at - 1, names.length)}
        >
          <CaretUp size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label={`Move ${targetLabel} down`}
          disabled={at < 0 || at >= names.length - 1 || busy !== null}
          onClick={() => moveSceneTo(selected, at + 1, names.length)}
        >
          <CaretDown size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label={`Copy ${targetLabel}`}
          disabled={!selected || busy !== null}
          onClick={() =>
            void act('copy', () => api.duplicateScene(selected, freeName(selected, names)))
          }
        >
          <Copy size={15} />
        </IconButton>
        <span className="flex-1" />
        <IconButton
          size="sm"
          variant="ghost"
          className="hover:bg-danger-soft hover:text-danger"
          label={`Remove ${targetLabel}${onAirNote}`}
          disabled={names.length < 2 || !selected || busy !== null}
          onClick={() => setRemoving(selected)}
        >
          <Trash size={15} />
        </IconButton>
      </footer>
      {menu}
      <ImportObsDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove the scene ${removing ?? ''}?`}
        description="Its sources stay in the other scenes they're in."
        confirm="Remove"
        onConfirm={() => {
          const s = removing
          if (!s) return
          void act('remove', async () => {
            await api.removeScene(s)
            if (studio && s === preview) {
              const nextPreview = names.find((n) => n !== s)
              if (nextPreview) await api.setPreview(nextPreview).catch(() => undefined)
            }
          })
        }}
      />
    </section>
  )
}
