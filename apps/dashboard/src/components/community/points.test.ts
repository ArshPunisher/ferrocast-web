import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry } from '@ferrocast/api'
import { withNewBalance } from './points'

const a = {
  platform: 'twitch',
  user_id: '1',
  display_name: 'A',
  points: 10,
  rank: 1,
} as LeaderboardEntry
const b = {
  platform: 'twitch',
  user_id: '2',
  display_name: 'B',
  points: 5,
  rank: 2,
} as LeaderboardEntry

describe('a finished points change', () => {
  it('updates the person still being edited', () => {
    expect(withNewBalance(a, a, 99)).toEqual({ ...a, points: 99 })
  })
  it('does not bring back an editor that was left', () => {
    expect(withNewBalance(null, a, 99)).toBeNull()
  })
  it('does not replace another person who was picked meanwhile', () => {
    expect(withNewBalance(b, a, 99)).toBe(b)
  })
})
