// Studio: the streamer's production tools (API.md §4 "Studio"). Counters, quotes and chat
// modules; one stream-info form for every platform; the go-live checklist; OBS helpers;
// the "Don't miss" lane and stream markers. Everything runs on the streamer's PC (free).

import type { FerroClient } from './client'
import type { ChatPlatform, Platform } from './types'

// ---------------------------------------------------------------- chatbot

export interface Counter {
  /** `deaths`: lowercase letters, digits and `_`. Read in templates as `{count:deaths}`. */
  name: string
  value: number
  /** `!deaths`, or null when only the dashboard changes it. */
  command: string | null
  /** `{count}`, `{counter}`, `{user}`. */
  reply: string
  enabled: boolean
}

export interface CounterInput {
  name: string
  command?: string | null
  reply?: string
  enabled?: boolean
  value?: number
}

export interface Quote {
  id: number
  text: string
  added_by: string
  at: number
}

export interface Toggle {
  enabled: boolean
}

export interface ModulesConfig {
  eight_ball: Toggle
  dice: Toggle
  followage: Toggle
  watchtime: Toggle
  uptime: Toggle
  quotes: Toggle
  roulette: { enabled: boolean; min_bet: number; max_bet: number; win_percent: number }
  duel: { enabled: boolean; max_bet: number; accept_s: number }
  game_title: { enabled: boolean; mods_can_change: boolean }
  shoutout: { enabled: boolean; template: string }
}

export type ModuleKey = keyof ModulesConfig

/** What each module answers to and does, for the Modules list. */
export const MODULES: { key: ModuleKey; name: string; commands: string; about: string }[] = [
  { key: 'eight_ball', name: '8 ball', commands: '!8ball', about: 'Answers a yes or no question.' },
  { key: 'dice', name: 'Dice', commands: '!roll 2d6', about: 'Rolls 1 to 10 dice.' },
  {
    key: 'roulette',
    name: 'Roulette',
    commands: '!roulette 100',
    about: 'Bet points: win double or lose the bet.',
  },
  {
    key: 'duel',
    name: 'Duel',
    commands: '!duel @name 100',
    about: 'Two viewers bet the same points; one wins both.',
  },
  {
    key: 'followage',
    name: 'Follow age',
    commands: '!followage',
    about: 'How long someone has followed.',
  },
  {
    key: 'watchtime',
    name: 'Watch time',
    commands: '!watchtime',
    about: 'Minutes watched while chatting live.',
  },
  { key: 'uptime', name: 'Uptime', commands: '!uptime', about: 'How long you’ve been live.' },
  {
    key: 'game_title',
    name: 'Game and title',
    commands: '!game, !title',
    about: 'Shows them; mods can change them everywhere.',
  },
  {
    key: 'shoutout',
    name: 'Shoutout',
    commands: '!so @name',
    about: 'Mods send viewers to another streamer.',
  },
  {
    key: 'quotes',
    name: 'Quotes',
    commands: '!quote, !quote add',
    about: 'Random or numbered quotes; mods add them.',
  },
]

// ---------------------------------------------------------------- stream info

export interface CategoryIds {
  twitch?: string
  youtube?: string
  kick?: string
}

export interface StreamCategory {
  name: string
  ids?: CategoryIds
}

export interface StreamInfo {
  title?: string
  category?: StreamCategory
  /** `[]` clears them. */
  tags?: string[]
  /** ISO 639-1 like `en`. */
  language?: string
  /** YouTube only. `""` clears it. */
  description?: string
  /** A media library id (JPEG or PNG, up to 2 MB). YouTube only. */
  thumbnail?: string
  /** A platform's own fields, sent there instead of the everywhere ones (no nested `per`). */
  per?: PerPlatform
}

export type PerPlatform = Partial<Record<ChatPlatform, StreamInfo>>

export const STREAM_INFO_PLATFORMS: ChatPlatform[] = ['twitch', 'youtube', 'kick']

const STREAM_FIELDS = ['title', 'category', 'tags', 'language', 'description', 'thumbnail'] as const

/** The fields set (not `per`). */
export function streamFields(info: StreamInfo): (typeof STREAM_FIELDS)[number][] {
  return STREAM_FIELDS.filter((f) => info[f] !== undefined)
}

/** What platform `p` gets: the everywhere fields with its own on top (as the engine). */
export function streamInfoFor(info: StreamInfo, p: ChatPlatform): StreamInfo {
  const { per, ...base } = info
  const own = per?.[p]
  if (!own) return base
  const out: StreamInfo = { ...base }
  for (const f of STREAM_FIELDS) if (own[f] !== undefined) Object.assign(out, { [f]: own[f] })
  return out
}

