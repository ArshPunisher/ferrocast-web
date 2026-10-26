// Scene collections and profiles, as OBS's menus of those names: several sets of scenes, and
// several sets of Studio settings (stream, picture, sound, recording, shortcuts), one of each
// in use. Two buttons at the top of the Studio show which, and their menus switch, make,
// copy, rename, import, export and remove.

import { useRef, useState } from 'react'
import {
  CaretDown,
  CardsThree,
  Check,
  Copy,
  DownloadSimple,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  UserGear,
} from '@phosphor-icons/react'
import { type EngineShelf, type EngineShelfKind } from '@ferrocast/api'
import { Button, Dialog, Input, cx, toast } from '@ferrocast/ui'
import { done, useAction, useResource } from '../../../lib/hooks'
import { saveBlob } from '../common'
import { useDesk } from './common'
import { useContextMenu, type MenuItem } from './menu'

/** Biggest collection file to read (OBS's are well under this). */
const MAX_FILE = 20 * 1024 * 1024

const WORDS: Record<EngineShelfKind, { one: string; icon: typeof CardsThree }> = {
  collections: { one: 'scene collection', icon: CardsThree },
  profiles: { one: 'profile', icon: UserGear },
}

/** A file name for an export: the name, safe for any system. */
export function fileName(name: string): string {
  const safe = [...name]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
  return `${safe || 'Studio'}.json`
}

type Naming = { kind: EngineShelfKind; mode: 'new' | 'copy' | 'rename'; id?: string; value: string }

