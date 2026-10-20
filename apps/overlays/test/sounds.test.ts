import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_SOUNDS, LEGACY_SOUND } from '@ferrocast/api/design'
import type { BuiltinSound } from '@ferrocast/api/types'
import { builtinSoundMs, builtinSoundUrl } from '../src/design/sounds'

const dir = join(import.meta.dirname, '../src/design/sounds')

describe('built-in sound files', () => {
  it('every sound the picker offers has its own small file', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.mp3'))
    for (const s of BUILTIN_SOUNDS) {
      if (s === 'none') continue
      expect(files).toContain(`${s}.mp3`)
      const kb = statSync(join(dir, `${s}.mp3`)).size / 1024
      expect(kb, s).toBeGreaterThan(2)
      expect(kb, s).toBeLessThan(60)
      expect(builtinSoundUrl(s)).toMatch(new RegExp(`${s}.*\\.mp3$`))
      expect(builtinSoundMs(s)).toBeGreaterThan(400)
      expect(builtinSoundMs(s)).toBeLessThan(3000)
    }
  })

  it('a retired id plays the file of the sound that replaced it', () => {
    for (const [old, now] of Object.entries(LEGACY_SOUND))
      expect(builtinSoundUrl(old as BuiltinSound)).toBe(builtinSoundUrl(now))
  })

  it('none, and an id from a newer Ferrocast, play nothing', () => {
    expect(builtinSoundUrl('none')).toBeNull()
    expect(builtinSoundMs('none')).toBe(0)
    expect(builtinSoundUrl('airhorn' as BuiltinSound)).toBeNull()
  })
})
