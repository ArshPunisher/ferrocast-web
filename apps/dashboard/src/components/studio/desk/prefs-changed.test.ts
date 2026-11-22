import { describe, expect, it } from 'vitest'
import { prefsChanged } from './settings'

describe('prefsChanged', () => {
  it('records the first look without calling it a change (cached preferences are not newer)', () => {
    // The cache still says 6000; the fresh read said 5500. Seeing the cache first is no update.
    expect(prefsChanged(null, 'cached-6000')).toEqual({ changed: false, seen: 'cached-6000' })
  })
  it('calls a later different signature a change, and the same one nothing', () => {
    expect(prefsChanged('a', 'b')).toEqual({ changed: true, seen: 'b' })
    expect(prefsChanged('b', 'b')).toEqual({ changed: false, seen: 'b' })
  })
})
