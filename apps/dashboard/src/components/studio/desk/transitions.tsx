// Named transitions manager and from-scene / to-scene transition matrix.
// Precedence: exact (from, to) -> Any -> to -> from -> Any -> default transition.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowsLeftRight,
  Copy,
  GridFour,
  PencilSimple,
  Plus,
  Star,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  resolveTransitionFromScenes,
  type EngineNamedTransition,
  type EngineScenes,
  type EngineSettings,
  type EngineTransitionMatrixRule,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  InfoTip,
  Input,
  Segmented,
  Select,
  Skeleton,
  toast,
  cx,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'
import { OptionsForm } from './options'

export const TRANSITIONS: Record<string, string> = {
  fade_transition: 'Fade',
  cut_transition: 'Cut',
  swipe_transition: 'Swipe',
  slide_transition: 'Slide',
  fade_to_color_transition: 'Fade to colour',
  wipe_transition: 'Wipe',
  obs_stinger_transition: 'Stinger',
  // Ferrocast's own: what both scenes show glides into place.
  ferrocast_move: 'Move',
}

/** Transitions with settings of their own (a direction, a colour, an image, a video). */
export const HAS_SETTINGS = new Set([
  'swipe_transition',
  'slide_transition',
  'fade_to_color_transition',
  'wipe_transition',
  'obs_stinger_transition',
])

export type TransitionsTab = 'list' | 'matrix'

export interface TransitionsDialogState {
  tab: TransitionsTab
  transitionName?: string
}

/** Formats a transition summary without em dashes. */
export function transitionSummary(t: Pick<EngineNamedTransition, 'kind' | 'ms'>): string {
  const label = TRANSITIONS[t.kind] ?? t.kind
  if (t.kind === 'cut_transition') return label
  if (t.kind === 'obs_stinger_transition' && t.ms === 0) return label
  return `${label}, ${t.ms} ms`
}

/** Finds what plays for `(from, to)` including both direct rule and inherited fallback provenance. */
export function cellEffectiveInfo(
  scenes: EngineScenes,
  from: string | null,
  to: string | null,
): {
  directRule: string | null
  effectiveName: string
  via: 'pair' | 'to' | 'from' | 'default'
} {
  const rules = scenes.transition_matrix ?? []
  const list = scenes.named_transitions ?? []
  const def = list.find((t) => t.default) ?? list[0]
  const defName = def?.name ?? TRANSITIONS[scenes.transition.kind] ?? 'Fade'
  if (from === null && to === null) {
    return { directRule: defName, effectiveName: defName, via: 'default' }
  }
  const direct = rules.find((r) => r.from === from && r.to === to)?.transition ?? null
  if (from !== null && to !== null) {
    const res = resolveTransitionFromScenes(scenes, from, to)
    return {
      directRule: direct,
      effectiveName: res.name || (TRANSITIONS[res.kind] ?? res.kind),
      via: res.via,
    }
  }
  if (from === null && to !== null) {
    if (direct) return { directRule: direct, effectiveName: direct, via: 'to' }
    const legacy = scenes.scenes.find((s) => s.name === to)?.transition
    if (legacy) {
      return {
        directRule: null,
        effectiveName: TRANSITIONS[legacy.kind] ?? legacy.kind,
        via: 'to',
      }
    }
    return { directRule: null, effectiveName: defName, via: 'default' }
  }
  // from !== null && to === null
  return {
    directRule: direct,
    effectiveName: direct ?? defName,
    via: direct ? 'from' : 'default',
  }
}

/** Computes the next valid focus coordinate in the grid, skipping diagonal self cells. */
export function gridStepCoord(
  row: number,
  col: number,
  rows: number,
  cols: number,
  key: string,
): [number, number] | null {
  if (rows <= 0 || cols <= 0) return null
  const isSelf = (r: number, c: number) => r > 0 && c > 0 && r === c
  let r = row
  let c = col
  if (key === 'Home') {
    return [row, 0]
  }
  if (key === 'End') {
    const endCol = cols - 1
    return isSelf(row, endCol) && endCol > 0 ? [row, endCol - 1] : [row, endCol]
  }
  const delta: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }
  const d = delta[key]
  if (!d) return null
  for (let steps = 0; steps < Math.max(rows, cols); steps++) {
    r += d[0]
    c += d[1]
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null
    if (!isSelf(r, c)) return [r, c]
  }
  return null
}

