import { describe, expect, it } from 'vitest'
import type { Rule } from '@ferrocast/api'
import { ruleProblem, stepWords, whenWords } from './automations-settings'

const base: Rule = {
  id: 'a',
  name: 'A',
  on: true,
  cooldown_s: 10,
  when: { type: 'follow' },
  then: [{ type: 'save_replay' }],
}

describe('automation words', () => {
  it('say the when in a few words', () => {
    expect(whenWords({ type: 'chat', text: ' !clip ', anyone: false })).toBe('!clip in chat')
    expect(whenWords({ type: 'raid', min: 10 })).toBe('A raid of 10+')
    expect(whenWords({ type: 'raid', min: 0 })).toBe('A raid')
    expect(whenWords({ type: 'reward', name: '' })).toBe('Any channel reward')
    expect(whenWords({ type: 'every', minutes: 15 })).toBe('Every 15 min')
    expect(whenWords({ type: 'scene', name: 'BRB' })).toBe('“BRB” on air')
  })
  it('say each step in a few words', () => {
    expect(stepWords({ type: 'scene', name: 'BRB' })).toBe('Scene “BRB”')
    expect(stepWords({ type: 'filter', source: 'Cam', filter: 'Blur', on: false })).toBe('Blur off')
    expect(stepWords({ type: 'record', on: false })).toBe('Stop recording')
    expect(stepWords({ type: 'wait', seconds: 5 })).toBe('Wait 5 s')
  })
})

describe('what a rule still needs', () => {
  it('is nothing for a whole rule', () => {
    expect(ruleProblem(base)).toBeNull()
  })
  it('names the first thing missing', () => {
    expect(ruleProblem({ ...base, name: ' ' })).toMatch(/name/)
    expect(ruleProblem({ ...base, then: [] })).toMatch(/Add a step/)
    expect(ruleProblem({ ...base, when: { type: 'chat', text: '!', anyone: false } })).toMatch(
      /chat command/,
    )
    expect(ruleProblem({ ...base, when: { type: 'scene', name: '' } })).toMatch(/scene/)
    expect(ruleProblem({ ...base, then: [{ type: 'scene', name: '' }] })).toMatch(/scene/)
    expect(ruleProblem({ ...base, then: [{ type: 'show', scene: 'Main', source: '' }] })).toMatch(
      /source/,
    )
    expect(ruleProblem({ ...base, then: [{ type: 'chat', text: '  ' }] })).toMatch(/say/)
  })
})

describe('numbers typed in a rule', () => {
  it('below the least are named before saving', () => {
    expect(ruleProblem({ ...base, cooldown_s: 1 })).toMatch(/3 seconds/)
    expect(ruleProblem({ ...base, when: { type: 'every', minutes: 0 } })).toMatch(/1 minute/)
    expect(ruleProblem({ ...base, then: [{ type: 'wait', seconds: 0 }] })).toMatch(/1 second/)
  })
})
