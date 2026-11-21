import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_IDS } from '@ferrocast/api'
import {
  THEMES,
  THEME_KEY,
  applyThemePref,
  counterpart,
  kindOf,
  parseThemePref,
  resolvedTheme,
} from './themes'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('the ten themes', () => {
  it('are the ids the API names, six dark then four light, each with a name and a line', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS])
    expect(THEMES.filter((t) => t.kind === 'dark')).toHaveLength(6)
    expect(THEMES.filter((t) => t.kind === 'light')).toHaveLength(4)
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(2)
      expect(t.blurb.length).toBeGreaterThan(20)
    }
  })

  it('are all known to the script that applies the saved one before first paint', () => {
    const boot = readFileSync(resolve(__dirname, '../../public/theme-boot.js'), 'utf8')
    for (const id of [...THEME_IDS, 'dark', 'light']) expect(boot, id).toContain(`'${id}'`)
  })
})

describe('what a saved choice means', () => {
  it('an unknown or missing value follows the computer', () => {
    expect(parseThemePref('ember')).toBe('ember')
    expect(parseThemePref('dark')).toBe('dark')
    expect(parseThemePref('neon')).toBe('system')
    expect(parseThemePref(null)).toBe('system')
    expect(parseThemePref(7)).toBe('system')
  })

  it('resolves to a dark or light theme: system by the computer, dark and light to Slate and Daylight', () => {
    expect(resolvedTheme('system', true)).toBe('daylight')
    expect(resolvedTheme('system', false)).toBe('slate')
    expect(resolvedTheme('dark', true)).toBe('slate')
    expect(resolvedTheme('light', false)).toBe('daylight')
    expect(resolvedTheme('mist', false)).toBe('mist')
    expect(kindOf('ember', true)).toBe('dark')
    expect(kindOf('linen', false)).toBe('light')
    expect(kindOf('system', true)).toBe('light')
  })
})

describe('applying a choice', () => {
  it('sets the page and remembers it; match-system clears both', () => {
    applyThemePref('moonlight')
    expect(document.documentElement.dataset.theme).toBe('moonlight')
    expect(localStorage.getItem(THEME_KEY)).toBe('moonlight')
    applyThemePref('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('the quick dark/light switch goes back to the last theme of the other kind', () => {
    // Nothing remembered yet: the defaults.
    expect(counterpart('slate', false)).toBe('daylight')
    expect(counterpart('daylight', true)).toBe('slate')
    // After choosing Ember and then Linen, flipping from Linen returns to Ember.
    applyThemePref('ember')
    applyThemePref('linen')
    expect(counterpart('linen', true)).toBe('ember')
    expect(counterpart('ember', false)).toBe('linen')
    // The aliases count as their themes.
    expect(counterpart('dark', false)).toBe('linen')
  })
})
