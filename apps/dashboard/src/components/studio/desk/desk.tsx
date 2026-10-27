// Studio › Go live with Ferrocast's own picture (2.1): OBS's engine run by Ferrocast, laid out
// like OBS (preview, Scenes, Sources, Audio) with the platforms beside it, and one button to
// go live everywhere.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  Broadcast,
  CheckSquare,
  DotsThree,
  FilmSlate,
  GearSix,
  Layout as LayoutIcon,
  LockSimple,
  LockSimpleOpen,
  Pause,
  Play,
  Plus,
  Power,
  Record as RecordIcon,
  ClockCounterClockwise,
  Scissors,
  VideoCamera,
  Square,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  goingTo,
  onCanvas,
  type EngineStats,
  type GoLiveView,
  type StudioEngineStatus,
  type StudioSettings,
} from '@ferrocast/api'
import { Button, Dialog, IconButton, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useAction, useResource, type Resource } from '../../../lib/hooks'
import { useWidePage } from '../../../lib/wide'
import { AddSourceDialog } from './add-source'
import { FileDrop } from './file-drop'
import { DeskProvider, useDesk, useEngine, type Desk } from './common'
import { GoLiveDock } from './golive-dock'
import {
  BUILT_INS,
  DockWorkspace,
  dockName,
  fromPreset,
  isWeb,
  placed,
  toggle as toggleDock,
  useLayout,
  type DockId,
  type Preset,
} from './layout'
import { ChatDock, EventsDock } from './chat-dock'
import { WebDockDialog, WebDockSlot } from './web-dock'
import { AudioDock } from './mixer'
import { PreviewBox, StageBar, StageOff } from './preview'
import { ScenesDock } from './scenes'
import { SettingsDialog, type Page } from './settings'
import { SourcePanel } from './source-panel'
import { LibraryBar } from './library'
import { useContextMenu } from './menu'
import { clock } from './stats-panel'
import { resetUploadRate, useEngineReading } from '../../../lib/engine-stats'
import { MissingFiles } from './missing-files'
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
  // The scene the panels edit: Studio Mode's preview, else the one on air.
  const scene = scenes.data?.preview ?? scenes.data?.current ?? ''
  const items = useResource(() => (scene ? api.items(scene) : Promise.resolve([])), [api, scene])
  const audio = useResource(() => (scene ? api.audio(scene) : Promise.resolve([])), [api, scene])
  const kinds = useResource(() => api.kinds(), [api])
  const prefs = useResource(() => api.studioSettings(), [api])
  // Projectors are the app's own windows: no displays to offer in a plain browser.
  const screens = useResource(() => (inDesktopApp() ? api.screens() : Promise.resolve([])), [api])
  const [picked, setPicked] = useState<{ id: number | null; also: number[] }>({
    id: null,
    also: [],
  })
  const selected = picked.id
  const select = useCallback((id: number | null) => setPicked({ id, also: [] }), [])
  const pickMore = useCallback(
    (id: number, how: 'toggle' | 'range', order: number[] = []) =>
      setPicked((p) => {
        if (p.id === null) return { id, also: [] }
        if (how === 'range') {
          const a = order.indexOf(p.id)
          const b = order.indexOf(id)
          if (a < 0 || b < 0) return { id, also: [] }
          const span = order.slice(Math.min(a, b), Math.max(a, b) + 1)
          return { id: p.id, also: span.filter((x) => x !== p.id) }
        }
        if (id === p.id) {
          // The main pick goes: the next one takes its place.
          const [next = null, ...rest] = p.also
          return { id: next, also: rest }
        }
        return p.also.includes(id)
          ? { id: p.id, also: p.also.filter((x) => x !== id) }
          : { id: p.id, also: [...p.also, id] }
      }),
    [],
  )
  const [editing, edit] = useState<string | null>(null)
  const itemMenu = useRef<((e: React.MouseEvent, id: number | null) => void) | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [stats, setStats] = useState<EngineStats | null>(null)
  // The engine's stats, read once a second for the whole window (the status bar along the
  // bottom reads the same); actions here update them at once, the next read takes over.
  const reading = useEngineReading(api.stats)
  useEffect(() => {
    if (reading.stats) setStats(reading.stats)
  }, [reading.stats])
  const [settingsAt, setSettingsAt] = useState<Page | null>(null)
  const [clip, setClip] = useState<string | null>(null)
  const [filterClip, setFilterClip] = useState<string | null>(null)
  const [transforming, setTransforming] = useState<Desk['transforming']>(null)
  const [library, setLibrary] = useState(0)
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
  useEffect(() => select(null), [scene, select])
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
  const shownOnAir = scenes.data?.current
  useEffect(() => {
    if (onAir && shownOnAir && onAir !== shownOnAir) refresh()
  }, [onAir, shownOnAir, refresh])
  const desk: Desk = {
    api,
    scenes,
    scene,
    items,
    audio,
    kinds,
    prefs,
    refresh,
    selected,
    select,
    also: picked.also,
    pickMore,
    itemMenu,
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
    library,
    bumpLibrary: () => setLibrary((n) => n + 1),
    transformClip,
    setTransformClip,
    openSettings: (page) => setSettingsAt((page as Page | undefined) ?? 'stream'),
  }
  const docks = (id: DockId): React.ReactNode => {
    if (isWeb(id)) return <WebDockSlot id={id} />
    return {
      scenes: <ScenesDock />,
      sources: <SourcesDock />,
      audio: <AudioDock />,
      golive: <GoLiveDock res={res} view={view} />,
      chat: <ChatDock />,
      events: <EventsDock />,
    }[id]
  }
  return (
    <DeskProvider value={desk}>
      <DockWorkspace
        top={
          <>
            <ControlBar view={view} lead={lead} onStatus={onStatus} />
            <MissingFiles />
          </>
        }
        stage={
          <>
            <PreviewBox running />
            <StageBar />
          </>
        }
        docks={docks}
      />
      <AddSourceDialog />
      <FileDrop />
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

/**
 * Whether pressing the stream or record button (`on`: running now) asks first, by the General
 * settings: ending the stream does unless switched off, as in OBS.
 */
export function asksFirst(
  what: 'stream' | 'record',
  on: boolean,
  p: StudioSettings | null | undefined,
): 'live' | 'end' | 'record' | null {
  if (what === 'record') return on && p?.confirm_stop_record ? 'record' : null
  if (on) return (p?.confirm_end_stream ?? true) ? 'end' : null
  return p?.confirm_go_live ? 'live' : null
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
  const { stats, setStats, openSettings, prefs } = useDesk()
  const { busy, run } = useAction()
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
    const ending = on
    if (v?.also)
      toast({
        tone: 'warn',
        message: ending
          ? 'Ended, but not everything stopped.'
          : 'Live, but not everything started.',
        hint: v.also,
      })
    if (v !== undefined) {
      resetUploadRate()
      // Shown at once, not on the next read (ending answers with no stream).
      if (stats) setStats({ ...stats, stream: ending ? null : v })
    }
  }
  const record = async () => {
    const v = await run('record', () => api.record(!recording), {
      success: () => (recording ? 'Recording saved.' : null),
    })
    if (v !== undefined && stats) setStats({ ...stats, record: v })
  }
  // OBS's General › "Show confirmation dialog when…": ending is asked by default.
  const [ask, setAsk] = useState<'live' | 'end' | 'record' | null>(null)
  const pressStream = () => {
    const a = asksFirst('stream', on, prefs.data)
    if (a) setAsk(a)
    else void toggle()
  }
  const pressRecord = () => {
    const a = asksFirst('record', recording, prefs.data)
    if (a) setAsk(a)
    else void record()
  }
  const confirmed = () => {
    // The stream or recording may have changed while the dialog was open: then do nothing.
    const stale =
      (ask === 'end' && !on) || (ask === 'live' && on) || (ask === 'record' && !recording)
    if (stale) {
      setAsk(null)
      return
    }
    const go = ask === 'record' ? record() : toggle()
    void go.finally(() => setAsk(null))
  }
  const ASK = {
    live: {
      title: 'Go live now?',
      text: `${goingTo(ticked)}.`,
      keep: 'Not yet',
      yes: 'Go live',
      key: 'stream',
    },
    end: {
      title: 'End the stream?',
      text: 'It ends for everyone watching.',
      keep: 'Keep streaming',
      yes: 'End stream',
      key: 'stream',
    },
    record: {
      title: 'Stop recording?',
      text: 'The file is saved and closed.',
      keep: 'Keep recording',
      yes: 'Stop recording',
      key: 'record',
    },
  } as const
  const asked = ask ? ASK[ask] : null
  const pause = () => void run('pause', () => api.pauseRecord(!rec?.paused))
  const { open: openMenu, menu } = useContextMenu()
  const recordMenu = (e: React.MouseEvent) =>
    openMenu(e, 'Recording', [
      {
        label: 'Add a chapter here',
        icon: FilmSlate,
        // Only MP4 and MOV keep chapters.
        disabled: !/\.(mp4|mov)$/i.test(rec?.file ?? ''),
        onSelect: () =>
          void run('chapter', () => api.recordChapter(), { success: 'Chapter marked.' }),
      },
      {
        label: 'Start a new file now',
        icon: Scissors,
        onSelect: () =>
          void run('split', () => api.recordSplit(), {
            success: 'The recording goes on in a new file.',
          }),
      },
    ])
  const replayOn = !!stats?.replay?.active
  const camOn = !!stats?.virtualcam?.active
  const outputsMenu = (e: React.MouseEvent) =>
    openMenu(e, 'More outputs', [
      {
        label: 'Replay buffer',
        icon: ClockCounterClockwise,
        checked: replayOn,
        onSelect: () =>
          void run('replay', () => api.replay(!replayOn), {
            success: replayOn
              ? 'Replay buffer off.'
              : 'Replay buffer on: it keeps the last seconds.',
          }),
      },
      {
        label: 'Virtual camera',
        icon: VideoCamera,
        checked: camOn,
        onSelect: () =>
          void run('virtualcam', () => api.virtualCamera(!camOn), {
            success: camOn ? 'Virtual camera off.' : 'Virtual camera on: other apps can pick it.',
          }),
      },
    ])
  const saveReplay = () =>
    void run('save-replay', () => api.saveReplay(), {
      success: 'Replay saved with your recordings.',
    })
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {lead}
        <LibraryBar />
      </div>
      {/* Health and the actions stay together: short of room they move down as one, so Go
          live never ends up on a line of its own. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
        {stream?.error && !stream.active && (
          <span className="text-[14px] font-semibold text-danger" aria-live="polite">
            {stream.error}
          </span>
        )}
        {/* Settings, the layout and the extra outputs: one quiet group of icons. */}
        <div
          role="group"
          aria-label="Studio tools"
          className="flex h-10 items-stretch divide-x divide-line rounded-control border border-line bg-surface-1"
        >
          <button
            type="button"
            aria-label="Studio settings"
            title="Studio settings"
            className={cx(TOOL, 'rounded-l-[inherit]')}
            onClick={() => openSettings()}
          >
            <GearSix size={18} />
          </button>
          <LayoutMenu onStatus={onStatus} />
          <button
            type="button"
            aria-label="Replay buffer and virtual camera"
            title="Replay buffer and virtual camera"
            aria-pressed={replayOn || camOn}
            className={cx(TOOL, 'rounded-r-[inherit]', (replayOn || camOn) && 'text-accent-text')}
            onClick={outputsMenu}
          >
            <VideoCamera size={18} weight={replayOn || camOn ? 'fill' : 'regular'} />
          </button>
        </div>
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
        {replayOn && (
          <Button
            variant="secondary"
            className="h-10"
            busy={busy === 'save-replay'}
            onClick={saveReplay}
          >
            <ClockCounterClockwise size={15} weight="bold" />
            <span className="hidden sm:inline">Save replay</span>
          </Button>
        )}
        {recording && (
          <IconButton
            label="Chapter or a new file"
            className="h-10! w-10!"
            variant="ghost"
            onClick={recordMenu}
          >
            <DotsThree size={18} weight="bold" />
          </IconButton>
        )}
        {menu}
        <Button
          variant="secondary"
          className={cx('h-10', recording && 'text-danger')}
          busy={busy === 'record'}
          onClick={pressRecord}
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
          className="h-10 px-5 text-[16px]"
          busy={busy === 'stream'}
          disabled={!on && ticked.length === 0}
          title={!on && ticked.length === 0 ? 'Switch on a platform under Go live to.' : undefined}
          onClick={pressStream}
        >
          {on ? <X size={16} weight="bold" /> : <Broadcast size={17} weight="fill" />}
          {on ? (stream?.active ? 'End stream' : 'Starting…') : 'Go live'}
        </Button>
        <Dialog
          open={!!asked}
          onClose={() => setAsk(null)}
          title={asked?.title ?? ''}
          description={asked?.text}
          footer={
            asked && (
              <>
                <Button variant="ghost" onClick={() => setAsk(null)}>
                  {asked.keep}
                </Button>
                <Button
                  variant={ask === 'live' ? 'primary' : 'danger'}
                  busy={busy === asked.key}
                  onClick={confirmed}
                >
                  {asked.yes}
                </Button>
              </>
            )
          }
        />
      </div>
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
/** An icon in the desk's tool group: square, no frame of its own (the group has it). */
const TOOL =
  'grid h-full w-10 place-items-center text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:relative focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'

function LayoutMenu({ onStatus }: { onStatus: (s: StudioEngineStatus) => void }) {
  const api = useEngine()
  const { layout, setLayout } = useLayout()
  const [open, setOpen] = useState(false)
  const [addingWeb, setAddingWeb] = useState(false)
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
    'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14.5px] hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none'
  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        aria-label="Layout"
        title="Layout"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(TOOL, open && 'bg-surface-3 text-text')}
      >
        <LayoutIcon size={18} />
      </button>
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
          <span className="px-2.5 pt-1.5 pb-1 text-[12.5px] font-bold text-text-3">Layout</span>
          <div className="grid grid-cols-3 gap-1.5 p-1">
            {(Object.keys(PRESET_NAMES) as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                role="menuitemradio"
                aria-checked={layout.preset === p}
                onClick={() => setLayout((l) => fromPreset(l, p))}
                className={cx(
                  'flex flex-col items-center gap-1.5 rounded-[8px] border border-line px-1 pt-2 pb-1.5 text-[13px] hover:bg-surface-3',
                  layout.preset === p && 'fc-picked border-transparent',
                )}
              >
                <Mini p={p} />
                {PRESET_NAMES[p]}
              </button>
            ))}
          </div>
          <hr className="mx-1 my-1 border-line" />
          <span className="px-2.5 pt-1 pb-1 text-[12.5px] font-bold text-text-3">Panels</span>
          {[...BUILT_INS, ...layout.webs.map((d) => d.id)].map((id: DockId) => {
            const shown = placed(layout, id) && !layout.hidden.includes(id)
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={shown}
                className={item}
                onClick={() => setLayout((l) => toggleDock(l, id))}
              >
                {shown ? (
                  <CheckSquare size={17} weight="fill" className="text-accent-text" aria-hidden />
                ) : (
                  <Square size={17} className="text-text-3" aria-hidden />
                )}
                <span className="truncate">{dockName(layout, id)}</span>
              </button>
            )
          })}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              setAddingWeb(true)
            }}
          >
            <Plus size={17} aria-hidden /> Add a web panel…
          </button>
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
            onClick={() => setLayout((l) => ({ ...fromPreset(l, 'side'), locked: false }))}
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
      <WebDockDialog open={addingWeb} onClose={() => setAddingWeb(false)} />
    </div>
  )
}
