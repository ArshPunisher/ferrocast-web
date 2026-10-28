// A source's panel, beside the preview (it stays visible where the panel doesn't cover it):
// rename it; for a sound, its level, "hear it" and the scenes it plays in; its filters in
// plain words; and every setting OBS has for it, applied as you change them.

import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CaretDown,
  Check,
  CaretUp,
  CursorClick,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  type EngineAudio,
  type EngineMonitor,
  type EngineSettings,
} from '@ferrocast/api'
import {
  Button,
  IconButton,
  InfoTip,
  Input,
  Segmented,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { done, useAction, useResource } from '../../../lib/hooks'
import { FILTERS, FILTER_LABEL, KindTile, useDesk } from './common'
import { Meter, useLevels } from './mixer'
import { OptionsForm } from './options'

/** Sends edits once they've stopped changing for a moment. */
function useApplied(apply: (edits: EngineSettings) => Promise<unknown>, after: () => void) {
  const [edits, setEdits] = useState<EngineSettings>({})
  const applyRef = useRef(apply)
  applyRef.current = apply
  const afterRef = useRef(after)
  afterRef.current = after
  useEffect(() => {
    if (Object.keys(edits).length === 0) return
    const t = setTimeout(() => {
      const sent = edits
      void applyRef
        .current(sent)
        .catch((err: unknown) => {
          // Not applied: say why, and show the engine's own values again.
          const d = describeError(err)
          toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
        })
        .finally(() => {
          setEdits((e) => (e === sent ? {} : e))
          afterRef.current()
        })
    }, 350)
    return () => clearTimeout(t)
  }, [edits])
  return [edits, (k: string, v: unknown) => setEdits((p) => ({ ...p, [k]: v }))] as const
}

export function SourcePanel() {
  const { editing, edit } = useDesk()
  if (!editing) return null
  return <Panel key={editing} name={editing} onClose={() => edit(null)} />
}

function Panel({ name, onClose }: { name: string; onClose: () => void }) {
  const { api, audio, items, scene, refresh, edit } = useDesk()
  const { run, busy } = useAction()
  const [rename, setRename] = useState(name)
  // Removing asks once more: the button turns into "Sure? Remove".
  const [sure, setSure] = useState(false)
  const a = audio.data?.find((x) => x.name === name) ?? null
  const item = items.data?.flatMap((i) => [i, ...i.children]).find((i) => i.name === name) ?? null
  const kind = a?.kind ?? item?.kind ?? ''
  const levels = useLevels(api, a ? [name] : [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const commitName = async () => {
    const to = rename.trim()
    if (!to || to === name) return setRename(name)
    const ok = await run('rename', () => done(api.rename(name, to)))
    if (ok) {
      refresh()
      edit(to)
    } else setRename(name)
  }
  const setAudio = (patch: { volume_db?: number; muted?: boolean; monitor?: EngineMonitor }) => {
    audio.set((list) => (list ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    void run('audio', () => api.setAudio(name, patch))
  }

  return (
    <aside
      data-over-preview
      aria-label={`${name} settings`}
      className="fixed top-0 right-0 bottom-[var(--fc-statusbar,0px)] z-40 flex w-full max-w-[440px] flex-col border-l border-line-strong bg-surface-1 shadow-pop"
    >
      <header className="flex items-center gap-2.5 border-b border-line py-3 pr-3 pl-4">
        <KindTile kind={kind} size={36} />
        <Input
          aria-label="Name"
          className="h-9! min-w-0 flex-1 border-transparent! bg-transparent! font-display text-[18px]! font-bold hover:border-line-strong!"
          maxLength={100}
          value={rename}
          onChange={(e) => setRename(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {kind === 'ferrocast_web' && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              busy={busy === 'interact'}
              onClick={() => void run('interact', () => done(api.web(name, 'interact')))}
            >
              <CursorClick size={16} weight="bold" /> Interact
            </Button>
            <Button
              variant="secondary"
              busy={busy === 'reload'}
              onClick={() => void run('reload', () => done(api.web(name, 'reload')))}
            >
              <ArrowClockwise size={16} weight="bold" /> Reload
            </Button>
          </div>
        )}
        {a && (
          <section aria-label="Sound" className="flex flex-col gap-3">
            <h3 className="m-0 font-display text-[14px] font-extrabold text-text-2">Sound</h3>
            <div className="flex flex-col gap-3 rounded-control border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between text-[14.5px]">
                <span>Volume</span>
                <span className="font-mono text-[13.5px] text-text-2 tabular-nums">
                  {a.muted ? 'Muted' : `${a.volume_db.toFixed(1)} dB`}
                </span>
              </div>
              <Meter
                tall
                level={levels[name]}
                muted={a.muted}
                volumeDb={a.volume_db}
                label={`${name} volume`}
                onVolume={(d) => setAudio({ volume_db: Math.round(d * 10) / 10 })}
              />
              <Switch label="Mute" checked={a.muted} onChange={(m) => setAudio({ muted: m })} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-sm font-medium">
                  Hear it
                  <InfoTip label="About hearing it">
                    Plays it in your headphones. Only me keeps it off the stream.
                  </InfoTip>
                </span>
                <Segmented
                  label="Hear it"
                  value={a.monitor}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'only_me', label: 'Only me' },
                    { value: 'me_and_stream', label: 'Me and stream' },
                  ]}
                  onChange={(monitor) => setAudio({ monitor })}
                />
              </div>
            </div>
            {a.channel ? <EverywhereIn sound={a} /> : <PlaysIn name={name} />}
          </section>
        )}
        <Filters name={name} audio={!!a} />
        <Settings name={name} />
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
        {item ? (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft"
            busy={busy === 'remove'}
            onBlur={() => setSure(false)}
            onClick={() =>
              !sure
                ? setSure(true)
                : void run('remove', () => done(api.editItem(scene, item.id, 'remove'))).then(
                    (ok) => {
                      if (!ok) return
                      refresh()
                      onClose()
                    },
                  )
            }
          >
            <Trash size={15} /> {sure ? `Sure? Remove from ${scene}` : `Remove from ${scene}`}
          </Button>
        ) : a?.channel ? (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft"
            busy={busy === 'remove'}
            onBlur={() => setSure(false)}
            onClick={() =>
              !sure
                ? setSure(true)
                : void run('remove', () => done(api.setChannel(a.channel ?? 0, null))).then(
                    (ok) => {
                      if (!ok) return
                      refresh()
                      onClose()
                    },
                  )
            }
          >
            <Trash size={15} /> {sure ? 'Sure? Remove' : 'Remove'}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </aside>
  )
}

/** Scenes grouped by a shared first part ("Lo-fi loft · Ending" goes in "Lo-fi loft"), when
 * two or more share it; the rest are "Your scenes". */
export function groupScenes(
  names: string[],
): { title: string; scenes: { name: string; label: string }[] }[] {
  const prefix = (n: string) => (n.includes(' · ') ? n.slice(0, n.indexOf(' · ')) : null)
  const counts = new Map<string, number>()
  for (const n of names) {
    const p = prefix(n)
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  const mine: { name: string; label: string }[] = []
  const groups = new Map<string, { name: string; label: string }[]>()
  for (const n of names) {
    const p = prefix(n)
    if (p && (counts.get(p) ?? 0) >= 2) {
      const g = groups.get(p) ?? []
      g.push({ name: n, label: n.slice(p.length + 3) })
      groups.set(p, g)
    } else mine.push({ name: n, label: n })
  }
  return [
    ...(mine.length ? [{ title: 'Your scenes', scenes: mine }] : []),
    ...[...groups].map(([title, scenes]) => ({ title, scenes })),
  ]
}

/**
 * A sound heard in every scene (one of OBS's global devices). Picking "Some scenes" and a
 * scene moves it into the scenes picked instead: the same device, settings, volume and
 * listening, then the global spot is freed (owner: a mic or capture sound only in one or two
 * scenes).
 */
function EverywhereIn({ sound }: { sound: EngineAudio }) {
  const { api, pictureScenes, refresh, select } = useDesk()
  const { run, busy } = useAction()
  const [choosing, setChoosing] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  // The edited picture's scenes only: in Vertical, its own (owner, 28 Oct: no wide scenes
  // there).
  const all = pictureScenes.map((s) => s.name)
  const move = async () => {
    const ok = await run('in:some', async () => {
      const settings = await api.settings(sound.name)
      const [first, ...rest] = picked
      if (!first || sound.channel === null) return false
      // Freed first: a name can be in use once.
      await api.setChannel(sound.channel, null)
      try {
        await api.addSource(first, { kind: sound.kind, name: sound.name, settings })
      } catch (e) {
        // Put it back as it was, so nothing is lost.
        await api
          .setChannel(sound.channel, { kind: sound.kind, name: sound.name, settings })
          .catch(() => undefined)
        throw e
      }
      for (const scene of rest) await api.addExisting(scene, sound.name)
      await api.setAudio(sound.name, {
        volume_db: sound.volume_db,
        muted: sound.muted,
        monitor: sound.monitor,
      })
      return true
    })
    if (ok) {
      select(null)
      refresh()
    }
  }
  const option = (on: boolean, label: string, onPick: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={busy !== null}
      onClick={onPick}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-[11px] border px-3.5 text-left text-[14.5px] font-bold transition-colors',
        on ? 'fc-picked border-transparent' : 'border-line text-text-2 hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-5 shrink-0 rounded-full border-2',
          on ? 'border-[6px] border-current' : 'border-line-strong',
        )}
      />
      <span className="flex-1">{label}</span>
    </button>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <span id="plays-in-all" className="text-[14px] font-semibold text-text-2">
        Plays in
      </span>
      <div role="radiogroup" aria-labelledby="plays-in-all" className="grid grid-cols-2 gap-2">
        {option(!choosing, 'Every scene', () => {
          setChoosing(false)
          setPicked([])
        })}
        {option(choosing, 'Some scenes', () => setChoosing(true))}
      </div>
      {choosing && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {all.map((n) => {
              const on = picked.includes(n)
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  title={n}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== n) : [...p, n]))}
                  className={cx(
                    'flex min-h-9 min-w-0 items-center gap-2 rounded-[10px] border px-2.5 text-left text-[13.5px] transition-colors',
                    on
                      ? 'fc-picked border-transparent font-extrabold'
                      : 'border-line font-semibold text-text-2 hover:bg-surface-2',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2',
                      on ? 'border-current' : 'border-line-strong',
                    )}
                  >
                    {on && <Check size={11} weight="bold" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{n}</span>
                </button>
              )
            })}
          </div>
          <Button
            variant="primary"
            className="self-start"
            disabled={picked.length === 0}
            busy={busy === 'in:some'}
            onClick={() => void move()}
          >
            Play only in {picked.length === 1 ? picked[0] : `${picked.length} scenes`}
          </Button>
        </>
      )}
    </div>
  )
}

