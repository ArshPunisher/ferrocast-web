// Studio in the demo, matching the engine (`crates/engine/src/studio/`): counters, quotes,
// chat modules, the stream-info editor, Start/End show with a pre-flight, a pretend OBS
// (scenes, sources, mic, replay buffer, health) and the "Don't miss" lane with markers.
// Same routes, shapes, error codes and messages as API.md §4 "Studio".

import type {
  ApplyResult,
  ClipResult,
  Counter,
  LaneItem,
  Marker,
  ModulesConfig,
  MomentsConfig,
  ObsHealth,
  ObsScenes,
  PlatformAccess,
  PlatformResult,
  Preflight,
  PreflightCheck,
  Quote,
  ScenesConfig,
  ShowConfig,
  ShowRun,
  ShowStep,
  StreamHistoryEntry,
  StreamInfo,
  StreamPreset,
} from '../../studio'
import {
  AT_ZERO_DEFAULT,
  checkStreamInfo,
  STREAM_INFO_PLATFORMS,
  streamFields,
  streamInfoFor,
  type PerPlatform,
} from '../../studio'
import type { ChatPlatform, Command, FerroEvent, Platform } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, isWhole, requireObj, type DemoHost, type Routed } from './host'

const DEFAULT_MODULES: ModulesConfig = {
  eight_ball: { enabled: true },
  dice: { enabled: true },
  followage: { enabled: true },
  watchtime: { enabled: true },
  uptime: { enabled: true },
  quotes: { enabled: true },
  roulette: { enabled: false, min_bet: 10, max_bet: 10_000, win_percent: 45 },
  duel: { enabled: false, max_bet: 10_000, accept_s: 60 },
  game_title: { enabled: true, mods_can_change: true },
  shoutout: { enabled: true, template: 'Go show some love to {target}! {target_game_note} {url}' },
}

const DEFAULT_SHOW: ShowConfig = {
  preset_id: null,
  starting_scene: 'Starting Soon',
  countdown_s: 300,
  live_scene: 'Gameplay',
  alerts_on: true,
  discord: true,
  bot_on: true,
  replay_buffer: true,
  start_stream: false,
  ending_scene: 'Ending',
  stop_stream: false,
  stop_delay_s: 30,
  recap_message: 'Thanks for hanging out! Big love to {thanks}. See you next stream.',
  mic_sources: ['Mic'],
  cam_sources: ['Webcam'],
  min_disk_gb: 10,
  platforms: [],
  at_zero: { ...AT_ZERO_DEFAULT },
}

const DEFAULT_SCENES: ScenesConfig = {
  chat_enabled: true,
  chat_allowed: ['Gameplay', 'Just Chatting', 'BRB'],
  hotkeys: ['Starting Soon', 'Gameplay', 'Just Chatting', 'BRB', 'Ending'],
  brb_scene: 'BRB',
  brb_on_ads: true,
  brb_mute: ['Mic'],
  clip_command: true,
  clip_on_big_moments: false,
}

const DEFAULT_MOMENTS: MomentsConfig = {
  big_tip: 500,
  big_gift_value: 500,
  big_sub_gift: 5,
  raid_viewers: 1,
  first_chatters: true,
  sound: 'chime',
  volume: 70,
  markers: true,
  spike_factor: 3,
  spike_min: 15,
  twitch_markers: false,
}

const EIGHT_BALL = [
  'It is certain.',
  'Without a doubt.',
  'Most likely.',
  'Signs point to yes.',
  'Ask again later.',
  'Better not tell you now.',
  "Don't count on it.",
  'Very doubtful.',
]

interface DemoObs {
  current: string
  scenes: {
    name: string
    items: { id: number; source: string; enabled: boolean; kind: string }[]
  }[]
  muted: Record<string, boolean>
  replay: boolean
  saves: number
  /** OBS's Start / Stop Streaming. */
  streaming: boolean
}

const BUILT_IN = new Set([
  '!8ball',
  '!roll',
  '!dice',
  '!roulette',
  '!duel',
  '!accept',
  '!deny',
  '!followage',
  '!watchtime',
  '!uptime',
  '!game',
  '!title',
  '!so',
  '!quote',
  '!scene',
  '!brb',
  '!back',
  '!clip',
])

export class DemoStudio {
  counters: Counter[] = [
    { name: 'deaths', value: 14, command: '!deaths', reply: 'Deaths: {count}', enabled: true },
    {
      name: 'wins',
      value: 3,
      command: '!wins',
      reply: '{counter}: {count} tonight',
      enabled: true,
    },
  ]
  quotes: Quote[]
  modules: ModulesConfig = clone(DEFAULT_MODULES)
  presets: StreamPreset[]
  history: StreamHistoryEntry[] = []
  showCfg: ShowConfig = clone(DEFAULT_SHOW)
  scenesCfg: ScenesConfig = clone(DEFAULT_SCENES)
  momentsCfg: MomentsConfig = clone(DEFAULT_MOMENTS)
  run: ShowRun | null = null
  lane: LaneItem[] = []
  markers: Marker[] = []
  obs: DemoObs = {
    current: 'Gameplay',
    scenes: [
      {
        name: 'Starting Soon',
        items: [
          { id: 1, source: 'Countdown', enabled: true, kind: 'browser_source' },
          { id: 2, source: 'Music', enabled: true, kind: 'ffmpeg_source' },
        ],
      },
      {
        name: 'Gameplay',
        items: [
          { id: 1, source: 'Game', enabled: true, kind: 'game_capture' },
          { id: 2, source: 'Webcam', enabled: true, kind: 'dshow_input' },
          { id: 3, source: 'Ferrocast: Main', enabled: true, kind: 'browser_source' },
        ],
      },
      {
        name: 'Just Chatting',
        items: [
          { id: 1, source: 'Webcam', enabled: true, kind: 'dshow_input' },
          { id: 2, source: 'Ferrocast: Chat', enabled: true, kind: 'browser_source' },
        ],
      },
      { name: 'BRB', items: [{ id: 1, source: 'BRB card', enabled: true, kind: 'image_source' }] },
      {
        name: 'Ending',
        items: [{ id: 1, source: 'Credits', enabled: true, kind: 'browser_source' }],
      },
    ],
    muted: { Mic: false, 'Desktop Audio': false },
    replay: false,
    saves: 0,
    streaming: true,
  }
  health: ObsHealth | null = null
  private brbFrom: string | null = null
  private nextMarker = 1
  private nextQuote = 4
  private cooldowns = new Map<string, number>()
  private readonly startedAt: number
  private tick = 0

