import { describe, expect, it } from 'vitest'
import {
  MAX_WEIGHT,
  newVariation,
  pick,
  pickWeighted,
  seededRandom,
  select,
  validateRule,
} from '../src/alert'
import { sample } from '../src/samples'
import type { AlertRule, FerroEvent, Variation } from '../src/types'

function rule(weights: number[]): AlertRule {
  const variations: Variation[] = [newVariation('default', '{name}')]
  weights.forEach((w, i) => {
    variations.push({
      ...newVariation(`v${i}`, '{name}'),
      condition: { type: 'months_at_least', months: 1 },
      priority: 5,
      weight: w,
    })
  })
  return {
    id: 'r',
    name: 'r',
    enabled: true,
    kinds: ['subscription'],
    platforms: [],
    interrupt: false,
    variations,
  }
}
function subEvent(months: number): FerroEvent {
  const e = sample('subscription', 'twitch', 0) as FerroEvent
  e.origin = 'live'
  if (e.kind.type === 'subscription') e.kind.months = months
  return e
}
function counts(r: AlertRule, seed: number, n: number): Record<string, number> {
  const rand = seededRandom(seed)
  const out: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const id = pick(r, subEvent(2), rand)!.id
    out[id] = (out[id] ?? 0) + 1
  }
  return out
}

describe('weighted variations', () => {
  it('follows the weights over many seeded draws', () => {
    const c = counts(rule([1, 3]), 7, 20_000)
    expect(Math.abs((c.v1 ?? 0) / 20_000 - 0.75)).toBeLessThan(0.02)
  })
  it('is repeatable for one seed', () => {
    const r = rule([1, 1, 1])
    expect(counts(r, 42, 300)).toEqual(counts(r, 42, 300))
  })
  it('never picks a zero weight beside a weighted peer', () => {
    expect(counts(rule([0, 2, 0]), 1, 500)).toEqual({ v1: 500 })
  })
  it('treats all-zero as equal chances (the alert still shows)', () => {
    const c = counts(rule([0, 0]), 3, 4_000)
    expect(Object.keys(c).sort()).toEqual(['v0', 'v1'])
    expect(Math.abs((c.v0 ?? 0) / 4_000 - 0.5)).toBeLessThan(0.05)
  })
  it('one variation is always picked, whatever its weight', () => {
    for (const w of [0, 1, MAX_WEIGHT]) expect(counts(rule([w]), 9, 20)).toEqual({ v0: 20 })
  })
  it('splits equal weights at a tie evenly', () => {
    const c = counts(rule([1, 1]), 11, 10_000)
    expect(Math.abs((c.v0 ?? 0) / 10_000 - 0.5)).toBeLessThan(0.03)
  })
  it('weight never beats a higher priority', () => {
    const r = rule([1, 1])
    r.variations[1]!.priority = 9
    r.variations[1]!.weight = 0
    r.variations[2]!.weight = 1000
    expect(counts(r, 2, 100)).toEqual({ v0: 100 })
  })
  it('falls back to the default look when nothing matches', () => {
    expect(pick(rule([5]), subEvent(0), seededRandom(1))!.id).toBe('default')
  })
  it('select passes the generator through', () => {
    const rules = [rule([1, 1])]
    const a = select(rules, subEvent(2), seededRandom(4))!.variation.id
    expect(select(rules, subEvent(2), seededRandom(4))!.variation.id).toBe(a)
  })
  it('pickWeighted of nothing is null', () => {
    expect(pickWeighted([], seededRandom(1))).toBeNull()
  })
  it('validates the weight range', () => {
    const r = rule([1])
    expect(validateRule(r)).toBeNull()
    r.variations[1]!.weight = MAX_WEIGHT + 1
    expect(validateRule(r)).toMatch(/weight/)
    r.variations[1]!.weight = -1
    expect(validateRule(r)).toMatch(/weight/)
    r.variations[1]!.weight = 1.5
    expect(validateRule(r)).toMatch(/weight/)
    r.variations[1]!.weight = MAX_WEIGHT
    expect(validateRule(r)).toBeNull()
  })
})
