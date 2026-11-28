// Ferrocast against Streamlabs, feature by feature. No prices: the page is about what each
// one does. Streamlabs facts were read from streamlabs.com on 27 November 2026.

export type Mark = 'yes' | 'no' | 'partial'
export interface VsCell {
  mark: Mark
  text: string
}
export interface VsRow {
  feature: string
  streamlabs: VsCell
  ferrocast: VsCell
}
export interface VsGroup {
  title: string
  rows: VsRow[]
}

const y = (text: string): VsCell => ({ mark: 'yes', text })
const n = (text: string): VsCell => ({ mark: 'no', text })
const part = (text: string): VsCell => ({ mark: 'partial', text })

export const VS_CHECKED = '27 November 2026'

export const VS_GROUPS: VsGroup[] = [
  {
    title: 'Go live',
    rows: [
      {
        feature: 'Many platforms at once',
        streamlabs: y(
          'With Ultra, sent from their servers. The free plan sends one horizontal and one upright stream.',
        ),
        ferrocast: y(
          'Twitch, YouTube, Kick, Facebook and up to 8 servers of your own. Free, sent from your PC.',
        ),
      },
      {
        feature: 'Quality per platform',
        streamlabs: n('No.'),
        ferrocast: y('Yes. New in 3.8.0.'),
      },
      {
        feature: 'Landscape and upright together',
        streamlabs: y('Yes.'),
        ferrocast: y('Yes.'),
      },
      {
        feature: 'Guests on camera',
        streamlabs: y('One guest free, up to 11 with Ultra.'),
        ferrocast: y('Up to 8, with a link. No app for them.'),
      },
      {
        feature: 'Clips',
        streamlabs: y('Cross Clip. Free clips carry a watermark.'),
        ferrocast: y('In the app.'),
      },
    ],
  },
  {
    title: 'Chat and engage',
    rows: [
      {
        feature: 'Merged chat',
        streamlabs: y('Yes. Kick and X are read only.'),
        ferrocast: y('Twitch, YouTube and Kick.'),
      },
      { feature: 'Alerts and widgets', streamlabs: y('Yes.'), ferrocast: y('Yes.') },
      {
        feature: 'Polls',
        streamlabs: y('Through Cloudbot.'),
        ferrocast: y('Twitch and YouTube, plus !vote.'),
      },
      {
        feature: 'Text-to-speech',
        streamlabs: y('Through widgets.'),
        ferrocast: y('Offline voices. Reads chat aloud.'),
      },
      {
        feature: 'Chatbot',
        streamlabs: y('Cloudbot, in their cloud.'),
        ferrocast: y('On your PC. A 24/7 cloud bot is in Pro.'),
      },
    ],
  },
  {
    title: 'Earn and own',
    rows: [
      { feature: 'Tip fees', streamlabs: y('No fee.'), ferrocast: y('No cut.') },
      {
        feature: 'Open source',
        streamlabs: part('Streamlabs Desktop is GPL-3.0. Widgets, Cloudbot and tips are not.'),
        ferrocast: y('Yes. GPL-3.0.'),
      },
      {
        feature: 'Where it runs',
        streamlabs: y('In their cloud and a desktop app.'),
        ferrocast: y('On your PC. Cloud mode is optional.'),
      },
    ],
  },
]

export const VS_WINS: { icon: string; title: string; body: string }[] = [
  { icon: 'device-mobile-camera', title: 'A mobile app', body: 'Manage your stream from a phone.' },
  {
    icon: 'cloud-arrow-up',
    title: 'Multistream from their servers',
    body: 'No extra upload from your PC.',
  },
  { icon: 'game-controller', title: 'Xbox and console', body: 'Ultra can stream from a console.' },
  { icon: 'browser', title: 'A browser studio', body: 'Talk Studio runs in a tab.' },
  { icon: 'storefront', title: 'A merch store', body: 'Sell merch from your channel.' },
  { icon: 'film-slate', title: 'Video and podcast editors', body: 'Edit what you recorded.' },
  { icon: 'arrows-left-right', title: 'Switch device mid-stream', body: 'Stream Shift, in Ultra.' },
  {
    icon: 'squares-four',
    title: 'A bigger theme and app library',
    body: 'Thousands of themes and a full app store.',
  },
  { icon: 'headset', title: 'Dedicated support', body: 'Ultra has its own support line.' },
]