export type StreamInfoErrorCode =
  | 'not_connected'
  | 'reconnect_needed'
  | 'rate_limited'
  | 'refused'
  | 'unreachable'
  | 'no_broadcast'
  | 'unknown_category'
  | 'not_supported'

export interface PlatformResult {
  platform: ChatPlatform
  ok: boolean
  applied: string[]
  skipped: string[]
  error: { code: StreamInfoErrorCode; message: string; hint: string | null } | null
}

export interface ApplyResult {
  results: PlatformResult[]
  ok: number
  failed: number
}

export interface StreamPreset {
  id: string
  name: string
  info: StreamInfo
  updated_at: number
}

export interface StreamHistoryEntry {
  info: StreamInfo
  at: number
  results: PlatformResult[]
}

export interface PlatformAccess {
  platform: ChatPlatform
  connected: boolean
  can_edit: boolean
  needs: string | null
  supports: {
    title: boolean
    category: boolean
    tags: boolean
    language: boolean
    description: boolean
    thumbnail: boolean
  }
}

export interface StreamInfoView {
  last: StreamHistoryEntry | null
  presets: StreamPreset[]
  history: StreamHistoryEntry[]
  platforms: PlatformAccess[]
}

export interface CategoryHit {
  id: string
  name: string
  image_url: string | null
}

export const MAX_STREAM_TITLE = 140
export const MAX_STREAM_TAGS = 10
export const MAX_STREAM_DESCRIPTION = 5000

/** Same rules as the engine (`core::stream_info`), so the form can say so before sending. */
export function checkStreamInfo(info: StreamInfo): string | null {
  let ownFields = false
  for (const [key, own] of Object.entries(info.per ?? {})) {
    if (!STREAM_INFO_PLATFORMS.includes(key as ChatPlatform))
      return 'per: only Twitch, YouTube and Kick can have their own fields.'
    if (!own) continue
    if (own.per && Object.keys(own.per).length > 0)
      return `per.${key}: a platform's own fields can't have their own per-platform fields.`
    if (streamFields(own).length === 0) continue
    const problem = checkFields(own)
    if (problem) return `per.${key}.${problem}`
    ownFields = true
  }
  const problem = checkFields(info)
  if (problem) return problem
  if (streamFields(info).length === 0 && !ownFields)
    return 'Fill in at least one of title, category, tags, language, description or thumbnail.'
  return null
}

function checkFields(info: StreamInfo): string | null {
  if (info.title !== undefined) {
    const t = info.title.trim()
    if (!t) return 'title: write a title, or leave it out to keep the current one.'
    if ([...t].length > MAX_STREAM_TITLE)
      return `title: ${MAX_STREAM_TITLE} characters at most (Twitch’s limit).`
  }
  if (info.tags) {
    if (info.tags.length > MAX_STREAM_TAGS) return `tags: ${MAX_STREAM_TAGS} tags at most.`
    for (const tag of info.tags) {
      const clean = tag.replace(/^#/, '')
      if ([...clean].length > 25 || !/^[\p{L}\p{M}\p{N}]+$/u.test(clean))
        return `tags: "${tag}" can only have letters and numbers, up to 25 (no spaces).`
    }
  }
  if (info.language !== undefined && !/^[a-z]{2}$/.test(info.language))
    return 'language: a two-letter code like en, hi or es.'
  if (info.description !== undefined) {
    if ([...info.description.trim()].length > MAX_STREAM_DESCRIPTION)
      return `description: ${MAX_STREAM_DESCRIPTION} characters at most (YouTube’s limit).`
    if (/[<>]/.test(info.description))
      return 'description: YouTube doesn’t allow < or > in a description.'
  }
  return null
}

// ---------------------------------------------------------------- show

export interface ShowConfig {
  preset_id: string | null
  starting_scene: string | null
  countdown_s: number
  live_scene: string | null
  alerts_on: boolean
  discord: boolean
  bot_on: boolean
  replay_buffer: boolean
  /** Press OBS's Start Streaming as the show starts. */
  start_stream: boolean
  ending_scene: string | null
  /** Press OBS's Stop Streaming `stop_delay_s` after the ending scene. */
  stop_stream: boolean
  /** 0–600. */
  stop_delay_s: number
  recap_message: string | null
  mic_sources: string[]
  cam_sources: string[]
  min_disk_gb: number
  platforms: ChatPlatform[]
  /** When the countdown reaches zero: each action on or off. */
  at_zero?: AtZero
}

export interface AtZero {
  /** Switch OBS to the live scene. */
  switch: boolean
  /** Unmute the pre-flight mics. */
  unmute: boolean
  /** Press OBS's Start Streaming, when it isn't streaming yet. */
  start_stream: boolean
  record: boolean
  /** Say this in chat; null is off. */
  chat: string | null
  marker: boolean
}

export const AT_ZERO_DEFAULT: AtZero = {
  switch: true,
  unmute: false,
  start_stream: false,
  record: false,
  chat: null,
  marker: true,
}

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface PreflightCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
  /** A dashboard link (`#/settings/obs`) or a one-click fix (`action:unmute:Mic`). */
  fix: { label: string; href: string } | null
}

