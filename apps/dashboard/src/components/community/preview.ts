// What the overlay editor shows in poll and giveaway widgets: the real ones when they
// exist, otherwise a sample, so the streamer can place and size them before going live.

import type { GiveawayCard, GiveawayView, PollView } from '@ferrocast/api'

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
