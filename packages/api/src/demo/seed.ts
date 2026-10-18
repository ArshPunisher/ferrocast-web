// Seed data for the demo engine: a mid-size multistreamer, a few hours into a stream.
// Names and messages are made up but realistic; nothing here is a real account.

import { defaultRules, newVariation } from '../alert'
import type {
  AlertRule,
  BanEntry,
  Command,
  Filters,
  Goal,
  Overlay,
  OverlayPreset,
  PanicConfig,
  Settings,
  Theme,
  Timer,
  TipSettings,
  TtsSettings,
  TtsVoice,
  Widget,
} from '../types'

export const THEMES: Theme[] = [
  {
    id: 'molten',
    name: 'Molten',
    description: 'Liquid-metal cards with a cobalt edge. The default.',
    pro: false,
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Clean white cards that read well on busy games.',
    pro: false,
  },
  {
    id: 'arcade',
    name: 'Arcade',
    description: 'Chunky pixel type and hard shadows.',
    pro: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just text with a soft shadow. Lightest on slow PCs.',
    pro: false,
  },
  {
    id: 'sticker',
    name: 'Sticker',
    description: 'Bold cut-out labels with a playful pop.',
    pro: false,
  },
]

type Chatter = { name: string; color: string | null; roles: number }
export const CHATTERS: Record<'twitch' | 'youtube' | 'kick', readonly Chatter[]> = {
  twitch: [
    { name: 'kuro_neko', color: '#7fb4ff', roles: 8 },
    { name: 'Ishaan_Plays', color: '#ff7ab6', roles: 0 },
    { name: 'mira_exe', color: '#9be15d', roles: 2 },
    { name: 'ThePotatoKnight', color: '#ffd166', roles: 8 },
    { name: 'tobiasfromoslo', color: '#c3a6ff', roles: 4 },
    { name: 'sakura_ttv', color: '#ff9f6e', roles: 512 },
    { name: 'DesertFoxx', color: '#4fd1c5', roles: 8 },
    { name: 'NightbotWannabe', color: '#a0aec0', roles: 256 },
  ],
  youtube: [
    { name: 'Nakamura Ren', color: null, roles: 16 },
    { name: 'Ana Beatriz', color: null, roles: 0 },
    { name: 'Rahul Verma', color: null, roles: 16 },
    { name: 'Priya Iyer', color: null, roles: 0 },
    { name: 'Lukas Brandt', color: null, roles: 0 },
  ],
  kick: [
    { name: 'kai_onkick', color: '#53fc18', roles: 0 },
    { name: 'VoltViper', color: '#f6e05e', roles: 8 },
    { name: 'neo_tokyo_drift', color: '#63b3ed', roles: 0 },
    { name: 'BigSalsa', color: '#fc8181', roles: 2 },
  ],
}

export const MESSAGES = [
  'that clutch was insane',
  'gg',
  'o7',
  'first time here, the overlay looks clean',
  'what keyboard is that?',
  'LUL',
  'can you do ranked next?',
  'the music this stream is so good',
  'हाहा ये तो कमाल था',
  'hydrate check',
  'he really said "trust me" and then fell off the map',
  'POG',
  'is this the new patch?',
  'boa noite do Brasil!',
  'ok that was clean',
  'yo chat, be nice to the new folks',
  'one more game, please',
  '12 kills, no way',
  'that boss has no business being that fast',
  'sound is a little quiet btw',
  'ありがとう、楽しい配信',
  '!discord',
  'love that the alerts are all in one place now',
  'Wie heißt das Spiel?',
] as const

let widgetSeq = 0
const wid = () => `w${++widgetSeq}`

