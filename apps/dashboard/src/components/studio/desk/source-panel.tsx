// A source's panel, beside the preview (it stays visible where the panel doesn't cover it):
// rename it; for a sound, its level, "hear it" and the scenes it plays in; its filters in
// plain words; and every setting OBS has for it, applied as you change them.

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  CaretRight,
  Check,
  CursorClick,
  DotsSixVertical,
  DotsThree,
  Eye,
  EyeSlash,
  Funnel,
  MagicWand,
  Monitor,
  Plus,
  Sparkle,
  SpeakerHigh,
  SquaresFour,
  Trash,
  Waveform,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  type EngineAudio,
  type EngineFilter,
  type EngineFollow,
  type EngineLevel,
  type EngineAudioChange,
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
import { done, useAction, useResource, type Resource } from '../../../lib/hooks'
import { VstForm } from './vst-form'
import {
  FILTERS,
  FILTER_OF,
  KindTile,
  NO_FORM,
  SOUND_ONLY,
  filterTone,
  useDesk,
  type DrawerTab,
} from './common'
import {
  DUCK_FILTER,
  VERDICT_WORDS,
  VOICE_FILTER,
  VOICE_STYLES,
  cleanMicPlan,
  duckFilter,
  duckMic,
  freeName,
  voiceStyleOf,
  voiceVerdict,
  type VoiceStyle,
} from './cleanmic'
import { Meter, useLevels } from './mixer'
import { RowLook } from './options'
import { Band, Pad, PositionTab, Prop, SoundRows } from './drawer-kit'
import { KindSettings } from './kind-settings'
import { CaptureForm, FilterForm, hasMore } from './filter-forms'
import { readDefaults } from './kind-cache'

/** Sends edits once they've stopped changing for a moment. `fresh` is the settings as last
 *  read: an edit that went through is shown until they're read again, so the old value never
 *  flashes back between the two (owner, 11 Nov: Screen → Window went back, then forward). */
function useApplied(
  apply: (edits: EngineSettings) => Promise<unknown>,
  after: () => void,
  fresh: unknown,
) {
  const [edits, setEdits] = useState<EngineSettings>({})
  // Sent and taken, until the settings are read again.
  const [taken, setTaken] = useState<EngineSettings>({})
  useEffect(() => setTaken({}), [fresh])
  const applyRef = useRef(apply)
  applyRef.current = apply
  const afterRef = useRef(after)
  afterRef.current = after
  // What's waiting to be sent: sent at once if the drawer closes first (a click outside it
  // right after a change), so a change is never lost (CodeRabbit).
  const waiting = useRef<EngineSettings>({})
  waiting.current = edits
  useEffect(
    () => () => {
      const left = waiting.current
      if (Object.keys(left).length === 0) return
      void applyRef.current(left).catch((err: unknown) => {
        const d = describeError(err)
        toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
      })
    },
    [],
  )
  useEffect(() => {
    if (Object.keys(edits).length === 0) return
    const t = setTimeout(() => {
      const sent = edits
      void applyRef
        .current(sent)
        .then(() => setTaken((t) => ({ ...t, ...sent })))
        .catch((err: unknown) => {
          // Not applied: say why, and show the engine's own values again.
          const d = describeError(err)
          toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
        })
        .finally(() => {
          if (waiting.current === sent) waiting.current = {}
          setEdits((e) => (e === sent ? {} : e))
          afterRef.current()
        })
    }, 350)
    return () => clearTimeout(t)
  }, [edits])
  return [
    { ...taken, ...edits },
    (k: string, v: unknown) => setEdits((p) => ({ ...p, [k]: v })),
  ] as const
}

export function SourcePanel() {
  const { editing, edit, editTab } = useDesk()
  if (!editing) return null
  return (
    <Panel
      key={`${editing}\n${editTab ?? ''}`}
      name={editing}
      first={editTab}
      onClose={() => edit(null)}
    />
  )
}

type Tab = DrawerTab