/** Sorts matrix rules cleanly: exact pairs, then Any -> scene, then scene -> Any. */
export function sortMatrixRules(
  rules: EngineTransitionMatrixRule[],
  sceneOrder: string[],
): EngineTransitionMatrixRule[] {
  const rank = (name: string | null) => {
    if (name === null) return -1
    const idx = sceneOrder.indexOf(name)
    return idx >= 0 ? idx : 9999
  }
  const kindRank = (r: EngineTransitionMatrixRule) => {
    if (r.from !== null && r.to !== null) return 0
    if (r.from === null && r.to !== null) return 1
    return 2
  }
  return [...rules].sort((a, b) => {
    const ka = kindRank(a)
    const kb = kindRank(b)
    if (ka !== kb) return ka - kb
    const fa = rank(a.from)
    const fb = rank(b.from)
    if (fa !== fb) return fa - fb
    return rank(a.to) - rank(b.to)
  })
}

export function TransitionsDialog({
  initial,
  onClose,
}: {
  initial: TransitionsDialogState | null
  onClose: () => void
}) {
  const { scenes, kinds, refresh } = useDesk()
  const { run, busy } = useAction()
  const [tab, setTab] = useState<TransitionsTab>('list')
  const [selectedName, setSelectedName] = useState<string>('')
  const [inlineErr, setInlineErr] = useState<{ message: string; hint: string | null } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!initial) return
    setTab(initial.tab)
    setInlineErr(null)
    setSelectedName(initial.transitionName ?? '')
  }, [initial])

  const named = useMemo(
    () => scenes.data?.named_transitions ?? [],
    [scenes.data?.named_transitions],
  )
  const selected = useMemo(
    () =>
      named.find((t) => t.name === selectedName) ??
      named.find((t) => t.default) ??
      named[0] ??
      null,
    [named, selectedName],
  )

  const mutate = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T>,
      note?: string,
      nextSelect?: (res: T) => string | undefined,
    ): Promise<boolean> => {
      setInlineErr(null)
      try {
        const res = await fn()
        const target = nextSelect?.(res)
        if (target) setSelectedName(target)
        refresh()
        if (note) {
          setAnnouncement(note)
          toast({ tone: 'ok', message: note })
        }
        return true
      } catch (e) {
        const d = describeError(e)
        setInlineErr(d)
        setAnnouncement(d.message)
        return false
      }
    },
    [refresh],
  )

  return (
    <Dialog
      compact
      size="wide"
      open={initial !== null}
      onClose={onClose}
      title="Transitions and matrix"
      description="Create reusable named transitions and choose which plays between each scene."
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span role="status" aria-live="polite" className="text-xs text-text-3">
            {announcement || (busy ? 'Saving...' : '')}
          </span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {scenes.error && !scenes.data ? (
        <LoadError error={scenes.error} onRetry={scenes.reload} />
      ) : !scenes.data ? (
        <div data-testid="transitions-loading" className="space-y-3 py-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              label="Transitions view"
              size="sm"
              value={tab}
              options={[
                { value: 'list', label: 'Saved transitions' },
                { value: 'matrix', label: 'Transition matrix' },
              ]}
              onChange={(next) => {
                setInlineErr(null)
                setTab(next)
              }}
            />
            <InfoTip label="How transition precedence works">
              When switching scenes, Ferrocast checks in order: 1. Exact pair (From to To), 2. Any
              to target scene, 3. Source scene to Any, 4. Default transition.
            </InfoTip>
          </div>

          {inlineErr && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold">{inlineErr.message}</p>
                {inlineErr.hint && <p className="m-0 mt-0.5 opacity-85">{inlineErr.hint}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setInlineErr(null)}
                className="rounded p-0.5 hover:bg-black/15"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          )}

          {tab === 'list' ? (
            <NamedTransitionsTab
              named={named}
              selected={selected}
              kinds={kinds.data?.transitions ?? []}
              busy={busy}
              run={run}
              onSelect={setSelectedName}
              mutate={mutate}
            />
          ) : (
            <TransitionMatrixTab
              scenes={scenes.data}
              named={named}
              busy={busy}
              run={run}
              mutate={mutate}
            />
          )}
        </div>
      )}
    </Dialog>
  )
}

