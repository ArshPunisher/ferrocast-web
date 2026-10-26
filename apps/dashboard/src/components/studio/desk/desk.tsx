// Studio › Go live with Ferrocast's own picture (2.1): OBS's engine run by Ferrocast, laid out
// like OBS (preview, Scenes, Sources, Audio) with the platforms beside it, and one button to
// go live everywhere.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  Broadcast,
  CheckSquare,
  Clock,
  Cpu,
  Gauge,
  GearSix,
  Layout as LayoutIcon,
  LockSimple,
  LockSimpleOpen,
  Pause,
  Play,
  Power,
  Record as RecordIcon,
  Square,
  WifiHigh,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  onCanvas,
  type EngineStats,
  type GoLiveView,
  type StudioEngineStatus,
} from '@ferrocast/api'
import { Button, IconButton, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useAction, useResource, type Resource } from '../../../lib/hooks'
import { useWidePage } from '../../../lib/wide'
import { AddSourceDialog } from './add-source'
import { DeskProvider, useDesk, useEngine, type Desk } from './common'
import { GoLiveDock } from './golive-dock'
import { DOCK_NAMES, DockWorkspace, fresh, useLayout, type DockId, type Preset } from './layout'
import { AudioDock } from './mixer'
import { PreviewBox, StageBar, StageOff } from './preview'
import { ScenesDock } from './scenes'
import { SettingsDialog, type Page } from './settings'
import { SourcePanel } from './source-panel'
import { SourcesDock } from './sources'
import { TransformDialog } from './transform'

export function StudioDesk({
  res,
  view,
  lead,
}: {
  res: Resource<GoLiveView>
  view: GoLiveView | null
  /** Goes first in the bar above (the Ferrocast / OBS switch). */
  lead?: React.ReactNode
}) {
  const api = useEngine()
  useWidePage()
  const status = useResource(() => api.status(), [api])
  const s = status.data
  const start = useCallback(async () => {
    try {
      status.set(await api.start())
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
      status.reload()
    }
  }, [api, status])
  // Off: checked again every 3 s, so a start from elsewhere (a shortcut, another screen)
  // shows here too.
  const off = !!s && !s.running
  const reloadStatus = status.reload
  useEffect(() => {
    if (!off) return
    const t = setInterval(reloadStatus, 3000)
    return () => clearInterval(t)
  }, [off, reloadStatus])
  if (status.error && !s) return <LoadError error={status.error} onRetry={status.reload} />
  if (!s) return <Skeleton className="h-[560px]" />
  if (!s.running)
    return (
      <>
        {lead && <div className="mb-3 flex">{lead}</div>}
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-panel border border-line">
          <StageOff available={s.available} detail={s.detail} onStart={start} />
        </div>
      </>
    )
  return <Running res={res} view={view} lead={lead} onStatus={status.set} />
}

