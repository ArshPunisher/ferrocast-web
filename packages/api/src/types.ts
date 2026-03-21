// Shapes of the local API (ferrocast/docs/API.md) and the Rust serde types in
// `ferrocast-core` (event.rs, alert.rs, money.rs, queue.rs). snake_case keys, enums tagged
// with "type", times in Unix milliseconds. Keep this file in step with API.md: it is the
// contract, and the demo engine is checked against it by the tests.

export type Platform = 'twitch' | 'youtube' | 'kick' | 'tips' | 'ferrocast'
export type ChatPlatform = 'twitch' | 'youtube' | 'kick'
export const CHAT_PLATFORMS: readonly ChatPlatform[] = ['twitch', 'youtube', 'kick']
export const PLATFORMS: readonly Platform[] = ['twitch', 'youtube', 'kick', 'tips', 'ferrocast']

export type Millis = number

/** ₹500.00 = { minor: 50000, currency: "INR" } */
export interface Money {
  minor: number
  currency: string
}

export type ValueUnit = 'bits' | 'kicks' | 'jewels' | { other: string }
export interface PlatformValue {
  unit: ValueUnit
  amount: number
}

/** Role bit flags (core::event::Roles). */
export const Roles = {
  BROADCASTER: 1,
  MODERATOR: 2,
  VIP: 4,
  SUBSCRIBER: 8,
  MEMBER: 16,
  FOUNDER: 32,
  STAFF: 64,
  VERIFIED: 128,
  BOT: 256,
  FIRST_TIME: 512,
} as const

export interface Badge {
  set: string
  version: string
  title: string | null
  image_url: string | null
}

export interface Actor {
  platform: Platform
  id: string | null
  login: string | null
  display_name: string
  avatar_url: string | null
  color: string | null
  roles: number
  badges: Badge[]
  anonymous: boolean
}

export type EmoteProvider = 'native' | 'seven_tv' | 'bttv' | 'ffz'
export type Fragment =
  | { type: 'text'; text: string }
  | {
      type: 'emote'
      provider: EmoteProvider
      id: string
      name: string
      url: string
      zero_width: boolean
    }
  | { type: 'mention'; login: string }
  | { type: 'link'; url: string }

export interface Content {
  text: string
  fragments: Fragment[]
}

export type Tier =
  | { type: 'prime' }
  | { type: 'tier1' }
  | { type: 'tier2' }
  | { type: 'tier3' }
  | { type: 'level'; id: string; name: string }

export type TipProvider = 'razorpay' | 'stripe' | 'paypal' | 'ko_fi'
export type PaymentStatus = 'pending' | 'captured' | 'refunded' | 'disputed'
export type ChatMode = 'followers_only' | 'subscribers_only' | 'emote_only' | 'slow' | 'unique_chat'
export type Origin = 'live' | 'backfill' | 'replay' | 'test'

export interface ChannelRef {
  platform: Platform
  id: string
  name: string
}

/** `EventKind::Connector(ConnectorStatus)`: the inner enum is tagged with "state". */
export type ConnectorStatus =
  | { state: 'connected' }
  | { state: 'reconnecting'; attempt: number }
  | { state: 'disconnected'; reason: string }
  | { state: 'sign_in_needed' }
  | { state: 'scopes_missing'; scopes: string[] }

export type EventKind =
  | {
      type: 'chat_message'
      actor: Actor
      content: Content
      reply_to: string | null
      is_action: boolean
    }
  | { type: 'message_deleted'; message_id: string }
  | { type: 'user_messages_cleared'; target: Actor }
  | { type: 'follow'; actor: Actor }
  | { type: 'raid'; from: Actor; viewers: number }
  | { type: 'viewer_count'; count: number }
  | {
      type: 'subscription'
      actor: Actor
      tier: Tier
      months: number
      message: Content | null
      gifted_by: Actor | null
    }
  | { type: 'gift_batch'; gifter: Actor; tier: Tier; count: number }
  | { type: 'platform_gift'; actor: Actor; value: PlatformValue; message: Content | null }
  | {
      type: 'paid_message'
      actor: Actor
      money: Money
      content: Content | null
      sticker_url: string | null
    }
  | {
      type: 'tip'
      actor: Actor
      money: Money
      message: string | null
      provider: TipProvider
      payment_ref: string
      status: PaymentStatus
    }
  | {
      type: 'reversal'
      original_source_id: string
      reason: 'refund' | 'chargeback' | 'cancelled'
    }
  | { type: 'reward_redemption'; actor: Actor; reward: string; cost: number; input: string | null }
  | { type: 'ban'; target: Actor; reason: string | null; until: Millis | null }
  | { type: 'unban'; target: Actor }
  | { type: 'mode_changed'; mode: ChatMode; enabled: boolean }
  | { type: 'stream_online'; title: string | null }
  | { type: 'stream_offline' }
  | { type: 'ad_break'; seconds: number }
  | ({ type: 'connector' } & ConnectorStatus)
  | { type: 'unknown'; name: string }