function NamedTransitionsTab({
  named,
  selected,
  kinds,
  busy,
  run,
  onSelect,
  mutate,
}: {
  named: EngineNamedTransition[]
  selected: EngineNamedTransition | null
  kinds: { id: string; name: string }[]
  busy: string | null
  run: ReturnType<typeof useAction>['run']
  onSelect: (name: string) => void
  mutate: <T>(
    key: string,
    fn: () => Promise<T>,
    note?: string,
    nextSelect?: (res: T) => string | undefined,
  ) => Promise<boolean>
}) {
  const { api } = useDesk()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('fade_transition')
  const [newMs, setNewMs] = useState('350')
  const [newDef, setNewDef] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [msDraft, setMsDraft] = useState<string>('')

  useEffect(() => {
    setMsDraft(selected ? String(selected.ms) : '')
  }, [selected?.name, selected?.ms, selected])

  const availableKinds = useMemo(() => {
    const byId = new Map(Object.entries(TRANSITIONS))
    for (const k of kinds) {
      if (!byId.has(k.id)) byId.set(k.id, k.name)
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }))
  }, [kinds])

  const submitCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const msNum =
      newKind === 'cut_transition' ? 0 : Math.max(0, Math.min(20000, Number(newMs) || 300))
    const ok = await run('create-tr', () =>
      mutate(
        'create-tr',
        () =>
          api.addNamedTransition({
            name: trimmed,
            kind: newKind,
            ms: msNum,
            settings: {},
            default: newDef,
          }),
        `Added transition ${trimmed}.`,
        (res) => res.name,
      ),
    )
    if (ok) {
      setCreating(false)
      setNewName('')
      setNewMs('350')
      setNewDef(false)
    }
  }

  const submitRename = async (from: string) => {
    const to = renameVal.trim()
    if (!to || to === from) {
      setRenaming(null)
      return
    }
    const ok = await run('rename-tr', () =>
      mutate(
        'rename-tr',
        () => api.renameNamedTransition(from, to),
        `Renamed transition to ${to}.`,
        (res) => res.name,
      ),
    )
    if (ok) setRenaming(null)
  }

  const commitDuration = async () => {
    if (!selected || selected.kind === 'cut_transition') return
    const parsed = Math.round(Number(msDraft))
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20000 || parsed === selected.ms) {
      setMsDraft(String(selected.ms))
      return
    }
    await run('dur-tr', () =>
      mutate(
        'dur-tr',
        () => api.updateNamedTransition(selected.name, { ms: parsed }),
        `Set ${selected.name} length to ${parsed} ms.`,
      ),
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-bold text-text">Saved transitions ({named.length})</h3>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              setCreating((c) => !c)
              setNewName('')
            }}
          >
            <Plus size={14} weight="bold" />
            New transition
          </Button>
        </div>

        {creating && (
          <form
            aria-label="New transition form"
            className="flex flex-col gap-2.5 rounded-control border border-line-strong bg-surface-2 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void submitCreate()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setCreating(false)
              }
            }}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
                <span>Name</span>
                <Input
                  aria-label="New transition name"
                  maxLength={100}
                  value={newName}
                  placeholder="e.g. Fast Swipe"
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
                <span>Kind</span>
                <Select
                  aria-label="New transition kind"
                  value={newKind}
                  onChange={(e) => {
                    const k = e.target.value
                    setNewKind(k)
                    if (k === 'cut_transition') setNewMs('0')
                    else if (newMs === '0') setNewMs('350')
                  }}
                >
                  {availableKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label className="flex w-32 flex-col gap-1 text-xs font-semibold text-text-2">
                <span>Length (ms)</span>
                <Input
                  aria-label="New transition length in ms"
                  type="number"
                  min={0}
                  max={20000}
                  step={50}
                  disabled={newKind === 'cut_transition'}
                  value={newKind === 'cut_transition' ? '0' : newMs}
                  onChange={(e) => setNewMs(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1.5 pb-1 text-xs font-semibold text-text-2">
                <input
                  type="checkbox"
                  checked={newDef}
                  onChange={(e) => setNewDef(e.target.checked)}
                />
                Make default
              </label>
              <div className="flex gap-1.5">
                <Button type="button" size="xs" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="xs"
                  variant="primary"
                  disabled={!newName.trim() || busy !== null}
                >
                  Add
                </Button>
              </div>
            </div>
          </form>
        )}

        <ul
          aria-label="Saved transitions list"
          className="flex flex-col divide-y divide-line overflow-hidden rounded-control border border-line bg-surface-1"
        >
          {named.map((t) => {
            const active = selected?.name === t.name
            const isRenaming = renaming === t.name
            return (
              <li
                key={t.name}
                className={cx(
                  'flex items-center gap-2 px-2.5 py-2 transition-colors',
                  active && 'bg-accent-soft/45',
                )}
              >
                {isRenaming ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void submitRename(t.name)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setRenaming(null)
                      }
                    }}
                  >
                    <Input
                      aria-label={`Rename ${t.name}`}
                      maxLength={100}
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      className="h-8! min-w-0 flex-1 text-xs!"
                    />
                    <Button type="submit" size="xs" variant="primary" disabled={!renameVal.trim()}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(t.name)}
                      className="flex min-w-0 flex-1 flex-col text-left outline-none focus-visible:shadow-[var(--fc-focus)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-text">{t.name}</span>
                        {t.default && <Badge tone="accent">Default</Badge>}
                      </span>
                      <span className="text-xs text-text-3 tabular-nums">
                        {transitionSummary(t)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {!t.default && (
                        <IconButton
                          size="xs"
                          label={`Set ${t.name} as default`}
                          disabled={busy !== null}
                          onClick={() =>
                            void run('def-tr', () =>
                              mutate(
                                'def-tr',
                                () => api.setDefaultNamedTransition(t.name),
                                `${t.name} is now the default transition.`,
                              ),
                            )
                          }
                        >
                          <Star size={14} weight="bold" />
                        </IconButton>
                      )}
                      <IconButton
                        size="xs"
                        label={`Rename ${t.name}`}
                        disabled={busy !== null}
                        onClick={() => {
                          setRenaming(t.name)
                          setRenameVal(t.name)
                        }}
                      >
                        <PencilSimple size={14} weight="bold" />
                      </IconButton>
                      <IconButton
                        size="xs"
                        label={`Duplicate ${t.name}`}
                        disabled={busy !== null}
                        onClick={() =>
                          void run('dup-tr', () =>
                            mutate(
                              'dup-tr',
                              () => api.duplicateNamedTransition(t.name),
                              `Duplicated ${t.name}.`,
                              (res) => res.name,
                            ),
                          )
                        }
                      >
                        <Copy size={14} weight="bold" />
                      </IconButton>
                      <IconButton
                        size="xs"
                        label={
                          named.length <= 1
                            ? `Cannot delete last transition ${t.name}`
                            : `Delete ${t.name}`
                        }
                        disabled={named.length <= 1 || busy !== null}
                        onClick={() => setConfirmDelete(t.name)}
                      >
                        <Trash size={14} weight="bold" />
                      </IconButton>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-3 rounded-control border border-line bg-surface-2/40 p-3">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <div className="min-w-0">
                <h4 className="m-0 truncate text-sm font-bold text-text">{selected.name}</h4>
                <p className="m-0 text-xs text-text-3 tabular-nums">
                  {transitionSummary(selected)}
                </p>
              </div>
              {!selected.default && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void run('def-tr', () =>
                      mutate(
                        'def-tr',
                        () => api.setDefaultNamedTransition(selected.name),
                        `${selected.name} is now the default transition.`,
                      ),
                    )
                  }
                >
                  Make default
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
                <span>Kind</span>
                <Select
                  aria-label={`Kind for ${selected.name}`}
                  disabled={busy !== null}
                  value={selected.kind}
                  onChange={(e) => {
                    const kind = e.target.value
                    void run('kind-tr', () =>
                      mutate(
                        'kind-tr',
                        () =>
                          api.updateNamedTransition(selected.name, {
                            kind,
                            ...(kind === 'cut_transition' ? { ms: 0 } : {}),
                          }),
                        `Updated ${selected.name} to ${TRANSITIONS[kind] ?? kind}.`,
                      ),
                    )
                  }}
                >
                  {availableKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
                <span>Duration (ms)</span>
                <Input
                  aria-label={`Duration for ${selected.name}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20000}
                  step={50}
                  disabled={selected.kind === 'cut_transition' || busy !== null}
                  value={selected.kind === 'cut_transition' ? '0' : msDraft}
                  onChange={(e) => setMsDraft(e.target.value)}
                  onBlur={() => void commitDuration()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitDuration()
                    }
                  }}
                />
              </label>
            </div>

            {HAS_SETTINGS.has(selected.kind) ? (
              <div className="border-t border-line pt-2.5">
                <NamedTransitionSettingsForm
                  key={`${selected.name}:${selected.kind}`}
                  transition={selected}
                  onPatch={(key, val) =>
                    void run('set-tr', () =>
                      mutate('set-tr', () =>
                        api.updateNamedTransition(selected.name, {
                          settings: { [key]: val },
                        }),
                      ),
                    )
                  }
                />
              </div>
            ) : (
              <p className="m-0 text-xs text-text-3">
                {selected.kind === 'ferrocast_move'
                  ? 'Move glides matching sources smoothly between scenes over the duration.'
                  : 'This transition kind uses no extra properties beyond length.'}
              </p>
            )}
          </>
        ) : (
          <p className="m-0 text-xs text-text-3">Select a transition to edit its properties.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete ?? 'transition'}?`}
        description="Any scene matrix rules using this transition will be cleared and fall back to wildcard or default rules."
        confirm="Delete transition"
        onConfirm={() => {
          const target = confirmDelete
          if (!target) return
          void run('del-tr', () =>
            mutate('del-tr', () => api.deleteNamedTransition(target), `Deleted ${target}.`),
          )
        }}
      />
    </div>
  )
}

function NamedTransitionSettingsForm({
  transition,
  onPatch,
}: {
  transition: EngineNamedTransition
  onPatch: (key: string, value: unknown) => void
}) {
  const { api } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.options(transition.kind), api.defaults(transition.kind)]),
    [api, transition.kind],
  )
  const [draft, setDraft] = useState<EngineSettings | null>(null)
  useEffect(() => {
    setDraft(null)
  }, [transition.name, transition.kind])

  if (loaded.error && !loaded.data) {
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  }
  if (!loaded.data) return <Skeleton className="h-28" />
  const [opts, defaults] = loaded.data
  const shown = draft ?? { ...defaults, ...transition.settings }
  return (
    <OptionsForm
      opts={opts}
      values={shown}
      onChange={(key, value) => {
        setDraft({ ...shown, [key]: value })
        onPatch(key, value)
      }}
    />
  )
}