function Running({
  res,
  view,
  lead,
  onStatus,
}: {
  res: Resource<GoLiveView>
  view: GoLiveView | null
  lead?: React.ReactNode
  onStatus: (s: StudioEngineStatus) => void
}) {
  const api = useEngine()
  const scenes = useResource(() => api.scenes(), [api])
  const scene = scenes.data?.current ?? ''
  const items = useResource(() => (scene ? api.items(scene) : Promise.resolve([])), [api, scene])
  const audio = useResource(() => (scene ? api.audio(scene) : Promise.resolve([])), [api, scene])
  const kinds = useResource(() => api.kinds(), [api])
  // Projectors are the app's own windows: no displays to offer in a plain browser.
  const screens = useResource(() => (inDesktopApp() ? api.screens() : Promise.resolve([])), [api])
  const [selected, select] = useState<number | null>(null)
  const [editing, edit] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [stats, setStats] = useState<EngineStats | null>(null)
  const [settingsAt, setSettingsAt] = useState<Page | null>(null)
  const [clip, setClip] = useState<string | null>(null)
  const [filterClip, setFilterClip] = useState<string | null>(null)
  const [transforming, setTransforming] = useState<Desk['transforming']>(null)
  const [transformClip, setTransformClip] = useState<Desk['transformClip']>(null)
  const reloadScenes = scenes.reload
  const reloadItems = items.reload
  const reloadAudio = audio.reload
  const refresh = useCallback(() => {
    reloadScenes()
    reloadItems()
    reloadAudio()
  }, [reloadScenes, reloadItems, reloadAudio])
  // Another scene: nothing picked in it yet.
  useEffect(() => select(null), [scene])
  // ⌘Z and ⇧⌘Z (Ctrl on Windows) undo and redo changes to sources, outside text fields.
  const { run: runUndo } = useAction()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return
      e.preventDefault()
      const redo = e.shiftKey
      void runUndo('undo', () => (redo ? api.redo() : api.undo()), {
        success: (r) => (r.done ? `${redo ? 'Redone' : 'Undone'}: ${r.done}` : null),
      }).then((r) => r && refresh())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, refresh, runUndo])
  // A switch made elsewhere (a shortcut, a click in a multiview) shows up in the stats first.
  const onAir = stats?.scene
  useEffect(() => {
    if (onAir && scene && onAir !== scene) refresh()
  }, [onAir, scene, refresh])
  const desk: Desk = {
    api,
    scenes,
    scene,
    items,
    audio,
    kinds,
    refresh,
    selected,
    select,
    editing,
    edit,
    adding,
    setAdding,
    stats,
    setStats,
    clip,
    setClip,
    filterClip,
    setFilterClip,
    screens,
    transforming,
    setTransforming,
    transformClip,
    setTransformClip,
    openSettings: (page) => setSettingsAt((page as Page | undefined) ?? 'stream'),
  }
  const docks: Record<DockId, React.ReactNode> = {
    scenes: <ScenesDock />,
    sources: <SourcesDock />,
    audio: <AudioDock />,
    golive: <GoLiveDock res={res} view={view} />,
  }
  return (
    <DeskProvider value={desk}>
      <DockWorkspace
        top={<ControlBar view={view} lead={lead} onStatus={onStatus} />}
        stage={
          <>
            <PreviewBox running />
            <StageBar />
          </>
        }
        docks={docks}
      />
      <AddSourceDialog />
      <SettingsDialog
        open={settingsAt !== null}
        start={settingsAt ?? undefined}
        onClose={() => setSettingsAt(null)}
      />
      <SourcePanel />
      <TransformDialog
        target={transforming}
        onClose={() => {
          setTransforming(null)
          reloadItems()
        }}
      />
    </DeskProvider>
  )
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [s / 3600, (s / 60) % 60, s % 60]
    .map((n) => String(Math.floor(n)).padStart(2, '0'))
    .join(':')
}

