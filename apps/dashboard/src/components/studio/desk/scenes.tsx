// The Scenes panel: click one to put it on air (through the transition), double-click to
// rename; add, copy, move up or down, remove.

import { useState } from 'react'
import {
  ArrowsLeftRight,
  Broadcast,
  Camera,
  CaretDoubleDown,
  CaretDoubleUp,
  CaretDown,
  CaretUp,
  Copy,
  DownloadSimple,
  Funnel,
  PencilSimple,
  Plus,
  Stack,
  Trash,
} from '@phosphor-icons/react'
import { type EngineScene, type EngineTransition } from '@ferrocast/api'
import { Button, Dialog, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction } from '../../../lib/hooks'
import { KindTile, useDesk } from './common'
import { DockHeader } from './layout'
import { ImportObsDialog } from './import-obs'
import { TRANSITIONS } from './preview'
import { filterItems, useContextMenu, type MenuItem } from './menu'

/** A name not used yet: "Scene 2", "Scene 3"… */
function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`
}

export function ScenesDock() {
  const desk = useDesk()
  const { api, scenes, refresh, edit } = desk
  const { busy, run } = useAction()
  const { open, menu } = useContextMenu()
  const [naming, setNaming] = useState<{ from: string | null; value: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const list = scenes.data?.scenes
  const current = scenes.data?.current ?? ''
  const names = list?.map((s) => s.name) ?? []
  const at = names.indexOf(current)

  const act = async (key: string, f: () => Promise<unknown>) => {
    const ok = await run(key, () => done(f()))
    if (ok) refresh()
    return ok
  }
  const commitName = async () => {
    if (!naming) return
    const value = naming.value.trim()
    if (!value || value === naming.from) return setNaming(null)
    const ok = await act('name', () =>
      naming.from ? api.rename(naming.from, value) : api.addScene(value),
    )
    if (ok) setNaming(null)
  }

  const shoot = (name: string) =>
    void run('shot', () => api.screenshot(name), {
      success: 'Screenshot saved with your recordings.',
    })
  const sceneMenu = (scene: EngineScene, i: number): MenuItem[] => {
    const { name, current: onAir } = scene
    const t = scene.transition
    const ms = scenes.data?.transition.ms ?? 300
    const setT = (next: EngineTransition | null) =>
      void act('transition', () => api.setSceneTransition(name, next))
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
            onSelect: () => void act('up', () => api.moveScene(name, i - 1)),
          },
          {
            label: 'Down',
            icon: CaretDown,
            disabled: i >= names.length - 1,
            onSelect: () => void act('down', () => api.moveScene(name, i + 1)),
          },
          {
            label: 'To the top',
            icon: CaretDoubleUp,
            disabled: i <= 0,
            onSelect: () => void act('top', () => api.moveScene(name, 0)),
          },
          {
            label: 'To the bottom',
            icon: CaretDoubleDown,
            disabled: i >= names.length - 1,
            onSelect: () => void act('bottom', () => api.moveScene(name, names.length - 1)),
          },
        ],
      },
      { sep: true },
      {
        label: 'Transition',
        icon: ArrowsLeftRight,
        items: [
          { label: 'Same as all', checked: !t, onSelect: () => setT(null) },
          { sep: true },
          ...Object.entries(TRANSITIONS).map(([kind, label]) => ({
            label:
              kind === 'cut_transition' ? label : `${label}, ${t?.kind === kind ? t.ms : ms} ms`,
            checked: t?.kind === kind,
            onSelect: () =>
              setT({ kind, ms: kind === 'cut_transition' ? 0 : t?.kind === kind ? t.ms : ms }),
          })),
        ],
      },
      { label: 'Screenshot', icon: Camera, onSelect: () => shoot(name) },
      { label: 'Filters', icon: Funnel, onSelect: () => edit(name) },
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
      className="px-1.5 py-1"
      onSubmit={(e) => {
        e.preventDefault()
        void commitName()
      }}
    >
      <Input
        autoFocus
        aria-label={naming?.from ? `New name for ${naming.from}` : 'New scene name'}
        className="h-8! text-[13.5px]"
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
      <DockHeader
        id="scenes"
        actions={
          <>
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
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onContextMenu={(e) =>
          open(e, 'Scenes', [
            {
              label: 'Add scene',
              icon: Plus,
              onSelect: () => setNaming({ from: null, value: freeName('Scene', names) }),
            },
            { label: 'Import from OBS', icon: DownloadSimple, onSelect: () => setImporting(true) },
          ])
        }
      >
        {scenes.error && !list ? (
          <LoadError error={scenes.error} onRetry={scenes.reload} />
        ) : !list ? (
          <Skeleton className="h-28" />
        ) : (
          <ul className="flex flex-col gap-px" aria-label="Scenes, click to go on air">
            {list.map((s, i) => (
              <li key={s.name}>
                {naming?.from === s.name ? (
                  nameInput
                ) : (
                  <button
                    type="button"
                    aria-current={s.current ? 'true' : undefined}
                    onClick={() =>
                      !s.current && void act(`go:${s.name}`, () => api.setCurrent(s.name))
                    }
                    onDoubleClick={() => setNaming({ from: s.name, value: s.name })}
                    onContextMenu={(e) => open(e, s.name, sceneMenu(s, i))}
                    onKeyDown={(e) => {
                      if (e.key === 'F2') setNaming({ from: s.name, value: s.name })
                    }}
                    className={cx(
                      'flex min-h-10 w-full items-center gap-2.5 rounded-[9px] px-1.5 text-left text-[13.5px] font-semibold text-text transition-colors hover:bg-surface-2',
                      s.current &&
                        'bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-line)] hover:bg-accent-soft',
                    )}
                  >
                    <KindTile
                      kind="scene"
                      size={26}
                      tone={s.current ? 'var(--fc-danger)' : undefined}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.items > 0 && !s.current && (
                      <span className="font-mono text-[11.5px] font-semibold text-text-3 tabular-nums">
                        {s.items}
                      </span>
                    )}
                    {s.current && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-danger">
                        <span aria-hidden className="size-[7px] rounded-full bg-danger-fill" />
                        On air
                      </span>
                    )}
                  </button>
                )}
              </li>
            ))}
            {naming && naming.from === null && <li>{nameInput}</li>}
          </ul>
        )}
      </div>
      <footer className="flex h-10 flex-none items-center gap-0.5 border-t border-line px-1.5">
        <IconButton
          size="sm"
          label="Move the scene on air up"
          disabled={at <= 0 || busy !== null}
          onClick={() => void act('up', () => api.moveScene(current, at - 1))}
        >
          <CaretUp size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label="Move the scene on air down"
          disabled={at < 0 || at >= names.length - 1 || busy !== null}
          onClick={() => void act('down', () => api.moveScene(current, at + 1))}
        >
          <CaretDown size={15} />
        </IconButton>
        <IconButton
          size="sm"
          label="Copy the scene on air"
          disabled={!current || busy !== null}
          onClick={() =>
            void act('copy', () => api.duplicateScene(current, freeName(current, names)))
          }
        >
          <Copy size={15} />
        </IconButton>
        <span className="flex-1" />
        <IconButton
          size="sm"
          variant="ghost"
          className="hover:bg-danger-soft hover:text-danger"
          label="Remove the scene on air"
          disabled={names.length < 2 || busy !== null}
          onClick={() => setRemoving(current)}
        >
          <Trash size={15} />
        </IconButton>
      </footer>
      {menu}
      <ImportObsDialog open={importing} onClose={() => setImporting(false)} />
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={`Remove ${removing ?? ''}?`}
        description="Its sources stay in the other scenes they're in."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'remove'}
              onClick={() => {
                const s = removing
                setRemoving(null)
                if (s) void act('remove', () => api.removeScene(s))
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