function TransitionMatrixTab({
  scenes,
  named,
  busy,
  run,
  mutate,
}: {
  scenes: EngineScenes
  named: EngineNamedTransition[]
  busy: string | null
  run: ReturnType<typeof useAction>['run']
  mutate: <T>(
    key: string,
    fn: () => Promise<T>,
    note?: string,
    nextSelect?: (res: T) => string | undefined,
  ) => Promise<boolean>
}) {
  const { api } = useDesk()
  const sceneNames = useMemo(() => scenes.scenes.map((s) => s.name), [scenes.scenes])
  const rowHeaders: (string | null)[] = useMemo(() => [null, ...sceneNames], [sceneNames])
  const colHeaders: (string | null)[] = useMemo(() => [null, ...sceneNames], [sceneNames])

  // Keyboard grid state: start active focus on (0, 1) if there are scenes, else (0, 0).
  const [focusCell, setFocusCell] = useState<[number, number]>([0, sceneNames.length > 0 ? 1 : 0])
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null)
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Mobile form state
  const [addFrom, setAddFrom] = useState<string>('__any__')
  const [addTo, setAddTo] = useState<string>(sceneNames[0] ?? '__any__')
  const [addTr, setAddTr] = useState<string>(named[0]?.name ?? '')

  useEffect(() => {
    if (!named.some((t) => t.name === addTr) && named[0]) setAddTr(named[0].name)
  }, [named, addTr])

  const defaultTr = useMemo(() => named.find((t) => t.default) ?? named[0] ?? null, [named])
  const rules = useMemo(
    () => sortMatrixRules(scenes.transition_matrix ?? [], sceneNames),
    [scenes.transition_matrix, sceneNames],
  )

  const registerRef = (r: number, c: number) => (el: HTMLButtonElement | null) => {
    const key = `${r}:${c}`
    if (el) cellRefs.current.set(key, el)
    else cellRefs.current.delete(key)
  }

  const returnCellFocus = (r: number, c: number) => {
    setFocusCell([r, c])
    requestAnimationFrame(() => cellRefs.current.get(`${r}:${c}`)?.focus())
  }

  const moveCellFocus = (r: number, c: number) => {
    setFocusCell([r, c])
    cellRefs.current.get(`${r}:${c}`)?.focus()
  }

  const handleCellKeyDown = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setEditingCell([r, c])
      return
    }
    const next = gridStepCoord(r, c, rowHeaders.length, colHeaders.length, e.key)
    if (next) {
      e.preventDefault()
      moveCellFocus(next[0], next[1])
    }
  }

  const commitRule = async (
    from: string | null,
    to: string | null,
    transition: string | null,
    focusBack?: [number, number],
  ) => {
    if (from === null && to === null) {
      if (transition) {
        await run('def-tr', () =>
          mutate(
            'def-tr',
            () => api.setDefaultNamedTransition(transition),
            `${transition} is now the default transition.`,
          ),
        )
      }
    } else {
      const label = `${from ?? 'Any'} to ${to ?? 'Any'}`
      await run('matrix-tr', () =>
        mutate(
          'matrix-tr',
          () => api.setTransitionMatrixRule({ from, to, transition }),
          transition ? `Set ${label} to ${transition}.` : `Cleared override for ${label}.`,
        ),
      )
    }
    setEditingCell(null)
    if (focusBack) returnCellFocus(focusBack[0], focusBack[1])
  }

  const mobFrom = addFrom === '__any__' ? null : addFrom
  const mobTo = addTo === '__any__' ? null : addTo
  const mobInvalid = (mobFrom === null && mobTo === null) || (mobFrom !== null && mobFrom === mobTo)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-text-2">
        <strong className="text-text">Resolution order:</strong> 1. Exact pair (From to To), 2. Any
        to scene, 3. Scene to Any, 4. Default ({defaultTr?.name ?? 'Fade'}).
      </div>

      {sceneNames.length < 2 && (
        <div className="rounded-control border border-line bg-surface-1 px-3 py-2 text-xs text-text-3">
          Only one scene exists so far. Any to scene rules work now; add a second scene for exact
          pair overrides.
        </div>
      )}

      {rules.length === 0 && (
        <div
          data-testid="matrix-empty-notice"
          className="rounded-control border border-dashed border-line-strong bg-surface-1 px-3 py-2 text-xs text-text-2"
        >
          No matrix rules set yet. Every switch currently uses the default transition (
          <span className="font-semibold text-text">{defaultTr?.name ?? 'Fade'}</span>).
        </div>
      )}

      {/* Desktop 2D keyboard-accessible grid */}
      <div className="hidden overflow-x-auto rounded-control border border-line bg-surface-1 md:block">
        <table
          role="grid"
          aria-label="From scene to To scene transition matrix"
          className="w-full border-collapse text-left text-xs"
        >
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-28 border-r border-line bg-surface-2 px-2.5 py-2 font-bold text-text-2"
              >
                From \ To
              </th>
              {colHeaders.map((col, c) => (
                <th
                  key={col ?? '__any__'}
                  role="columnheader"
                  scope="col"
                  className={cx(
                    'min-w-28 px-2.5 py-2 font-bold',
                    c === 0 ? 'text-accent-text' : 'text-text',
                  )}
                >
                  {col ?? 'Any'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rowHeaders.map((row, r) => (
              <tr key={row ?? '__any__'}>
                <th
                  role="rowheader"
                  scope="row"
                  className={cx(
                    'sticky left-0 z-10 border-r border-line bg-surface-2/85 px-2.5 py-2 font-bold',
                    r === 0 ? 'text-accent-text' : 'text-text',
                  )}
                >
                  {row ?? 'Any'}
                </th>
                {colHeaders.map((col, c) => {
                  const self = r > 0 && r === c
                  if (self) {
                    return (
                      <td
                        key={`${r}:${c}`}
                        role="gridcell"
                        aria-disabled="true"
                        className="bg-surface-2/30 px-2.5 py-2 text-[11px] text-text-3"
                      >
                        Same scene
                      </td>
                    )
                  }
                  const info = cellEffectiveInfo(scenes, row, col)
                  const isAnyAny = row === null && col === null
                  const isEditing =
                    editingCell !== null && editingCell[0] === r && editingCell[1] === c
                  const fromLabel = row ?? 'Any'
                  const toLabel = col ?? 'Any'
                  const subLabel = isAnyAny
                    ? 'Default'
                    : info.directRule
                      ? row === null
                        ? 'Any to scene'
                        : col === null
                          ? 'Scene to Any'
                          : 'Exact pair'
                      : info.via === 'to'
                        ? 'via Any to scene'
                        : info.via === 'from'
                          ? 'via Scene to Any'
                          : 'via Default'

                  return (
                    <td
                      key={`${r}:${c}`}
                      role="gridcell"
                      aria-selected={focusCell[0] === r && focusCell[1] === c}
                      className={cx(
                        'p-1 align-middle',
                        info.directRule && !isAnyAny && 'bg-accent-soft/35',
                      )}
                    >
                      {isEditing ? (
                        <Select
                          autoFocus
                          aria-label={`Select transition for ${fromLabel} to ${toLabel}`}
                          className="h-8! w-full! text-xs!"
                          value={isAnyAny ? info.effectiveName : (info.directRule ?? '')}
                          onChange={(e) => {
                            const val = e.target.value
                            void commitRule(row, col, val === '' ? null : val, [r, c])
                          }}
                          onBlur={() => {
                            setEditingCell(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              e.stopPropagation()
                              setEditingCell(null)
                              returnCellFocus(r, c)
                            }
                          }}
                        >
                          {!isAnyAny && (
                            <option value="">Use inherited ({info.effectiveName})</option>
                          )}
                          {named.map((t) => (
                            <option key={t.name} value={t.name}>
                              {t.name} ({transitionSummary(t)})
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <button
                          ref={registerRef(r, c)}
                          type="button"
                          tabIndex={focusCell[0] === r && focusCell[1] === c ? 0 : -1}
                          disabled={busy !== null}
                          onFocus={() => setFocusCell([r, c])}
                          onClick={() => setEditingCell([r, c])}
                          onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                          className={cx(
                            'flex w-full flex-col rounded-[5px] px-2 py-1 text-left outline-none transition-colors hover:bg-surface-3 focus-visible:shadow-[var(--fc-focus)]',
                            info.directRule && !isAnyAny
                              ? 'font-bold text-accent-text'
                              : isAnyAny
                                ? 'font-bold text-text'
                                : 'text-text-3',
                          )}
                        >
                          <span className="sr-only">
                            {isAnyAny
                              ? 'Default transition: '
                              : `From ${fromLabel} to ${toLabel}: `}
                          </span>
                          <span className="truncate">{info.effectiveName}</span>{' '}
                          <span className="text-[10.5px] font-normal opacity-80">{subLabel}</span>
                          {info.directRule && !isAnyAny && (
                            <span className="sr-only"> (override)</span>
                          )}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile 375px accessible list layout */}
      <div className="flex flex-col gap-3 md:hidden" data-testid="matrix-mobile-list">
        <form
          aria-label="Add matrix rule"
          className="flex flex-col gap-2.5 rounded-control border border-line bg-surface-2/60 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (mobInvalid || !addTr) return
            void commitRule(mobFrom, mobTo, addTr)
          }}
        >
          <div className="text-xs font-bold text-text">Add or replace rule</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
              <span>From scene</span>
              <Select
                aria-label="Rule From scene"
                value={addFrom}
                onChange={(e) => setAddFrom(e.target.value)}
              >
                <option value="__any__">Any scene</option>
                {sceneNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
              <span>To scene</span>
              <Select
                aria-label="Rule To scene"
                value={addTo}
                onChange={(e) => setAddTo(e.target.value)}
              >
                <option value="__any__">Any scene</option>
                {sceneNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
            <span>Transition</span>
            <Select
              aria-label="Rule transition"
              value={addTr}
              onChange={(e) => setAddTr(e.target.value)}
            >
              {named.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({transitionSummary(t)})
                </option>
              ))}
            </Select>
          </label>
          {mobInvalid && (
            <p className="m-0 text-xs text-text-3">
              {mobFrom === null && mobTo === null
                ? 'Pick a From scene, a To scene, or both. Default already covers Any to Any.'
                : 'Choose two different scenes for an override.'}
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={mobInvalid || !addTr || busy !== null}
          >
            <Plus size={14} weight="bold" />
            Save matrix rule
          </Button>
        </form>

        <ul
          aria-label="Matrix rules list"
          className="flex flex-col divide-y divide-line overflow-hidden rounded-control border border-line bg-surface-1"
        >
          {rules.map((r) => {
            const label = `${r.from ?? 'Any'} to ${r.to ?? 'Any'}`
            const scope =
              r.from !== null && r.to !== null
                ? 'Exact pair'
                : r.from === null
                  ? 'Any to scene'
                  : 'Scene to Any'
            return (
              <li
                key={`${r.from ?? '*'}->${r.to ?? '*'}`}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    <span className="truncate">{r.from ?? 'Any'}</span>
                    <ArrowsLeftRight size={12} className="shrink-0 text-text-3" aria-hidden />
                    <span className="truncate">{r.to ?? 'Any'}</span>
                  </div>
                  <div className="text-[11px] text-text-3">{scope}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Select
                    aria-label={`Transition for ${label}`}
                    className="h-8! w-32! text-xs!"
                    disabled={busy !== null}
                    value={r.transition}
                    onChange={(e) => void commitRule(r.from, r.to, e.target.value)}
                  >
                    {named.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    size="xs"
                    label={`Remove rule ${label}`}
                    disabled={busy !== null}
                    onClick={() => void commitRule(r.from, r.to, null)}
                  >
                    <Trash size={14} weight="bold" />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function MatrixIcon() {
  return <GridFour size={16} weight="bold" aria-hidden />
}
