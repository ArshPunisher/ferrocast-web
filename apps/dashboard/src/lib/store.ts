// Live state shared by every screen. Frames from the live socket land here in batches.

import { create } from 'zustand'
import {
  ApiError,
  LiveConnection,
  REMOTE_CLOSE,
  isAlertable,
  type CloudModeration,
  type ChatHighlight,
  type ConnectionState,
  type Connectors,
  type FerroEvent,
  type LiveFrame,
  type Goal,
  type GoLiveView,
  type Notice,
  type PanicConfig,
  type PollView,
  type GiveawayView,
  type ResolvedLinks,
  type UpdateInfo,
  type ChatterMark,
  type Platform,
  type Queue,
  type SafeModeStatus,
  type SessionStats,
  type Status,
  type TtsPending,
} from '@ferrocast/api'
import { toast } from '@ferrocast/ui'
import { clearRemote, linkOf, setRemoteLink, type Connection, type RemoteProblem } from './boot'
import { EMPTY_STUDIO, isStudioFrame, reduceStudio, type StudioLive } from './studio-live'

const CHAT_CAP = 500
const EVENT_CAP = 300

export interface NoticeItem extends Notice {
  id: number
  at: number
}

/** This dashboard opened on a phone through Ferrocast's servers (Pro "Dashboard anywhere"). */
export interface RemoteState {
  role: 'owner' | 'mod'
  name: string
  /** The relay can reach the streaming PC (its tunnel is open). */
  pcOnline: boolean
  /**
   * While the PC is off the cloud bot stands in (M10): chat, bans and history still work
   * (the limited dashboard). Meaningless while `pcOnline`.
   */
  cloud?: boolean
  /** The cloud bot is connected but switched off (the "PC is off" screen offers it to owners). */
  cloudPaused?: boolean
  /** While the PC is off: where the cloud bot can ban, time out and delete (the opt-in). */
  cloudModeration?: CloudModeration
  /** An owner's phone gets stream history (Pro F7, when the relay has it). */
  history?: boolean
}

/** `cloudModeration` as a stable string ("twitch,kick"), for memo keys. */
export function cloudModerationKey(m: CloudModeration | null | undefined): string {
  return (['twitch', 'kick', 'youtube'] as const).filter((p) => m?.[p] === true).join(',')
}

/** The PC is off and the cloud bot stands in: the phone's limited dashboard. */
export function isLimited(r: RemoteState | null | undefined): boolean {
  return !!r && !r.pcOnline && r.cloud === true
}

