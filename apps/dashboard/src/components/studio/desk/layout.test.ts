import { describe, expect, it } from 'vitest'
import {
  dockName,
  fresh,
  fromPreset,
  putWeb,
  removeWeb,
  revive,
  showing,
  toggle,
  type Layout,
} from './layout'
import { nameFrom, newWebId, webUrlProblem, wholeUrl } from './web-dock'

const page = { id: 'web:a1' as const, name: 'Activity', url: 'https://dashboard.example/a' }

describe('the Studio layout', () => {
  it('a fresh one shows the four main panels; Chat and Events wait in the Layout menu', () => {
    expect(showing(fresh('side'))).toEqual(['scenes', 'sources', 'audio', 'golive'])
  })

  it('keeps a layout saved before Chat and Events, with them hidden', () => {
    const old = {
      left: ['scenes', 'sources'],
      right: ['golive'],
      bottom: ['audio'],
      lw: 300,
      rw: 320,
      bh: 230,
      float: {},
      hidden: [],
      w: { scenes: 1, sources: 1.3, audio: 1.7, golive: 1 },
      preset: null,
      locked: true,
      mob: 'scenes',
    } as unknown as Layout
    const l = revive(old)
    expect(l.locked).toBe(true)
    expect(l.left).toEqual(['scenes', 'sources'])
    expect(l.hidden).toEqual(['chat', 'events'])
    expect(l.webs).toEqual([])
  })

  it('drops panels it no longer knows, and broken web panels', () => {
    const saved = {
      ...fresh('side'),
      bottom: ['audio', 'web:gone', 'mystery'],
      webs: [page, { id: 'nope', name: 'x', url: 'y' }],
    } as unknown as Layout
    const l = revive(saved)
    expect(l.bottom).toEqual(['audio'])
    expect(l.webs).toEqual([page])
    // Known but nowhere: a web panel can sit unplaced (hidden), unlike a built-in one.
    expect(showing(l)).not.toContain('web:a1')
  })

  it('adds, renames, shows, hides and removes a web panel', () => {
    let l = putWeb(fresh('side'), page)
    expect(showing(l)).toContain('web:a1')
    expect(dockName(l, 'web:a1')).toBe('Activity')
    l = putWeb(l, { ...page, name: 'Mod view' })
    expect(l.webs).toHaveLength(1)
    expect(dockName(l, 'web:a1')).toBe('Mod view')
    l = toggle(l, 'web:a1')
    expect(showing(l)).not.toContain('web:a1')
    l = toggle(l, 'web:a1')
    expect(showing(l)).toContain('web:a1')
    l = removeWeb(l, 'web:a1')
    expect(l.webs).toEqual([])
    expect([...l.left, ...l.right, ...l.bottom, ...l.hidden]).not.toContain('web:a1')
  })

  it('a preset keeps web panels (hidden) and the lock', () => {
    const l = { ...putWeb(fresh('side'), page), locked: true }
    const p = fromPreset(l, 'classic')
    expect(p.webs).toEqual([page])
    expect(p.locked).toBe(true)
    expect(showing(p)).not.toContain('web:a1')
    expect(showing(toggle(p, 'web:a1'))).toContain('web:a1')
  })
})

describe('web panel addresses', () => {
  const here = 'http://127.0.0.1:47820'
  it('takes web pages, and not Ferrocast itself or other kinds of address', () => {
    expect(webUrlProblem('https://www.twitch.tv/popout/me/chat', here)).toBeNull()
    expect(webUrlProblem('http://localhost:8911/', here)).toBeNull()
    expect(webUrlProblem('not an address', here)).toMatch(/whole address/)
    expect(webUrlProblem('twitch.tv', here)).toBeNull()
    expect(webUrlProblem('javascript:alert(1)', here)).toMatch(/Only web pages/)
    expect(webUrlProblem('file:///Users/me/x.html', here)).toMatch(/Only web pages/)
    expect(webUrlProblem('http://127.0.0.1:47820/app/#/chat', here)).toMatch(/Ferrocast itself/)
  })

  it('fills in what was left off the address', () => {
    expect(wholeUrl(' twitch.tv/popout/me/chat ')).toBe('https://twitch.tv/popout/me/chat')
    expect(wholeUrl('localhost:8911/x')).toBe('http://localhost:8911/x')
    expect(wholeUrl('127.0.0.1:47820')).toBe('http://127.0.0.1:47820')
    expect(wholeUrl('https://a.b')).toBe('https://a.b')
    expect(wholeUrl('javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(wholeUrl('hello')).toBe('hello')
  })

  it('makes panel ids with or without randomUUID (plain-http LAN addresses lack it)', () => {
    expect(newWebId()).toMatch(/^web:[0-9a-f]{10}$/)
    const had = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      expect(newWebId()).toMatch(/^web:[0-9a-f]{10}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: had, configurable: true })
    }
  })

  it('names a panel after its site when no name is given', () => {
    expect(nameFrom('https://www.example.com/x')).toBe('example.com')
    expect(nameFrom('nonsense')).toBe('Web page')
  })
})
