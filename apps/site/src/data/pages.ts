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
      'Ferrocast keeps your overlays, alerts, commands and history on your own computer. Export everything in open formats; a StreamElements importer is coming.',
    ogTitle: 'Your setup lives on your PC',
    ogKicker: 'Own your data',
    crumb: 'Own your data',
    parent: '/features/',
  }),
  download: p({
    path: '/download/',
    title: 'Ferrocast for macOS, Windows and Linux: coming soon',
    description:
      'Ferrocast is coming to macOS (Apple Silicon and Intel), Windows and Linux. See the planned packages and how to hear the moment the first version ships.',
    ogTitle: 'macOS, Windows and Linux',
    ogKicker: 'Download',
    crumb: 'Download',
  }),
  pricing: p({
    path: '/pricing/',
    title: 'Ferrocast pricing: free forever, Pro for cloud extras',
    description:
      'The Ferrocast app is free forever. Pro adds only things that cost us money to run, like a 24/7 cloud bot and sync, priced for India first and billed in INR.',
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
      'What Ferrocast stores and where: your setup stays on your computer, sign-in tokens in your OS keychain, no chat logs in our cloud and no website analytics.',
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
} satisfies Record<string, PageMeta>

export type PageKey = keyof typeof PAGES

/** "/features/alerts/" → "features/alerts", "/" → "home". Used for share image paths. */
export function ogSlug(path: string): string {
  const s = path.replace(/^\/|\/$/g, '')
  return s === '' ? 'home' : s
}
