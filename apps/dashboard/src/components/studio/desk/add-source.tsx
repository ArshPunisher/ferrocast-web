// "Add a source": kinds by what they're for, with icons. Capture kinds list this computer's
// cameras, screens and mics to pick in one click; any kind can reuse a source from another
// scene; sound devices can play in every scene. Every other kind OBS has is under "More".

import { useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  Cube,
  MagnifyingGlass,
  ShieldWarning,
} from '@phosphor-icons/react'
import { type EngineKind, type EngineOption, type EngineSettings } from '@ferrocast/api'
import { Button, Dialog, Field, InfoTip, Input, Skeleton, Switch, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useAction, useResource } from '../../../lib/hooks'
import { KIND_GROUPS, KindTile, PLAIN_TONE, pickKind, useDesk, type KindEntry } from './common'
import { OptionsForm } from './options'

interface Choice {
  entry: KindEntry
  kind: string
  /** Its group's colour. */
  tone: string
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

/** Kinds that need macOS's Screen Recording switch (screens, windows, and their sound). */
const NEEDS_SCREEN = new Set(['screen', 'window', 'desktop', 'app'])

/**
 * Screen Recording is off for this Ferrocast: ask macOS again (forgetting an older build's
 * answer, which System Settings can still show switched on), then open Ferrocast again.
 */
function ScreenAccess() {
  const { api } = useDesk()
  const { busy, run } = useAction()
  const access = useResource(() => api.screenAccess(), [api])
  const [asked, setAsked] = useState(false)
  if (!inDesktopApp() || access.data?.granted !== false) return null
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[12px] border border-[color-mix(in_oklab,var(--fc-warn)_45%,transparent)] bg-warn-soft p-4"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-1 text-warn">
          <ShieldWarning size={20} weight="fill" aria-hidden />
        </span>
        <p className="m-0 flex flex-1 items-center gap-1 text-[15.5px] font-bold text-text">
          Allow Screen Recording
          <InfoTip label="Why it asks again">
            Each Ferrocast update is new to macOS, so a switch that looks on can belong to an older
            one.
          </InfoTip>
        </p>
      </div>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[14.5px] font-semibold text-text-2">
        <li>Press Ask again, then Open System Settings.</li>
        <li>Switch Ferrocast on.</li>
        <li>Press Reopen.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={asked ? 'secondary' : 'primary'}
          busy={busy === 'ask'}
          onClick={() =>
            void run('ask', () => api.fixScreenAccess()).then((r) => {
              if (!r) return
              setAsked(true)
              if (r.granted) access.reload()
            })
          }
        >
          <ShieldWarning size={16} weight="bold" /> Ask again
        </Button>
        <Button
          type="button"
          variant={asked ? 'primary' : 'secondary'}
          busy={busy === 'restart'}
          onClick={() => void run('restart', () => api.restart())}
        >
          <ArrowClockwise size={16} weight="bold" /> Reopen Ferrocast
        </Button>
      </div>
    </div>
  )
}

