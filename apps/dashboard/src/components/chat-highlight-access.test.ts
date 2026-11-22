import { describe, expect, it } from 'vitest'
import { canHighlight } from './chat'

describe('canHighlight', () => {
  it('is the owner at their own PC, and nobody else', () => {
    expect(canHighlight({ offline: false, isMod: false, cloud: false })).toBe(true)
    expect(canHighlight({ offline: true, isMod: false, cloud: false })).toBe(false)
    expect(canHighlight({ offline: false, isMod: true, cloud: false })).toBe(false)
    // The cloud dashboard has no highlight route: asking would 404.
    expect(canHighlight({ offline: false, isMod: false, cloud: true })).toBe(false)
  })
})