export type EventKindName = EventKind['type']

export interface FerroEvent {
  id: string
  seq: number
  platform: Platform
  channel: ChannelRef | null
  source_id: string | null
  occurred_at: Millis
  received_at: Millis
  origin: Origin
  kind: EventKind
}

/** Kinds an alert rule may target (core::alert::ALERT_KINDS). */
export const ALERT_KINDS = [
  'follow',
  'subscription',
  'gift_batch',
  'platform_gift',
  'paid_message',
  'tip',
  'raid',
  'reward_redemption',
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

export interface RenderedAlert {
  alert_id: string
  event_id: string
  rule_id: string
  variation_id: string
  kind: string
  platform: Platform
  title: string
  body: string
  image: string | null
  sound: string | null
  volume: number
  duration_ms: number
  layout: string
  css: string
  tts_text: string | null
  tts_audio: string | null
  test: boolean
}

export type Condition =
  | { type: 'amount_at_least'; value: number; currency: string | null }
  | { type: 'amount_below'; value: number; currency: string | null }
  | { type: 'tier_at_least'; tier: number }
  | { type: 'months_at_least'; months: number }
  | { type: 'platform_is'; platform: Platform }
  | { type: 'is_gifted' }
  | { type: 'has_message' }
  | { type: 'message_contains'; text: string }
  | { type: 'all'; of: Condition[] }
  | { type: 'any'; of: Condition[] }

export interface Variation {
  id: string
  name: string
  condition: Condition | null
  priority: number
  title: string
  body: string
  image: string | null
  sound: string | null
  volume: number
  duration_ms: number
  tts: boolean
  layout: string
  css: string
}

export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  kinds: string[]
  platforms: Platform[]
  variations: Variation[]
}

export interface Queue {
  paused: boolean
  playing: { alert: RenderedAlert; started_at: Millis } | null
  waiting: { alert: RenderedAlert; priority: number; enqueued_at: Millis }[]
}

export type ConnectorStateName =
  'off' | 'connected' | 'reconnecting' | 'disconnected' | 'sign_in_needed' | 'scopes_missing'

export interface ConnectorState {
  state: ConnectorStateName
  account: { name: string; avatar_url: string | null } | null
  detail: string | null
  last_event_at: Millis | null
}

export type ConnectorName = 'twitch' | 'youtube' | 'kick' | 'obs' | 'relay'
export type Connectors = Record<ConnectorName, ConnectorState>

export interface Status {
  version: string
  port: number
  live: Record<ChatPlatform, boolean>
  connectors: Connectors
  setup_done: boolean
}

export interface Account {
  platform: ChatPlatform
  name: string
  avatar_url: string | null
  connected_at: Millis
  scopes_ok: boolean
}

export type ConnectFlow =
  | { flow: 'device_code'; user_code: string; verification_url: string; expires_at: Millis }
  | { flow: 'browser'; url: string }

export type WidgetKind = 'alerts' | 'chat' | 'events' | 'goal' | 'label' | 'viewers'
/** Default overlay theme id (the engine's presets use it too). */
export const DEFAULT_THEME = 'molten'

export const WIDGET_KINDS: readonly WidgetKind[] = [
  'alerts',
  'chat',
  'events',
  'goal',
  'label',
  'viewers',
]

export interface AlertsConfig {
  theme: string
  rule_ids: string[] | null
}
export interface ChatConfig {
  platforms: Platform[]
  max_messages: number
  fade_after_s: number | null
  show_badges: boolean
  show_platform: boolean
  hide_commands: boolean
  hide_bots: boolean
  font_size: number
  theme: string
}
export interface EventsConfig {
  kinds: string[]
  max_items: number
  theme: string
}
export interface GoalConfig {
  goal_id: string
  theme: string
}
export type LabelSource =
  | 'latest_follower'
  | 'latest_sub'
  | 'latest_tip'
  | 'top_tip_session'
  | 'session_follows'
  | 'session_subs'
export interface LabelConfig {
  source: LabelSource
  template: string
  theme: string
}
export interface ViewersConfig {
  platforms: Platform[]
  theme: string
}