export interface Preflight {
  checks: PreflightCheck[]
  ready: boolean
}

export type ShowPhase = 'starting' | 'countdown' | 'live' | 'ended'

export interface ShowStep {
  id: string
  label: string
  status: 'done' | 'failed' | 'skipped' | 'waiting'
  detail: string
}

export interface ShowRun {
  id: string
  phase: ShowPhase
  started_at: number
  countdown_ends_at: number | null
  live_scene: string | null
  ended_at: number | null
  steps: ShowStep[]
}

// ---------------------------------------------------------------- OBS

export interface ObsSceneItem {
  id: number
  source: string
  enabled: boolean
  kind: string | null
}

export interface ObsScene {
  name: string
  items: ObsSceneItem[]
}

export interface ObsScenes {
  current: string | null
  scenes: ObsScene[]
}

export interface ScenesConfig {
  chat_enabled: boolean
  chat_allowed: string[]
  /** Alt+1 … Alt+9 in the dashboard, in order. */
  hotkeys: string[]
  brb_scene: string | null
  brb_on_ads: boolean
  brb_mute: string[]
  clip_command: boolean
  clip_on_big_moments: boolean
}

export interface HealthWarning {
  id: 'dropped' | 'encoder' | 'render' | 'cpu' | 'disk' | 'reconnecting' | string
  level: 'warn' | 'error'
  message: string
  hint: string
}

export interface ObsHealth {
  at: number
  streaming: boolean
  cpu: number
  memory_mb: number
  disk_gb: number
  fps: number
  render_skipped_pct: number
  encoder_skipped_pct: number
  dropped_pct: number
  bitrate_kbps: number
  warnings: HealthWarning[]
}

// ---------------------------------------------------------------- moments

export type MomentKind =
  | 'tip'
  | 'superchat'
  | 'bits'
  | 'gift'
  | 'raid'
  | 'first_chatter'
  | 'chat_spike'
  | 'clip'
  | 'manual'

export interface LaneItem {
  id: string
  kind: MomentKind
  title: string
  detail: string | null
  platform: Platform
  event_id: string
  at: number
}

export interface Marker {
  id: number
  at: number
  offset_ms: number | null
  kind: MomentKind
  label: string
  platform: Platform | null
  clip: boolean
}

export interface MomentsConfig {
  big_tip: number
  big_gift_value: number
  big_sub_gift: number
  raid_viewers: number
  first_chatters: boolean
  sound: 'chime' | 'coin' | 'bell' | 'none'
  volume: number
  markers: boolean
  spike_factor: number
  spike_min: number
  twitch_markers: boolean
}

export interface ClipResult {
  saved: boolean
  path: string | null
  marker: Marker
}

/** Studio's frames on the dashboard socket (API.md §4 "Studio"). */
export type StudioFrame =
  | {
      v: 1
      type: 'lane'
      data: { items: LaneItem[]; added: LaneItem | null; sound: string; volume: number }
    }
  | { v: 1; type: 'marker'; data: Marker }
  | { v: 1; type: 'counter'; data: { name: string; value: number } }
  | { v: 1; type: 'show'; data: { show: ShowRun | null } }
  | { v: 1; type: 'obs_health'; data: ObsHealth }
  | { v: 1; type: 'brb'; data: { on: boolean; scene: string } }
  | { v: 1; type: 'golive'; data: import('./golive').GoLiveFrame }

export const STUDIO_FRAME_TYPES = [
  'lane',
  'marker',
  'counter',
  'show',
  'obs_health',
  'brb',
  'golive',
] as const

