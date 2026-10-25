// Studio › Without OBS (2.1 preview, Track B): OBS's own engine run by Ferrocast. Start it,
// see its live picture (a native view the app draws over this page's box), and browse every
// kind of source and filter with every option, read live from OBS's plugins.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Stop } from '@phosphor-icons/react'
import {
  describeError,
  studioEngineApi,
  type EngineKind,
  type EngineOption,
  type PreviewRect,
  type StudioEngineStatus,
} from '@ferrocast/api'
import { Badge, Button, Field, Input, Select, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useClient, useResource } from '../../lib/hooks'
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
      {s.running && <KindsPanel />}
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
      const covered = !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')
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
    mo.observe(document.body, { childList: true, subtree: true })
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

function KindsPanel() {
  const api = useEngine()
  const kinds = useResource(() => api.kinds(), [api])
  const [group, setGroup] = useState<'inputs' | 'filters' | 'transitions'>('inputs')
  const [picked, setPicked] = useState<string>('')
  const [q, setQ] = useState('')
  const list: EngineKind[] = kinds.data?.[group] ?? []
  const shown = list.filter((k) =>
    `${k.name} ${k.id}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const counts = kinds.data
  return (
    <Panel
      title="Everything OBS can add"
      description="Every source, filter and transition the engine has, with every option, read live from OBS's plugins."
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
                    setPicked('')
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
                  aria-current={picked === k.id ? 'true' : undefined}
                  onClick={() => setPicked(k.id)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-surface-2 ${picked === k.id ? 'bg-surface-3' : ''}`}
                >
                  <span className="min-w-0 truncate">{k.name || k.id}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-text-3">{k.id}</span>
                </button>
              </li>
            ))}
          </ul>
          {picked && group !== 'transitions' && <OptionsForm kind={picked} />}
        </div>
      )}
    </Panel>
  )
}

/** One generic form for any kind: every option OBS describes, drawn from its type. */
function OptionsForm({ kind }: { kind: string }) {
  const api = useEngine()
  const opts = useResource(() => api.options(kind), [api, kind])
  if (opts.error && !opts.data) return <LoadError error={opts.error} onRetry={opts.reload} />
  if (!opts.data) return <Skeleton className="h-32" />
  if (opts.data.length === 0) return <p className="text-[13px] text-text-3">No options.</p>
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {opts.data
        .filter((o) => o.visible)
        .map((o) => (
          <OptionField key={o.key} o={o} />
        ))}
    </div>
  )
}

function OptionField({ o }: { o: EngineOption }) {
  const label = o.label || o.key
  const hint = o.help || undefined
  switch (o.kind) {
    case 'bool':
      return (
        <Switch
          label={label}
          {...(hint ? { description: hint } : {})}
          checked={false}
          onChange={() => undefined}
          disabled={!o.enabled}
        />
      )
    case 'list':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Select {...p} disabled={!o.enabled} defaultValue="">
              {o.choices.length === 0 && <option value="">(chosen when added)</option>}
              {o.choices.map((c, i) => (
                <option key={`${i}-${c}`}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      )
    case 'group':
      return (
        <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold">{label}</legend>
          {o.group
            .filter((g) => g.visible)
            .map((g) => (
              <OptionField key={g.key} o={g} />
            ))}
        </fieldset>
      )
    case 'button':
      return (
        <Button variant="secondary" disabled className="self-start">
          {label}
        </Button>
      )
    default:
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              disabled={!o.enabled}
              type={
                o.kind === 'int' || o.kind === 'float'
                  ? 'number'
                  : o.kind === 'color' || o.kind === 'color_alpha'
                    ? 'color'
                    : 'text'
              }
              min={o.min ?? undefined}
              max={o.max ?? undefined}
              step={o.step ?? undefined}
              placeholder={
                o.kind === 'path'
                  ? 'A file on this computer'
                  : o.kind === 'font'
                    ? 'Font'
                    : undefined
              }
            />
          )}
        </Field>
      )
  }
}