export function presetWidgets(preset: OverlayPreset): Widget[] {
  const alerts: Widget = {
    id: wid(),
    kind: 'alerts',
    x: 560,
    y: 80,
    w: 800,
    h: 360,
    config: { theme: 'molten', rule_ids: null },
  }
  const chat: Widget = {
    id: wid(),
    kind: 'chat',
    x: 40,
    y: 560,
    w: 520,
    h: 480,
    config: {
      platforms: ['twitch', 'youtube', 'kick'],
      max_messages: 30,
      fade_after_s: null,
      show_badges: true,
      show_platform: true,
      hide_commands: true,
      hide_bots: true,
      font_size: 22,
      theme: 'molten',
    },
  }
  switch (preset) {
    case 'blank':
      return []
    case 'alerts_only':
      return [alerts]
    case 'chat_only':
      return [{ ...chat, x: 40, y: 40, h: 1000 }]
    case 'starter':
      return [
        alerts,
        chat,
        {
          id: wid(),
          kind: 'goal',
          x: 1460,
          y: 40,
          w: 420,
          h: 110,
          config: { goal_id: 'g-subs', theme: 'molten' },
        },
        {
          id: wid(),
          kind: 'label',
          x: 1460,
          y: 170,
          w: 420,
          h: 64,
          config: {
            source: 'latest_follower',
            template: 'Latest follower: {name}',
            theme: 'molten',
          },
        },
        {
          id: wid(),
          kind: 'viewers',
          x: 40,
          y: 40,
          w: 260,
          h: 64,
          config: { platforms: ['twitch', 'youtube', 'kick'], theme: 'molten' },
        },
        {
          id: wid(),
          kind: 'events',
          x: 1560,
          y: 640,
          w: 320,
          h: 400,
          config: {
            kinds: ['follow', 'subscription', 'gift_batch', 'tip', 'raid'],
            max_items: 6,
            theme: 'molten',
          },
        },
      ]
  }
}

export function seedOverlays(base: string, token: (id: string) => string, now: number): Overlay[] {
  const mk = (id: string, name: string, preset: OverlayPreset): Overlay => ({
    id,
    name,
    url: `${base}/o/${token(id)}/`,
    width: 1920,
    height: 1080,
    widgets: presetWidgets(preset),
    updated_at: now - 86_400_000,
  })
  return [mk('ov-main', 'Main scene', 'starter'), mk('ov-brb', 'Be right back', 'alerts_only')]
}

export function seedRules(): AlertRule[] {
  const rules = defaultRules()
  const sub = rules.find((r) => r.id === 'sub')
  if (sub) {
    const gold = newVariation('sub-gold', '{name} is a legend: {months} months!')
    gold.name = 'A year or more'
    gold.priority = 10
    gold.condition = { type: 'months_at_least', months: 12 }
    gold.duration_ms = 9000
    sub.variations.push(gold)
  }
  const tip = rules.find((r) => r.id === 'tip')
  if (tip) {
    const big = newVariation('tip-big', '{name} just tipped {amount}!')
    big.name = 'Big tips'
    big.priority = 10
    big.condition = { type: 'amount_at_least', value: 1000, currency: 'INR' }
    big.tts = true
    big.layout = 'banner'
    tip.variations.push(big)
  }
  // Raids alert on every platform that has them (Twitch and Kick), like the engine's default.
  return rules
}

export function seedGoals(now: number): Goal[] {
  return [
    {
      id: 'g-subs',
      title: 'Sub goal: new mic',
      kind: 'subs',
      target: 50,
      currency: null,
      starts_at: now - 7 * 86_400_000,
      ends_at: null,
      current: 38,
    },
    {
      id: 'g-tips',
      title: 'Tip jar',
      kind: 'tips',
      target: 10_000,
      currency: 'INR',
      starts_at: now - 7 * 86_400_000,
      ends_at: null,
      current: 3450,
    },
  ]
}

export function seedBans(now: number): BanEntry[] {
  return [
    {
      platform: 'twitch',
      user_id: 't-9001',
      login: 'cheap_viewers_dot_com',
      display_name: 'cheap_viewers_dot_com',
      reason: 'Selling followers',
      banned_at: now - 3 * 86_400_000,
      everywhere: true,
      by: 'mira_exe',
    },
    {
      platform: 'kick',
      user_id: 'k-77',
      login: 'raid_bot_4421',
      display_name: 'raid_bot_4421',
      reason: 'Hate raid',
      banned_at: now - 9 * 86_400_000,
      everywhere: true,
      by: null,
    },
  ]
}

export const FILTERS: Filters = {
  words: {
    enabled: true,
    list: ['example-slur', 'buy followers'],
    lookalikes: true,
    action: 'delete',
  },
  links: {
    enabled: true,
    allow_roles: 2 | 4 | 8,
    allow_domains: ['clips.twitch.tv', 'youtu.be'],
    action: 'delete',
    hold_first_time: true,
  },
  caps: { enabled: true, min_length: 12, max_percent: 70, action: 'delete' },
  emotes: { enabled: false, max: 15, action: 'delete' },
  symbols: { enabled: false, max_percent: 50, action: 'delete' },
  solicitation: { enabled: true, action: 'ban' },
  timeout_seconds: 600,
  exempt_roles: 1 | 2,
}

