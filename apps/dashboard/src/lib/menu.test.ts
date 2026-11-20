// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMenuMessage, runMenu, takePendingSettings, type MenuDeps } from './menu'

const deps = (): MenuDeps => ({
  navigate: vi.fn(),
  checkUpdates: vi.fn(async () => undefined),
  toggleLock: vi.fn(),
  zoom: vi.fn(),
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the menu bar messages', () => {
  it('recognises what the app sends and nothing else', () => {
    expect(isMenuMessage({ kind: 'nav', to: '#/settings' })).toBe(true)
    expect(isMenuMessage({ kind: 'action', name: 'undo' })).toBe(true)
    for (const bad of [
      null,
      'x',
      {},
      { kind: 'nav' },
      { kind: 'action', name: 1 },
      { kind: 'other' },
    ])
      expect(isMenuMessage(bad)).toBe(false)
  })

  it('goes to the dashboard routes the menu names, and refuses anything else', () => {
    const d = deps()
    runMenu({ kind: 'nav', to: '#/settings/automations' }, d)
    expect(d.navigate).toHaveBeenCalledWith('#/settings/automations')
    runMenu({ kind: 'nav', to: 'https://evil.test' }, d)
    runMenu({ kind: 'nav', to: '#/x?<script>' }, d)
    expect(d.navigate).toHaveBeenCalledTimes(1)
  })

  it('Check for Updates opens Updates and asks for a check; a failed check is the page’s to show', async () => {
    const d = deps()
    d.checkUpdates = vi.fn(async () => {
      throw new Error('offline')
    })
    runMenu({ kind: 'action', name: 'check-updates' }, d)
    expect(d.navigate).toHaveBeenCalledWith('#/settings/updates')
    expect(d.checkUpdates).toHaveBeenCalled()
    await Promise.resolve()
  })

  it('Undo and Redo use a focused text field’s own history, else the Studio’s ⌘Z', () => {
    const exec = vi.fn(() => true)
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    const keys: KeyboardEvent[] = []
    window.addEventListener('keydown', (e) => keys.push(e))
    const d = deps()
    runMenu({ kind: 'action', name: 'undo' }, d)
    runMenu({ kind: 'action', name: 'redo' }, d)
    expect(exec).not.toHaveBeenCalled()
    expect(keys.map((e) => [e.key, e.metaKey, e.shiftKey])).toEqual([
      ['z', true, false],
      ['z', true, true],
    ])
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    runMenu({ kind: 'action', name: 'undo' }, d)
    runMenu({ kind: 'action', name: 'redo' }, d)
    expect(exec.mock.calls).toEqual([['undo'], ['redo']])
    expect(keys).toHaveLength(2)
  })

  it('Lock Preview and the zoom items call the preview’s own actions; unknown ones do nothing', () => {
    const d = deps()
    runMenu({ kind: 'action', name: 'lock-preview' }, d)
    expect(d.toggleLock).toHaveBeenCalled()
    runMenu({ kind: 'action', name: 'zoom-fit' }, d)
    runMenu({ kind: 'action', name: 'zoom-in' }, d)
    runMenu({ kind: 'action', name: 'zoom-out' }, d)
    expect((d.zoom as ReturnType<typeof vi.fn>).mock.calls).toEqual([['fit'], ['in'], ['out']])
    runMenu({ kind: 'action', name: 'something-new' }, d)
    expect(d.toggleLock).toHaveBeenCalledTimes(1)
  })
})

describe('Remux Recordings…', () => {
  it('opens the Recording settings of the Studio, now or when it appears', () => {
    const d = deps()
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener('ferrocast:open-settings', on)
    runMenu({ kind: 'action', name: 'remux' }, d)
    window.removeEventListener('ferrocast:open-settings', on)
    expect(d.navigate).toHaveBeenCalledWith('#/studio')
    expect(seen).toEqual([{ page: 'record' }])
    // A Studio that wasn't there to hear it takes it when it mounts, once.
    expect(takePendingSettings()).toBe('record')
    expect(takePendingSettings()).toBeNull()
  })
})