interface WidgetBase {
  id: string
  x: number
  y: number
  w: number
  h: number
}
export type Widget =
  | (WidgetBase & { kind: 'alerts'; config: AlertsConfig })
  | (WidgetBase & { kind: 'chat'; config: ChatConfig })
  | (WidgetBase & { kind: 'events'; config: EventsConfig })
  | (WidgetBase & { kind: 'goal'; config: GoalConfig })
  | (WidgetBase & { kind: 'label'; config: LabelConfig })
  | (WidgetBase & { kind: 'viewers'; config: ViewersConfig })

export interface Overlay {
  id: string
  name: string
  url: string
  width: number
  height: number
  widgets: Widget[]
  updated_at: Millis
}

export type OverlayPreset = 'starter' | 'alerts_only' | 'chat_only' | 'blank'

export type GoalKind = 'follows' | 'subs' | 'tips' | 'bits' | 'custom'
export interface Goal {
  id: string
  title: string
  kind: GoalKind
  target: number
  currency: string | null
  starts_at: Millis
  ends_at: Millis | null
  current: number
}

export interface SendResult {
  sent: Platform[]
  failed: { platform: Platform; reason: string }[]
}
export interface BanResult {
  banned: Platform[]
  failed: { platform: Platform; reason: string }[]
}
export interface PanicResult {
  on: boolean
  applied: { platform: Platform; modes: string[] }[]
}

/** Shared ban list entry. Shape proposed in docs/API-REQUESTS.md (R1). */
export interface BanEntry {
  platform: ChatPlatform
  user_id: string
  login: string
  display_name: string
  reason: string | null
  banned_at: Millis
  everywhere: boolean
  by: string | null
}

export type FilterAction = 'delete' | 'timeout' | 'ban' | 'hold'
/** Moderation filters. Shape proposed in docs/API-REQUESTS.md (R2). */
export interface Filters {
  words: { enabled: boolean; list: string[]; lookalikes: boolean; action: FilterAction }
  links: { enabled: boolean; allow_roles: number; allow_domains: string[]; action: FilterAction }
  caps: { enabled: boolean; min_length: number; max_percent: number; action: FilterAction }
  emotes: { enabled: boolean; max: number; action: FilterAction }
  symbols: { enabled: boolean; max_percent: number; action: FilterAction }
  solicitation: { enabled: boolean; action: FilterAction }
  timeout_seconds: number
  exempt_roles: number
}

/** Panic mode plan. Shape proposed in docs/API-REQUESTS.md (R3). */
export interface PanicConfig {
  followers_only: boolean
  followers_only_minutes: number
  emote_only: boolean
  slow_mode_seconds: number
  hold_new_accounts: boolean
  pause_alerts: boolean
  pause_tts: boolean
  hotkey: string
}

export interface Command {
  id: string
  name: string
  aliases: string[]
  response: string
  roles: 'everyone' | 'subs' | 'vips' | 'mods'
  cooldown_s: number
  user_cooldown_s: number
  platforms: Platform[]
  enabled: boolean
}

export interface Timer {
  id: string
  name: string
  message: string
  every_min: number
  min_chat_lines: number
  platforms: Platform[]
  enabled: boolean
}

export interface TtsSettings {
  enabled: boolean
  voice: string
  min_amount: number
  max_chars: number
  hold_for_approval: boolean
  read_names: boolean
}
export interface TtsVoice {
  id: string
  name: string
  language: string
  pro: boolean
}
/** Pending TTS item. Shape proposed in docs/API-REQUESTS.md (R4). */
export interface TtsPending {
  id: string
  event_id: string
  platform: Platform
  name: string
  text: string
  amount: string | null
  received_at: Millis
}

export interface TipProviders {
  razorpay?: { connected: boolean; account: string | null; upi: boolean }
  kofi?: { connected: boolean; page: string | null }
  stripe?: { connected: boolean; account: string | null }
}
export interface TipSettings {
  enabled: boolean
  display_name: string
  page_url: string | null
  currency: string
  min_amount: number
  providers: TipProviders
}

export type MediaKind = 'image' | 'sound' | 'video'
export interface Media {
  id: string
  kind: MediaKind
  name: string
  bytes: number
  url: string
}

export interface ObsState {
  state: ConnectorStateName
  version: string | null
  scene: string | null
  host?: string
  port?: number
}

