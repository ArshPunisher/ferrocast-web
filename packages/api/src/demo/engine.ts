// An in-browser stand-in for the Rust engine. It answers every route in API.md with the
// documented shapes and errors, runs the live socket and the overlay socket, and plays a
// believable stream (chat flowing, alerts firing) so the dashboard and overlays can be
// built, screenshotted and tested with no engine. Faults can be injected per route.

import { render, select } from '../alert'
import { withAmount } from '../design'
import { DemoDesigns } from './features/designs'
import { actorOf, formatMoney, isAlertable, majorUnits } from '../format'
import { AlertQueue, type QueueAction } from '../queue'
import { anySample, namedActor, sample } from '../samples'
import type { FetchLike } from '../client'
import type { SocketFactory, SocketLike } from '../socket'
import type {
  Account,
  Actor,
  AlertRule,
  Design,
  Backup,
  BanEntry,
  ChatPlatform,
  Command,
  ConnectorName,
  ConnectorState,
  Connectors,
  EventKind,
  FerroEvent,
  Filters,
  Goal,
  Media,
  MediaKind,
  ObsState,
  Overlay,
  OverlayPreset,
  OverlayState,
  PanicConfig,
  Platform,
  RenderedAlert,
  SessionStats,
  Settings,
  Timer,
  TipProviderInput,
  TipProviderKey,
  TipProviderState,
  TipSettings,
  TtsPending,
  TtsSettings,
  ViewerCard,
  Widget,
} from '../types'
import {
  TIP_LIMITS,
  TIP_PROVIDER_KEYS,
  checkedTipPage,
  cleanTipText,
  normaliseTipHandle,
  tipDisplayNameProblem,
  tipHandleProblem,
  tipLinkProblem,
  tipMessageProblem,
  tipPageIdProblem,
  tipSecretProblem,
} from '../tips'
import { Roles, WIDGET_KINDS } from '../types'
import { chimeDataUrl } from './chime'
import { HttpError } from './http-error'
import { NOT_MINE, type DemoFeature, type DemoHost } from './features/host'
import { DemoLoyalty } from './features/loyalty'
import { DemoPolls } from './features/polls'
import { DemoGiveaways } from './features/giveaways'
import { DemoWelcome } from './features/welcome'
import { DemoRecap } from './features/recap'
import { DemoDiscord } from './features/discord'
import { DemoDiscordPro } from './features/discord-pro'
import { DemoCloudBot, type DemoCloudBotState } from './features/cloud-bot'
import { DemoObsDetect } from './features/obs-detect'
import { DemoStarter } from './features/starter'
import { DemoImporters } from './features/importers'
import { DemoPro, type DemoProSetup } from './features/pro'
import { DemoStudio } from './features/studio'
import { DemoHistory } from './features/history'
import { DemoCloudBackups, type DemoCloudMode } from './features/cloud-backups'
import type { ProView } from '../pro'
import { DemoTipBrand } from './features/tip-brand'
import { DemoTtsVoices } from './features/tts-voices'
import { DemoWeeklyEmail, type DemoWeeklyEmailState } from './features/weekly-email'
import { DemoAutoReplies } from './features/autoreplies'
import { DemoRemote } from './features/remote'
import { remoteAllowed, remoteLiveAllowed, type RemoteRole } from '../remote'
import {
  CHATTERS,
  FILTERS,
  MESSAGES,
  NO_TIPS,
  PANIC,
  SETTINGS,
  THEMES,
  TIPS,
  TTS,
  VOICES,
  DEMO_TIP_HOST,
  presetWidgets,
  seedBans,
  seedCommands,
  seedGoals,
  seedOverlays,
  seedRules,
  seedTimers,
  tipWebhooks,
} from './seed'

export interface Fault {
  method?: string
  /** Matched against the path without the query string. */
  path: string | RegExp
  status: number
  code?: string
  message?: string
  hint?: string
  retryAfter?: number
  /** How many requests it applies to (default 1, Infinity for "until cleared"). */
  times?: number
}

export interface DemoOptions {
  base?: string
  /** Generate chat and alerts on timers (default true). */
  autoplay?: boolean
  seed?: number
  /** Whether first-run setup is already finished (default true). */
  setupDone?: boolean
  /** Fake network delay in ms (default 60–180 random; 0 in tests). */
  latencyMs?: number
  /** Accept any pairing code except these special ones (see `pair`). */
  token?: string
  /** Whether this build has a relay (default true). Without one, saving tips is a 422. */
  relay?: boolean
  /** Start with a tip page set up (default) or none saved yet. */
  tips?: 'set' | 'empty'
  /** The built-in design catalogue (`@ferrocast/designs`); none by default. */
  designs?: readonly Design[]
  /** Pro's starting state: off sale, not Pro, no features (like the real relay today). */
  pro?: DemoProSetup
  /** Pro stream history: a demo year of streams (default) or none yet. */
  history?: 'demo' | 'empty'
  /** Pro cloud backups: a few from this PC (default), none yet, or a new PC's view. */
  cloudBackups?: DemoCloudMode
  /** Pro "Dashboard anywhere": act as a paired phone with this role (and PC on or off). */
  remote?: { role: RemoteRole; pcOnline?: boolean }
}

/** Tip page names someone else already has, for trying the 409 in the demo. */
export const DEMO_TAKEN_HANDLES: readonly string[] = ['asha', 'rohanlive', 'meghna']

export const DEMO_TOKEN = 'demo-session'

/** The version the demo engine says it is. */
const DEMO_VERSION = '0.4.0'
/** Pairing codes the demo treats specially, for tests of the pairing screen. */
export const DEMO_PAIR = { expired: 'EXPIRED', used: 'USED00' } as const

