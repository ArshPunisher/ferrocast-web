// What the overlay editor shows in poll and giveaway widgets: the real ones when they
// exist, otherwise a sample, so the streamer can place and size them before going live.

import type { ChatHighlight, Credits, GiveawayCard, GiveawayView, PollView } from '@ferrocast/api'

export const SAMPLE_POLL: PollView = {
  id: 'sample-poll',
  question: 'Which map next?',
  options: [
    { text: 'Ascent', votes: 14 },
    { text: 'Bind', votes: 9 },
    { text: 'Haven', votes: 5 },
  ],
  total: 28,
  started_at: 0,
  ends_at: 0,
  closed: false,
  leaders: [0],
}

export const SAMPLE_GIVEAWAY: GiveawayCard = {
  id: 'sample-giveaway',
  prize: 'A Steam key',
  keyword: '!join',
  open: true,
  entries: 37,
  winner: null,
}

export function giveawayCard(g: GiveawayView): GiveawayCard {
  return {
    id: g.id,
    prize: g.prize,
    keyword: g.keyword,
    open: g.open,
    entries: g.entries,
    winner: g.winners.at(-1) ?? null,
  }
}

export const SAMPLE_CREDITS: Credits = {
  started_at: 0,
  followers: [
    { platform: 'twitch', name: 'LunaLagoon' },
    { platform: 'kick', name: 'neo_tokyo_drift' },
  ],
  subs: [
    { platform: 'twitch', name: 'DesertFoxx', months: 14, gifts: 0 },
    { platform: 'youtube', name: 'Nakamura Ren', months: 6, gifts: 0 },
  ],
  gifters: [{ platform: 'twitch', name: 'GiftGoblin', gifts: 5 }],
  tippers: [
    { platform: 'tips', name: 'Asha', amounts: [{ minor: 50_000, currency: 'INR' }], bits: 0 },
    { platform: 'twitch', name: 'BitBaron', amounts: [], bits: 500 },
  ],
  raiders: [{ platform: 'twitch', name: 'CaptainCozy', viewers: 42 }],
  mods: [{ platform: 'twitch', name: 'mira_exe' }],
}

export const SAMPLE_HIGHLIGHT: ChatHighlight = {
  id: 'sample-highlight',
  event_id: 'sample-chat',
  source_id: null,
  platform: 'twitch',
  actor: {
    platform: 'twitch',
    id: 'mira',
    login: 'mira_exe',
    display_name: 'mira_exe',
    avatar_url: null,
    color: '#9be15d',
    roles: 2,
    badges: [],
    anonymous: false,
  },
  content: {
    text: 'That comeback in the final round was unreal!',
    fragments: [{ type: 'text', text: 'That comeback in the final round was unreal!' }],
  },
  is_action: false,
  pinned_at: 0,
  expires_at: null,
}