  constructor(
    private readonly host: DemoHost,
    private readonly commands: () => Command[],
    /** Kick's demo sign-in predates the editor: it shows the reconnect flow. */
    private readonly kickNeedsReconnect = true,
  ) {
    const now = Date.now()
    this.startedAt = now - 2 * 3_600_000 - 14 * 60_000
    this.quotes = [
      {
        id: 1,
        text: 'I am never playing ranked again.',
        added_by: 'Mira',
        at: now - 30 * 86_400_000,
      },
      { id: 2, text: 'That was a tactical death.', added_by: 'Ozzy', at: now - 9 * 86_400_000 },
      { id: 3, text: 'Chat, I can explain.', added_by: 'Mira', at: now - 2 * 86_400_000 },
    ]
    this.presets = [
      {
        id: 'p-valorant',
        name: 'Valorant ranked',
        info: {
          title: 'Ranked grind to Immortal | !socials',
          category: { name: 'VALORANT', ids: { twitch: '516575' } },
          tags: ['English', 'Ranked', 'FPS'],
          language: 'en',
        },
        updated_at: now - 86_400_000,
      },
      {
        id: 'p-chatting',
        name: 'Just chatting',
        info: {
          title: 'Coffee and chat, ask me anything',
          category: { name: 'Just Chatting', ids: { twitch: '509658' } },
          tags: ['English', 'Chill'],
          language: 'en',
        },
        updated_at: now - 3 * 86_400_000,
      },
    ]
    this.showCfg.preset_id = 'p-valorant'
    this.history = [
      {
        info: clone(this.presets[0]!.info),
        at: this.startedAt - 60_000,
        results: (['twitch', 'youtube', 'kick'] as const).map((p) =>
          this.result(p, this.presets[0]!.info),
        ),
      },
    ]
    const mark = (
      min: number,
      kind: Marker['kind'],
      label: string,
      platform: Platform | null,
      clip = false,
    ) =>
      this.markers.push({
        id: this.nextMarker++,
        at: this.startedAt + min * 60_000,
        offset_ms: min * 60_000,
        kind,
        label,
        platform,
        clip,
      })
    mark(12, 'raid', 'GlitchGarden raided with 38 viewers', 'twitch')
    mark(41, 'chat_spike', 'Chat spike: 46 messages in 30 seconds', 'twitch', true)
    mark(77, 'tip', 'Asha tipped ₹2,000', 'tips')
    mark(103, 'clip', 'Clip by Ozzy', null, true)
    this.lane = [
      {
        id: 'l-1',
        kind: 'raid',
        title: 'GlitchGarden raided with 38 viewers',
        detail: null,
        platform: 'twitch',
        event_id: 'seed-raid',
        at: now - 4 * 60_000,
      },
      {
        id: 'l-2',
        kind: 'first_chatter',
        title: 'PixelMoth is chatting for the first time',
        detail: 'hi! found you from the Hades clip',
        platform: 'youtube',
        event_id: 'seed-first',
        at: now - 90_000,
      },
    ]
    this.health = this.reading(false)
    this.loopHealth()
  }

  // ------------------------------------------------------------ helpers

  private say(text: string) {
    this.host.say(text)
  }

  private customWins(word: string): boolean {
    return this.commands().some(
      (c) => c.enabled && [c.name, ...c.aliases].some((n) => n.toLowerCase() === word),
    )
  }

  private cooldown(key: string, ms: number): boolean {
    const now = Date.now()
    const last = this.cooldowns.get(key)
    if (last !== undefined && now - last < ms) return false
    this.cooldowns.set(key, now)
    return true
  }

  private emitLane(added: LaneItem | null) {
    this.host.broadcastLive({
      v: 1,
      type: 'lane',
      data: {
        items: clone([...this.lane].reverse()),
        added,
        sound: this.momentsCfg.sound,
        volume: this.momentsCfg.volume,
      },
    })
  }

  private addMarker(
    kind: Marker['kind'],
    label: string,
    platform: Platform | null,
    clip = false,
  ): Marker {
    const at = Date.now()
    const live = this.host.isLive()
    const m: Marker = {
      id: this.nextMarker++,
      at,
      offset_ms: live ? at - this.startedAt : null,
      kind,
      label: noControl(label).trim().slice(0, 200),
      platform,
      clip,
    }
    this.markers.push(m)
    this.host.broadcastLive({ v: 1, type: 'marker', data: clone(m) })
    return m
  }

  private setRun(run: ShowRun | null) {
    this.run = run
    this.host.broadcastLive({ v: 1, type: 'show', data: { show: clone(run) } })
    // Like the engine: timers on screen follow Start show's countdown.
    this.host.pushOverlayState({ show: { countdown_ends_at: run?.countdown_ends_at ?? null } })
  }

  private reading(spike: boolean): ObsHealth {
    const r = this.host.random()
    const dropped = spike ? 2.4 : Math.round(r * 3) / 10
    const warnings: ObsHealth['warnings'] = []
    if (dropped >= 1)
      warnings.push({
        id: 'dropped',
        level: 'warn',
        message: `${dropped.toFixed(1)}% of frames dropped on the way to the platform.`,
        hint: 'Your upload can’t keep up: lower the bitrate in OBS Settings, Output, or use a wired connection.',
      })
    return {
      at: Date.now(),
      streaming: this.obs.streaming && this.host.isLive(),
      cpu: Math.round((14 + r * 9) * 10) / 10,
      memory_mb: 612,
      disk_gb: 182.4,
      fps: 60,
      render_skipped_pct: 0,
      encoder_skipped_pct: 0,
      dropped_pct: dropped,
      bitrate_kbps: this.host.isLive() ? Math.round(5800 + r * 400) : 0,
      warnings,
    }
  }

  private loopHealth() {
    this.host.later(() => {
      this.tick += 1
      // Now and then the upload hiccups for one reading, so Home shows a warning.
      this.health = this.reading(this.tick % 9 === 4)
      this.host.broadcastLive({ v: 1, type: 'obs_health', data: clone(this.health) })
      this.loopHealth()
    }, 5_000)
  }

  private access(): PlatformAccess[] {
    return (['twitch', 'youtube', 'kick'] as const).map((p) => {
      const connected = this.host.connectedChat().includes(p)
      const old = p === 'kick' && this.kickNeedsReconnect
      return {
        platform: p,
        connected,
        can_edit: connected && !old,
        needs: !connected
          ? `Connect ${label(p)} in Settings, Accounts.`
          : old
            ? `Reconnect ${label(p)} in Settings, Accounts so Ferrocast can change your stream info.`
            : null,
        supports: {
          title: true,
          category: true,
          tags: true,
          language: p !== 'kick',
          description: p === 'youtube',
          thumbnail: p === 'youtube',
        },
      }
    })
  }

  private result(p: ChatPlatform, info: StreamInfo): PlatformResult {
    const skipped: string[] = []
    if (info.language && p === 'kick') skipped.push('language: Kick has no stream language setting')
    if (info.category && p === 'youtube')
      skipped.push('category: YouTube only takes a video category (a game becomes Gaming)')
    if (info.description !== undefined && p !== 'youtube')
      skipped.push(`description: ${label(p)} has no stream description`)
    if (info.thumbnail !== undefined && p !== 'youtube')
      skipped.push(`thumbnail: ${label(p)} makes its own from your stream`)
    const connected = this.host.connectedChat().includes(p)
    if (!connected)
      return {
        platform: p,
        ok: false,
        applied: [],
        skipped,
        error: {
          code: 'not_connected',
          message: `${label(p)} isn't connected.`,
          hint: 'Connect it in Settings, Accounts.',
        },
      }
    if (p === 'kick' && this.kickNeedsReconnect)
      return {
        platform: p,
        ok: false,
        applied: [],
        skipped,
        error: {
          code: 'reconnect_needed',
          message: 'Kick needs a permission it didn’t get when you connected.',
          hint: 'Reconnect it in Settings, Accounts, then try again.',
        },
      }
    const applied = (
      ['title', 'category', 'tags', 'language', 'description', 'thumbnail'] as const
    ).filter(
      (f) =>
        info[f] !== undefined &&
        !(f === 'language' && p === 'kick') &&
        !((f === 'description' || f === 'thumbnail') && p !== 'youtube'),
    )
    return { platform: p, ok: true, applied: [...applied], skipped, error: null }
  }

