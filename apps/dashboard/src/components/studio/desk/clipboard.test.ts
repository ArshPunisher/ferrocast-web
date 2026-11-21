import { describe, expect, it } from 'vitest'
import { clipLabel, clipboardKey, isEditing } from './clipboard'

const key = (
  k: string,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})
const free = { editing: false, selection: false }

describe('the clipboard keys', () => {
  it('copy and paste use Cmd on a Mac and Ctrl elsewhere, either case', () => {
    expect(clipboardKey(key('c', { metaKey: true }), true, free)).toBe('copy')
    expect(clipboardKey(key('V', { metaKey: true }), true, free)).toBe('paste')
    expect(clipboardKey(key('c', { ctrlKey: true }), false, free)).toBe('copy')
    expect(clipboardKey(key('v', { ctrlKey: true }), false, free)).toBe('paste')
  })
  it('does nothing for the wrong modifier, extra modifiers or other keys', () => {
    expect(clipboardKey(key('c', { ctrlKey: true }), true, free)).toBeNull()
    expect(clipboardKey(key('c', { metaKey: true }), false, free)).toBeNull()
    expect(clipboardKey(key('c', { metaKey: true, ctrlKey: true }), true, free)).toBeNull()
    expect(clipboardKey(key('c', { metaKey: true, shiftKey: true }), true, free)).toBeNull()
    expect(clipboardKey(key('v', { ctrlKey: true, altKey: true }), false, free)).toBeNull()
    expect(clipboardKey(key('x', { metaKey: true }), true, free)).toBeNull()
    expect(clipboardKey(key('c'), true, free)).toBeNull()
  })
  it('one press is one copy or paste: a held key repeating does nothing', () => {
    expect(clipboardKey({ ...key('v', { metaKey: true }), repeat: true }, true, free)).toBeNull()
    expect(clipboardKey({ ...key('c', { ctrlKey: true }), repeat: false }, false, free)).toBe(
      'copy',
    )
  })
  it('never takes a key that goes to a text field, and leaves selected text to copy', () => {
    expect(
      clipboardKey(key('c', { metaKey: true }), true, { editing: true, selection: false }),
    ).toBeNull()
    expect(
      clipboardKey(key('v', { metaKey: true }), true, { editing: true, selection: false }),
    ).toBeNull()
    expect(
      clipboardKey(key('c', { metaKey: true }), true, { editing: false, selection: true }),
    ).toBeNull()
    expect(
      clipboardKey(key('v', { metaKey: true }), true, { editing: false, selection: true }),
    ).toBe('paste')
  })
  it('knows text fields from buttons', () => {
    const doc = document.createElement('div')
    doc.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="e" contenteditable="true"><b id="in"></b></div><div id="p" contenteditable="plaintext-only"></div><button id="b"></button>'
    const get = (id: string) => doc.querySelector(`#${id}`)
    for (const id of ['i', 't', 's', 'e', 'in', 'p']) expect(isEditing(get(id)), id).toBe(true)
    expect(isEditing(get('b'))).toBe(false)
    expect(isEditing(null)).toBe(false)
  })
})

describe('what a menu says is copied', () => {
  it('names a source, a group and filters', () => {
    expect(clipLabel(null)).toBe('')
    expect(clipLabel({ kind: 'source', name: 'Cam', from: 'Main', count: 1 })).toBe('Cam')
    expect(clipLabel({ kind: 'source', name: 'Pair', from: 'Main', count: 3 })).toBe(
      'Pair (3 sources)',
    )
    expect(clipLabel({ kind: 'filters', name: 'Mic', from: 'Mic', count: 1 })).toBe(
      '1 filter of Mic',
    )
    expect(clipLabel({ kind: 'filters', name: 'Mic', from: 'Mic', count: 4 })).toBe(
      '4 filters of Mic',
    )
  })
})
