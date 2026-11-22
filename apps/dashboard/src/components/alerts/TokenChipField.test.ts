import { describe, expect, it } from 'vitest'
import { insertTokenAt } from './TokenChipField'

describe('insertTokenAt', () => {
  it('inserts at the caret and over a selection', () => {
    expect(insertTokenAt('Hello !', 6, 6, '{name}', 40)).toBe('Hello {name}!')
    expect(insertTokenAt('Hello XXX!', 6, 9, '{name}', 40)).toBe('Hello {name}!')
  })
  it('refuses a token that does not fit instead of cutting it', () => {
    expect(insertTokenAt('abcdefghij', 5, 5, '{name}', 10)).toBeNull()
    expect(insertTokenAt('abcd', 4, 4, '{name}', 10)).toBe('abcd{name}')
  })
})
