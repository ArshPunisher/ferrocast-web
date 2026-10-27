import { describe, expect, it } from 'vitest'
import type { UpdateInfo } from '@ferrocast/api'
import { checkedLine, emphasis, formatBytes, parseNotes, publishedLine, summarize } from './update'

const base: UpdateInfo = {
  current: '1.0.0',
  latest: null,
  channel: 'stable',
  blocked_while_live: false,
  notes_url: null,
}

describe('summarize', () => {
  it('shows nothing when up to date or not loaded', () => {
    expect(summarize(null).show).toBe(false)
    expect(summarize(base).show).toBe(false)
    expect(summarize({ ...base, latest: '1.0.0' }).show).toBe(false)
  })
  it('offers a newer version; older engines without the new fields still can install', () => {
    const s = summarize({ ...base, latest: '1.0.1' })
    expect(s).toMatchObject({ show: true, version: '1.0.1', phase: 'idle', canInstall: true })
  })
  it('download progress, clamped, and unknown sizes', () => {
    const at = (downloaded: number, total: number | null) =>
      summarize({
        ...base,
        latest: '1.0.1',
        install: { phase: 'downloading', version: '1.0.1', downloaded, total, error: null },
      }).percent
    expect(at(512, 2048)).toBe(25)
    expect(at(5000, 2048)).toBe(100)
    expect(at(10, null)).toBeNull()
    expect(at(10, 0)).toBeNull()
  })
  it('keeps showing a finished install after the feed stops offering it', () => {
    const s = summarize({
      ...base,
      install: { phase: 'ready', version: '1.0.1', downloaded: 1, total: 1, error: null },
    })
    expect(s).toMatchObject({ show: true, phase: 'ready', version: '1.0.1' })
  })
  it('the headless app can’t install', () => {
    expect(summarize({ ...base, latest: '1.0.1', can_install: false }).canInstall).toBe(false)
  })
})

describe('words', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  it('last checked', () => {
    expect(checkedLine(null, now)).toBe('Not checked yet')
    expect(checkedLine(undefined, now)).toBe('Not checked yet')
    expect(checkedLine(now - 20_000, now)).toBe('Last checked just now')
    expect(checkedLine(now - 60_000, now)).toBe('Last checked 1 minute ago')
    expect(checkedLine(now - 3 * 3_600_000, now)).toBe('Last checked 3 hours ago')
    expect(checkedLine(now - 2 * 86_400_000, now)).toBe('Last checked 2 days ago')
    expect(checkedLine(now + 60_000, now)).toBe('Last checked just now')
  })
  it('published', () => {
    expect(publishedLine('2026-10-20T11:16:05Z', now)).toBe('Published 43 minutes ago')
    expect(publishedLine('nonsense', now)).toBeNull()
    expect(publishedLine(null, now)).toBeNull()
  })
  it('bytes', () => {
    expect(formatBytes(18_400_000)).toBe('18.4\u00a0MB')
    expect(formatBytes(2048)).toBe('2\u00a0KB')
    expect(formatBytes(-1)).toBe('0\u00a0MB')
    expect(formatBytes(Number.NaN)).toBe('0\u00a0MB')
  })
})

describe('parseNotes (untrusted text, never HTML)', () => {
  it('lists, continued items and paragraphs', () => {
    expect(
      parseNotes('## 1.1.0\n\n- Faster alerts\n  on Kick\n* Fixes\r\n\nThanks for testing.'),
    ).toEqual([
      { kind: 'text', text: '1.1.0' },
      { kind: 'list', items: ['Faster alerts on Kick', 'Fixes'] },
      { kind: 'text', text: 'Thanks for testing.' },
    ])
  })
  it('joins wrapped lines into one paragraph', () => {
    expect(
      parseNotes(
        '**New.** One line\nwraps here.\n\nNext para.\n- item\n  more\n\nAfter list\nwraps.',
      ),
    ).toEqual([
      { kind: 'text', text: '**New.** One line wraps here.' },
      { kind: 'text', text: 'Next para.' },
      { kind: 'list', items: ['item more'] },
      { kind: 'text', text: 'After list wraps.' },
    ])
  })
  it('splits bold out as text', () => {
    expect(emphasis('**The Studio.** Now <b>here</b>')).toEqual([
      { text: 'The Studio.', strong: true },
      { text: ' Now <b>here</b>', strong: false },
    ])
    expect(emphasis('a ** b')).toEqual([{ text: 'a ** b', strong: false }])
  })
  it('keeps markup as plain text', () => {
    expect(parseNotes('- <img src=x onerror=alert(1)>')).toEqual([
      { kind: 'list', items: ['<img src=x onerror=alert(1)>'] },
    ])
  })
  it('empty', () => {
    expect(parseNotes(null)).toEqual([])
    expect(parseNotes('   \n- \n')).toEqual([])
  })
})