  private apply(info: StreamInfo, platforms?: ChatPlatform[]): ApplyResult {
    const err = checkStreamInfo(info)
    if (err) throw new HttpError(400, 'invalid', err)
    const tidy = (i: StreamInfo): StreamInfo => {
      const out: StreamInfo = { ...i }
      delete out.per
      if (out.title !== undefined) out.title = out.title.trim()
      if (out.tags) {
        const seen = new Set<string>()
        out.tags = out.tags
          .map((t) => t.trim().replace(/^#/, ''))
          .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
      }
      return out
    }
    const clean = tidy(info)
    // As the engine: a platform with nothing of its own is dropped.
    const per: PerPlatform = {}
    for (const p of STREAM_INFO_PLATFORMS) {
      const own = info.per?.[p]
      if (own && streamFields(own).length > 0) per[p] = tidy(own)
    }
    if (Object.keys(per).length > 0) clean.per = per
    const targets = platforms?.length ? platforms : this.host.connectedChat()
    if (!targets.length)
      throw new HttpError(
        422,
        'no_platforms',
        'No platform is connected, so there’s nowhere to send this.',
        'Connect Twitch, YouTube or Kick in Settings, Accounts.',
      )
    const results = targets.map((p) => this.result(p, streamInfoFor(clean, p)))
    const ok = results.filter((r) => r.ok).length
    this.history.unshift({ info: clean, at: Date.now(), results: clone(results) })
    this.history = this.history.slice(0, 20)
    return { results, ok, failed: results.length - ok }
  }

  private findScene(name: string) {
    return this.obs.scenes.find((s) => s.name === name)
  }

  private switchTo(scene: string) {
    if (!this.findScene(scene))
      throw new HttpError(
        422,
        'obs_refused',
        `OBS has no scene called "${scene}".`,
        'Check the name in OBS, or pick it again in Studio.',
      )
    this.obs.current = scene
  }

  private preflight(): Preflight {
    const c = this.showCfg
    const checks: PreflightCheck[] = [
      { id: 'obs', label: 'OBS', status: 'ok', detail: 'Connected.', fix: null },
    ]
    for (const [id, l, s] of [
      ['starting_scene', 'Starting scene', c.starting_scene],
      ['live_scene', 'Live scene', c.live_scene],
      ['ending_scene', 'Ending scene', c.ending_scene],
    ] as const) {
      if (!s) continue
      checks.push(
        this.findScene(s)
          ? { id, label: l, status: 'ok', detail: `"${s}" is in OBS.`, fix: null }
          : {
              id,
              label: l,
              status: 'fail',
              detail: `OBS has no scene called "${s}" (renamed or deleted?).`,
              fix: { label: 'Pick the scene again', href: '#/studio/show' },
            },
      )
    }
    for (const m of c.mic_sources)
      checks.push(
        this.obs.muted[m]
          ? {
              id: `mic:${m}`,
              label: m,
              status: 'fail',
              detail: 'Muted in OBS: nobody will hear you.',
              fix: { label: 'Unmute', href: `action:unmute:${m}` },
            }
          : { id: `mic:${m}`, label: m, status: 'ok', detail: 'Not muted.', fix: null },
      )
    const scene = c.live_scene ?? c.starting_scene
    for (const cam of c.cam_sources) {
      const item = scene ? this.findScene(scene)?.items.find((i) => i.source === cam) : undefined
      checks.push(
        !item
          ? {
              id: `cam:${cam}`,
              label: cam,
              status: 'warn',
              detail: `Not in "${scene}".`,
              fix: { label: 'Pick the camera again', href: '#/studio/show' },
            }
          : item.enabled
            ? {
                id: `cam:${cam}`,
                label: cam,
                status: 'ok',
                detail: `Shown in "${scene}".`,
                fix: null,
              }
            : {
                id: `cam:${cam}`,
                label: cam,
                status: 'warn',
                detail: `Hidden in "${scene}".`,
                fix: { label: 'Show it', href: `action:show:${scene}/${cam}` },
              },
      )
    }
    if (c.replay_buffer)
      checks.push({
        id: 'replay',
        label: 'Replay buffer',
        status: 'ok',
        detail: this.obs.replay ? 'Running.' : 'Starts with the show.',
        fix: null,
      })
    checks.push({
      id: 'disk',
      label: 'Disk space',
      status: 'ok',
      detail: '182 GB free where recordings go.',
      fix: null,
    })
    for (const p of this.host.connectedChat())
      checks.push({
        id: `platform:${p}`,
        label: label(p),
        status: 'ok',
        detail: `${label(p)} is connected.`,
        fix: null,
      })
    for (const a of this.access().filter((x) => x.connected && !x.can_edit))
      checks.push({
        id: `stream_info:${a.platform}`,
        label: 'Stream info',
        status: 'warn',
        detail: a.needs ?? '',
        fix: { label: 'Reconnect', href: '#/settings/accounts' },
      })
    if (c.discord)
      checks.push({
        id: 'discord',
        label: 'Discord post',
        status: 'warn',
        detail: 'No Discord webhook is set (or posts are off), so nothing is posted.',
        fix: { label: 'Discord settings', href: '#/settings/discord' },
      })
    return { checks, ready: !checks.some((x) => x.status === 'fail') }
  }

  private startShow(force: boolean): ShowRun {
    if (this.run && this.run.phase !== 'ended')
      throw new HttpError(
        409,
        'conflict',
        'A show is already running. End it first, or cancel the countdown.',
      )
    const pf = this.preflight()
    if (!force && !pf.ready)
      throw new HttpError(
        422,
        'preflight_failed',
        `Not ready: ${pf.checks
          .filter((c) => c.status === 'fail')
          .map((c) => `${c.label}: ${c.detail}`)
          .join(' ')}`,
        'Fix what the checklist shows, or press Start anyway.',
      )
    const c = this.showCfg
    const steps: ShowStep[] = []
    const preset = this.presets.find((p) => p.id === c.preset_id)
    if (c.preset_id) {
      if (!preset)
        steps.push({
          id: 'stream_info',
          label: 'Stream info',
          status: 'failed',
          detail: 'The preset doesn’t exist any more.',
        })
      else {
        const r = this.apply(preset.info)
        steps.push({
          id: 'stream_info',
          label: 'Stream info',
          status: r.ok > 0 ? 'done' : 'failed',
          detail:
            r.failed === 0
              ? `"${preset.name}" sent to ${r.ok} platform(s).`
              : r.results
                  .filter((x) => !x.ok)
                  .map((x) => `${label(x.platform)}: ${x.error?.message ?? 'failed'}`)
                  .join(' '),
        })
      }
    }
    if (c.replay_buffer) {
      this.obs.replay = true
      steps.push({
        id: 'replay',
        label: 'Replay buffer',
        status: 'done',
        detail: 'Running, so "clip that" works.',
      })
    }
    if (c.starting_scene) {
      this.switchTo(c.starting_scene)
      steps.push({
        id: 'starting_scene',
        label: 'Starting scene',
        status: 'done',
        detail: `OBS is on "${c.starting_scene}".`,
      })
    }
    if (c.start_stream) {
      this.obs.streaming = true
      steps.push({
        id: 'stream',
        label: 'Go live in OBS',
        status: 'done',
        detail: 'OBS is streaming.',
      })
    }
    if (c.alerts_on) steps.push({ id: 'alerts', label: 'Alerts', status: 'done', detail: 'On.' })
    if (c.bot_on) steps.push({ id: 'bot', label: 'Bot and timers', status: 'done', detail: 'On.' })
    if (c.discord)
      steps.push({
        id: 'discord',
        label: 'Discord post',
        status: 'skipped',
        detail: 'No Discord webhook (Settings, Discord).',
      })
    let phase: ShowRun['phase'] = 'starting'
    let ends: number | null = null
    const sw = c.at_zero?.switch !== false
    if (c.countdown_s > 0 && (c.live_scene || !sw)) {
      phase = 'countdown'
      ends = Date.now() + c.countdown_s * 1000
      steps.push({
        id: 'countdown',
        label: 'Countdown',
        status: 'waiting',
        detail: sw ? `${c.countdown_s} seconds, then the live scene.` : `${c.countdown_s} seconds.`,
      })
      const id = `show-${Date.now()}`
      this.host.later(() => {
        if (this.run?.id === id && this.run.phase === 'countdown') this.goLive()
      }, c.countdown_s * 1000)
      const run: ShowRun = {
        id,
        phase,
        started_at: Date.now(),
        countdown_ends_at: ends,
        live_scene: c.live_scene,
        ended_at: null,
        steps,
      }
      this.setRun(run)
      return clone(run)
    } else if (c.live_scene) {
      this.switchTo(c.live_scene)
      steps.push({
        id: 'live_scene',
        label: 'Live scene',
        status: 'done',
        detail: `OBS is on "${c.live_scene}".`,
      })
      phase = 'live'
    }
    const run: ShowRun = {
      id: `show-${Date.now()}`,
      phase,
      started_at: Date.now(),
      countdown_ends_at: ends,
      live_scene: c.live_scene,
      ended_at: null,
      steps,
    }
    this.setRun(run)
    return clone(run)
  }

  private goLive(): ShowRun {
    const run = this.run
    if (!run || (run.phase !== 'countdown' && run.phase !== 'starting'))
      throw new HttpError(
        404,
        'no_countdown',
        'There’s no countdown running.',
        'Start the show first.',
      )
    const steps = run.steps.filter(
      (s) => s.id !== 'countdown' && s.id !== 'live_scene' && !s.id.startsWith('zero_'),
    )
    const z = { ...AT_ZERO_DEFAULT, ...this.showCfg.at_zero }
    if (z.switch && run.live_scene) {
      this.switchTo(run.live_scene)
      steps.push({
        id: 'live_scene',
        label: 'Live scene',
        status: 'done',
        detail: `OBS is on "${run.live_scene}".`,
      })
    }
    if (z.unmute) {
      for (const m of this.showCfg.mic_sources) this.obs.muted[m] = false
      steps.push({ id: 'zero_unmute', label: 'Mic', status: 'done', detail: 'On.' })
    }
    if (z.start_stream)
      steps.push(
        this.obs.streaming
          ? {
              id: 'zero_stream',
              label: 'Go live in OBS',
              status: 'skipped',
              detail: 'OBS is streaming already.',
            }
          : (() => {
              this.obs.streaming = true
              return {
                id: 'zero_stream',
                label: 'Go live in OBS',
                status: 'done' as const,
                detail: 'OBS is streaming.',
              }
            })(),
      )
    if (z.record)
      steps.push({
        id: 'zero_record',
        label: 'Recording',
        status: 'done',
        detail: 'OBS is recording.',
      })
    if (z.chat) {
      this.host.say(z.chat)
      steps.push({ id: 'zero_chat', label: 'Chat', status: 'done', detail: z.chat })
    }
    this.setRun({ ...run, phase: 'live', countdown_ends_at: null, steps })
    return clone(this.run as ShowRun)
  }

  // ------------------------------------------------------------ chat

  onChat(e: FerroEvent): void {
    if (e.kind.type !== 'chat_message' || e.origin !== 'live') return
    const a = e.kind.actor
    if (a.id === 'me') return
    this.firstChatter(e)
    const text = e.kind.content.text.trim()
    if (!text.startsWith('!')) return
    const [word = '', ...args] = text.split(/\s+/)
    const w = word.toLowerCase()
    if (this.customWins(w)) return
    const isMod = (a.roles & 3) !== 0
    const rest = text.slice(word.length).trim()
    const counter = this.counters.find((c) => c.enabled && c.command?.toLowerCase() === w)
    if (counter) {
      const op = args[0]?.toLowerCase()
      if (isMod && op) {
        const n = Number(args[1] ?? (op.length > 1 ? op.slice(1) : 1))
        if (op === 'reset') counter.value = 0
        else if (op === 'set' && Number.isInteger(n)) counter.value = n
        else if (op.startsWith('+') && Number.isInteger(n)) counter.value += Math.abs(n)
        else if (op.startsWith('-') && Number.isInteger(n)) counter.value -= Math.abs(n)
        this.host.broadcastLive({
          v: 1,
          type: 'counter',
          data: { name: counter.name, value: counter.value },
        })
      } else if (!this.cooldown(`${w}:${a.id}`, 10_000)) return
      this.say(
        counter.reply
          .replace(/\{count\}/g, String(counter.value))
          .replace(
            /\{counter\}/g,
            counter.name[0]!.toUpperCase() + counter.name.slice(1).replace(/_/g, ' '),
          )
          .replace(/\{user\}/g, a.display_name),
      )
      return
    }
    if (!BUILT_IN.has(w)) return
    if (!isMod && !this.cooldown(`${w}:${a.id}`, 10_000)) return
    const m = this.modules
    const name = a.display_name
    switch (w) {
      case '!8ball':
        if (m.eight_ball.enabled)
          this.say(
            rest
              ? `@${name}, ${EIGHT_BALL[Math.floor(this.host.random() * EIGHT_BALL.length)]}`
              : `@${name}, ask me a question: !8ball will we win?`,
          )
        return
      case '!roll':
      case '!dice':
        if (m.dice.enabled)
          this.say(`@${name} rolled a d6: ${1 + Math.floor(this.host.random() * 6)}`)
        return
      case '!uptime':
        if (m.uptime.enabled)
          this.say(
            this.host.isLive()
              ? 'We’ve been live for 2 hours, 14 minutes.'
              : 'We’re not live right now.',
          )
        return
      case '!followage':
        if (m.followage.enabled) this.say(`${name} has followed for 1 year, 2 months.`)
        return
      case '!watchtime':
        if (m.watchtime.enabled) this.say(`@${name} has watched for 41 hours, 5 minutes.`)
        return
      case '!quote': {
        if (!m.quotes.enabled) return
        const [sub = '', ...more] = rest.split(/\s+/)
        if (sub.toLowerCase() === 'add') {
          if (!isMod) return
          const q = more.join(' ').trim()
          if (!q)
            return this.say(
              'Use !quote for a random one, !quote 12 for number 12, and (mods) !quote add <text> or !quote remove 12.',
            )
          const added = {
            id: this.nextQuote++,
            text: q.slice(0, 400),
            added_by: name,
            at: Date.now(),
          }
          this.quotes.push(added)
          return this.say(`Added quote #${added.id}.`)
        }
        const n = Number(sub.replace(/^#/, ''))
        const q =
          Number.isInteger(n) && n > 0
            ? this.quotes.find((x) => x.id === n)
            : this.quotes[Math.floor(this.host.random() * this.quotes.length)]
        return this.say(
          q ? `Quote #${q.id}: "${q.text}" (${q.added_by})` : `There's no quote #${sub}.`,
        )
      }
      case '!scene':
        if (!this.scenesCfg.chat_enabled || !isMod) return
        {
          const target = this.scenesCfg.chat_allowed.find(
            (s) => s.toLowerCase().startsWith(rest.toLowerCase()) && rest,
          )
          if (!target) return this.say(`"${rest}" isn't a scene mods can switch to.`)
          this.obs.current = target
          this.say(`Switched to ${target}.`)
        }
        return
      case '!clip':
        if (!this.scenesCfg.clip_command || !isMod) return
        if (!this.obs.replay) return this.say('Couldn’t clip: OBS’s replay buffer isn’t running.')
        this.obs.saves += 1
        this.addMarker('clip', `Clip by ${name}`, null, true)
        return this.say('Clipped! It’s saved in OBS’s recordings folder.')
      case '!so':
        if (!m.shoutout.enabled || !isMod || !args[0]) return
        return this.say(
          `Go show some love to ${args[0].replace(/^@/, '')}! https://twitch.tv/${args[0].replace(/^@/, '').toLowerCase()}`,
        )
      default:
        return
    }
  }

  private firstChatter(e: FerroEvent): void {
    if (e.kind.type !== 'chat_message' || !this.momentsCfg.first_chatters) return
    if (!(e.kind.actor.roles & 512)) return
    const item: LaneItem = {
      id: `l-${e.id}`,
      kind: 'first_chatter',
      title: `${e.kind.actor.display_name} is chatting for the first time`,
      detail: e.kind.content.text.slice(0, 200) || null,
      platform: e.platform,
      event_id: e.id,
      at: Date.now(),
    }
    this.lane = [...this.lane, item].slice(-50)
    this.emitLane(item)
  }

  /** Big tips, raids and gifts pin in the lane and mark the timeline. */
  onEvent(e: FerroEvent): void {
    if (e.origin !== 'live') return
    const c = this.momentsCfg
    const k = e.kind
    let title: string | null = null
    let kind: LaneItem['kind'] = 'tip'
    let detail: string | null = null
    if (k.type === 'tip' && k.status === 'captured' && k.money.minor / 100 >= c.big_tip) {
      title = `${k.actor.display_name} tipped ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: k.money.currency, maximumFractionDigits: 0 }).format(k.money.minor / 100)}`
      detail = k.message ?? null
    } else if (k.type === 'raid' && k.viewers >= c.raid_viewers) {
      kind = 'raid'
      title = `${k.from.display_name} raided with ${k.viewers} ${k.viewers === 1 ? 'viewer' : 'viewers'}`
    } else if (k.type === 'gift_batch' && k.count >= c.big_sub_gift) {
      kind = 'gift'
      title = `${k.gifter.display_name} gifted ${k.count} subs`
    } else if (k.type === 'platform_gift' && k.value.amount >= c.big_gift_value) {
      kind = 'bits'
      title = `${k.actor.display_name} cheered ${k.value.amount} bits`
    }
    if (!title) return
    const item: LaneItem = {
      id: `l-${e.id}`,
      kind,
      title,
      detail,
      platform: e.platform,
      event_id: e.id,
      at: Date.now(),
    }
    this.lane = [...this.lane, item].slice(-50)
    this.emitLane(item)
    if (c.markers) this.addMarker(kind, title, e.platform)
  }

  // ------------------------------------------------------------ routes

  route(method: string, seg: string[], body: unknown, url: URL): Routed {
    const [a, b, c] = seg
    const is = (m: string, ...parts: (string | null)[]) =>
      method === m &&
      seg.length === parts.length &&
      parts.every((x, i) => x === null || x === seg[i])

    // counters
    if (is('GET', 'counters')) return clone(this.counters)
    if (is('POST', 'counters')) {
      const o = requireObj(body)
      const name = String(o.name ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30)
      if (!name)
        throw new HttpError(
          400,
          'invalid',
          'name: use 1 to 30 lowercase letters, digits or _ (like deaths).',
        )
      if (this.counters.some((x) => x.name === name))
        throw new HttpError(409, 'conflict', `A counter called "${name}" already exists.`)
      const command =
        o.command === null
          ? null
          : typeof o.command === 'string'
            ? o.command.trim().toLowerCase()
            : `!${name}`
      if (command !== null && !/^![a-z0-9_-]{1,32}$/.test(command))
        throw new HttpError(
          400,
          'invalid',
          'command: start with ! and use letters, digits, - or _ (like !deaths).',
        )
      if (
        command &&
        (BUILT_IN.has(command) ||
          this.customWins(command) ||
          this.counters.some((x) => x.command === command))
      )
        throw new HttpError(409, 'conflict', `${command} is already used. Pick another name.`)
      const reply =
        typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim() : '{counter}: {count}'
      const value = isWhole(o.value) ? o.value : 0
      const cnt: Counter = { name, value, command, reply, enabled: o.enabled !== false }
      this.counters.push(cnt)
      return clone(cnt)
    }
    if (a === 'counters' && b && seg.length >= 2) {
      const cnt = this.counters.find((x) => x.name === b)
      const missing = () =>
        new HttpError(
          404,
          'counter_not_found',
          'That counter doesn’t exist.',
          'Reload the Bot page; it may have been deleted.',
        )
      if (is('DELETE', 'counters', null)) {
        if (!cnt) throw missing()
        this.counters = this.counters.filter((x) => x !== cnt)
        return undefined
      }
      if (is('PUT', 'counters', null)) {
        if (!cnt) throw missing()
        const o = requireObj(body)
        if ('enabled' in o) {
          if (typeof o.enabled !== 'boolean')
            throw new HttpError(400, 'invalid', 'enabled: must be true or false.')
          cnt.enabled = o.enabled
        }
        if ('value' in o) {
          if (!isWhole(o.value) || Math.abs(o.value) > 1e9)
            throw new HttpError(400, 'invalid', 'value: a whole number up to ±1,000,000,000.')
          cnt.value = o.value
        }
        if ('reply' in o) {
          if (typeof o.reply !== 'string' || !o.reply.trim())
            throw new HttpError(400, 'invalid', 'reply: write 1 to 300 characters.')
          cnt.reply = o.reply.trim()
        }
        if ('command' in o) cnt.command = o.command === null ? null : String(o.command)
        this.host.broadcastLive({
          v: 1,
          type: 'counter',
          data: { name: cnt.name, value: cnt.value },
        })
        return clone(cnt)
      }
      if (is('POST', 'counters', null, 'change')) {
        if (!cnt) throw missing()
        const o = requireObj(body)
        const amount = o.amount
        if (o.op === 'add') cnt.value += isWhole(amount) ? amount : 1
        else if (o.op === 'set') {
          if (!isWhole(amount))
            throw new HttpError(400, 'invalid', 'amount: say what to set it to.')
          cnt.value = amount
        } else if (o.op === 'reset') cnt.value = 0
        else throw new HttpError(400, 'invalid', 'op: add, set or reset.')
        this.host.broadcastLive({
          v: 1,
          type: 'counter',
          data: { name: cnt.name, value: cnt.value },
        })
        return clone(cnt)
      }
    }

    // quotes
    if (is('GET', 'quotes')) return clone(this.quotes)
    if (is('POST', 'quotes')) {
      const text = String(requireObj(body).text ?? '').trim()
      if (!text || [...text].length > 400)
        throw new HttpError(400, 'invalid', 'text: 1 to 400 characters.')
      const q: Quote = { id: this.nextQuote++, text, added_by: 'Dashboard', at: Date.now() }
      this.quotes.push(q)
      return clone(q)
    }
    if (a === 'quotes' && b && seg.length === 2) {
      const q = this.quotes.find((x) => String(x.id) === b)
      if (!q)
        throw new HttpError(
          404,
          'quote_not_found',
          'That quote doesn’t exist.',
          'Reload the quotes list; a mod may have removed it.',
        )
      if (method === 'DELETE') {
        this.quotes = this.quotes.filter((x) => x !== q)
        return undefined
      }
      if (method === 'PUT') {
        const text = String(requireObj(body).text ?? '').trim()
        if (!text || [...text].length > 400)
          throw new HttpError(400, 'invalid', 'text: 1 to 400 characters.')
        q.text = text
        return clone(q)
      }
    }

    // modules
    if (is('GET', 'modules')) return clone(this.modules)
    if (is('PUT', 'modules')) {
      const o = requireObj(body)
      const next = clone(this.modules) as unknown as Record<string, Record<string, unknown>>
      for (const [k, v] of Object.entries(o)) {
        const cur = next[k]
        if (!cur) continue
        if (typeof v !== 'object' || v === null || Array.isArray(v))
          throw new HttpError(400, 'invalid', `${k}: must be an object of settings.`)
        for (const [fk, fv] of Object.entries(v)) {
          if (!(fk in cur)) continue
          if (typeof fv !== typeof cur[fk]) {
            const want =
              typeof cur[fk] === 'boolean'
                ? 'true or false'
                : typeof cur[fk] === 'number'
                  ? 'a number'
                  : 'text'
            throw new HttpError(400, 'invalid', `${k}.${fk}: must be ${want}.`)
          }
          cur[fk] = fv
        }
      }
      const n = next as unknown as ModulesConfig
      if (n.roulette.win_percent < 1 || n.roulette.win_percent > 99)
        throw new HttpError(400, 'invalid', 'roulette.win_percent: between 1 and 99.')
      if (n.duel.accept_s < 10 || n.duel.accept_s > 300)
        throw new HttpError(400, 'invalid', 'duel.accept_s: between 10 and 300 seconds.')
      this.modules = n
      return clone(n)
    }

    // stream info
    if (is('GET', 'stream-info'))
      return {
        last: clone(this.history[0] ?? null),
        presets: clone(this.presets),
        history: clone(this.history),
        platforms: this.access(),
      }
    if (is('POST', 'stream-info', 'apply')) {
      const o = requireObj(body)
      if (typeof o.info !== 'object' || o.info === null)
        throw new HttpError(400, 'invalid', 'A field is missing or wrong: info.')
      const platforms = Array.isArray(o.platforms) ? (o.platforms as ChatPlatform[]) : undefined
      const r = this.apply(o.info as StreamInfo, platforms)
      if (r.ok === 0)
        throw new HttpError(
          422,
          'stream_info_failed',
          'No platform took the change.',
          'See what each platform said below.',
        )
      if (r.failed > 0)
        return new Response(JSON.stringify(r), {
          status: 207,
          headers: { 'Content-Type': 'application/json' },
        })
      return r
    }
    if (is('GET', 'stream-info', 'categories')) {
      const q = url.searchParams.get('q')?.trim() ?? ''
      const p = url.searchParams.get('platform') as ChatPlatform
      if (!['twitch', 'youtube', 'kick'].includes(p))
        throw new HttpError(400, 'invalid', `"${p}" isn't a platform; use twitch, youtube or kick.`)
      if (!q) throw new HttpError(400, 'invalid', 'q: type 1 to 100 characters to search.')
      const all =
        p === 'youtube'
          ? ['Gaming', 'People & Blogs', 'Entertainment', 'Music', 'Education']
          : [
              'VALORANT',
              'Valheim',
              'Just Chatting',
              'Hades II',
              'Minecraft',
              'Elden Ring',
              'Art',
              'Music',
            ]
      return {
        platform: p,
        items: all
          .filter((n) => n.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 10)
          .map((n, i) => ({ id: `${p}-${i}-${n.length}`, name: n, image_url: null })),
      }
    }
    if (is('POST', 'stream-info', 'presets')) {
      const o = requireObj(body)
      const name = String(o.name ?? '').trim()
      if (!name || [...name].length > 60)
        throw new HttpError(400, 'invalid', 'name: give the preset a name of 1 to 60 characters.')
      if (this.presets.some((p) => p.name.toLowerCase() === name.toLowerCase()))
        throw new HttpError(409, 'conflict', `A preset called "${name}" already exists.`)
      const err = checkStreamInfo((o.info ?? {}) as StreamInfo)
      if (err) throw new HttpError(400, 'invalid', err)
      const p: StreamPreset = {
        id: `p-${Date.now().toString(36)}`,
        name,
        info: clone(o.info as StreamInfo),
        updated_at: Date.now(),
      }
      this.presets.push(p)
      return clone(p)
    }
    if (a === 'stream-info' && b === 'presets' && c && seg.length === 3) {
      const p = this.presets.find((x) => x.id === c)
      if (!p)
        throw new HttpError(
          404,
          'preset_not_found',
          'That preset doesn’t exist.',
          'Reload the page; it may have been deleted.',
        )
      if (method === 'DELETE') {
        this.presets = this.presets.filter((x) => x !== p)
        if (this.showCfg.preset_id === p.id) this.showCfg.preset_id = null
        return undefined
      }
      if (method === 'PUT') {
        const o = requireObj(body)
        const name = String(o.name ?? '').trim()
        if (!name)
          throw new HttpError(400, 'invalid', 'name: give the preset a name of 1 to 60 characters.')
        if (this.presets.some((x) => x !== p && x.name.toLowerCase() === name.toLowerCase()))
          throw new HttpError(409, 'conflict', `A preset called "${name}" already exists.`)
        const err = checkStreamInfo((o.info ?? {}) as StreamInfo)
        if (err) throw new HttpError(400, 'invalid', err)
        p.name = name
        p.info = clone(o.info as StreamInfo)
        p.updated_at = Date.now()
        return clone(p)
      }
    }

    // show
    if (is('GET', 'show')) return { show: clone(this.run) }
    if (is('GET', 'show', 'config')) return clone(this.showCfg)
    if (is('PUT', 'show', 'config')) {
      const o = requireObj(body)
      const next = { ...this.showCfg, ...o } as ShowConfig
      if (next.countdown_s !== 0 && (next.countdown_s < 10 || next.countdown_s > 3600))
        throw new HttpError(
          400,
          'invalid',
          'countdown_s: 10 seconds to 1 hour, or 0 for no countdown.',
        )
      const chat = next.at_zero?.chat
      if (
        chat !== undefined &&
        chat !== null &&
        (!chat.trim() || chat.length > 400 || /\p{Cc}/u.test(chat))
      )
        throw new HttpError(
          400,
          'invalid',
          'at_zero.chat: 1 to 400 characters on one line, or turn it off.',
        )
      if (next.countdown_s > 0 && next.at_zero?.switch !== false && !next.live_scene)
        throw new HttpError(
          400,
          'invalid',
          'live_scene: pick the scene to switch to when the countdown ends.',
        )
      if (!Number.isInteger(next.stop_delay_s) || next.stop_delay_s < 0 || next.stop_delay_s > 600)
        throw new HttpError(400, 'invalid', 'stop_delay_s: 0 to 600 seconds.')
      if (next.preset_id && !this.presets.some((p) => p.id === next.preset_id))
        throw new HttpError(400, 'invalid', 'preset_id: that preset doesn’t exist any more.')
      this.showCfg = next
      return clone(next)
    }
    if (is('GET', 'show', 'preflight')) return this.preflight()
    if (is('POST', 'show', 'preflight', 'fix')) {
      const action = String(requireObj(body).action ?? '').replace(/^action:/, '')
      if (action.startsWith('unmute:')) this.obs.muted[action.slice(7)] = false
      else if (action.startsWith('show:')) {
        const [scene, source] = action.slice(5).split('/')
        const it = this.findScene(scene ?? '')?.items.find((i) => i.source === source)
        if (!it) throw new HttpError(400, 'invalid', `action: "${source}" isn't in "${scene}".`)
        it.enabled = true
      } else if (action === 'start_replay_buffer') this.obs.replay = true
      else
        throw new HttpError(
          400,
          'invalid',
          'action: unmute:<input>, show:<scene>/<source> or start_replay_buffer.',
        )
      return this.preflight()
    }
    if (is('POST', 'show', 'start'))
      return { show: this.startShow(Boolean((body as { force?: boolean } | null)?.force)) }
    if (is('POST', 'show', 'countdown', 'skip')) {
      if (this.run?.phase !== 'countdown')
        throw new HttpError(
          404,
          'no_countdown',
          'There’s no countdown running.',
          'Start the show first.',
        )
      return { show: this.goLive() }
    }
    if (is('POST', 'show', 'countdown', 'cancel')) {
      if (this.run?.phase !== 'countdown' || !this.run)
        throw new HttpError(
          404,
          'no_countdown',
          'There’s no countdown running.',
          'Start the show first.',
        )
      const steps = this.run.steps.map((s) =>
        s.id === 'countdown' ? { ...s, status: 'skipped' as const, detail: 'Cancelled.' } : s,
      )
      this.setRun({ ...this.run, phase: 'starting', countdown_ends_at: null, steps })
      return { show: clone(this.run) }
    }
    if (is('POST', 'show', 'live-scene')) return { show: this.goLive() }
    if (is('POST', 'show', 'end')) {
      const steps: ShowStep[] = []
      if (this.showCfg.ending_scene) {
        this.switchTo(this.showCfg.ending_scene)
        steps.push({
          id: 'ending_scene',
          label: 'Ending scene',
          status: 'done',
          detail: `OBS is on "${this.showCfg.ending_scene}".`,
        })
      }
      if (this.showCfg.recap_message) {
        const text = this.showCfg.recap_message
          .replace(/\{thanks\}/g, 'DesertFoxx, Asha, LunaLagoon and 9 more')
          .replace(/\{follows\}/g, '23')
          .replace(/\{subs\}/g, '7')
          .replace(/\{duration\}/g, '2 hours, 14 minutes')
        this.say(text)
        steps.push({ id: 'recap', label: 'Thank-you message', status: 'done', detail: text })
      }
      this.addMarker('manual', 'Show ended', null)
      const showId = this.run?.id
      if (this.showCfg.stop_stream) {
        const delay = this.showCfg.stop_delay_s
        if (delay === 0) {
          this.obs.streaming = false
          steps.push({
            id: 'stop_stream',
            label: 'Stop streaming',
            status: 'done',
            detail: 'OBS stopped streaming.',
          })
        } else {
          steps.push({
            id: 'stop_stream',
            label: 'Stop streaming',
            status: 'waiting',
            detail: `OBS stops streaming in ${delay} seconds.`,
          })
          this.host.later(() => {
            const r = this.run
            if (!r || r.id !== showId || r.phase !== 'ended') return
            this.obs.streaming = false
            this.setRun({
              ...r,
              steps: r.steps.map((x) =>
                x.id === 'stop_stream'
                  ? { ...x, status: 'done' as const, detail: 'OBS stopped streaming.' }
                  : x,
              ),
            })
          }, delay * 1000)
        }
      }
      const run: ShowRun = {
        ...(this.run ?? {
          id: `show-${Date.now()}`,
          started_at: this.startedAt,
          live_scene: null,
          countdown_ends_at: null,
          ended_at: null,
          phase: 'live' as const,
          steps: [],
        }),
        phase: 'ended',
        ended_at: Date.now(),
        countdown_ends_at: null,
        steps,
      }
      this.setRun(run)
      return { show: clone(run) }
    }

    // The Studio's engine needs the desktop app (libobs in its window), like the engine says.
    if (a === 'studio' && b === 'engine') {
      if (is('GET', 'studio', 'engine'))
        return {
          available: false,
          running: false,
          version: null,
          renderer: null,
          detail: 'The Studio runs in the Ferrocast app on your computer. Open Ferrocast there.',
        }
      throw new HttpError(
        422,
        'studio_unavailable',
        'The Studio runs in the Ferrocast app on your computer. Open Ferrocast there.',
        'The Studio needs the desktop app; this is the server or a browser.',
      )
    }

    // OBS
    if (is('GET', 'obs', 'scenes'))
      return { current: this.obs.current, scenes: clone(this.obs.scenes) } satisfies ObsScenes
    if (is('GET', 'obs', 'inputs'))
      return [
        { name: 'Mic', kind: 'wasapi_input_capture' },
        { name: 'Desktop Audio', kind: 'wasapi_output_capture' },
        { name: 'Webcam', kind: 'dshow_input' },
        { name: 'Game', kind: 'game_capture' },
      ]
    if (is('POST', 'obs', 'scene')) {
      const scene = String(requireObj(body).scene ?? '')
      if (!scene) throw new HttpError(400, 'invalid', 'scene: a scene name of 1 to 100 characters.')
      this.switchTo(scene)
      return undefined
    }
    if (is('POST', 'obs', 'source')) {
      const o = requireObj(body)
      const it = this.findScene(String(o.scene))?.items.find((i) => i.id === o.item_id)
      if (!it)
        throw new HttpError(
          422,
          'obs_refused',
          `OBS has no scene called "${String(o.scene)}".`,
          'Check the name in OBS, or pick it again in Studio.',
        )
      it.enabled = Boolean(o.visible)
      return undefined
    }
    if (is('POST', 'obs', 'input', 'mute')) {
      const o = requireObj(body)
      this.obs.muted[String(o.input)] = Boolean(o.muted)
      return undefined
    }
    if (is('POST', 'obs', 'replay', 'save')) {
      const label = String((body as { label?: string } | null)?.label ?? '').trim()
      if ([...label].length > 200)
        throw new HttpError(400, 'invalid', 'label: 200 characters at most.')
      if (!this.obs.replay)
        throw new HttpError(
          422,
          'obs_refused',
          'OBS answered with an error: OBS’s replay buffer isn’t running. Start it in OBS (Start Replay Buffer under Controls), or turn on "Start the replay buffer" in Studio’s show checklist.',
          'Check the name in OBS, or pick it again in Studio.',
        )
      this.obs.saves += 1
      const marker = this.addMarker('clip', label || 'Clip saved', null, true)
      return {
        saved: true,
        path: `C:/Users/nova/Videos/Replay ${this.obs.saves}.mkv`,
        marker,
      } satisfies ClipResult
    }
    if (is('GET', 'obs', 'stream')) return { streaming: this.obs.streaming }
    if (is('POST', 'obs', 'stream')) {
      const on = requireObj(body).on
      if (typeof on !== 'boolean') throw new HttpError(400, 'invalid', 'on: true or false.')
      this.obs.streaming = on
      return { streaming: on }
    }
    if (is('POST', 'obs', 'brb')) {
      const on = Boolean(requireObj(body).on)
      const brb = this.scenesCfg.brb_scene
      if (!brb)
        throw new HttpError(
          422,
          'no_brb_scene',
          'No BRB scene is picked.',
          'Pick one in Studio, OBS.',
        )
      if (on) {
        if (this.obs.current !== brb) this.brbFrom = this.obs.current
        this.obs.current = brb
        for (const m of this.scenesCfg.brb_mute) this.obs.muted[m] = true
      } else {
        const back = this.brbFrom ?? this.showCfg.live_scene
        if (!back)
          throw new HttpError(
            422,
            'no_return_scene',
            'Ferrocast doesn’t know which scene to go back to.',
            'Switch the scene yourself, or pick a live scene in Studio, Show.',
          )
        this.obs.current = back
        this.brbFrom = null
        for (const m of this.scenesCfg.brb_mute) this.obs.muted[m] = false
      }
      const r = { on, scene: this.obs.current }
      this.host.broadcastLive({ v: 1, type: 'brb', data: r })
      return r
    }
    if (is('GET', 'obs', 'health')) return { health: clone(this.health) }
    if (is('POST', 'obs', 'health')) {
      this.health = this.reading(false)
      return { health: clone(this.health) }
    }
    if (is('GET', 'obs', 'switcher')) return clone(this.scenesCfg)
    if (is('PUT', 'obs', 'switcher')) {
      const next = { ...this.scenesCfg, ...requireObj(body) } as ScenesConfig
      if (next.hotkeys.length > 9)
        throw new HttpError(400, 'invalid', 'hotkeys: 9 at most (Alt+1 to Alt+9).')
      if (next.brb_on_ads && !next.brb_scene)
        throw new HttpError(
          400,
          'invalid',
          'brb_scene: pick the BRB scene to switch to during ads.',
        )
      this.scenesCfg = next
      return clone(next)
    }

    // moments
    if (is('GET', 'moments', 'config')) return clone(this.momentsCfg)
    if (is('PUT', 'moments', 'config')) {
      const next = { ...this.momentsCfg, ...requireObj(body) } as MomentsConfig
      if (!['chime', 'coin', 'bell', 'none'].includes(next.sound))
        throw new HttpError(400, 'invalid', 'sound: use chime, coin, bell or none.')
      if (next.volume < 0 || next.volume > 100)
        throw new HttpError(400, 'invalid', 'volume: 0 to 100.')
      this.momentsCfg = next
      return clone(next)
    }
    if (is('GET', 'moments', 'lane')) return clone([...this.lane].reverse())
    if (is('POST', 'moments', 'lane', 'dismiss-all')) {
      this.lane = []
      this.emitLane(null)
      return []
    }
    if (is('POST', 'moments', 'lane', null, 'dismiss')) {
      const before = this.lane.length
      this.lane = this.lane.filter((i) => i.id !== c)
      if (this.lane.length === before)
        throw new HttpError(
          404,
          'lane_item_not_found',
          'That moment isn’t pinned any more.',
          'It was dismissed already, maybe from another dashboard.',
        )
      this.emitLane(null)
      return clone([...this.lane].reverse())
    }
    if (is('GET', 'moments', 'markers')) {
      const since = Number(url.searchParams.get('since') ?? this.startedAt)
      return clone(this.markers.filter((m) => m.at >= since))
    }
    if (is('POST', 'moments', 'markers')) {
      const label = String((body as { label?: string } | null)?.label ?? '').trim()
      if ([...label].length > 200)
        throw new HttpError(400, 'invalid', 'label: 200 characters at most.')
      return clone(this.addMarker('manual', label || 'Marker', null))
    }
    if (is('GET', 'moments', 'markers', 'export')) {
      const format = url.searchParams.get('format') ?? 'csv'
      if (format !== 'csv' && format !== 'txt')
        throw new HttpError(400, 'invalid', 'format: csv or txt.')
      const since = Number(url.searchParams.get('since') ?? 0)
      const list = this.markers.filter((m) => m.at >= since)
      const text = format === 'csv' ? markersCsv(list) : markersTxt(list)
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type':
            format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="ferrocast-markers.${format}"`,
        },
      })
    }
    if (is('DELETE', 'moments', 'markers', null)) {
      const before = this.markers.length
      this.markers = this.markers.filter((m) => String(m.id) !== c)
      if (this.markers.length === before)
        throw new HttpError(
          404,
          'marker_not_found',
          'That marker doesn’t exist.',
          'Reload the list; it may have been deleted.',
        )
      return undefined
    }
    return NOT_MINE
  }
}

function label(p: Platform): string {
  return p === 'twitch'
    ? 'Twitch'
    : p === 'youtube'
      ? 'YouTube'
      : p === 'kick'
        ? 'Kick'
        : p === 'tips'
          ? 'Tips'
          : 'Ferrocast'
}

/** Same layout as the engine's export (`core::moments::to_csv`). */
export function markersCsv(list: Marker[]): string {
  const cell = (v: string) => {
    let t = noControl(v)
    if (/^[=+\-@]/.test(t)) t = `'${t}`
    return `"${t.replace(/"/g, '""')}"`
  }
  const tc = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
  }
  let out = 'timecode,offset_seconds,kind,label,platform,clip,unix_ms\n'
  for (const m of list)
    out += `${m.offset_ms === null ? '' : tc(m.offset_ms)},${m.offset_ms === null ? '' : Math.floor(m.offset_ms / 1000)},${m.kind},${cell(m.label)},${m.platform ? label(m.platform) : ''},${m.clip ? 'yes' : 'no'},${m.at}\n`
  return out
}

export function markersTxt(list: Marker[]): string {
  return list
    .map((m) => {
      const s = m.offset_ms === null ? null : Math.floor(m.offset_ms / 1000)
      const p = (n: number) => String(n).padStart(2, '0')
      const tc =
        s === null
          ? '--:--:--'
          : `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
      return `${tc}  ${noControl(m.label).trim()}${m.clip ? ' [clip saved]' : ''}\n`
    })
    .join('')
}

function noControl(s: string): string {
  return [...s].map((c) => ((c.codePointAt(0) ?? 32) < 32 ? ' ' : c)).join('')
}