/** "01:02:03" from milliseconds into the stream. */
export function timecode(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

/** Studio's routes on a dashboard client. */
export function studioApi(c: FerroClient) {
  const enc = encodeURIComponent
  const get = <T>(p: string) => c.request<T>('GET', `/api/v1${p}`)
  const post = <T>(p: string, b: unknown = {}) => c.request<T>('POST', `/api/v1${p}`, b)
  const put = <T>(p: string, b: unknown) => c.request<T>('PUT', `/api/v1${p}`, b)
  const del = (p: string) => c.request<void>('DELETE', `/api/v1${p}`)
  return {
    counters: () => get<Counter[]>('/counters'),
    createCounter: (b: CounterInput) => post<Counter>('/counters', b),
    updateCounter: (name: string, b: Partial<Omit<Counter, 'name'>>) =>
      put<Counter>(`/counters/${enc(name)}`, b),
    deleteCounter: (name: string) => del(`/counters/${enc(name)}`),
    changeCounter: (name: string, op: 'add' | 'set' | 'reset', amount?: number) =>
      post<Counter>(
        `/counters/${enc(name)}/change`,
        amount === undefined ? { op } : { op, amount },
      ),
    quotes: () => get<Quote[]>('/quotes'),
    addQuote: (text: string) => post<Quote>('/quotes', { text }),
    editQuote: (id: number, text: string) => put<Quote>(`/quotes/${id}`, { text }),
    deleteQuote: (id: number) => del(`/quotes/${id}`),
    modules: () => get<ModulesConfig>('/modules'),
    saveModules: (patch: Partial<{ [K in ModuleKey]: Partial<ModulesConfig[K]> }>) =>
      put<ModulesConfig>('/modules', patch),

    streamInfo: () => get<StreamInfoView>('/stream-info'),
    /** Resolves on 200 and 207; a 422 where no platform took it rejects with the results. */
    applyStreamInfo: (info: StreamInfo, platforms?: ChatPlatform[]) =>
      post<ApplyResult>('/stream-info/apply', platforms ? { info, platforms } : { info }),
    categories: (platform: ChatPlatform, q: string) =>
      get<{ platform: ChatPlatform; items: CategoryHit[] }>(
        `/stream-info/categories?platform=${platform}&q=${enc(q)}`,
      ),
    createPreset: (name: string, info: StreamInfo) =>
      post<StreamPreset>('/stream-info/presets', { name, info }),
    savePreset: (p: StreamPreset) => put<StreamPreset>(`/stream-info/presets/${enc(p.id)}`, p),
    deletePreset: (id: string) => del(`/stream-info/presets/${enc(id)}`),

    show: () => get<{ show: ShowRun | null }>('/show'),
    showConfig: () => get<ShowConfig>('/show/config'),
    saveShowConfig: (patch: Partial<ShowConfig>) => put<ShowConfig>('/show/config', patch),
    preflight: () => get<Preflight>('/show/preflight'),
    preflightFix: (action: string) => post<Preflight>('/show/preflight/fix', { action }),
    startShow: (force = false) => post<{ show: ShowRun }>('/show/start', { force }),
    skipCountdown: () => post<{ show: ShowRun }>('/show/countdown/skip'),
    cancelCountdown: () => post<{ show: ShowRun }>('/show/countdown/cancel'),
    liveScene: () => post<{ show: ShowRun }>('/show/live-scene'),
    endShow: () => post<{ show: ShowRun }>('/show/end'),

    obsScenes: () => get<ObsScenes>('/obs/scenes'),
    obsInputs: () => get<{ name: string; kind: string }[]>('/obs/inputs'),
    switchScene: (scene: string) => post<void>('/obs/scene', { scene }),
    setSourceVisible: (scene: string, item_id: number, visible: boolean) =>
      post<void>('/obs/source', { scene, item_id, visible }),
    setMuted: (input: string, muted: boolean) => post<void>('/obs/input/mute', { input, muted }),
    clip: (label?: string) => post<ClipResult>('/obs/replay/save', label ? { label } : {}),
    brb: (on: boolean) => post<{ on: boolean; scene: string }>('/obs/brb', { on }),
    obsStream: () => get<{ streaming: boolean }>('/obs/stream'),
    setObsStream: (on: boolean) => post<{ streaming: boolean }>('/obs/stream', { on }),
    health: () => get<{ health: ObsHealth | null }>('/obs/health'),
    checkHealth: () => post<{ health: ObsHealth }>('/obs/health'),
    switcher: () => get<ScenesConfig>('/obs/switcher'),
    saveSwitcher: (patch: Partial<ScenesConfig>) => put<ScenesConfig>('/obs/switcher', patch),

    momentsConfig: () => get<MomentsConfig>('/moments/config'),
    saveMomentsConfig: (patch: Partial<MomentsConfig>) =>
      put<MomentsConfig>('/moments/config', patch),
    lane: () => get<LaneItem[]>('/moments/lane'),
    dismiss: (id: string) => post<LaneItem[]>(`/moments/lane/${enc(id)}/dismiss`),
    dismissAll: () => post<LaneItem[]>('/moments/lane/dismiss-all'),
    markers: (since?: number) =>
      get<Marker[]>(since === undefined ? '/moments/markers' : `/moments/markers?since=${since}`),
    addMarker: (label?: string) => post<Marker>('/moments/markers', label ? { label } : {}),
    deleteMarker: (id: number) => del(`/moments/markers/${id}`),
    /** The URL of the export (the dashboard downloads it with the session header). */
    exportPath: (format: 'csv' | 'txt', since?: number) =>
      `/api/v1/moments/markers/export?format=${format}${since === undefined ? '' : `&since=${since}`}`,
  }
}

export type StudioApi = ReturnType<typeof studioApi>
