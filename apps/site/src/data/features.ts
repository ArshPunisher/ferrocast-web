// Feature pages. Each one is a headline, a short intro, grouped capabilities and an
// honest "good to know" list (platform limits, what is planned rather than built).

import type { PageKey } from './pages'

export interface FeatureGroup {
  title: string
  icon: string
  items: { title: string; body: string }[]
}

export interface Feature {
  key: PageKey
  icon: string
  /** Index card line. */
  summary: string
  h1: string
  intro: string
  video?: { name: string; label: string }
  groups: FeatureGroup[]
  notes: string[]
}

export const FEATURES: Feature[] = [
  {
    key: 'alerts',
    icon: 'bell-ringing',
    summary:
      'Follows, subs, bits, Super Chats, raids and tips, each with its own look, and a log that says why one did not play.',
    h1: 'Alerts that show up, and tell you when they didn’t.',
    intro:
      'One alert box for Twitch, YouTube, Kick and your tip page. Build a look per event, add variations for big moments, and test any of it before you go live.',
    video: { name: 'alert-fires', label: 'A sub alert rising onto a stream overlay' },
    groups: [
      {
        title: 'Looks for every moment',
        icon: 'paint-brush',
        items: [
          {
            title: 'Variations with conditions',
            body: 'A gold look for a 12-month sub, a banner for tips over ₹1,000, a different sound on Kick. The most specific match wins.',
          },
          {
            title: 'Templates',
            body: 'Write “{name} subscribed for {months} months!” with filters like upper, title and truncate. Viewer text is always shown as text, never as code.',
          },
          {
            title: 'Sounds, images and video',
            body: 'Upload your own or use the built-in set. Files stay on your computer and are served to OBS locally.',
          },
          {
            title: 'Custom CSS',
            body: 'Every alert accepts your own CSS, scoped to that alert so it can’t break the rest of the overlay.',
          },
        ],
      },
      {
        title: 'Control while you’re live',
        icon: 'sliders-horizontal',
        items: [
          {
            title: 'Test buttons',
            body: 'Fire a sample follow, sub, raid or tip with one click, even before any account is connected.',
          },
          {
            title: 'A real queue',
            body: 'One alert at a time, priority for paid ones. Pause, skip, clear or replay from the dashboard or a hotkey.',
          },
          {
            title: 'No floods after a blip',
            body: 'If your connection drops, old alerts are folded into one summary instead of fifty in a row.',
          },
          {
            title: 'Text-to-speech, held for you',
            body: 'Off by default. When on, messages wait in an approval list with a minimum amount and a length limit.',
          },
        ],
      },
      {
        title: 'Why didn’t it fire?',
        icon: 'magnifying-glass',
        items: [
          {
            title: 'An event log with reasons',
            body: '“Twitch hid this follow.” “Below your ₹100 minimum.” “No rule for Kick raids.” Every missed alert gets a plain answer.',
          },
          {
            title: 'Only real money',
            body: 'Tip alerts play only when a payment has actually settled, so a reversed payment never gets a celebration.',
          },
        ],
      },
    ],
    notes: [
      'Twitch hides some follows from low-trust accounts on purpose. Ferrocast shows them in the log with that reason, but cannot alert on follows Twitch never sends.',
      'Kick events come through the Ferrocast relay and can arrive a few seconds late.',
    ],
  },
  {
    key: 'overlays',
    icon: 'frame-corners',
    summary:
      'Alerts, chat, events, goals, labels and viewer count on one OBS browser source, added in one click.',
    h1: 'Your whole overlay, as one browser source.',
    intro:
      'Lay out alerts, chat, an event list, goals, labels and a combined viewer count on a 1920×1080 canvas. Ferrocast adds it to your current OBS scene for you.',
    video: { name: 'setup-3-clicks', label: 'Adding a Ferrocast overlay to OBS in one click' },
    groups: [
      {
        title: 'Widgets',
        icon: 'squares-four',
        items: [
          {
            title: 'Alert box',
            body: 'Every alert rule, or just the ones you pick for this scene.',
          },
          {
            title: 'Merged chat',
            body: 'Twitch, YouTube and Kick in one column with platform marks, badges and emotes. Hide commands and bots.',
          },
          {
            title: 'Event list',
            body: 'The latest follows, subs, raids and tips, styled to match.',
          },
          {
            title: 'Goals, labels and viewers',
            body: 'Sub and tip goals, “latest follower” style labels, and one viewer count across every platform.',
          },
        ],
      },
      {
        title: 'Made for OBS',
        icon: 'monitor-play',
        items: [
          {
            title: 'Add to OBS in one click',
            body: 'Through the OBS WebSocket. No WebSocket? Copy the URL and follow the three-step guide.',
          },
          {
            title: 'Pauses when hidden',
            body: 'When OBS hides the source, the overlay stops animating and drops its connection until it is shown again.',
          },
          {
            title: 'Light by default',
            body: 'No endless animations, no heavy video alerts unless you choose them, and a low-motion mode for slower PCs.',
          },
          {
            title: 'Five looks to start',
            body: 'Molten, Daylight, Arcade, Minimal and Sticker. Switch the whole overlay at once.',
          },
        ],
      },
      {
        title: 'Safe URLs',
        icon: 'lock-key',
        items: [
          {
            title: 'Private and revocable',
            body: 'Each overlay has its own unguessable URL, blurred in the dashboard. Leaked it on stream? Make a new one in one click.',
          },
          {
            title: 'Overlays can’t make events',
            body: 'The page only shows what Ferrocast sends it, so nobody can fake a $100 alert through your overlay.',
          },
        ],
      },
    ],
    notes: [
      'Importing from StreamElements is planned; its custom HTML widgets will then run in a sandbox.',
    ],
  },
  {
    key: 'chat',
    icon: 'chats-circle',
    summary:
      'Merged chat for Twitch, YouTube and Kick, reply where a message came from, ban everywhere, panic mode.',
    h1: 'One chat. One ban button. Every platform.',
    intro:
      'Read every platform in one list, reply in the right place, and deal with trouble once instead of three times. Moderation is a headline here, not an extra.',
    video: {
      name: 'ban-everywhere',
      label: 'A spammer banned from Twitch, YouTube and Kick with one click',
    },
    groups: [
      {
        title: 'Merged chat',
        icon: 'chat-centered-text',
        items: [
          {
            title: 'Every platform in one list',
            body: 'With platform marks, badges and 7TV, BTTV and FFZ emotes. Built to keep up when a hype moment hits.',
          },
          {
            title: 'Reply to the source',
            body: 'Answer a YouTube message on YouTube and a Kick message on Kick, from the same box.',
          },
          {
            title: 'On your phone too',
            body: 'Mods can open the dashboard on a phone over your local network when you turn that on.',
          },
          { title: 'As an OBS dock', body: 'Keep chat inside OBS as a custom browser dock.' },
        ],
      },
      {
        title: 'Moderation that travels',
        icon: 'shield-check',
        items: [
          {
            title: 'Ban everywhere',
            body: 'One click bans someone on Twitch, YouTube and Kick and puts them on your shared ban list.',
          },
          {
            title: 'Hate-raid panic mode',
            body: 'One hotkey turns on followers-only, slow mode and held new accounts on every platform and pauses alerts and TTS.',
          },
          {
            title: 'Filters',
            body: 'Words with lookalike spellings, links, caps, emote and symbol spam, and “I do commissions” style solicitation.',
          },
          {
            title: 'Viewer notes',
            body: 'A card for each viewer with their history and your private notes, visible to your mods.',
          },
        ],
      },
    ],
    notes: [
      'Each platform has its own limits, for example YouTube timeouts last at most 24 hours. Ferrocast tells you when a platform refuses an action.',
      'Smart filters that learn from your bans are planned for Ferrocast Pro. The rule-based filters above are free.',
    ],
  },
  {
    key: 'bot',
    icon: 'robot',
    summary:
      'Commands, variables, timers and spam filters that speak as your own account or your own bot.',
    h1: 'A chatbot that answers as you.',
    intro:
      'Commands, timers and filters for every platform at once. The bot posts as your account or a bot account you own, so one banned shared bot can never take you down.',
    groups: [
      {
        title: 'Commands and timers',
        icon: 'terminal-window',
        items: [
          {
            title: 'Commands with variables',
            body: '!discord, !specs, !so {target}. Aliases, per-user and global cooldowns, and who can use them.',
          },
          {
            title: 'Timers that read the room',
            body: 'Post every 30 minutes, but only if chat has been active. Never twice on a shared chat.',
          },
          {
            title: 'Per platform or everywhere',
            body: 'Run a command on all three platforms or only where it makes sense.',
          },
        ],
      },
      {
        title: 'Built in, not bolted on',
        icon: 'puzzle-piece',
        items: [
          {
            title: 'Works offline from us',
            body: 'The bot runs in the app on your PC. It works when our servers don’t.',
          },
          {
            title: 'Import your commands (coming)',
            body: 'Planned: bring commands and timers over from StreamElements and Streamlabs.',
          },
          {
            title: 'Same filters as moderation',
            body: 'Spam rules apply to every platform the bot is in.',
          },
        ],
      },
    ],
    notes: [
      'A 24/7 cloud bot that keeps running when your PC is off is planned for Ferrocast Pro, because it costs money to run.',
      'Loyalty points, giveaways and song requests are planned for a later version.',
    ],
  },
  {
    key: 'tips',
    icon: 'hand-coins',
    summary:
      'A tip page paid straight to your own account, with zero cut and your legal name kept off the page.',
    h1: 'Tips that keep your legal name off the page.',
    intro:
      'Your tip page and alerts show only your stream name. Viewers pay straight into your own Razorpay, Stripe or Ko-fi account. We never hold your money and take no cut.',
    groups: [
      {
        title: 'Your money, your account',
        icon: 'wallet',
        items: [
          {
            title: 'Razorpay with UPI',
            body: 'Made for India first: UPI, cards and netbanking through your own Razorpay account.',
          },
          {
            title: 'Stripe and Ko-fi',
            body: 'Connect the provider you already use. Payments land with them, not with us.',
          },
          {
            title: 'Zero cut',
            body: 'Ferrocast takes nothing from tips. The provider charges its usual fees.',
          },
        ],
      },
      {
        title: 'Safer for you',
        icon: 'shield-check',
        items: [
          {
            title: 'No doxxing',
            body: 'Your tip page and alerts show your display name only, never your legal name or email.',
          },
          {
            title: 'Alerts only on settled money',
            body: 'A tip alerts when the payment is captured. Large or first-time tips can wait in a short hold.',
          },
          {
            title: 'Refunds undo the goal',
            body: 'If a payment is refunded or disputed, goals and leaderboards are corrected.',
          },
        ],
      },
    ],
    notes: [
      'Tip pages are hosted by the Ferrocast relay because payment providers need a public address. Payment details stay with the provider.',
      'The payment provider’s checkout and receipt show the name on your provider account. Use a business or brand name there to keep your own name private.',
      'A custom domain and design for your tip page are planned for Ferrocast Pro.',
    ],
  },
  {
    key: 'data',
    icon: 'hard-drives',
    summary:
      'Everything lives on your computer, works without our servers, and exports in open formats.',
    h1: 'Your setup lives on your PC, not on ours.',
    intro:
      'Tools that live in someone else’s cloud vanish when that company changes its mind. Ferrocast keeps your overlays, alerts, commands and history on your own computer.',
    groups: [
      {
        title: 'Works without us',
        icon: 'cloud-slash',
        items: [
          {
            title: 'Local first',
            body: 'Alerts, overlays, chat, the bot and moderation run inside the app. If our servers disappeared, Twitch and YouTube would keep working.',
          },
          {
            title: 'Kick through a relay',
            body: 'Kick only delivers events to a public address, so they pass through our relay. If it is down, Kick events wait and replay.',
          },
          {
            title: 'Never forced to update',
            body: 'Updates never install while you are live, and you can roll back to the previous version in one click.',
          },
        ],
      },
      {
        title: 'Take it with you',
        icon: 'export',
        items: [
          {
            title: 'Export everything',
            body: 'Overlays with their media, alerts, commands, timers and tip history, as JSON and CSV in one file.',
          },
          {
            title: 'Import your old setup (coming)',
            body: 'Planned: from StreamElements and Streamlabs, with a report of what came over and what didn’t.',
          },
          {
            title: 'Backups before changes',
            body: 'Ferrocast snapshots your settings before every update and lets you restore them.',
          },
          {
            title: 'Keys stay in your keychain',
            body: 'Sign-in tokens live in your operating system’s keychain, never in files, exports or logs.',
          },
        ],
      },
    ],
    notes: [
      'Ferrocast is GPL-3.0. The licence will not change, and if we ever close a cloud feature we will give 180 days’ notice and keep export open until the end.',
    ],
  },
]

export const featureByKey = (k: PageKey) => FEATURES.find((f) => f.key === k)
