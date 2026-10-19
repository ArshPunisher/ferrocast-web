import { describe, expect, it } from 'vitest'
import { missingStarters } from './starters'

const cmd = (name: string, aliases: string[] = []) => ({ name, aliases })

describe('missingStarters', () => {
  it('lists all four for an empty list', () => {
    expect(missingStarters([])).toEqual(['!socials', '!lurk', '!uptime', '!so'])
  })
  it('lists only the ones not yet there', () => {
    expect(missingStarters([cmd('!lurk'), cmd('!discord')])).toEqual(['!socials', '!uptime', '!so'])
  })
  it('is empty once every starter exists, by name or alias, any case', () => {
    expect(
      missingStarters([cmd('!Socials'), cmd('!lurk'), cmd('!up', ['!uptime']), cmd('!SO')]),
    ).toEqual([])
  })
})
