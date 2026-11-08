// "Add a source": kinds by what they're for, with icons. Capture kinds list this computer's
// cameras, screens and mics to pick in one click; any kind can reuse a source from another
// scene; sound devices can play in every scene. Every other kind OBS has is under "More".

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  Cube,
  ListBullets,
  MagnifyingGlass,
  ShieldWarning,
  SquaresFour,
} from '@phosphor-icons/react'
import {
  type EngineKind,
  type EngineKinds,
  type EngineOption,
  type EngineSettings,
  type EngineSourceUse,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  Field,
  IconButton,
  InfoTip,
  Input,
  Skeleton,
  Switch,
  cx,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useAction, useResource } from '../../../lib/hooks'
import { KIND_GROUPS, KindTile, PLAIN_TONE, pickKind, useDesk, type KindEntry } from './common'
import { GuestInvites } from './guests'
import { readAhead, useKindForm } from './kind-cache'
import { OptionsForm } from './options'

export interface Choice {
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

/** Words that name what a device is rather than which one it is. */
const DEVICE_WORDS = new Set([
  'video',
  'audio',
  'digital',
  'camera',
  'microphone',
  'mic',
  'input',
  'capture',
  'device',
  'usb',
  'hd',
  'the',
])

/**
 * The sound device that belongs to a video device (a capture card's "USB2 Digital Audio" for
 * "USB2 Video", an iPhone's microphone for its camera): the one sharing the most naming words,
 * as OBS brings a capture card's own sound with it.
 */
export function pairedSound(video: string, sounds: readonly string[]): string | null {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’']/g, "'")
      .split(/[^a-z0-9']+/)
      .filter((w) => w && !DEVICE_WORDS.has(w))
  const mine = new Set(words(video))
  if (mine.size === 0) return null
  let best: { name: string; score: number } | null = null
  for (const s of sounds) {
    const score = words(s).filter((w) => mine.has(w)).length
    if (score > 0 && (!best || score > best.score)) best = { name: s, score }
  }
  return best?.name ?? null
}

/** Video devices whose sound comes with them: on by default for capture cards. */
const BRINGS_SOUND: Record<string, boolean> = { card: true, camera: false }

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

/** The kinds whose forms list devices, as this engine names them (to read them ahead). */
function deviceKinds(kinds: EngineKinds | null): string[] {
  const out: string[] = []
  for (const g of KIND_GROUPS)
    for (const e of g.entries) {
      const k = e.device ? pickKind(e, kinds) : null
      if (k) out.push(k)
    }
  return out
}

export function AddSourceDialog() {
  const { adding, setAdding, scene, api, kinds } = useDesk()
  const open = adding !== null
  // The cameras, screens and mics are read ahead, once the Studio has settled and again as the
  // dialog opens, so picking a kind shows its list at once.
  useEffect(() => {
    if (!kinds.data || !inDesktopApp()) return
    const ahead = deviceKinds(kinds.data)
    if (open) return readAhead(api, ahead)
    const t = window.setTimeout(() => readAhead(api, ahead), 2000)
    return () => window.clearTimeout(t)
  }, [api, kinds.data, open])
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
  const { kinds, pictureScenes, scene } = useDesk()
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
          if (c.entry.scene) return pictureScenes.length > 1
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
  }, [kinds.data, pictureScenes])
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
            data-keep-placeholder
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
                        on && 'fc-picked',
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
      <div className="min-h-0 min-w-0 sm:overflow-y-auto sm:pr-3 sm:[scrollbar-gutter:stable]">
        {chosen &&
          (chosen.entry.guest ? (
            <GuestInvites />
          ) : (
            <Pick key={chosen.entry.key} c={chosen} scene={scene} onDone={onDone} />
          ))}
      </div>
    </div>
  )
}

/** The sources last read from this engine, so the form shows while they're read again. Only
 * names in use come from it (the engine refuses a taken name anyway); the ones offered to
 * reuse wait for the fresh list (CodeRabbit). */
