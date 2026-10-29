// A source's panel, beside the preview (it stays visible where the panel doesn't cover it):
// rename it; for a sound, its level, "hear it" and the scenes it plays in; its filters in
// plain words; and every setting OBS has for it, applied as you change them.

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  CaretUp,
  Check,
  CursorClick,
  DotsSixVertical,
  Funnel,
  Headphones,
  Plus,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  type EngineAudio,
  type EngineFilter,
  type EngineLevel,
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
import { done, useAction, useResource, type Resource } from '../../../lib/hooks'
import { FILTERS, FILTER_OF, KindTile, SOUND_ONLY, useDesk, type DrawerTab } from './common'
import { VERDICT_WORDS, cleanMicPlan, freeName, voiceVerdict } from './cleanmic'
import { Meter, useLevels } from './mixer'
import { OptionsForm } from './options'

/** Sends edits once they've stopped changing for a moment. */
function useApplied(apply: (edits: EngineSettings) => Promise<unknown>, after: () => void) {
  const [edits, setEdits] = useState<EngineSettings>({})
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
  return [edits, (k: string, v: unknown) => setEdits((p) => ({ ...p, [k]: v }))] as const
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
  const { api, audio, items, scene, refresh, edit, kinds } = useDesk()
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
      // Opened again under its new name, on the same tab (CodeRabbit).
      edit(to, shown)
    } else setRename(name)
  }
  const setAudio = (patch: { volume_db?: number; muted?: boolean; monitor?: EngineMonitor }) => {
    audio.set((list) => (list ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    void run('audio', () => api.setAudio(name, patch))
  }

  // Two tabs (owner's pick F1, 29 Oct): the sound and the filters in one, then where it plays
  // with its own settings. A sound opens on the first, anything else on Settings; "Filters"
  // from a menu opens the first at its filters.
  const tabs: { id: 'sound' | 'settings'; label: string; count?: number }[] = [
    {
      id: 'sound',
      label: a ? 'Sound & filters' : 'Filters',
      ...(filters.data?.length ? { count: filters.data.length } : {}),
    },
    { id: 'settings', label: 'Settings' },
  ]
  const shown: 'sound' | 'settings' =
    tab === 'settings'
      ? 'settings'
      : tab === 'sound' || tab === 'filters' || a
        ? 'sound'
        : 'settings'
  const picture = !SOUND_ONLY.has(kind)
  const kindName = kinds.data?.inputs.find((k) => k.id === kind)?.name
  const panelId = `source-tab-${shown}`

  return (
    <aside
      ref={panel}
      data-over-preview
      aria-label={`${name} settings`}
      className="fixed top-0 right-0 bottom-[var(--fc-statusbar,0px)] z-40 flex w-full max-w-[540px] flex-col border-l border-line-strong bg-surface-1 shadow-pop"
    >
      <header className="flex items-center gap-3 py-3 pr-3 pl-4">
        <KindTile kind={kind} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Input
            aria-label="Name"
            className="-ml-2 h-8! min-w-0 border-transparent! bg-transparent! px-2! font-display text-[18px]! font-bold hover:border-line-strong!"
            maxLength={100}
            value={rename}
            onChange={(e) => setRename(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <span className="truncate text-[13px] text-text-3">
            {[kindName, a?.channel ? 'plays in every scene' : null].filter(Boolean).join(' · ') ||
              '\u00a0'}
          </span>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div
        role="tablist"
        aria-label={`${name} settings`}
        className="flex gap-1 border-b border-line px-3"
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
              '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[14.5px] font-bold outline-none focus-visible:shadow-[var(--fc-focus)]',
              shown === t.id
                ? 'border-text text-text'
                : 'border-transparent text-text-3 hover:text-text',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-surface-3 px-1.5 font-mono text-[11.5px] text-text-2 tabular-nums">
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
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-4"
      >
        {shown === 'sound' && a && (
          <section
            aria-label="Sound"
            className="flex flex-col gap-3 rounded-control border border-line bg-surface-2 p-3"
          >
            <div className="flex items-center gap-2">
              <IconButton
                size="sm"
                label={a.muted ? `Unmute ${name}` : `Mute ${name}`}
                aria-pressed={a.muted}
                variant={a.muted ? 'danger-ghost' : 'ghost'}
                className={cx(a.muted ? 'bg-danger-soft' : 'bg-surface-3 text-text')}
                onClick={() => setAudio({ muted: !a.muted })}
              >
                {a.muted ? <SpeakerSlash size={17} weight="bold" /> : <SpeakerHigh size={17} />}
              </IconButton>
              <span className={cx('text-[14.5px] font-bold', a.muted && 'text-danger')}>
                {a.muted ? 'Muted' : 'Volume'}
              </span>
              <span className="ml-auto font-mono text-[13.5px] text-text-2 tabular-nums">
                {`${a.volume_db.toFixed(1)} dB`}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Headphones size={16} aria-hidden />
                Hear it
                <InfoTip label="About hearing it">
                  Off: only the stream hears it. Only me: your headphones, not the stream or the
                  recording. Me and stream: both.
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
            {MIC_KINDS.has(kind) && <CleanMic name={name} level={levels[name]} list={filters} />}
          </section>
        )}
        {shown === 'sound' && (
          <Filters
            name={name}
            picture={picture}
            sound={!!a}
            list={filters}
            reveal={first === 'filters'}
          />
        )}
        {shown === 'settings' && (
          <>
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
              <section aria-label="Plays in" className="flex flex-col gap-2">
                {a.channel ? <EverywhereIn sound={a} /> : <PlaysIn name={name} />}
              </section>
            )}
            <Settings name={name} device={a ? 'Device settings' : 'Source settings'} />
          </>
        )}
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
  // A filter's trash asks once more (its settings go with it).
  const [sure, setSure] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
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
    if (await act('add', () => api.addFilter(name, { kind, name: n }))) {
      setOpen(n)
      setAdding(false)
      setFind('')
    }
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
    <section ref={section} aria-label="Filters" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h3 className="m-0 flex items-center gap-1 font-display text-[14px] font-extrabold text-text-2">
          Filters on it
          <InfoTip label="About filters">They run in order, top to bottom.</InfoTip>
        </h3>
        {list.error && !list.data ? (
          <LoadError error={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-16" />
        ) : filters.length === 0 ? (
          <p className="m-0 rounded-control border border-dashed border-line-strong px-3 py-3 text-[14px] text-text-3">
            None yet.
          </p>
        ) : (
          <div ref={rows} className="flex flex-col gap-1.5">
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
                    'relative rounded-[12px] border border-line bg-surface-2',
                    !f.enabled && 'opacity-60',
                    drag?.from === i && 'ring-2 ring-accent-line',
                  )}
                >
                  {lineAbove && (
                    <span
                      aria-hidden
                      className="absolute inset-x-1 -top-[5px] h-[3px] rounded-full bg-accent-text"
                    />
                  )}
                  {lineBelow && (
                    <span
                      aria-hidden
                      className="absolute inset-x-1 -bottom-[5px] h-[3px] rounded-full bg-accent-text"
                    />
                  )}
                  <div className="flex items-center gap-2 py-1.5 pr-2 pl-1">
                    <button
                      type="button"
                      aria-label={`Move ${f.name}: drag, or press the up and down arrows`}
                      // Not disabled while a move is sent: that would drop the keyboard's
                      // place on it after each step (CodeRabbit).
                      aria-disabled={busy !== null || undefined}
                      className="grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-[6px] text-text-3 outline-none hover:text-text focus-visible:shadow-[var(--fc-focus)] active:cursor-grabbing"
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
                      <DotsSixVertical size={16} weight="bold" />
                    </button>
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent-text"
                    >
                      <FIcon size={17} />
                    </span>
                    <button
                      type="button"
                      aria-expanded={open === f.name}
                      onClick={() => setOpen(open === f.name ? null : f.name)}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="w-full truncate text-[14.5px] font-bold">{f.name}</span>
                      <span className="w-full truncate text-[13px] text-text-3">
                        {entry && entry.label !== f.name ? entry.label : (entry?.help ?? f.kind)}
                      </span>
                    </button>
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
                      <Trash size={15} weight={sure === f.name ? 'fill' : 'regular'} />
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
                  {open === f.name && (
                    <div className="border-t border-line p-3">
                      <FilterSettings source={name} filter={f.name} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <AddFilter
        open={adding}
        onOpen={setAdding}
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
  open,
  onOpen,
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
  open: boolean
  onOpen: (open: boolean) => void
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
  const id = useId()
  const q = find.trim().toLowerCase()
  const match = (p: FilterPick) => !q || `${p.label} ${p.help ?? ''}`.toLowerCase().includes(q)
  const pics = only === 'sound' ? [] : curated.filter((p) => !p.audio && match(p))
  const sounds = only === 'picture' ? [] : curated.filter((p) => p.audio && match(p))
  const rest = others.filter(match)
  const row = (p: FilterPick) => {
    const Icon = p.icon ?? Funnel
    return (
      <button
        key={p.kind}
        type="button"
        disabled={busy}
        aria-label={`Add ${p.label}${p.on ? ' (it has one already)' : ''}`}
        onClick={() => onAdd(p.kind, p.label)}
        className="group flex min-w-0 items-center gap-2.5 rounded-[10px] px-2 py-2 text-left outline-none hover:bg-surface-3 focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cx(
            'grid size-8 shrink-0 place-items-center rounded-[9px]',
            p.audio ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent-text',
          )}
        >
          <Icon size={17} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-bold">{p.label}</span>
          {p.help && <span className="truncate text-[12.5px] text-text-3">{p.help}</span>}
        </span>
        {p.on ? (
          <span className="shrink-0 text-[12.5px] font-bold text-ok">On it</span>
        ) : (
          <Plus
            size={16}
            weight="bold"
            aria-hidden
            className="shrink-0 text-text-3 group-hover:text-text"
          />
        )}
      </button>
    )
  }
  const group = (title: string, picks: FilterPick[]) =>
    picks.length > 0 && (
      <div className="flex flex-col gap-1">
        <h4 className="m-0 flex items-center gap-2 text-[11.5px] font-extrabold tracking-[0.07em] text-text-3 uppercase after:h-px after:flex-1 after:bg-line">
          {title}
        </h4>
        <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">{picks.map(row)}</div>
      </div>
    )
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onOpen(!open)}
        >
          <Plus size={16} weight="bold" /> Add a filter
          {open ? <CaretUp size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
        </Button>
      </div>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Add a filter"
          className="flex flex-col gap-2.5 rounded-[14px] border border-line-strong bg-surface-1 p-2.5 shadow-pop"
        >
          <Input
            aria-label="Find a filter"
            data-keep-placeholder
            placeholder="Find a filter"
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
              value={only}
              options={[
                { value: 'all', label: 'All' },
                { value: 'picture', label: 'Picture' },
                { value: 'sound', label: 'Sound' },
              ]}
              onChange={onOnly}
            />
          )}
          {group('Picture', pics)}
          {group('Sound', sounds)}
          {rest.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-expanded={more || !!q}
                onClick={() => onMore(!more)}
                className="flex items-center gap-2 rounded-[8px] px-2 py-2 text-left text-[13.5px] font-bold text-text-2 outline-none hover:text-text focus-visible:shadow-[var(--fc-focus)]"
              >
                {more || q ? (
                  <CaretDown size={14} weight="bold" />
                ) : (
                  <CaretRight size={14} weight="bold" />
                )}
                {rest.length} more (OBS's own)
              </button>
              {(more || !!q) && (
                <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">{rest.map(row)}</div>
              )}
            </div>
          )}
          {pics.length + sounds.length + rest.length === 0 && (
            <p className="m-0 px-2 py-2 text-[14px] text-text-3">No filter called that.</p>
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

/** Every setting OBS has for the source, applied as it changes, under `device` ("Device settings"
 * for a sound, else "Source settings"). */
function Settings({ name, device }: { name: string; device: string }) {
  const { api } = useDesk()
  const loaded = useResource(
    () => Promise.all([api.sourceOptions(name), api.settings(name)]),
    [api, name],
  )
  const [edits, set] = useApplied((e) => api.update(name, e), loaded.reload)
  return (
    <section aria-label="All settings" className="flex flex-col gap-2">
      <h3 className="m-0 font-display text-[14px] font-extrabold text-text-2">{device}</h3>
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