interface LiveStore {
  conn: Connection | null
  /** `null` on the PC itself (desktop window, a linked browser, the demo). */
  remote: RemoteState | null
  /** A phone's live socket said it can't go on (removed, Pro paused, open elsewhere). */
  remoteGone: RemoteProblem | null
  status: Status | null
  /** When the engine last answered a Safe Mode choice (0: never), to drop older readings. */
  safeModeChosenAt: number
  bootError: ApiError | null
  socket: ConnectionState
  connectors: Connectors | null
  queue: Queue | null
  events: FerroEvent[]
  chat: FerroEvent[]
  deleted: Set<string>
  tts: TtsPending[]
  notices: NoticeItem[]
  panic: boolean
  viewers: Partial<Record<Platform, number>>
  peakViewers: number
  streamStartedAt: number | null
  syncSessionStats: (stats: SessionStats, opts?: { hydrateViewers?: boolean }) => void
  goals: Goal[] | null
  panicPlan: PanicConfig | null
  /** Event ids the chat filter held for a mod, with the reason. */
  held: Map<string, string>
  /** The held messages themselves, by event id (for the review list). */
  heldEvents: Map<string, FerroEvent>
  /** Bumped when the server says we fell behind; screens refetch. */
  resyncs: number
  /** The latest `poll` frame; `undefined` until one arrives (load it with the client). */
  poll: PollView | null | undefined
  /** First messages ever and returning chatters, by event id (live `chatter` frames). */
  chatters: Map<string, ChatterMark>
  /** The latest `giveaway` frame; `undefined` until one arrives. */
  giveaway: GiveawayView | null | undefined
  /** The currently pinned `chat_highlight` frame; `undefined` until loaded or pushed. */
  chatHighlight: ChatHighlight | null | undefined
  setChatHighlight: (h: ChatHighlight | null) => void
  /** Resolved creator links & next stream text (populated at boot and on My links / account saves). */
  links: ResolvedLinks | null
  setLinks: (l: ResolvedLinks | null, gen?: number) => void
  /** Real overlay labels map from `GET /api/v1/labels`. */
  labels: Record<string, string> | null
  setLabels: (l: Record<string, string> | null, gen?: number) => void
  /** App updates (`GET /updates` and the live `update` frame); `null` until loaded. */
  update: UpdateInfo | null
  /** `update` frames so far: a GET that started before the latest frame is older than it. */
  updateFrames: number
  /** Why the last `GET /updates` failed (Settings shows it with a retry). */
  updateLoadError: unknown
  /** A GET's answer; ignored when an `update` frame arrived after `framesAtStart`. */
  setUpdate: (u: UpdateInfo, framesAtStart?: number) => void
  setUpdateLoadError: (e: unknown) => void
  /** Studio: the "Don't miss" lane, OBS health, the show, counters (studio-live.ts). */
  studio: StudioLive
  /** Latest HTTP `GET /golive` snapshot for components outside GoLiveTab (e.g. StudioStatusBar). */
  goliveView: GoLiveView | null
  goliveViewAt: number
  /** When the last live WebSocket `golive` frame arrived (to drop older HTTP snapshots). */
  goliveFrameAt: number
  setGoLiveView: (v: GoLiveView, askedAt?: number) => void
  setConn: (c: Connection) => void
  setStatus: (s: Status) => void
  /** `askedAt`: when the engine status it came from was asked for; an older one than the last choice is dropped. */
  setSafeMode: (sm: SafeModeStatus | null, askedAt?: number) => void
  /** The streamer just chose in Safe Mode (the engine has answered): readings asked before are stale. */
  markSafeModeChosen: () => void
  setBootError: (e: ApiError | null) => void
  setQueue: (q: Queue) => void
  setPanic: (on: boolean) => void
  setTts: (t: TtsPending[]) => void
  seed: (data: { chat: FerroEvent[]; events: FerroEvent[] }) => void
  apply: (frames: LiveFrame[]) => void
  dismissNotice: (id: number) => void
  pushNotice: (n: Notice) => void
  /** The engine's held list (`GET /mod/held`) is the truth: anything else was handled. */
  syncHeld: (list: FerroEvent[]) => void
  /** A held message was approved or removed (here, or by another mod). */
  resolveHeld: (eventId: string, outcome: 'released' | 'dropped') => void
}

/** Total concurrent live viewers across platforms, ignoring non-numeric entries. */
export function sumViewers(v: unknown): number {
  if (typeof v !== 'object' || v === null) return 0
  return Object.values(v as Record<string, unknown>).reduce<number>(
    (acc, n) => acc + (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0),
    0,
  )
}

/** Shown when a held message came from the list, not a live `held` frame. */
export const HELD_REASON = 'Held by the chat filter for a mod.'

/** Removes a held message; a removed one is marked deleted (by its platform message id). */
function resolved(
  s: Pick<LiveStore, 'held' | 'heldEvents' | 'deleted'>,
  eventId: string,
  outcome: 'released' | 'dropped',
): Pick<LiveStore, 'held' | 'heldEvents' | 'deleted'> {
  const held = new Map(s.held)
  held.delete(eventId)
  const heldEvents = new Map(s.heldEvents)
  const e = heldEvents.get(eventId)
  heldEvents.delete(eventId)
  let deleted = s.deleted
  if (outcome === 'dropped' && e?.source_id) {
    deleted = new Set(deleted)
    deleted.add(e.source_id)
  }
  return { held, heldEvents, deleted }
}

