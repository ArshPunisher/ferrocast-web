import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SOUNDS,
  LEGACY_SOUND,
  SOUND_GROUPS,
  SOUND_LABEL,
  SUGGESTED_SOUND,
  isBuiltinSound,
  looksFor,
  newAlertDesign,
  resolveSound,
  withSuggestedSounds,
} from '../src/design'
import { DEFAULT_KIND_SOUND, defaultRules, ruleBuiltinSound } from '../src/alert'
import type { Design, DesignVariation, EventKey } from '../src/types'

describe('built-in sounds', () => {
  it('ships both sets and Sparkle classic, grouped for the picker', () => {
    expect(SOUND_GROUPS.map((g) => g.label)).toEqual(['Crystal', 'Felt', 'Classic'])
    expect(SOUND_GROUPS[0]?.sounds).toHaveLength(8)
    expect(SOUND_GROUPS[1]?.sounds).toHaveLength(8)
    expect(BUILTIN_SOUNDS).toContain('sparkle_classic')
    expect(BUILTIN_SOUNDS[0]).toBe('none')
    // The retired ones aren't offered any more.
    for (const old of ['chime', 'coin', 'whoosh', 'boing', 'bass'] as const)
      expect(BUILTIN_SOUNDS).not.toContain(old)
  })

  it('plays the closest new sound for every retired id, so no saved alert goes quiet', () => {
    expect(LEGACY_SOUND).toEqual({
      chime: 'glint',
      coin: 'tally',
      whoosh: 'lift',
      boing: 'droplet',
      bass: 'ember',
    })
    expect(resolveSound('chime')).toBe('glint')
    expect(resolveSound('sparkle')).toBe('sparkle')
    expect(resolveSound('none')).toBe('none')
    expect(SOUND_LABEL.bass).toBe('Ember')
    expect(isBuiltinSound('coin')).toBe(true)
    expect(isBuiltinSound('airhorn')).toBe(false)
    expect(isBuiltinSound(3)).toBe(false)
  })

  it('reads a rule’s built-in sound, and nothing else', () => {
    expect(ruleBuiltinSound('builtin:glint')).toBe('glint')
    expect(ruleBuiltinSound('01hzsound')).toBeNull()
    expect(ruleBuiltinSound(null)).toBeNull()
    expect(ruleBuiltinSound('builtin:')).toBeNull()
    expect(ruleBuiltinSound('builtin:../x')).toBeNull()
  })
})

describe('default sounds (owner, 20 Oct)', () => {
  it('a new install’s rules each start with their kind’s sound (core::alert::default_sound)', () => {
    const rules = defaultRules()
    const sound = (id: string) => rules.find((r) => r.id === id)?.variations[0]?.sound
    expect(sound('follow')).toBe('builtin:glint')
    expect(sound('sub')).toBe('builtin:cascade')
    expect(sound('gift')).toBe('builtin:bloom')
    expect(sound('bits')).toBe('builtin:tally')
    expect(sound('superchat')).toBe('builtin:tally')
    expect(sound('tip')).toBe('builtin:tally')
    expect(sound('raid')).toBe('builtin:lift')
    expect(sound('redeem')).toBe('builtin:pebble')
    for (const r of rules) for (const k of r.kinds) expect(DEFAULT_KIND_SOUND[k]).toBeTruthy()
  })

  it('a new alert design starts with each event’s suggested sound', () => {
    const d = newAlertDesign('Mine')
    for (const [key, s] of Object.entries(SUGGESTED_SOUND))
      expect(looksFor(d, key as EventKey)[0]?.look.sound.builtin).toBe(s)
  })

  it('"Use suggested sounds" keeps own files, gives big amounts Bloom, changes nothing else', () => {
    const d = newAlertDesign('Mine')
    if (d.kind !== 'alert') throw new Error('alert design')
    const tip = d.content.events.tip!.variations[0]!
    const big: DesignVariation = {
      ...structuredClone(tip),
      id: 'tip-big',
      condition: { type: 'amount_at_least', value: 1000, currency: null },
    }
    d.content.events.tip = { variations: [tip, big] }
    d.content.events.follow!.variations[0]!.look.sound = {
      ref: '01hzsound',
      builtin: 'none',
      volume: 40,
    }
    d.content.events.raid!.variations[0]!.look.sound.builtin = 'chime'
    d.content.events.raid!.variations[0]!.look.sound.volume = 33
    const out = withSuggestedSounds(d) as Extract<Design, { kind: 'alert' }>
    expect(out.content.events.follow!.variations[0]!.look.sound).toEqual({
      ref: '01hzsound',
      builtin: 'none',
      volume: 40,
    })
    expect(out.content.events.tip!.variations.map((v) => v.look.sound.builtin)).toEqual([
      'tally',
      'bloom',
    ])
    expect(out.content.events.raid!.variations[0]!.look.sound).toMatchObject({
      builtin: 'lift',
      volume: 33,
    })
    // The input is untouched (undo keeps the old one).
    expect(d.content.events.raid!.variations[0]!.look.sound.builtin).toBe('chime')
  })
})
