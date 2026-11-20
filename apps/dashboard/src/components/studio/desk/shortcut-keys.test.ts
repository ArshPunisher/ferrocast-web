import { describe, expect, it } from 'vitest'
import {
  MAX_KEYS,
  addKey,
  joinKeys,
  keysOf,
  removeKey,
  sharedWith,
  usersOf,
  usesKey,
  withKeys,
} from './shortcut-keys'

describe('shortcut keys', () => {
  it('reads and writes several keys for one action', () => {
    expect(keysOf('F9|Alt+R')).toEqual(['F9', 'Alt+R'])
    expect(keysOf('F9')).toEqual(['F9'])
    expect(keysOf(undefined)).toEqual([])
    expect(joinKeys(['F9', 'F9', 'Alt+R'])).toBe('F9|Alt+R')
    expect(joinKeys([])).toBeNull()
    expect(joinKeys(['a', 'b', 'c', 'd', 'e'])).toBe('a|b|c|d')
    expect(MAX_KEYS).toBe(4)
  })

  it('adds, removes and clears keys without touching other actions', () => {
    let h: Record<string, string> = { record: 'F9', undo: 'Cmd+KeyZ' }
    h = addKey(h, 'record', 'Alt+R')
    expect(h).toEqual({ record: 'F9|Alt+R', undo: 'Cmd+KeyZ' })
    h = addKey(h, 'record', 'Alt+R')
    expect(h.record).toBe('F9|Alt+R')
    h = removeKey(h, 'record', 'F9')
    expect(h.record).toBe('Alt+R')
    h = removeKey(h, 'record', 'Alt+R')
    expect('record' in h).toBe(false)
    expect(withKeys({ a: 'F1' }, 'a', null)).toEqual({})
    expect(withKeys({}, 'a', 'F2')).toEqual({ a: 'F2' })
  })

  it('finds who shares a key (both run), and what uses a key', () => {
    const h = { 'mute:Mic': 'F8', 'scene:BRB': 'F8|F7', record: 'F9' }
    expect(usersOf(h, 'F8')).toEqual(['mute:Mic', 'scene:BRB'])
    expect(sharedWith(h, 'mute:Mic')).toEqual({ F8: ['scene:BRB'] })
    expect(sharedWith(h, 'record')).toEqual({})
    expect(usesKey(h, 'scene:BRB', 'F7')).toBe(true)
    expect(usesKey(h, 'record', 'F8')).toBe(false)
  })
})