let noticeId = 1

let linksGen = 0
let labelsGen = 0

/** Begins a links fetch and returns its freshness token so older GETs cannot overwrite newer writes. */
export function beginLinksLoad(): number {
  return ++linksGen
}

/** Begins a labels fetch and returns its freshness token so out-of-order refreshes cannot regress state. */
export function beginLabelsLoad(): number {
  return ++labelsGen
}

const MAX_NOTICES = 3

/** Panic notices (keyed `panic`; older engines only say it in the message). */
export function isPanicNotice(n: Notice): boolean {
  return n.key === 'panic' || /panic mode is (on|off)/i.test(n.message)
}

/**
 * Adds a banner without stacking repeats: one with the same `key` (or, without a key,
 * the same message) replaces the older one. At most three at a time.
 */
export function addNotice(list: NoticeItem[], n: Notice): NoticeItem[] {
  const same = (x: NoticeItem) =>
    n.key !== undefined ? x.key === n.key : x.key === undefined && x.message === n.message
  const kept = list.filter((x) => !same(x))
  return [...kept, { ...n, id: noticeId++, at: Date.now() }].slice(-MAX_NOTICES)
}

/**
 * Panic is never a banner: the red "Panic on" button already shows it while it's on,
 * and one toast (replaced on every switch) says what just happened.
 */
let localPanicToast: { on: boolean; at: number; show: () => void } | null = null

/** The Panic button just toasted this switch itself (with where it applied); `show` shows it. */
export function notePanicToast(on: boolean, show: () => void): void {
  localPanicToast = { on, at: Date.now(), show }
}

function panicToast(n: Notice): void {
  const on = /panic mode is on/i.test(n.message)
  // The engine's notice repeats what the button's own toast said a moment ago, with less detail,
  // and shares its key: whichever came last would replace the other. Show the fuller one again,
  // so a late notice for an earlier switch never leaves the older state on screen.
  if (localPanicToast && localPanicToast.on === on && Date.now() - localPanicToast.at < 5000) {
    localPanicToast.show()
    return
  }
  toast({
    key: 'panic',
    tone: n.level === 'error' ? 'error' : on ? 'warn' : 'ok',
    message: n.message,
  })
}

function pruneDisconnectedViewers(
  viewers: Partial<Record<Platform, number>>,
  connectors: Connectors | null,
): Partial<Record<Platform, number>> {
  if (!connectors) return viewers
  let next: Partial<Record<Platform, number>> | null = null
  for (const p of ['twitch', 'youtube', 'kick', 'facebook'] as const) {
    const st = connectors[p]?.state
    if (st !== 'connected' && st !== 'reconnecting' && p in viewers) {
      next ??= { ...viewers }
      delete next[p]
    }
  }
  return next ?? viewers
}

function accountSig(c: Connectors | null): string {
  if (!c) return ''
  return (['twitch', 'youtube', 'kick', 'facebook'] as const)
    .map((p) => {
      const a = c[p]?.account
      return a ? `${p}:${a.login ?? ''}:${a.url ?? ''}` : `${p}:`
    })
    .join('|')
}

