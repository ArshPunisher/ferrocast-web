// Ferrocast vs StreamElements vs Streamlabs, as of October 2026. Facts come from the
// owner's research notes (research/01-streamlabs.md, 02-streamelements-and-alternatives.md)
// and the public pages linked in SOURCES. Neutral wording only: what each one does, no
// verdicts. Ferrocast's column describes version 1, which is still being built.

/** `unknown`: not in the vendor's public docs, which is not the same as no. */
export type Mark = 'yes' | 'partial' | 'no' | 'unknown' | 'info'
export interface Cell {
  mark: Mark
  text: string
}
export interface Row {
  topic: string
  ferrocast: Cell
  streamelements: Cell
  streamlabs: Cell
}
export interface Group {
  title: string
  rows: Row[]
}

const c = (mark: Mark, text: string): Cell => ({ mark, text })

export const COMPARE: Group[] = [
  {
    title: 'Where it runs and who owns it',
    rows: [
      {
        topic: 'Where your alerts and overlays run',
        ferrocast: c('yes', 'In the app on your computer, served to OBS locally'),
        streamelements: c('info', 'Cloud: configured on the web, served from StreamElements'),
        streamlabs: c(
          'info',
          'Cloud widgets, used in Streamlabs Desktop, its OBS plugin or any app',
        ),
      },
      {
        topic: 'If the vendor’s servers go down',
        ferrocast: c(
          'yes',
          'Twitch and YouTube keep working; Kick events wait in the relay and replay',
        ),
        streamelements: c('info', 'Widgets depend on StreamElements’ servers'),
        streamlabs: c('info', 'Widgets and Cloudbot depend on Streamlabs’ servers'),
      },
      {
        topic: 'Ownership',
        ferrocast: c('info', 'ClearCraft Labs; GPL-3.0 so anyone can keep it going'),
        streamelements: c('info', 'Razer subsidiary since 31 July 2026'),
        streamlabs: c('info', 'Logitech since 2019'),
      },
      {
        topic: 'Open source',
        ferrocast: c('yes', 'The whole app, GPL-3.0'),
        streamelements: c('no', 'No'),
        streamlabs: c(
          'partial',
          'Streamlabs Desktop is GPL-3.0; widgets, Cloudbot and tips are not',
        ),
      },
    ],
  },
  {
    title: 'Price',
    rows: [
      {
        topic: 'Core tools',
        ferrocast: c('yes', 'Free forever'),
        streamelements: c('yes', 'Free; funded mainly by sponsorships'),
        streamlabs: c('yes', 'Free tier'),
      },
      {
        topic: 'Paid plan',
        ferrocast: c('info', 'Pro (planned): ₹199 a month, cloud extras only'),
        streamelements: c('info', 'None; future fees not announced'),
        streamlabs: c('info', 'Ultra: US$27 a month or US$189 a year'),
      },
    ],
  },
  {
    title: 'Platforms and systems',
    rows: [
      {
        topic: 'Streaming platforms',
        ferrocast: c('info', 'Twitch, YouTube, Kick'),
        streamelements: c('info', 'Twitch, YouTube; Kick for the bot and some alerts'),
        streamlabs: c('info', 'Twitch, YouTube, Kick, Facebook, X and more'),
      },
      {
        topic: 'Desktop systems',
        ferrocast: c('yes', 'macOS, Windows and Linux'),
        streamelements: c('partial', 'Web dashboard; SE.Live plugin is Windows only'),
        streamlabs: c('partial', 'Web dashboard; Streamlabs Desktop for Windows and macOS'),
      },
    ],
  },
  {
    title: 'Alerts and overlays',
    rows: [
      {
        topic: 'Alert variations and custom code',
        ferrocast: c('yes', 'Variations, templates and custom CSS'),
        streamelements: c('yes', 'Variations, custom HTML, CSS and JS widgets'),
        streamlabs: c('yes', 'Variations, custom HTML, CSS and JS'),
      },
      {
        topic: '“Why didn’t this alert fire?” log',
        ferrocast: c('yes', 'Every missed alert gets a reason'),
        streamelements: c('unknown', 'Not documented'),
        streamlabs: c('unknown', 'Not documented'),
      },
      {
        topic: 'TTS approval queue',
        ferrocast: c('yes', 'Off by default; hold and approve each message'),
        streamelements: c('partial', 'TTS available; approval queue not documented'),
        streamlabs: c('partial', 'TTS on tips; approval queue not documented'),
      },
    ],
  },
  {
    title: 'Chat and moderation',
    rows: [
      {
        topic: 'Merged chat across platforms',
        ferrocast: c('yes', 'Twitch, YouTube and Kick, reply to the source'),
        streamelements: c('partial', 'Chat widget; multichat in the Ground Control app'),
        streamlabs: c('yes', 'Merged Chat Box widget'),
      },
      {
        topic: 'Ban on every platform at once',
        ferrocast: c('yes', 'One click, one shared ban list'),
        streamelements: c('no', 'Per platform'),
        streamlabs: c('no', 'Per platform'),
      },
      {
        topic: 'Hate-raid panic mode',
        ferrocast: c('yes', 'One hotkey for every platform'),
        streamelements: c('unknown', 'Not documented'),
        streamlabs: c('unknown', 'Not documented'),
      },
      {
        topic: 'Chatbot',
        ferrocast: c(
          'yes',
          'Runs on your PC; Pro (planned) adds a 24/7 cloud bot for Twitch and Kick',
        ),
        streamelements: c('yes', 'Cloud bot with many modules'),
        streamlabs: c('yes', 'Cloudbot, runs 24/7'),
      },
      {
        topic: 'Loyalty points and song requests',
        ferrocast: c('no', 'Planned for a later version'),
        streamelements: c('yes', 'Yes'),
        streamlabs: c('yes', 'Yes'),
      },
    ],
  },
  {
    title: 'Tips and your data',
    rows: [
      {
        topic: 'Tip page cut',
        ferrocast: c('yes', '0%, paid straight to your own account'),
        streamelements: c('yes', '0%; SE.Pay balances must be withdrawn by 31 Dec 2026'),
        streamlabs: c('yes', '0%; Stripe fees apply'),
      },
      {
        topic: 'Legal name kept off the tip page and alerts',
        ferrocast: c(
          'yes',
          'Yes, on the tip page and in alerts; the provider’s checkout shows your account name',
        ),
        streamelements: c('partial', 'Depends on the payment method'),
        streamlabs: c('partial', 'Depends on the payment method'),
      },
      {
        topic: 'Export your whole setup',
        ferrocast: c('yes', 'Overlays with media, commands and history, open formats'),
        streamelements: c('unknown', 'No full export documented'),
        streamlabs: c('partial', 'Imports from StreamElements; full export not documented'),
      },
    ],
  },
]

export const SOURCES = [
  { label: 'Streamlabs Ultra pricing', url: 'https://streamlabs.com/ultra' },
  { label: 'Streamlabs widgets', url: 'https://streamlabs.com/widgets' },
  { label: 'Streamlabs Cloudbot', url: 'https://streamlabs.com/cloudbot' },
  { label: 'Streamlabs Desktop source (GPL-3.0)', url: 'https://github.com/streamlabs/desktop' },
  {
    label: 'StreamElements custom widgets',
    url: 'https://docs.streamelements.com/overlays/custom-widget',
  },
  {
    label: 'StreamElements chatbot modules',
    url: 'https://docs.streamelements.com/chatbot/modules',
  },
  {
    label: 'SE.Pay requirements',
    url: 'https://support.streamelements.com/hc/en-us/articles/11757149002258-SE-Pay-requirements',
  },
  {
    label: 'Razer acquires StreamElements (Tubefilter)',
    url: 'https://www.tubefilter.com/2026/07/31/gamer-lifestyle-brand-razer-acquires-streamer-platform-streamelements/',
  },
]
