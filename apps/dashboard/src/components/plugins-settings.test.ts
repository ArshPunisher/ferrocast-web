import { describe, expect, it } from 'vitest'
import { canWords, panelPageUrl, sandboxed } from './plugins-settings'

describe('panel plugins', () => {
  it('load their page from the engine when this dashboard is the engine’s own', () => {
    const app = 'http://127.0.0.1:47820/app/#/settings/plugins'
    expect(panelPageUrl('http://127.0.0.1:47820', 'com.ana.panel', app)).toBe(
      'http://127.0.0.1:47820/plugin-panel/com.ana.panel',
    )
    expect(panelPageUrl('', 'a b', app)).toBe('http://127.0.0.1:47820/plugin-panel/a%20b')
    // The demo (another origin) keeps the page in srcdoc.
    expect(panelPageUrl('http://127.0.0.1:47820', 'x', 'http://localhost:5280/#/settings')).toBeNull()
    expect(panelPageUrl('not a url', 'x', 'also not')).toBeNull()
  })

  it('say what they may do, and run nothing from outside', () => {
    expect(canWords(['scene', 'chat'])).toBe('Can switch scenes and say in chat.')
    expect(canWords([])).toBeNull()
    expect(sandboxed('<p>hi</p>')).toContain("default-src 'none'")
  })
})
