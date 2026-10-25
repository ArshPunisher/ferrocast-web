// The Sources panel: what's in the scene on air, top first, as OBS lists it. Show or hide and
// lock each one; pick one to move it, fit it, open its settings or remove it; right-click for
// everything else OBS's menu has (transform, order, blending, copy, filters, rename).

import { useState } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsInSimple,
  ArrowsOut,
  ArrowsOutSimple,
  CaretDown,
  CaretDoubleDown,
  CaretDoubleUp,
  CaretRight,
  CaretUp,
  ClipboardText,
  Copy,
  CopySimple,
  Crosshair,
  CursorClick,
  Eye,
  EyeSlash,
  Faders,
  FlipHorizontal,
  FlipVertical,
  FrameCorners,
  Funnel,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Plus,
  Stack,
  SlidersHorizontal,
  Trash,
} from '@phosphor-icons/react'
import { ENGINE_BLENDS, type EngineItem, type EngineItemEdit } from '@ferrocast/api'
import { Button, Dialog, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction } from '../../../lib/hooks'
import { KindTile, useDesk } from './common'
import { DockHeader } from './layout'
import { filterItems, useContextMenu, type MenuItem } from './menu'

const BLEND_LABEL: Record<(typeof ENGINE_BLENDS)[number], string> = {
  normal: 'Normal',
  additive: 'Add',
  subtract: 'Subtract',
  screen: 'Screen',
  multiply: 'Multiply',
  lighten: 'Lighten',
  darken: 'Darken',
}

export function SourcesDock() {
  const desk = useDesk()
  const { api, scene, items, refresh, selected, select, edit, setAdding, clip, setClip } = desk
  const { busy, run } = useAction()
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState<EngineItem | null>(null)
  const [naming, setNaming] = useState<{ from: string; value: string } | null>(null)
  const { open, menu } = useContextMenu()
  const list = items.data
  const flat = list?.flatMap((i) => [i, ...i.children]) ?? []
  const picked = flat.find((i) => i.id === selected) ?? null

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
  const pasteFilters = (to: string) => (from: string) =>
    void run('filters', () => done(api.pasteFilters(to, from)), {
      success: `Filters pasted onto ${to}.`,
    })

  const web = (item: EngineItem, what: 'interact' | 'reload') =>
    void run(`web:${item.id}`, () => done(api.web(item.name, what)))
  const itemMenu = (item: EngineItem): MenuItem[] => [
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
    { label: 'Filters', icon: Funnel, onSelect: () => edit(item.name) },
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
      label: 'Blending',
      icon: Faders,
      items: ENGINE_BLENDS.map((b) => ({
        label: BLEND_LABEL[b],
        checked: item.blend === b,
        onSelect: () => void act(item, `blend_${b}`),
      })),
    },
    { sep: true },
    { label: 'Copy', icon: CopySimple, onSelect: () => setClip(item.name) },
    { label: 'Duplicate', icon: Copy, onSelect: () => void act(item, 'duplicate') },
    ...filterItems(item.name, { ...desk, paste: pasteFilters(item.name) }),
    { sep: true },
    { label: 'Remove', icon: Trash, danger: true, onSelect: () => setRemoving(item) },
  ]
  const emptyMenu: MenuItem[] = [
    { label: 'Add a source', icon: Plus, onSelect: () => setAdding('') },
    {
      label: clip ? `Paste ${clip}` : 'Paste',
      icon: ClipboardText,
      disabled: !clip || flat.some((i) => i.name === clip),
      onSelect: () => void paste(),
    },
  ]

  const row = (item: EngineItem, child = false) => {
    const isOpen = !closed.has(item.id)
    const on = selected === item.id
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
            aria-label={`New name for ${item.name}`}
            className="h-8! text-[13.5px]"
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
    return (
      <div
        onContextMenu={(e) => {
          select(item.id)
          open(e, item.name, itemMenu(item))
        }}
        className={cx(
          'group flex min-h-10 items-center gap-1 rounded-[9px] pr-1 text-[13.5px] transition-colors hover:bg-surface-2',
          child ? 'pl-7' : 'pl-1',
          on &&
            'bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-line)] hover:bg-accent-soft',
        )}
      >
        {item.group ? (
          <IconButton
            size="sm"
            variant="ghost"
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
          onClick={() => select(on ? null : item.id)}
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
            <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-bold text-text-2">
              {BLEND_LABEL[item.blend]}
            </span>
          )}
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
          disabled={busy !== null}
          className={cx(!item.visible && 'text-text-3')}
          onClick={() => void act(item, item.visible ? 'hide' : 'show')}
        >
          {item.visible ? <Eye size={16} weight="bold" /> : <EyeSlash size={16} />}
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label={item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
          aria-pressed={item.locked}
          className={cx(item.locked ? 'text-accent-text' : 'text-text-3')}
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
      <DockHeader
        id="sources"
        info={
          <span className="truncate rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-bold text-accent-text">
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
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onContextMenu={(e) => open(e, `Sources in ${scene}`, emptyMenu)}
      >
        {items.error && !list ? (
          <LoadError error={items.error} onRetry={items.reload} />
        ) : !list ? (
          <Skeleton className="h-28" />
        ) : list.length === 0 ? (
          <p className="m-0 p-2.5 text-[13.5px] font-medium text-text-2">
            Empty. Press <Plus size={12} weight="bold" className="inline align-[-1px]" /> to add
            your camera, screen or a game.
          </p>
        ) : (
          <ul className="flex flex-col gap-px" aria-label="Sources, top first">
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
