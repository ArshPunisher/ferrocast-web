// "Add a source": kinds by what they're for, with icons. Capture kinds list this computer's
// cameras, screens and mics to pick in one click; any kind can reuse a source from another
// scene; sound devices can play in every scene. Every other kind OBS has is under "More".

import { useMemo, useState } from 'react'
import { Cube, MagnifyingGlass } from '@phosphor-icons/react'
import { type EngineKind, type EngineOption, type EngineSettings } from '@ferrocast/api'
import { Button, Dialog, Field, Input, Skeleton, Switch, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { KIND_GROUPS, kindIcon, pickKind, useDesk, type KindEntry } from './common'
import { OptionsForm } from './options'

interface Choice {
  entry: KindEntry
  kind: string
}

/** A name not used yet in the collection. */
function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

/** The option listing devices, from the entry's candidates (or none). */
function deviceOption(opts: EngineOption[], keys: string[] | undefined): EngineOption | null {
  if (!keys) return null
  for (const k of keys) {
    const o = opts.find((x) => x.key === k && x.kind === 'list' && x.choices.length > 0)
    if (o) return o
  }
  return null
}

const SOUND = new Set(['mic', 'desktop', 'app'])

export function AddSourceDialog() {
  const { adding, setAdding, scene } = useDesk()
  return (
    <Dialog
      open={adding !== null}
      onClose={() => setAdding(null)}
      size="lg"
      title={`Add to ${scene}`}
    >
      {adding !== null && <AddSource start={adding} onDone={() => setAdding(null)} />}
    </Dialog>
  )
}

function AddSource({ start, onDone }: { start: string; onDone: () => void }) {
  const { kinds, scenes, scene } = useDesk()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const k = kinds.data
    const used = new Set<string>()
    const out = KIND_GROUPS.map((g) => ({
      label: g.label,
      choices: g.entries
        .map((entry) => ({ entry, kind: pickKind(entry, k) }))
        .filter((c): c is Choice => {
          if (!c.kind) return false
          if (c.entry.scene) return (scenes.data?.scenes.length ?? 0) > 1
          c.entry.kinds.forEach((x) => used.add(x))
          return true
        }),
    }))
    // Every other kind OBS has, by its own name.
    const more: Choice[] = (k?.inputs ?? [])
      .filter((x) => !used.has(x.id))
      .map((x: EngineKind) => ({
        entry: { key: `more:${x.id}`, label: x.name || x.id, icon: Cube, kinds: [x.id] },
        kind: x.id,
      }))
    if (more.length) out.push({ label: 'More', choices: more })
    return out.filter((g) => g.choices.length > 0)
  }, [kinds.data, scenes.data])
  const all = groups.flatMap((g) => g.choices)
  const [pick, setPick] = useState<string>(start)
  const chosen = all.find((c) => c.entry.key === pick) ?? all[0] ?? null
  const needle = q.trim().toLowerCase()

  if (kinds.error && !kinds.data) return <LoadError error={kinds.error} onRetry={kinds.reload} />
  if (!kinds.data) return <Skeleton className="h-80" />
  return (
    <div className="-mx-1 flex flex-col gap-3 sm:grid sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-4">
      <nav aria-label="Kinds" className="flex flex-col gap-2">
        <div className="relative">
          <MagnifyingGlass
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
          />
          <Input
            type="search"
            aria-label="Search kinds"
            placeholder="Search…"
            className="pl-9!"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto sm:max-h-[440px] sm:flex-col sm:overflow-y-auto">
          {groups.map((g) => {
            const shown = g.choices.filter(
              (c) => !needle || c.entry.label.toLowerCase().includes(needle),
            )
            if (!shown.length) return null
            return (
              <div key={g.label} className="flex gap-1 sm:flex-col sm:gap-px">
                <h3 className="m-0 hidden px-2.5 pt-2 pb-1 text-[11.5px] font-bold text-text-3 sm:block">
                  {g.label}
                </h3>
                {shown.map((c) => {
                  const Icon = c.entry.icon
                  const on = chosen?.entry.key === c.entry.key
                  return (
                    <button
                      key={c.entry.key}
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setPick(c.entry.key)}
                      className={cx(
                        'flex h-9 shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] whitespace-nowrap hover:bg-surface-2',
                        on && 'bg-accent-soft font-semibold text-accent-text hover:bg-accent-soft',
                      )}
                    >
                      <Icon
                        size={17}
                        aria-hidden
                        className={on ? 'text-accent-text' : 'text-text-3'}
                      />
                      <span className="truncate">{c.entry.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </nav>
      {chosen && <Pick key={chosen.entry.key} c={chosen} scene={scene} onDone={onDone} />}
    </div>
  )
}

/** The right side: devices or settings for the kind, a name, and Add. */
function Pick({ c, scene, onDone }: { c: Choice; scene: string; onDone: () => void }) {
  const { api, scenes, audio, refresh } = useDesk()
  const { run, busy } = useAction()
  const isScene = !!c.entry.scene
  const loaded = useResource(
    () =>
      isScene
        ? Promise.all([Promise.resolve([] as EngineOption[]), Promise.resolve({}), api.sources()])
        : Promise.all([api.options(c.kind), api.defaults(c.kind), api.sources()]),
    [api, c.kind, isScene],
  )
  const overlays = useResource(
    (client) => (c.entry.overlays ? client.overlays() : Promise.resolve([])),
    [c.entry.overlays],
  )
  const [device, setDevice] = useState<number | null>(null)
  const [edits, setEdits] = useState<EngineSettings>({})
  const [name, setName] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const sound = SOUND.has(c.entry.key)
  const [everywhere, setEverywhere] = useState(c.entry.key !== 'app')

  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-72" />
  const [opts, defaults, sources] = loaded.data
  const taken = new Set([
    ...sources.map((s) => s.name),
    ...(scenes.data?.scenes.map((s) => s.name) ?? []),
  ])
  const dev = deviceOption(opts, c.entry.device)
  const devName = dev && device !== null ? dev.choices[device] : null
  const shownName = name ?? freeName(devName ?? c.entry.label, taken)
  const reuse = isScene
    ? (scenes.data?.scenes ?? [])
        .filter((s) => s.name !== scene)
        .map((s) => ({ name: s.name, where: `${s.items} sources` }))
    : sources
        .filter((s) => c.entry.kinds.includes(s.kind) && !s.scenes.includes(scene))
        .map((s) => ({ name: s.name, where: `In ${s.scenes.join(', ')}` }))
  // Sound devices heard everywhere go on a free global channel (desktop 1-2, mics 3-6).
  const used = new Set(audio.data?.map((a) => a.channel).filter(Boolean))
  const channel =
    (c.entry.key === 'mic' ? [3, 4, 5, 6] : [1, 2]).find((ch) => !used.has(ch)) ?? null
  const global = sound && everywhere && channel !== null

  /** One of Ferrocast's overlays, as a web page at its own size, fitted to the screen. */
  const addOverlay = async (o: { name: string; url: string; width: number; height: number }) => {
    const source = {
      kind: c.kind,
      name: freeName(o.name, taken),
      settings: { url: o.url, width: o.width, height: o.height },
    }
    finish(
      await run('overlay', () => api.addSource(scene, source, true), {
        success: `Added ${source.name}.`,
      }),
    )
  }
  const finish = (ok: unknown) => {
    if (!ok) return
    refresh()
    onDone()
  }
  const addExisting = async (n: string) =>
    finish(await run('reuse', () => api.addExisting(scene, n), { success: `Added ${n}.` }))
  const add = async () => {
    const settings: EngineSettings = {
      ...(c.entry.settings ?? {}),
      ...edits,
      ...(dev && device !== null ? { [dev.key]: dev.values[device] } : {}),
    }
    const source = { kind: c.kind, name: shownName.trim(), settings }
    if (global && channel !== null) {
      return finish(
        await run('add', () => api.setChannel(channel, source).then(() => true), {
          success: `${source.name} plays in every scene.`,
        }),
      )
    }
    const made = await run('add', () => api.addSource(scene, source, !!c.entry.fit), {
      success: `Added ${source.name}.`,
    })
    if (made && !visible) await api.editItem(scene, made.item.id, 'hide').catch(() => undefined)
    finish(made)
  }

  const Icon = c.entry.icon
  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      {dev && (
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 font-display text-[14px] font-bold">Pick one</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {dev.choices.map((label, i) =>
              !label.trim() ? null : (
                <button
                  key={`${i}-${label}`}
                  type="button"
                  aria-pressed={device === i}
                  onClick={() => setDevice(i)}
                  className={cx(
                    'flex flex-col overflow-hidden rounded-control border border-line bg-surface-2 text-left transition-[border-color,transform] duration-150 hover:border-line-strong active:scale-[0.98]',
                    device === i && 'border-arc shadow-[inset_0_0_0_1px_var(--fc-arc)]',
                  )}
                >
                  <span className="grid aspect-video place-items-center bg-inset text-text-3">
                    <Icon size={28} aria-hidden />
                  </span>
                  <span className="truncate px-2.5 py-2 text-[13px] font-semibold">{label}</span>
                </button>
              ),
            )}
          </div>
        </fieldset>
      )}
      {c.entry.overlays && (
        <div className="flex flex-col gap-2.5">
          <h4 className="m-0 font-display text-[14px] font-bold">Pick an overlay</h4>
          {overlays.error && !overlays.data ? (
            <LoadError error={overlays.error} onRetry={overlays.reload} />
          ) : !overlays.data ? (
            <Skeleton className="h-24" />
          ) : overlays.data.length === 0 ? (
            <p className="m-0 text-[13.5px] text-text-2">
              No overlays yet. Make one in Overlays, then add it here.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
              {overlays.data.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void addOverlay(o)}
                  className="flex items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-left hover:border-line-strong active:scale-[0.98]"
                >
                  <Icon size={18} aria-hidden className="shrink-0 text-text-3" />
                  <span className="min-w-0">
                    <b className="block truncate text-[13px]">{o.name}</b>
                    <span className="block font-mono text-[12px] text-text-3 tabular-nums">
                      {o.width}×{o.height}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {reuse.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h4 className="m-0 font-display text-[14px] font-bold">
            {isScene ? 'Show a scene inside this one' : 'Or use one you already have'}
          </h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {reuse.map((r) => {
              const RIcon = isScene ? kindIcon('scene') : Icon
              return (
                <button
                  key={r.name}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void addExisting(r.name)}
                  className="flex items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-left hover:border-line-strong active:scale-[0.98]"
                >
                  <RIcon size={18} aria-hidden className="shrink-0 text-text-3" />
                  <span className="min-w-0">
                    <b className="block truncate text-[13px]">{r.name}</b>
                    <span className="block truncate text-[12px] text-text-3">{r.where}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {!isScene && !c.entry.overlays && (
        <>
          {!dev && (
            <details className="group rounded-control border border-line" open={!c.entry.device}>
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[13.5px] font-semibold text-accent-text">
                Settings
              </summary>
              <div className="border-t border-line p-3">
                <OptionsForm
                  opts={opts}
                  values={{ ...defaults, ...(c.entry.settings ?? {}), ...edits }}
                  onChange={(k, v) => setEdits((p) => ({ ...p, [k]: v }))}
                />
              </div>
            </details>
          )}
          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end">
            <Field label="Name" className="min-w-0 flex-1">
              {(p) => (
                <Input
                  {...p}
                  value={shownName}
                  maxLength={100}
                  required
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            {sound ? (
              <div className="sm:pb-2">
                <Switch
                  label="Every scene"
                  checked={global}
                  disabled={channel === null}
                  description={
                    channel === null
                      ? 'All six device spots are used.'
                      : "On: heard in all your scenes, like OBS's Mic/Aux."
                  }
                  onChange={setEverywhere}
                />
              </div>
            ) : (
              <div className="sm:pb-2">
                <Switch label="Show it now" checked={visible} onChange={setVisible} />
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              busy={busy === 'add'}
              disabled={!shownName.trim() || (!!dev && device === null)}
            >
              Add
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
