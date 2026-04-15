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
  type Platform,
  type Queue,
  type Status,
  type TtsPending,
} from '@ferrocast/api'
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
  /** Bumped when the server says we fell behind; screens refetch. */
  resyncs: number
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
}

let noticeId = 1

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
  resyncs: 0,
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
  pushNotice: (n) =>
    set({ notices: [...get().notices.slice(-2), { ...n, id: noticeId++, at: Date.now() }] }),
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
    let resyncs = s.resyncs
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
          notices = [...notices.slice(-2), { ...f.data, id: noticeId++, at: Date.now() }]
          if (/panic mode is on/i.test(f.data.message)) panic = true
          if (/panic mode is off/i.test(f.data.message)) panic = false
          break
        case 'goals':
          goals = f.data
          break
        case 'held':
          held = new Map(held)
          held.set(f.data.event_id, f.data.reason)
          if (held.size > 200) held.delete(held.keys().next().value as string)
          break
        case 'panic':
          panic = f.data.on
          panicPlan = f.data.plan
          break
        case 'resync':
          resyncs += 1
          void resync()
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
      resyncs,
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
