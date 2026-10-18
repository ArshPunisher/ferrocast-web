import { describe, expect, it } from 'vitest'
import { formatBits, qrEncode, qrVersionFor, rsDivisor, rsRemainder } from './qr'

describe('QR encoder', () => {
  it('computes Reed-Solomon codewords like the standard example (1-M "HELLO WORLD")', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
  })

  it('writes the format bits for level M', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010')
    expect(formatBits(5).toString(2).padStart(15, '0')).toBe('100000011001110')
  })

  it('picks the smallest version that fits, up to 10', () => {
    expect(qrVersionFor(14)).toBe(1)
    expect(qrVersionFor(15)).toBe(2)
    expect(qrVersionFor(60)).toBe(4)
    expect(qrVersionFor(213)).toBe(10)
    expect(qrVersionFor(214)).toBeNull()
    expect(() => qrEncode('x'.repeat(300))).toThrow()
  })

  it('draws a square with the three finder patterns and timing lines', () => {
    const q = qrEncode('https://remote.clearcraftlabs.com/app/#pair=K7M2QXABCD')
    expect(q.version).toBe(4)
    expect(q.size).toBe(33)
    expect(q.modules).toHaveLength(33)
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const d = Math.max(Math.abs(x - 3), Math.abs(y - 3))
          expect(q.modules[y0 + y]![x0 + x]).toBe(d !== 2)
        }
    }
    finder(0, 0)
    finder(q.size - 7, 0)
    finder(0, q.size - 7)
    for (let i = 8; i < q.size - 8; i++) {
      expect(q.modules[6]![i]).toBe(i % 2 === 0)
      expect(q.modules[i]![6]).toBe(i % 2 === 0)
    }
    expect(q.modules[q.size - 8]![8]).toBe(true) // the dark module
    expect(qrEncode('same')).toEqual(qrEncode('same'))
  })
})
