// The features page: every big feature with a real (dark) screenshot and three steps, the
// smaller ones, and what makes Ferrocast different. Short on purpose: people look, they
// don't read. Screenshots are from the demo dashboard and a test Studio (no real accounts).

import type { PageKey } from './pages'

export type GroupKey = 'live' | 'studio' | 'alerts' | 'chat' | 'plug'

export interface Group {
  key: GroupKey
  icon: string
  name: string
}

export const GROUPS: Group[] = [
  { key: 'live', icon: 'broadcast', name: 'Go live' },
  { key: 'studio', icon: 'monitor-play', name: 'Studio' },
  { key: 'alerts', icon: 'bell-ringing', name: 'Alerts and overlays' },
  { key: 'chat', icon: 'chats-circle', name: 'Chat and community' },
  { key: 'plug', icon: 'puzzle-piece', name: 'Plugins' },
]

export interface BigFeature {
  id: string
  group: GroupKey
  icon: string
  name: string
  /** The index card's line. */
  hint: string
  /** One sentence under the heading. */
  one: string
  /** Icon, what, a few words more. */
  steps: [string, string, string][]
  /** In public/media/features, 1440x900 (studio-desk 1600x950). */
  shot: string
  /** Which part of the screenshot the cropped view keeps. */
  pos: string
  isNew?: boolean
  /** Its own page, for the whole story. */
  page?: PageKey
}

export const BIG: BigFeature[] = [
  {
    id: 'go-live',
    group: 'live',
    icon: 'broadcast',
    name: 'Go live everywhere',
    hint: 'Twitch, YouTube, Kick at once',
    one: 'One stream out to every platform, plus an upright one for Shorts.',
    steps: [
      ['link', 'Connect', 'Sign in once'],
      ['toggle-right', 'Switch on', 'Pick where to go'],
      ['broadcast', 'Go live', 'One click'],
    ],
    shot: 'studio.webp',
    pos: '50% 0',
  },
  {
    id: 'studio',
    group: 'studio',
    icon: 'monitor-play',
    name: 'The Studio',
    hint: 'Scenes, sources, filters',
    one: 'Build scenes with your screen, cameras and media. No OBS needed.',
    steps: [
      ['plus-circle', 'Add a source', 'Screen, camera, file'],
      ['magic-wand', 'Add filters', 'Colour, crop, effects'],
      ['arrows-left-right', 'Studio Mode', 'Preview, then send'],
    ],
    shot: 'studio-desk.webp',
    pos: '0 0',
  },
  {
    id: 'alerts',
    group: 'alerts',
    icon: 'bell-ringing',
    name: 'Alerts',
    hint: 'Follows, subs, raids, tips',
    one: 'A look for every moment, and a log that says why one didn’t play.',
    steps: [
      ['cursor-click', 'Pick an event', 'Follow, sub, tip'],
      ['paint-brush', 'Style it', 'Text, sound, video'],
      ['lightning', 'Test it', 'Before you go live'],
    ],
    shot: 'alerts.webp',
    pos: '60% 0',
    page: 'alerts',
  },
  {
    id: 'overlays',
    group: 'alerts',
    icon: 'stack',
    name: 'Overlays',
    hint: 'Drag, drop, add to OBS',
    one: 'Lay out alerts, chat and goals. Add it to your stream in one click.',
    steps: [
      ['squares-four', 'Pick a design', 'Or start blank'],
      ['hand-grabbing', 'Arrange', 'Drag and resize'],
      ['plus', 'Add', 'One click'],
    ],
    shot: 'overlays.webp',
    pos: '50% 0',
    page: 'overlays',
  },
  {
    id: 'merged-chat',
    group: 'chat',
    icon: 'chats-circle',
    name: 'Merged chat',
    hint: 'Every platform, one window',
    one: 'Read and reply to Twitch, YouTube and Kick in one place.',
    steps: [
      ['chat-text', 'Read', 'All platforms'],
      ['paper-plane-tilt', 'Reply', 'To one or all'],
      ['funnel', 'Filter', 'Hide bots'],
    ],
    shot: 'chat.webp',
    pos: '50% 20%',
    page: 'chat',
  },
  {
    id: 'moderation',
    group: 'chat',
    icon: 'shield-check',
    name: 'Moderation',
    hint: 'Ban everywhere, panic mode',
    one: 'Ban once, banned everywhere. One button calms a raid.',
    steps: [
      ['prohibit', 'Ban', 'On every platform'],
      ['siren', 'Panic mode', 'One key'],
      ['hand', 'Hold for review', 'First-time chatters'],
    ],
    shot: 'moderation.webp',
    pos: '50% 0',
    page: 'chat',
  },
  {
    id: 'chatbot',
    group: 'chat',
    icon: 'robot',
    name: 'Chatbot',
    hint: 'Commands, timers, counters',
    one: 'Commands, timers and replies that answer what chat asks every stream.',
    steps: [
      ['terminal', 'Commands', '!discord, !specs'],
      ['timer', 'Timers', 'Every 30 min'],
      ['hash', 'Counters', 'Deaths, wins'],
    ],
    shot: 'bot.webp',
    pos: '0 0',
    page: 'bot',
  },
  {
    id: 'tip-page',
    group: 'chat',
    icon: 'hand-coins',
    name: 'Tips',
    hint: 'Your own tip page',
    one: 'A tip page with your name on it. No ads, no cut of your tips.',
    steps: [
      ['link-simple', 'Get a link', 'For your panels'],
      ['credit-card', 'Viewers tip', 'UPI, card, wallet'],
      ['bell-ringing', 'Alert plays', 'On stream'],
    ],
    shot: 'tips.webp',
    pos: '50% 0',
    page: 'tips',
  },
  {
    id: 'plugins',
    group: 'plug',
    icon: 'puzzle-piece',
    name: 'Plugins',
    hint: 'Effects, logic, panels',
    one: 'Add effects and tools others make. Each one runs locked away from your files and keys.',
    steps: [
      ['download-simple', 'Install', 'One click or a file'],
      ['toggle-right', 'Switch on', 'Per source or panel'],
      ['shield-check', 'Safe', 'Checked before it runs'],
    ],
    shot: 'plugins.webp',
    pos: '30% 0',
    isNew: true,
  },
  {
    id: 'automations',
    group: 'studio',
    icon: 'flow-arrow',
    name: 'When this, do that',
    hint: 'Automations, no code',
    one: 'On a raid, switch scene and thank them. No code, no plugin.',
    steps: [
      ['lightning', 'When', 'A raid, a follow'],
      ['list-checks', 'Do', 'Scene, sound, chat'],
      ['play', 'Test it', 'One click'],
    ],
    shot: 'settings-automations.webp',
    pos: '50% 0',
  },
]

