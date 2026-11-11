import { describe, expect, it } from 'vitest'
import { canWords, catalogAbout, panelPageUrl, sandboxed } from './plugins-settings'

describe('panel plugins', () => {
  it('load their page from the engine when this dashboard is the engine’s own', () => {
    const app = 'http://127.0.0.1:47820/app/#/settings/plugins'
    expect(panelPageUrl('http://127.0.0.1:47820', 'com.ana.panel', app)).toBe(
      'http://127.0.0.1:47820/plugin-panel/com.ana.panel',
    )
    expect(panelPageUrl('', 'a b', app)).toBe('http://127.0.0.1:47820/plugin-panel/a%20b')
    // The demo (another origin) keeps the page in srcdoc.
    expect(
      panelPageUrl('http://127.0.0.1:47820', 'x', 'http://localhost:5280/#/settings'),
    ).toBeNull()
    expect(panelPageUrl('not a url', 'x', 'also not')).toBeNull()
  })

  it('say what they may do, and run nothing from outside', () => {
    expect(canWords(['scene', 'chat'])).toBe('Can switch scenes and say in chat.')
    expect(canWords([])).toBeNull()
    expect(sandboxed('<p>hi</p>')).toContain("default-src 'none'")
  })

  it('say in one line what a catalog plugin is', () => {
    const base = {
      id: 'a.b.c',
      name: 'X',
      version: '1',
      author: 'Ana',
      description: 'Does X.',
      kind: 'logic',
      actions: ['scene'],
      size: 1,
      installed: null,
      update: false,
    }
    expect(catalogAbout(base)).toBe('Logic · By Ana · Does X. · Can switch scenes.')
    expect(
      catalogAbout({ ...base, author: '', description: '', actions: [], kind: 'effect' }),
    ).toBe('Effect')
  })
})