export function AddSourceDialog() {
  const { adding, setAdding, scene } = useDesk()
  return (
    <Dialog
      open={adding !== null}
      onClose={() => setAdding(null)}
      size="xl"
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
        .map((entry) => ({ entry, kind: pickKind(entry, k), tone: g.tone }))
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
        tone: PLAIN_TONE,
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
    <div className="-mx-1 flex flex-col gap-3 sm:grid sm:h-full sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-5">
      <nav aria-label="Kinds" className="flex min-h-0 flex-col gap-2">
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
        <div className="flex gap-1 overflow-x-auto sm:min-h-0 sm:flex-1 sm:flex-col sm:overflow-y-auto sm:pr-1">
          {groups.map((g) => {
            const shown = g.choices.filter(
              (c) => !needle || c.entry.label.toLowerCase().includes(needle),
            )
            if (!shown.length) return null
            return (
              <div key={g.label} className="flex gap-1 sm:flex-col sm:gap-px">
                <h3 className="m-0 hidden px-2.5 pt-3 pb-1 text-[12px] font-extrabold tracking-wide text-text-2 uppercase sm:block">
                  {g.label}
                </h3>
                {shown.map((c) => {
                  const on = chosen?.entry.key === c.entry.key
                  return (
                    <button
                      key={c.entry.key}
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setPick(c.entry.key)}
                      className={cx(
                        'flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-2 text-left text-[14.5px] font-semibold whitespace-nowrap text-text hover:bg-surface-2',
                        on &&
                          'bg-surface-3 shadow-[inset_0_0_0_1px_var(--fc-line-strong)] hover:bg-surface-3',
                      )}
                    >
                      <KindTile icon={c.entry.icon} tone={c.tone} size={26} />
                      <span className="truncate">{c.entry.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </nav>
      <div className="min-h-0 min-w-0 sm:overflow-y-auto sm:pr-1">
        {chosen && <Pick key={chosen.entry.key} c={chosen} scene={scene} onDone={onDone} />}
      </div>
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
      {NEEDS_SCREEN.has(c.entry.key) && <ScreenAccess />}
      {dev && dev.choices.every((l) => !l.trim()) && (
        <p className="m-0 rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[15px] font-semibold text-text-2">
          {NEEDS_SCREEN.has(c.entry.key)
            ? 'Nothing to pick. Open the window you want, or allow Screen Recording.'
            : 'Nothing to pick. Plug it in, then open this again.'}
        </p>
      )}
      {dev && dev.choices.some((l) => l.trim()) && (
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-3 font-display text-[16px] font-extrabold text-text">
            Pick one
          </legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            {dev.choices.map((label, i) => {
              if (!label.trim()) return null
              const on = device === i
              return (
                <button
                  key={`${i}-${label}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDevice(i)}
                  style={on ? { borderColor: c.tone, boxShadow: `0 0 0 1px ${c.tone}` } : undefined}
                  className="relative flex flex-col overflow-hidden rounded-[12px] border border-line bg-surface-2 text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-line-strong active:scale-[0.98]"
                >
                  <span
                    className="grid aspect-video place-items-center"
                    style={{
                      background: `color-mix(in oklab, ${c.tone} ${on ? 22 : 9}%, var(--fc-surface-inset))`,
                      color: c.tone,
                    }}
                  >
                    <Icon size={34} weight={on ? 'fill' : 'bold'} aria-hidden />
                  </span>
                  <span className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-text">
                      {label}
                    </span>
                    {on && (
                      <CheckCircle
                        size={18}
                        weight="fill"
                        aria-hidden
                        className="shrink-0"
                        style={{ color: c.tone }}
                      />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      {c.entry.overlays && (
        <div className="flex flex-col gap-2.5">
          <h4 className="m-0 font-display text-[16px] font-extrabold text-text">Pick an overlay</h4>
          {overlays.error && !overlays.data ? (
            <LoadError error={overlays.error} onRetry={overlays.reload} />
          ) : !overlays.data ? (
            <Skeleton className="h-24" />
          ) : overlays.data.length === 0 ? (
            <p className="m-0 text-[14.5px] text-text-2">
              No overlays yet. Make one in Overlays, then add it here.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {overlays.data.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void addOverlay(o)}
                  className="flex items-center gap-3 rounded-[12px] border border-line bg-surface-2 px-3 py-3 text-left hover:border-line-strong active:scale-[0.98]"
                >
                  <KindTile icon={Icon} tone={c.tone} size={34} />
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px] text-text">{o.name}</b>
                    <span className="block font-mono text-[13px] text-text-3 tabular-nums">
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
          <h4 className="m-0 font-display text-[16px] font-extrabold text-text">
            {isScene ? 'Show a scene inside this one' : 'Or use one you already have'}
          </h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {reuse.map((r) => {
              return (
                <button
                  key={r.name}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void addExisting(r.name)}
                  className="flex items-center gap-3 rounded-[12px] border border-line bg-surface-2 px-3 py-3 text-left hover:border-line-strong active:scale-[0.98]"
                >
                  {isScene ? (
                    <KindTile kind="scene" size={34} />
                  ) : (
                    <KindTile icon={Icon} tone={c.tone} size={34} />
                  )}
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px] text-text">{r.name}</b>
                    <span className="block truncate text-[13px] text-text-3">{r.where}</span>
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
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[14.5px] font-semibold text-accent-text">
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
