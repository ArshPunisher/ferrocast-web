// Studio › Without OBS (2.1 preview, Track B): OBS's own engine run by Ferrocast. Start it,
// see its live picture (a native view the app draws over this page's box), add any kind of
// source OBS has with its options, and change, hide, fit or remove the sources on air.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsOut, Eye, EyeSlash, Play, Stop, Trash } from '@phosphor-icons/react'
import {
  describeError,
  studioEngineApi,
  type EngineKind,
  type EngineOption,
  type EngineSettings,
  type EngineSource,
  type PreviewRect,
  type StudioEngineStatus,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { done, useAction, useClient, useResource, type Resource } from '../../lib/hooks'
import { inDesktopApp } from '../../lib/external'

function useEngine() {
  const client = useClient()
  return useMemo(() => studioEngineApi(client), [client])
}

export function EngineTab() {
  const api = useEngine()
  const status = useResource(() => api.status(), [api])
  const [busy, setBusy] = useState(false)
  const s = status.data
  const running = !!s?.running
  const sources = useResource(() => (running ? api.sources() : Promise.resolve([])), [api, running])
  const run = async (f: () => Promise<StudioEngineStatus>) => {
    setBusy(true)
    try {
      status.set(await f())
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'warn', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(false)
    }
  }
  if (status.error && !s) return <LoadError error={status.error} onRetry={status.reload} />
  if (!s) return <Skeleton className="h-64" />
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title="Ferrocast Studio"
          description="Stream without OBS: OBS's own engine, run by Ferrocast. Preview."
          actions={
            s.available &&
            (s.running ? (
              <Button variant="secondary" busy={busy} onClick={() => void run(api.stop)}>
                <Stop size={15} weight="fill" /> Stop
              </Button>
            ) : (
              <Button variant="primary" busy={busy} onClick={() => void run(api.start)}>
                <Play size={15} weight="fill" /> Start
              </Button>
            ))
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-text-3">
            <Badge tone={s.running ? 'ok' : 'neutral'}>{s.running ? 'Running' : 'Stopped'}</Badge>
            {s.version && <span className="font-mono">OBS engine {s.version}</span>}
            {s.renderer && <span className="font-mono">{s.renderer}</span>}
          </div>
          {!s.available ? (
            <p className="text-[13.5px] text-text-2">{s.detail}</p>
          ) : (
            <PreviewBox running={s.running} />
          )}
        </Panel>
        {s.running && <SourcesPanel sources={sources} />}
      </div>
      {s.running && <KindsPanel onAdded={sources.reload} />}
    </div>
  )
}

/** Where the live picture goes: the app draws a native view exactly over this box. */
function PreviewBox({ running }: { running: boolean }) {
  const api = useEngine()
  const ref = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
  useEffect(() => {
    const el = ref.current
    if (!running || !desktop || !el) return
    let raf = 0
    let last = ''
    const send = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      // The native view sits above the page: it hides while anything could be under it (a
      // dialog, a menu) or the box is partly scrolled under the top bar or off the window.
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      const covered = !!document.querySelector(
        'dialog[open], [role="dialog"], [role="menu"], [role="listbox"]',
      )
      const inView = r.top >= bar && r.bottom <= window.innerHeight && r.width > 1 && r.height > 1
      const rect: PreviewRect | null =
        inView && !covered ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      const key = JSON.stringify(rect)
      if (key === last) return
      last = key
      void api.preview(rect).catch(() => {
        // Not placed: the next change (or the same one) tries again.
        if (last === key) last = ''
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    const mo = new MutationObserver(schedule)
    // Dialogs open by an attribute, not by being added.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    })
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      void api.preview(null).catch(() => undefined)
    }
  }, [api, running, desktop])
  return (
    <div
      ref={ref}
      aria-label="Studio preview"
      className="grid aspect-video w-full place-items-center rounded-control border border-line bg-[#0a0b0d] text-[13px] text-text-3"
    >
      {!running
        ? 'Start the Studio to see its picture.'
        : !desktop
          ? 'The live picture shows in the Ferrocast app.'
          : null}
    </div>
  )
}

/** The sources on air, bottom first: show or hide, fit, remove, or open one's settings. */
function SourcesPanel({ sources }: { sources: Resource<EngineSource[]> }) {
  const api = useEngine()
  const { busy, run } = useAction()
  const [open, setOpen] = useState<string | null>(null)
  const [removing, setRemoving] = useState<EngineSource | null>(null)
  const list = sources.data
  const act = async (src: EngineSource, what: 'show' | 'hide' | 'fit' | 'remove') => {
    const ok = await run(`${what}:${src.name}`, () => done(api.edit(src.name, what)))
    if (!ok) return
    if (what === 'remove' && open === src.name) setOpen(null)
    sources.reload()
  }
  return (
    <Panel title="Sources" description="On air now, bottom first.">
      {sources.error && !list ? (
        <LoadError error={sources.error} onRetry={sources.reload} />
      ) : !list ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <p className="text-[13.5px] text-text-3">Nothing yet. Add a source from the list.</p>
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {list.map((src) => (
            <li key={src.name}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={open === src.name}
                  onClick={() => setOpen(open === src.name ? null : src.name)}
                  className={cx(
                    'flex min-w-0 flex-1 items-baseline gap-3 text-left text-[13.5px]',
                    !src.visible && 'text-text-3',
                  )}
                >
                  <span className="min-w-0 truncate font-medium">{src.name}</span>
                  <span className="hidden min-w-0 truncate font-mono text-[11.5px] text-text-3 sm:inline">
                    {src.kind}
                  </span>
                </button>
                <IconButton
                  size="sm"
                  label={src.visible ? `Hide ${src.name}` : `Show ${src.name}`}
                  disabled={busy !== null}
                  onClick={() => void act(src, src.visible ? 'hide' : 'show')}
                >
                  {src.visible ? <Eye size={15} /> : <EyeSlash size={15} />}
                </IconButton>
                <IconButton
                  size="sm"
                  label={`Fit ${src.name} to the screen`}
                  disabled={busy !== null}
                  onClick={() => void act(src, 'fit')}
                >
                  <ArrowsOut size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="hover:bg-danger-soft hover:text-danger"
                  label={`Remove ${src.name}`}
                  disabled={busy !== null}
                  onClick={() => setRemoving(src)}
                >
                  <Trash size={15} />
                </IconButton>
              </div>
              {open === src.name && (
                <div className="border-t border-line px-3 py-3">
                  <SourceSettings name={src.name} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={`Remove ${removing?.name ?? ''}?`}
        description="It goes from the scene with its settings."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy?.startsWith('remove:') ?? false}
              onClick={() => {
                const src = removing
                setRemoving(null)
                if (src) void act(src, 'remove')
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </Panel>
  )
}

/** A source's settings form, read from the source itself; Save sends only what changed. */
function SourceSettings({ name }: { name: string }) {
  const api = useEngine()
  const { busy, run } = useAction()
  const loaded = useResource(
    () => Promise.all([api.sourceOptions(name), api.settings(name)]),
    [api, name],
  )
  const [edits, setEdits] = useState<EngineSettings>({})
  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-32" />
  const [opts, settings] = loaded.data
  const values = { ...settings, ...edits }
  const changed = Object.keys(edits).length > 0
  const save = async () => {
    const ok = await run('save', () => done(api.update(name, edits)), { success: 'Saved.' })
    if (!ok) return
    setEdits({})
    // Some options show, hide or fill in from what's chosen.
    loaded.reload()
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <OptionsForm
        opts={opts}
        values={values}
        onChange={(k, v) => setEdits((p) => ({ ...p, [k]: v }))}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          busy={busy === 'save'}
          disabled={!changed}
        >
          Save
        </Button>
        {changed && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEdits({})}>
            Undo changes
          </Button>
        )}
      </div>
    </form>
  )
}

function KindsPanel({ onAdded }: { onAdded: () => void }) {
  const api = useEngine()
  const kinds = useResource(() => api.kinds(), [api])
  const [group, setGroup] = useState<'inputs' | 'filters' | 'transitions'>('inputs')
  const [picked, setPicked] = useState<EngineKind | null>(null)
  const [q, setQ] = useState('')
  const list: EngineKind[] = kinds.data?.[group] ?? []
  const shown = list.filter((k) =>
    `${k.name} ${k.id}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const counts = kinds.data
  return (
    <Panel
      title="Add a source"
      description="Every source OBS has, with every option. Filters and transitions are listed to browse."
    >
      {kinds.error && !counts ? (
        <LoadError error={kinds.error} onRetry={kinds.reload} />
      ) : !counts ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Field label="Kind">
              {(p) => (
                <Select
                  {...p}
                  value={group}
                  onChange={(e) => {
                    setGroup(e.target.value as typeof group)
                    setPicked(null)
                  }}
                >
                  <option value="inputs">Sources ({counts.inputs.length})</option>
                  <option value="filters">Filters ({counts.filters.length})</option>
                  <option value="transitions">Transitions ({counts.transitions.length})</option>
                </Select>
              )}
            </Field>
            <Field label="Search">
              {(p) => (
                <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
              )}
            </Field>
          </div>
          <ul
            className="max-h-56 overflow-y-auto rounded-control border border-line"
            aria-label="Kinds"
          >
            {shown.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  aria-current={picked?.id === k.id ? 'true' : undefined}
                  onClick={() => setPicked(k)}
                  className={cx(
                    'flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-surface-2',
                    picked?.id === k.id && 'bg-surface-3',
                  )}
                >
                  <span className="min-w-0 truncate">{k.name || k.id}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-text-3">{k.id}</span>
                </button>
              </li>
            ))}
          </ul>
          {picked && group === 'inputs' && (
            <NewSource
              key={picked.id}
              kind={picked}
              onAdded={() => {
                setPicked(null)
                onAdded()
              }}
            />
          )}
          {picked && group === 'filters' && <KindOptions kind={picked.id} />}
        </div>
      )}
    </Panel>
  )
}

/** A filter's options, to look at (filters go on sources in a later step). */
function KindOptions({ kind }: { kind: string }) {
  const api = useEngine()
  const opts = useResource(() => api.options(kind), [api, kind])
  if (opts.error && !opts.data) return <LoadError error={opts.error} onRetry={opts.reload} />
  if (!opts.data) return <Skeleton className="h-32" />
  return (
    <div className="border-t border-line pt-3">
      <OptionsForm opts={opts.data} values={{}} disabled />
    </div>
  )
}

/** Name it, change what you like from OBS's defaults, add it fitted to the screen. */
function NewSource({ kind, onAdded }: { kind: EngineKind; onAdded: () => void }) {
  const api = useEngine()
  const { busy, run } = useAction()
  const loaded = useResource(
    () => Promise.all([api.options(kind.id), api.defaults(kind.id)]),
    [api, kind.id],
  )
  const [name, setName] = useState(kind.name || kind.id)
  const [fit, setFit] = useState(true)
  // Only what was changed goes to OBS; it fills in the rest itself.
  const [edits, setEdits] = useState<EngineSettings>({})
  const add = async () => {
    const made = await run(
      'add',
      () => api.addSource({ kind: kind.id, name: name.trim(), settings: edits, fit }),
      { success: `Added ${name.trim()}.` },
    )
    if (made) onAdded()
  }
  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <Field label="Name">
        {(p) => (
          <Input
            {...p}
            value={name}
            maxLength={100}
            required
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      {loaded.error && !loaded.data ? (
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      ) : !loaded.data ? (
        <Skeleton className="h-32" />
      ) : (
        <OptionsForm
          opts={loaded.data[0]}
          values={{ ...loaded.data[1], ...edits }}
          onChange={(k, v) => setEdits((p) => ({ ...p, [k]: v }))}
        />
      )}
      <Switch label="Fit to the screen" checked={fit} onChange={setFit} />
      <Button
        type="submit"
        variant="primary"
        busy={busy === 'add'}
        disabled={!name.trim()}
        className="self-start"
      >
        Add {kind.name || kind.id}
      </Button>
    </form>
  )
}

interface FormProps {
  opts: EngineOption[]
  values: EngineSettings
  onChange?: ((key: string, value: unknown) => void) | undefined
  disabled?: boolean | undefined
}

/** One generic form for any kind: every option OBS describes, drawn from its type. */
function OptionsForm({ opts, values, onChange, disabled }: FormProps) {
  const shown = opts.filter((o) => o.visible)
  if (shown.length === 0) return <p className="text-[13px] text-text-3">No options.</p>
  return (
    <div className="flex flex-col gap-3">
      {shown.map((o) => (
        <OptionField key={o.key} o={o} values={values} onChange={onChange} disabled={disabled} />
      ))}
    </div>
  )
}

/** OBS keeps colours as 0xAABBGGRR. */
function toHex(v: unknown): string {
  const n = typeof v === 'number' ? v >>> 0 : 0
  const rgb = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function fromHex(hex: string, old: unknown): number {
  const alpha = typeof old === 'number' ? (old >>> 24) & 0xff : 0xff
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0
}

type Font = { face?: string; size?: number; style?: string; flags?: number }

function OptionField({
  o,
  values,
  onChange,
  disabled,
}: { o: EngineOption } & Omit<FormProps, 'opts'>) {
  const label = o.label || o.key
  const hint = o.help || undefined
  const off = disabled || !onChange || !o.enabled
  const v = values[o.key]
  const set = (next: unknown) => onChange?.(o.key, next)
  switch (o.kind) {
    case 'bool':
      return (
        <Switch
          label={label}
          {...(hint ? { description: hint } : {})}
          checked={v === true}
          onChange={set}
          disabled={off}
        />
      )
    case 'list': {
      const at = o.values.findIndex((x) => x === v)
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Select
              {...p}
              disabled={off}
              value={at < 0 ? '' : String(at)}
              onChange={(e) => set(o.values[Number(e.target.value)])}
            >
              {at < 0 && (
                <option value="">{o.choices.length ? 'Choose' : 'Nothing to choose'}</option>
              )}
              {o.choices.map((c, i) => (
                <option key={`${i}-${c}`} value={String(i)}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )
    }
    case 'group':
      return (
        <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold">{label}</legend>
          <OptionsForm opts={o.group} values={values} onChange={onChange} disabled={disabled} />
        </fieldset>
      )
    case 'button':
      return (
        <Button type="button" variant="secondary" disabled className="self-start">
          {label}
        </Button>
      )
    case 'int':
    case 'float':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode={o.kind === 'int' ? 'numeric' : 'decimal'}
              disabled={off}
              value={typeof v === 'number' ? v : ''}
              min={o.min ?? undefined}
              max={o.max ?? undefined}
              step={o.step ?? undefined}
              onChange={(e) => {
                const n = e.target.valueAsNumber
                if (Number.isFinite(n)) set(o.kind === 'int' ? Math.round(n) : n)
              }}
            />
          )}
        </Field>
      )
    case 'color':
    case 'color_alpha':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              type="color"
              disabled={off}
              value={toHex(v)}
              onChange={(e) => set(fromHex(e.target.value, v))}
              className="w-20! p-1"
            />
          )}
        </Field>
      )
    case 'font': {
      const font: Font = v && typeof v === 'object' ? (v as Font) : {}
      return (
        <fieldset className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <legend className="sr-only">{label}</legend>
          <Field label={`${label}: face`}>
            {(p) => (
              <Input
                {...p}
                disabled={off}
                value={font.face ?? ''}
                autoComplete="off"
                onChange={(e) => set({ ...font, face: e.target.value })}
              />
            )}
          </Field>
          <Field label="Size">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                disabled={off}
                value={font.size ?? ''}
                onChange={(e) => {
                  const n = e.target.valueAsNumber
                  if (Number.isFinite(n) && n > 0) set({ ...font, size: Math.round(n) })
                }}
              />
            )}
          </Field>
        </fieldset>
      )
    }
    case 'text':
    case 'path':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              disabled={off}
              value={typeof v === 'string' ? v : ''}
              autoComplete="off"
              spellCheck={o.kind === 'text'}
              placeholder={o.kind === 'path' ? 'A file on this computer' : undefined}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </Field>
      )
    default:
      // editable_list, frame_rate and the rest: shown, edited in a later step.
      return (
        <Field label={label} hint="Not editable here yet." hintVisible={false}>
          {(p) => <Input {...p} disabled value={v === undefined ? '' : JSON.stringify(v)} />}
        </Field>
      )
  }
}
