// FAQ answers. Plain text only: the same strings feed the page and the FAQPage JSON-LD.

export interface QA {
  q: string
  a: string
}
export interface FaqGroup {
  title: string
  items: QA[]
}

export const FAQ: FaqGroup[] = [
  {
    title: 'Free and open source',
    items: [
      {
        q: 'Is Ferrocast really free?',
        a: 'Yes. The desktop app is free and open source under GPL-3.0, with every feature that runs on your computer: alerts, overlays, merged chat, moderation, the bot, tips and text-to-speech. There is no trial and no limit on streams.',
      },
      {
        q: 'How is Ferrocast paid for?',
        a: 'By Ferrocast Pro, an optional subscription. It sells only things that run on our servers and cost us money, such as a bot that keeps going when your PC is off. Buy it in the app under Settings › Pro. We do not sell sponsorships, take a cut of tips or show ads.',
      },
      {
        q: 'Will free features move behind Pro later?',
        a: 'No. Nothing that is free today will become paid. The app is GPL-3.0, so its features cannot be taken back, and Pro only adds server-side extras.',
      },
      {
        q: 'What does the GPL-3.0 licence mean for me?',
        a: 'You can use Ferrocast for anything, read the source, change it and share your changes. Anyone who ships a modified version must share their source too, which stops a closed rebrand of the app.',
      },
    ],
  },
  {
    title: 'How it works',
    items: [
      {
        q: 'Does Ferrocast work offline or if your servers go down?',
        a: 'Alerts, overlays, chat, the bot and moderation run on your computer, so Twitch and YouTube keep working without our servers. Kick only sends events to a public address, so Kick events pass through our relay; if it is down they wait and replay when it is back.',
      },
      {
        q: 'Which platforms does Ferrocast support?',
        a: 'Twitch, YouTube and Kick, all at once if you multistream. Tips come from Razorpay (including UPI), Stripe and Ko-fi. Ferrocast works with OBS Studio and any app that has a browser source.',
      },
      {
        q: 'Why is there no TikTok support?',
        a: 'TikTok LIVE has no official API for events or chat. Tools that support it rely on unofficial methods that break several times a year and can put your account at risk, so Ferrocast does not support TikTok.',
      },
      {
        q: 'Will it run on Mac and Linux?',
        a: 'Yes. Ferrocast is built for macOS (Apple Silicon and Intel), Windows and Linux, including Wayland and ARM64 Linux.',
      },
      {
        q: 'How do I add Ferrocast to OBS?',
        a: 'Click Add to OBS in the dashboard and Ferrocast creates the browser source in your current scene through the OBS WebSocket. You can also copy the overlay URL and add it as a Browser Source at 1920 by 1080.',
      },
    ],
  },
  {
    title: 'Your data and your money',
    items: [
      {
        q: 'Is my data uploaded anywhere?',
        a: 'Your overlays, alerts, commands and history stay on your computer, and sign-in tokens are stored privately on your computer, never in exports or logs. Our relay does three jobs: it receives Kick events, handles Kick sign-in (your Kick tokens pass through it but are not stored) and hosts tip pages. Kick events, including chat, and tip notices wait on the relay only while your app is offline, for up to 7 days, and are then deleted. Apart from short technical logs that never contain chat, nothing else is kept. If you sign in and use cloud mode, the relay keeps your cloud setup (overlays, alert rules, designs, bot settings and the media you upload) so it runs without your PC, and keeps no chat history. If you use Pro, the relay also keeps what each Pro feature needs to run, and no chat history. The privacy policy lists every item.',
      },
      {
        q: 'How do tips work, and will tippers see my legal name?',
        a: 'Viewers pay through your own Razorpay, Stripe or Ko-fi account, so the money never touches us and we take no cut. Your legal name is never shown on your tip page or in alerts, only your stream name. The payment provider’s checkout and receipt show the name on your provider account, so use a business or brand name there to keep your own private. Alerts play only once a payment has settled.',
      },
      {
        q: 'Can I move my setup from StreamElements or Streamlabs?',
        a: 'Yes. From StreamElements, paste your JWT token and Ferrocast brings over your custom commands, timers, loyalty points balances, points settings and tip history. It only reads, and never saves the token. From Streamlabs, which has no way for other apps to read your Cloudbot, it reads the files you export: Streamlabs Chatbot points (CSV or Excel) and tip history. Viewers are matched by their login or account id, never by display name; YouTube balances that come with only a name are listed for you to add by hand. You see a preview first, choose whether to keep or replace anything you already have, and get a report of what came over and what didn’t. Overlays and custom widgets don’t come over; you rebuild those in Ferrocast.',
      },
      {
        q: 'Does Ferrocast use AI?',
        a: 'The free app doesn’t: filters follow the rules you set. Pro’s smart features (smart moderation, smart replies and recaps) ask a language model on Cloudflare Workers AI, with Google Gemini as a backup, and only suggest: you decide what happens. Ferrocast voices are spoken by Google Cloud Text-to-Speech. Ferrocast never posts in your chat on its own and never talks to your audience.',
      },
    ],
  },
  {
    title: 'Ferrocast Pro',
    items: [
      {
        q: 'What is in Ferrocast Pro?',
        a: 'Things that run on our servers. YouTube from the cloud: your YouTube chat and bot keep running with your PC off, or with no PC. Smart moderation, a second look at doubtful chat in English, Hindi and Hinglish, where you decide and can undo. Smart replies from facts you approve, and a written recap after each stream. A year of stream insights (free accounts keep 30 days). A 24/7 cloud bot for the setup in your desktop app (cloud mode’s own bot for Twitch and Kick is free), your dashboard on your phone for you and your mods, Ferrocast voices, a Discord bot, cloud backups, an optional weekly email, and tip branding with a goal.',
      },
      {
        q: 'Can I buy Pro now?',
        a: 'Yes. Buy it in the app under Settings › Pro: ₹199 a month or ₹1,999 a year. Everything in the free app works without it.',
      },
      {
        q: 'Will Pro ever post to my audience?',
        a: 'No. Pro never adds messages to your chat and never puts our name on your overlays or tip page. The cloud bot only sends the commands, timers and replies you wrote, from your own account or your own bot account.',
      },
      {
        q: 'What happens when Pro ends?',
        a: 'Cloud work stops within the hour and the free app carries on as before. We keep your Pro data for 30 days so you can download your backups and history, then delete it. Buy Pro again within those 30 days and you keep it all. Discord roles the bot gave are removed when Pro ends.',
      },
      {
        q: 'What if you close a cloud feature?',
        a: 'We give at least 180 days’ notice, keep export open until the end and refund unused prepaid time. The app and the relay are open source under GPL-3.0, so anyone can keep running them.',
      },
    ],
  },
]

export const ALL_QA: QA[] = FAQ.flatMap((g) => g.items)
