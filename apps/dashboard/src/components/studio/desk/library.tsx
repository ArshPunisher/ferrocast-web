// Scene collections and profiles, as OBS's menus of those names: several sets of scenes, and
// several sets of Studio settings (stream, picture, sound, recording, shortcuts), one of each
// in use. Two buttons at the top of the Studio show which, and their menus switch, make,
// copy, rename, import, export and remove.

import { useEffect, useRef, useState } from 'react'
import {
  CaretDown,
  CardsThree,
  Check,
  Copy,
  DownloadSimple,
  Package,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  UserGear,
} from '@phosphor-icons/react'
import { ApiError, describeError, type EngineShelf, type EngineShelfKind } from '@ferrocast/api'
import { Field, Button, Dialog, Input, cx, toast } from '@ferrocast/ui'
import { done, useAction, useResource } from '../../../lib/hooks'
import { saveBlob } from '../common'
import { useDesk } from './common'
import { ImportOverlayPackDialog } from './import-overlay-pack'
import { useContextMenu, type MenuItem } from './menu'

/** Biggest collection file to read (OBS's are well under this). */
const MAX_FILE = 20 * 1024 * 1024

const WORDS: Record<EngineShelfKind, { one: string; many: string; icon: typeof CardsThree }> = {
  collections: { one: 'scene collection', many: 'Scene collections', icon: CardsThree },
  profiles: { one: 'profile', many: 'Profiles', icon: UserGear },
}

/** A file name for an export: the name, safe for any system. */
export function fileName(name: string): string {
  const safe = [...name]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
  return `${safe || 'Studio'}.json`
}

type ShelfSwitchResponse = {
  id: string
  note?: string | null
  restart?: string | null
  restart_detail?: string | null
}

function busyHeadline(message: string): string {
  if (/\bshow\b/i.test(message)) return 'Stop the show to switch'
  if (/benchmark/i.test(message)) return 'Wait for the benchmark to finish'
  if (!/stream/i.test(message)) {
    if (/record/i.test(message)) return 'Stop recording to switch'
    if (/replay/i.test(message)) return 'Stop the replay buffer to switch'
    if (/virtual/i.test(message)) return 'Stop Virtual Camera to switch'
    if (/\bndi\b/i.test(message)) return 'Stop NDI to switch'
  }
  return 'Stop the stream to switch'
}

/** Calm one-line toast when switching collections or profiles while live (M9-01). */
export function showShelfError(err: unknown): void {
  if (err instanceof ApiError && err.status === 409 && err.code === 'studio_busy') {
    const detail = [err.message, err.hint].filter(Boolean).join(' ')
    toast({
      key: 'studio:busy-switch',
      tone: 'warn',
      message: busyHeadline(err.message),
      ...(detail ? { detail } : {}),
    })
    return
  }
  const d = describeError(err)
  toast({ tone: 'error', message: d.message, hint: d.hint })
}

type Naming = { kind: EngineShelfKind; mode: 'new' | 'copy' | 'rename'; id?: string; value: string }