/** The stream's health, the Layout menu, and Go live. */
function ControlBar({
  view,
  lead,
  onStatus,
}: {
  view: GoLiveView | null
  lead?: React.ReactNode
  onStatus: (s: StudioEngineStatus) => void
}) {
  const api = useEngine()
  const { stats, setStats, openSettings } = useDesk()
  const { busy, run } = useAction()
  const last = useRef<{ bytes: number; at: number } | null>(null)
  const [kbps, setKbps] = useState<number | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  // One read a second: the engine, the stream and the recording.
  useEffect(() => {
    let alive = true
    const read = async () => {
      try {
        const v = await api.stats()
        if (!alive) return
        setStats(v)
        const t = Date.now()
        setNow(t)
        const st = v.stream
        if (st && last.current && t > last.current.at) {
          setKbps(Math.round(((st.bytes - last.current.bytes) * 8) / (t - last.current.at)))
        } else if (!st) setKbps(null)
        last.current = st ? { bytes: st.bytes, at: t } : null
        setSince((x) => (st?.active ? (x ?? t) : null))
      } catch {
        // The next read tries again.
      }
    }
    void read()
    const t = setInterval(() => void read(), 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, setStats])
  const stream = stats?.stream ?? null
  const rec = stats?.record ?? null
  // A stream exists until stopped; while connecting it isn't active yet but is on.
  const on = !!stream && (stream.active || stream.reconnecting || !stream.error)
  const recording = !!rec?.active
  const ticked = view ? onCanvas(view.destinations, 'main').filter((d) => d.enabled) : []
  const toggle = async () => {
    const v = await run('stream', () => api.stream(!on), {
      success: () => (on ? 'Stream ended.' : null),
    })
    if (v !== undefined) {
      last.current = null
      setKbps(null)
      // Shown at once, not on the next read.
      if (stats) setStats({ ...stats, stream: v })
    }
  }
  const record = async () => {
    const v = await run('record', () => api.record(!recording), {
      success: () => (recording ? 'Recording saved.' : null),
    })
    if (v !== undefined && stats) setStats({ ...stats, record: v })
  }
  const pause = () => void run('pause', () => api.pauseRecord(!rec?.paused))
  const cpu = stats?.engine.cpu
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      {lead}
      <span className="hidden flex-1 xl:block" />
      <div
        aria-label="Stream health"
        className="flex h-10 items-center gap-4 rounded-control border border-line bg-surface-1 px-3.5 text-[12.5px] text-text-3"
      >
        <span className="inline-flex items-center gap-1.5" title="Ferrocast's CPU use">
          <Cpu size={15} aria-hidden />
          <span className="hidden md:inline">CPU</span>
          <b className="font-mono font-semibold text-text tabular-nums">
            {cpu === undefined ? '…' : `${cpu.toFixed(0)}%`}
          </b>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Frames dropped">
          <WifiHigh size={15} aria-hidden />
          <span className="hidden md:inline">Dropped</span>
          <b className="font-mono font-semibold text-text tabular-nums">{stream?.dropped ?? 0}</b>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Upload">
          <Gauge size={15} aria-hidden />
          <span className="hidden md:inline">Upload</span>
          <b className="font-mono font-semibold text-text tabular-nums">
            {kbps === null ? '0.0' : (kbps / 1000).toFixed(1)}&nbsp;Mbps
          </b>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Time live">
          <Clock size={15} aria-hidden />
          <b className="font-mono font-semibold text-text tabular-nums">
            {clock(since ? now - since : 0)}
          </b>
        </span>
      </div>
      {stream?.reconnecting && (
        <span className="text-[13px] font-semibold text-warn" aria-live="polite">
          Reconnecting…
        </span>
      )}
      {stream?.error && !stream.active && (
        <span className="text-[13px] font-semibold text-danger" aria-live="polite">
          {stream.error}
        </span>
      )}
      <span className="flex-1 xl:hidden" />
      <IconButton
        label="Studio settings"
        className="h-10! w-10!"
        variant="ghost"
        onClick={() => openSettings()}
      >
        <GearSix size={18} />
      </IconButton>
      <LayoutMenu onStatus={onStatus} />
      {recording && (
        <Button
          variant="secondary"
          className="h-10"
          busy={busy === 'pause'}
          onClick={pause}
          aria-pressed={!!rec?.paused}
        >
          {rec?.paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
          <span className="hidden sm:inline">{rec?.paused ? 'Resume' : 'Pause'}</span>
        </Button>
      )}
      <Button
        variant="secondary"
        className={cx('h-10', recording && 'text-danger')}
        busy={busy === 'record'}
        onClick={() => void record()}
        title={rec?.file}
      >
        {recording ? (
          <span aria-hidden className="size-2.5 rounded-full bg-danger-fill" />
        ) : (
          <RecordIcon size={16} weight="fill" />
        )}
        {recording
          ? // Time recorded (frames over the frame rate): pauses don't count.
            `Stop ${clock(((rec?.frames ?? 0) / (stats?.canvas.fps || 30)) * 1000).replace(/^00:/, '')}`
          : 'Record'}
      </Button>
      <Button
        variant={on ? 'danger' : 'primary'}
        className="h-10 px-5 text-[15px]"
        busy={busy === 'stream'}
        disabled={!on && ticked.length === 0}
        title={!on && ticked.length === 0 ? 'Switch on a platform under Go live to.' : undefined}
        onClick={() => void toggle()}
      >
        {on ? <X size={16} weight="bold" /> : <Broadcast size={17} weight="fill" />}
        {on ? (stream?.active ? 'End stream' : 'Starting…') : 'Go live'}
      </Button>
    </div>
  )
}

const PRESET_NAMES: Record<Preset, string> = {
  classic: 'Classic',
  side: 'Side',
  wide: 'Wide preview',
}

/** A small drawing of each preset (neutral blocks, the preview in Arc). */
function Mini({ p }: { p: Preset }) {
  const c = 'fill-line-strong'
  const a = 'fill-arc opacity-60'
  return (
    <svg viewBox="0 0 54 36" className="h-9 w-[54px]" aria-hidden>
      {p === 'classic' && (
        <>
          <rect width="40" height="22" rx="2" className={a} />
          <rect x="42" width="12" height="36" rx="2" className={c} />
          <rect y="24" width="12" height="12" rx="2" className={c} />
          <rect x="14" y="24" width="12" height="12" rx="2" className={c} />
          <rect x="28" y="24" width="12" height="12" rx="2" className={c} />
        </>
      )}
      {p === 'side' && (
        <>
          <rect width="12" height="17" rx="2" className={c} />
          <rect y="19" width="12" height="17" rx="2" className={c} />
          <rect x="14" width="26" height="24" rx="2" className={a} />
          <rect x="14" y="26" width="26" height="10" rx="2" className={c} />
          <rect x="42" width="12" height="36" rx="2" className={c} />
        </>
      )}
      {p === 'wide' && (
        <>
          <rect width="14" height="11" rx="2" className={c} />
          <rect y="12.5" width="14" height="11" rx="2" className={c} />
          <rect y="25" width="14" height="11" rx="2" className={c} />
          <rect x="16" width="38" height="36" rx="2" className={a} />
        </>
      )}
    </svg>
  )
}

/** Presets, which panels show, lock, reset, and turning the Studio off. */
function LayoutMenu({ onStatus }: { onStatus: (s: StudioEngineStatus) => void }) {
  const api = useEngine()
  const { layout, setLayout } = useLayout()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node))
        setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    menu.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const stop = async () => {
    setOpen(false)
    try {
      onStatus(await api.stop())
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    }
  }
  const item =
    'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none'
  return (
    <div className="relative">
      <Button
        ref={btn}
        variant="secondary"
        className="h-10"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LayoutIcon size={16} /> <span className="hidden sm:inline">Layout</span>
      </Button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Layout"
          className="absolute right-0 z-50 mt-1.5 flex w-[264px] flex-col gap-px rounded-control border border-line-strong bg-surface-2 p-1.5 shadow-pop"
          onKeyDown={(e) => {
            const items = [
              ...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
            ]
            const i = items.indexOf(document.activeElement as HTMLElement)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              items[(i + 1) % items.length]?.focus()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              items[(i - 1 + items.length) % items.length]?.focus()
            }
          }}
        >
          <span className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-bold text-text-3">Layout</span>
          <div className="grid grid-cols-3 gap-1.5 p-1">
            {(Object.keys(PRESET_NAMES) as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={layout.preset === p}
                onClick={() => setLayout((l) => ({ ...fresh(p), locked: l.locked, mob: l.mob }))}
                className={cx(
                  'flex flex-col items-center gap-1.5 rounded-[8px] border border-line px-1 pt-2 pb-1.5 text-[12px] hover:bg-surface-3',
                  layout.preset === p && 'border-arc bg-accent-soft text-accent-text',
                )}
              >
                <Mini p={p} />
                {PRESET_NAMES[p]}
              </button>
            ))}
          </div>
          <hr className="mx-1 my-1 border-line" />
          <span className="px-2.5 pt-1 pb-1 text-[11.5px] font-bold text-text-3">Panels</span>
          {(Object.keys(DOCK_NAMES) as DockId[]).map((id) => {
            const shown = !layout.hidden.includes(id)
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={shown}
                className={item}
                onClick={() =>
                  setLayout((l) => {
                    if (!l.hidden.includes(id))
                      return { ...l, hidden: [...l.hidden, id], preset: null }
                    const n = { ...l, hidden: l.hidden.filter((x) => x !== id), preset: null }
                    const placed =
                      n.left.includes(id) ||
                      n.right.includes(id) ||
                      n.bottom.includes(id) ||
                      n.float[id]
                    return placed ? n : { ...n, bottom: [...n.bottom, id] }
                  })
                }
              >
                {shown ? (
                  <CheckSquare size={17} weight="fill" className="text-accent-text" aria-hidden />
                ) : (
                  <Square size={17} className="text-text-3" aria-hidden />
                )}
                {DOCK_NAMES[id]}
              </button>
            )
          })}
          <hr className="mx-1 my-1 border-line" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={layout.locked}
            className={item}
            onClick={() => setLayout((l) => ({ ...l, locked: !l.locked }))}
          >
            {layout.locked ? (
              <LockSimple size={17} aria-hidden />
            ) : (
              <LockSimpleOpen size={17} aria-hidden />
            )}
            {layout.locked ? 'Unlock layout' : 'Lock layout'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => setLayout((l) => ({ ...fresh('side'), mob: l.mob }))}
          >
            <ArrowCounterClockwise size={17} aria-hidden /> Reset layout
          </button>
          <hr className="mx-1 my-1 border-line" />
          <button
            type="button"
            role="menuitem"
            className={cx(item, 'text-danger')}
            onClick={() => void stop()}
          >
            <Power size={17} aria-hidden /> Turn the Studio off
          </button>
        </div>
      )}
    </div>
  )
}
