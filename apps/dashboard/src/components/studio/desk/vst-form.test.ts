import { describe, expect, it } from 'vitest'
import { vstKey, vstLabel, vstState } from './vst-form'

describe('VST plugin filter', () => {
  it('names each plugin by its bundle and class, with its maker', () => {
    const p = {
      path: '/Library/Audio/Plug-Ins/VST3/Warm.vst3',
      cid: 'AB'.repeat(16),
      name: 'Warm',
      vendor: 'Ana',
      kinds: 'Fx',
    }
    expect(vstKey(p)).toBe(`${p.path}|${p.cid}`)
    expect(vstLabel(p)).toBe('Warm · Ana')
    expect(vstLabel({ ...p, vendor: '' })).toBe('Warm')
  })

  it('says how it is doing in a word', () => {
    expect(vstState(null, false)).toBeNull()
    expect(vstState(null, true)).toBe('Starting…')
    expect(vstState({ running: true, problem: null, changed: false }, true)).toBe('Running')
    // A problem is said in its own red strip instead.
    expect(vstState({ running: false, problem: 'it crashed', changed: false }, true)).toBeNull()
  })
})