function Panel({
  name,
  first,
  onClose,
}: {
  name: string
  /** The tab to open on (null: Sound for a sound, else Settings). */
  first: Tab | null
  onClose: () => void
}) {
  const { api, audio, items, scene, refresh, edit, kinds, canvas } = useDesk()
  const { run, busy } = useAction()
  const [rename, setRename] = useState(name)
  // Removing asks once more: the button turns into "Sure? Remove".
  const [sure, setSure] = useState(false)
  const a = audio.data?.find((x) => x.name === name) ?? null
  const item = items.data?.flatMap((i) => [i, ...i.children]).find((i) => i.name === name) ?? null
  const kind = a?.kind ?? item?.kind ?? ''
  const levels = useLevels(api, a ? [name] : [])
  const [tab, setTab] = useState<Tab | null>(first)
  const filters = useResource(() => api.filters(name), [api, name])
  const panel = useRef<HTMLElement>(null)
  // A click anywhere outside closes it (owner, 28 Oct): what's in it is applied as it's
  // changed, so nothing is lost. Not for what it opened over the page (a list, a menu, a
  // dialog, a toast or an info bubble), nor a pick in the Sources list, which opens another.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || !t.isConnected || panel.current?.contains(t)) return
      if (
        t.closest(
          '[data-over-preview], [data-fc-menu], [role="listbox"], [role="menu"], [role="option"], dialog',
        )
      )
        return
      onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An Escape something inside took first (closing the colour picker) isn't for the panel.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
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
      // Opened again under its new name, on the same tab (CodeRabbit).
      edit(to, shown)
    } else setRename(name)
  }
  const setAudio = (patch: EngineAudioChange) => {
    audio.set((list) => (list ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    void run('audio', () => api.setAudio(name, patch))
  }

  // Four tabs (owner's pick, design A, 10 Nov): Filters, Settings, then Position for a picture
  // in this scene and Sound for anything with sound. A sound opens on Sound, anything else on
  // Settings; "Filters" from a menu opens Filters.
  const picture = !SOUND_ONLY.has(kind)
  const tabs: { id: Tab; label: string; count?: number }[] = [
    {
      id: 'filters',
      label: 'Filters',
      ...(filters.data?.length ? { count: filters.data.length } : {}),
    },
    { id: 'settings', label: 'Settings' },
    ...(item && picture ? [{ id: 'position' as const, label: 'Position' }] : []),
    ...(a ? [{ id: 'sound' as const, label: 'Sound' }] : []),
  ]
  const wanted: Tab = tab ?? (a && !picture ? 'sound' : 'settings')
  const shown: Tab = tabs.some((t) => t.id === wanted) ? wanted : 'settings'
  const kindName = kinds.data?.inputs.find((k) => k.id === kind)?.name
  const panelId = `source-tab-${shown}`

  return (
    <aside
      ref={panel}
      data-over-preview
      aria-label={`${name} settings`}
      className="fixed top-0 right-0 bottom-[var(--fc-statusbar,0px)] z-40 flex w-full max-w-[420px] flex-col border-l border-line-strong bg-surface-1 shadow-pop"
    >
      <header className="flex items-center gap-2.5 py-2.5 pr-2 pl-3">
        <KindTile kind={kind} size={28} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Input
            aria-label="Name"
            className="-ml-1.5 h-7! min-w-0 rounded-[5px]! border-transparent! bg-transparent! px-1.5! font-display text-[14.5px]! font-bold hover:border-line-strong!"
            maxLength={100}
            value={rename}
            onChange={(e) => setRename(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <span className="truncate text-[11.5px] text-text-3">
            {[kindName, a?.channel ? 'Every scene' : item ? scene : null]
              .filter(Boolean)
              .join(' · ') || '\u00a0'}
          </span>
        </div>
        {item && (
          <IconButton
            size="xs"
            variant="ghost"
            label={item.visible ? `Hide ${name}` : `Show ${name}`}
            disabled={busy !== null}
            className={cx(!item.visible && 'text-text-3')}
            onClick={() =>
              void run('eye', () =>
                done(api.editItem(scene, item.id, item.visible ? 'hide' : 'show')),
              ).then((ok) => ok && refresh())
            }
          >
            {item.visible ? <Eye size={15} /> : <EyeSlash size={15} />}
          </IconButton>
        )}
        <IconButton size="xs" label="Close" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </header>
      <div
        role="tablist"
        aria-label={`${name} settings`}
        className="flex h-[34px] flex-none gap-0.5 border-y border-line-strong bg-dock-head px-1.5"
        onKeyDown={(e) => {
          // Left and right move between the tabs, as tabs do.
          const at = tabs.findIndex((t) => t.id === shown)
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (!step) return
          e.preventDefault()
          const next = tabs[(at + step + tabs.length) % tabs.length]
          if (!next) return
          setTab(next.id)
          e.currentTarget.querySelector<HTMLElement>(`#tab-${next.id}`)?.focus()
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={shown === t.id}
            aria-controls={panelId}
            tabIndex={shown === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 text-[12.5px] font-semibold outline-none focus-visible:shadow-[var(--fc-focus)]',
              shown === t.id
                ? 'border-arc text-text'
                : 'border-transparent text-text-3 hover:text-text',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cx(
                  'rounded-full px-1.5 font-mono text-[10.5px] tabular-nums',
                  shown === t.id ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-text-2',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`tab-${shown}`}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        {shown === 'sound' && a && (
          <RowLook.Provider value="lined">
            <section aria-label="Sound" className="flex flex-col">
              <Band icon={SpeakerHigh} tone="var(--fc-ok)" title="Sound" />
              <Pad>
                <Meter
                  tall
                  scale
                  level={levels[name]}
                  muted={a.muted}
                  volumeDb={a.volume_db}
                  label={`${name} volume`}
                  onVolume={(d) => setAudio({ volume_db: Math.round(d * 10) / 10 })}
                />
              </Pad>
              <SoundRows a={a} onAudio={setAudio} />
              {!MIC_KINDS.has(kind) && <Duck name={name} list={filters} />}
            </section>
            <section aria-label="Plays in" className="flex flex-col">
              <Band icon={SquaresFour} tone="var(--fc-accent-text)" title="Plays in" />
              <Pad>{a.channel ? <EverywhereIn sound={a} /> : <PlaysIn name={name} />}</Pad>
            </section>
            {MIC_KINDS.has(kind) && (
              <section aria-label="Clean up" className="flex flex-col">
                <Band icon={Waveform} tone="var(--fc-ok)" title="Clean up" />
                <Pad className="flex flex-col gap-2.5">
                  <CleanMic name={name} level={levels[name]} list={filters} />
                  <VoiceStyleRow name={name} list={filters} />
                </Pad>
              </section>
            )}
          </RowLook.Provider>
        )}
        {shown === 'filters' && (
          <Filters
            name={name}
            picture={picture}
            sound={!!a}
            list={filters}
            reveal={first === 'filters'}
          />
        )}
        {shown === 'position' && item && <PositionTab scene={scene} item={item} />}
        {shown === 'settings' && (
          <RowLook.Provider value="lined">
            {/* Smart vertical (plan item 8): a picture in a vertical scene can follow a face. */}
            {canvas === 'vertical' && picture && item && (
              <Pad>
                <FollowFace scene={scene} item={item.id} />
              </Pad>
            )}
            <Settings name={name} kind={kind} />
            {kind === 'ferrocast_web' && (
              <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5">
                <Button
                  size="xs"
                  variant="outline"
                  busy={busy === 'reload'}
                  onClick={() => void run('reload', () => done(api.web(name, 'reload')))}
                >
                  <ArrowClockwise size={14} weight="bold" /> Reload
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  busy={busy === 'interact'}
                  onClick={() => void run('interact', () => done(api.web(name, 'interact')))}
                >
                  <CursorClick size={14} weight="bold" /> Click on it
                </Button>
              </div>
            )}
          </RowLook.Provider>
        )}
      </div>
      <footer className="flex h-[46px] flex-none items-center gap-2 border-t border-line pr-2 pl-1.5">
        {item ? (
          <Button
            size="xs"
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
            size="xs"
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
        <Button size="xs" variant="primary" onClick={onClose}>
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
        'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 text-[12px] font-semibold transition-colors outline-none focus-visible:shadow-[var(--fc-focus)]',
        on ? 'fc-picked' : 'text-text-2 hover:bg-surface-3 hover:text-text',
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  )
  return (
    <div className="flex flex-col gap-2">
      <span id="plays-in-all" className="sr-only">
        Plays in
      </span>
      <div
        role="radiogroup"
        aria-labelledby="plays-in-all"
        className="flex h-7 gap-0.5 rounded-[6px] border border-line bg-surface-2 p-0.5"
      >
        {option(!choosing, 'Every scene', () => {
          setChoosing(false)
          setPicked([])
        })}
        {option(choosing, 'Some scenes', () => setChoosing(true))}
      </div>
      {choosing && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
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
                    'flex h-7 min-w-0 items-center gap-1.5 rounded-[5px] border px-2 text-left text-[12px] transition-colors',
                    on
                      ? 'fc-picked border-transparent font-extrabold'
                      : 'border-line font-semibold text-text-2 hover:bg-surface-2',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'grid size-[14px] shrink-0 place-items-center rounded-[3px] border-[1.5px]',
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
            size="xs"
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
        'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 text-[12px] font-semibold transition-colors outline-none focus-visible:shadow-[var(--fc-focus)]',
        on ? 'fc-picked' : 'text-text-2 hover:bg-surface-3 hover:text-text',
      )}
    >
      <span className="truncate">{label}</span>
      {extra}
    </button>
  )
  return (
    <div className="flex flex-col gap-2">
      <span id="plays-in" className="sr-only">
        Plays in
      </span>
      <div
        role="radiogroup"
        aria-labelledby="plays-in"
        className="flex h-7 gap-0.5 rounded-[6px] border border-line bg-surface-2 p-0.5"
      >
        {option(everywhere && !choosing, 'Every scene', () => void addEverywhere())}
        {option(
          showTiles,
          'Some scenes',
          () => setChoosing(true),
          <span className="rounded-full bg-ok-soft px-1.5 font-mono text-[10.5px] font-bold text-ok">
            {mine.length} picked
          </span>,
        )}
      </div>
      {showTiles &&
        groupScenes(all).map((g) => (
          <section
            key={g.title}
            aria-label={g.title}
            className="overflow-hidden rounded-[6px] border border-line"
          >
            <h3 className="m-0 flex items-center bg-surface-2 px-2.5 py-1.5 text-[11px] font-bold tracking-[0.06em] text-text-2 uppercase">
              {g.title}
              <span className="ml-auto font-mono text-[10.5px] text-text-3">{g.scenes.length}</span>
            </h3>
            <div className="grid grid-cols-2 gap-1.5 p-1.5">
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
                      'flex h-7 min-w-0 items-center gap-1.5 rounded-[5px] border px-2 text-left text-[12px] transition-colors',
                      on
                        ? 'border-[var(--fc-accent)] bg-[color-mix(in_srgb,var(--fc-accent)_9%,transparent)] font-extrabold text-text'
                        : 'border-line font-semibold text-text-2 hover:bg-surface-2',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-[14px] shrink-0 place-items-center rounded-[3px] border-[1.5px]',
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

/**
 * Filters, in the order they run: each can be switched off, opened (its settings fold out
 * under it), dragged by its dots (or moved with the arrow keys there) or removed. Under them,
 * "Add a filter" opens a picker right there (owner's pick F1, 29 Oct): a search, picture and
 * sound filters in plain words (the ones it has say "On it" and can be added again), and
 * OBS's others behind "more". A source with a picture gets picture filters, one with sound
 * sound filters, a screen capture both.
 */
function Filters({
  name,
  picture,
  sound,
  list,
  reveal,
}: {
  name: string
  picture: boolean
  sound: boolean
  list: Resource<EngineFilter[]>
  /** Opened from a "Filters" menu item: shown in view. */
  reveal: boolean
}) {
  const { api, kinds } = useDesk()
  const { run, busy } = useAction()
  const [open, setOpen] = useState<string | null>(null)
  // The open filter's extra settings (its header's More), and a count that redraws its form
  // after Reset.
  const [extra, setExtra] = useState(false)
  const [fresh, setFresh] = useState(0)
  const [adding, setAdding] = useState(false)
  const addId = useId()
  const [find, setFind] = useState('')
  const [only, setOnly] = useState<'all' | 'picture' | 'sound'>('all')
  const [more, setMore] = useState(false)
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (reveal) section.current?.scrollIntoView({ block: 'start' })
  }, [reveal])
  const have = new Set(kinds.data?.filters.map((k) => k.id))
  const curated = FILTERS.filter((f) => (f.audio ? sound : picture))
    .map((f) => ({ ...f, kind: f.kinds.find((k) => have.has(k)) }))
    .filter((f): f is typeof f & { kind: string } => !!f.kind)
  const curatedKinds = new Set(FILTERS.flatMap((f) => f.kinds))
  const others = (kinds.data?.filters ?? []).filter((k) => !curatedKinds.has(k.id))
  const filters = list.data ?? []
  const taken = new Set(filters.map((f) => f.name))
  const both = picture && sound
  const added = new Set(filters.map((f) => f.kind))
  const act = async (key: string, f: () => Promise<unknown>) => {
    const ok = await run(key, () => done(f()))
    if (ok) list.reload()
    return ok
  }
  const add = async (kind: string, label: string) => {
    let n = label
    for (let i = 2; taken.has(n); i++) n = `${label} ${i}`
    const start = FILTER_OF[kind]?.settings
    if (
      await act('add', () =>
        api.addFilter(name, { kind, name: n, ...(start ? { settings: start } : {}) }),
      )
    ) {
      setOpen(n)
      setAdding(false)
      setFind('')
    }
  }
  // Removed at once; Undo adds it back with its settings, on or off as it was, in its place.
  // Its settings are read first: without them Undo couldn't bring it back, so it stays.
  const removing = useRef(false)
  const remove = async (f: EngineFilter, at: number) => {
    // A second click while the first is still reading its settings does nothing.
    if (removing.current) return
    removing.current = true
    try {
      await removeNow(f, at)
    } finally {
      removing.current = false
    }
  }
  const removeNow = async (f: EngineFilter, at: number) => {
    const settings = await api.filterSettings(name, f.name).catch(() => null)
    if (!settings) {
      toast({
        tone: 'error',
        message: `${f.name} wasn't removed.`,
        hint: "Its settings couldn't be read, so it couldn't be brought back. Try again.",
      })
      return
    }
    if (!(await act('rm', () => api.removeFilter(name, f.name)))) return
    if (open === f.name) setOpen(null)
    const undo = async () => {
      if (!(await act('undo', () => api.addFilter(name, { kind: f.kind, name: f.name, settings }))))
        return
      try {
        if (!f.enabled) await api.editFilter(name, f.name, 'disable')
        // Added at the bottom: back up to where it was, counted on the list as it is now
        // (others may have changed since).
        const now = await api.filters(name)
        const steps = Math.max(0, now.length - 1 - at)
        for (let k = 0; k < steps; k++) await api.editFilter(name, f.name, 'up')
      } catch {
        toast({
          tone: 'warn',
          message: `${f.name} is back, but not quite as it was.`,
          hint: 'Check its switch, and drag it to its place.',
        })
      } finally {
        list.reload()
      }
    }
    toast({
      tone: 'info',
      key: `filter-removed:${name}`,
      message: `${f.name} removed.`,
      duration: 6000,
      action: { label: 'Undo', run: () => void undo() },
    })
  }
  // Moves a filter `by` places (negative: up), one step at a time as the engine moves them.
  const move = (f: string, by: number) =>
    void act('move', async () => {
      for (let i = 0; i < Math.abs(by); i++) await api.editFilter(name, f, by < 0 ? 'up' : 'down')
    })
  // Dragging by the dots: where it would land, shown as a line.
  const rows = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const landing = (y: number) => {
    const els = [...(rows.current?.querySelectorAll<HTMLElement>('[data-filter-row]') ?? [])]
    const at = els.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    return at < 0 ? els.length : at
  }
  return (
    <section ref={section} aria-label="Filters" className="flex scroll-mt-4 flex-col">
      <div className="flex flex-col">
        <Band
          icon={MagicWand}
          tone="var(--fc-twitch)"
          title={
            <span className="inline-flex items-center gap-1">
              Filters on it
              <InfoTip label="About filters">They run in order, top to bottom.</InfoTip>
            </span>
          }
        >
          <Button
            size="xs"
            variant="secondary"
            className="h-[22px]! px-2! text-[11.5px]! tracking-normal normal-case"
            aria-expanded={adding}
            aria-controls={addId}
            onClick={() => setAdding(!adding)}
          >
            <Plus size={13} weight="bold" /> Add a filter
          </Button>
        </Band>
        {list.error && !list.data ? (
          <div className="p-3">
            <LoadError error={list.error} onRetry={list.reload} />
          </div>
        ) : !list.data ? (
          <Skeleton className="m-3 h-16" />
        ) : filters.length === 0 ? (
          <p className="m-0 border-b border-line px-3 py-2.5 text-[12.5px] text-text-3">
            None yet.
          </p>
        ) : (
          <div ref={rows} className="flex flex-col">
            {filters.map((f, i) => {
              const entry = FILTER_OF[f.kind]
              const FIcon = entry?.icon ?? Funnel
              const lineAbove =
                drag && drag.to === i && drag.to !== drag.from && drag.to !== drag.from + 1
              const lineBelow =
                drag && i === filters.length - 1 && drag.to === filters.length && drag.from !== i
              return (
                <div
                  key={f.name}
                  data-filter-row
                  className={cx(
                    'relative border-b border-line',
                    !f.enabled && 'opacity-60',
                    drag?.from === i && 'bg-accent-soft',
                    open === f.name && 'bg-accent-soft shadow-[inset_2px_0_0_var(--fc-arc)]',
                  )}
                >
                  {lineAbove && (
                    <span
                      aria-hidden
                      className="absolute inset-x-1 -top-[2px] z-10 h-[3px] rounded-full bg-accent-text"
                    />
                  )}
                  {lineBelow && (
                    <span
                      aria-hidden
                      className="absolute inset-x-1 -bottom-[2px] z-10 h-[3px] rounded-full bg-accent-text"
                    />
                  )}
                  <div className="flex h-10 items-center gap-2 pr-2 pl-1">
                    <button
                      type="button"
                      aria-label={`Move ${f.name}: drag, or press the up and down arrows`}
                      // Not disabled while a move is sent: that would drop the keyboard's
                      // place on it after each step (CodeRabbit).
                      aria-disabled={busy !== null || undefined}
                      className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-[5px] text-text-3 outline-none hover:text-text focus-visible:shadow-[var(--fc-focus)] active:cursor-grabbing"
                      onKeyDown={(e) => {
                        const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
                        if (!by || i + by < 0 || i + by >= filters.length) return
                        e.preventDefault()
                        if (busy === null) move(f.name, by)
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || busy !== null) return
                        e.currentTarget.setPointerCapture(e.pointerId)
                        setDrag({ from: i, to: i })
                      }}
                      onPointerMove={(e) => {
                        if (drag?.from === i) setDrag({ from: i, to: landing(e.clientY) })
                      }}
                      onPointerUp={(e) => {
                        if (e.currentTarget.hasPointerCapture(e.pointerId))
                          e.currentTarget.releasePointerCapture(e.pointerId)
                        const d = drag
                        setDrag(null)
                        if (!d) return
                        // Landing below itself counts the gap it leaves.
                        const by = d.to > d.from ? d.to - d.from - 1 : d.to - d.from
                        if (by) move(f.name, by)
                      }}
                      onPointerCancel={() => setDrag(null)}
                    >
                      <DotsSixVertical size={14} weight="bold" />
                    </button>
                    <span
                      aria-hidden
                      className="grid size-5 shrink-0 place-items-center rounded-[5px]"
                      style={{
                        color: filterTone(entry),
                        background: `color-mix(in oklab, ${filterTone(entry)} 15%, transparent)`,
                      }}
                    >
                      <FIcon size={12} weight="bold" />
                    </span>
                    <button
                      type="button"
                      aria-expanded={NO_FORM.has(f.kind) ? undefined : open === f.name}
                      onClick={() => {
                        setOpen(open === f.name || NO_FORM.has(f.kind) ? null : f.name)
                        setExtra(false)
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="w-full truncate text-[13px] leading-tight font-semibold">
                        {f.name}
                      </span>
                      <span className="w-full truncate text-[11px] leading-tight text-text-3">
                        {entry && entry.label !== f.name
                          ? entry.label
                          : (entry?.help ??
                            // Not one of ours: the engine's name for it ("Color Key"), never
                            // its id.
                            kinds.data?.filters.find((k) => k.id === f.kind)?.name ??
                            'Filter')}
                      </span>
                    </button>
                    {open === f.name && !NO_FORM.has(f.kind) && (
                      <IconButton
                        size="xs"
                        variant="ghost"
                        label={`Reset ${f.name}`}
                        disabled={busy !== null}
                        onClick={() =>
                          void act('reset', async () => {
                            const d = await readDefaults(api, f.kind)
                            await api.updateFilter(name, f.name, d)
                            setFresh((n) => n + 1)
                          })
                        }
                      >
                        <ArrowCounterClockwise size={15} />
                      </IconButton>
                    )}
                    {open === f.name && hasMore(f.kind) && (
                      <IconButton
                        size="xs"
                        variant="ghost"
                        label={
                          extra ? `Fewer settings for ${f.name}` : `More settings for ${f.name}`
                        }
                        aria-expanded={extra}
                        className={cx(extra && 'bg-surface-3 text-text')}
                        onClick={() => setExtra(!extra)}
                      >
                        <DotsThree size={17} weight="bold" />
                      </IconButton>
                    )}
                    {/* The bin removes it at once; the toast's Undo puts it back as it was
                        (owner, 10 Nov: no red "Remove" button to click again). */}
                    <IconButton
                      size="xs"
                      variant="ghost"
                      label={`Remove ${f.name}`}
                      disabled={busy !== null}
                      className="text-text-3 hover:bg-danger-soft hover:text-danger"
                      onClick={() => void remove(f, i)}
                    >
                      <Trash size={14} aria-hidden />
                    </IconButton>
                    <Switch
                      label={`${f.name} on`}
                      hideLabel
                      checked={f.enabled}
                      onChange={(on) =>
                        void act('on', () =>
                          api.editFilter(name, f.name, on ? 'enable' : 'disable'),
                        )
                      }
                    />
                  </div>
                  {open === f.name && !NO_FORM.has(f.kind) && (
                    <div className="fc-inset border-t border-line bg-surface-2 py-0.5 pr-2.5 pl-9">
                      <RowLook.Provider value="inset">
                        <FilterSettings
                          key={fresh}
                          source={name}
                          filter={f.name}
                          kind={f.kind}
                          more={extra}
                        />
                      </RowLook.Provider>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <AddFilter
        id={addId}
        open={adding}
        find={find}
        onFind={setFind}
        only={both ? only : 'all'}
        onOnly={both ? setOnly : null}
        more={more}
        onMore={setMore}
        busy={busy !== null}
        curated={curated.map((f) => ({ ...f, on: f.kinds.some((k) => added.has(k)) }))}
        others={others.map((k) => ({ kind: k.id, label: k.name || k.id, on: added.has(k.id) }))}
        onAdd={(kind, label) => void add(kind, label)}
      />
    </section>
  )
}

interface FilterPick {
  kind: string
  label: string
  on: boolean
  help?: string
  icon?: (typeof FILTERS)[number]['icon']
  audio?: boolean
}

/** "Add a filter" and the picker it opens under itself. */
function AddFilter({
  id,
  open,
  find,
  onFind,
  only,
  onOnly,
  more,
  onMore,
  busy,
  curated,
  others,
  onAdd,
}: {
  /** The panel's id: the band's "Add a filter" button opens it. */
  id: string
  open: boolean
  find: string
  onFind: (q: string) => void
  only: 'all' | 'picture' | 'sound'
  /** Null when the source has only a picture or only sound. */
  onOnly: ((v: 'all' | 'picture' | 'sound') => void) | null
  more: boolean
  onMore: (open: boolean) => void
  busy: boolean
  curated: FilterPick[]
  others: FilterPick[]
  onAdd: (kind: string, label: string) => void
}) {
  const q = find.trim().toLowerCase()
  const match = (p: FilterPick) => !q || `${p.label} ${p.help ?? ''}`.toLowerCase().includes(q)
  const pics = only === 'sound' ? [] : curated.filter((p) => !p.audio && match(p))
  const sounds = only === 'picture' ? [] : curated.filter((p) => p.audio && match(p))
  const rest = others.filter(match)
  // One line each (owner's pick, design A, 10 Nov): its coloured icon, name, a short word on
  // what it does, then + (or "On it").
  const row = (p: FilterPick) => {
    const Icon = p.icon ?? Funnel
    const tone = p.audio ? 'var(--fc-ok)' : filterTone(FILTER_OF[p.kind])
    return (
      <button
        key={p.kind}
        type="button"
        disabled={busy}
        aria-label={`Add ${p.label}${p.on ? ' (it has one already)' : ''}`}
        title={p.help}
        onClick={() => onAdd(p.kind, p.label)}
        className="group flex h-[34px] min-w-0 items-center gap-2.5 border-b border-line pr-2.5 pl-3 text-left outline-none hover:bg-surface-2 focus-visible:shadow-[inset_0_0_0_2px_var(--fc-accent-text)] disabled:opacity-50"
      >
        <span
          aria-hidden
          className="grid size-5 shrink-0 place-items-center rounded-[5px]"
          style={{ color: tone, background: `color-mix(in oklab, ${tone} 15%, transparent)` }}
        >
          <Icon size={12} weight="bold" />
        </span>
        <span className="shrink-0 truncate text-[12.5px] font-semibold">{p.label}</span>
        {p.help && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-text-3">{p.help}</span>
        )}
        {!p.help && <span className="flex-1" />}
        {p.on ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-ok">
            <Check size={12} weight="bold" aria-hidden /> On it
          </span>
        ) : (
          <Plus
            size={15}
            weight="bold"
            aria-hidden
            className="shrink-0 text-accent-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </button>
    )
  }
  const group = (title: string, picks: FilterPick[]) =>
    picks.length > 0 && (
      <div className="flex flex-col">
        <h4 className="m-0 flex h-[26px] items-center border-b border-line bg-surface-2 px-3 text-[10.5px] font-bold tracking-[0.07em] text-text-3 uppercase">
          {title}
        </h4>
        {picks.map(row)}
      </div>
    )
  return (
    <div className="flex flex-col">
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Add a filter"
          className="flex flex-col border-b border-line-strong"
        >
          <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
            <Input
              aria-label="Find a filter"
              data-keep-placeholder
              placeholder="Find a filter"
              className="h-[30px]! rounded-[6px]! px-2.5! text-[12.5px]!"
              value={find}
              autoFocus
              onChange={(e) => onFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && find) {
                  // Clears the search first; the next Escape closes the drawer.
                  e.stopPropagation()
                  onFind('')
                }
              }}
            />
            {onOnly && (
              <Segmented
                label="Show"
                size="sm"
                value={only}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'picture', label: 'Picture' },
                  { value: 'sound', label: 'Sound' },
                ]}
                onChange={onOnly}
              />
            )}
          </div>
          {group('Picture', pics)}
          {group('Sound', sounds)}
          {rest.length > 0 && (
            <div className="flex flex-col">
              <button
                type="button"
                aria-expanded={more || !!q}
                onClick={() => onMore(!more)}
                className="flex h-[34px] items-center gap-2 border-b border-line px-3 text-left text-[12.5px] font-semibold text-text-2 outline-none hover:text-text focus-visible:shadow-[inset_0_0_0_2px_var(--fc-accent-text)]"
              >
                {more || q ? (
                  <CaretDown size={14} weight="bold" />
                ) : (
                  <CaretRight size={14} weight="bold" />
                )}
                {rest.length} more (OBS's own)
              </button>
              {(more || !!q) && rest.map(row)}
            </div>
          )}
          {pics.length + sounds.length + rest.length === 0 && (
            <p className="m-0 px-3 py-2.5 text-[12.5px] text-text-3">No filter called that.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Microphones: the kinds "Clean up my mic" is offered for. */
const MIC_KINDS = new Set([
  'coreaudio_input_capture',
  'wasapi_input_capture',
  'pulse_input_capture',
  'alsa_input_capture',
])

/**
 * One click to clean a mic (plan item 5): the filters it's missing, added in the order they
 * work best, and a word on the level while talking (the last 10 s of the meter).
 */
/** "Follow my face" for an item of a vertical scene: hidden where the app can't do it. */
function FollowFace({ scene, item }: { scene: string; item: number }) {
  const { api } = useDesk()
  const { run, busy } = useAction()
  const [st, setSt] = useState<EngineFollow | null>(null)
  const mine = !!st?.on && st.scene === scene && st.item === item
  useEffect(() => {
    let live = true
    const read = () =>
      api.follow().then(
        (v) => live && setSt(v),
        () => live && setSt(null),
      )
    void read()
    // While this item follows, how the looking goes ("Looking for a face…").
    const t = mine ? window.setInterval(() => !document.hidden && void read(), 2000) : 0
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [api, mine])
  if (!st) return null
  const now = mine ? (st.what ?? 'face') : 'off'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        Follow
        <InfoTip label="About following">
          In the vertical picture, this slides sideways to keep your face (or the action in a game)
          in the middle. Worked out on this computer.
        </InfoTip>
        {mine && (
          <span className="font-normal text-text-3">
            {(st.found ?? st.face)
              ? '· following'
              : st.what === 'action'
                ? '· looking…'
                : '· looking for a face…'}
          </span>
        )}
      </span>
      <Segmented
        label="Follow"
        value={now}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'face', label: 'My face' },
          { value: 'action', label: 'The action' },
        ]}
        onChange={async (to) => {
          if (busy === 'follow' || to === now) return
          const v = await run('follow', () =>
            api.setFollow(to === 'off' ? null : { scene, item, what: to }),
          )
          if (v) setSt(v)
        }}
      />
    </div>
  )
}

function CleanMic({
  name,
  level,
  list,
}: {
  name: string
  level: EngineLevel | undefined
  list: Resource<EngineFilter[]>
}) {
  const { api } = useDesk()
  const { run, busy } = useAction()
  const peaks = useRef<number[]>([])
  useEffect(() => {
    if (!level) return
    peaks.current.push(Math.max(level.peak[0], level.peak[1]))
    if (peaks.current.length > 100) peaks.current.shift()
  }, [level])
  const verdict = voiceVerdict(peaks.current)
  const have = list.data ?? null
  const plan = have ? cleanMicPlan(have.map((f) => f.kind)) : []
  const clean = async () => {
    const taken = (have ?? []).map((f) => f.name)
    const ok = await run('clean', async () => {
      // One at a time, in order: each goes after the last (the chain's order matters).
      for (const f of plan) {
        const n = freeName(f.name, taken)
        taken.push(n)
        await api.addFilter(name, { ...f, name: n })
      }
      return true
    })
    list.reload()
    if (ok)
      toast({ tone: 'ok', message: 'Your mic is cleaned up: noise out, level even, no clipping.' })
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <span
        className={cx(
          'text-[13.5px] font-semibold',
          verdict === 'good' ? 'text-ok' : verdict ? 'text-warn' : 'text-text-3',
        )}
        aria-live="polite"
      >
        {verdict ? VERDICT_WORDS[verdict] : 'Talk for a few seconds to check your level.'}
      </span>
      {!have ? null : plan.length > 0 ? (
        <Button size="sm" variant="secondary" busy={busy === 'clean'} onClick={() => void clean()}>
          <Sparkle size={15} weight="bold" /> Clean up my mic
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-3">
          <Check size={14} weight="bold" /> Mic cleaned up
        </span>
      )}
    </div>
  )
}

/** A mic's voice style: one equaliser set three ways (Natural takes it off). */
function VoiceStyleRow({ name, list }: { name: string; list: Resource<EngineFilter[]> }) {
  const { api } = useDesk()
  const { run, busy } = useAction()
  const filter = list.data?.find((f) => f.name === VOICE_FILTER)
  const has = !!filter
  const eq = useResource(
    () => (has ? api.filterSettings(name, VOICE_FILTER) : Promise.resolve(null)),
    [api, name, has],
  )
  // Switched off in Filters, it's as if natural.
  const style = filter?.enabled
    ? voiceStyleOf(eq.data as { low?: number; mid?: number; high?: number } | null)
    : 'natural'
  const choose = async (to: VoiceStyle) => {
    if (busy === 'voice') return
    // Natural takes the filter off even when it was tuned by hand (it reads as natural then).
    if (to === style && !(to === 'natural' && has)) return
    await run('voice', async () => {
      if (to === 'natural') return done(api.removeFilter(name, VOICE_FILTER))
      if (!has)
        return done(
          api.addFilter(name, {
            kind: 'basic_eq_filter',
            name: VOICE_FILTER,
            settings: VOICE_STYLES[to],
          }),
        )
      await api.updateFilter(name, VOICE_FILTER, VOICE_STYLES[to])
      return done(filter.enabled ? Promise.resolve() : api.editFilter(name, VOICE_FILTER, 'enable'))
    })
    list.reload()
    eq.reload()
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        Voice
        <InfoTip label="About voice">
          Warm radio: fuller and warmer. Clear podcast: less boom, clearer words. Natural: as the
          mic hears it.
        </InfoTip>
      </span>
      <Segmented
        label="Voice"
        value={style}
        options={[
          { value: 'natural', label: 'Natural' },
          { value: 'radio', label: 'Warm radio' },
          { value: 'podcast', label: 'Clear podcast' },
        ]}
        onChange={(to) => void choose(to)}
      />
    </div>
  )
}

/** Music or a game that drops while you talk: OBS's compressor keyed to the mic. */
function Duck({ name, list }: { name: string; list: Resource<EngineFilter[]> }) {
  const { api, audio } = useDesk()
  const { run, busy } = useAction()
  const mic = duckMic(audio.data ?? [], name, MIC_KINDS)
  const filter = list.data?.find((f) => f.name === DUCK_FILTER)
  // Switched off in Filters, it's off here too; on again turns that one back on.
  const on = !!filter?.enabled
  if (!list.data || (!mic && !filter)) return null
  const toggle = async (to: boolean) => {
    if (busy === 'duck') return
    await run('duck', () =>
      done(
        !to
          ? api.removeFilter(name, DUCK_FILTER)
          : filter
            ? api.editFilter(name, DUCK_FILTER, 'enable')
            : mic
              ? api.addFilter(name, duckFilter(mic))
              : Promise.resolve(),
      ),
    )
    list.reload()
  }
  return (
    <Prop
      label="Lower when I talk"
      hint={
        mic
          ? `It drops while ${mic} hears you, and comes back when you stop.`
          : 'It drops while your mic hears you, and comes back when you stop.'
      }
    >
      {(id) => (
        <span className="ml-auto">
          <Switch
            id={id}
            label="Lower it when I talk"
            hideLabel
            checked={on}
            disabled={busy === 'duck'}
            onChange={(to) => void toggle(to)}
          />
        </span>
      )}
    </Prop>
  )
}

function FilterSettings({
  source,
  filter,
  kind,
  more,
}: {
  source: string
  filter: string
  kind: string
  more: boolean
}) {
  const { api, refresh } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.filterOptions(source, filter), api.filterSettings(source, filter)]),
    [api, source, filter],
  )
  // The scene's items too: a crop changes the source's size, so its outline on the canvas.
  const [edits, set] = useApplied(
    (e) => api.updateFilter(source, filter, e),
    () => {
      loaded.reload()
      refresh()
    },
    loaded.data,
  )
  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-20" />
  if (kind === 'ferrocast_vst')
    return (
      <VstForm
        source={source}
        filter={filter}
        values={{ ...loaded.data[1], ...edits }}
        onChange={set}
      />
    )
  return (
    <FilterForm
      kind={kind}
      more={more}
      source={source}
      opts={loaded.data[0]}
      values={{ ...loaded.data[1], ...edits }}
      onChange={set}
    />
  )
}

/** Every setting the source has, applied as it changes, laid out for its kind. */
function Settings({ name, kind }: { name: string; kind: string }) {
  const { api } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.sourceOptions(name), api.settings(name)]),
    [api, name],
  )
  const [edits, set] = useApplied((e) => api.update(name, e), loaded.reload, loaded.data)
  if (loaded.error && !loaded.data)
    return (
      <Pad>
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      </Pad>
    )
  if (!loaded.data) return <Skeleton className="m-3 h-32" />
  const values = { ...loaded.data[1], ...edits }
  if (kind === 'screen_capture')
    return (
      <section aria-label="What to show" className="flex flex-col">
        <Band icon={Monitor} tone="var(--fc-accent-text)" title="What to show" />
        <CaptureForm opts={loaded.data[0]} values={values} onChange={set} />
      </section>
    )
  return (
    <KindSettings name={name} kind={kind} opts={loaded.data[0]} values={values} onChange={set} />
  )
}
