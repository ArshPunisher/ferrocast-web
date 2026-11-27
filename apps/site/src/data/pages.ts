// SEO facts for every page: one entry each, so titles and descriptions stay unique and the
// Open Graph image endpoint can render a card per page. Titles ≤ 60 characters,
// descriptions 120 to 160 (checked by e2e/seo.spec.ts).

export interface PageMeta {
  path: string
  title: string
  description: string
  /** Large text on the share image. */
  ogTitle: string
  /** Small line above it. */
  ogKicker: string
  /** Breadcrumb trail label (subpages). */
  crumb: string
  parent?: string
}

const p = (m: PageMeta) => m

export const PAGES = {
  home: p({
    path: '/',
    title: 'Ferrocast: free stream alerts, chat and mod tools',
    description:
      'Free, open-source alerts, overlays, merged chat, a chatbot and one-click bans for Twitch, YouTube and Kick. Runs on your PC, so it keeps working.',
    ogTitle: 'Stream tools that run on your PC',
    ogKicker: 'Free and open source',
    crumb: 'Home',
  }),
  features: p({
    path: '/features/',
    title: 'Ferrocast features: alerts, overlays, chat, bot, tips',
    description:
      'Everything Ferrocast does for Twitch, YouTube and Kick streamers: alerts, OBS overlays, merged chat, cross-platform moderation, a chatbot and tips.',
    ogTitle: 'Everything in one free app',
    ogKicker: 'Features',
    crumb: 'Features',
  }),
  alerts: p({
    path: '/features/alerts/',
    title: 'Stream alerts that explain themselves | Ferrocast',
    description:
      'Follow, sub, bits, Super Chat, raid and tip alerts with variations, sounds and test buttons, plus a log that tells you why an alert did not fire.',
    ogTitle: 'Alerts that tell you why',
    ogKicker: 'Features',
    crumb: 'Alerts',
    parent: '/features/',
  }),
  overlays: p({
    path: '/features/overlays/',
    title: 'OBS overlays in one browser source | Ferrocast',
    description:
      'Alerts, chat, event list, goals, labels and viewer count on one 1920×1080 overlay. Add it to OBS in one click, keep the URL private, revoke it anytime.',
    ogTitle: 'One overlay, one click into OBS',
    ogKicker: 'Features',
    crumb: 'Overlays',
    parent: '/features/',
  }),
  chat: p({
    path: '/features/chat-moderation/',
    title: 'Merged chat and cross-platform moderation | Ferrocast',
    description:
      'Read Twitch, YouTube and Kick chat in one list, reply where a message came from, and ban someone on every platform at once. Panic mode included.',
    ogTitle: 'One ban. Every platform.',
    ogKicker: 'Chat and moderation',
    crumb: 'Chat and moderation',
    parent: '/features/',
  }),
  bot: p({
    path: '/features/bot/',
    title: 'A chatbot that runs as your own account | Ferrocast',
    description:
      'Commands, variables, timers and spam filters for Twitch, YouTube and Kick. The bot speaks as you or your own bot account, never a shared one.',
    ogTitle: 'Commands, timers, filters',
    ogKicker: 'Chatbot',
    crumb: 'Bot',
    parent: '/features/',
  }),
  tips: p({
    path: '/features/tips/',
    title: 'Tips that keep your legal name off the page | Ferrocast',
    description:
      'A tip page paid straight into your own Razorpay (UPI), Stripe or Ko-fi account. Zero cut, alerts only on settled payments, legal name off the page.',
    ogTitle: 'Your legal name stays off the page',
    ogKicker: 'Tips',
    crumb: 'Tips',
    parent: '/features/',
  }),
  data: p({
    path: '/features/own-your-data/',
    title: 'Own your setup: local-first and exportable | Ferrocast',
    description:
      'Ferrocast keeps your overlays, alerts, commands and history on your own computer. Export it all in open formats, and import from StreamElements.',
    ogTitle: 'Your setup lives on your PC',
    ogKicker: 'Own your data',
    crumb: 'Own your data',
    parent: '/features/',
  }),
  download: p({
    path: '/download/',
    title: 'Download Ferrocast: beta for macOS, Windows and Linux',
    description:
      'Download the Ferrocast beta for macOS, Windows and Linux, with install notes and checksums. Version 1 comes next, free and open source like the beta.',
    ogTitle: 'macOS, Windows and Linux',
    ogKicker: 'Download',
    crumb: 'Download',
  }),
  pricing: p({
    path: '/pricing/',
    title: 'Ferrocast pricing: free forever, Pro for cloud extras',
    description:
      'The Ferrocast app is free forever. Pro adds only things that cost us money to run, like a 24/7 cloud bot and backups, priced for India first and billed in INR.',
    ogTitle: 'Free stays free',
    ogKicker: 'Pricing',
    crumb: 'Pricing',
  }),
  compare: p({
    path: '/compare/',
    title: 'Ferrocast vs StreamElements vs Streamlabs',
    description:
      'A factual side-by-side of Ferrocast, StreamElements and Streamlabs as of October 2026: where each runs, pricing, platforms, moderation, tips and export.',
    ogTitle: 'How Ferrocast compares',
    ogKicker: 'Compare',
    crumb: 'Compare',
  }),
  dashboard: p({
    path: '/web-dashboard/',
    title: 'Open your Ferrocast dashboard in a browser',
    description:
      'Your Ferrocast dashboard runs on your own PC. Open it in any browser in one click from the app, with no account or password, and on your phone over Wi-Fi.',
    ogTitle: 'Your dashboard, in any browser',
    ogKicker: 'Dashboard',
    crumb: 'Dashboard',
  }),
  faq: p({
    path: '/faq/',
    title: 'Ferrocast FAQ: free, offline, platforms and tips',
    description:
      'Answers about Ferrocast: is it really free, how it is funded, does it work offline, which platforms it supports, why there is no TikTok, and how tips work.',
    ogTitle: 'Questions, answered',
    ogKicker: 'FAQ',
    crumb: 'FAQ',
  }),
  start: p({
    path: '/docs/getting-started/',
    title: 'Getting started with Ferrocast in three clicks',
    description:
      'Install Ferrocast, connect Twitch, YouTube or Kick, pick a look and add your overlay to OBS. Then test an alert and learn the panic mode hotkey.',
    ogTitle: 'Set up in three clicks',
    ogKicker: 'Getting started',
    crumb: 'Getting started',
  }),
  storeSubmit: p({
    path: '/docs/submit-to-store/',
    title: 'Submit a theme to the Ferrocast Store',
    description:
      'Package and submit themes, sandboxed alerts, widgets, overlays or shaders to the signed Ferrocast Community Store via a reviewed pull request.',
    ogTitle: 'Submit to the Community Store',
    ogKicker: 'Creator guide',
    crumb: 'Submit to store',
  }),
  api: p({
    path: '/docs/api/',
    title: 'Ferrocast local API & WebSocket reference',
    description:
      'Reference for the Ferrocast local REST API (OpenAPI 3.1), live WebSocket frames (AsyncAPI 3.0), scoped API keys, rate limits, and obs-websocket v5.',
    ogTitle: 'Local REST & WebSocket API',
    ogKicker: 'Developer docs',
    crumb: 'API reference',
    parent: '/docs/getting-started/',
  }),
  terms: p({
    path: '/terms/',
    title: 'Terms of service | Ferrocast',
    description:
      'The terms for using the Ferrocast app, website and the optional Ferrocast Pro subscription, offered by ClearCraft Labs and billed in INR through Razorpay.',
    ogTitle: 'Terms of service',
    ogKicker: 'Legal',
    crumb: 'Terms',
  }),
  privacy: p({
    path: '/privacy/',
    title: 'Privacy policy | Ferrocast',
    description:
      'What Ferrocast stores and where: your setup and sign-in tokens stay private on your computer, no chat logs in our cloud and no website analytics.',
    ogTitle: 'Privacy policy',
    ogKicker: 'Legal',
    crumb: 'Privacy',
  }),
  refunds: p({
    path: '/refunds/',
    title: 'Refund and cancellation policy | Ferrocast',
    description:
      'How to cancel Ferrocast Pro, when you get a refund, how long refunds take through Razorpay, and what happens to your data when a subscription ends.',
    ogTitle: 'Refunds and cancellation',
    ogKicker: 'Legal',
    crumb: 'Refunds',
  }),
  contact: p({
    path: '/contact/',
    title: 'Contact ClearCraft Labs | Ferrocast',
    description:
      'Reach the people who build Ferrocast: support, billing and refunds, privacy requests, security reports and the grievance officer for users in India.',
    ogTitle: 'Talk to the team',
    ogKicker: 'Contact',
    crumb: 'Contact',
  }),
  multistream: p({
    path: '/features/multistream/',
    title: 'Free multistreaming to every platform | Ferrocast',
    description:
      'Go live on Twitch, YouTube, Kick and Facebook at once, plus up to 8 servers of your own. Free, no limits on streams, sent from your PC.',
    ogTitle: 'One stream. Every platform.',
    ogKicker: 'Multistream',
    crumb: 'Multistream',
    parent: '/features/',
  }),
  verticalDual: p({
    path: '/features/vertical-dual-output/',
    title: 'Vertical and horizontal live output | Ferrocast',
    description:
      'Send a landscape picture and an upright one at the same time from one Studio. Each destination picks its own canvas, so Shorts and your channel both fit.',
    ogTitle: 'Wide and tall, live together',
    ogKicker: 'Vertical + horizontal',
    crumb: 'Vertical + horizontal',
    parent: '/features/',
  }),
  widgets: p({
    path: '/features/widgets/',
    title: 'Stream overlays and widgets for OBS | Ferrocast',
    description:
      'Alerts, chat, goals, labels, viewer count and an event list on one overlay. Add it to OBS in one click, keep the link private and revoke it any time.',
    ogTitle: 'Every widget, one browser source',
    ogKicker: 'Overlays and widgets',
    crumb: 'Widgets',
    parent: '/features/',
  }),
  useGaming: p({
    path: '/use-cases/gaming/',
    title: 'Stream tools for gaming | Ferrocast',
    description:
      'Put alerts, chat and goals over your game, send an upright copy to Shorts, and save clips. Free, open source and running on your own PC.',
    ogTitle: 'Built for gaming',
    ogKicker: 'Use case',
    crumb: 'Gaming',
  }),
  useChatting: p({
    path: '/use-cases/just-chatting/',
    title: 'Stream tools for just chatting | Ferrocast',
    description:
      'Read Twitch, YouTube and Kick chat in one list, run polls, read messages aloud and bring on guests. Free, open source and running on your PC.',
    ogTitle: 'Built for talking',
    ogKicker: 'Use case',
    crumb: 'Just chatting',
  }),
  useIrl: p({
    path: '/use-cases/irl/',
    title: 'Stream tools for IRL streams | Ferrocast',
    description:
      'Run Ferrocast on a laptop and keep chat, alerts and one-click bans working wherever you stream from. Free and open source, no mobile app needed.',
    ogTitle: 'Built for the road',
    ogKicker: 'Use case',
    crumb: 'IRL',
  }),
  vs: p({
    path: '/vs-streamlabs/',
    title: 'Ferrocast vs Streamlabs: features side by side',
    description:
      'What Ferrocast and Streamlabs each do for streamers, feature by feature, and what Streamlabs has that Ferrocast does not. Checked 27 November 2026.',
    ogTitle: 'Ferrocast vs Streamlabs',
    ogKicker: 'Compare',
    crumb: 'vs Streamlabs',
  }),
} satisfies Record<string, PageMeta>

export type PageKey = keyof typeof PAGES

/** "/features/alerts/" → "features/alerts", "/" → "home". Used for share image paths. */
export function ogSlug(path: string): string {
  const s = path.replace(/^\/|\/$/g, '')
  return s === '' ? 'home' : s
}
