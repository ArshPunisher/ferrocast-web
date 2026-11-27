// Studio › Go live with Ferrocast's own picture (2.1): OBS's engine run by Ferrocast, laid out
// like OBS (preview, Scenes, Sources, Audio) with the platforms beside it, and one button to
// go live everywhere.

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowCounterClockwise,
  CheckSquare,
  DotsThree,
  FilmSlate,
  GearSix,
  Layout as LayoutIcon,
  LockSimple,
  LockSimpleOpen,
  Pause,
  Play,
  Stop,
  Plus,
  Power,
  AppWindow,
  ClockCounterClockwise,
  Scissors,
  ShareNetwork,
  VideoCamera,
  Square,
} from '@phosphor-icons/react'
import {
  describeError,
  goingTo,
  onCanvas,
  type EngineItem,
  type EngineScenes,
  type EngineStats,
  type GoLiveView,
  type StreamInfo,
  type EngineRecovered,
  type StudioEngineStatus,
  type StudioSettings,
  type StudioStartOptions,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  IconButton,
  InfoLine,
  InfoTip,
  PopoverSurface,
  Skeleton,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { os } from '../../../lib/os'
import { done, useAction, useMediaQuery, useResource, type Resource } from '../../../lib/hooks'
import { useLive } from '../../../lib/store'
import { useWidePage } from '../../../lib/wide'
import { go } from '../../../lib/router'
import { useStudio } from '../common'
import { useShow } from '../show'
import { styleOf } from '../show-style'
import { AddSourceDialog } from './add-source'
import { FileDrop } from './file-drop'
import {
  BarSlot,
  DeskProvider,
  createDeskStatsStore,
  useDesk,
  useDeskStats,
  useEngine,
  useSetDeskStats,
  type Desk,
  type DeskStatsStore,
  type DrawerTab,
  type EngineApi,
} from './common'
import { AutoConfigDialog, AutoConfigRollbackBar } from './auto-config'
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
import { PreviewBox, StageBar } from './preview'
import { DeskStandby } from './desk-standby'
import type { StartChoice, StartFailure } from './standby-model'
import { ScenesDock } from './scenes'
import { SettingsDialog, type Page } from './settings'
import { takePendingSettings } from '../../../lib/menu'
import { SourcePanel } from './source-panel'
import { useCountdownLeft, useEndingLeft } from './ending'
import { OnAirButton } from './onair'
import { LibraryBar } from './library'
import { useContextMenu } from './menu'
import { clock, streamTime } from './stats-panel'
import { resetUploadRate, useEngineReading } from '../../../lib/engine-stats'
import { MissingFiles } from './missing-files'
import { SourcesDock } from './sources'
import { ReadyCheck, ReadyCheckRecallChip } from './ready-check'
import { beginReadyCheckSession, resetReadyCheckState } from './ready-check-state'
import { TransitionsDialog, type TransitionsDialogState } from './transitions'

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
  // When the status now shown was asked for (the last ask is the one whose answer is kept).
  const askedAt = useRef(0)
  const status = useResource(() => {
    askedAt.current = Date.now()
    return api.status()
  }, [api])
  const s = status.data
  // Keep Shell's SafeModeBanner in sync if the engine starts or exits Safe Mode elsewhere (a
  // reading asked for before the streamer's own choice is dropped: it would undo it).
  useEffect(() => {
    if (!s) return
    useLive.getState().setSafeMode(s.safe_mode ?? null, askedAt.current)
  }, [s])
  // After pressing Start (never on its own): the ready check, with what came back after a crash.
  const [ready, setReady] = useState<{ recovered: EngineRecovered | null } | null>(null)
  const [starting, setStarting] = useState<StartChoice | null>(null)
  const [startError, setStartError] = useState<StartFailure | null>(null)
  const startingRef = useRef(false)
  const start = useCallback(
    async (choice: StartChoice = 'default', opts?: StudioStartOptions) => {
      if (startingRef.current) return
      startingRef.current = true
      setStarting(choice)
      setStartError(null)
      try {
        const st = await api.start(opts)
        status.set(st)
        useLive.getState().setSafeMode(st.safe_mode ?? null)
        beginReadyCheckSession(Boolean(st.recovered))
        setReady({ recovered: st.recovered ?? null })
      } catch (e) {
        const d = describeError(e)
        setStartError({ message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
        toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
        status.reload()
      } finally {
        startingRef.current = false
        setStarting(null)
      }
    },
    [api, status],
  )
  useEffect(() => {
    if (s?.running) setStartError(null)
  }, [s?.running])
  // Off: checked again every 3 s, so a start from elsewhere (a shortcut, another screen)
  // shows here too.
  const off = !!s && !s.running
  const reloadStatus = status.reload
  useEffect(() => {
    if (!off) return
    resetReadyCheckState()
    const t = setInterval(() => {
      if (!document.hidden) reloadStatus()
    }, 3000)
    return () => clearInterval(t)
  }, [off, reloadStatus])
  useEffect(() => () => resetReadyCheckState(), [])
  const handleStatus = useCallback(
    (next: StudioEngineStatus) => {
      status.set(next)
      if (!next.running) {
        setReady(null)
        resetReadyCheckState()
      }
    },
    [status],
  )
  if (status.error && !s)
    return (
      <>
        {lead && <InBar className="mb-2 flex">{lead}</InBar>}
        <LoadError error={status.error} onRetry={status.reload} />
      </>
    )
  if (!s) return <Skeleton className="h-[560px]" />
  if (!s.running)
    return (
      <>
        {lead && <InBar className="mb-2 flex">{lead}</InBar>}
        <DeskStandby
          status={s}
          view={view}
          res={res}
          starting={starting}
          startError={startError}
          onStart={start}
          onRetryStatus={status.reload}
        />
      </>
    )
  return (
    <Running
      res={res}
      view={view}
      lead={lead}
      onStatus={handleStatus}
      readyCorner={
        ready ? (
          <ReadyCheck
            recovered={ready.recovered}
            onClose={() => {
              resetReadyCheckState()
              setReady(null)
            }}
          />
        ) : null
      }
    />
  )
}

function itemsSame(a: EngineItem[] | null | undefined, b: EngineItem[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.visible !== y.visible ||
      x.locked !== y.locked ||
      x.blend !== y.blend ||
      x.scale_filter !== y.scale_filter ||
      x.srgb_off !== y.srgb_off ||
      x.frame?.[0] !== y.frame?.[0] ||
      x.frame?.[1] !== y.frame?.[1] ||
      x.frame?.[2] !== y.frame?.[2] ||
      x.frame?.[3] !== y.frame?.[3] ||
      x.frame?.[4] !== y.frame?.[4] ||
      x.frame?.[5] !== y.frame?.[5] ||
      !itemsSame(x.children, y.children)
    ) {
      return false
    }
  }
  return true
}

function scenesSame(a: EngineScenes | null | undefined, b: EngineScenes): boolean {
  if (!a) return false
  if (
    a.collection_id !== b.collection_id ||
    a.current !== b.current ||
    a.preview !== b.preview ||
    a.scenes.length !== b.scenes.length ||
    a.vertical?.current !== b.vertical?.current ||
    (a.vertical?.scenes.length ?? 0) !== (b.vertical?.scenes.length ?? 0)
  ) {
    return false
  }
  for (let i = 0; i < a.scenes.length; i++) {
    const x = a.scenes[i]!
    const y = b.scenes[i]!
    if (
      x.name !== y.name ||
      x.items !== y.items ||
      x.current !== y.current ||
      x.preview !== y.preview ||
      x.transition?.kind !== y.transition?.kind ||
      x.transition?.ms !== y.transition?.ms ||
      x.transition_name !== y.transition_name
    ) {
      return false
    }
  }
  if (a.transition?.kind !== b.transition?.kind || a.transition?.ms !== b.transition?.ms) {
    return false
  }
  const nta = a.named_transitions ?? []
  const ntb = b.named_transitions ?? []
  if (nta.length !== ntb.length) return false
  for (let i = 0; i < nta.length; i++) {
    const x = nta[i]!
    const y = ntb[i]!
    if (
      x.name !== y.name ||
      x.kind !== y.kind ||
      x.ms !== y.ms ||
      x.default !== y.default ||
      JSON.stringify(x.settings) !== JSON.stringify(y.settings)
    ) {
      return false
    }
  }
  const ma = a.transition_matrix ?? []
  const mb = b.transition_matrix ?? []
  if (ma.length !== mb.length) return false
  for (let i = 0; i < ma.length; i++) {
    const x = ma[i]!
    const y = mb[i]!
    if (x.from !== y.from || x.to !== y.to || x.transition !== y.transition) return false
  }
  const va = a.vertical?.scenes ?? []
  const vb = b.vertical?.scenes ?? []
  for (let i = 0; i < va.length; i++) {
    const x = va[i]!
    const y = vb[i]!
    if (x.name !== y.name || x.items !== y.items || x.current !== y.current) return false
  }
  return true
}

/**
 * Isolated 1s stats reader: pushes live telemetry into `statsStore` so the Desk workspace and
 * dock panels don't re-render on CPU/FPS/byte counters every second.
 */
function DeskStatsSync({
  api,
  shownOnAir,
  collectionId,
  profileId,
  statsStore,
  onSceneMismatch,
  onCollectionMismatch,
  onProfileMismatch,
  onCanvasSize,
}: {
  api: EngineApi
  shownOnAir: string | undefined
  collectionId: string | null
  profileId: string | null
  statsStore: DeskStatsStore
  onSceneMismatch: () => void
  onCollectionMismatch: (nextId: string) => void
  onProfileMismatch: (nextId: string) => void
  onCanvasSize: (w: number, h: number) => void
}) {
  const reading = useEngineReading(api.stats)
  const s = reading.stats
  const lastStats = useRef<EngineStats | null>(null)
  const seenCollection = useRef<string | null>(null)
  const seenProfile = useRef<string | null>(null)
  useEffect(() => {
    if (!s || s === lastStats.current) return
    lastStats.current = s
    statsStore.set(s)
    onCanvasSize(s.canvas.width, s.canvas.height)
    if (s.collection_id) {
      const expectedCollection = collectionId ?? seenCollection.current
      seenCollection.current = s.collection_id
      if (expectedCollection !== null && s.collection_id !== expectedCollection) {
        onCollectionMismatch(s.collection_id)
      }
    }
    if (s.profile_id) {
      const expectedProfile = profileId ?? seenProfile.current
      seenProfile.current = s.profile_id
      if (expectedProfile !== null && s.profile_id !== expectedProfile) {
        onProfileMismatch(s.profile_id)
      }
    }
    if (s.scene && shownOnAir && s.scene !== shownOnAir) onSceneMismatch()
  }, [
    s,
    statsStore,
    onCanvasSize,
    shownOnAir,
    collectionId,
    profileId,
    onSceneMismatch,
    onCollectionMismatch,
    onProfileMismatch,
  ])
  return null
}

function Running({
  res,
  view,
  lead,
  onStatus,
  readyCorner,
}: {
  res: Resource<GoLiveView>
  view: GoLiveView | null
  lead?: React.ReactNode
  onStatus: (s: StudioEngineStatus) => void
  readyCorner?: React.ReactNode
}) {
  const api = useEngine()
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [collectionKey, setCollectionKey] = useState(0)
  const collectionKeyRef = useRef(0)
  const [settledKey, setSettledKey] = useState(0)
  const awaitingScenesRef = useRef<number | null>(null)
  const seenScenesRef = useRef<EngineScenes | null>(null)
  const seenScenesCollectionRef = useRef<string | null>(null)
  const scenes = useResource(() => api.scenes(), [api])
  // The picture the panels edit: the vertical one only while it's on (and not in Studio Mode,
  // which is the main picture's).
  const vertical = scenes.data?.preview ? null : (scenes.data?.vertical ?? null)
  const [picture, setCanvas] = useState<'main' | 'vertical'>('main')
  const canvas = picture === 'vertical' && vertical ? 'vertical' : 'main'
  // The scene the panels edit: the vertical picture's on air, Studio Mode's preview, else the
  // one on air.
  const scene =
    canvas === 'vertical'
      ? (vertical?.current ?? '')
      : (scenes.data?.preview ?? scenes.data?.current ?? '')
  const items = useResource(
    () => (!scene || awaitingScenesRef.current !== null ? Promise.resolve([]) : api.items(scene)),
    [api, scene, settledKey],
  )
  const audio = useResource(
    () => (!scene || awaitingScenesRef.current !== null ? Promise.resolve([]) : api.audio(scene)),
    [api, scene, settledKey],
  )
  const kinds = useResource(() => api.kinds(), [api])
  const prefs = useResource(() => api.studioSettings(), [api])
  const reloadGoLive = res.reload
  const prefsSig = prefs.data
    ? JSON.stringify([
        prefs.data.video_kbps,
        prefs.data.audio_kbps,
        prefs.data.width,
        prefs.data.height,
        prefs.data.scale,
        prefs.data.fps,
        prefs.data.encoder,
        prefs.data.video_encoder,
      ])
    : null
  const seenPrefsSig = useRef<string | null>(null)
  useEffect(() => {
    if (prefsSig === null) return
    if (seenPrefsSig.current === null) {
      seenPrefsSig.current = prefsSig
      return
    }
    if (prefsSig !== seenPrefsSig.current) {
      seenPrefsSig.current = prefsSig
      reloadGoLive()
    }
  }, [prefsSig, reloadGoLive])
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
  const pickSet = useCallback(
    (ids: number[]) => setPicked({ id: ids[0] ?? null, also: ids.slice(1) }),
    [],
  )
  const [editing, setEditing] = useState<string | null>(null)
  const [editTab, setEditTab] = useState<DrawerTab | null>(null)
  const [autoConfigOpen, setAutoConfigOpen] = useState(false)
  const edit = useCallback((name: string | null, tab?: DrawerTab) => {
    setEditing(name)
    setEditTab(tab ?? null)
  }, [])
  // Stats' "Settings" on its heaviest source (Stats lives outside the Studio, so it asks).
  useEffect(() => {
    const on = (e: Event) => {
      const name = (e as CustomEvent<unknown>).detail
      if (typeof name === 'string' && name) edit(name, 'settings')
    }
    window.addEventListener('fc-edit-source', on)
    return () => window.removeEventListener('fc-edit-source', on)
  }, [edit])
  const itemMenu = useRef<((e: React.MouseEvent, id: number | null) => void) | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [statsStore] = useState(createDeskStatsStore)
  const [mainCanvas, setMainCanvas] = useState<{ width: number; height: number } | null>(null)
  const handleCanvasSize = useCallback((width: number, height: number) => {
    setMainCanvas((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height },
    )
  }, [])
  const seenPrefSize = useRef<string | null>(null)
  useEffect(() => {
    if (!prefs.data) return
    const nextSig = `${prefs.data.width}x${prefs.data.height}`
    if (nextSig !== seenPrefSize.current) {
      seenPrefSize.current = nextSig
      handleCanvasSize(prefs.data.width, prefs.data.height)
    }
  }, [prefs.data, handleCanvasSize])
  const [settingsAt, setSettingsAt] = useState<Page | null>(null)
  const [transitionsAt, setTransitionsAt] = useState<TransitionsDialogState | null>(null)
  const [clip, setClip] = useState<string | null>(null)
  const [filterClip, setFilterClip] = useState<string | null>(null)
  // Edit transform (⌘E, the menu, a double-click) opens the source's drawer on Position: one
  // place for where it sits, its size, box and crop (owner, 10 Nov).
  const transforming: Desk['transforming'] = null
  const setTransforming = useCallback(
    (t: Desk['transforming']) => {
      if (t) edit(t.name, 'position')
    },
    [edit],
  )
  const [library, setLibrary] = useState(0)
  const [transformClip, setTransformClip] = useState<Desk['transformClip']>(null)
  // A source can change size by itself (a captured window resized): its frame is read again while
  // visible so handles match what is drawn; single-flight & cheap equality skip idle churn.
  const setItems = items.set
  const itemsNow = useRef(items.data)
  itemsNow.current = items.data
  useEffect(() => {
    if (!scene) return
    let alive = true
    let held = false
    let busy = false
    const down = () => (held = true)
    const up = () => (held = false)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    const t = setInterval(() => {
      if (document.hidden || held || busy || awaitingScenesRef.current !== null) return
      busy = true
      const atCollection = collectionKeyRef.current
      void api
        .items(scene)
        .then((v) => {
          if (
            !alive ||
            held ||
            awaitingScenesRef.current !== null ||
            collectionKeyRef.current !== atCollection
          ) {
            return
          }
          if (!itemsSame(itemsNow.current, v)) setItems(v)
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }, 2500)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [api, scene, setItems])
  const reloadScenes = scenes.reload
  const reloadItems = items.reload
  const reloadAudio = audio.reload
  const setItemsList = items.set
  const setAudioList = audio.set
  const reloadPrefs = prefs.reload
  // Bumped by every read made here, so a poll already on its way drops its older answer.
  const scenesRead = useRef(0)
  const refresh = useCallback(() => {
    scenesRead.current++
    reloadScenes()
    reloadItems()
    reloadAudio()
  }, [reloadScenes, reloadItems, reloadAudio])
  const bumpLibrary = useCallback(() => setLibrary((n) => n + 1), [])
  const onCollectionChange = useCallback(
    (nextId?: string) => {
      const nextKey = collectionKeyRef.current + 1
      collectionKeyRef.current = nextKey
      awaitingScenesRef.current = nextKey
      setCollectionKey(nextKey)
      if (nextId !== undefined) {
        setCollectionId(nextId)
        seenScenesCollectionRef.current = nextId
      }
      scenesRead.current++
      select(null)
      edit(null)
      setAdding(null)
      setClip(null)
      setFilterClip(null)
      setTransformClip(null)
      setCanvas('main')
      setItemsList([])
      setAudioList([])
      reloadScenes()
      reloadGoLive()
    },
    [select, edit, setItemsList, setAudioList, reloadScenes, reloadGoLive],
  )
  const handleCollectionMismatch = useCallback(
    (nextId: string) => {
      onCollectionChange(nextId)
      bumpLibrary()
    },
    [onCollectionChange, bumpLibrary],
  )
  const onProfileChange = useCallback(
    (nextId?: string) => {
      if (nextId !== undefined) setProfileId(nextId)
      reloadPrefs()
      reloadGoLive()
    },
    [reloadPrefs, reloadGoLive],
  )
  const handleProfileMismatch = useCallback(
    (nextId: string) => {
      onProfileChange(nextId)
      bumpLibrary()
    },
    [onProfileChange, bumpLibrary],
  )
  useEffect(() => {
    const d = scenes.data
    if (!d || d === seenScenesRef.current) return
    seenScenesRef.current = d
    const wasAwaiting = awaitingScenesRef.current !== null
    let externalSwitch = false
    if (d.collection_id) {
      if (
        !wasAwaiting &&
        seenScenesCollectionRef.current !== null &&
        seenScenesCollectionRef.current !== d.collection_id
      ) {
        externalSwitch = true
        const nextKey = collectionKeyRef.current + 1
        collectionKeyRef.current = nextKey
        setCollectionKey(nextKey)
        select(null)
        edit(null)
        setAdding(null)
        setClip(null)
        setFilterClip(null)
        setTransformClip(null)
        setCanvas('main')
        bumpLibrary()
        reloadGoLive()
      }
      seenScenesCollectionRef.current = d.collection_id
      setCollectionId(d.collection_id)
    }
    awaitingScenesRef.current = null
    if (wasAwaiting || externalSwitch) {
      setSettledKey((k) => k + 1)
    }
  }, [scenes.data, select, edit, bumpLibrary, reloadGoLive])
  useEffect(() => {
    if (awaitingScenesRef.current !== null && !scenes.loading && scenes.error) {
      awaitingScenesRef.current = null
      setSettledKey((k) => k + 1)
    }
  }, [scenes.loading, scenes.error])
  // Another scene: nothing picked in it yet.
  useEffect(() => select(null), [scene, select])
  // ⌘Z and ⇧⌘Z (Ctrl on Windows) undo and redo changes to sources, outside text fields.
  const { run: runUndo } = useAction()
  const [undone, setUndone] = useState(0)
  const bumpUndone = useCallback(() => setUndone((n) => n + 1), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return
      e.preventDefault()
      const redo = e.shiftKey
      void runUndo('undo', () => (redo ? api.redo() : api.undo()), {
        success: (r) => (r.done ? `${redo ? 'Redone' : 'Undone'}: ${r.done}` : null),
      }).then((r) => {
        if (!r) return
        refresh()
        bumpUndone()
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, refresh, runUndo, bumpUndone])
  // A switch made elsewhere (a shortcut, a click in a multiview) shows up in the stats first.
  const setScenes = scenes.set
  const shownScenes = useRef(scenes.data)
  shownScenes.current = scenes.data
  // Each poll's number: only the newest one's answer counts (a slow one that answers after a
  // newer one would put older scenes back: review).
  const polls = useRef(0)
  useEffect(() => {
    let busy = false
    const t = setInterval(() => {
      if (document.hidden || busy) return
      busy = true
      const at = scenesRead.current
      const n = ++polls.current
      api
        .scenes()
        .then(
          (v) => {
            // A change made here meanwhile (a rename, a delete) is newer than this answer.
            if (at !== scenesRead.current || n !== polls.current) return
            if (!scenesSame(shownScenes.current, v)) setScenes(v)
          },
          () => undefined,
        )
        .finally(() => {
          busy = false
        })
    }, 3000)
    return () => clearInterval(t)
  }, [api, setScenes])
  const size = useMemo(
    () =>
      canvas === 'vertical' && vertical
        ? { width: vertical.width, height: vertical.height }
        : mainCanvas,
    [canvas, vertical, mainCanvas],
  )
  // Made once per scenes answer, so panels that compute from them don't redo it every render.
  const wide = useMemo(() => scenes.data?.scenes ?? [], [scenes.data])
  const tallScenes = useMemo(() => scenes.data?.vertical?.scenes ?? [], [scenes.data])
  const allScenes = useMemo(() => [...wide, ...tallScenes], [wide, tallScenes])
  const pictureScenes = canvas === 'vertical' ? tallScenes : wide
  const pictureCurrent =
    (canvas === 'vertical' ? scenes.data?.vertical?.current : scenes.data?.current) ?? ''
  // Loading saved scenes from the Safe Mode banner replaces the blank canvas immediately.
  const collectionPending = useLive((s) => s.status?.safe_mode?.collection_pending ?? false)
  const wasCollectionPending = useRef(collectionPending)
  useEffect(() => {
    if (wasCollectionPending.current && !collectionPending) {
      onCollectionChange()
      bumpLibrary()
    }
    wasCollectionPending.current = collectionPending
  }, [collectionPending, onCollectionChange, bumpLibrary])
  const openSettings = useCallback(
    (page?: string) => setSettingsAt((page as Page | undefined) ?? 'stream'),
    [],
  )
  const openTransitions = useCallback(
    (opts?: { tab?: 'list' | 'matrix'; transitionName?: string }) =>
      setTransitionsAt({
        tab: opts?.tab ?? 'list',
        ...(opts?.transitionName ? { transitionName: opts.transitionName } : {}),
      }),
    [],
  )
  // File > Remux Recordings… (the Mac menu): the Recording page of these settings, whether the
  // Studio was already open or only just opened by the menu.
  useEffect(() => {
    const pending = takePendingSettings()
    if (pending) openSettings(pending)
    const onAsk = (e: Event) => {
      takePendingSettings()
      const page = (e as CustomEvent<{ page?: string }>).detail?.page
      if (page) openSettings(page)
    }
    window.addEventListener('ferrocast:open-settings', onAsk)
    return () => window.removeEventListener('ferrocast:open-settings', onAsk)
  }, [openSettings])
  const scenesSettling = awaitingScenesRef.current !== null
  const desk: Desk = useMemo(
    () => ({
      api,
      scenes,
      scene,
      canvas,
      setCanvas,
      size,
      pictureScenes,
      pictureCurrent,
      allScenes,
      items,
      audio,
      kinds,
      prefs,
      refresh,
      undone,
      bumpUndone,
      selected,
      select,
      also: picked.also,
      pickMore,
      pickSet,
      itemMenu,
      editing,
      edit,
      editTab,
      adding,
      setAdding,
      stats: null,
      setStats: statsStore.set,
      clip,
      setClip,
      filterClip,
      setFilterClip,
      screens,
      transforming,
      setTransforming,
      library,
      bumpLibrary,
      collectionId,
      collectionKey,
      collectionKeyRef,
      scenesSettling,
      onCollectionChange,
      onProfileChange,
      transformClip,
      setTransformClip,
      openSettings,
      openTransitions,
    }),
    [
      api,
      scenes,
      scene,
      canvas,
      setCanvas,
      size,
      pictureScenes,
      pictureCurrent,
      allScenes,
      items,
      audio,
      kinds,
      prefs,
      refresh,
      undone,
      bumpUndone,
      selected,
      select,
      picked.also,
      pickMore,
      pickSet,
      editing,
      edit,
      editTab,
      adding,
      statsStore.set,
      clip,
      filterClip,
      screens,
      transforming,
      setTransforming,
      library,
      bumpLibrary,
      collectionId,
      collectionKey,
      scenesSettling,
      onCollectionChange,
      onProfileChange,
      transformClip,
      openSettings,
      openTransitions,
    ],
  )
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
    <>
      <DeskProvider value={desk} statsStore={statsStore}>
        <DeskStatsSync
          api={api}
          shownOnAir={scenes.data?.current}
          collectionId={collectionId}
          profileId={profileId}
          statsStore={statsStore}
          onSceneMismatch={refresh}
          onCollectionMismatch={handleCollectionMismatch}
          onProfileMismatch={handleProfileMismatch}
          onCanvasSize={handleCanvasSize}
        />
        <DockWorkspace
          top={
            <>
              <ControlBar view={view} lead={lead} onStatus={onStatus} />
              <AutoConfigRollbackBar onOpenWizard={() => setAutoConfigOpen(true)} />
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
          corner={readyCorner}
        />
        <AddSourceDialog />
        <FileDrop />
        {prefs.data && (
          <AutoConfigDialog
            open={autoConfigOpen}
            onClose={() => setAutoConfigOpen(false)}
            s={prefs.data}
            onApply={() => {}}
            onSynced={(next) => prefs.set(next)}
          />
        )}
        <SettingsDialog
          open={settingsAt !== null}
          start={settingsAt ?? undefined}
          onClose={() => setSettingsAt(null)}
        />
        <TransitionsDialog initial={transitionsAt} onClose={() => setTransitionsAt(null)} />
        <SourcePanel />
      </DeskProvider>
    </>
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

/**
 * What turning the Studio off would end, for the question asked first: the live stream, a
 * recording, or both (one short line). Null when nothing is on air: it just turns off.
 */
export function turnOffAsk(
  stats: Pick<EngineStats, 'stream' | 'record'> | null,
): { title: string; text: string; keep: string } | null {
  const s = stats?.stream
  // As the bar reads it: a stream exists until stopped; while connecting it isn't active yet.
  const live = !!s && !s.failed && (s.active || s.reconnecting || !s.error)
  const recording = !!stats?.record?.active
  if (live && recording)
    return {
      title: 'Turn the Studio off?',
      text: 'The stream ends for everyone watching, and the recording is saved.',
      keep: 'Keep going',
    }
  if (live)
    return {
      title: 'Turn the Studio off?',
      text: 'The stream ends for everyone watching.',
      keep: 'Keep streaming',
    }
  if (recording)
    return {
      title: 'Turn the Studio off?',
      text: 'The recording is saved and closed.',
      keep: 'Keep recording',
    }
  return null
}

/** Whether stream info has anything set: a title or category, everywhere or for one platform. */
export function hasStreamInfo(i: StreamInfo | null | undefined): boolean {
  if (!i) return false
  const own = (x: StreamInfo) => !!x.title?.trim() || !!x.category
  return own(i) || Object.values(i.per ?? {}).some((x) => !!x && own(x))
}

/** The stream's health, the Layout menu, and Go live. */
export function ControlBar({
  view,
  lead,
  onStatus,
}: {
  view: GoLiveView | null
  lead?: React.ReactNode
  onStatus: (s: StudioEngineStatus) => void
}) {
  const api = useEngine()
  const desk = useMediaQuery('(min-width: 1024px)')
  const { openSettings, prefs } = useDesk()
  const stats = useDeskStats()
  const setStats = useSetDeskStats()
  const { busy, run } = useAction()
  // Windows: whether its camera for every app (Windows 11) can be, and is, set up.
  const camSetup = useResource(
    () => (inDesktopApp() && os === 'windows' ? api.virtualCameraSetup() : Promise.resolve(null)),
    [api],
  )
  const stream = stats?.stream ?? null
  const rec = stats?.record ?? null
  // A stream exists until stopped; while connecting it isn't active yet but is on.
  const on = !!stream && !stream.failed && (stream.active || stream.reconnecting || !stream.error)
  const recording = !!rec?.active
  const studio = useStudio()
  const [show, setShow] = useShow()
  // A show with an ending keeps streaming for its stop delay after End stream: this says so,
  // counts it down, and offers Stop now. Read again when the show ends, so the delay is current.
  const stopCfg = useResource(() => studio.showConfig(), [studio, show?.phase === 'ended'])
  const stopDelay = stopCfg.data?.stop_delay_s ?? null
  const { ending, left } = useEndingLeft(show, on, stopDelay)
  const refreshShow = useCallback(() => {
    void studio
      .show()
      .then((r) => setShow(r.show))
      .catch(() => undefined)
  }, [studio, setShow])
  const { text: countdown } = useCountdownLeft(show, refreshShow)
  const ticked = view ? onCanvas(view.destinations, 'main').filter((d) => d.enabled) : []
  // A press that's still being answered takes no second one: a double click on Go live started
  // the show or the stream twice (the button now says so, this is what holds it).
  const pressed = useRef(new Set<'stream' | 'record'>())
  const once = async (key: 'stream' | 'record', f: () => Promise<void>) => {
    if (pressed.current.has(key)) return
    pressed.current.add(key)
    try {
      await f()
    } finally {
      pressed.current.delete(key)
    }
  }
  const toggle = () => once('stream', toggleNow)
  const toggleNow = async () => {
    // A show style (anything but "just go live"): Go live runs the show, which starts the
    // stream itself, and ending runs its ending, which stops it (owner's pick D1, 30 Oct).
    // Settings that can't be read stop here with their error (never a plain stream that skips
    // the show, CodeRabbit).
    const cfg = await run('stream', () => studio.showConfig())
    if (!cfg) return
    const showing = !!show && show.phase !== 'ended'
    if ((!on && styleOf(cfg) !== 'just') || (on && showing)) {
      const r = await run(
        'stream',
        // Per-run stream override: never mutate saved ShowConfig (M9-02).
        () => (on ? studio.endShow(!cfg.stop_stream) : studio.startShow(true, true)),
        {
          success: () =>
            on
              ? cfg.stop_stream && cfg.stop_delay_s > 0
                ? `Ending the show. The stream stops in ${cfg.stop_delay_s} s.`
                : 'Ending the show.'
              : null,
        },
      )
      if (r) {
        setShow(r.show)
        resetUploadRate()
        if (typeof api.stats === 'function') {
          await api
            .stats()
            .then(setStats)
            .catch(() => undefined)
        }
      }
      return
    }
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
        detail: v.also_detail,
      })
    if (v !== undefined) {
      resetUploadRate()
      // Shown at once, not on the next read (ending answers with no stream).
      if (stats) setStats({ ...stats, stream: ending ? null : v })
    }
  }
  // Stop now: the ending's wait is skipped and the stream stops at once.
  const stopNow = () =>
    once('stream', async () => {
      const r = await run('stop-now', () => studio.endShow(true), { success: 'Stream ended.' })
      if (r) {
        setShow(r.show)
        resetUploadRate()
        if (typeof api.stats === 'function') {
          await api
            .stats()
            .then(setStats)
            .catch(() => undefined)
        }
      }
    })
  // Said with the file's name, its whole path behind an (i), and a way to copy it: the streamer
  // can find a 2560x1440 file without opening Settings (S18 B4). Revealing it in the file
  // manager is the app's to do, not the page's.
  const saved = (file: string | null | undefined) =>
    toast({
      tone: 'ok',
      message: 'Recording saved.',
      ...(file
        ? {
            hint: file.split(/[\\/]/).pop() ?? file,
            detail: file,
            action: {
              label: 'Copy path',
              run: () => void navigator.clipboard?.writeText(file).catch(() => {}),
            },
          }
        : {}),
    })
  const record = () => once('record', recordNow)
  const recordNow = async () => {
    const file = rec?.file
    const v = await run('record', () => api.record(!recording))
    if (v !== undefined && recording) saved(file)
    if (v !== undefined && stats) setStats({ ...stats, record: v })
  }
  // OBS's General › "Show confirmation dialog when…": ending is asked by default.
  const [ask, setAsk] = useState<'live' | 'end' | 'record' | 'noinfo' | null>(null)
  // Read ahead, so pressing Go live answers at once when it's set (the usual case).
  const info = useResource(() => studio.streamInfo(), [studio])
  const pressStream = async () => {
    // Going live with no title or category anywhere: asked once whether to set them first
    // (owner, 29 Oct). Only then is it read afresh (it may have been set since), and stream
    // info that can't be read doesn't hold the stream up.
    // (Only for platforms: a server of their own has no title or category to set.)
    if (!on && ticked.some((d) => d.kind !== 'custom') && !hasStreamInfo(info.data?.last?.info)) {
      const fresh = await studio.streamInfo().catch(() => null)
      if (fresh && !hasStreamInfo(fresh.last?.info)) return setAsk('noinfo')
    }
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
      (ask === 'end' && !on) ||
      ((ask === 'live' || ask === 'noinfo') && on) ||
      (ask === 'record' && !recording)
    if (stale) {
      setAsk(null)
      return
    }
    const go = ask === 'record' ? record() : toggle()
    void go.finally(() => setAsk(null))
  }
  const showRunning = !!show && show.phase !== 'ended'
  const ASK = {
    noinfo: {
      title: 'No stream info yet',
      text: 'Your title and category are empty, so each platform shows what it had last time.',
      keep: 'Set it up',
      yes: 'Go live anyway',
      key: 'stream',
    },
    live: {
      title: 'Go live now?',
      text: `${goingTo(ticked)}.`,
      keep: 'Not yet',
      yes: 'Go live',
      key: 'stream',
    },
    end: {
      title: 'End the stream?',
      text:
        showRunning && stopDelay
          ? `Your ending plays for ${stopDelay} s, then it ends for everyone watching. You can stop it sooner.`
          : 'It ends for everyone watching.',
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
  // Pause and Resume answer at once (owner, 29 Oct): the button shows what was asked while the
  // engine does it, and goes back if it couldn't.
  const [askedPause, setAskedPause] = useState<boolean | null>(null)
  const paused = askedPause ?? !!rec?.paused
  useEffect(() => {
    if (askedPause !== null && (!recording || !!rec?.paused === askedPause)) setAskedPause(null)
  }, [askedPause, recording, rec?.paused])
  const pause = () => {
    const next = !paused
    setAskedPause(next)
    void run('pause', () => done(api.pauseRecord(next))).then((v) => {
      if (v === undefined) setAskedPause(null)
    })
  }
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
  const ndiOn = !!stats?.ndi
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
            success: camOn
              ? 'Virtual camera off.'
              : 'Virtual camera on: pick "Ferrocast Camera" in your call app.',
          }),
      },
      // Windows 11: the camera in every app (Windows Camera, new Teams…), not only those that
      // read DirectShow cameras. Windows asks for permission once.
      ...(camSetup.data?.every_app_possible
        ? [
            {
              label: 'Camera in every app',
              icon: AppWindow,
              checked: camSetup.data.every_app_on,
              onSelect: () => {
                const want = !camSetup.data?.every_app_on
                void run('camsetup', () => api.setVirtualCameraEveryApp(want), {
                  success: want
                    ? 'Ferrocast Camera now shows in every app.'
                    : 'Back to the camera for most apps.',
                }).then(() => camSetup.reload())
              },
            },
          ]
        : []),
      {
        label: 'NDI output',
        icon: ShareNetwork,
        checked: ndiOn,
        onSelect: () =>
          void run('ndi', () => api.ndiOutput(!ndiOn), {
            success: ndiOn
              ? 'NDI output off.'
              : 'NDI output on: other computers on your network see "Ferrocast".',
          }),
      },
    ])
  const saveReplay = () =>
    void run('save-replay', () => api.saveReplay(), {
      success: 'Replay saved with your recordings.',
    })
  return (
    <InBar className="mb-2 flex flex-wrap items-center gap-2">
      {/* On wide screens the engine switch steps aside while on air (it can't switch mid-stream),
          while the scene-collection and profile selectors stay visible in compact form so 1280 px
          stays one row and the streamer still sees them (and gets the 409 notice if switching, U3). */}
      <div className="flex flex-wrap items-center gap-2">
        {lead && <div className={cx((on || recording) && 'xl:hidden')}>{lead}</div>}
        <LibraryBar compact={on || recording} />
      </div>
      {/* Health and the actions stay together. Narrow: two fixed rows (the tools and what
          belongs to a recording or the ending, then Record and Go live side by side), so the
          bar is the same height idle and on air; wider: one row. */}
      <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {(stream?.error || stream?.failed) && !stream.active && (
          <InfoLine
            detail={stream.detail ?? undefined}
            label="More about stream error"
            className="text-[14px] font-semibold text-danger"
          >
            <span aria-live="polite">{stream.reason ?? stream.error ?? 'Stream stopped.'}</span>
          </InfoLine>
        )}
        <div className="flex items-center justify-between gap-2 sm:contents">
          {/* Settings, the layout and the extra outputs: one quiet group of icons. */}
          <div
            role="group"
            aria-label="Studio tools"
            className="flex h-8 items-stretch divide-x divide-line rounded-control border border-line bg-surface-1"
          >
            <button
              type="button"
              aria-label="Studio settings"
              title="Studio settings"
              className={cx(TOOL, 'rounded-l-[inherit]')}
              onClick={() => openSettings()}
            >
              <GearSix size={16} />
            </button>
            <LayoutMenu onStatus={onStatus} />
            <button
              type="button"
              aria-label="Replay buffer, virtual camera and NDI"
              title="Replay buffer, virtual camera and NDI"
              aria-pressed={replayOn || camOn || ndiOn}
              className={cx(
                TOOL,
                'rounded-r-[inherit]',
                (replayOn || camOn || ndiOn) && 'text-accent-text',
              )}
              onClick={outputsMenu}
            >
              <VideoCamera size={16} weight={replayOn || camOn || ndiOn ? 'fill' : 'regular'} />
            </button>
          </div>
          <div className="flex items-center gap-2 sm:contents">
            {!desk && <ReadyCheckRecallChip variant="mobile-bar" />}
            {recording && (
              <Button
                variant="secondary"
                size="xs"
                className={cx('h-8', paused && 'bg-warn-soft! text-warn!')}
                onClick={pause}
                aria-pressed={paused}
                aria-label={paused ? 'Resume recording' : 'Pause recording'}
                title={paused ? 'Resume recording' : 'Pause recording'}
              >
                {paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
                <span className="hidden 2xl:inline">{paused ? 'Resume' : 'Pause'}</span>
              </Button>
            )}
            {replayOn && (
              <Button
                variant="secondary"
                size="xs"
                className="h-8"
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
                className="h-8! w-8! rounded-control!"
                variant="ghost"
                onClick={recordMenu}
              >
                <DotsThree size={18} weight="bold" />
              </IconButton>
            )}
            {ending && (
              <Button
                variant="danger"
                size="xs"
                className="h-8"
                busy={busy === 'stop-now'}
                onClick={() => void stopNow()}
              >
                <Stop size={14} weight="fill" aria-hidden />
                Stop now
              </Button>
            )}
          </div>
        </div>
        {menu}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <OnAirButton
            kind="rec"
            paused={recording && paused}
            state={
              busy === 'record' ? (recording ? 'stopping' : 'starting') : recording ? 'on' : 'idle'
            }
            // Time recorded (frames over the frame rate): pauses don't count.
            time={clock(((rec?.frames ?? 0) / (stats?.canvas.fps || 30)) * 1000)}
            title={recording ? rec?.file : undefined}
            working={busy === 'record'}
            onClick={pressRecord}
          />
          <OnAirButton
            kind="live"
            state={
              busy === 'stream' || busy === 'stop-now'
                ? on
                  ? 'stopping'
                  : 'starting'
                : ending
                  ? 'ending'
                  : on
                    ? stream?.active
                      ? 'on'
                      : 'starting'
                    : 'idle'
            }
            left={left}
            countdown={on && !ending ? countdown : null}
            time={streamTime(stream, stats?.canvas.fps ?? 30)}
            disabled={!on && ticked.length === 0}
            title={
              !on && ticked.length === 0 ? 'Switch on a platform under Go live to.' : undefined
            }
            working={busy === 'stream' || busy === 'stop-now'}
            onClick={() => void pressStream()}
          />
        </div>
        <Dialog
          compact
          open={!!asked}
          onClose={() => setAsk(null)}
          title={asked?.title ?? ''}
          description={asked?.text}
          footer={
            asked && (
              <>
                <Button
                  variant={ask === 'noinfo' ? 'secondary' : 'ghost'}
                  onClick={() => {
                    if (ask === 'noinfo') go({ name: 'studio', section: 'info' })
                    setAsk(null)
                  }}
                >
                  {asked.keep}
                </Button>
                <Button
                  variant={ask === 'live' || ask === 'noinfo' ? 'primary' : 'danger'}
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
    </InBar>
  )
}

/** The bar's things in the page header's row when it gives one (`BarSlot`), else here. */
export function InBar({ className, children }: { className: string; children: ReactNode }) {
  const slot = useContext(BarSlot)
  if (!slot) return <div className={className}>{children}</div>
  return createPortal(
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{children}</div>,
    slot,
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
  'grid h-full w-8 place-items-center text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:relative focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'

export function LayoutMenu({ onStatus }: { onStatus: (s: StudioEngineStatus) => void }) {
  const api = useEngine()
  const { layout, setLayout } = useLayout()
  const asked = useDeskStats(
    (s) => turnOffAsk(s),
    (a, b) => a?.title === b?.title && a?.text === b?.text && a?.keep === b?.keep,
  )
  const [open, setOpen] = useState(false)
  // Turning the Studio off while live or recording asks first (it ends both for good).
  const [asking, setAsking] = useState(false)
  const [stopping, setStopping] = useState(false)
  const turningOff = useRef(false)
  const [addingWeb, setAddingWeb] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true })
  }, [open])
  // Not turning it off after all: back to the button that asked (the menu item is gone).
  const keep = () => {
    if (turningOff.current) return
    setAsking(false)
    btn.current?.focus()
  }
  const stop = async () => {
    setOpen(false)
    // A second press while it turns off does nothing (a ref: state is stale inside one tick).
    if (turningOff.current) return
    turningOff.current = true
    setStopping(true)
    try {
      onStatus(await api.stop())
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      turningOff.current = false
      setStopping(false)
      setAsking(false)
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
        <LayoutIcon size={16} />
      </button>
      <PopoverSurface
        open={open}
        onClose={(reason) => {
          setOpen(false)
          if (reason === 'escape' || reason === 'tab') btn.current?.focus()
        }}
        anchorRef={btn}
        surfaceRef={menu}
        placement="bottom"
        align="end"
        gap={6}
        edgePadding={8}
        closeOnTab
        role="menu"
        aria-label="Layout"
        className="z-[70] flex w-[min(264px,calc(100vw-16px))] flex-col gap-px rounded-control border border-line-strong bg-surface-2 p-1.5 shadow-pop [&>*]:shrink-0"
        onKeyDown={(e) => {
          const items = [
            ...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
          ]
          if (items.length === 0) return
          const i = items.indexOf(document.activeElement as HTMLElement)
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            items[(i + 1) % items.length]?.focus()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            items[(i - 1 + items.length) % items.length]?.focus()
          } else if (e.key === 'Home') {
            e.preventDefault()
            items[0]?.focus()
          } else if (e.key === 'End') {
            e.preventDefault()
            items[items.length - 1]?.focus()
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
              <span className="truncate" title={dockName(layout, id)}>
                {dockName(layout, id)}
              </span>
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
          aria-haspopup={asked ? 'dialog' : undefined}
          onClick={() => {
            if (asked) {
              setOpen(false)
              setAsking(true)
            } else void stop()
          }}
        >
          <Power size={17} aria-hidden /> Turn the Studio off
        </button>
      </PopoverSurface>
      <WebDockDialog open={addingWeb} onClose={() => setAddingWeb(false)} />
      <Dialog
        compact
        open={asking && !!asked}
        onClose={keep}
        title="Turn the Studio off?"
        description={asked?.text}
        footer={
          <>
            <Button variant="ghost" disabled={stopping} onClick={keep}>
              {asked?.keep ?? 'Keep going'}
            </Button>
            <Button variant="danger" busy={stopping} onClick={() => void stop()}>
              Turn off
            </Button>
          </>
        }
      >
        <p className="flex items-center gap-1.5 text-[13px] text-text-3">
          Everything else stops too
          <InfoTip label="What else turning the Studio off stops">
            The replay buffer, the virtual camera and NDI stop as well. Your scenes and settings are
            saved.
          </InfoTip>
        </p>
      </Dialog>
    </div>
  )
}