const LIMITS: Record<MediaKind, { bytes: number; types: string[]; label: string }> = {
  image: {
    bytes: 10 * 1024 * 1024,
    types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    label: 'Images can be up to 10 MB.',
  },
  sound: {
    bytes: 5 * 1024 * 1024,
    types: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave'],
    label: 'Sounds can be up to 5 MB.',
  },
  video: {
    bytes: 50 * 1024 * 1024,
    types: ['video/webm', 'video/mp4'],
    label: 'Videos can be up to 50 MB.',
  },
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomToken(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

const clone = <T>(v: T): T => structuredClone(v)

function connector(
  state: ConnectorState['state'],
  name: string | null,
  detail: string | null = null,
): ConnectorState {
  return {
    state,
    account: name ? { name, avatar_url: null } : null,
    detail,
    last_event_at: state === 'connected' ? Date.now() : null,
  }
}

type LiveSub = { sock: FakeSocket }
/** The demo acting as a phone through the relay (`?remote=owner|mod`). */
type DemoRemoteSession = { role: RemoteRole; pcOnline: boolean }
type OverlaySub = {
  sock: FakeSocket
  overlayId: string
  seq: number
  visible: boolean
  test: boolean
}

/** A WebSocket look-alike wired to the engine instead of the network. */
class FakeSocket implements SocketLike {
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onClientFrame: ((data: string) => void) | null = null
  onClosed: (() => void) | null = null

  open(): void {
    if (this.readyState !== 0) return
    this.readyState = 1
    this.onopen?.({})
  }
  deliver(data: unknown): void {
    if (this.readyState !== 1) return
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  send(data: string): void {
    if (this.readyState !== 1) throw new Error('socket not open')
    this.onClientFrame?.(data)
  }
  close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onClosed?.()
    queueMicrotask(() => this.onclose?.({ code: 1000 }))
  }
  /** Server-side drop (tests: "socket drops"), with a close code (1006: no close frame). */
  drop(code = 1006): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onClosed?.()
    this.onerror?.({})
    this.onclose?.({ code })
  }
}

export class DemoEngine {
  readonly base: string
  private readonly rand: () => number
  private readonly latency: number | null
  private faults: (Fault & { left: number })[] = []
  private offline = false
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private autoplayOn = false

  // State
  setupDone: boolean
  private seq = 1000
  private alertSeq = 0
  private connectors: Connectors
  private accounts: Account[]
  private overlays: Overlay[]
  private overlayTokens = new Map<string, string>()
  private rules: AlertRule[]
  private queue = new AlertQueue()
  private queueTimer: ReturnType<typeof setTimeout> | null = null
  private events: FerroEvent[] = []
  private why = new Map<string, string[]>()
  private goals: Goal[]
  private bans: BanEntry[]
  private filters: Filters = clone(FILTERS)
  /** Messages the chat filter held for a mod, oldest first: event id → reason. */
  private heldMsgs = new Map<string, string>()
  private panicCfg: PanicConfig = clone(PANIC)
  private panicOn = false
  private commands: Command[] = seedCommands()
  private timersList: Timer[] = seedTimers()
  private tts: TtsSettings = clone(TTS)
  private ttsPending: TtsPending[] = []
  private tips: TipSettings = clone(TIPS)
  /** Webhook secrets as the relay keeps them. Never sent back. */
  private tipSecrets: Partial<Record<TipProviderKey, string>> = {
    razorpay: 'demo-razorpay-secret',
  }
  /** When the tip page name changed, for the 3-a-day limit. */
  private tipHandleChanges: number[] = []
  /** The name of a page this install took down; putting it back isn't a new name. */
  private releasedTipHandle: string | null = null
  private relayOn: boolean
  private media: Media[] = []
  /** The bytes behind each library file (design files carry them). */
  private mediaBlobs = new Map<string, Blob>()
  /** Designs: the catalogue, your own, Use, the alert design in use, share files. */
  readonly designs: DemoDesigns
  private obs: ObsState = {
    state: 'connected',
    version: '31.1.2',
    scene: 'Gameplay',
    host: '127.0.0.1',
    port: 4455,
    has_password: true,
    auto: true,
    detail: null,
  }
  private settings: Settings = clone(SETTINGS)
  private backups: Backup[]
  /** LAN access as the "server" started with (it only changes at a restart). */
  private readonly lanAtStart = false
  private notes = new Map<string, string>()
  private stats: SessionStats
  private labels = new Map<string, string>()
  private viewers: Partial<Record<Platform, number>> = { twitch: 412, youtube: 188, kick: 57 }
  private liveSubs = new Set<LiveSub>()
  private overlaySubs = new Set<OverlaySub>()
  private readonly token: string
  private readonly host: DemoHost
  /** Loyalty points (balances, settings, leaderboard). */
  readonly loyalty: DemoLoyalty
  /** Chat polls (`!vote N`). */
  readonly polls: DemoPolls
  /** Giveaways (`!join`). */
  readonly giveaways: DemoGiveaways
  /** First-time chatter marks and the welcome setting. */
  readonly welcome: DemoWelcome
  private readonly recap: DemoRecap
  private readonly pro: DemoPro
  /** The Ferrocast bot in Discord (Pro): go-live posts and roles. */
  private readonly discordPro = new DemoDiscordPro(
    () => this.pro.route('GET', ['pro'], undefined) as ProView,
  )
  private readonly discord = new DemoDiscord(() => this.discordPro.proGoLive())
  /** The 24/7 cloud bot (Pro): Twitch and Kick while the PC is off. */
  private readonly cloudBot = new DemoCloudBot(
    () => this.pro.route('GET', ['pro'], undefined) as ProView,
  )
  private readonly history: DemoHistory
  private readonly cloudBackups: DemoCloudBackups
  /** Pro tip page branding and goal (on with Pro and its feature). */
  private readonly tipBrand = new DemoTipBrand(
    () => {
      const v = this.pro.route('GET', ['pro'], undefined) as ProView
      return v.active && v.features.tip_brand
    },
    () => this.tips,
  )
  /** Ferrocast voices (Pro): listed with Pro and the feature, previews count characters. */
  private readonly ttsVoices = new DemoTtsVoices(
    () => this.pro.route('GET', ['pro'], undefined) as ProView,
    () => VOICES,
    () => this.tts.voice,
  )
  /** Pro's weekly email: the double opt-in, the address only as a hint. */
  readonly weeklyEmail = new DemoWeeklyEmail(
    () => this.pro.route('GET', ['pro'], undefined) as ProView,
  )
  /** Pro "Dashboard anywhere": devices, links, the audit (Settings on the PC). */
  readonly remoteDevices = new DemoRemote(
    () => this.pro.route('GET', ['pro'], undefined) as ProView,
  )
  /** Acting as a phone: the role and whether the PC is on. */
  private remote: DemoRemoteSession | null = null
  /** Studio: counters, quotes, modules, stream info, show, OBS helpers, moments. */
  readonly studio: DemoStudio
  readonly autoReplies: DemoAutoReplies
  private readonly starter = new DemoStarter(() => this.commands)
  private readonly importers = new DemoImporters(
    () => this.commands,
    (c) => {
      this.commands = c
    },
    () => this.timersList,
    (t) => {
      this.timersList = t
    },
    // Logins only: display names never match anyone (anyone can set one).
    () => this.host.knownActors().flatMap((a) => (a.login ? [a.login] : [])),
    (label) => this.takeBackup(label),
  )
  private readonly obsDetect = new DemoObsDetect(
    () => true,
    () => this.obs.auto !== false,
    (port) => {
      this.obs = {
        state: 'connected',
        version: '31.1.2',
        scene: 'Gameplay',
        host: '127.0.0.1',
        port,
        has_password: true,
        auto: true,
        detail: null,
      }
      this.setConnector('obs', connector('connected', 'OBS 31.1.2'))
      return clone(this.obs)
    },
  )

  constructor(opts: DemoOptions = {}) {
    this.base = opts.base ?? 'http://127.0.0.1:47820'
    this.rand = mulberry32(opts.seed ?? 20261017)
    this.latency = opts.latencyMs ?? null
    this.setupDone = opts.setupDone ?? true
    this.token = opts.token ?? DEMO_TOKEN
    this.relayOn = opts.relay ?? true
    this.pro = new DemoPro(opts.pro)
    this.history = new DemoHistory(
      () => this.pro.route('GET', ['pro'], null) as ProView,
      opts.history === 'empty',
    )
    this.cloudBackups = new DemoCloudBackups(
      () => this.pro.route('GET', ['pro'], null) as ProView,
      (label) => this.takeBackup(label),
      opts.cloudBackups ?? 'demo',
    )
    if (opts.tips === 'empty') this.resetTips()
    if (opts.remote)
      this.remote = { role: opts.remote.role, pcOnline: opts.remote.pcOnline ?? true }
    const now = Date.now()
    const on = this.setupDone
    this.connectors = {
      twitch: on ? connector('connected', 'NovaPlays') : connector('off', null),
      youtube: on ? connector('connected', 'Nova Plays') : connector('off', null),
      kick: on ? connector('connected', 'novaplays') : connector('off', null),
      obs: on
        ? connector('connected', 'OBS 31.1.2')
        : connector('disconnected', null, 'OBS isn’t running, or its WebSocket server is off.'),
      relay: connector('connected', null),
    }
    if (!on)
      this.obs = {
        state: 'disconnected',
        version: null,
        scene: null,
        host: '127.0.0.1',
        port: 4455,
        has_password: true,
        auto: true,
        detail: 'OBS isn’t running, or its WebSocket server is off.',
      }
    this.accounts = on
      ? [
          {
            platform: 'twitch',
            name: 'NovaPlays',
            avatar_url: null,
            connected_at: now - 40 * 86_400_000,
            scopes_ok: true,
          },
          {
            platform: 'youtube',
            name: 'Nova Plays',
            avatar_url: null,
            connected_at: now - 40 * 86_400_000,
            scopes_ok: true,
          },
          {
            platform: 'kick',
            name: 'novaplays',
            avatar_url: null,
            connected_at: now - 12 * 86_400_000,
            scopes_ok: true,
          },
        ]
      : []
    // A fresh install has no overlay yet; first run makes one (like the real engine).
    this.overlays = this.setupDone ? seedOverlays(this.base, (id) => this.tokenFor(id), now) : []
    this.rules = seedRules()
    this.goals = seedGoals(now)
    this.bans = seedBans(now)
    // Newest first, like the engine.
    this.backups = [
      {
        id: `${now - 86_400_000}-daily`,
        created_at: now - 86_400_000,
        reason: 'daily',
        bytes: 2_498_302,
        version: DEMO_VERSION,
      },
      {
        id: `${now - 2 * 86_400_000}-before-update`,
        created_at: now - 2 * 86_400_000,
        reason: 'update',
        bytes: 2_431_118,
        version: '0.3.0',
      },
    ]
    this.media = [
      { id: 'm-chime', kind: 'sound', name: 'Ferro chime.wav', bytes: 8844, url: chimeDataUrl() },
    ]
    for (const r of this.rules) for (const v of r.variations) v.sound = 'm-chime'
    this.stats = {
      live: true,
      started_at: now - 2 * 3_600_000 - 14 * 60_000,
      follows: 23,
      subs: 7,
      tips: [{ minor: 345_000, currency: 'INR' }],
      bits: 2300,
      messages: 1841,
      peak_viewers: 702,
      viewers: { twitch: 412, youtube: 188, kick: 57 },
    }
    this.labels.set('latest_follower', 'LunaLagoon')
    this.labels.set('latest_sub', 'DesertFoxx')
    this.labels.set('latest_tip', 'Asha (₹500)')
    this.host = this.makeHost()
    this.loyalty = new DemoLoyalty(this.host)
    this.polls = new DemoPolls(this.host)
    this.giveaways = new DemoGiveaways(this.host, this.loyalty)
    this.welcome = new DemoWelcome(this.host)
    this.studio = new DemoStudio(this.host, () => this.commands)
    this.autoReplies = new DemoAutoReplies(this.host, {
      botOn: () =>
        (this.settings as { bot_enabled?: boolean }).bot_enabled !== false && !this.panicOn,
      commands: () => this.commands,
      game: () => this.studio.history.find((h) => h.info.category)?.info.category?.name ?? null,
      title: () => this.studio.history.find((h) => h.info.title)?.info.title ?? null,
    })
    this.designs = new DemoDesigns(
      {
        overlays: () => this.overlays,
        findOverlay: (id) => this.findOverlay(id),
        putOverlay: (o) => this.putOverlay(o),
        newOverlay: (name, scene, design, layers) => {
          const id = `ov-${randomToken().slice(0, 10)}`
          let unique = name
          for (
            let n = 2;
            this.overlays.some((x) => x.name.toLowerCase() === unique.toLowerCase());
            n++
          )
            unique = `${name.slice(0, 56)} ${n}`
          const o: Overlay = {
            id,
            name: unique,
            url: `${this.base}/o/${this.tokenFor(id)}/`,
            width: scene.width,
            height: scene.height,
            widgets: clone(layers),
            updated_at: Date.now(),
            design,
          }
          this.overlays.push(o)
          return clone(o)
        },
        media: (id) => {
          const m = this.media.find((x) => x.id === id)
          return m ? { media: m, blob: this.mediaBlobs.get(id) ?? null } : null
        },
        addMedia: (name, blob, kind) => {
          const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : ''
          const m: Media = {
            id: `m${randomToken().slice(0, 10)}`,
            kind,
            name,
            bytes: blob.size,
            url,
          }
          this.media.push(m)
          this.mediaBlobs.set(m.id, blob)
          return clone(m)
        },
        now: () => Date.now(),
        newId: () => `d${randomToken().slice(0, 16)}`,
      },
      opts.designs ?? [],
    )
    this.recap = new DemoRecap(() => ({
      events: this.events,
      stats: this.stats,
      live: this.isLive(),
    }))
    this.seedHistory(now)
    this.welcome.arm(this.events)
    if (opts.autoplay ?? true) this.startAutoplay()
  }

  // ---------------------------------------------------------------- test hooks

  /** Builds with and without a relay (saving tips without one is a 422). */
  setRelay(on: boolean): void {
    this.relayOn = on
  }

  /** Pro on sale, active or with its features on (tests of Pro panels). */
  setPro(s: DemoProSetup): void {
    this.pro.setup(s)
  }

  /** Stream history with no streams yet (true) or the demo year (false). */
  setHistoryEmpty(on: boolean): void {
    this.history.setEmpty(on)
  }

  /** The weekly email: start pending / on (maybe with a new address waiting) / paused, or the
   * confirm link pressed. */
  setWeeklyEmail(state: DemoWeeklyEmailState & { confirm?: boolean }): void {
    const { confirm, ...rest } = state
    this.weeklyEmail.setState(rest)
    if (confirm) this.weeklyEmail.confirm()
  }

  /** Ferrocast voices: the relay-wide cap reached (`resting`), or this month's characters. */
  setTtsVoices(state: { resting?: boolean; used?: number }): void {
    this.ttsVoices.setState(state)
  }

  /** The Ferrocast bot (Pro): start connected, or Discord unreachable. */
  setDiscordPro(state: {
    connected?: boolean
    discordDown?: boolean
    perkBlocked?: boolean
  }): void {
    this.discordPro.setState(state)
  }

  /** The cloud bot (Pro): nothing connected, the PC gone quiet, Twitch revoked, Kick unlinked. */
  setCloudBot(state: DemoCloudBotState): void {
    this.cloudBot.setState(state)
  }

  /** Pro cloud backups: this PC's few (demo), none yet, or a new PC's view. */
  setCloudBackups(mode: DemoCloudMode): void {
    this.cloudBackups.setMode(mode)
  }

  /** Acting as a phone: the relay closes its live sockets with `code` (4401 removed…). */
  closeRemoteLive(code: number): void {
    for (const sub of [...this.liveSubs]) sub.sock.drop(code)
  }

  /** Acting as a phone: calls the role may not make that still reached "the relay" (tests). */
  readonly remoteRefused: string[] = []

  /** Acting as a phone: the streaming PC goes off or comes back (a `remote` frame says so). */
  setRemotePc(online: boolean): void {
    if (!this.remote) return
    this.remote.pcOnline = online
    this.broadcastLive({
      v: 1,
      type: 'remote',
      data: { pc_online: online, role: this.remote.role },
    })
  }

  /** Back to "no tip page ever saved" (tests of the first-time setup). */
  resetTips(): void {
    this.tips = clone(NO_TIPS)
    this.tipSecrets = {}
    this.tipHandleChanges = []
  }

  addFault(f: Fault): void {
    this.faults.push({ ...f, left: f.times ?? 1 })
  }
  clearFaults(): void {
    this.faults = []
  }
  setOffline(offline: boolean): void {
    this.offline = offline
    if (offline) {
      for (const s of this.liveSubs) s.sock.drop()
      for (const s of this.overlaySubs) s.sock.drop()
    }
  }
  /** Drops every open socket, as a crash or network blip would. */
  dropSockets(): void {
    for (const s of this.liveSubs) s.sock.drop()
    for (const s of this.overlaySubs) s.sock.drop()
  }
  get liveSocketCount(): number {
    return this.liveSubs.size
  }
  get overlaySocketCount(): number {
    return this.overlaySubs.size
  }

  /** Fires an event as if it came from a platform. */
  inject(kind: EventKind, platform: Platform, origin: FerroEvent['origin'] = 'live'): FerroEvent {
    return this.ingest(kind, platform, origin)
  }

  /** Fires a sample of `kind` (follow, tip…) through the pipeline. */
  injectSample(
    kind: string,
    platform?: Platform,
    origin: FerroEvent['origin'] = 'live',
  ): FerroEvent | null {
    const s = platform ? sample(kind, platform) : anySample(kind)
    if (!s) return null
    return this.ingest(s.kind, s.platform, origin)
  }

  startAutoplay(): void {
    if (this.autoplayOn) return
    this.autoplayOn = true
    const chatLoop = () => {
      if (!this.autoplayOn) return
      if (this.anyChatConnected()) this.randomChat()
      this.later(chatLoop, 900 + this.rand() * 1800)
    }
    const eventLoop = () => {
      if (!this.autoplayOn) return
      if (this.anyChatConnected()) this.randomSupport()
      this.later(eventLoop, 7000 + this.rand() * 9000)
    }
    const viewerLoop = () => {
      if (!this.autoplayOn) return
      this.driftViewers()
      this.later(viewerLoop, 10_000)
    }
    this.later(chatLoop, 600)
    this.later(eventLoop, 3500)
    this.later(viewerLoop, 10_000)
  }

  stopAutoplay(): void {
    this.autoplayOn = false
  }

  /** Stops every timer and closes sockets (tests, page unload). */
  dispose(): void {
    this.autoplayOn = false
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    if (this.queueTimer) clearTimeout(this.queueTimer)
    for (const s of this.liveSubs) s.sock.close()
    for (const s of this.overlaySubs) s.sock.close()
    for (const m of this.media) revokeBlobUrl(m.url)
    this.mediaBlobs.clear()
  }

  // ---------------------------------------------------------------- transport

  fetch: FetchLike = async (input, init) => {
    if (this.latency === null) await new Promise((r) => setTimeout(r, 60 + this.rand() * 120))
    else if (this.latency > 0) await new Promise((r) => setTimeout(r, this.latency ?? 0))
    if (this.offline) throw new TypeError('Failed to fetch')
    const url = new URL(input, this.base)
    const method = (init?.method ?? 'GET').toUpperCase()
    const fault = this.takeFault(method, url.pathname)
    if (fault)
      return this.errorResponse(
        new HttpError(
          fault.status,
          fault.code ?? defaultCode(fault.status),
          fault.message ?? defaultMessage(fault.status),
          fault.hint,
          fault.retryAfter,
        ),
      )
    try {
      if (url.pathname.startsWith('/api/v1/') && url.pathname !== '/api/v1/session/pair') {
        const auth = headerOf(init?.headers, 'authorization')
        if (auth !== `Bearer ${this.token}`)
          throw new HttpError(
            401,
            'unauthorized',
            'This session has ended.',
            'Open the dashboard again from the Ferrocast app.',
          )
      }
      if (this.remote && url.pathname.startsWith('/api/v1/')) {
        // Like the relay: the role first, then whether the PC is there at all.
        const rel = url.pathname.slice('/api/v1'.length)
        if (!remoteAllowed(this.remote.role, method, rel)) {
          // What the relay would have logged; the dashboard should never send these.
          this.remoteRefused.push(`${method} ${rel}`)
          throw new HttpError(
            403,
            'not_allowed_for_role',
            this.remote.role === 'mod'
              ? 'Mods can’t do that from here.'
              : 'That only works on the streaming PC.',
            'Accounts, secrets, Pro, export and import stay on the PC itself.',
          )
        }
        if (!this.remote.pcOnline)
          throw new HttpError(
            503,
            'pc_offline',
            'Your streaming PC is off.',
            'Turn it on and open Ferrocast. This works again on its own.',
          )
      }
      const body = await readBody(init?.body)
      const result = await this.route(method, url, body)
      if (result instanceof Response) return result
      if (result === undefined) return new Response(null, { status: 204 })
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      if (e instanceof HttpError) return this.errorResponse(e)
      return this.errorResponse(
        new HttpError(422, 'demo_error', 'The demo engine could not do that.', String(e)),
      )
    }
  }

  socket: SocketFactory = (rawUrl) => {
    const sock = new FakeSocket()
    const url = new URL(rawUrl.replace(/^ws/, 'http'))
    setTimeout(() => {
      if (this.offline) {
        sock.drop()
        return
      }
      if (url.pathname === '/api/v1/live') {
        if (url.searchParams.get('session') !== this.token) {
          sock.drop()
          return
        }
        const sub: LiveSub = { sock }
        const remote = this.remote
        if (remote) {
          // A phone's socket: the relay says whether the PC is on, and mods get chat frames only.
          const deliver = sock.deliver.bind(sock)
          sock.deliver = (data: unknown) => {
            const f = (typeof data === 'string' ? JSON.parse(data) : data) as { type?: unknown }
            if (remoteLiveAllowed(remote.role, f) && (remote.pcOnline || f.type === 'remote'))
              deliver(data)
          }
        }
        sock.onClosed = () => this.liveSubs.delete(sub)
        sock.onClientFrame = () => {
          /* the dashboard sends only pings */
        }
        this.liveSubs.add(sub)
        sock.open()
        if (remote)
          sock.deliver({
            v: 1,
            type: 'remote',
            data: { pc_online: remote.pcOnline, role: remote.role },
          })
        sock.deliver({ v: 1, type: 'hello', data: { seq: this.seq } })
        sock.deliver({ v: 1, type: 'status', data: { connectors: clone(this.connectors) } })
        sock.deliver({ v: 1, type: 'queue', data: this.queue.snapshot() })
        sock.deliver({ v: 1, type: 'tts_pending', data: clone(this.ttsPending) })
        // Resume after a blip (API-REQUESTS R11): replay what was missed, or ask for a resync.
        const since = Number(url.searchParams.get('since'))
        if (url.searchParams.has('since') && Number.isFinite(since)) {
          const missed = this.events.filter((e) => e.seq > since)
          if (missed.length > 300 || (this.events[0] && this.events[0].seq > since + 1))
            sock.deliver({ v: 1, type: 'resync', data: { missed: missed.length } })
          else for (const e of missed) sock.deliver({ v: 1, type: 'event', data: e })
        }
        return
      }
      const m = /^\/o\/([^/]+)\/ws$/.exec(url.pathname)
      const overlayId = m ? this.overlayIdForToken(decodeURIComponent(m[1] ?? '')) : null
      if (!overlayId) {
        sock.drop()
        return
      }
      const sub: OverlaySub = {
        sock,
        overlayId,
        seq: 0,
        visible: true,
        test: url.searchParams.has('test'),
      }
      sock.onClosed = () => this.overlaySubs.delete(sub)
      sock.onClientFrame = (data) => this.overlayClientFrame(sub, data)
      this.overlaySubs.add(sub)
      sock.open()
      this.sendSnapshot(sub)
      if (sub.test) this.testLoop(sub)
    }, 0)
    return sock
  }

  /** The overlay token inside an overlay URL (`…/o/<token>/`). */
  tokenFor(overlayId: string): string {
    let t = this.overlayTokens.get(overlayId)
    if (!t) {
      t = randomToken()
      this.overlayTokens.set(overlayId, t)
    }
    return t
  }

  private overlayIdForToken(token: string): string | null {
    for (const [id, t] of this.overlayTokens) if (t === token) return id
    return null
  }

  private takeFault(method: string, path: string): Fault | null {
    for (const f of this.faults) {
      if (f.left <= 0) continue
      if (f.method && f.method.toUpperCase() !== method) continue
      const hit = typeof f.path === 'string' ? f.path === path : f.path.test(path)
      if (!hit) continue
      f.left -= 1
      return f
    }
    return null
  }

  private errorResponse(e: HttpError): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (e.retryAfter !== undefined) headers['Retry-After'] = String(e.retryAfter)
    else if (e.status === 503) headers['Retry-After'] = '1'
    else if (e.status === 429) headers['Retry-After'] = '5'
    const error: { code: string; message: string; hint?: string } = {
      code: e.code,
      message: e.message,
    }
    if (e.hint) error.hint = e.hint
    return new Response(JSON.stringify({ error }), { status: e.status, headers })
  }

  // ---------------------------------------------------------------- tips

  private resetTipsKeepingChanges(): void {
    if (this.tips.handle) this.releasedTipHandle = this.tips.handle
    const changes = this.tipHandleChanges
    this.resetTips()
    this.tipHandleChanges = changes
  }

  /** `PUT /api/v1/tips`, checked in the engine's and relay's order. */
  private saveTips(body: unknown): TipSettings {
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new HttpError(
        400,
        'invalid',
        'The tip page settings must be an object.',
        'Send { handle, display_name, message, razorpay?, kofi?, stripe? }.',
      )
    if (!this.relayOn)
      throw new HttpError(
        422,
        'unavailable',
        'This build of Ferrocast has no relay set up, so the tip page can’t be saved.',
        'Use an official Ferrocast build, or set a relay URL when building it.',
      )
    const b = body as Record<string, unknown>
    const str = (v: unknown, field: string): string => {
      if (v === undefined || v === null) return ''
      if (typeof v !== 'string')
        throw new HttpError(400, 'invalid', `The settings aren’t valid: ${field} must be text.`)
      return v
    }
    const bad = (m: string) => new HttpError(400, 'invalid', m)
    const handle = normaliseTipHandle(str(b.handle, 'handle'))
    const handleProblem = tipHandleProblem(handle)
    if (handleProblem) throw bad(handleProblem)
    const rawName = str(b.display_name, 'display_name')
    const nameProblem = tipDisplayNameProblem(rawName)
    if (nameProblem) throw bad(nameProblem)
    const rawMessage = str(b.message, 'message')
    const messageProblem = tipMessageProblem(rawMessage)
    if (messageProblem) throw bad(messageProblem)

    const next: Partial<Record<TipProviderKey, TipProviderState | null>> = {}
    const secrets: Partial<Record<TipProviderKey, string>> = {}
    for (const key of TIP_PROVIDER_KEYS) {
      const raw = b[key]
      if (raw === undefined || raw === null) {
        next[key] = null
        continue
      }
      if (typeof raw !== 'object' || Array.isArray(raw))
        throw bad(`The settings aren’t valid: ${key} must be an object or null.`)
      const p = raw as Partial<Record<keyof TipProviderInput, unknown>>
      const rawUrl = str(p.page_url, `${key}.page_url`)
      const pageUrl = checkedTipPage(key, rawUrl)
      if (!pageUrl) throw bad(tipLinkProblem(key, rawUrl) ?? 'That payment link isn’t valid.')
      let secret = str(p.secret, `${key}.secret`).trim()
      if (secret === '') secret = this.tipSecrets[key] ?? ''
      const secretProblem = tipSecretProblem(key, secret, false)
      if (secretProblem) throw bad(secretProblem)
      const rawId =
        p.page_id === undefined || p.page_id === null ? '' : str(p.page_id, `${key}.page_id`)
      const idProblem = tipPageIdProblem(key, rawId)
      if (idProblem) throw bad(idProblem)
      if (p.test_mode !== undefined && typeof p.test_mode !== 'boolean')
        throw bad(`The settings aren’t valid: ${key}.test_mode must be true or false.`)
      next[key] = {
        page_url: pageUrl,
        page_id: rawId.trim() || null,
        test_mode: p.test_mode === true,
        has_secret: true,
      }
      secrets[key] = secret
    }

    // The relay: someone else's name is a 409 before the daily limit is counted.
    if (DEMO_TAKEN_HANDLES.includes(handle))
      throw new HttpError(
        409,
        'taken',
        'That tip page name is taken.',
        'Pick another name; names someone just let go stay with them for 30 days.',
      )
    const reclaiming = this.tips.handle === '' && handle === this.releasedTipHandle
    if (handle !== this.tips.handle && !reclaiming) {
      const now = Date.now()
      this.tipHandleChanges = this.tipHandleChanges.filter((t) => now - t < 86_400_000)
      if (this.tipHandleChanges.length >= TIP_LIMITS.handleChangesPerDay)
        throw new HttpError(
          429,
          'rate_limited',
          'You changed your tip page name too often today.',
          'Try again tomorrow. Your current name keeps working.',
        )
      this.tipHandleChanges.push(now)
    }
    this.tipSecrets = secrets
    this.tips = {
      handle,
      display_name: cleanTipText(rawName),
      message: cleanTipText(rawMessage, TIP_LIMITS.messageMax),
      page_url: `${DEMO_TIP_HOST}/${handle}`,
      webhooks: tipWebhooks(),
      razorpay: next.razorpay ?? null,
      kofi: next.kofi ?? null,
      stripe: next.stripe ?? null,
    }
    return clone(this.tips)
  }

  // ---------------------------------------------------------------- routes

  private async route(method: string, url: URL, body: unknown): Promise<unknown> {
    const p = url.pathname
    const seg = p.split('/').filter(Boolean).slice(2).map(decodeURIComponent) // after api/v1
    const [a, b, c] = seg
    const is = (m: string, ...parts: (string | null)[]) =>
      method === m &&
      seg.length === parts.length &&
      parts.every((x, i) => x === null || x === seg[i])

    if (!p.startsWith('/api/v1/')) throw new HttpError(404, 'not_found', 'That page doesn’t exist.')

    // Feature modules answer their own routes (points, polls, giveaways…).
    for (const f of this.features()) {
      const r = f.route(method, seg, body, url)
      if (r !== NOT_MINE) return r
    }

    // status and session
    if (is('GET', 'status')) return this.status()
    if (is('POST', 'session', 'pair')) return this.pair(body)
    if (is('POST', 'session', 'pair-code')) {
      // Like the engine: LAN access applies at the next start, and the demo never restarts.
      const active = this.lanAtStart
      return {
        code: 'K7M2QX',
        url: `${active ? 'http://192.168.1.24:47820' : this.base}/app/#pair=K7M2QX`,
        expires_at: Date.now() + 120_000,
        lan: { active, restart_needed: this.settings.lan_access && !active },
      }
    }
    if (is('POST', 'setup', 'complete')) {
      this.setupDone = true
      return undefined
    }

    // accounts
    if (is('GET', 'accounts')) return clone(this.accounts)
    if (is('POST', 'accounts', null, 'connect')) return this.connect(b ?? '')
    if (is('DELETE', 'accounts', null)) return this.disconnect(b ?? '')

    // overlays and themes
    if (is('GET', 'themes')) return clone(THEMES)
    if (is('GET', 'overlays')) return clone(this.overlays)
    if (is('POST', 'overlays')) return this.createOverlay(body)
    if (is('GET', 'overlays', null)) return clone(this.findOverlay(b ?? ''))
    if (is('PUT', 'overlays', null)) return this.saveOverlay(b ?? '', body)
    if (is('DELETE', 'overlays', null)) {
      this.findOverlay(b ?? '')
      this.overlays = this.overlays.filter((o) => o.id !== b)
      this.revoke(b ?? '')
      return undefined
    }
    if (is('POST', 'overlays', null, 'regenerate-url')) return this.regenerate(b ?? '')
    if (is('POST', 'overlays', null, 'add-to-obs')) {
      const o = this.findOverlay(b ?? '')
      if (this.connectors.obs.state !== 'connected')
        throw new HttpError(
          422,
          'obs_not_connected',
          'OBS isn’t connected.',
          'Open OBS, turn on Tools → WebSocket Server Settings, then try again. Or copy the URL instead.',
        )
      return { scene: this.obs.scene ?? 'Scene', source: `Ferrocast: ${o.name}` }
    }

    // alerts
    if (is('GET', 'alert-rules')) return clone(this.rules)
    if (is('POST', 'alert-rules')) return this.saveRule(null, body)
    if (is('PUT', 'alert-rules', null)) return this.saveRule(b ?? '', body)
    if (is('DELETE', 'alert-rules', null)) {
      if (!this.rules.some((r) => r.id === b))
        throw new HttpError(
          404,
          'rule_not_found',
          'That alert rule doesn’t exist anymore.',
          'Reload the alerts list.',
        )
      this.rules = this.rules.filter((r) => r.id !== b)
      return undefined
    }
    if (is('POST', 'test')) return this.test(body)
    if (is('GET', 'queue')) return this.queue.snapshot()
    if (method === 'POST' && a === 'queue' && seg.length === 2) return this.queueControl(b ?? '')
    if (is('POST', 'queue', null, 'remove')) {
      if (!this.queue.remove(b ?? ''))
        throw new HttpError(404, 'alert_not_found', 'That alert already played or was removed.')
      this.broadcastQueue()
      return this.queue.snapshot()
    }
    if (is('POST', 'events', null, 'replay')) return this.replayEvent(b ?? '')
    if (is('GET', 'events')) return this.listEvents(url)
    if (is('GET', 'events', null, 'why')) {
      const e = this.events.find((x) => x.id === b)
      if (!e) throw new HttpError(404, 'event_not_found', 'That event is no longer in the log.')
      return this.whyFor(e)
    }

    // goals
    if (is('GET', 'goals')) return clone(this.goals)
    if (is('POST', 'goals')) {
      const g = requireObj(body) as Partial<Goal>
      if (!g.title?.trim()) throw new HttpError(400, 'invalid', 'title: give the goal a name.')
      if (!(typeof g.target === 'number' && g.target > 0))
        throw new HttpError(400, 'invalid', 'target: must be more than 0.')
      const goal: Goal = {
        id: `g-${randomToken().slice(0, 8)}`,
        title: g.title.trim(),
        kind: g.kind ?? 'custom',
        target: g.target,
        currency: g.currency ?? null,
        starts_at: g.starts_at ?? Date.now(),
        ends_at: g.ends_at ?? null,
        current: 0,
      }
      this.goals.push(goal)
      this.pushState({ goals: this.goals })
      return goal
    }
    if (is('PUT', 'goals', null)) {
      const i = this.goals.findIndex((g) => g.id === b)
      if (i < 0) throw new HttpError(404, 'goal_not_found', 'That goal doesn’t exist anymore.')
      const g = requireObj(body) as Goal
      this.goals[i] = { ...g, id: b ?? g.id }
      this.pushState({ goals: this.goals })
      return clone(this.goals[i])
    }
    if (is('DELETE', 'goals', null)) {
      this.goals = this.goals.filter((g) => g.id !== b)
      this.pushState({ goals: this.goals })
      return undefined
    }
    if (is('POST', 'goals', null, 'adjust')) {
      const g = this.goals.find((x) => x.id === b)
      if (!g) throw new HttpError(404, 'goal_not_found', 'That goal doesn’t exist anymore.')
      const delta = (requireObj(body) as { delta?: unknown }).delta
      if (typeof delta !== 'number' || !Number.isFinite(delta))
        throw new HttpError(400, 'invalid', 'delta: must be a number.')
      g.current = Math.max(0, g.current + delta)
      this.pushState({ goals: this.goals })
      return clone(g)
    }

    // chat and moderation
    if (is('GET', 'chat')) {
      const limit = clampInt(url.searchParams.get('limit'), 1, 500, 200)
      return clone(this.events.filter((e) => e.kind.type === 'chat_message').slice(-limit))
    }
    if (is('POST', 'chat', 'send')) return this.sendChat(body)
    if (is('POST', 'mod', 'delete')) return this.modDelete(body)
    if (is('POST', 'mod', 'timeout')) return this.modTimeout(body)
    if (is('POST', 'mod', 'ban')) return this.modBan(body)
    if (is('POST', 'mod', 'unban')) {
      const o = requireObj(body) as { platform?: string; user_id?: string }
      const before = this.bans.length
      this.bans = this.bans.filter((x) => !(x.user_id === o.user_id && x.platform === o.platform))
      if (before === this.bans.length)
        throw new HttpError(404, 'ban_not_found', 'That person isn’t on the ban list.')
      return undefined
    }
    if (is('GET', 'mod', 'bans')) return clone(this.bans)
    if (is('GET', 'mod', 'held'))
      return [...this.heldMsgs.keys()].flatMap((id) => {
        const e = this.events.find((x) => x.id === id)
        return e ? [clone(e)] : []
      })
    if (method === 'POST' && a === 'mod' && b === 'held' && seg.length === 4)
      if (seg[3] === 'release' || seg[3] === 'drop') return this.resolveHeld(c ?? '', seg[3])
    if (is('POST', 'mod', 'panic')) return this.panic(body)
    if (is('GET', 'mod', 'panic', 'config')) return clone(this.panicCfg)
    if (is('PUT', 'mod', 'panic', 'config')) {
      this.panicCfg = { ...this.panicCfg, ...(requireObj(body) as PanicConfig) }
      return clone(this.panicCfg)
    }
    if (is('GET', 'mod', 'filters')) return clone(this.filters)
    if (is('PUT', 'mod', 'filters')) {
      const f = requireObj(body) as Filters
      if (
        f.timeout_seconds !== undefined &&
        (f.timeout_seconds < 1 || f.timeout_seconds > 1_209_600)
      )
        throw new HttpError(
          400,
          'invalid',
          'timeout_seconds: must be between 1 second and 14 days.',
        )
      this.filters = { ...this.filters, ...f }
      return clone(this.filters)
    }
    if (method === 'GET' && a === 'viewers' && seg.length === 3)
      return this.viewerCard(b ?? '', c ?? '')
    if (a === 'viewers' && seg.length === 4 && seg[3] === 'note') {
      const key = `${b}:${c}`
      if (method === 'GET') return { text: this.notes.get(key) ?? '' }
      if (method === 'PUT') {
        const text = (requireObj(body) as { text?: unknown }).text
        if (typeof text !== 'string') throw new HttpError(400, 'invalid', 'text: must be text.')
        if (text.length > 2000)
          throw new HttpError(400, 'invalid', 'text: notes can be up to 2,000 characters.')
        this.notes.set(key, text)
        return { text }
      }
    }

    // bot
    if (a === 'commands')
      return this.crud(method, seg, body, this.commands, 'command', validateCommand)
    if (a === 'timers') return this.crud(method, seg, body, this.timersList, 'timer', validateTimer)

    // tts
    if (is('GET', 'tts')) return { ...clone(this.tts), currency: this.settings.currency }
    if (is('PUT', 'tts')) {
      const t = requireObj(body) as TtsSettings
      if (t.max_chars !== undefined && (t.max_chars < 10 || t.max_chars > 500))
        throw new HttpError(400, 'invalid', 'max_chars: must be between 10 and 500.')
      this.tts = { ...this.tts, ...t }
      return { ...clone(this.tts), currency: this.settings.currency }
    }
    if (is('GET', 'tts', 'voices')) return clone(VOICES)
    if (is('GET', 'tts', 'pending')) return clone(this.ttsPending)
    if (
      method === 'POST' &&
      a === 'tts' &&
      seg.length === 3 &&
      (c === 'approve' || c === 'reject')
    ) {
      const item = this.ttsPending.find((t) => t.id === b)
      if (!item) throw new HttpError(404, 'tts_not_found', 'That message was already handled.')
      this.ttsPending = this.ttsPending.filter((t) => t.id !== b)
      if (c === 'approve')
        for (const s of this.overlaySubs)
          if (
            this.overlays
              .find((o) => o.id === s.overlayId)
              ?.widgets.some((w) => w.kind === 'alerts')
          )
            this.sendOverlay(s, 'tts', { id: item.id, text: item.text, audio: null })
      this.broadcastLive({ v: 1, type: 'tts_pending', data: clone(this.ttsPending) })
      return undefined
    }

    // tips
    if (is('GET', 'tips')) return clone(this.tips)
    if (is('PUT', 'tips')) return this.saveTips(body)
    if (is('DELETE', 'tips')) {
      if (!this.relayOn)
        throw new HttpError(
          422,
          'unavailable',
          'This build of Ferrocast has no relay set up, so the tip page can’t be taken down.',
          'Use an official Ferrocast build, or set a relay URL when building it.',
        )
      // The page goes; the name stays held for this install (the relay keeps it 30 days).
      this.resetTipsKeepingChanges()
      return undefined
    }

    // media
    if (is('GET', 'media')) return clone(this.media)
    if (is('POST', 'media')) return this.upload(body)
    if (is('DELETE', 'media', null)) {
      const used = this.rules.find((r) => r.variations.some((v) => v.sound === b || v.image === b))
      if (used)
        throw new HttpError(
          409,
          'media_in_use',
          `The “${used.name}” alert still uses this file.`,
          'Pick another sound or image there first.',
        )
      const designs = this.designs.usedBy(b ?? '')
      if (designs.length)
        throw new HttpError(
          409,
          'in_use',
          `This file is used by: ${designs.map((d) => `the design ${d}`).join(', ')}.`,
          'Change those alerts or designs to another file first.',
        )
      const gone = this.media.find((m) => m.id === b)
      if (gone) revokeBlobUrl(gone.url)
      this.media = this.media.filter((m) => m.id !== b)
      this.mediaBlobs.delete(b ?? '')
      return undefined
    }

    // obs
    if (is('GET', 'obs')) return clone(this.obs)
    if (is('PUT', 'obs')) {
      const o = requireObj(body) as { host?: string; port?: number; password?: string | null }
      if (!o.host || !/^[a-z0-9.-]+$/i.test(o.host))
        throw new HttpError(400, 'invalid', 'host: enter an address like 127.0.0.1.')
      if (!o.port || o.port < 1 || o.port > 65535)
        throw new HttpError(400, 'invalid', 'port: must be between 1 and 65535.')
      if (o.password === 'wrong')
        throw new HttpError(
          422,
          'obs_auth_failed',
          'OBS rejected that password.',
          'Copy it again from OBS: Tools → WebSocket Server Settings → Show Connect Info.',
        )
      // Like the engine: saving what's already in use (Connect without changes while
      // following OBS) keeps following OBS; anything else becomes the streamer's own.
      const unchanged =
        o.password === undefined && o.host === this.obs.host && o.port === this.obs.port
      const auto = unchanged && this.obs.auto !== false
      const hasPassword =
        o.password === undefined ? this.obs.has_password === true : o.password !== null
      // The demo's OBS listens on 127.0.0.1:4455; anything else isn't there.
      const reachable = /^(127\.0\.0\.1|localhost)$/i.test(o.host) && o.port === 4455
      const detail = reachable
        ? null
        : 'OBS isn’t running, or its WebSocket server is off (Tools → WebSocket Server Settings).'
      this.obs = {
        state: reachable ? 'connected' : 'disconnected',
        version: reachable ? '31.1.2' : null,
        scene: reachable ? 'Gameplay' : null,
        host: o.host,
        port: o.port,
        has_password: hasPassword,
        auto,
        detail,
      }
      this.setConnector(
        'obs',
        reachable ? connector('connected', 'OBS 31.1.2') : connector('disconnected', null, detail),
      )
      return clone(this.obs)
    }

    // settings and data
    if (is('GET', 'settings')) return clone(this.settings)
    if (is('PUT', 'settings')) {
      this.settings = { ...this.settings, ...(requireObj(body) as Settings) }
      return clone(this.settings)
    }
    if (is('POST', 'export')) {
      const pack = {
        format: 'ferropack',
        version: 1,
        exported_at: Date.now(),
        overlays: this.overlays,
        alert_rules: this.rules,
        commands: this.commands,
        timers: this.timersList,
        goals: this.goals,
        media: this.media.map(({ url: _url, ...m }) => m),
      }
      return new Response(JSON.stringify(pack, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="ferrocast.ferropack"',
        },
      })
    }
    if (is('POST', 'import')) return this.importPack(body)
    if (is('GET', 'backups')) return clone(this.backups)
    if (is('POST', 'backups')) {
      this.takeBackup('manual')
      return clone(this.backups)
    }
    if (is('POST', 'backups', null, 'restore')) {
      if (!this.backups.some((x) => x.id === b))
        throw new HttpError(404, 'backup_not_found', 'That backup is gone.')
      if (this.isLive())
        throw new HttpError(
          422,
          'live',
          'You’re live right now.',
          'Restore after your stream so nothing breaks mid-show.',
        )
      return {
        restart_needed: true,
        message: 'Restart Ferrocast to finish restoring.',
      }
    }
    if (is('GET', 'stats', 'session')) return clone({ ...this.stats, live: this.isLive() })
    if (is('GET', 'updates'))
      return {
        current: DEMO_VERSION,
        latest: '0.4.1',
        channel: this.settings.update_channel,
        blocked_while_live: this.isLive() && this.settings.never_update_while_live,
        notes_url: 'https://ferrocast.clearcraftlabs.com/docs/getting-started',
      }
    if (is('POST', 'updates', 'install')) {
      if (this.isLive() && this.settings.never_update_while_live)
        throw new HttpError(
          409,
          'conflict',
          'You’re live, so the update waits until the stream ends (Settings › Updates).',
        )
      this.takeBackup('before-update')
      return { installing: '0.4.1' }
    }

    throw new HttpError(
      404,
      'not_found',
      'That doesn’t exist.',
      'Update the dashboard and the app to the same version.',
    )
  }

  // ---------------------------------------------------------------- feature modules

  private features(): DemoFeature[] {
    return [
      this.loyalty,
      this.polls,
      this.giveaways,
      this.welcome,
      this.recap,
      this.discord,
      this.discordPro,
      this.cloudBot,
      this.obsDetect,
      this.starter,
      this.importers,
      this.pro,
      this.history,
      this.cloudBackups,
      this.designs,
      this.studio,
      this.tipBrand,
      this.autoReplies,
      this.ttsVoices,
      this.remoteDevices,
      this.weeklyEmail,
    ]
  }

  private makeHost(): DemoHost {
    const known: Actor[] = (['twitch', 'youtube', 'kick'] as const).flatMap((p) =>
      CHATTERS[p].map((c) =>
        namedActor(p, c.name, {
          id: `${p}-${c.name.toLowerCase().replace(/\s+/g, '')}`,
          color: c.color,
          roles: c.roles,
        }),
      ),
    )
    return {
      broadcastLive: (f) => this.broadcastLive(f),
      pushOverlayState: (partial) => {
        for (const s of this.overlaySubs) this.sendOverlay(s, 'state', clone(partial))
      },
      say: (text) => {
        for (const p of this.connectedChat())
          this.ingest(
            {
              type: 'chat_message',
              actor: namedActor(p, p === 'youtube' ? 'Nova Plays' : 'NovaPlays', {
                id: 'me',
                roles: 1,
                color: '#7c9cff',
              }),
              content: { text, fragments: [{ type: 'text', text }] },
              reply_to: null,
              is_action: false,
            },
            p,
            'live',
          )
      },
      chat: (actor, text) => {
        if (actor.platform === 'tips' || actor.platform === 'ferrocast') return
        if (this.connectors[actor.platform].state !== 'connected') return
        this.ingest(
          {
            type: 'chat_message',
            actor,
            content: { text, fragments: [{ type: 'text', text }] },
            reply_to: null,
            is_action: false,
          },
          actor.platform,
          'live',
        )
      },
      connectedChat: () => this.connectedChat(),
      knownActors: () => known,
      seenActor: (platform, userId) => this.seenActor(platform, userId),
      isLive: () => this.isLive(),
      later: (fn, ms) => this.later(fn, ms),
      random: () => this.rand(),
    }
  }

  // ---------------------------------------------------------------- route bodies

  private status() {
    return {
      version: DEMO_VERSION,
      port: 47820,
      live: {
        twitch: this.isLiveOn('twitch'),
        youtube: this.isLiveOn('youtube'),
        kick: this.isLiveOn('kick'),
      },
      connectors: clone(this.connectors),
      setup_done: this.setupDone,
    }
  }

  private pair(body: unknown) {
    const code = (requireObj(body) as { code?: unknown }).code
    if (typeof code !== 'string' || !/^[A-Z0-9]{4,12}$/i.test(code.trim()))
      throw new HttpError(
        400,
        'invalid',
        'code: that doesn’t look like a pairing code.',
        'Copy the link from the Ferrocast app again.',
      )
    if (code.toUpperCase() === DEMO_PAIR.expired)
      throw new HttpError(
        401,
        'pair_expired',
        'That pairing link has expired.',
        'Links last 2 minutes. Make a new one in the Ferrocast app: Settings → Open in browser.',
      )
    if (code.toUpperCase() === DEMO_PAIR.used)
      throw new HttpError(
        401,
        'pair_used',
        'That pairing link was already used.',
        'Each link works once. Make a new one in the Ferrocast app.',
      )
    return { token: this.token }
  }

  private connect(platform: string) {
    if (!['twitch', 'youtube', 'kick'].includes(platform))
      throw new HttpError(404, 'not_found', 'Ferrocast doesn’t support that platform.')
    const p = platform as ChatPlatform
    if (this.connectors[p].state === 'connected')
      throw new HttpError(
        409,
        'already_connected',
        `${label(p)} is already connected.`,
        'Disconnect it first to switch accounts.',
      )
    const name = p === 'twitch' ? 'NovaPlays' : p === 'youtube' ? 'Nova Plays' : 'novaplays'
    this.later(
      () => {
        this.accounts = this.accounts.filter((x) => x.platform !== p)
        this.accounts.push({
          platform: p,
          name,
          avatar_url: null,
          connected_at: Date.now(),
          scopes_ok: true,
        })
        this.setConnector(p, connector('connected', name))
        this.ingest({ type: 'connector', state: 'connected' }, p, 'live')
      },
      p === 'twitch' ? 4500 : 2500,
    )
    this.setConnector(p, connector('reconnecting', null, 'Waiting for you to finish signing in…'))
    if (p === 'twitch')
      return {
        flow: 'device_code',
        user_code: 'FRRO-4821',
        verification_url: 'https://www.twitch.tv/activate',
        expires_at: Date.now() + 600_000,
      }
    return {
      flow: 'browser',
      url:
        p === 'youtube'
          ? 'https://accounts.google.com/o/oauth2/v2/auth'
          : 'https://id.kick.com/oauth/authorize',
    }
  }

  private disconnect(platform: string) {
    if (!['twitch', 'youtube', 'kick'].includes(platform))
      throw new HttpError(404, 'not_found', 'Ferrocast doesn’t support that platform.')
    const p = platform as ChatPlatform
    this.accounts = this.accounts.filter((x) => x.platform !== p)
    this.setConnector(p, connector('off', null))
    return undefined
  }

  private findOverlay(id: string): Overlay {
    const o = this.overlays.find((x) => x.id === id)
    if (!o)
      throw new HttpError(
        404,
        'overlay_not_found',
        'That overlay doesn’t exist anymore.',
        'Reload the overlays list.',
      )
    return o
  }

  private createOverlay(body: unknown) {
    const o = requireObj(body) as { name?: unknown; preset?: unknown }
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) throw new HttpError(400, 'invalid', 'name: give the overlay a name.')
    if (name.length > 60) throw new HttpError(400, 'invalid', 'name: keep it under 60 characters.')
    if (this.overlays.some((x) => x.name.toLowerCase() === name.toLowerCase()))
      throw new HttpError(
        409,
        'name_taken',
        `You already have an overlay called “${name}”.`,
        'Pick another name.',
      )
    const preset =
      (['starter', 'alerts_only', 'chat_only', 'blank'] as const).find((x) => x === o.preset) ??
      'starter'
    const id = `ov-${randomToken().slice(0, 10)}`
    const overlay: Overlay = {
      id,
      name,
      url: `${this.base}/o/${this.tokenFor(id)}/`,
      width: 1920,
      height: 1080,
      widgets: presetWidgets(preset as OverlayPreset),
      updated_at: Date.now(),
      design: null,
    }
    this.overlays.push(overlay)
    return clone(overlay)
  }

  private saveOverlay(id: string, body: unknown) {
    const cur = this.findOverlay(id)
    const o = requireObj(body) as Partial<Overlay>
    const name = typeof o.name === 'string' ? o.name.trim() : cur.name
    if (!name) throw new HttpError(400, 'invalid', 'name: give the overlay a name.')
    if (this.overlays.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
      throw new HttpError(
        409,
        'name_taken',
        `You already have an overlay called “${name}”.`,
        'Pick another name.',
      )
    const width = o.width ?? cur.width
    const height = o.height ?? cur.height
    if (width < 100 || width > 7680 || height < 100 || height > 4320)
      throw new HttpError(
        400,
        'invalid',
        'width: overlays can be 100 to 7680 pixels wide and 100 to 4320 tall.',
      )
    const widgets = Array.isArray(o.widgets) ? (o.widgets as Widget[]) : cur.widgets
    for (const w of widgets) {
      if (!WIDGET_KINDS.includes(w.kind) && w.kind !== 'layer')
        throw new HttpError(400, 'invalid', `widgets: '${String(w.kind)}' isn't a widget type.`)
      if (w.w < 20 || w.h < 20)
        throw new HttpError(400, 'invalid', 'widgets: a widget must be at least 20 × 20 pixels.')
    }
    DemoDesigns.checkLayout(name, width, height, widgets)
    this.designs.checkBranding(cur, widgets)
    // `design` can't be changed here (API.md §4 Overlays): it stays what "Use" set.
    return this.putOverlay({
      ...cur,
      name,
      width,
      height,
      widgets: clone(widgets),
      updated_at: Date.now(),
    })
  }

  /** Saves an overlay as is and pushes the new layout to its open pages. */
  private putOverlay(next: Overlay): Overlay {
    const saved = { ...clone(next), updated_at: Date.now() }
    this.overlays = this.overlays.map((x) => (x.id === saved.id ? saved : x))
    for (const s of this.overlaySubs)
      if (s.overlayId === saved.id) this.sendOverlay(s, 'config', clone(saved))
    return clone(saved)
  }

  /** Tells pages on the old URL to go blank, then closes them (API.md §6 `revoked`). */
  private revoke(overlayId: string): void {
    for (const s of this.overlaySubs)
      if (s.overlayId === overlayId) {
        s.seq += 1
        s.sock.deliver({ v: 1, seq: s.seq, type: 'revoked', data: {} })
        s.sock.drop()
      }
  }

  private regenerate(id: string) {
    const o = this.findOverlay(id)
    this.overlayTokens.set(id, randomToken())
    o.url = `${this.base}/o/${this.tokenFor(id)}/`
    o.updated_at = Date.now()
    this.revoke(id)
    return clone(o)
  }

  private saveRule(id: string | null, body: unknown) {
    const r = requireObj(body) as AlertRule
    if (!Array.isArray(r.kinds) || r.kinds.length === 0)
      throw new HttpError(400, 'invalid', 'kinds: the rule needs at least one event type.')
    if (!Array.isArray(r.variations) || !r.variations.some((v) => v.condition === null))
      throw new HttpError(
        400,
        'invalid',
        'variations: the rule needs a default look (a variation without a condition).',
      )
    for (const v of r.variations) {
      if (v.duration_ms < 1000 || v.duration_ms > 60_000)
        throw new HttpError(400, 'invalid', `variations: “${v.name}” must last 1 to 60 seconds.`)
      if (v.volume < 0 || v.volume > 100)
        throw new HttpError(400, 'invalid', `variations: “${v.name}” volume must be 0 to 100.`)
      if ((v.title.match(/{/g) ?? []).length !== (v.title.match(/}/g) ?? []).length)
        throw new HttpError(400, 'invalid', `variations: “${v.name}” has a { that is never closed.`)
    }
    if (id === null) {
      const rule = { ...clone(r), id: r.id || `r-${randomToken().slice(0, 8)}` }
      if (this.rules.some((x) => x.id === rule.id))
        throw new HttpError(409, 'rule_exists', 'A rule with that id already exists.')
      this.rules.push(rule)
      return clone(rule)
    }
    const i = this.rules.findIndex((x) => x.id === id)
    if (i < 0)
      throw new HttpError(
        404,
        'rule_not_found',
        'That alert rule doesn’t exist anymore.',
        'Reload the alerts list.',
      )
    this.rules[i] = { ...clone(r), id }
    return clone(this.rules[i])
  }

  private test(body: unknown) {
    const o = requireObj(body) as {
      kind?: unknown
      platform?: unknown
      design_id?: unknown
      amount?: unknown
    }
    if (typeof o.kind !== 'string') throw new HttpError(400, 'invalid', 'kind: pick what to test.')
    let s =
      typeof o.platform === 'string' ? sample(o.kind, o.platform as Platform) : anySample(o.kind)
    if (!s)
      throw new HttpError(
        400,
        'invalid',
        typeof o.platform === 'string'
          ? `kind: ${label(o.platform as Platform)} doesn’t have that kind of event.`
          : `kind: '${o.kind}' can’t show an alert.`,
      )
    if (o.amount !== undefined && o.amount !== null) {
      const a = o.amount
      if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0 || a > 1_000_000_000)
        throw new HttpError(
          400,
          'invalid',
          'amount: must be a number above 0 and up to 1,000,000,000.',
        )
      if (
        !['tip', 'paid_message', 'platform_gift', 'gift_batch', 'raid', 'subscription'].includes(
          s.kind.type,
        )
      )
        throw new HttpError(400, 'invalid', 'amount: this kind of alert has no amount.')
      s = withAmount(s, a)
    }
    let design: Design | undefined
    if (o.design_id !== undefined && o.design_id !== null) {
      if (typeof o.design_id !== 'string')
        throw new HttpError(400, 'invalid', 'design_id: must be a design id.')
      design = this.designs.find(o.design_id)
      if (design.kind !== 'alert')
        throw new HttpError(400, 'invalid', 'design_id: test alerts need an alert design.')
    }
    const e = this.ingest(s.kind, s.platform, 'test', design ? { design } : {})
    return { event_id: e.id }
  }

  private queueControl(action: string) {
    const now = Date.now()
    let actions: QueueAction[] = []
    switch (action) {
      case 'pause':
        this.queue.pause()
        break
      case 'resume':
        actions = this.queue.resume(now)
        break
      case 'skip':
        actions = this.queue.skip(now)
        break
      case 'clear':
        this.queue.clearWaiting()
        break
      default:
        throw new HttpError(404, 'not_found', 'That queue action doesn’t exist.')
    }
    this.applyQueue(actions)
    return this.queue.snapshot()
  }

  private replayEvent(id: string) {
    const e = this.events.find((x) => x.id === id)
    if (!e) throw new HttpError(404, 'event_not_found', 'That event is no longer in the log.')
    if (!isAlertable(e))
      throw new HttpError(
        422,
        'not_alertable',
        'That kind of event doesn’t show an alert, so there is nothing to replay.',
      )
    const r = this.ingest(e.kind, e.platform, 'replay')
    return { event_id: r.id }
  }

  private listEvents(url: URL) {
    const before = url.searchParams.get('before')
    const limit = clampInt(url.searchParams.get('limit'), 1, 200, 50)
    const kinds = url.searchParams.get('kinds')?.split(',').filter(Boolean) ?? null
    let list = this.events.filter(
      (e) => e.kind.type !== 'chat_message' && e.kind.type !== 'viewer_count',
    )
    if (kinds) list = list.filter((e) => kinds.includes(e.kind.type))
    if (before !== null) list = list.filter((e) => e.seq < Number(before))
    const page = list.slice(-limit).reverse()
    const last = page[page.length - 1]
    const more = last ? list.some((e) => e.seq < last.seq) : false
    return { events: clone(page), next_before: more && last ? last.seq : null }
  }

  private whyFor(e: FerroEvent) {
    const stored = this.why.get(e.id)
    if (stored) return { alerted: false, reasons: stored }
    if (!isAlertable(e)) {
      if (e.kind.type === 'tip' && e.kind.status !== 'captured')
        return {
          alerted: false,
          reasons: [
            `The payment is ${e.kind.status}. Alerts play only when the money has actually arrived.`,
          ],
        }
      return { alerted: false, reasons: ['This kind of event never shows an alert.'] }
    }
    if (e.origin === 'backfill')
      return {
        alerted: false,
        reasons: [
          'It arrived after a reconnect, so it went to the feed only. Old alerts in a burst help nobody.',
        ],
      }
    const sel = select(this.rules, { ...e, origin: e.origin === 'test' ? 'test' : 'live' })
    if (!sel) {
      const rule = this.rules.find((r) => r.kinds.includes(e.kind.type))
      if (!rule)
        return {
          alerted: false,
          reasons: [`No alert rule covers ${e.kind.type.replace(/_/g, ' ')} events.`],
        }
      if (!rule.enabled)
        return { alerted: false, reasons: [`The “${rule.name}” rule is turned off.`] }
      return {
        alerted: false,
        reasons: [`The “${rule.name}” rule doesn’t include ${label(e.platform)}.`],
      }
    }
    return {
      alerted: true,
      reasons: [`Played with “${sel.rule.name}”, look “${sel.variation.name}”.`],
    }
  }

  private sendChat(body: unknown) {
    const o = requireObj(body) as {
      text?: unknown
      platforms?: unknown
      reply_to?: { platform: Platform; message_id: string }
    }
    const text = typeof o.text === 'string' ? o.text.trim() : ''
    if (!text) throw new HttpError(400, 'invalid', 'text: type a message first.')
    if (text.length > 500)
      throw new HttpError(400, 'invalid', 'text: chat messages can be up to 500 characters.')
    const want: Platform[] =
      o.platforms === 'all'
        ? ['twitch', 'youtube', 'kick']
        : Array.isArray(o.platforms)
          ? (o.platforms as Platform[])
          : []
    if (want.length === 0)
      throw new HttpError(400, 'invalid', 'platforms: pick at least one platform.')
    const targets: Platform[] = o.reply_to ? [o.reply_to.platform] : want
    const sent: Platform[] = []
    const failed: { platform: Platform; reason: string }[] = []
    for (const p of targets) {
      const conn = this.connectors[p as ChatPlatform]
      if (!conn || conn.state !== 'connected')
        failed.push({ platform: p, reason: `${label(p)} isn’t connected.` })
      else {
        sent.push(p)
        this.ingest(
          {
            type: 'chat_message',
            actor: namedActor(p, p === 'youtube' ? 'Nova Plays' : 'NovaPlays', {
              id: 'me',
              roles: 1,
              color: '#7c9cff',
            }),
            content: { text, fragments: [{ type: 'text', text }] },
            reply_to: o.reply_to?.platform === p ? o.reply_to.message_id : null,
            is_action: false,
          },
          p,
          'live',
        )
      }
    }
    if (sent.length === 0 && failed.length > 0)
      throw new HttpError(
        422,
        'not_connected',
        failed.map((f) => f.reason).join(' '),
        'Connect it in Settings → Accounts.',
      )
    return { sent, failed }
  }

  private modDelete(body: unknown) {
    const o = requireObj(body) as { platform?: Platform; message_id?: string }
    const e = this.events.find((x) => x.source_id === o.message_id && x.platform === o.platform)
    if (!e) throw new HttpError(404, 'message_not_found', 'That message is already gone.')
    if (this.connectors[o.platform as ChatPlatform]?.state !== 'connected')
      throw new HttpError(
        422,
        'not_connected',
        `${label(o.platform as Platform)} isn’t connected, so the message can’t be deleted there.`,
      )
    this.ingest(
      { type: 'message_deleted', message_id: o.message_id ?? '' },
      o.platform as Platform,
      'live',
    )
    for (const s of this.overlaySubs)
      this.sendOverlay(s, 'delete_message', { platform: o.platform, message_id: o.message_id })
    this.ttsPending = this.ttsPending.filter((t) => t.event_id !== e.id)
    return undefined
  }

  private modTimeout(body: unknown) {
    const o = requireObj(body) as { platform?: Platform; user_id?: string; seconds?: number }
    if (!o.user_id) throw new HttpError(400, 'invalid', 'user_id: who should be timed out?')
    if (typeof o.seconds !== 'number' || o.seconds < 1 || o.seconds > 1_209_600)
      throw new HttpError(400, 'invalid', 'seconds: timeouts can be 1 second to 14 days.')
    if (o.platform === 'youtube' && o.seconds > 86_400)
      throw new HttpError(
        422,
        'platform_limit',
        'YouTube timeouts can be at most 24 hours.',
        'Use a ban for longer.',
      )
    for (const s of this.overlaySubs)
      this.sendOverlay(s, 'delete_user', { platform: o.platform, user_id: o.user_id })
    return undefined
  }

  private modBan(body: unknown) {
    const o = requireObj(body) as {
      user?: { platform: Platform; user_id: string; login: string }
      reason?: string
      everywhere?: boolean
    }
    if (!o.user?.user_id) throw new HttpError(400, 'invalid', 'user: who should be banned?')
    const targets: ChatPlatform[] = o.everywhere
      ? ['twitch', 'youtube', 'kick']
      : [o.user.platform as ChatPlatform]
    const banned: Platform[] = []
    const failed: { platform: Platform; reason: string }[] = []
    for (const p of targets) {
      if (this.connectors[p].state !== 'connected')
        failed.push({ platform: p, reason: `${label(p)} isn’t connected.` })
      else banned.push(p)
    }
    const display = this.lookupName(o.user.platform, o.user.user_id) ?? o.user.login
    this.bans = this.bans.filter(
      (b) => !(b.user_id === o.user?.user_id && b.platform === o.user?.platform),
    )
    this.bans.unshift({
      platform: o.user.platform as ChatPlatform,
      user_id: o.user.user_id,
      login: o.user.login,
      display_name: display,
      reason: o.reason ?? null,
      banned_at: Date.now(),
      everywhere: !!o.everywhere,
      by: 'NovaPlays',
    })
    for (const p of banned) {
      this.ingest(
        {
          type: 'ban',
          target: namedActor(p, display, { id: o.user.user_id }),
          reason: o.reason ?? null,
          until: null,
        },
        p,
        'live',
      )
      for (const s of this.overlaySubs)
        this.sendOverlay(s, 'delete_user', { platform: p, user_id: o.user.user_id })
    }
    return { banned, failed }
  }

  private panic(body: unknown) {
    const on = (requireObj(body) as { on?: unknown }).on
    if (typeof on !== 'boolean') throw new HttpError(400, 'invalid', 'on: must be true or false.')
    this.panicOn = on
    const modes: string[] = []
    if (this.panicCfg.followers_only) modes.push('followers_only')
    if (this.panicCfg.emote_only) modes.push('emote_only')
    if (this.panicCfg.slow_mode_seconds > 0) modes.push('slow')
    if (this.panicCfg.hold_new_accounts) modes.push('hold_new_accounts')
    const applied = (['twitch', 'youtube', 'kick'] as const)
      .filter((p) => this.connectors[p].state === 'connected')
      .map((p) => ({
        platform: p as Platform,
        modes: p === 'youtube' ? modes.filter((m) => m !== 'emote_only') : modes,
      }))
    if (on && this.panicCfg.pause_alerts) this.queue.pause()
    if (!on && this.panicCfg.pause_alerts) this.applyQueue(this.queue.resume(Date.now()))
    this.broadcastQueue()
    for (const a of applied) {
      if (a.modes.includes('followers_only'))
        this.ingest(
          { type: 'mode_changed', mode: 'followers_only', enabled: on },
          a.platform,
          'live',
        )
    }
    this.broadcastLive({ v: 1, type: 'panic', data: { on, plan: clone(this.panicCfg) } })
    this.broadcastLive({
      v: 1,
      type: 'notice',
      data: on
        ? {
            key: 'panic',
            level: 'warn',
            message: 'Panic mode is on. Chat is locked down and alerts are paused.',
          }
        : {
            key: 'panic',
            level: 'info',
            message: 'Panic mode is off. Chat and alerts are back to normal.',
          },
    })
    return { on, applied }
  }

  /** The newest look of someone in the event log. */
  private seenActor(platform: string, userId: string): Actor | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]
      const a = ev ? actorOf(ev) : null
      if (a && a.platform === platform && a.id === userId) return a
    }
    return null
  }

  private viewerCard(platform: string, userId: string): ViewerCard {
    const a = this.seenActor(platform, userId)
    if (!a) throw new HttpError(404, 'viewer_not_found', 'We haven’t seen that viewer yet.')
    const mine = this.events.filter(
      (x) => x.kind.type === 'chat_message' && x.platform === platform && actorOf(x)?.id === userId,
    )
    const msgs = mine.length
    // Someone chatting for the first time has no history to invent: their card shows only
    // what happened here (like the engine), so "First message" and the counts agree.
    if (a.roles & Roles.FIRST_TIME) {
      const first = this.events.find((x) => x.platform === platform && actorOf(x)?.id === userId)
      return {
        platform: platform as ChatPlatform,
        user_id: userId,
        login: a.login ?? a.display_name,
        display_name: a.display_name,
        avatar_url: a.avatar_url,
        roles: a.roles,
        first_seen: first?.received_at ?? Date.now(),
        messages: msgs,
        follows_since: null,
        note: this.notes.get(`${platform}:${userId}`) ?? '',
        banned: this.bans.some((b) => b.user_id === userId && b.platform === platform),
        timeouts: 0,
        other_identities: [],
        points: this.loyalty.balanceOf(platform, userId),
      }
    }
    return {
      platform: platform as ChatPlatform,
      user_id: userId,
      login: a.login ?? a.display_name,
      display_name: a.display_name,
      avatar_url: a.avatar_url,
      roles: a.roles,
      first_seen: Date.now() - 1000 * 60 * 60 * 24 * (3 + (hash(userId) % 200)),
      messages: msgs + (hash(userId) % 900),
      follows_since: a.roles & 512 ? null : Date.now() - 1000 * 60 * 60 * 24 * (hash(userId) % 300),
      note: this.notes.get(`${platform}:${userId}`) ?? '',
      banned: this.bans.some((b) => b.user_id === userId),
      timeouts: hash(userId) % 3,
      other_identities:
        hash(userId) % 4 === 0
          ? [
              {
                platform: platform === 'twitch' ? 'kick' : 'twitch',
                login: a.login ?? a.display_name,
              },
            ]
          : [],
      points: this.loyalty.balanceOf(platform, userId),
    }
  }

  private crud<T extends { id: string }>(
    method: string,
    seg: string[],
    body: unknown,
    list: T[],
    what: string,
    validate: (v: Partial<T>, list: T[], id: string | null) => void,
  ): unknown {
    const id = seg[1] ?? null
    if (method === 'GET' && !id) return clone(list)
    if (method === 'POST' && !id) {
      const v = requireObj(body) as Partial<T>
      validate(v, list, null)
      const item = { ...(v as T), id: `${what[0]}-${randomToken().slice(0, 8)}` }
      list.push(item)
      return clone(item)
    }
    const i = list.findIndex((x) => x.id === id)
    if (i < 0)
      throw new HttpError(
        404,
        `${what}_not_found`,
        `That ${what} doesn’t exist anymore.`,
        'Reload the list.',
      )
    if (method === 'PUT') {
      const v = requireObj(body) as Partial<T>
      validate(v, list, id)
      list[i] = { ...(list[i] as T), ...(v as T), id: id as string }
      return clone(list[i])
    }
    if (method === 'DELETE') {
      list.splice(i, 1)
      return undefined
    }
    throw new HttpError(404, 'not_found', 'That doesn’t exist.')
  }

  private upload(body: unknown) {
    if (!(body instanceof FormData))
      throw new HttpError(400, 'invalid', 'file: choose a file to upload.')
    const file = body.get('file')
    if (!(file instanceof Blob))
      throw new HttpError(400, 'invalid', 'file: choose a file to upload.')
    const name = file instanceof File ? file.name : 'upload'
    const type = file.type || guessType(name)
    if (type === 'image/svg+xml')
      throw new HttpError(
        415,
        'unsupported_type',
        'SVG images aren’t allowed, because they can carry scripts.',
        'Export it as PNG or WebP instead.',
      )
    const kind = (Object.keys(LIMITS) as MediaKind[]).find((k) => LIMITS[k].types.includes(type))
    if (!kind)
      throw new HttpError(
        415,
        'unsupported_type',
        'That file type isn’t supported.',
        'Use PNG, JPEG, GIF or WebP images, MP3, OGG or WAV sounds, or WebM and MP4 video.',
      )
    const limit = LIMITS[kind]
    if (file.size > limit.bytes)
      throw new HttpError(413, 'too_large', limit.label, 'Trim or compress it, then try again.')
    if (file.size === 0) throw new HttpError(400, 'invalid', 'file: that file is empty.')
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
    const m: Media = { id: `m${randomToken().slice(0, 10)}`, kind, name, bytes: file.size, url }
    this.media.push(m)
    this.mediaBlobs.set(m.id, file)
    return clone(m)
  }

  /**
   * A backup row like the engine's (`<ms>-<label>`, its reason from the label), newest
   * first, keeping the newest 7 daily and 10 others. Returns its id.
   */
  takeBackup(label: string): string {
    const at = Math.max(Date.now(), (this.backups[0]?.created_at ?? 0) + 1)
    const reason: Backup['reason'] =
      label === 'daily'
        ? 'daily'
        : label === 'manual'
          ? 'manual'
          : label === 'before-update'
            ? 'update'
            : label.endsWith('import')
              ? 'import'
              : 'other'
    const id = `${at}-${label}`
    const size = (this.backups[0]?.bytes ?? 2_400_000) + Math.round(this.rand() * 40_000)
    const next = [
      { id, created_at: at, reason, bytes: size, version: DEMO_VERSION },
      ...this.backups,
    ]
    let daily = 0
    let other = 0
    this.backups = next.filter((b) => (b.reason === 'daily' ? ++daily <= 7 : ++other <= 10))
    return id
  }

  /** A `.ferropack` (the engine's `POST /api/v1/import`): a backup first, then the report. */
  private importPack(body: unknown) {
    if (!(body instanceof FormData))
      throw new HttpError(400, 'invalid', 'Attach the .ferropack in a form field named "file".')
    const file = body.get('file')
    if (!(file instanceof Blob) || file.size === 0)
      throw new HttpError(
        400,
        'invalid',
        'The file is empty.',
        'Pick a .ferropack you exported from Ferrocast.',
      )
    if (file.size > 2 * 1024 * 1024 * 1024)
      throw new HttpError(413, 'too_large', 'Packs can be up to 2 GB.')
    return {
      imported: { overlays: 2, alert_rules: 14, commands: 22, timers: 4, goals: 3, media: 31 },
      media_files: 31,
      backup: this.takeBackup('before-import'),
    }
  }

  // ---------------------------------------------------------------- pipeline

  private ingest(
    kind: EventKind,
    platform: Platform,
    origin: FerroEvent['origin'],
    opts: { held?: boolean; design?: Design } = {},
  ): FerroEvent {
    const now = Date.now()
    this.seq += 1
    const e: FerroEvent = {
      id: `ev-${this.seq.toString(36)}-${randomToken().slice(0, 6)}`,
      seq: this.seq,
      platform,
      channel:
        platform === 'tips' || platform === 'ferrocast'
          ? null
          : { platform, id: `${platform}-chan`, name: 'novaplays' },
      source_id: `${platform}-${this.seq}`,
      occurred_at: now,
      received_at: now,
      origin,
      kind,
    }
    if (opts.design) this.designs.testWith(e.id, opts.design.id)
    this.events.push(e)
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000)
    this.broadcastLive({ v: 1, type: 'event', data: e })
    this.updateState(e)
    if (kind.type === 'chat_message' && !opts.held) for (const f of this.features()) f.onChat?.(e)
    if (kind.type !== 'chat_message') for (const f of this.features()) f.onEvent?.(e)

    const forOverlays = kind.type === 'chat_message' || isAlertable(e)
    if (forOverlays && origin !== 'test' && !opts.held)
      for (const s of this.overlaySubs) if (this.overlayWants(s, e)) this.sendOverlay(s, 'event', e)

    if (isAlertable(e) && (origin === 'live' || origin === 'replay' || origin === 'test')) {
      const sel = select(this.rules, e)
      if (sel) {
        const alert = this.designs.dress(
          render(`al-${++this.alertSeq}`, sel.rule, sel.variation, e),
          e,
        )
        const priority = e.kind.type === 'tip' || e.kind.type === 'paid_message' ? 5 : 0
        if (alert.tts_text && this.tts.enabled && this.tts.hold_for_approval) {
          const amount =
            e.kind.type === 'tip' || e.kind.type === 'paid_message'
              ? formatMoney(e.kind.money)
              : null
          this.ttsPending.push({
            id: `tts-${this.alertSeq}`,
            event_id: e.id,
            platform,
            name: actorOf(e)?.display_name ?? 'Someone',
            text: alert.tts_text,
            amount,
            received_at: now,
          })
          this.broadcastLive({ v: 1, type: 'tts_pending', data: clone(this.ttsPending) })
        }
        this.applyQueue(this.queue.enqueue(alert, priority, now))
      } else if (origin === 'live') {
        this.why.set(e.id, this.whyFor(e).reasons)
      }
    }
    return e
  }

  private applyQueue(actions: QueueAction[]): void {
    for (const a of actions) {
      if (a.type === 'show') this.showAlert(a.alert)
      if (a.type === 'hide')
        for (const s of this.overlaySubs)
          this.sendOverlay(s, 'alert_hide', { alert_id: a.alert_id })
    }
    this.broadcastQueue()
    this.scheduleQueue()
  }

  private showAlert(alert: RenderedAlert): void {
    let delivered = false
    for (const s of this.overlaySubs) {
      const o = this.overlays.find((x) => x.id === s.overlayId)
      const w = o?.widgets.find((x) => x.kind === 'alerts')
      if (!w || w.kind !== 'alerts') continue
      if (w.config.rule_ids && !w.config.rule_ids.includes(alert.rule_id)) continue
      if (alert.test && s.test) continue
      const withMedia = {
        ...alert,
        sound: this.mediaUrl(alert.sound),
        image: this.mediaUrl(alert.image),
      }
      this.sendOverlay(s, 'alert', withMedia)
      delivered = true
    }
    if (!delivered) {
      // No overlay open: let the alert "play" for its duration so the queue still moves.
      const id = alert.alert_id
      this.later(
        () => this.applyQueue(this.queue.ack(id, 'finished', Date.now())),
        alert.duration_ms,
      )
    }
  }

  private mediaUrl(id: string | null): string | null {
    if (!id) return null
    return this.media.find((m) => m.id === id)?.url ?? null
  }

  private scheduleQueue(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer)
    this.queueTimer = null
    const wake = this.queue.nextWake()
    if (wake === null) return
    this.queueTimer = setTimeout(
      () => {
        this.queueTimer = null
        this.applyQueue(this.queue.tick(Date.now()))
      },
      Math.max(0, wake - Date.now()) + 5,
    )
  }

  private broadcastQueue(): void {
    this.broadcastLive({ v: 1, type: 'queue', data: this.queue.snapshot() })
  }

  private broadcastLive(frame: unknown): void {
    const text = JSON.stringify(frame)
    for (const s of this.liveSubs) s.sock.deliver(text)
  }

  private setConnector(name: ConnectorName, state: ConnectorState): void {
    this.connectors[name] = state
    this.broadcastLive({ v: 1, type: 'status', data: { connectors: clone(this.connectors) } })
  }

  private overlayWants(s: OverlaySub, e: FerroEvent): boolean {
    const o = this.overlays.find((x) => x.id === s.overlayId)
    if (!o) return false
    return o.widgets.some((w) => {
      if (e.kind.type === 'chat_message')
        return (
          w.kind === 'chat' &&
          (w.config.platforms.length === 0 || w.config.platforms.includes(e.platform))
        )
      return (
        w.kind === 'events' && (w.config.kinds.length === 0 || w.config.kinds.includes(e.kind.type))
      )
    })
  }

  private sendOverlay(s: OverlaySub, type: string, data: unknown): void {
    if (!s.visible && type !== 'config') return
    s.seq += 1
    s.sock.deliver({ v: 1, seq: s.seq, type, data })
  }

  private sendSnapshot(s: OverlaySub): void {
    const o = this.overlays.find((x) => x.id === s.overlayId)
    if (!o) return
    const state: OverlayState = {
      goals: clone(this.goals),
      labels: this.labelsFor(o),
      viewers: clone(this.viewers),
      events: clone(this.events.filter((e) => isAlertable(e)).slice(-25)),
      chat: clone(this.events.filter((e) => e.kind.type === 'chat_message').slice(-50)),
      poll: this.polls.view(),
      giveaway: this.giveaways.card(),
    }
    s.seq += 1
    s.sock.deliver({ v: 1, seq: s.seq, type: 'snapshot', data: { overlay: clone(o), state } })
  }

  private labelsFor(o: Overlay): Record<string, string> {
    const out: Record<string, string> = {}
    for (const w of o.widgets) {
      if (w.kind !== 'label') continue
      const value =
        w.config.source === 'session_follows'
          ? String(this.stats.follows)
          : w.config.source === 'session_subs'
            ? String(this.stats.subs)
            : w.config.source === 'top_tip_session'
              ? 'Asha (₹500)'
              : (this.labels.get(w.config.source) ?? '')
      out[w.id] = w.config.template.replace(/\{name\}/g, value).replace(/\{value\}/g, value)
    }
    return out
  }

  private overlayClientFrame(s: OverlaySub, data: string): void {
    let f: { v?: unknown; type?: unknown; data?: Record<string, unknown> }
    try {
      f = JSON.parse(data) as typeof f
    } catch {
      return
    }
    if (f.v !== 1 || typeof f.data !== 'object' || f.data === null) return
    if (f.type === 'ack') {
      const id = f.data.alert_id
      const phase = f.data.phase
      if (
        typeof id === 'string' &&
        (phase === 'started' || phase === 'finished' || phase === 'failed')
      )
        this.applyQueue(this.queue.ack(id, phase, Date.now()))
    } else if (f.type === 'visibility') {
      s.visible = f.data.visible === true
      if (s.visible) this.sendSnapshot(s)
    }
    // hello and anything else: nothing to do; an overlay can never create events (R-36).
  }

  private testLoop(s: OverlaySub): void {
    const kinds = [
      'follow',
      'subscription',
      'tip',
      'raid',
      'platform_gift',
      'gift_batch',
      'paid_message',
      'reward_redemption',
    ]
    let i = 0
    const tick = () => {
      if (!this.overlaySubs.has(s)) return
      const kind = kinds[i++ % kinds.length] ?? 'follow'
      const ev = anySample(kind)
      if (ev) {
        const sel = select(this.rules, ev)
        if (sel)
          this.sendOverlay(s, 'alert', {
            ...this.designs.dress(render(`test-${i}`, sel.rule, sel.variation, ev), ev),
            sound: null,
          })
        this.sendOverlay(s, 'event', { ...ev, seq: this.seq })
      }
      this.later(tick, 6000)
    }
    this.later(tick, 400)
  }

  private updateState(e: FerroEvent): void {
    if (e.origin === 'test') return
    const a = actorOf(e)
    const k = e.kind
    let labelChanged = false
    if (k.type === 'follow' && a) {
      this.stats.follows++
      this.labels.set('latest_follower', a.display_name)
      labelChanged = true
    }
    if (k.type === 'subscription' && a) {
      this.stats.subs++
      this.labels.set('latest_sub', a.display_name)
      labelChanged = true
      this.bumpGoal('subs', 1)
    }
    if (k.type === 'gift_batch') {
      this.stats.subs += k.count
      this.bumpGoal('subs', k.count)
    }
    if (k.type === 'platform_gift' && k.value.unit === 'bits') this.stats.bits += k.value.amount
    if (k.type === 'tip' && k.status === 'captured' && a) {
      const t = this.stats.tips.find((m) => m.currency === k.money.currency)
      if (t) t.minor += k.money.minor
      else this.stats.tips.push({ ...k.money })
      this.labels.set('latest_tip', `${a.display_name} (${formatMoney(k.money)})`)
      labelChanged = true
      if (k.money.currency === 'INR') this.bumpGoal('tips', majorUnits(k.money))
    }
    if (k.type === 'chat_message') this.stats.messages++
    if (k.type === 'viewer_count') {
      this.viewers[e.platform] = k.count
      this.stats.viewers[e.platform as ChatPlatform] = k.count
      const total =
        (this.viewers.twitch ?? 0) + (this.viewers.youtube ?? 0) + (this.viewers.kick ?? 0)
      this.stats.peak_viewers = Math.max(this.stats.peak_viewers, total)
      this.pushState({ viewers: this.viewers })
    }
    if (labelChanged)
      for (const s of this.overlaySubs) {
        const o = this.overlays.find((x) => x.id === s.overlayId)
        if (o) this.sendOverlay(s, 'state', { labels: this.labelsFor(o) })
      }
  }

  private bumpGoal(kind: Goal['kind'], by: number): void {
    let changed = false
    for (const g of this.goals)
      if (g.kind === kind) {
        g.current += by
        changed = true
      }
    if (changed) this.pushState({ goals: this.goals })
  }

  private pushState(partial: Partial<Pick<OverlayState, 'goals' | 'viewers'>>): void {
    for (const s of this.overlaySubs) this.sendOverlay(s, 'state', clone(partial))
    if (partial.goals) this.broadcastLive({ v: 1, type: 'goals', data: clone(partial.goals) })
  }

  // ---------------------------------------------------------------- autoplay

  private anyChatConnected(): boolean {
    return (['twitch', 'youtube', 'kick'] as const).some(
      (p) => this.connectors[p].state === 'connected',
    )
  }

  private connectedChat(): ChatPlatform[] {
    return (['twitch', 'youtube', 'kick'] as const).filter(
      (p) => this.connectors[p].state === 'connected',
    )
  }

  private pickOf<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)] as T
  }

  private chatter(p: ChatPlatform) {
    const c = this.pickOf(CHATTERS[p])
    return namedActor(p, c.name, {
      id: `${p}-${c.name.toLowerCase().replace(/\s+/g, '')}`,
      color: c.color,
      roles: c.roles,
    })
  }

  private randomChat(): void {
    const ps = this.connectedChat()
    const weights = ps.map((p) => (p === 'twitch' ? 5 : p === 'youtube' ? 3 : 2))
    let r = this.rand() * weights.reduce((x, y) => x + y, 0)
    let p: ChatPlatform = ps[0] ?? 'twitch'
    for (let i = 0; i < ps.length; i++) {
      r -= weights[i] ?? 0
      if (r <= 0) {
        p = ps[i] ?? p
        break
      }
    }
    if (this.panicOn && this.rand() < 0.7) return
    if (this.filters.solicitation.enabled && this.rand() < 0.04) {
      this.spam(p)
      return
    }
    const actor = this.chatter(p)
    const text = this.pickOf(MESSAGES)
    const fragments:
      | { type: 'text'; text: string }[]
      | ({ type: 'text'; text: string } | { type: 'mention'; login: string })[] = text.startsWith(
      'yo chat',
    )
      ? [
          { type: 'text', text: 'yo ' },
          { type: 'mention', login: 'chat' },
          { type: 'text', text: text.slice(7) },
        ]
      : [{ type: 'text', text }]
    this.ingest(
      {
        type: 'chat_message',
        actor,
        content: { text, fragments },
        reply_to: null,
        is_action: false,
      },
      p,
      'live',
    )
  }

  /** Approve (`release`: overlays show it) or remove (`drop`: deleted on the platform). */
  private resolveHeld(id: string, how: 'release' | 'drop'): undefined {
    const e = this.events.find((x) => x.id === id)
    if (!this.heldMsgs.has(id) || !e)
      throw new HttpError(
        404,
        'held_not_found',
        'Another mod already dealt with that message.',
        'Nothing more to do.',
      )
    this.heldMsgs.delete(id)
    if (how === 'release') {
      for (const s of this.overlaySubs) if (this.overlayWants(s, e)) this.sendOverlay(s, 'event', e)
      for (const f of this.features()) f.onChat?.(e)
    } else if (e.source_id) {
      this.ingest({ type: 'message_deleted', message_id: e.source_id }, e.platform, 'live')
    }
    this.broadcastLive({
      v: 1,
      type: 'held_resolved',
      data: { event_id: id, outcome: how === 'release' ? 'released' : 'dropped' },
    })
    return undefined
  }

  /** Keeps a chat message away from overlays until a mod approves it (live `held` frame). */
  private hold(kind: EventKind, p: ChatPlatform, reason: string): FerroEvent {
    const e = this.ingest(kind, p, 'live', { held: true })
    this.heldMsgs.set(e.id, reason)
    if (this.heldMsgs.size > 200) this.heldMsgs.delete(this.heldMsgs.keys().next().value as string)
    this.broadcastLive({ v: 1, type: 'held', data: { event_id: e.id, reason } })
    return e
  }

  /**
   * A scam chatter, handled the way the scam filter is set (like the engine): held for a
   * mod, deleted, timed out or banned.
   */
  spam(p: ChatPlatform = 'twitch'): FerroEvent {
    const { kind, actor } = this.spamMessage(p)
    const reason = 'Looks like self-promotion or a scam (scam filter).'
    const action = this.filters.solicitation.action
    if (action === 'hold') return this.hold(kind, p, reason)
    const e = this.ingest(kind, p, 'live', { held: true })
    if (e.source_id) this.ingest({ type: 'message_deleted', message_id: e.source_id }, p, 'live')
    if (action === 'ban' && actor.id) {
      this.bans = this.bans.filter((x) => !(x.user_id === actor.id && x.platform === p))
      this.bans.unshift({
        platform: p,
        user_id: actor.id,
        login: actor.login ?? actor.display_name,
        display_name: actor.display_name,
        reason: 'Scam filter',
        banned_at: Date.now(),
        everywhere: false,
        by: null,
      })
      this.ingest({ type: 'ban', target: actor, reason: 'Scam filter', until: null }, p, 'live')
    }
    return e
  }

  private spamMessage(p: ChatPlatform): { kind: EventKind; actor: Actor } {
    const text = this.pickOf([
      'hey! i do stream overlays and emotes, check my profile for prices',
      'want more viewers? cheap_viewers dot com, real and fast',
      'Your stream is great, I can promote it to 10k people, DM me',
    ])
    const login = this.pickOf(['art_by_lumi_x', 'promo_wizard22', 'viewbooster_live'])
    // One id per spammer name, so banning the same account twice replaces its ban row.
    const actor = namedActor(p, login, { id: `${p}-spam-${login}`, roles: 512 })
    return {
      actor,
      kind: {
        type: 'chat_message',
        actor,
        content: { text, fragments: [{ type: 'text', text }] },
        reply_to: null,
        is_action: false,
      },
    }
  }

  /** A scam chatter held for a mod whatever the filter says (tests and the simulate menu). */
  holdSpam(p: ChatPlatform = 'twitch'): FerroEvent {
    return this.hold(
      this.spamMessage(p).kind,
      p,
      'Looks like self-promotion or a scam (scam filter).',
    )
  }

  private randomSupport(): void {
    const ps = this.connectedChat()
    const p = this.pickOf(ps)
    const roll = this.rand()
    const actor = this.chatter(p)
    let kind: EventKind
    if (roll < 0.34 && p !== 'youtube') kind = { type: 'follow', actor }
    else if (roll < 0.52)
      kind = {
        type: 'subscription',
        actor,
        tier: p === 'youtube' ? { type: 'level', id: 'lvl1', name: 'Member' } : { type: 'tier1' },
        months: 1 + Math.floor(this.rand() * 16),
        message:
          this.rand() < 0.5
            ? {
                text: 'love this community',
                fragments: [{ type: 'text', text: 'love this community' }],
              }
            : null,
        gifted_by: null,
      }
    else if (roll < 0.62 && p === 'twitch')
      kind = {
        type: 'platform_gift',
        actor,
        value: { unit: 'bits', amount: this.pickOf([100, 250, 500, 1000]) },
        message: null,
      }
    else if (roll < 0.62 && p === 'kick')
      kind = { type: 'platform_gift', actor, value: { unit: 'kicks', amount: 100 }, message: null }
    else if (roll < 0.7 && p === 'youtube')
      kind = {
        type: 'paid_message',
        actor,
        money: { minor: this.pickOf([4900, 9900, 19_900]), currency: 'INR' },
        content: { text: 'great stream!', fragments: [{ type: 'text', text: 'great stream!' }] },
        sticker_url: null,
      }
    else if (roll < 0.8) {
      const amount = this.pickOf([5000, 10_000, 25_000, 150_000])
      kind = {
        type: 'tip',
        actor: namedActor('tips', this.pickOf(['Asha', 'Vikram', 'Meghna', 'Daniel', 'Yuki'])),
        money: { minor: amount, currency: 'INR' },
        message: this.pickOf(['Keep it up!', 'for the new mic', 'gg wp']),
        provider: 'razorpay',
        payment_ref: `pay_${randomToken().slice(0, 10)}`,
        status: 'captured',
      }
      this.ingest(kind, 'tips', 'live')
      return
    } else if (roll < 0.86 && p !== 'youtube')
      kind = {
        type: 'reward_redemption',
        actor,
        reward: this.pickOf(['Hydrate!', 'Pick my loadout', 'Posture check']),
        cost: 500,
        input: null,
      }
    else if (roll < 0.9 && p === 'twitch')
      kind = { type: 'raid', from: actor, viewers: 12 + Math.floor(this.rand() * 80) }
    else if (p !== 'youtube') kind = { type: 'follow', actor }
    else
      kind = {
        type: 'gift_batch',
        gifter: actor,
        tier: { type: 'tier1' },
        count: this.pickOf([1, 5, 10]),
      }
    this.ingest(kind, p, 'live')
  }

  private driftViewers(): void {
    for (const p of this.connectedChat()) {
      const cur = this.viewers[p] ?? 0
      const next = Math.max(0, Math.round(cur + (this.rand() - 0.45) * cur * 0.04))
      this.ingest({ type: 'viewer_count', count: next }, p, 'live')
    }
  }

  private seedHistory(now: number): void {
    const add = (
      kind: EventKind,
      platform: Platform,
      agoMs: number,
      origin: FerroEvent['origin'] = 'live',
      why?: string[],
    ) => {
      this.seq += 1
      const e: FerroEvent = {
        id: `ev-h${this.seq}`,
        seq: this.seq,
        platform,
        channel: null,
        source_id: `${platform}-h${this.seq}`,
        occurred_at: now - agoMs,
        received_at: now - agoMs,
        origin,
        kind,
      }
      this.events.push(e)
      if (why) this.why.set(e.id, why)
    }
    if (!this.setupDone) return
    const t = (n: string, extra = {}) =>
      namedActor('twitch', n, { id: `twitch-${n.toLowerCase()}`, ...extra })
    add({ type: 'follow', actor: t('LunaLagoon') }, 'twitch', 31 * 60_000)
    add(
      {
        type: 'subscription',
        actor: t('DesertFoxx', { roles: 8 }),
        tier: { type: 'tier1' },
        months: 14,
        message: {
          text: 'Fourteen months and still the comfiest stream',
          fragments: [{ type: 'text', text: 'Fourteen months and still the comfiest stream' }],
        },
        gifted_by: null,
      },
      'twitch',
      24 * 60_000,
    )
    add({ type: 'follow', actor: t('quietfan_2009') }, 'twitch', 20 * 60_000, 'live', [
      'Twitch hid this follow from the alert feed because the account looks low-trust (new, no verified email). It still counts on Twitch.',
    ])
    add(
      {
        type: 'tip',
        actor: namedActor('tips', 'Asha'),
        money: { minor: 50_000, currency: 'INR' },
        message: 'Keep it up!',
        provider: 'razorpay',
        payment_ref: 'pay_hist1',
        status: 'captured',
      },
      'tips',
      16 * 60_000,
    )
    add(
      {
        type: 'tip',
        actor: namedActor('tips', 'Rohan'),
        money: { minor: 5_000, currency: 'INR' },
        message: 'small one',
        provider: 'razorpay',
        payment_ref: 'pay_hist2',
        status: 'captured',
      },
      'tips',
      13 * 60_000,
      'live',
      ['Below the ₹100 minimum for tip alerts. Change it in Tips → Minimum for an alert.'],
    )
    add(
      {
        type: 'raid',
        from: namedActor('kick', 'neo_tokyo_drift', { id: 'kick-neo' }),
        viewers: 23,
      },
      'kick',
      9 * 60_000,
      'live',
      ['No alert rule for Kick raids. The “Raids” rule only covers Twitch.'],
    )
    add({ type: 'follow', actor: t('pixelpilgrim') }, 'twitch', 7 * 60_000, 'backfill')
    add(
      {
        type: 'platform_gift',
        actor: t('BitBaron'),
        value: { unit: 'bits', amount: 1000 },
        message: {
          text: 'Cheer1000 for the clutch',
          fragments: [{ type: 'text', text: 'Cheer1000 for the clutch' }],
        },
      },
      'twitch',
      4 * 60_000,
    )
    add(
      {
        type: 'paid_message',
        actor: namedActor('youtube', 'Rahul Verma', { id: 'youtube-rahulverma', roles: 16 }),
        money: { minor: 19_900, currency: 'INR' },
        content: {
          text: 'Super Chat for the win',
          fragments: [{ type: 'text', text: 'Super Chat for the win' }],
        },
        sticker_url: null,
      },
      'youtube',
      2 * 60_000,
    )
    for (let i = 0; i < 24; i++) {
      const p: ChatPlatform = i % 4 === 0 ? 'youtube' : i % 5 === 0 ? 'kick' : 'twitch'
      add(
        {
          type: 'chat_message',
          actor: this.chatter(p),
          content: { text: this.pickOf(MESSAGES), fragments: [] },
          reply_to: null,
          is_action: false,
        },
        p,
        (24 - i) * 9000,
      )
      const last = this.events[this.events.length - 1]
      if (last && last.kind.type === 'chat_message')
        last.kind.content.fragments = [{ type: 'text', text: last.kind.content.text }]
    }
  }

  private isLiveOn(p: ChatPlatform): boolean {
    return this.setupDone && this.connectors[p].state === 'connected'
  }

  private isLive(): boolean {
    return this.isLiveOn('twitch') || this.isLiveOn('youtube') || this.isLiveOn('kick')
  }

  private lookupName(platform: Platform, userId: string): string | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const a = actorOf(this.events[i] as FerroEvent)
      if (a && a.platform === platform && a.id === userId) return a.display_name
    }
    return null
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }
}