export const useLive = create<LiveStore>((set, get) => ({
  conn: null,
  remote: null,
  remoteGone: null,
  status: null,
  bootError: null,
  socket: 'connecting',
  connectors: null,
  queue: null,
  events: [],
  chat: [],
  deleted: new Set(),
  tts: [],
  notices: [],
  panic: false,
  viewers: {},
  peakViewers: 0,
  streamStartedAt: null,
  syncSessionStats: (stats, opts) =>
    set((s) => {
      const nextStarted = stats.started_at ?? null
      const isNewStream =
        nextStarted !== null && s.streamStartedAt !== null && nextStarted > s.streamStartedAt
      const anyLiveNow = Object.values(s.status?.live ?? {}).some(Boolean)
      if (!stats.live && anyLiveNow && !isNewStream && !opts?.hydrateViewers) {
        return s
      }
      const serverPeak = stats.peak_viewers ?? 0
      const basePeak = isNewStream ? serverPeak : Math.max(s.peakViewers, serverPeak)
      const offlineCleared = !stats.live && sumViewers(stats.viewers) === 0
      const viewers =
        opts?.hydrateViewers || isNewStream || offlineCleared ? stats.viewers : s.viewers
      return {
        viewers,
        peakViewers: Math.max(basePeak, sumViewers(viewers)),
        streamStartedAt: nextStarted ?? s.streamStartedAt,
      }
    }),
  goals: null,
  panicPlan: null,
  held: new Map(),
  heldEvents: new Map(),
  resyncs: 0,
  poll: undefined,
  giveaway: undefined,
  chatHighlight: undefined,
  setChatHighlight: (chatHighlight) => set({ chatHighlight }),
  links: null,
  setLinks: (links, gen) => {
    if (gen !== undefined && gen !== linksGen) return
    if (gen === undefined) linksGen += 1
    set({ links })
  },
  labels: null,
  setLabels: (labels, gen) => {
    if (gen !== undefined && gen !== labelsGen) return
    if (gen === undefined) labelsGen += 1
    set({ labels })
  },
  update: null,
  updateFrames: 0,
  updateLoadError: null,
  setUpdate: (update, framesAtStart) => {
    if (framesAtStart !== undefined && get().updateFrames !== framesAtStart) return
    set({ update, updateLoadError: null })
  },
  setUpdateLoadError: (updateLoadError) => set({ updateLoadError }),
  chatters: new Map(),
  studio: EMPTY_STUDIO,
  goliveView: null,
  goliveViewAt: 0,
  goliveFrameAt: 0,
  safeModeChosenAt: 0,
  setGoLiveView: (view, askedAt) =>
    set((s) => {
      if (askedAt !== undefined && askedAt < s.goliveFrameAt) return s
      return { goliveView: view, goliveViewAt: Date.now() }
    }),
  setConn: (conn) => set({ conn, remote: conn.remote ?? null }),
  setStatus: (status) =>
    set((s) => ({
      status,
      connectors: status.connectors,
      viewers: pruneDisconnectedViewers(s.viewers, status.connectors),
    })),
  markSafeModeChosen: () => set({ safeModeChosenAt: Date.now() }),
  setSafeMode: (safeMode, askedAt) =>
    set((s) => {
      if (!s.status) return s
      // A slow engine status asked for before the choice would put "saved scenes held back" (and
      // its Load button) back after they were loaded.
      if (askedAt !== undefined && askedAt < s.safeModeChosenAt) return s
      if (!safeMode && s.status.safe_mode === undefined) return s
      const next: Status = { ...s.status }
      if (safeMode) next.safe_mode = safeMode
      else delete next.safe_mode
      return { status: next }
    }),
  setBootError: (bootError) => set({ bootError }),
  setQueue: (queue) => set({ queue }),
  setPanic: (panic) => set({ panic }),
  setTts: (tts) => set({ tts }),
  seed: ({ chat, events }) =>
    set({
      chat: chat.slice(-CHAT_CAP),
      events: [...events].sort((a, b) => a.seq - b.seq).slice(-EVENT_CAP),
    }),
  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  pushNotice: (n) => set({ notices: addNotice(get().notices, n) }),
  syncHeld: (list) => {
    const s = get()
    const held = new Map<string, string>()
    const heldEvents = new Map<string, FerroEvent>()
    for (const e of list) {
      held.set(e.id, s.held.get(e.id) ?? HELD_REASON)
      heldEvents.set(e.id, e)
    }
    set({ held, heldEvents })
  },
  resolveHeld: (eventId, outcome) => set(resolved(get(), eventId, outcome)),
  apply: (frames) => {
    const s = get()
    let chat = s.chat
    let events = s.events
    let deleted = s.deleted
    let connectors = s.connectors
    let status = s.status
    let links = s.links
    let queue = s.queue
    let tts = s.tts
    let notices = s.notices
    let panic = s.panic
    let viewers = s.viewers
    let peakViewers = s.peakViewers
    let goals = s.goals
    let panicPlan = s.panicPlan
    let held = s.held
    let heldEvents = s.heldEvents
    let resyncs = s.resyncs
    let poll = s.poll
    let giveaway = s.giveaway
    let chatHighlight = s.chatHighlight
    let update = s.update
    let updateFrames = s.updateFrames
    let chatters = s.chatters
    let studio = s.studio
    let goliveFrameAt = s.goliveFrameAt
    let remote = s.remote
    let chatChanged = false
    let eventsChanged = false
    let needLabelsRefresh = false
    let needLinksRefresh = false
    for (const f of frames) {
      if (isStudioFrame(f)) {
        studio = reduceStudio(studio, f)
        if (f.type === 'golive') goliveFrameAt = Date.now()
        continue
      }
      switch (f.type) {
        case 'event': {
          const e = f.data
          const k = e.kind
          if (k.type === 'chat_message') {
            if (!chatChanged) chat = [...chat]
            chatChanged = true
            chat.push(e)
          } else if (k.type === 'message_deleted') {
            if (deleted === s.deleted) deleted = new Set(deleted)
            deleted.add(k.message_id)
            if (deleted.size > 1000) deleted.delete(deleted.values().next().value as string)
          } else if (k.type === 'mode_changed' && k.mode === 'followers_only') {
            panic = k.enabled ? true : panic
          } else if (k.type === 'viewer_count') {
            viewers = { ...viewers, [e.platform]: k.count }
            peakViewers = Math.max(peakViewers, sumViewers(viewers))
          } else {
            if (k.type === 'stream_offline') {
              if (e.platform in viewers) {
                const next = { ...viewers }
                delete next[e.platform]
                viewers = next
              }
              if (
                status &&
                (e.platform === 'twitch' || e.platform === 'youtube' || e.platform === 'kick')
              ) {
                status = { ...status, live: { ...status.live, [e.platform]: false } }
              }
            } else if (k.type === 'stream_online') {
              const anyLive = status
                ? Object.values(status.live).some(Boolean)
                : Object.keys(viewers).length > 0
              if (!anyLive) {
                viewers = {}
                peakViewers = 0
              }
              if (
                status &&
                (e.platform === 'twitch' || e.platform === 'youtube' || e.platform === 'kick')
              ) {
                status = { ...status, live: { ...status.live, [e.platform]: true } }
              }
            }
            if (!eventsChanged) events = [...events]
            eventsChanged = true
            events.push(e)
            if (
              k.type === 'follow' ||
              k.type === 'subscription' ||
              k.type === 'gift_batch' ||
              k.type === 'tip' ||
              k.type === 'paid_message' ||
              k.type === 'platform_gift' ||
              k.type === 'raid' ||
              k.type === 'reversal'
            ) {
              needLabelsRefresh = true
            }
          }
          break
        }
        case 'status': {
          if (accountSig(f.data.connectors) !== accountSig(connectors)) {
            needLinksRefresh = true
          }
          connectors = f.data.connectors
          if (f.data.viewers && typeof f.data.viewers === 'object') {
            const nextViewers: Partial<Record<Platform, number>> = { ...viewers }
            for (const [k, v] of Object.entries(f.data.viewers)) {
              const p = k as Platform
              if (typeof v === 'number' && Number.isFinite(v)) nextViewers[p] = v
              else if (v === null) delete nextViewers[p]
            }
            viewers = pruneDisconnectedViewers(nextViewers, connectors)
          } else {
            viewers = pruneDisconnectedViewers(viewers, connectors)
          }
          break
        }
        case 'links':
          links = f.data.resolved
          linksGen += 1
          needLinksRefresh = false
          break
        case 'queue':
          queue = f.data
          break
        case 'tts_pending':
          tts = f.data
          break
        case 'notice':
          if (isPanicNotice(f.data)) {
            if (/panic mode is on/i.test(f.data.message)) panic = true
            if (/panic mode is off/i.test(f.data.message)) panic = false
            notices = notices.filter((n) => !isPanicNotice(n))
            panicToast(f.data)
          } else notices = addNotice(notices, f.data)
          break
        case 'goals':
          goals = f.data
          break
        case 'held': {
          held = new Map(held)
          held.set(f.data.event_id, f.data.reason)
          // Its `event` frame came first (API.md §5), usually in this same batch.
          const id = f.data.event_id
          let e: FerroEvent | undefined
          for (let i = chat.length - 1; i >= 0 && !e; i--) if (chat[i]?.id === id) e = chat[i]
          if (e) {
            heldEvents = new Map(heldEvents)
            heldEvents.set(id, e)
          }
          if (held.size > 200) {
            const old = held.keys().next().value as string
            held.delete(old)
            if (heldEvents.has(old)) {
              if (heldEvents === s.heldEvents) heldEvents = new Map(heldEvents)
              heldEvents.delete(old)
            }
          }
          break
        }
        case 'held_resolved': {
          const r = resolved({ held, heldEvents, deleted }, f.data.event_id, f.data.outcome)
          held = r.held
          heldEvents = r.heldEvents
          deleted = r.deleted
          break
        }
        case 'panic':
          panic = f.data.on
          panicPlan = f.data.plan
          break
        case 'resync':
          resyncs += 1
          // After this batch is in the store (a `remote` frame before it may change the mode).
          queueMicrotask(() => void resync())
          break
        case 'poll':
          poll = f.data.poll
          break
        case 'giveaway':
          giveaway = f.data.giveaway
          break
        case 'chat_highlight':
          chatHighlight = f.data.highlight
          break
        case 'update':
          update = f.data
          updateFrames += 1
          break
        case 'chatter': {
          const { event_id, ...mark } = f.data
          if (chatters === s.chatters) chatters = new Map(chatters)
          chatters.set(event_id, mark as ChatterMark)
          if (chatters.size > 1000) chatters.delete(chatters.keys().next().value as string)
          break
        }
        case 'remote':
          if (remote) {
            const was = remote
            remote = {
              ...remote,
              pcOnline: f.data.pc_online,
              cloud: f.data.cloud === true,
              cloudPaused: f.data.cloud_paused === true,
              cloudModeration: f.data.cloud_moderation ?? {},
              ...(f.data.history !== undefined ? { history: f.data.history } : {}),
            }
            setRemoteLink(linkOf(remote))
            // The PC came back while the phone showed the cloud's limited dashboard: the
            // PC's `resync` that follows loads everything (status, queue, TTS, stats, media).
            if (isLimited(was) && remote.pcOnline) fullReload = true
            // The cloud bot stopped standing in while the PC is off (switched off): show why.
            if (isLimited(was) && !remote.pcOnline && !remote.cloud) {
              const problem: RemoteProblem =
                f.data.cloud_paused && remote.role === 'owner' ? 'cloud_paused' : 'pc_offline'
              queueMicrotask(() => remoteEnded(problem))
            }
          }
          break
        case 'hello':
          break
      }
    }
    if (chat.length > CHAT_CAP) chat = chat.slice(-CHAT_CAP)
    if (events.length > EVENT_CAP) events = events.slice(-EVENT_CAP)
    set({
      chat,
      events,
      deleted,
      connectors,
      status,
      links,
      queue,
      tts,
      notices,
      panic,
      viewers,
      peakViewers,
      goals,
      panicPlan,
      held,
      heldEvents,
      resyncs,
      poll,
      giveaway,
      chatHighlight,
      update,
      updateFrames,
      chatters,
      studio,
      goliveFrameAt,
      remote,
    })
    const clientRef = s.conn?.client
    if (clientRef && remote?.role !== 'mod') {
      if (needLabelsRefresh && clientRef.labels) {
        const lbGen = beginLabelsLoad()
        queueMicrotask(() => {
          void clientRef
            .labels()
            .then((lb) => {
              if (useLive.getState().conn?.client === clientRef)
                useLive.getState().setLabels(lb, lbGen)
            })
            .catch(() => {})
        })
      }
      if (needLinksRefresh && clientRef.links) {
        const lkGen = beginLinksLoad()
        queueMicrotask(() => {
          void clientRef
            .links()
            .then((r) => {
              if (useLive.getState().conn?.client === clientRef)
                useLive.getState().setLinks(r.resolved, lkGen)
            })
            .catch(() => {})
        })
      }
    }
  },
}))