export function LibraryBar() {
  const { api, refresh, library } = useDesk()
  const collections = useResource(() => api.shelf('collections'), [api, library])
  const profiles = useResource(() => api.shelf('profiles'), [api, library])
  const { run, busy } = useAction()
  const { open, menu } = useContextMenu()
  const [naming, setNaming] = useState<Naming | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = (kind: EngineShelfKind) => {
    if (kind === 'collections') {
      collections.reload()
      // Other scenes now.
      refresh()
    } else profiles.reload()
  }

  const shelfOf = (kind: EngineShelfKind) =>
    (kind === 'collections' ? collections : profiles).data ?? null

  const items = (kind: EngineShelfKind, shelf: EngineShelf): MenuItem[] => {
    const one = WORDS[kind].one
    const current = shelf.list.find((e) => e.id === shelf.current)
    const others = shelf.list.filter((e) => e.id !== shelf.current)
    return [
      ...shelf.list.map((e) => ({
        label: e.name,
        checked: e.id === shelf.current,
        onSelect: () =>
          e.id !== shelf.current &&
          void run(`switch:${kind}`, () => done(api.switchShelf(kind, e.id)), {
            success: `Now using ${e.name}.`,
          }).then((ok) => ok && reload(kind)),
      })),
      { sep: true },
      {
        label: `New ${one}`,
        icon: Plus,
        onSelect: () => setNaming({ kind, mode: 'new', value: '' }),
      },
      {
        label: 'Duplicate',
        icon: Copy,
        onSelect: () =>
          setNaming({ kind, mode: 'copy', value: `${current?.name ?? 'Untitled'} copy` }),
      },
      {
        label: 'Rename',
        icon: PencilSimple,
        onSelect: () =>
          current && setNaming({ kind, mode: 'rename', id: current.id, value: current.name }),
      },
      { sep: true },
      ...(kind === 'collections'
        ? [
            {
              label: 'Import a file',
              icon: UploadSimple,
              onSelect: () => fileInput.current?.click(),
            },
          ]
        : []),
      {
        label: 'Export',
        icon: DownloadSimple,
        onSelect: () =>
          current &&
          void run('export', async () => {
            const doc = await api.exportShelf(kind, current.id)
            saveBlob(
              new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
              fileName(current.name),
            )
            return true
          }),
      },
      {
        label: 'Remove',
        icon: Trash,
        danger: true,
        disabled: others.length === 0,
        items: others.map((e) => ({
          label: e.name,
          danger: true,
          onSelect: () =>
            void run('remove', () => done(api.removeShelf(kind, e.id)), {
              success: `${e.name} removed.`,
            }).then((ok) => ok && reload(kind)),
        })),
      },
    ]
  }

  const importFile = async (f: File) => {
    if (f.size > MAX_FILE) {
      toast({
        tone: 'error',
        message: 'That file is too big for a scene collection.',
        hint: 'Pick the .json file OBS saved (under 20 MB).',
      })
      return
    }
    let doc: unknown
    try {
      doc = JSON.parse(await f.text())
    } catch {
      toast({
        tone: 'error',
        message: "That file isn't a scene collection.",
        hint: 'Pick a .json file from OBS (Scene Collection, Export) or from Ferrocast.',
      })
      return
    }
    const fromDoc =
      doc && typeof doc === 'object' && typeof (doc as { name?: unknown }).name === 'string'
        ? (doc as { name: string }).name
        : ''
    const name = fromDoc.trim() || f.name.replace(/\.json$/i, '') || 'Imported'
    const r = await run('import', () => api.importCollection(name, doc))
    if (!r) return
    reload('collections')
    toast({
      tone: r.missing.length ? 'warn' : 'ok',
      message: `${r.name}: ${r.scenes} scenes, ${r.sources} sources.`,
      ...(r.missing.length
        ? { hint: `${r.missing.length} kinds of source aren't on this computer.` }
        : {}),
    })
  }

  const commit = async () => {
    if (!naming) return
    const value = naming.value.trim()
    if (!value) return
    const { kind, mode } = naming
    const ok = await run('name', async () => {
      if (mode === 'rename' && naming.id) await api.renameShelf(kind, naming.id, value)
      else await api.newShelf(kind, value, mode === 'copy')
      return true
    })
    if (ok) {
      setNaming(null)
      reload(kind)
    }
  }

  return (
    <>
      {(['collections', 'profiles'] as const).map((kind) => {
        const shelf = shelfOf(kind)
        const name = shelf?.list.find((e) => e.id === shelf.current)?.name ?? '…'
        const Icon = WORDS[kind].icon
        return (
          <Button
            key={kind}
            type="button"
            variant="secondary"
            aria-haspopup="menu"
            aria-label={`${WORDS[kind].one}: ${name}`}
            title={`${WORDS[kind].one[0]?.toUpperCase()}${WORDS[kind].one.slice(1)}`}
            busy={busy === `switch:${kind}`}
            disabled={!shelf}
            onClick={(e) => shelf && open(e, WORDS[kind].one, items(kind, shelf))}
            className="h-10 max-w-[170px] 2xl:max-w-[240px]"
          >
            <Icon size={16} weight="bold" className="shrink-0 text-accent-text" aria-hidden />
            <span className="min-w-0 truncate">{name}</span>
            <CaretDown size={13} weight="bold" className="shrink-0 text-text-3" aria-hidden />
          </Button>
        )
      })}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void importFile(f)
        }}
      />
      {menu}
      <Dialog
        open={naming !== null}
        onClose={() => setNaming(null)}
        size="sm"
        title={
          naming
            ? naming.mode === 'rename'
              ? `Rename ${WORDS[naming.kind].one}`
              : naming.mode === 'copy'
                ? `Duplicate ${WORDS[naming.kind].one}`
                : `New ${WORDS[naming.kind].one}`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'name'}
              disabled={!naming?.value.trim()}
              onClick={() => void commit()}
            >
              {naming?.mode === 'rename' ? (
                'Rename'
              ) : (
                <>
                  <Check size={15} weight="bold" /> Make it
                </>
              )}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void commit()
          }}
        >
          <Input
            autoFocus
            data-autofocus
            aria-label="Name"
            maxLength={100}
            placeholder="Name"
            value={naming?.value ?? ''}
            onChange={(e) => setNaming((n) => n && { ...n, value: e.target.value })}
            className={cx('text-[16px]')}
          />
        </form>
      </Dialog>
    </>
  )
}
