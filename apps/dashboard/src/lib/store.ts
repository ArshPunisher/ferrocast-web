// Live state shared by every screen. Frames from the live socket land here in batches.

import { create } from 'zustand'
import {
  ApiError,
  LiveConnection,
  isAlertable,
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
import type { Connection } from './boot'

const CHAT_CAP = 500
const EVENT_CAP = 300

export interface NoticeItem extends Notice {
  id: number
  at: number
}

interface LiveStore {
  conn: Connection | null
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
  setConn: (conn) => set({ conn }),
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
    let chatChanged = false
    let eventsChanged = false
    for (const f of frames) {
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
          void resync()
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
    })
  },
}))

let live: LiveConnection | null = null

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

export function startLive(conn: Connection): void {
  live?.stop()
  live = new LiveConnection({
    url: (since) => conn.client.liveUrl(since),
    factory: conn.socket,
    onFrames: (frames) => useLive.getState().apply(frames),
    onState: (state) => useLive.setState({ socket: state }),
  })
  live.start()
}

export function stopLive(): void {
  live?.stop()
  live = null
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
