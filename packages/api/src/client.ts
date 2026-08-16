import { ApiError, errorFromResponse, offlineError } from './errors'
import type {
  Account,
  AlertRule,
  Backup,
  BanEntry,
  BanResult,
  ChatPlatform,
  Command,
  ConnectFlow,
  DiscordSettings,
  DiscordSettingsInput,
  FerroEvent,
  Filters,
  GiveawaySpec,
  GiveawayView,
  Goal,
  ConflictChoice,
  ImportPreview,
  ImportReport,
  PackImportReport,
  LeaderboardEntry,
  LoyaltyConfig,
  Media,
  ObsDetect,
  ObsState,
  Overlay,
  OverlayPreset,
  PanicConfig,
  PanicResult,
  Platform,
  PointsBalance,
  PollSpec,
  PollView,
  Queue,
  Recap,
  SendResult,
  SessionStats,
  StarterResult,
  Settings,
  Status,
  Theme,
  Timer,
  TipSettings,
  TipSettingsInput,
  TtsPending,
  TtsSettings,
  TtsVoice,
  UpdateInfo,
  WelcomeConfig,
  ViewerCard,
  WhyResult,
} from './types'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  /** `http://127.0.0.1:47820`, no trailing slash. */
  base: string
  token: string | null
  fetch?: FetchLike
  /** How many times to wait out a 503 "still starting" before giving up. */
  startupRetries?: number
  /** Injected for tests so retries don't really sleep. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Typed client for every route in API.md §4. Each method resolves with the parsed body or
 * rejects with an ApiError carrying readable copy. 503 (engine starting) is retried a few
 * times by itself; 429 is surfaced so the UI can show "wait a moment".
 */
