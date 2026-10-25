// The Sources panel: what's in the scene on air, top first, as OBS lists it. Show or hide and
// lock each one; pick one to move it, fit it, open its settings or remove it from the scene.

import { useState } from 'react'
import {
  CaretDown,
  CaretRight,
  CaretUp,
  Eye,
  EyeSlash,
  FrameCorners,
  LockSimple,
  LockSimpleOpen,
  Plus,
  SlidersHorizontal,
  Trash,
} from '@phosphor-icons/react'
import { type EngineItem, type EngineItemEdit } from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction } from '../../../lib/hooks'
import { kindIcon, useDesk } from './common'
import { DockHeader } from './layout'

export function SourcesDock() {
  const { api, scene, items, refresh, selected, select, edit, setAdding } = useDesk()
  const { busy, run } = useAction()
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState<EngineItem | null>(null)
  const list = items.data
  const flat = list?.flatMap((i) => [i, ...i.children]) ?? []
  const picked = flat.find((i) => i.id === selected) ?? null

  const act = async (item: EngineItem, what: EngineItemEdit) => {
    const ok = await run(`${what}:${item.id}`, () => done(api.editItem(scene, item.id, what)))
    if (!ok) return
    if (what === 'remove') select(null)
    refresh()
  }

  const row = (item: EngineItem, child = false) => {
    const Icon = kindIcon(item.group ? 'group' : item.kind)
    const open = !closed.has(item.id)
    return (
      <div
        className={cx(
          'group flex min-h-9 items-center gap-1 rounded-[9px] pr-1 text-[13.5px] transition-colors hover:bg-surface-2',
          child ? 'pl-7' : 'pl-1.5',
          selected === item.id &&
            'bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-line)] hover:bg-accent-soft',
        )}
      >
        {item.group ? (
          <IconButton
            size="sm"
            variant="ghost"
            label={open ? `Fold ${item.name}` : `Unfold ${item.name}`}
            onClick={() =>
              setClosed((s) => {
                const n = new Set(s)
                if (open) n.add(item.id)
                else n.delete(item.id)
                return n
              })
            }
          >
            {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
          </IconButton>
        ) : (
          <span aria-hidden className="w-1" />
        )}
        <button
          type="button"
          aria-pressed={selected === item.id}
          onClick={() => select(selected === item.id ? null : item.id)}
          onDoubleClick={() => edit(item.name)}
          className={cx(
            'flex min-h-9 min-w-0 flex-1 items-center gap-2.5 text-left',
            !item.visible && 'text-text-3',
          )}
        >
          <Icon size={16} className="shrink-0 text-text-3" aria-hidden />
          <span className="min-w-0 truncate">{item.name}</span>
        </button>
        <IconButton
          size="sm"
          variant="ghost"
          label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
          disabled={busy !== null}
          onClick={() => void act(item, item.visible ? 'hide' : 'show')}
        >
          {item.visible ? <Eye size={15} /> : <EyeSlash size={15} />}
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label={item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
          aria-pressed={item.locked}
          className={cx(item.locked && 'text-accent-text')}
          disabled={busy !== null}
          onClick={() => void act(item, item.locked ? 'unlock' : 'lock')}
        >
          {item.locked ? <LockSimple size={15} /> : <LockSimpleOpen size={15} />}
        </IconButton>
      </div>
    )
  }

  return (
    <section aria-label={`Sources in ${scene}`} className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id="sources"
        info={
          <span className="truncate rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] font-semibold text-text-2">
            {scene}
          </span>
        }
        actions={
          <Button size="sm" variant="secondary" onClick={() => setAdding('')}>
            <Plus size={14} /> Add
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.error && !list ? (
          <LoadError error={items.error} onRetry={items.reload} />
        ) : !list ? (
          <Skeleton className="h-28" />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-2.5">
            <p className="m-0 text-[13.5px] text-text-2">
              Nothing in {scene} yet. Add your camera, screen or a game.
            </p>
            <Button size="sm" variant="primary" onClick={() => setAdding('')}>
              <Plus size={14} /> Add a source
            </Button>
          </div>
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
      <footer className="flex flex-none items-center gap-0.5 border-t border-line px-1.5 py-1">
        <IconButton
          size="sm"
          label={picked ? `Move ${picked.name} up` : 'Move up'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'up')}
        >
          <CaretUp size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Move ${picked.name} down` : 'Move down'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'down')}
        >
          <CaretDown size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Settings of ${picked.name}` : 'Settings'}
          disabled={!picked}
          onClick={() => picked && edit(picked.name)}
        >
          <SlidersHorizontal size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label={picked ? `Fit ${picked.name} to the screen` : 'Fit to the screen'}
          disabled={!picked || busy !== null}
          onClick={() => picked && void act(picked, 'fit')}
        >
          <FrameCorners size={15} />
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
          <Trash size={15} />
        </IconButton>
      </footer>
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