/** The scenes a sound (or any source) is in: every scene, or some, picked from tiles grouped
 * as the scenes are named. On adds it to a scene, off takes it out. */
function PlaysIn({ name }: { name: string }) {
  const { api, pictureScenes, pictureCurrent, refresh } = useDesk()
  const { run, busy } = useAction()
  const uses = useResource(() => api.sources(), [api])
  const mine = uses.data?.find((u) => u.name === name)?.scenes ?? []
  // The edited picture's scenes only: a vertical source plays in vertical scenes.
  const all = pictureScenes.map((s) => s.name)
  const current = pictureCurrent
  const everywhere = all.length > 0 && all.every((n) => mine.includes(n))
  // "Some scenes" shows the tiles; picking it from "Every scene" changes nothing until a tile.
  const [choosing, setChoosing] = useState(false)
  const showTiles = !everywhere || choosing
  const toggle = async (scene: string, on: boolean) => {
    const ok = await run(`in:${scene}`, async () => {
      if (on) return done(api.addExisting(scene, name))
      if (mine.length <= 1)
        throw new Error('A source stays in at least one scene. Remove it instead.')
      const items = await api.items(scene)
      const it = items.flatMap((i) => [i, ...i.children]).find((i) => i.name === name)
      return it ? done(api.editItem(scene, it.id, 'remove')) : true
    })
    if (ok) {
      uses.reload()
      refresh()
    }
  }
  const addEverywhere = async () => {
    const ok = await run('in:all', async () => {
      for (const s of all) if (!mine.includes(s)) await api.addExisting(s, name)
      return true
    })
    if (ok) {
      setChoosing(false)
      uses.reload()
      refresh()
    }
  }
  const off = busy !== null || !uses.data
  const option = (on: boolean, label: string, onPick: () => void, extra?: React.ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={off}
      onClick={onPick}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-[11px] border px-3.5 text-left text-[14.5px] font-bold transition-colors',
        on
          ? 'border-[var(--fc-accent)] bg-[color-mix(in_srgb,var(--fc-accent)_9%,transparent)] text-text'
          : 'border-line text-text-2 hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-5 shrink-0 rounded-full border-2',
          on ? 'border-[6px] border-[var(--fc-accent)]' : 'border-line-strong',
        )}
      />
      <span className="flex-1">{label}</span>
      {extra}
    </button>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <span id="plays-in" className="text-[14px] font-semibold text-text-2">
        Plays in
      </span>
      <div role="radiogroup" aria-labelledby="plays-in" className="grid grid-cols-2 gap-2">
        {option(everywhere && !choosing, 'Every scene', () => void addEverywhere())}
        {option(
          showTiles,
          'Some scenes',
          () => setChoosing(true),
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12.5px] font-bold text-ok">
            {mine.length} picked
          </span>,
        )}
      </div>
      {showTiles &&
        groupScenes(all).map((g) => (
          <section
            key={g.title}
            aria-label={g.title}
            className="overflow-hidden rounded-[11px] border border-line"
          >
            <h3 className="m-0 flex items-center bg-surface-2 px-3.5 py-2 text-[14px] font-extrabold text-text">
              {g.title}
              <span className="ml-auto text-[12.5px] font-bold text-text-3">{g.scenes.length}</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 p-2.5">
              {g.scenes.map((s) => {
                const on = mine.includes(s.name)
                return (
                  <button
                    key={s.name}
                    type="button"
                    aria-pressed={on}
                    title={s.name}
                    disabled={off}
                    onClick={() => void toggle(s.name, !on)}
                    className={cx(
                      'flex min-h-9 min-w-0 items-center gap-2 rounded-[10px] border px-2.5 text-left text-[13.5px] transition-colors',
                      on
                        ? 'border-[var(--fc-accent)] bg-[color-mix(in_srgb,var(--fc-accent)_9%,transparent)] font-extrabold text-text'
                        : 'border-line font-semibold text-text-2 hover:bg-surface-2',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2',
                        on
                          ? 'border-[var(--fc-btn-primary)] bg-[var(--fc-btn-primary)] text-white'
                          : 'border-line-strong',
                      )}
                    >
                      {on && <Check size={11} weight="bold" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.name === current && (
                      <span
                        aria-label="on air"
                        className="size-[7px] shrink-0 rounded-full bg-danger-fill"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
    </div>
  )
}

/** Filters, in the order they run: each can be switched off, opened, moved or removed. */
function Filters({ name, audio }: { name: string; audio: boolean }) {
  const { api, kinds } = useDesk()
  const { run, busy } = useAction()
  const list = useResource(() => api.filters(name), [api, name])
  const [open, setOpen] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  // An open filter's settings, or the list of filters to add, fold away on a click anywhere
  // else (a menu or list it opened doesn't count).
  const openCard = useRef<HTMLDivElement>(null)
  const pickList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open === null && !picking) return
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.closest('[data-fc-menu], [role="listbox"], [role="menu"]')) return
      if (open !== null && !openCard.current?.contains(t)) setOpen(null)
      if (picking && !pickList.current?.contains(t)) setPicking(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open, picking])
  // A filter's trash asks once more (its settings go with it).
  const [sure, setSure] = useState<string | null>(null)
  const have = new Set(kinds.data?.filters.map((k) => k.id))
  const curated = FILTERS.filter((f) => !!f.audio === audio)
    .map((f) => ({ ...f, kind: f.kinds.find((k) => have.has(k)) }))
    .filter((f): f is typeof f & { kind: string } => !!f.kind)
  const curatedKinds = new Set(FILTERS.flatMap((f) => f.kinds))
  const more = (kinds.data?.filters ?? []).filter((k) => !curatedKinds.has(k.id))
  const taken = new Set(list.data?.map((f) => f.name))
  const act = async (key: string, f: () => Promise<unknown>) => {
    const ok = await run(key, () => done(f()))
    if (ok) list.reload()
    return ok
  }
  const add = async (kind: string, label: string) => {
    let n = label
    for (let i = 2; taken.has(n); i++) n = `${label} ${i}`
    const ok = await act('add', () => api.addFilter(name, { kind, name: n }))
    if (ok) {
      setPicking(false)
      setOpen(n)
    }
  }
  return (
    <section aria-label="Filters" className="flex flex-col gap-2">
      {/* The label and its add button share a row (owner, 28 Oct). */}
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="m-0 flex items-center gap-1 font-display text-[14px] font-extrabold text-text-2">
          {audio ? 'Clean up' : 'Filters'}
          <InfoTip label="About filters">They run in order, top to bottom.</InfoTip>
        </h3>
        {!picking && (
          <Button
            size="sm"
            variant="ghost"
            className="-mr-2 text-accent-text!"
            onClick={() => setPicking(true)}
          >
            <Plus size={14} weight="bold" /> Add a filter
          </Button>
        )}
      </div>
      {list.error && !list.data ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-16" />
      ) : (
        list.data.map((f, i) => (
          <div
            key={f.name}
            ref={open === f.name ? openCard : undefined}
            className={cx(
              'rounded-control border border-line bg-surface-2',
              !f.enabled && 'opacity-70',
            )}
          >
            <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-3">
              <button
                type="button"
                aria-expanded={open === f.name}
                onClick={() => setOpen(open === f.name ? null : f.name)}
                className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold"
              >
                {f.name}
                {FILTER_LABEL[f.kind] && FILTER_LABEL[f.kind] !== f.name && (
                  <span className="ml-1.5 font-normal text-text-3">{FILTER_LABEL[f.kind]}</span>
                )}
              </button>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Move ${f.name} up`}
                disabled={i === 0 || busy !== null}
                onClick={() => void act('up', () => api.editFilter(name, f.name, 'up'))}
              >
                <CaretUp size={14} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Move ${f.name} down`}
                disabled={i === (list.data?.length ?? 0) - 1 || busy !== null}
                onClick={() => void act('down', () => api.editFilter(name, f.name, 'down'))}
              >
                <CaretDown size={14} />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                className={cx(
                  'hover:bg-danger-soft hover:text-danger',
                  sure === f.name && 'bg-danger-soft text-danger',
                )}
                label={sure === f.name ? `Sure? Remove ${f.name}` : `Remove ${f.name}`}
                disabled={busy !== null}
                onBlur={() => setSure(null)}
                onClick={() =>
                  sure === f.name
                    ? void act('rm', () => api.removeFilter(name, f.name))
                    : setSure(f.name)
                }
              >
                <Trash size={14} weight={sure === f.name ? 'fill' : 'regular'} />
              </IconButton>
              <Switch
                label={`${f.name} on`}
                hideLabel
                checked={f.enabled}
                onChange={(on) =>
                  void act('on', () => api.editFilter(name, f.name, on ? 'enable' : 'disable'))
                }
              />
            </div>
            {open === f.name && (
              <div className="border-t border-line p-3">
                <FilterSettings source={name} filter={f.name} />
              </div>
            )}
          </div>
        ))
      )}
      {picking ? (
        <div
          ref={pickList}
          className="flex flex-col gap-1 rounded-control border border-line p-1.5"
          role="group"
          aria-label="Add a filter"
        >
          {curated.map((f) => (
            <button
              key={f.kind}
              type="button"
              disabled={busy !== null}
              onClick={() => void add(f.kind, f.label)}
              className="flex flex-col items-start rounded-[8px] px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <span className="text-[14.5px] font-semibold">{f.label}</span>
              <span className="text-[13.5px] text-text-3">{f.help}</span>
            </button>
          ))}
          {more.length > 0 && (
            <details className="rounded-[8px] px-2.5 py-1.5">
              <summary className="cursor-pointer text-[14px] font-semibold text-accent-text">
                More filters
              </summary>
              <div className="mt-1 flex flex-col">
                {more.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void add(k.id, k.name || k.id)}
                    className="rounded-[8px] px-2 py-1.5 text-left text-[14px] hover:bg-surface-2"
                  >
                    {k.name || k.id}
                  </button>
                ))}
              </div>
            </details>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setPicking(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function FilterSettings({ source, filter }: { source: string; filter: string }) {
  const { api } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.filterOptions(source, filter), api.filterSettings(source, filter)]),
    [api, source, filter],
  )
  const [edits, set] = useApplied((e) => api.updateFilter(source, filter, e), loaded.reload)
  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-20" />
  return (
    <OptionsForm opts={loaded.data[0]} values={{ ...loaded.data[1], ...edits }} onChange={set} />
  )
}

/** Every setting OBS has for the source, applied as it changes. */
function Settings({ name }: { name: string }) {
  const { api } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.sourceOptions(name), api.settings(name)]),
    [api, name],
  )
  const [edits, set] = useApplied((e) => api.update(name, e), loaded.reload)
  return (
    <section aria-label="All settings" className="flex flex-col gap-2">
      <h3 className="m-0 font-display text-[14px] font-extrabold text-text-2">Settings</h3>
      {loaded.error && !loaded.data ? (
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      ) : !loaded.data ? (
        <Skeleton className="h-32" />
      ) : (
        <OptionsForm
          opts={loaded.data[0]}
          values={{ ...loaded.data[1], ...edits }}
          onChange={set}
        />
      )}
    </section>
  )
}