let live: LiveConnection | null = null
/** Set when a phone's PC comes back while it showed the limited dashboard (see `resync`). */
let fullReload = false

/**
 * Everything the full dashboard loads at boot: status, chat, the event log, the alert
 * queue, TTS waiting and session stats (a phone's media ticket is fetched by its caller). Returns
 * whether first-time setup is done. Used at boot (`App.tsx`) and when a phone leaves the
 * limited dashboard because its PC came back.
 */
export async function loadFull(conn: Connection): Promise<boolean> {
  const live = useLive.getState()
  const status = await conn.client.status()
  live.setStatus(status)
  const lkGen = beginLinksLoad()
  const lbGen = beginLabelsLoad()
  const canLinksLabels = conn.remote?.role !== 'mod'
  const [chat, page, queue, tts, stats, linksRes, labelsRes] = await Promise.all([
    conn.client.chat(200).catch(() => [] as FerroEvent[]),
    conn.client
      .events({ limit: 60 })
      .catch(() => ({ events: [] as FerroEvent[], next_before: null })),
    conn.client.queue().catch(() => null),
    conn.client.ttsPending().catch(() => []),
    conn.client.sessionStats().catch(() => null),
    canLinksLabels ? (conn.client.links?.().catch(() => null) ?? Promise.resolve(null)) : null,
    canLinksLabels ? (conn.client.labels?.().catch(() => null) ?? Promise.resolve(null)) : null,
  ])
  live.seed({ chat, events: page.events })
  if (queue) live.setQueue(queue)
  live.setTts(tts)
  if (stats) useLive.getState().syncSessionStats(stats, { hydrateViewers: true })
  if (linksRes) useLive.getState().setLinks(linksRes.resolved, lkGen)
  if (labelsRes) useLive.getState().setLabels(labelsRes, lbGen)
  return status.setup_done
}

