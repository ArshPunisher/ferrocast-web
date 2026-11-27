// Use-case pages: one template, three pages. Each lists what Ferrocast does for that kind of
// stream, and only what it really does.

import type { PageKey } from './pages'

export interface UsePick {
  icon: string
  title: string
  body: string
  href: string
}
export interface UseCase {
  slug: string
  page: PageKey
  tab: string
  h1: string
  lede: string
  /** In public/media/features, 1440x900. */
  shot: string
  alt: string
  picks: UsePick[]
  /** A plain note when the use case has a limit people should know about. */
  note?: string
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'gaming',
    page: 'useGaming',
    tab: 'Gaming',
    h1: 'Built for gaming.',
    lede: 'Put alerts and chat over your game. Send an upright copy to Shorts at the same time.',
    shot: 'overlays.webp',
    alt: 'The Overlays page with two overlays and Add to OBS buttons',
    picks: [
      {
        icon: 'stack',
        title: 'Overlays & widgets',
        body: 'Alerts, chat and goals on one browser source.',
        href: '/features/widgets/',
      },
      {
        icon: 'bell-ringing',
        title: 'Alerts',
        body: 'Every follow, sub and raid gets its own look.',
        href: '/features/alerts/',
      },
      {
        icon: 'device-mobile',
        title: 'Vertical + horizontal',
        body: 'Wide for your channel, upright for Shorts.',
        href: '/features/vertical-dual-output/',
      },
      {
        icon: 'monitor-play',
        title: 'Studio',
        body: 'Your screen and cameras. No OBS needed.',
        href: '/features/#studio',
      },
      {
        icon: 'scissors',
        title: 'Clips',
        body: 'Keep your best moments, right from the app.',
        href: '/features/#clips',
      },
    ],
  },
  {
    slug: 'just-chatting',
    page: 'useChatting',
    tab: 'Just chatting',
    h1: 'Built for talking.',
    lede: 'Chat is the show. Read every platform in one list and ask viewers things.',
    shot: 'chat.webp',
    alt: 'Merged chat from Twitch, YouTube and Kick in one list',
    picks: [
      {
        icon: 'chats-circle',
        title: 'Merged chat',
        body: 'Twitch, YouTube and Kick in one list.',
        href: '/features/chat-moderation/',
      },
      {
        icon: 'chart-bar-horizontal',
        title: 'Polls',
        body: 'Ask chat on Twitch and YouTube. Or type !vote.',
        href: '/features/#polls',
      },
      {
        icon: 'speaker-high',
        title: 'Text-to-speech',
        body: 'Read chat and tips out loud.',
        href: '/features/#tts',
      },
      {
        icon: 'robot',
        title: 'Bot',
        body: 'Commands and timers, so you can keep talking.',
        href: '/features/bot/',
      },
      {
        icon: 'users-three',
        title: 'Guests',
        body: 'Bring on up to 8 guests with a link. No app for them.',
        href: '/features/#guests',
      },
    ],
  },
  {
    slug: 'irl',
    page: 'useIrl',
    tab: 'IRL',
    h1: 'Built for the road.',
    lede: 'Run Ferrocast on a laptop. Chat, alerts and bans keep working wherever you stream from.',
    shot: 'moderation.webp',
    alt: 'The moderation page with filters and one-click bans',
    picks: [
      {
        icon: 'chats-circle',
        title: 'Merged chat',
        body: 'See every platform from one window.',
        href: '/features/chat-moderation/',
      },
      {
        icon: 'bell-ringing',
        title: 'Alerts',
        body: 'Test them before you leave.',
        href: '/features/alerts/',
      },
      {
        icon: 'shield-check',
        title: 'Moderation',
        body: 'Ban once, on every platform. Panic mode included.',
        href: '/features/chat-moderation/',
      },
      {
        icon: 'device-mobile-camera',
        title: 'Phone remote',
        body: 'Switch scenes and run alerts from your phone. Pro.',
        href: '/pricing/',
      },
    ],
    note: 'There is no mobile streaming app. IRL here means a laptop.',
  },
]