let lastSources: { api: unknown; list: EngineSourceUse[] } | null = null

const VIEW_KEY = 'fc-add-source-view'
type PickView = 'grid' | 'list'

/** Devices as tiles or a list, remembered on this computer (owner, 8 Nov). */
export function usePickView(): [PickView, (v: PickView) => void] {
  const [view, setView] = useState<PickView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const set = (v: PickView) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Not kept (storage off): it still applies until the app closes.
    }
  }
  return [view, set]
}

/** What each device kind is called when there's none, and what to try. */
const NONE: Record<string, { title: string; tips: string[] }> = {
  camera: {
    title: 'No camera found',
    tips: [
      'Plug the camera in, or switch it on.',
      'Close other apps using it (Zoom, Teams, the Camera app).',
    ],
  },
  card: {
    title: 'No capture card found',
    tips: ['Plug the card in with its USB cable.', 'Close other apps using it.'],
  },
  screen: {
    title: 'No screens to show',
    tips: ['Allow Screen Recording for Ferrocast, then look again.'],
  },
  window: {
    title: 'No windows to show',
    tips: ['Open the window or game you want, then look again.', 'Minimised windows are left out.'],
  },
  mic: {
    title: 'No microphone found',
    tips: ['Plug the microphone in.', 'Check it is switched on in the computer’s sound settings.'],
  },
  app: {
    title: 'No apps playing sound',
    tips: ['Open the app you want to hear, then look again.'],
  },
}

/** Nothing to pick: what's missing, what to try, and a button to look again. */
export function NoDevices({
  c,
  checking,
  onLook,
}: {
  c: Choice
  checking: boolean
  onLook: () => void
}) {
  const none = NONE[c.entry.key] ?? {
    title: 'Nothing to pick',
    tips: ['Plug it in, then look again.'],
  }
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-[14px] border border-dashed border-line-strong bg-inset px-6 py-9 text-center"
    >
      <KindTile icon={c.entry.icon} tone={c.tone} size={56} />
      <div className="flex flex-col gap-1.5">
        <p className="m-0 font-display text-[18px] font-extrabold text-text">{none.title}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14.5px] font-semibold text-text-2">
          {none.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <Button type="button" variant="secondary" busy={checking} onClick={onLook}>
        <ArrowClockwise size={16} weight="bold" /> Look again
      </Button>
    </div>
  )
}

