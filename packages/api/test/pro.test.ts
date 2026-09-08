import { describe, expect, it } from 'vitest'
import { rupeesFromPaise } from '../src/pro'

describe('rupeesFromPaise', () => {
  it('shows whole rupees without paise', () => {
    expect(rupeesFromPaise(19900)).toBe('₹199')
    expect(rupeesFromPaise(199900)).toBe('₹1,999')
  })

  it('keeps paise when the price is not a whole rupee', () => {
    expect(rupeesFromPaise(19950)).toBe('₹199.50')
  })
})