export class FerroClient {
  private readonly base: string
  private token: string | null
  private readonly doFetch: FetchLike
  private readonly startupRetries: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: ClientOptions) {
    this.base = opts.base.replace(/\/+$/, '')
    this.token = opts.token
    this.doFetch = opts.fetch ?? ((i, init) => fetch(i, init))
    this.startupRetries = opts.startupRetries ?? 5
    this.sleep = opts.sleep ?? defaultSleep
  }

  get baseUrl(): string {
    return this.base
  }

  get sessionToken(): string | null {
    return this.token
  }

  setToken(token: string | null): void {
    this.token = token
  }

  /** WebSocket URL for the live socket (API.md §5). */
  liveUrl(sinceSeq?: number): string {
    const ws = this.base.replace(/^http/, 'ws')
    const q = new URLSearchParams({ session: this.token ?? '' })
    if (sinceSeq !== undefined) q.set('since', String(sinceSeq))
    return `${ws}/api/v1/live?${q.toString()}`
  }

  /** URL for a media preview in `<img>`/`<audio>` (API.md §6 notes: session in the query). */
  mediaUrl(id: string): string {
    const q = new URLSearchParams({ session: this.token ?? '' })
    return `${this.base}/api/v1/media/${encodeURIComponent(id)}?${q.toString()}`
  }

  async request<T>(method: string, path: string, body?: unknown, raw?: BodyInit): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    let payload: BodyInit | undefined = raw
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        const init: RequestInit = { method, headers }
        if (payload !== undefined) init.body = payload
        res = await this.doFetch(`${this.base}${path}`, init)
      } catch {
        throw offlineError()
      }
      if (res.ok) {
        if (res.status === 204) return undefined as T
        const text = await res.text()
        if (text === '') return undefined as T
        try {
          return JSON.parse(text) as T
        } catch {
          throw new ApiError(
            res.status,
            'bad_response',
            'Ferrocast sent a reply we could not read.',
            'Update the app and the dashboard to the same version.',
          )
        }
      }
      const err = await errorFromResponse(res)
      if (err.status === 503 && attempt < this.startupRetries) {
        await this.sleep(Math.max(err.retryAfter ?? 1, 1) * 1000)
        continue
      }
      throw err
    }
  }

  private get<T>(path: string) {
    return this.request<T>('GET', path)
  }
  private post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {})
  }
  private put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body)
  }
  private del(path: string) {
    return this.request<void>('DELETE', path)
  }

  // Status and session
  status = () => this.get<Status>('/api/v1/status')
  pair = (code: string) => this.post<{ token: string }>('/api/v1/session/pair', { code })
  pairCode = () =>
    this.post<{ code: string; url: string; expires_at: number }>('/api/v1/session/pair-code')

  // Accounts
  accounts = () => this.get<Account[]>('/api/v1/accounts')
  connect = (p: ChatPlatform) => this.post<ConnectFlow>(`/api/v1/accounts/${p}/connect`)
  disconnect = (p: ChatPlatform) => this.del(`/api/v1/accounts/${p}`)

  // Overlays
  overlays = () => this.get<Overlay[]>('/api/v1/overlays')
  createOverlay = (name: string, preset?: OverlayPreset) =>
    this.post<Overlay>('/api/v1/overlays', preset ? { name, preset } : { name })
  overlay = (id: string) => this.get<Overlay>(`/api/v1/overlays/${enc(id)}`)
  saveOverlay = (o: Overlay) => this.put<Overlay>(`/api/v1/overlays/${enc(o.id)}`, o)
  deleteOverlay = (id: string) => this.del(`/api/v1/overlays/${enc(id)}`)
  regenerateUrl = (id: string) => this.post<Overlay>(`/api/v1/overlays/${enc(id)}/regenerate-url`)
  addToObs = (id: string) =>
    this.post<{ scene: string; source: string }>(`/api/v1/overlays/${enc(id)}/add-to-obs`)
  themes = () => this.get<Theme[]>('/api/v1/themes')

  // Alerts
  alertRules = () => this.get<AlertRule[]>('/api/v1/alert-rules')
  saveAlertRule = (r: AlertRule) => this.put<AlertRule>(`/api/v1/alert-rules/${enc(r.id)}`, r)
  createAlertRule = (r: AlertRule) => this.post<AlertRule>('/api/v1/alert-rules', r)
  deleteAlertRule = (id: string) => this.del(`/api/v1/alert-rules/${enc(id)}`)
  test = (kind: string, platform?: Platform) =>
    this.post<{ event_id: string }>('/api/v1/test', platform ? { kind, platform } : { kind })
  queue = () => this.get<Queue>('/api/v1/queue')
  queuePause = () => this.post<Queue>('/api/v1/queue/pause')
  queueResume = () => this.post<Queue>('/api/v1/queue/resume')
  queueSkip = () => this.post<Queue>('/api/v1/queue/skip')
  queueClear = () => this.post<Queue>('/api/v1/queue/clear')
  queueRemove = (alertId: string) => this.post<Queue>(`/api/v1/queue/${enc(alertId)}/remove`)
  replay = (eventId: string) =>
    this.post<{ event_id: string }>(`/api/v1/events/${enc(eventId)}/replay`)
  events = (opts: { before?: number; limit?: number; kinds?: string[] } = {}) => {
    const q = new URLSearchParams()
    if (opts.before !== undefined) q.set('before', String(opts.before))
    q.set('limit', String(opts.limit ?? 50))
    if (opts.kinds?.length) q.set('kinds', opts.kinds.join(','))
    return this.get<{ events: FerroEvent[]; next_before: number | null }>(
      `/api/v1/events?${q.toString()}`,
    )
  }
  why = (eventId: string) => this.get<WhyResult>(`/api/v1/events/${enc(eventId)}/why`)

  // Goals
  goals = () => this.get<Goal[]>('/api/v1/goals')
  createGoal = (g: Omit<Goal, 'id' | 'current'>) => this.post<Goal>('/api/v1/goals', g)
  saveGoal = (g: Goal) => this.put<Goal>(`/api/v1/goals/${enc(g.id)}`, g)
  deleteGoal = (id: string) => this.del(`/api/v1/goals/${enc(id)}`)
  adjustGoal = (id: string, delta: number) =>
    this.post<Goal>(`/api/v1/goals/${enc(id)}/adjust`, { delta })

  // Chat and moderation
  chat = (limit = 200) => this.get<FerroEvent[]>(`/api/v1/chat?limit=${limit}`)
  send = (
    text: string,
    platforms: Platform[] | 'all',
    replyTo?: { platform: Platform; message_id: string },
  ) =>
    this.post<SendResult>(
      '/api/v1/chat/send',
      replyTo ? { text, platforms, reply_to: replyTo } : { text, platforms },
    )
  deleteMessage = (platform: Platform, messageId: string) =>
    this.post<void>('/api/v1/mod/delete', { platform, message_id: messageId })
  timeout = (platform: Platform, userId: string, seconds: number, reason?: string) =>
    this.post<void>(
      '/api/v1/mod/timeout',
      reason
        ? { platform, user_id: userId, seconds, reason }
        : { platform, user_id: userId, seconds },
    )
  ban = (
    user: { platform: Platform; user_id: string; login: string },
    everywhere: boolean,
    reason?: string,
  ) =>
    this.post<BanResult>(
      '/api/v1/mod/ban',
      reason ? { user, reason, everywhere } : { user, everywhere },
    )
  unban = (platform: Platform, userId: string) =>
    this.post<void>('/api/v1/mod/unban', { platform, user_id: userId })
  bans = () => this.get<BanEntry[]>('/api/v1/mod/bans')
  panic = (on: boolean) => this.post<PanicResult>('/api/v1/mod/panic', { on })
  panicConfig = () => this.get<PanicConfig>('/api/v1/mod/panic/config')
  savePanicConfig = (c: PanicConfig) => this.put<PanicConfig>('/api/v1/mod/panic/config', c)
  filters = () => this.get<Filters>('/api/v1/mod/filters')
  saveFilters = (f: Filters) => this.put<Filters>('/api/v1/mod/filters', f)
  viewer = (platform: Platform, userId: string) =>
    this.get<ViewerCard>(`/api/v1/viewers/${platform}/${enc(userId)}`)
  note = (platform: Platform, userId: string) =>
    this.get<{ text: string }>(`/api/v1/viewers/${platform}/${enc(userId)}/note`)
  saveNote = (platform: Platform, userId: string, text: string) =>
    this.put<{ text: string }>(`/api/v1/viewers/${platform}/${enc(userId)}/note`, { text })

  // Bot
  commands = () => this.get<Command[]>('/api/v1/commands')
  createCommand = (c: Omit<Command, 'id'>) => this.post<Command>('/api/v1/commands', c)
  saveCommand = (c: Command) => this.put<Command>(`/api/v1/commands/${enc(c.id)}`, c)
  deleteCommand = (id: string) => this.del(`/api/v1/commands/${enc(id)}`)
  /** Adds !socials, !lurk, !uptime and !so, skipping names already in use. */
  addStarterCommands = () => this.post<StarterResult>('/api/v1/commands/starter')
  timers = () => this.get<Timer[]>('/api/v1/timers')
  createTimer = (t: Omit<Timer, 'id'>) => this.post<Timer>('/api/v1/timers', t)
  saveTimer = (t: Timer) => this.put<Timer>(`/api/v1/timers/${enc(t.id)}`, t)
  deleteTimer = (id: string) => this.del(`/api/v1/timers/${enc(id)}`)

  // Loyalty points
  loyalty = () => this.get<LoyaltyConfig>('/api/v1/loyalty')
  /** Saves only the fields given. */
  saveLoyalty = (c: Partial<LoyaltyConfig>) => this.put<LoyaltyConfig>('/api/v1/loyalty', c)
  leaderboard = (limit = 20) =>
    this.get<LeaderboardEntry[]>(`/api/v1/loyalty/leaderboard?limit=${limit}`)
  points = (platform: Platform, userId: string) =>
    this.get<PointsBalance>(`/api/v1/loyalty/viewers/${platform}/${enc(userId)}`)
  /** `delta` is a whole number, not 0; negative takes points away (never below 0). */
  adjustPoints = (platform: Platform, userId: string, delta: number) =>
    this.post<PointsBalance>(`/api/v1/loyalty/viewers/${platform}/${enc(userId)}/adjust`, {
      delta,
    })

  // First-time chatters
  welcome = () => this.get<WelcomeConfig>('/api/v1/welcome')
  /** Saves only the fields given. */
  saveWelcome = (c: Partial<WelcomeConfig>) => this.put<WelcomeConfig>('/api/v1/welcome', c)

  // Polls
  poll = () => this.get<PollView | null>('/api/v1/polls/current')
  startPoll = (p: PollSpec) => this.post<PollView>('/api/v1/polls', p)
  /** Ends it now and posts the result in chat. */
  endPoll = () => this.post<PollView>('/api/v1/polls/current/end')
  /** Removes it without posting anything. */
  clearPoll = () => this.del('/api/v1/polls/current')

  // Giveaways
  giveaway = () => this.get<GiveawayView | null>('/api/v1/giveaways/current')
  startGiveaway = (g: GiveawaySpec) => this.post<GiveawayView>('/api/v1/giveaways', g)
  closeGiveaway = () => this.post<GiveawayView>('/api/v1/giveaways/current/close')
  drawGiveaway = () => this.post<GiveawayView>('/api/v1/giveaways/current/draw')
  redrawGiveaway = () => this.post<GiveawayView>('/api/v1/giveaways/current/redraw')
  endGiveaway = () => this.post<GiveawayView>('/api/v1/giveaways/current/end')
  /** Cancels it and refunds every entry fee. */
  cancelGiveaway = () => this.request<{ refunded: number }>('DELETE', '/api/v1/giveaways/current')

  // TTS
  tts = () => this.get<TtsSettings>('/api/v1/tts')
  saveTts = (t: TtsSettings) => this.put<TtsSettings>('/api/v1/tts', t)
  ttsVoices = () => this.get<TtsVoice[]>('/api/v1/tts/voices')
  ttsPending = () => this.get<TtsPending[]>('/api/v1/tts/pending')
  ttsApprove = (id: string) => this.post<void>(`/api/v1/tts/${enc(id)}/approve`)
  ttsReject = (id: string) => this.post<void>(`/api/v1/tts/${enc(id)}/reject`)

  // Tips
  tips = () => this.get<TipSettings>('/api/v1/tips')
  /** Saves the tip page; blank secrets keep the saved ones. Resolves with the normalised page. */
  saveTips = (t: TipSettingsInput) => this.put<TipSettings>('/api/v1/tips', t)
  /** Takes the tip page down (204). The name stays reserved for this install for 30 days. */
  deleteTips = () => this.del('/api/v1/tips')

  // Media
  media = () => this.get<Media[]>('/api/v1/media')
  upload = (file: Blob, name: string) => {
    const form = new FormData()
    form.append('file', file, name)
    return this.request<Media>('POST', '/api/v1/media', undefined, form)
  }
  deleteMedia = (id: string) => this.del(`/api/v1/media/${enc(id)}`)

  // Discord go-live posts
  discord = () => this.get<DiscordSettings>('/api/v1/discord')
  saveDiscord = (d: DiscordSettingsInput) => this.put<DiscordSettings>('/api/v1/discord', d)
  /** Posts a test message to the webhook (never pings anyone). */
  testDiscord = () => this.post<void>('/api/v1/discord/test')

  // OBS
  obs = () => this.get<ObsState>('/api/v1/obs')
  saveObs = (c: { host: string; port: number; password: string }) =>
    this.put<ObsState>('/api/v1/obs', c)
  /** Looks for OBS's own WebSocket settings on this computer. */
  obsDetect = () => this.get<ObsDetect>('/api/v1/obs/detect')
  /** Uses the detected port and password (saved to the keychain), then connects. */
  obsUseDetected = () => this.post<ObsState>('/api/v1/obs/detect')

  // Settings and data
  settings = () => this.get<Settings>('/api/v1/settings')
  saveSettings = (s: Settings) => this.put<Settings>('/api/v1/settings', s)
  completeSetup = () => this.post<void>('/api/v1/setup/complete')
  exportPack = async (): Promise<Blob> => {
    const headers: Record<string, string> = {}
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    let res: Response
    try {
      res = await this.doFetch(`${this.base}/api/v1/export`, { method: 'POST', headers })
    } catch {
      throw offlineError()
    }
    if (!res.ok) throw await errorFromResponse(res)
    return res.blob()
  }
  /** Imports a `.ferropack` exported from Ferrocast (a backup is taken first). */
  importPack = (file: Blob, name: string) => {
    const form = new FormData()
    form.append('file', file, name)
    return this.request<PackImportReport>('POST', '/api/v1/import', undefined, form)
  }
  /** Reads a StreamElements channel with its JWT. Nothing is written; the token isn't kept. */
  previewStreamElements = (token: string) =>
    this.post<ImportPreview>('/api/v1/import/streamelements/preview', { token })
  /** Reads Streamlabs exports (CSV or .xlsx). `platform` says whose viewers the points are. */
  previewStreamlabs = (files: {
    platform?: ChatPlatform
    points?: { file: Blob; name: string }
    tips?: { file: Blob; name: string }
  }) => {
    const form = new FormData()
    if (files.platform) form.append('platform', files.platform)
    if (files.points) form.append('points', files.points.file, files.points.name)
    if (files.tips) form.append('tips', files.tips.file, files.tips.name)
    return this.request<ImportPreview>('POST', '/api/v1/import/streamlabs/preview', undefined, form)
  }
  /** Imports what a preview showed (backup first, one transaction). */
  applyImport = (previewId: string, onConflict: ConflictChoice) =>
    this.post<ImportReport>('/api/v1/import/apply', {
      preview_id: previewId,
      on_conflict: onConflict,
    })
  backups = () => this.get<Backup[]>('/api/v1/backups')
  restoreBackup = (id: string) => this.post<void>(`/api/v1/backups/${enc(id)}/restore`)
  sessionStats = () => this.get<SessionStats>('/api/v1/stats/session')
  /** This stream so far, or the last one; `since` picks another start. */
  recap = (since?: number) =>
    this.get<Recap>(since === undefined ? '/api/v1/recap' : `/api/v1/recap?since=${since}`)
  updates = () => this.get<UpdateInfo>('/api/v1/updates')
  /** The desktop app downloads, checks and installs it, then restarts. 409 while live. */
  installUpdate = () => this.post<{ installing: string }>('/api/v1/updates/install')
}

function enc(s: string): string {
  return encodeURIComponent(s)
}
