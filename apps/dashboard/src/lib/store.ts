// Live state shared by every screen. Frames from the live socket land here in batches.

import { create } from 'zustand'
import {
  ApiError,
  LiveConnection,
  REMOTE_CLOSE,
  isAlertable,
  type CloudModeration,
  type ConnectionState,
  type Connectors,
  type FerroEvent,
  type LiveFrame,
  type Goal,
  type Notice,
  type PanicConfig,
  type PollView,
  type GiveawayView,
  type ChatterMark,
  type Platform,
  type Queue,
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
  return (['twitch', 'kick'] as const).filter((p) => m?.[p] === true).join(',')
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
  /** Studio: the "Don't miss" lane, OBS health, the show, counters (studio-live.ts). */
  studio: StudioLive
  setConn: (c: Connection) => void
  setStatus: (s: Status) => void
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
function panicToast(n: Notice): void {
  const on = /panic mode is on/i.test(n.message)
  toast({
    key: 'panic',
    tone: n.level === 'error' ? 'error' : on ? 'warn' : 'ok',
    message: n.message,
  })
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
  goals: null,
  panicPlan: null,
  held: new Map(),
  heldEvents: new Map(),
  resyncs: 0,
  poll: undefined,
  giveaway: undefined,
  chatters: new Map(),
  studio: EMPTY_STUDIO,
  setConn: (conn) => set({ conn, remote: conn.remote ?? null }),
  setStatus: (status) => set({ status, connectors: status.connectors }),
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
    let queue = s.queue
    let tts = s.tts
    let notices = s.notices
    let panic = s.panic
    let viewers = s.viewers
    let goals = s.goals
    let panicPlan = s.panicPlan
    let held = s.held
    let heldEvents = s.heldEvents
    let resyncs = s.resyncs
    let poll = s.poll
    let giveaway = s.giveaway
    let chatters = s.chatters
    let studio = s.studio
    let remote = s.remote
    let chatChanged = false
    let eventsChanged = false
    for (const f of frames) {
      if (isStudioFrame(f)) {
        studio = reduceStudio(studio, f)
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
          } else {
            if (!eventsChanged) events = [...events]
            eventsChanged = true
            events.push(e)
          }
          break
        }
        case 'status':
          connectors = f.data.connectors
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
      queue,
      tts,
      notices,
      panic,
      viewers,
      goals,
      panicPlan,
      held,
      heldEvents,
      resyncs,
      poll,
      giveaway,
      chatters,
      studio,
      remote,
    })
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
  const [chat, page, queue, tts, stats] = await Promise.all([
    conn.client.chat(200).catch(() => [] as FerroEvent[]),
    conn.client
      .events({ limit: 60 })
      .catch(() => ({ events: [] as FerroEvent[], next_before: null })),
    conn.client.queue().catch(() => null),
    conn.client.ttsPending().catch(() => []),
    conn.client.sessionStats().catch(() => null),
  ])
  live.seed({ chat, events: page.events })
  if (queue) live.setQueue(queue)
  live.setTts(tts)
  if (stats) useLive.setState({ viewers: stats.viewers })
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
    const [status, queue, chat, page] = await Promise.all([
      conn.client.status(),
      conn.client.queue(),
      conn.client.chat(200),
      conn.client.events({ limit: 60 }),
    ])
    const st = useLive.getState()
    st.setStatus(status)
    st.setQueue(queue)
    st.seed({ chat, events: page.events })
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