// ------------------------------------------------------------------ helpers

function label(p: Platform): string {
  return (
    { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tips: 'Tips', ferrocast: 'Ferrocast' }[
      p
    ] ?? p
  )
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function headerOf(h: HeadersInit | undefined, name: string): string | null {
  if (!h) return null
  if (h instanceof Headers) return h.get(name)
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name)?.[1] ?? null
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name) return v
  return null
}

async function readBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown
    } catch {
      throw new HttpError(400, 'invalid', 'The request body isn’t valid JSON.')
    }
  }
  if (body instanceof FormData) return body
  // A raw upload (tip page images): the Blob keeps its type, like a Content-Type header.
  if (body instanceof Blob) return body
  return undefined
}

function requireObj(v: unknown): object {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new HttpError(400, 'invalid', 'The request body must be a JSON object.')
  return v
}

function clampInt(v: string | null, min: number, max: number, def: number): number {
  const n = v === null ? NaN : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function guessType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'video/webm',
      mp4: 'video/mp4',
    }[ext] ?? 'application/octet-stream'
  )
}

function defaultCode(status: number): string {
  return (
    {
      400: 'invalid',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      409: 'conflict',
      413: 'too_large',
      415: 'unsupported_type',
      422: 'cannot_run',
      429: 'rate_limited',
      503: 'starting',
    }[status] ?? 'error'
  )
}