export interface SmallFeature {
  id: string
  group: GroupKey
  icon: string
  name: string
  one: string
  isNew?: boolean
}

export const SMALL: SmallFeature[] = [
  { id: 'vertical', group: 'live', icon: 'device-mobile', name: 'Vertical for Shorts', one: 'A second, upright picture for Shorts and Reels, live at the same time.' },
  { id: 'record', group: 'live', icon: 'record', name: 'Record', one: 'Record while you stream, or on its own, in MP4.' },
  { id: 'replay', group: 'studio', icon: 'clock-counter-clockwise', name: 'Instant replay', one: 'Save the last moments and play them in a scene, then back.' },
  { id: 'captions', group: 'studio', icon: 'closed-captioning', name: 'Live captions', one: 'Captions on your stream, made on your computer, translated.' },
  { id: 'background', group: 'studio', icon: 'user-focus', name: 'Background removal', one: 'No green screen. Works on any Mac or PC.' },
  { id: 'noise', group: 'studio', icon: 'waveform', name: 'Clean sound', one: 'Strong noise removal that keeps your voice natural.' },
  { id: 'guests', group: 'studio', icon: 'users-three', name: 'Guest cameras', one: 'Bring a friend on with a link. No app for them.' },
  { id: 'vst', group: 'plug', icon: 'sliders', name: 'VST sound plugins', isNew: true, one: 'Your own VST3 audio plugins on a Mac, each one locked down.' },
  { id: 'remote', group: 'chat', icon: 'device-mobile-camera', name: 'Phone remote', one: 'Switch scenes and run alerts from your phone.' },
  { id: 'tts', group: 'chat', icon: 'speaker-high', name: 'Text to speech', one: 'Tips and messages read out, with a voice you pick.' },
  { id: 'recap', group: 'chat', icon: 'chart-line-up', name: 'Stream recap', one: 'What happened, who showed up, and your best moments.' },
  { id: 'your-data', group: 'chat', icon: 'house-line', name: 'Your data stays yours', one: 'Your chat, events and keys stay on your PC.' },
]

/** What makes Ferrocast different. The CPU figure was measured on an M4 Mac on 11 Nov 2026:
 * a 1440p screen, two cameras and a timer, not recording. */
export const WHY: { icon: string; big: string; small: string }[] = [
  { icon: 'currency-circle-dollar', big: 'Free', small: 'Open source. No ads, no cut of your tips.' },
  { icon: 'cpu', big: '7% CPU', small: 'A 1440p screen and two cameras, on an M4 Mac.' },
  { icon: 'lock-key', big: 'On your PC', small: 'Your keys and chat never leave it.' },
  { icon: 'plugs-connected', big: 'No OBS', small: 'Its own studio built in. OBS still works too.' },
  { icon: 'shield-check', big: 'Safe plugins', small: 'Each locked away from your files.' },
  { icon: 'globe-hemisphere-east', big: '3 at once', small: 'Twitch, YouTube and Kick together.' },
]