function reloadHref(): string {
  const q = new URLSearchParams(location.search)
  q.set('r', String(Date.now()))
  return `${location.pathname}?${q.toString()}${location.hash}`
}

/** The socket fell behind (API.md §5 `resync`): refetch status, queue, chat and events. */
async function resync(): Promise<void> {
  const conn = useLive.getState().conn
  if (!conn) return
  try {
    if (fullReload && !isLimited(useLive.getState().remote)) {
      // Back from the cloud's limited dashboard: load what it never had.
      fullReload = false
      // Previews need a media ticket (the limited dashboard had none).
      await Promise.all([loadFull(conn), conn.client.refreshMediaTicket().catch(() => {})])
      return
    }
    if (isLimited(useLive.getState().remote)) {
      // The PC is off: the cloud's chat replaces what's on screen (the PC's had other ids);
      // a line that came in while this loaded is kept.
      const fetched = await conn.client.chat(200)
      const st = useLive.getState()
      st.seed({ chat: mergeChat(fetched, st.chat), events: [] })
      return
    }
    if (conn.remote?.role === 'mod') {
      // A mod's phone reads chat only (no queue or event log through Ferrocast's servers).
      const [status, chat] = await Promise.all([conn.client.status(), conn.client.chat(200)])
      useLive.getState().setStatus(status)
      useLive.getState().seed({ chat, events: useLive.getState().events })
      return
    }
    const [status, queue, chat, page, stats] = await Promise.all([
      conn.client.status(),
      conn.client.queue(),
      conn.client.chat(200),
      conn.client.events({ limit: 60 }),
      typeof conn.client.sessionStats === 'function'
        ? conn.client.sessionStats().catch(() => null)
        : Promise.resolve(null),
    ])
    const st = useLive.getState()
    st.setStatus(status)
    st.setQueue(queue)
    st.seed({ chat, events: page.events })
    if (stats) st.syncSessionStats(stats, { hydrateViewers: true })
  } catch {
    useLive.getState().pushNotice({
      level: 'warn',
      message: 'Some recent events may be missing from this screen.',
      // A changed query string makes the link a real reload, not just a hash change.
      action: { label: 'Reload', href: reloadHref() },
    })
  }
}