function defaultMessage(status: number): string {
  return (
    {
      400: 'name: that name is too long.',
      401: 'This session has ended.',
      403: 'Ferrocast blocked this request.',
      404: 'That doesn’t exist anymore.',
      409: 'That name is already taken.',
      413: 'Sounds can be up to 5 MB.',
      415: 'That file type isn’t supported.',
      422: 'Twitch isn’t connected.',
      429: 'Too many requests.',
      503: 'Ferrocast is still starting.',
    }[status] ?? 'Something went wrong.'
  )
}

function validateCommand(c: Partial<Command>, list: Command[], id: string | null): void {
  if (c.name !== undefined) {
    if (!/^!\S{1,30}$/.test(c.name))
      throw new HttpError(
        400,
        'invalid',
        'name: commands start with ! and have no spaces, like !discord.',
      )
    if (list.some((x) => x.id !== id && x.name.toLowerCase() === c.name?.toLowerCase()))
      throw new HttpError(
        409,
        'name_taken',
        `${c.name} already exists.`,
        'Edit that command instead, or pick another name.',
      )
  } else if (id === null)
    throw new HttpError(
      400,
      'invalid',
      'name: commands start with ! and have no spaces, like !discord.',
    )
  if (c.response !== undefined && !c.response.trim())
    throw new HttpError(400, 'invalid', 'response: what should the bot say?')
  if (c.response !== undefined && c.response.length > 500)
    throw new HttpError(400, 'invalid', 'response: replies can be up to 500 characters.')
  if (c.cooldown_s !== undefined && (c.cooldown_s < 0 || c.cooldown_s > 86_400))
    throw new HttpError(400, 'invalid', 'cooldown_s: must be 0 seconds to 24 hours.')
}

function validateTimer(t: Partial<Timer>, _list: Timer[], id: string | null): void {
  if (id === null && !t.message?.trim())
    throw new HttpError(400, 'invalid', 'message: what should the timer post?')
  if (t.every_min !== undefined && (t.every_min < 5 || t.every_min > 720))
    throw new HttpError(
      400,
      'invalid',
      'every_min: timers can run every 5 minutes to 12 hours. Faster than that floods chat.',
    )
}

/** Frees an uploaded file's bytes; other URLs (bundled samples) are left alone. */
function revokeBlobUrl(url: string): void {
  if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}
