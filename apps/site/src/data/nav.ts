// The main menu: what the header's panels and the phone drawer list. Every href is a real
// page; features without a page of their own point at their card on the features page.

export interface NavItem {
  /** Phosphor icon name. */
  icon: string
  title: string
  desc: string
  href: string
  /** Off-site link. */
  external?: boolean
}
export interface NavGroup {
  title: string
  items: NavItem[]
}
export interface NavMenu {
  key: 'features' | 'usecases' | 'resources'
  label: string
  groups: NavGroup[]
}

export const MENUS: NavMenu[] = [
  {
    key: 'features',
    label: 'Features',
    groups: [
      {
        title: 'Stream & record',
        items: [
          {
            icon: 'monitor-play',
            title: 'Studio',
            desc: 'Scenes and cameras. No OBS needed.',
            href: '/features/#studio',
          },
          {
            icon: 'broadcast',
            title: 'Multistream',
            desc: 'One stream, every platform.',
            href: '/features/multistream/',
          },
          {
            icon: 'device-mobile',
            title: 'Vertical + horizontal',
            desc: 'Landscape and upright, live together.',
            href: '/features/vertical-dual-output/',
          },
          {
            icon: 'scissors',
            title: 'Clips',
            desc: 'Keep your best moments.',
            href: '/features/#clips',
          },
        ],
      },
      {
        title: 'Engage chat',
        items: [
          {
            icon: 'bell-ringing',
            title: 'Alerts',
            desc: 'Every event gets its own look.',
            href: '/features/alerts/',
          },
          {
            icon: 'stack',
            title: 'Overlays & widgets',
            desc: 'One browser source for OBS.',
            href: '/features/widgets/',
          },
          {
            icon: 'chats-circle',
            title: 'Merged chat',
            desc: 'Every platform in one list.',
            href: '/features/chat-moderation/',
          },
          {
            icon: 'robot',
            title: 'Bot',
            desc: 'Commands, timers, filters.',
            href: '/features/bot/',
          },
          {
            icon: 'chart-bar-horizontal',
            title: 'Polls',
            desc: 'Ask chat on Twitch and YouTube.',
            href: '/features/#polls',
          },
          {
            icon: 'speaker-high',
            title: 'Text-to-speech',
            desc: 'Read chat and tips aloud.',
            href: '/features/#tts',
          },
        ],
      },
      {
        title: 'Grow & earn',
        items: [
          { icon: 'hand-coins', title: 'Tips', desc: 'Keep all of it.', href: '/features/tips/' },
          {
            icon: 'chart-line-up',
            title: 'Insights',
            desc: 'See how each stream did.',
            href: '/features/#insights',
          },
          {
            icon: 'shield-check',
            title: 'Moderation',
            desc: 'Ban once, on every platform.',
            href: '/features/chat-moderation/',
          },
        ],
      },
    ],
  },
  {
    key: 'usecases',
    label: 'Use cases',
    groups: [
      {
        title: 'Made for',
        items: [
          {
            icon: 'game-controller',
            title: 'Gaming',
            desc: 'Overlays, alerts, vertical clips.',
            href: '/use-cases/gaming/',
          },
          {
            icon: 'chat-circle-dots',
            title: 'Just chatting',
            desc: 'Chat, polls and your voice.',
            href: '/use-cases/just-chatting/',
          },
          {
            icon: 'person-simple-walk',
            title: 'IRL',
            desc: 'Chat and alerts from a laptop.',
            href: '/use-cases/irl/',
          },
        ],
      },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    groups: [
      {
        title: 'Learn',
        items: [
          { icon: 'book-open', title: 'Docs', desc: 'Start here.', href: '/docs/getting-started/' },
          { icon: 'question', title: 'FAQ', desc: 'Short answers.', href: '/faq/' },
        ],
      },
      {
        title: 'Compare & open',
        items: [
          {
            icon: 'scales',
            title: 'Ferrocast vs Streamlabs',
            desc: 'Features, side by side.',
            href: '/vs-streamlabs/',
          },
          {
            icon: 'columns',
            title: 'Compare the big three',
            desc: 'With StreamElements too.',
            href: '/compare/',
          },
          {
            icon: 'browser',
            title: 'Web dashboard',
            desc: 'Open it in any browser.',
            href: '/web-dashboard/',
          },
        ],
      },
    ],
  },
]

export const PRICING_LINK = { label: 'Pricing', href: '/pricing/' }