/** App settings. Shape proposed in docs/API-REQUESTS.md (R5). */
export interface Settings {
  theme: 'system' | 'dark' | 'light'
  reduced_motion: 'system' | 'on' | 'off'
  low_motion_overlays: boolean
  lan_access: boolean
  update_channel: 'stable' | 'beta'
  never_update_while_live: boolean
  launch_at_login: boolean
  close_to_tray: boolean
  language: string
}

export interface Backup {
  id: string
  created_at: Millis
  reason: 'manual' | 'before_update' | 'before_migration' | 'daily'
  bytes: number
  version: string
}

export interface ImportReport {
  source: 'ferropack' | 'streamelements' | 'streamlabs'
  imported: { kind: string; count: number }[]
  skipped: { kind: string; reason: string }[]
}

export interface WhyResult {
  alerted: boolean
  reasons: string[]
}

/** Viewer card. Shape proposed in docs/API-REQUESTS.md (R6). */
export interface ViewerCard {
  platform: ChatPlatform
  user_id: string
  login: string
  display_name: string
  avatar_url: string | null
  roles: number
  first_seen: Millis | null
  messages: number
  follows_since: Millis | null
  note: string
  banned: boolean
  timeouts: number
  other_identities: { platform: ChatPlatform; login: string }[]
}

/** Session numbers for the home screen. Shape proposed in docs/API-REQUESTS.md (R7). */
export interface SessionStats {
  started_at: Millis | null
  follows: number
  subs: number
  tips: Money[]
  bits: number
  messages: number
  peak_viewers: number
  viewers: Partial<Record<ChatPlatform, number>>
}

/** A look for every widget. Shape proposed in docs/API-REQUESTS.md (R8). */
export interface Theme {
  id: string
  name: string
  description: string
  pro: boolean
}

/** Update state. Shape proposed in docs/API-REQUESTS.md (R9). */
export interface UpdateInfo {
  current: string
  latest: string | null
  channel: 'stable' | 'beta'
  blocked_while_live: boolean
  notes_url: string | null
}

export interface Notice {
  level: 'info' | 'warn' | 'error'
  message: string
  action?: { label: string; href: string }
}

/** Frames on the dashboard live socket (API.md §5). */
export type LiveFrame =
  | { v: 1; type: 'hello'; data: { seq: number } }
  | { v: 1; type: 'event'; data: FerroEvent }
  | { v: 1; type: 'status'; data: { connectors: Connectors } }
  | { v: 1; type: 'queue'; data: Queue }
  | { v: 1; type: 'tts_pending'; data: TtsPending[] }
  | { v: 1; type: 'notice'; data: Notice }
  | { v: 1; type: 'goals'; data: Goal[] }
  | { v: 1; type: 'held'; data: { event_id: string; reason: string } }
  | { v: 1; type: 'panic'; data: { on: boolean; plan: PanicConfig } }
  | { v: 1; type: 'resync'; data: { missed: number } }

/** Overlay snapshot state (API.md §6). */
export interface OverlayState {
  goals: Goal[]
  labels: Record<string, string>
  viewers: Partial<Record<Platform, number>>
  events: FerroEvent[]
  chat: FerroEvent[]
}

export type OverlayServerFrame =
  | { v: 1; seq: number; type: 'snapshot'; data: { overlay: Overlay; state: OverlayState } }
  | { v: 1; seq: number; type: 'event'; data: FerroEvent }
  | { v: 1; seq: number; type: 'alert'; data: RenderedAlert }
  | { v: 1; seq: number; type: 'alert_hide'; data: { alert_id: string } }
  | {
      v: 1
      seq: number
      type: 'state'
      data: Partial<Pick<OverlayState, 'goals' | 'labels' | 'viewers'>>
    }
  | { v: 1; seq: number; type: 'config'; data: Overlay }
  | { v: 1; seq: number; type: 'delete_message'; data: { platform: Platform; message_id: string } }
  | { v: 1; seq: number; type: 'delete_user'; data: { platform: Platform; user_id: string } }
  | { v: 1; seq: number; type: 'clear_chat'; data: { platform: Platform | null } }
  | { v: 1; seq: number; type: 'tts'; data: { id: string; text: string } }
  | { v: 1; seq: number; type: 'revoked'; data: Record<string, never> }

export type AckPhase = 'started' | 'finished' | 'failed'
export type OverlayClientFrame =
  | { v: 1; type: 'hello'; data: { since_seq: number } }
  | { v: 1; type: 'ack'; data: { alert_id: string; phase: AckPhase } }
  | { v: 1; type: 'visibility'; data: { visible: boolean } }

/** The error body every route returns (API.md §1). */
export interface ApiErrorBody {
  error: { code: string; message: string; hint?: string }
}