/**
 * The cloud's chat as fetched, plus lines already on screen that are newer than its last
 * one and not in it (they came on the socket while the fetch was answered).
 */
export function mergeChat(fetched: FerroEvent[], current: FerroEvent[]): FerroEvent[] {
  const ids = new Set(fetched.map((e) => e.id))
  const last = fetched.reduce((m, e) => Math.max(m, e.occurred_at), 0)
  const extra = current.filter((e) => !ids.has(e.id) && e.occurred_at > last)
  return [...fetched, ...extra]
}

let mediaTimer: ReturnType<typeof setInterval> | null = null

/** What a phone's live socket close code means (API.md §9.5); `null`: just reconnect. */
export function remoteCloseProblem(code: number): RemoteProblem | null {
  if (code === REMOTE_CLOSE.revoked) return 'unpaired'
  if (code === REMOTE_CLOSE.proPaused) return 'pro_paused'
  if (code === REMOTE_CLOSE.elsewhere) return 'elsewhere'
  return null
}

/** A phone can't go on: stop the socket, forget a removed phone's token, show why. */
function remoteEnded(problem: RemoteProblem): void {
  stopLive()
  if (problem === 'unpaired') clearRemote()
  useLive.setState({ remoteGone: problem })
}

export function startLive(conn: Connection): void {
  live?.stop()
  // A phone through the relay (or the demo acting as one, `?remote=`).
  const phone = conn.mode === 'remote' || conn.remote !== undefined
  // A phone that fell behind (4408) refetches once it's back.
  let refetch = false
  live = new LiveConnection({
    url: async (since) => {
      try {
        return await conn.client.liveSocketUrl(since)
      } catch (e) {
        // The ticket call says why a phone can't connect (a refused socket can't).
        const problem =
          phone && e instanceof ApiError
            ? e.status === 401
              ? 'unpaired'
              : e.status === 402
                ? 'pro_paused'
                : null
            : null
        if (problem) queueMicrotask(() => remoteEnded(problem))
        throw e
      }
    },
    factory: conn.socket,
    onFrames: (frames) => useLive.getState().apply(frames),
    onState: (state) => {
      useLive.setState({ socket: state })
      if (state === 'open' && refetch) {
        refetch = false
        void resync()
      }
    },
    onClose: (code) => {
      if (!phone) return
      if (code === REMOTE_CLOSE.lagged) {
        refetch = true
        return
      }
      const problem = remoteCloseProblem(code)
      if (!problem) return
      queueMicrotask(() => remoteEnded(problem))
      return 'stop'
    },
  })
  live.start()
  if (mediaTimer) clearInterval(mediaTimer)
  mediaTimer = null
  if (phone) {
    // Media tickets last 5 minutes: keep one fresh for previews.
    mediaTimer = setInterval(() => void conn.client.refreshMediaTicket().catch(() => {}), 60_000)
  }
}

export function stopLive(): void {
  live?.stop()
  live = null
  if (mediaTimer) clearInterval(mediaTimer)
  mediaTimer = null
}

/** Alertable events, newest first, for feeds. */
export function selectFeed(events: FerroEvent[], limit = 50): FerroEvent[] {
  const out: FerroEvent[] = []
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i] as FerroEvent
    if (isAlertable(e) || e.kind.type === 'tip') out.push(e)
  }
  return out
}