export const PANIC: PanicConfig = {
  followers_only: true,
  followers_only_minutes: 30,
  emote_only: false,
  slow_mode_seconds: 10,
  hold_new_accounts: true,
  pause_alerts: true,
  pause_tts: true,
  hotkey: 'Ctrl+Alt+Shift+P',
}

export function seedCommands(): Command[] {
  return [
    {
      id: 'c-discord',
      name: '!discord',
      aliases: ['!dc'],
      response: 'Join the Discord: discord.gg/example',
      roles: 'everyone',
      cooldown_s: 30,
      user_cooldown_s: 0,
      platforms: [],
      enabled: true,
    },
    {
      id: 'c-specs',
      name: '!specs',
      aliases: ['!pc'],
      response: 'Ryzen 7 7800X3D, RTX 4070, 32 GB. Streaming with OBS.',
      roles: 'everyone',
      cooldown_s: 60,
      user_cooldown_s: 0,
      platforms: [],
      enabled: true,
    },
    {
      id: 'c-so',
      name: '!so',
      aliases: [],
      // {target_game_note} like the engine: "They were last playing X." or nothing.
      response: 'Go show {target} some love! {target_game_note}',
      roles: 'mods',
      cooldown_s: 5,
      user_cooldown_s: 0,
      platforms: ['twitch', 'kick'],
      enabled: true,
    },
  ]
}

export function seedTimers(): Timer[] {
  return [
    {
      id: 't-hydrate',
      name: 'Hydrate',
      message: 'Hydrate check, chat. Water break!',
      every_min: 30,
      min_chat_lines: 10,
      platforms: [],
      enabled: true,
    },
    {
      id: 't-socials',
      name: 'Socials',
      message:
        'New videos every Friday on YouTube. Tips go straight to me: tip.clearcraftlabs.com/novaplays',
      every_min: 45,
      min_chat_lines: 20,
      platforms: [],
      enabled: false,
    },
  ]
}

export const TTS: TtsSettings = {
  enabled: false,
  voice: 'kokoro-af-heart',
  min_amount: 100,
  max_chars: 200,
  hold_for_approval: true,
  read_names: true,
}

export const VOICES: TtsVoice[] = [
  { id: 'kokoro-af-heart', name: 'Heart', language: 'English (US)', pro: false },
  { id: 'kokoro-bm-george', name: 'George', language: 'English (UK)', pro: false },
  { id: 'kokoro-hf-alpha', name: 'Alpha', language: 'Hindi', pro: false },
]

/** The relay the demo pretends to use, and this install's id on it. */
export const DEMO_RELAY = 'https://ferrocast-relay.clearcraftlabs.com'
export const DEMO_INSTALL = 'ins_7q2kx9m4'
/** Where tip pages live: `<DEMO_TIP_HOST>/<name>`. */
export const DEMO_TIP_HOST = 'https://tip.clearcraftlabs.com'

export function tipWebhooks(base = DEMO_RELAY, install = DEMO_INSTALL) {
  return {
    razorpay: `${base}/v1/tips/razorpay/${install}`,
    kofi: `${base}/v1/tips/kofi/${install}`,
    stripe: `${base}/v1/tips/stripe/${install}`,
  }
}

/** A tip page with Razorpay set up; Ko-fi and Stripe not added yet. */
export const TIPS: TipSettings = {
  handle: 'novaplays',
  display_name: 'NovaPlays',
  message: 'Thanks for hanging out. Every tip goes into the new mic fund.',
  page_url: `${DEMO_TIP_HOST}/novaplays`,
  webhooks: tipWebhooks(),
  razorpay: {
    page_url: 'https://razorpay.me/@novaplays',
    page_id: null,
    test_mode: false,
    has_secret: true,
  },
  kofi: null,
  stripe: null,
}

/** What the engine returns before a tip page was ever saved. */
export const NO_TIPS: TipSettings = {
  handle: '',
  display_name: '',
  message: '',
  page_url: null,
  webhooks: null,
  razorpay: null,
  kofi: null,
  stripe: null,
}

export const SETTINGS: Settings = {
  theme: 'system',
  reduced_motion: 'system',
  low_motion_overlays: false,
  lan_access: false,
  update_channel: 'stable',
  never_update_while_live: true,
  launch_at_login: true,
  close_to_tray: true,
  language: 'en',
  currency: 'INR',
}