export function LibraryBar({ compact = false }: { compact?: boolean } = {}) {
  const { api, refresh, prefs, onCollectionChange, onProfileChange, library } = useDesk()
  const collections = useResource(() => api.shelf('collections'), [api, library])
  const profiles = useResource(() => api.shelf('profiles'), [api, library])
  const { run, busy } = useAction()
  const { open, menu } = useContextMenu()
  const [naming, setNaming] = useState<Naming | null>(null)
  const [packImportOpen, setPackImportOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const flightRef = useRef(false)
  const reportedLoadErr = useRef<Record<EngineShelfKind, unknown>>({
    collections: null,
    profiles: null,
  })

  useEffect(() => {
    for (const [kind, res] of [
      ['collections', collections],
      ['profiles', profiles],
    ] as const) {
      if (!res.error) {
        reportedLoadErr.current[kind] = null
        continue
      }
      if (reportedLoadErr.current[kind] === res.error) continue
      reportedLoadErr.current[kind] = res.error
      const d = describeError(res.error)
      toast({
        key: `studio:shelf-load:${kind}`,
        tone: 'error',
        message: d.message,
        ...(d.hint ? { hint: d.hint } : {}),
        action: { label: 'Retry', run: () => res.reload() },
      })
    }
  }, [collections, collections.error, profiles, profiles.error])

  const runShelf = async <T,>(
    key: string,
    fn: () => Promise<T>,
    success?: string | ((v: T) => string | null),
  ): Promise<T | undefined> => {
    if (flightRef.current) return undefined
    flightRef.current = true
    let caught: unknown = null
    try {
      const res = await run(
        key,
        async () => {
          try {
            return await fn()
          } catch (e) {
            caught = e
            throw e
          }
        },
        { once: true, quiet: true, ...(success ? { success } : {}) },
      )
      if (res === undefined && caught !== null) showShelfError(caught)
      return res
    } finally {
      flightRef.current = false
    }
  }

  const notifySwitchNotice = (res: ShelfSwitchResponse, fallbackMsg: string) => {
    if (res.restart) {
      toast({
        tone: 'warn',
        message: fallbackMsg,
        hint: res.restart,
        ...(res.restart_detail ? { detail: res.restart_detail } : {}),
        ...(typeof api.restart === 'function'
          ? {
              action: {
                label: 'Restart',
                run: () =>
                  void api.restart().catch((err: unknown) => {
                    const d = describeError(err)
                    toast({
                      tone: 'error',
                      message: d.message,
                      ...(d.hint ? { hint: d.hint } : {}),
                    })
                  }),
              },
            }
          : {}),
      })
    } else if (res.note) {
      toast({ tone: 'info', message: fallbackMsg, hint: res.note })
    }
  }

  const reload = (kind: EngineShelfKind, nextId?: string, reloadDesk = true) => {
    if (kind === 'collections') {
      collections.reload()
      if (reloadDesk) {
        if (onCollectionChange) onCollectionChange(nextId)
        else refresh()
      }
    } else {
      profiles.reload()
      if (reloadDesk) {
        prefs?.reload()
        onProfileChange?.()
      }
    }
  }

  const shelfResOf = (kind: EngineShelfKind) => (kind === 'collections' ? collections : profiles)
  const shelfOf = (kind: EngineShelfKind) => shelfResOf(kind).data ?? null

  const items = (kind: EngineShelfKind, shelf: EngineShelf): MenuItem[] => {
    const one = WORDS[kind].one
    const current = shelf.list.find((e) => e.id === shelf.current)
    const others = shelf.list.filter((e) => e.id !== shelf.current)
    return [
      ...shelf.list.map((e) => ({
        label: e.name,
        checked: e.id === shelf.current,
        onSelect: () => {
          if (e.id === shelf.current) return
          const msg = `Now using ${e.name}.`
          void runShelf(
            `switch:${kind}`,
            () => api.switchShelf(kind, e.id),
            (r) => (r.restart || r.note ? null : msg),
          ).then((res) => {
            if (!res) return
            notifySwitchNotice(res, msg)
            reload(kind, res.id)
          })
        },
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
            {
              label: 'Import a theme pack',
              icon: Package,
              onSelect: () => setPackImportOpen(true),
            },
          ]
        : []),
      {
        label: 'Export',
        icon: DownloadSimple,
        onSelect: () =>
          current &&
          void runShelf('export', async () => {
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
            void runShelf(
              'remove',
              () => done(api.removeShelf(kind, e.id)),
              `${e.name} removed.`,
            ).then((ok) => ok && reload(kind, undefined, false)),
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
    const rawName = fromDoc.trim() || f.name.replace(/\.json$/i, '').trim() || 'Imported'
    const name = [...rawName].slice(0, 100).join('').trim() || 'Imported'
    const r = await runShelf('import', () => api.importCollection(name, doc))
    if (!r) return
    reload('collections', r.id)
    toast({
      tone: r.missing.length ? 'warn' : 'ok',
      message: `${r.name}: ${r.scenes} scenes, ${r.sources} sources.`,
      ...(r.missing.length
        ? { hint: `${r.missing.length} kinds of source aren't on this computer.` }
        : {}),
    })
  }

  const commit = async () => {
    if (!naming || flightRef.current || busy !== null) return
    const value = naming.value.trim()
    if (!value) return
    const { kind, mode, id } = naming
    const okMsg =
      mode === 'rename'
        ? `Renamed to ${value}.`
        : mode === 'copy'
          ? `Duplicated as ${value}.`
          : `Created ${value}.`
    if (mode === 'rename' && id) {
      const ok = await runShelf('name', () => done(api.renameShelf(kind, id, value)), okMsg)
      if (ok) {
        setNaming(null)
        reload(kind, undefined, false)
      }
      return
    }
    const res = await runShelf(
      'name',
      () => api.newShelf(kind, value, mode === 'copy'),
      (r) => (r.restart || r.note ? null : okMsg),
    )
    if (res) {
      notifySwitchNotice(res, okMsg)
      setNaming(null)
      reload(kind, res.id)
    }
  }

  return (
    <>
      {(['collections', 'profiles'] as const).map((kind) => {
        const res = shelfResOf(kind)
        const shelf = shelfOf(kind)
        const loadErr = res.error
        const name =
          shelf?.list.find((e) => e.id === shelf.current)?.name ?? (loadErr ? 'Retry' : '…')
        const Icon = WORDS[kind].icon
        return (
          // Outlined, told apart by a blue or teal icon tile, not words (owner's pick P1).
          <button
            key={kind}
            type="button"
            aria-haspopup={shelf ? 'menu' : undefined}
            aria-label={`${WORDS[kind].one}: ${name}`}
            aria-busy={busy === `switch:${kind}` || undefined}
            title={`${WORDS[kind].one[0]?.toUpperCase()}${WORDS[kind].one.slice(1)}: ${name}`}
            disabled={(!shelf && !loadErr) || busy !== null}
            onClick={(e) => {
              if (!shelf) {
                if (loadErr) res.reload()
                return
              }
              open(e, WORDS[kind].one, items(kind, shelf), {
                title: WORDS[kind].many,
                icon: Icon,
                count: shelf.list.length,
              })
            }}
            className={cx(
              'fc-press inline-flex h-8 max-w-[200px] shrink-0 items-center gap-1.5 rounded-control bg-surface-1 pr-2.5 pl-1.5 text-[13.5px] font-semibold text-text shadow-[inset_0_0_0_1px_var(--fc-line-strong)] transition-shadow outline-none hover:shadow-[inset_0_0_0_1px_var(--fc-text-3)] focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50 2xl:max-w-[260px]',
              busy === `switch:${kind}` && 'opacity-60',
            )}
          >
            <span
              aria-hidden
              className={cx(
                'grid size-5 shrink-0 place-items-center rounded-[calc(var(--fc-radius-control)-4px)]',
                kind === 'collections'
                  ? 'bg-accent-soft text-accent-text'
                  : 'bg-teal-soft text-teal',
              )}
            >
              <Icon size={13} weight="bold" />
            </span>
            {/* The name shows on wide screens; compact (while live/recording) waits for 2xl so
                1280 px stays on one row without hiding the selectors (U3). */}
            <span className={cx('hidden min-w-0 truncate', compact ? '2xl:inline' : 'xl:inline')}>
              {name}
            </span>
            <CaretDown size={13} weight="bold" className="shrink-0 text-text-3" aria-hidden />
          </button>
        )
      })}
      <ImportOverlayPackDialog open={packImportOpen} onClose={() => setPackImportOpen(false)} />
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
        compact
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
            <Button variant="ghost" disabled={busy === 'name'} onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'name'}
              disabled={!naming?.value.trim() || busy !== null}
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
          <Field label="Name">
            {(p) => (
              <Input
                {...p}
                autoFocus
                data-autofocus
                maxLength={100}
                value={naming?.value ?? ''}
                onChange={(e) => setNaming((n) => n && { ...n, value: e.target.value })}
                className={cx('text-[16px]')}
              />
            )}
          </Field>
        </form>
      </Dialog>
    </>
  )
}