/** The right side: devices or settings for the kind, a name, and Add. */
function Pick({ c, scene, onDone }: { c: Choice; scene: string; onDone: () => void }) {
  const { api, allScenes, pictureScenes, audio, refresh, kinds } = useDesk()
  const { run, busy } = useAction()
  const isScene = !!c.entry.scene
  // The form shows at once from what was read before; the devices are read again meanwhile.
  const form = useKindForm(api, isScene ? null : c.kind)
  const srcs = useResource(
    () =>
      api.sources().then((l) => {
        lastSources = { api, list: l }
        return l
      }),
    [api],
  )
  const [view, setView] = usePickView()
  // Back to the app after plugging a camera in or opening a window: look again by itself.
  const reloadForm = form.reload
  useEffect(() => {
    const again = () => {
      if (!document.hidden) reloadForm()
    }
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [reloadForm])
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
  // A capture card or camera: its own sound device, to add with it.
  const pairs = c.entry.key in BRINGS_SOUND
  const micEntry = KIND_GROUPS.flatMap((g) => g.entries).find((e) => e.key === 'mic')
  const micKind = pairs && micEntry ? pickKind(micEntry, kinds.data) : null
  const micForm = useKindForm(api, micKind)
  const [withSound, setWithSound] = useState(BRINGS_SOUND[c.entry.key] ?? false)

  const sourcesNow = srcs.data ?? (lastSources?.api === api ? lastSources.list : null)
  if (form.error) return <LoadError error={form.error} onRetry={form.reload} />
  if (srcs.error && !sourcesNow) return <LoadError error={srcs.error} onRetry={srcs.reload} />
  const formNow: [EngineOption[], EngineSettings] | null = isScene ? [[], {}] : form.data
  if (!formNow || !sourcesNow) return <Skeleton className="h-72" />
  const [opts, defaults] = formNow
  const sources = sourcesNow
  // Names are one list across both pictures.
  const sceneNames = new Set(allScenes.map((s) => s.name))
  const taken = new Set([...sources.map((s) => s.name), ...sceneNames])
  const dev = deviceOption(opts, c.entry.device)
  // A kind that lists devices with none to list now (no camera plugged in): say so plainly
  // instead of falling back to its settings form (owner, 8 Nov: "it shows a settings bar").
  const noDevices =
    !!c.entry.device && !c.entry.overlays && (!dev || dev.choices.every((l) => !l.trim()))
  const devName = dev && device !== null ? dev.choices[device] : null
  const shownName = name ?? freeName(devName ?? c.entry.label, taken)
  const micDev = deviceOption(micForm.data?.[0] ?? [], micEntry?.device)
  const soundName = devName && micDev ? pairedSound(devName, micDev.choices) : null
  // Scenes and sources share one set of names (as in OBS): say which one has it, and offer
  // a free one, right under the field (a toast would sit behind this dialog).
  const clash = taken.has(shownName.trim())
    ? sceneNames.has(shownName.trim())
      ? 'scene'
      : 'source'
    : null
  const reuse = isScene
    ? // A scene shown in a scene: one of the same picture's.
      pictureScenes
        .filter((s) => s.name !== scene)
        .map((s) => ({ name: s.name, where: `${s.items} sources` }))
    : (srcs.data ?? [])
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
      await run(
        'overlay',
        async () => {
          const made = await api.addSource(scene, source, true)
          // Alert sounds: heard by you as well as the stream (OBS's browser source plays them
          // on the computer too). Without this they only reached viewers.
          await api.setAudio(source.name, { monitor: 'me_and_stream' }).catch(() => undefined)
          return made
        },
        { success: `Added ${source.name}.` },
      ),
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
    // Its own sound, in this scene, heard by you and the stream (a console through a capture
    // card is heard like in OBS).
    if (made && withSound && soundName && micKind && micDev) {
      const at = micDev.choices.indexOf(soundName)
      const snd = {
        kind: micKind,
        name: freeName(soundName, taken),
        settings: { [micDev.key]: micDev.values[at] },
      }
      await run('add-sound', async () => {
        await api.addSource(scene, snd)
        await api.setAudio(snd.name, { monitor: 'me_and_stream' })
        return true
      })
    }
    finish(made)
  }

  const Icon = c.entry.icon
  return (
    <form
      className="flex min-h-full min-w-0 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      {/* The name first; how it's added and Add sit in a bar at the bottom that stays in view
          (owner, 28 Oct: they sat oddly beside the name). */}
      {!isScene && !c.entry.overlays && (
        <>
          <div className="flex flex-col gap-3">
            <Field label="Name" className="min-w-0">
              {(p) => (
                <Input
                  {...p}
                  value={shownName}
                  maxLength={100}
                  required
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={clash ? true : undefined}
                  aria-describedby={clash ? 'add-name-clash' : undefined}
                />
              )}
            </Field>
          </div>
          {clash && (
            <p
              id="add-name-clash"
              role="alert"
              className="-mt-2 m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-danger"
            >
              There&apos;s already a {clash} called &ldquo;{shownName.trim()}&rdquo;. Scenes and
              sources need different names.
              <button
                type="button"
                className="font-bold text-accent-text underline underline-offset-2"
                onClick={() => setName(freeName(shownName.trim(), taken))}
              >
                Use &ldquo;{freeName(shownName.trim(), taken)}&rdquo;
              </button>
            </p>
          )}
        </>
      )}
      {!!srcs.error && !srcs.data && <LoadError error={srcs.error} onRetry={srcs.reload} />}
      {NEEDS_SCREEN.has(c.entry.key) && <ScreenAccess />}
      {noDevices && (
        <NoDevices
          c={c}
          checking={form.checking}
          onLook={() => {
            form.reload()
            srcs.reload()
          }}
        />
      )}
      {dev && !noDevices && (
        <div role="group" aria-labelledby="add-pick-one" className="flex flex-col gap-2.5">
          <div className="mb-1 flex items-center gap-2">
            <h4 id="add-pick-one" className="m-0 font-display text-[16px] font-extrabold text-text">
              Pick one
            </h4>
            <span className="flex-1" />
            {form.checking && (
              <span
                role="status"
                className="flex items-center gap-1.5 text-[13px] font-semibold text-text-3"
              >
                <ArrowClockwise
                  size={13}
                  weight="bold"
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
                Looking for new ones
              </span>
            )}
            <IconButton
              size="sm"
              label="Look again"
              disabled={form.checking}
              onClick={() => form.reload()}
            >
              <ArrowClockwise size={16} weight="bold" />
            </IconButton>
            <div
              role="group"
              aria-label="Show devices as"
              className="inline-flex rounded-control border border-line bg-inset p-0.5"
            >
              {(
                [
                  ['grid', 'Tiles', SquaresFour],
                  ['list', 'List', ListBullets],
                ] as const
              ).map(([v, label, Glyph]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={label}
                  title={label}
                  onClick={() => setView(v)}
                  className={cx(
                    'grid size-8 place-items-center rounded-[8px] transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    view === v
                      ? 'fc-picked shadow-[var(--fc-shadow-1)]'
                      : 'text-text-2 hover:bg-surface-3 hover:text-text',
                  )}
                >
                  <Glyph size={16} weight="bold" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          <div
            className={cx(
              view === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3'
                : 'flex flex-col gap-1.5',
            )}
          >
            {dev.choices.map((label, i) => {
              if (!label.trim()) return null
              const on = device === i
              const ring = on
                ? { borderColor: c.tone, boxShadow: `0 0 0 1px ${c.tone}` }
                : undefined
              const check = on && (
                <CheckCircle
                  size={18}
                  weight="fill"
                  aria-hidden
                  className="shrink-0"
                  style={{ color: c.tone }}
                />
              )
              if (view === 'list')
                return (
                  <button
                    key={`${i}-${label}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDevice(i)}
                    style={ring}
                    className="flex min-h-12 items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-line-strong active:scale-[0.99]"
                  >
                    <KindTile icon={Icon} tone={c.tone} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-text">
                      {label}
                    </span>
                    {check}
                  </button>
                )
              return (
                <button
                  key={`${i}-${label}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDevice(i)}
                  style={ring}
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
                    {check}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
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
          {!dev && !noDevices && (
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
        </>
      )}
      {!isScene && !c.entry.overlays && (
        <div className="sticky bottom-0 z-10 -mx-1 mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface-1 px-1 pt-3 pb-1">
          {sound ? (
            <div>
              <Switch
                label="Every scene"
                checked={global}
                disabled={channel === null}
                description={
                  channel === null
                    ? 'All six device spots are used.'
                    : 'On: heard in all your scenes.'
                }
                onChange={setEverywhere}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Switch label="Show it now" checked={visible} onChange={setVisible} />
              {soundName && (
                <Switch
                  label={`With its sound (${soundName})`}
                  description="Adds its sound to this scene and lets you hear it."
                  checked={withSound}
                  onChange={setWithSound}
                />
              )}
            </div>
          )}
          <span className="flex-1" />
          <Button
            type="submit"
            variant="primary"
            busy={busy === 'add'}
            disabled={!shownName.trim() || !!clash || noDevices || (!!dev && device === null)}
          >
            Add
          </Button>
        </div>
      )}
    </form>
  )
}
