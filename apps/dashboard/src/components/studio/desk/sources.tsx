// The Sources panel: what's in the scene on air, top first, as OBS lists it. Show or hide and
// lock each one; drag one up or down to put it over or under the others; pick one to move it,
// fit it, open its settings or remove it; right-click for everything else OBS's menu has
// (transform, order, blending, copy, filters, rename).

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsInSimple,
  ArrowsOut,
  ArrowsOutSimple,
  Camera,
  CaretDoubleDown,
  CaretDoubleUp,
  CaretDown,
  CaretRight,
  CaretUp,
  ClipboardText,
  Copy,
  CopySimple,
  CornersOut,
  Crosshair,
  CursorClick,
  Eye,
  EyeSlash,
  Faders,
  FilmReel,
  FlipHorizontal,
  FlipVertical,
  FrameCorners,
  Funnel,
  ImageSquare,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Play,
  Plus,
  Record as RecordIcon,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkle,
  Stack,
  Stop,
  Trash,
} from '@phosphor-icons/react'
import {
  ENGINE_BLENDS,
  ENGINE_DEINTERLACE,
  ENGINE_SCALE_FILTERS,
  type EngineDeinterlace,
  type EngineItem,
  type EngineTransition,
  type EngineItemEdit,
  type EngineProjector,
} from '@ferrocast/api'
import { Button, Dialog, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { done, useAction } from '../../../lib/hooks'
import { KindTile, useDesk } from './common'
import { DockHeader } from './layout'
import { filterItems, projectorItem, useContextMenu, type MenuItem } from './menu'
import { addsToPick } from './stage-edit'
import { TRANSITIONS } from './preview'

const SCALE_LABEL: Record<(typeof ENGINE_SCALE_FILTERS)[number], string> = {
  off: 'Off',
  point: 'Sharp pixels',
  bicubic: 'Smooth',
  bilinear: 'Fast',
  lanczos: 'Sharpest',
  area: 'Best for shrinking',
}

const DEINTERLACE_LABEL: Record<EngineDeinterlace, string> = {
  off: 'Off',
  discard: 'Discard',
  retro: 'Retro',
  blend: 'Blend',
  blend_2x: 'Blend 2x',
  linear: 'Linear',
  linear_2x: 'Linear 2x',
  yadif: 'Yadif',
  yadif_2x: 'Yadif 2x',
}

/** The ways in (or out) a source can have when it's shown (or hidden), as in OBS. */
const ITEM_TRANSITIONS: EngineTransition[] = Object.keys(TRANSITIONS)
  .filter((k) => k !== 'cut_transition')
  .flatMap((kind) =>
    kind === 'obs_stinger_transition'
      ? [{ kind, ms: 0 }]
      : [300, 500, 1000].map((ms) => ({ kind, ms })),
  )

const transitionLabel = (t: EngineTransition) =>
  t.kind === 'obs_stinger_transition'
    ? (TRANSITIONS[t.kind] ?? t.kind)
    : `${TRANSITIONS[t.kind] ?? t.kind} ${t.ms / 1000}s`

const BLEND_LABEL: Record<(typeof ENGINE_BLENDS)[number], string> = {
  normal: 'Normal',
  additive: 'Add',
  subtract: 'Subtract',
  screen: 'Screen',
  multiply: 'Multiply',
  lighten: 'Lighten',
  darken: 'Darken',
}

/** A row button that steps back in a narrow list: there on hover or focus (a nested list sits in
 * the same container, so it follows the list's width). */
const quiet = 'fc-quiet'

export function SourcesDock() {
  const desk = useDesk()
  const { api, scene, items, refresh, selected, select, edit, setAdding, clip, setClip } = desk
  const { also, pickMore } = desk
  const { busy, run } = useAction()
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState<EngineItem | null>(null)
  const [naming, setNaming] = useState<{ from: string; value: string } | null>(null)
  const { open, menu } = useContextMenu()
  const list = items.data
  const flat = list?.flatMap((i) => [i, ...i.children]) ?? []
  const picked = flat.find((i) => i.id === selected) ?? null

  // Drag to reorder, as in OBS: a source moves among its neighbours (the scene's, or its
  // group's); higher in the list is on top in the picture. Pointer events, not the browser's
  // drag and drop (the app's window keeps that for files).
  const listRef = useRef<HTMLDivElement>(null)
  const dragged = useRef<{ id: number; y: number; on: boolean } | null>(null)
  const justDragged = useRef(false)
  const [dragging, setDragging] = useState<number | null>(null)
  // Where the pointer is while dragging: a chip with the source's name follows it.
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<{ id: number; after: boolean } | null>(null)
  const siblingsOf = (id: number): EngineItem[] | null => {
    if (!list) return null
    if (list.some((i) => i.id === id)) return list
    return list.find((g) => g.children.some((c) => c.id === id))?.children ?? null
  }
  // The neighbour under the pointer, and whether it goes after it.
  const dropAt = (y: number, from: number) => {
    const sib = siblingsOf(from)
    if (!sib) return null
    for (const el of listRef.current?.querySelectorAll<HTMLElement>('[data-item-id]') ?? []) {
      const id = Number(el.dataset.itemId)
      if (id === from || !sib.some((i) => i.id === id)) continue
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) return { id, after: y > r.top + r.height / 2 }
    }
    return null
  }
  const press = (e: PointerEvent<HTMLDivElement>, item: EngineItem) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag], input')) return
    dragged.current = { id: item.id, y: e.clientY, on: false }
  }
  const pull = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragged.current
    if (!d) return
    // The button was let go outside this row: the press is over.
    if (e.buttons === 0) {
      dragged.current = null
      setDragging(null)
      setGhost(null)
      setDrop(null)
      return
    }
    if (!d.on) {
      if (Math.abs(e.clientY - d.y) < 5) return
      d.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(d.id)
    }
    setGhost({ x: e.clientX, y: e.clientY })
    const at = dropAt(e.clientY, d.id)
    setDrop((p) => (p?.id === at?.id && p?.after === at?.after ? p : at))
  }
  const letGo = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragged.current
    dragged.current = null
    if (!d?.on) return
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
    // The click that ends a drag doesn't pick the source.
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 0)
    const at = dropAt(e.clientY, d.id)
    setDragging(null)
    setGhost(null)
    setDrop(null)
    const target = at && flat.find((i) => i.id === at.id)
    if (target) void reorder(d.id, target, at.after)
  }
  const reorder = async (id: number, target: EngineItem, after: boolean) => {
    const sib = siblingsOf(target.id)
    if (!sib) return
    const order = sib.filter((i) => i.id !== id)
    const at = order.findIndex((i) => i.id === target.id) + (after ? 1 : 0)
    if (sib.findIndex((i) => i.id === id) === at) return
    const ok = await run(`order:${id}`, () => done(api.itemOrder(scene, id, at)))
    if (ok) refresh()
  }

  const act = async (item: EngineItem, what: EngineItemEdit) => {
    const ok = await run(`${what}:${item.id}`, () => done(api.editItem(scene, item.id, what)))
    if (!ok) return
    if (what === 'remove') select(null)
    refresh()
  }
  const rename = async () => {
    if (!naming) return
    const to = naming.value.trim()
    if (!to || to === naming.from) return setNaming(null)
    const ok = await run('rename', () => done(api.rename(naming.from, to)))
    if (ok) {
      setNaming(null)
      refresh()
    }
  }
  const paste = async () => {
    if (!clip) return
    const ok = await run('paste', () => done(api.addExisting(scene, clip)), {
      success: `Added ${clip}.`,
    })
    if (ok) refresh()
  }
  const pasteCopy = async () => {
    if (!clip) return
    const ok = await run('paste', () => done(api.pasteCopy(scene, clip)), {
      success: `Pasted a copy of ${clip}.`,
    })
    if (ok) refresh()
  }
  // Groups in this scene, and which group (if any) an item is in.
  const groups = (list ?? []).filter((i) => i.group)
  const parentOf = (id: number) => groups.find((g) => g.children.some((c) => c.id === id)) ?? null
  const freeName = (base: string) => {
    const taken = new Set(flat.map((i) => i.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
  const grouping = (fn: () => Promise<unknown>, ok?: string) =>
    void run('group', () => done(fn()), ok ? { success: ok } : undefined).then(
      (r) => r && refresh(),
    )
  const pasteFilters = (to: string) => (from: string) =>
    void run('filters', () => done(api.pasteFilters(to, from)), {
      success: `Filters pasted onto ${to}.`,
    })

  const web = (item: EngineItem, what: 'interact' | 'reload') =>
    void run(`web:${item.id}`, () => done(api.web(item.name, what)))
  const project = (p: EngineProjector) => void run('projector', () => api.projector(p))
  const withRefresh = (key: string, f: () => Promise<unknown>) =>
    void run(key, () => done(f())).then((ok) => ok && refresh())
  const itemTransition = (item: EngineItem, show: boolean): MenuItem => {
    const now = show ? item.show_transition : item.hide_transition
    const set = (t: EngineTransition | null) =>
      withRefresh('item-transition', () => api.setItemTransition(scene, item.id, show, t))
    return {
      label: show ? 'Show transition' : 'Hide transition',
      icon: Sparkle,
      items: [
        { label: 'None (at once)', checked: !now, onSelect: () => set(null) },
        { sep: true },
        ...ITEM_TRANSITIONS.map((t) => ({
          label: transitionLabel(t),
          checked: !!now && now.kind === t.kind && (t.ms === 0 || now.ms === t.ms),
          onSelect: () => set(t),
        })),
      ],
    }
  }
  // OBS's "Resize output (source size)": the canvas takes this source's size.
  const fitCanvas = (item: EngineItem) =>
    void run(
      'canvas',
      async () => {
        const [t, s] = await Promise.all([api.transform(scene, item.id), api.studioSettings()])
        if (!t.width || !t.height) throw new Error(`${item.name} has no size yet.`)
        return api.setStudioSettings({ ...s, width: t.width, height: t.height })
      },
      { success: (r) => r?.restart ?? 'The canvas now matches this source.' },
    ).then((r) => r && refresh())
  const itemMenu = (item: EngineItem): MenuItem[] => {
    const recordingAlone = !!desk.stats?.source_records?.some((r) => r.name === item.name)
    return itemMenuWith(item, recordingAlone)
  }
  const itemMenuWith = (item: EngineItem, recordingAlone: boolean): MenuItem[] => [
    ...(item.kind === 'ferrocast_web'
      ? ([
          { label: 'Interact', icon: CursorClick, onSelect: () => web(item, 'interact') },
        ] satisfies MenuItem[])
      : []),
    ...(item.kind === 'ferrocast_web' || item.kind === 'browser_source'
      ? ([
          { label: 'Reload page', icon: ArrowClockwise, onSelect: () => web(item, 'reload') },
          { sep: true },
        ] satisfies MenuItem[])
      : []),
    { label: 'Settings', icon: SlidersHorizontal, onSelect: () => edit(item.name) },
    { label: 'Filters', icon: Funnel, onSelect: () => edit(item.name, 'filters') },
    {
      label: 'Rename',
      icon: PencilSimple,
      hint: 'F2',
      onSelect: () => setNaming({ from: item.name, value: item.name }),
    },
    { sep: true },
    {
      label: item.visible ? 'Hide' : 'Show',
      icon: item.visible ? EyeSlash : Eye,
      onSelect: () => void act(item, item.visible ? 'hide' : 'show'),
    },
    {
      label: item.locked ? 'Unlock' : 'Lock',
      icon: item.locked ? LockSimpleOpen : LockSimple,
      onSelect: () => void act(item, item.locked ? 'unlock' : 'lock'),
    },
    {
      label: 'Transform',
      icon: FrameCorners,
      disabled: item.locked,
      items: [
        {
          label: 'Edit transform',
          icon: SlidersHorizontal,
          hint: '⌘E',
          onSelect: () => desk.setTransforming({ scene, id: item.id, name: item.name }),
        },
        {
          label: 'Copy transform',
          icon: CopySimple,
          onSelect: () =>
            void run('transform', () => api.transform(scene, item.id)).then(
              (t) => t && desk.setTransformClip(t),
            ),
        },
        {
          label: 'Paste transform',
          icon: ClipboardText,
          disabled: !desk.transformClip,
          onSelect: () => {
            const t = desk.transformClip
            if (t)
              void run('transform', () => done(api.setTransform(scene, item.id, t))).then(
                (ok) => ok && refresh(),
              )
          },
        },
        { sep: true },
        { label: 'Fit to screen', icon: ArrowsInSimple, onSelect: () => void act(item, 'fit') },
        { label: 'Stretch to screen', icon: ArrowsOut, onSelect: () => void act(item, 'stretch') },
        { label: 'Centre', icon: Crosshair, onSelect: () => void act(item, 'center') },
        { sep: true },
        { label: 'Flip sideways', icon: FlipHorizontal, onSelect: () => void act(item, 'flip_h') },
        { label: 'Flip upside down', icon: FlipVertical, onSelect: () => void act(item, 'flip_v') },
        { sep: true },
        { label: 'Turn right', icon: ArrowClockwise, onSelect: () => void act(item, 'rotate_cw') },
        {
          label: 'Turn left',
          icon: ArrowCounterClockwise,
          onSelect: () => void act(item, 'rotate_ccw'),
        },
        {
          label: 'Turn around',
          icon: ArrowsClockwise,
          onSelect: () => void act(item, 'rotate180'),
        },
        { sep: true },
        { label: 'Reset', icon: ArrowsOutSimple, onSelect: () => void act(item, 'reset') },
      ],
    },
    {
      label: 'Order',
      icon: Stack,
      items: [
        { label: 'Up', icon: CaretUp, onSelect: () => void act(item, 'up') },
        { label: 'Down', icon: CaretDown, onSelect: () => void act(item, 'down') },
        { label: 'To the top', icon: CaretDoubleUp, onSelect: () => void act(item, 'top') },
        { label: 'To the bottom', icon: CaretDoubleDown, onSelect: () => void act(item, 'bottom') },
      ],
    },
    {
      label: 'Scaling',
      icon: ImageSquare,
      items: ENGINE_SCALE_FILTERS.map((f) => ({
        label: SCALE_LABEL[f],
        checked: item.scale_filter === f,
        onSelect: () => void act(item, `scale_${f}`),
      })),
    },
    {
      label: 'Blending',
      icon: Faders,
      items: [
        ...ENGINE_BLENDS.map((b) => ({
          label: BLEND_LABEL[b],
          checked: item.blend === b,
          onSelect: () => void act(item, `blend_${b}`),
        })),
        { sep: true as const },
        {
          label: 'sRGB off (older blending)',
          checked: !!item.srgb_off,
          onSelect: () =>
            void act(item, item.srgb_off ? 'blend_method_default' : 'blend_method_srgb_off'),
        },
      ],
    },
    ...(item.media
      ? ([
          {
            label: 'Play or pause',
            icon: Play,
            onSelect: () => void run('media', () => api.media(item.name, 'play_pause')),
          },
          {
            label: 'Media',
            icon: FilmReel,
            items: [
              {
                label: 'Restart',
                icon: ArrowCounterClockwise,
                onSelect: () => void run('media', () => api.media(item.name, 'restart')),
              },
              {
                label: 'Stop',
                icon: Stop,
                onSelect: () => void run('media', () => api.media(item.name, 'stop')),
              },
              {
                label: 'Next',
                icon: SkipForward,
                onSelect: () => void run('media', () => api.media(item.name, 'next')),
              },
              {
                label: 'Previous',
                icon: SkipBack,
                onSelect: () => void run('media', () => api.media(item.name, 'previous')),
              },
            ],
          },
          { sep: true },
        ] satisfies MenuItem[])
      : []),
    ...(item.deinterlace != null
      ? ([
          {
            label: 'Deinterlacing',
            icon: FilmReel,
            items: [
              ...ENGINE_DEINTERLACE.map((m) => ({
                label: DEINTERLACE_LABEL[m],
                checked: item.deinterlace === m,
                onSelect: () =>
                  withRefresh('deinterlace', () =>
                    api.setDeinterlace(item.name, m, item.top_field_first ?? true),
                  ),
              })),
              { sep: true },
              ...[true, false].map((top) => ({
                label: top ? 'Top field first' : 'Bottom field first',
                checked: (item.top_field_first ?? true) === top,
                disabled: item.deinterlace === 'off',
                onSelect: () =>
                  withRefresh('deinterlace', () =>
                    api.setDeinterlace(item.name, item.deinterlace ?? 'off', top),
                  ),
              })),
            ],
          },
        ] satisfies MenuItem[])
      : []),
    itemTransition(item, true),
    itemTransition(item, false),
    { label: 'Resize canvas to this source', icon: CornersOut, onSelect: () => fitCanvas(item) },
    { sep: true },
    {
      label: 'Screenshot',
      icon: Camera,
      onSelect: () =>
        void run('shot', () => api.screenshot(item.name), {
          success: 'Screenshot saved with your recordings.',
        }),
    },
    {
      label: 'Record on its own',
      icon: RecordIcon,
      checked: recordingAlone,
      onSelect: () =>
        void run('iso', () => api.recordSource(item.name, !recordingAlone), {
          success: recordingAlone
            ? 'Stopped. Its file is with your recordings.'
            : 'Recording it on its own, beside your recordings.',
        }),
    },
    ...(inDesktopApp()
      ? [
          projectorItem('Projector', desk.screens.data, (screen, onTop) =>
            project({
              what: 'source',
              name: item.name,
              ...(screen === undefined ? {} : { screen }),
              ...(onTop ? { on_top: true } : {}),
            }),
          ),
        ]
      : []),
    item.group
      ? {
          label: 'Ungroup',
          icon: Stack,
          onSelect: () => grouping(() => api.ungroup(scene, item.id), `${item.name} taken apart.`),
        }
      : {
          label: 'Group',
          icon: Stack,
          items: [
            {
              label: 'Into a new group',
              icon: Plus,
              onSelect: () =>
                grouping(async () => {
                  // Made around it, so it stays where it is (OBS's Group Selected Items).
                  const g = await api.groupItems(scene, [item.id], freeName('Group'))
                  select(g.id)
                }),
            },
            ...(groups.length ? [{ sep: true as const }] : []),
            ...groups.map((g) => ({
              label: `Into ${g.name}`,
              checked: parentOf(item.id)?.id === g.id,
              onSelect: () => grouping(() => api.setGroup(scene, item.id, g.id)),
            })),
            ...(parentOf(item.id)
              ? [
                  { sep: true as const },
                  {
                    label: 'Out of the group',
                    onSelect: () => grouping(() => api.setGroup(scene, item.id, null)),
                  },
                ]
              : []),
          ],
        },
    { label: 'Copy', icon: CopySimple, onSelect: () => setClip(item.name) },
    { label: 'Duplicate', icon: Copy, onSelect: () => void act(item, 'duplicate') },
    ...filterItems(item.name, { ...desk, paste: pasteFilters(item.name) }),
    { sep: true },
    { label: 'Remove', icon: Trash, danger: true, onSelect: () => setRemoving(item) },
  ]
  // Several picked (⌘- or Shift-click): what OBS offers for a selection.
  const manyMenu = (picked: EngineItem[]): MenuItem[] => {
    const loose = picked.every((i) => !i.group && !parentOf(i.id))
    const each = (key: string, what: (i: EngineItem) => EngineItemEdit) =>
      withRefresh(key, () => Promise.all(picked.map((i) => api.editItem(scene, i.id, what(i)))))
    const allHidden = picked.every((i) => !i.visible)
    const allLocked = picked.every((i) => i.locked)
    return [
      {
        label: 'Group selected items',
        icon: Stack,
        disabled: !loose,
        onSelect: () =>
          grouping(async () => {
            const g = await api.groupItems(
              scene,
              picked.map((i) => i.id),
              freeName('Group'),
            )
            select(g.id)
          }, `${picked.length} sources grouped.`),
      },
      { sep: true },
      {
        label: allHidden ? 'Show all' : 'Hide all',
        icon: allHidden ? Eye : EyeSlash,
        onSelect: () => each('hide', () => (allHidden ? 'show' : 'hide')),
      },
      {
        label: allLocked ? 'Unlock all' : 'Lock all',
        icon: allLocked ? LockSimpleOpen : LockSimple,
        onSelect: () => each('lock', () => (allLocked ? 'unlock' : 'lock')),
      },
      {
        label: 'Transform',
        icon: FrameCorners,
        items: [
          {
            label: 'Fit to screen',
            icon: ArrowsInSimple,
            onSelect: () => each('fit', () => 'fit'),
          },
          { label: 'Centre', icon: Crosshair, onSelect: () => each('center', () => 'center') },
          { sep: true },
          {
            label: 'Flip sideways',
            icon: FlipHorizontal,
            onSelect: () => each('flip', () => 'flip_h'),
          },
          {
            label: 'Flip upside down',
            icon: FlipVertical,
            onSelect: () => each('flip', () => 'flip_v'),
          },
          { label: 'Reset', icon: ArrowsOutSimple, onSelect: () => each('reset', () => 'reset') },
        ],
      },
    ]
  }
  // The preview's right-click opens these same menus (registered on every render, so it
  // always sees the current list and pick).
  useEffect(() => {
    desk.itemMenu.current = (e, id) => {
      const item = id === null ? null : flat.find((i) => i.id === id)
      if (!item) return open(e, `Sources in ${scene}`, emptyMenu)
      const many = [selected, ...also].filter((x): x is number => x !== null)
      if (many.length > 1 && many.includes(item.id)) {
        const picked = flat.filter((i) => many.includes(i.id))
        return open(e, `${picked.length} sources`, manyMenu(picked))
      }
      select(item.id)
      desk.screens.reload()
      open(e, item.name, itemMenu(item))
    }
  })
  useEffect(() => () => void (desk.itemMenu.current = null), [desk.itemMenu])
  const emptyMenu: MenuItem[] = [
    { label: 'Add a source', icon: Plus, onSelect: () => setAdding('') },
    {
      label: 'Add a group',
      icon: Stack,
      onSelect: () => grouping(() => api.addGroup(scene, freeName('Group')), 'Group added.'),
    },
    { sep: true },
    {
      label: clip ? `Paste ${clip}` : 'Paste',
      icon: ClipboardText,
      disabled: !clip || flat.some((i) => i.name === clip),
      onSelect: () => void paste(),
    },
    {
      label: clip ? `Paste a copy of ${clip}` : 'Paste a copy',
      icon: Copy,
      disabled: !clip,
      onSelect: () => void pasteCopy(),
    },
  ]

  const row = (item: EngineItem, child = false) => {
    const isOpen = !closed.has(item.id)
    const on = selected === item.id || also.includes(item.id)
    if (naming?.from === item.name)
      return (
        <form
          className={cx('py-0.5 pr-1', child ? 'pl-7' : 'pl-1.5')}
          onSubmit={(e) => {
            e.preventDefault()
            void rename()
          }}
        >
          <Input
            autoFocus
            data-autofocus
            aria-label={`New name for ${item.name}`}
            className="h-8! text-[14.5px]"
            maxLength={100}
            value={naming.value}
            onChange={(e) => setNaming((n) => n && { ...n, value: e.target.value })}
            onBlur={() => void rename()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNaming(null)
            }}
          />
        </form>
      )
    const marker = drop?.id === item.id ? (drop.after ? 'after' : 'before') : null
    return (
      <div
        data-item-id={item.id}
        onPointerDown={(e) => press(e, item)}
        onPointerMove={pull}
        onPointerUp={letGo}
        onPointerCancel={() => {
          dragged.current = null
          setDragging(null)
          setGhost(null)
          setDrop(null)
        }}
        onClickCapture={(e) => {
          if (justDragged.current) e.stopPropagation()
        }}
        onContextMenu={(e) => {
          const many = [selected, ...also].filter((id): id is number => id !== null)
          if (many.length > 1 && many.includes(item.id)) {
            const picked = flat.filter((i) => many.includes(i.id))
            open(e, `${picked.length} sources`, manyMenu(picked))
            return
          }
          select(item.id)
          desk.screens.reload()
          open(e, item.name, itemMenu(item))
        }}
        className={cx(
          'group relative flex min-h-10 touch-none items-center gap-1 rounded-[9px] pr-1 text-[14.5px] transition-colors select-none hover:bg-surface-2',
          child ? 'pl-7' : 'pl-1',
          // Its place in the list while it's carried: a dashed outline.
          dragging === item.id &&
            'bg-transparent opacity-50 outline-2 -outline-offset-2 outline-line-strong outline-dashed',
          on && 'fc-picked',
        )}
      >
        {marker && (
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute right-1 left-1 h-[3px] rounded-full bg-accent',
              marker === 'before' ? '-top-[2px]' : '-bottom-[2px]',
            )}
          />
        )}
        {item.group ? (
          <IconButton
            size="sm"
            variant="ghost"
            data-no-drag
            label={isOpen ? `Fold ${item.name}` : `Unfold ${item.name}`}
            onClick={() =>
              setClosed((s) => {
                const n = new Set(s)
                if (isOpen) n.add(item.id)
                else n.delete(item.id)
                return n
              })
            }
          >
            {isOpen ? <CaretDown size={13} /> : <CaretRight size={13} />}
          </IconButton>
        ) : (
          <span aria-hidden className="w-0.5" />
        )}
        <button
          type="button"
          aria-pressed={on}
          onClick={(e) => {
            // ⌘-click (Ctrl on Windows) picks one more, Shift-click a run of them, as in OBS.
            if (addsToPick(e)) pickMore(item.id, 'toggle')
            else if (e.shiftKey)
              pickMore(
                item.id,
                'range',
                // The rows on show: a folded group's sources aren't picked.
                (list ?? []).flatMap((g) => [
                  g.id,
                  ...(closed.has(g.id) ? [] : g.children.map((c) => c.id)),
                ]),
              )
            else select(on && also.length === 0 ? null : item.id)
          }}
          onDoubleClick={() => edit(item.name)}
          onKeyDown={(e) => {
            if (e.key === 'F2') setNaming({ from: item.name, value: item.name })
          }}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <KindTile kind={item.group ? 'group' : item.kind} size={26} dim={!item.visible} />
          <span
            className={cx(
              'min-w-0 truncate font-semibold',
              item.visible ? 'text-text' : 'text-text-3 line-through decoration-1',
            )}
          >
            {item.name}
          </span>
          {item.blend !== 'normal' && (
            <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[12px] font-bold text-text-2">
              {BLEND_LABEL[item.blend]}
            </span>
          )}
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          data-no-drag
          label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
          disabled={busy !== null}
          className={cx(
            !item.visible && 'text-text-3',
            // Narrow (owner's pick N1): shown on hover or focus, or while it says something.
            item.visible && !on && quiet,
          )}
          onClick={() => void act(item, item.visible ? 'hide' : 'show')}
        >
          {item.visible ? <Eye size={16} weight="bold" /> : <EyeSlash size={16} />}
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          data-no-drag
          label={item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
          aria-pressed={item.locked}
          className={cx(
            item.locked ? 'text-accent-text' : 'text-text-3',
            !item.locked && !on && quiet,
          )}
          disabled={busy !== null}
          onClick={() => void act(item, item.locked ? 'unlock' : 'lock')}
        >
          {item.locked ? <LockSimple size={16} weight="bold" /> : <LockSimpleOpen size={16} />}
        </IconButton>
      </div>
    )
  }

  return (
    <section aria-label={`Sources in ${scene}`} className="flex min-h-0 flex-1 flex-col">
      {ghost && dragging !== null && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 flex max-w-[260px] cursor-grabbing items-center gap-2 rounded-[10px] border border-[var(--fc-accent)] bg-surface-1 py-1.5 pr-3 pl-1.5 text-[14.5px] font-bold text-text shadow-pop"
          style={{ left: ghost.x + 14, top: ghost.y - 18 }}
        >
          {(() => {
            const it = flat.find((i) => i.id === dragging)
            return it ? (
              <>
                <KindTile kind={it.group ? 'group' : it.kind} size={24} />
                <span className="truncate">{it.name}</span>
              </>
            ) : null
          })()}
        </div>
      )}
      <DockHeader
        id="sources"
        info={
          // The scene's name only where the panel has room for it (owner's pick N1).
          <span className="hidden truncate rounded-full bg-accent-soft px-2 py-0.5 text-[12.5px] font-bold text-accent-text @[280px]:inline">
            {scene}
          </span>
        }
        actions={
          <IconButton size="sm" label={`Add a source to ${scene}`} onClick={() => setAdding('')}>
            <Plus size={16} weight="bold" />
          </IconButton>
        }
      />
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onContextMenu={(e) => open(e, `Sources in ${scene}`, emptyMenu)}
        // A click on the list's empty space picks nothing, as in OBS.
        onPointerDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('[data-item-id]')) select(null)
        }}
      >
        {items.error && !list ? (
          <LoadError error={items.error} onRetry={items.reload} />
        ) : !list ? (
          <Skeleton className="h-28" />
        ) : list.length === 0 ? (
          <p className="m-0 p-2.5 text-[14.5px] font-medium text-text-2">
            Empty. Press <Plus size={12} weight="bold" className="inline align-[-1px]" /> to add
            your camera, screen or a game.
          </p>
        ) : (
          <ul className="@container flex flex-col gap-px" aria-label="Sources, top first">
            {list.map((item) => (
              <li key={item.id}>
                {row(item)}
                {item.group && !closed.has(item.id) && item.children.length > 0 && (
                  <ul className="flex flex-col gap-px">
                    {item.children.map((c) => (
                      <li key={c.id}>{row(c, true)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="flex h-10 flex-none items-center gap-0.5 border-t border-line px-1.5">
        <IconButton
          size="sm"
          label={picked ? `Move ${picked.name} up` : 'Move up'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'up')}
        >
          <CaretUp size={15} weight="bold" />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Move ${picked.name} down` : 'Move down'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'down')}
        >
          <CaretDown size={15} weight="bold" />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Settings of ${picked.name}` : 'Settings'}
          disabled={!picked}
          onClick={() => picked && edit(picked.name)}
        >
          <SlidersHorizontal size={15} weight="bold" />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Fit ${picked.name} to the screen` : 'Fit to the screen'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'fit')}
        >
          <FrameCorners size={15} weight="bold" />
        </IconButton>
        <span className="flex-1" />
        <IconButton
          size="sm"
          variant="ghost"
          className="hover:bg-danger-soft hover:text-danger"
          label={picked ? `Remove ${picked.name} from ${scene}` : 'Remove'}
          disabled={!picked || busy !== null}
          onClick={() => picked && setRemoving(picked)}
        >
          <Trash size={15} weight="bold" />
        </IconButton>
      </footer>
      {menu}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={`Remove ${removing?.name ?? ''}?`}
        description={`It leaves ${scene}. Other scenes keep it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const it = removing
                setRemoving(null)
                if (it) void act(it, 'remove')
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </section>
  )
}
