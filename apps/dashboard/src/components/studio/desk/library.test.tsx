import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, type EngineStats } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { ControlBar } from './desk'
import { DockWorkspace } from './layout'
import { LibraryBar, showShelfError } from './library'

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

describe('409 studio_busy on collection/profile switch while live', () => {
  it('showShelfError produces a calm one-line "Stop the stream to switch" toast with detail behind (i)', () => {
    const err = new ApiError(
      409,
      'studio_busy',
      'Stop streaming and recording before changing scene collections.',
      'Stop every active output first.',
    )
    showShelfError(err)
    const t = currentToasts().find((x) => x.key === 'studio:busy-switch')
    expect(t).toBeDefined()
    expect(t?.tone).toBe('warn')
    expect(t?.message).toBe('Stop the stream to switch')
    expect(t?.hint).toBeUndefined()
    expect(t?.detail).toContain('Stop streaming and recording')
    expect(t?.detail).toContain('Stop every active output first.')
  })

  it('switching a scene collection in LibraryBar when engine returns 409 studio_busy shows the one-line notice', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const switchShelf = vi.fn(async () => {
      throw new ApiError(
        409,
        'studio_busy',
        'Stop streaming and recording before changing scene collections.',
        'Stop every active output first.',
      )
    })
    const desk = {
      api: {
        shelf: async (kind: string) =>
          kind === 'collections'
            ? {
                current: 'main',
                list: [
                  { id: 'main', name: 'Main' },
                  { id: 'podcast', name: 'Podcast' },
                ],
              }
            : { current: 'default', list: [{ id: 'default', name: 'Default' }] },
        switchShelf,
      },
      refresh: vi.fn(),
      library: 0,
    } as unknown as Desk
    useLive.setState({ conn: { client: {} } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const btn = host.querySelector(
      'button[aria-label="scene collection: Main"]',
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    await act(async () => btn.click())

    const podcastItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Podcast'),
    ) as HTMLButtonElement | undefined
    expect(podcastItem).toBeDefined()
    await act(async () => podcastItem!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(switchShelf).toHaveBeenCalledWith('collections', 'podcast')
    const t = currentToasts().find((x) => x.message === 'Stop the stream to switch')
    expect(t).toBeDefined()
    expect(t?.detail).toContain('Stop streaming and recording')
  })
})

describe('U3: scene-collection and profile selectors stay visible at 1280 px while live', () => {
  beforeEach(() => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia
  })

  it('keeps collection and profile selectors outside xl:hidden while live and collapses only their labels to 2xl', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const request = vi.fn(async (_method: string, path: string) => {
      if (path.endsWith('/show/config'))
        return { start_stream: true, stop_stream: true, stop_delay_s: 30 }
      if (path.endsWith('/show')) return { show: null }
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return []
    })
    useLive.setState({ conn: { client: { request } } as never })
    const liveStats = {
      stream: { active: true, reconnecting: false, error: null, frames: 90 },
      record: null,
      canvas: { fps: 30 },
    } as unknown as EngineStats
    const desk = {
      stats: liveStats,
      setStats: vi.fn(),
      openSettings: vi.fn(),
      prefs: { data: {}, reload: vi.fn() },
      api: {
        shelf: async (kind: string) =>
          kind === 'collections'
            ? { current: 'main', list: [{ id: 'main', name: 'Main' }] }
            : { current: 'default', list: [{ id: 'default', name: 'Default' }] },
      },
      library: 0,
      refresh: vi.fn(),
    } as unknown as Desk
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <DockWorkspace
            top={
              <ControlBar
                view={null}
                lead={<div data-testid="engine-switch">Ferrocast</div>}
                onStatus={vi.fn()}
              />
            }
            stage={<div />}
            docks={() => null}
          />
        </DeskProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const colBtn = host.querySelector(
      'button[aria-label="scene collection: Main"]',
    ) as HTMLButtonElement | null
    const profBtn = host.querySelector(
      'button[aria-label="profile: Default"]',
    ) as HTMLButtonElement | null
    expect(colBtn).not.toBeNull()
    expect(profBtn).not.toBeNull()
    // Neither button nor any ancestor carries xl:hidden while live.
    expect(colBtn!.closest('.xl\\:hidden')).toBeNull()
    expect(profBtn!.closest('.xl\\:hidden')).toBeNull()
    // Compact mode keeps the text label hidden at xl (2xl:inline) so 1280 px stays on one row.
    const labelSpan = colBtn!.querySelector('span.truncate')
    expect(labelSpan?.classList.contains('2xl:inline')).toBe(true)
    expect(labelSpan?.classList.contains('xl:inline')).toBe(false)
    // Only the engine switch steps aside at xl while live.
    const leadWrap = host.querySelector('[data-testid="engine-switch"]')?.parentElement
    expect(leadWrap?.classList.contains('xl:hidden')).toBe(true)
  })
})

describe('Collection & profile switch resilience', () => {
  const flushMicro = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15))
    })
  }

  function makeShelfDesk(overrides: Record<string, unknown> = {}) {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
    useLive.setState({ conn: { client: {} } as never })
    const reloadPrefs = vi.fn()
    const onProfileChange = vi.fn()
    const onCollectionChange = vi.fn()
    const refresh = vi.fn()
    const switchShelf =
      (overrides.switchShelf as ReturnType<typeof vi.fn> | undefined) ??
      vi.fn(async (_kind: string, id: string) => ({ id }))
    const newShelf =
      (overrides.newShelf as ReturnType<typeof vi.fn> | undefined) ??
      vi.fn(async (_kind: string, name: string) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
      }))
    const renameShelf =
      (overrides.renameShelf as ReturnType<typeof vi.fn> | undefined) ??
      vi.fn(async () => undefined)
    const importCollection =
      (overrides.importCollection as ReturnType<typeof vi.fn> | undefined) ??
      vi.fn(async (name: string) => ({
        id: 'imp-1',
        previous_id: 'main',
        name,
        scenes: 2,
        sources: 3,
        missing: [],
      }))
    const api = {
      shelf: async (kind: string) =>
        kind === 'collections'
          ? {
              current: 'main',
              list: [
                { id: 'main', name: 'Main' },
                { id: 'podcast', name: 'Podcast' },
              ],
            }
          : {
              current: 'default',
              list: [
                { id: 'default', name: 'Default' },
                { id: 'hd', name: 'HD 1080p' },
              ],
            },
      switchShelf,
      newShelf,
      renameShelf,
      importCollection,
      restart: vi.fn(async () => undefined),
      ...overrides,
    }
    const desk = {
      api,
      prefs: { data: null, reload: reloadPrefs, set: vi.fn() },
      refresh,
      onProfileChange,
      onCollectionChange,
      library: 0,
    } as unknown as Desk
    return {
      desk,
      reloadPrefs,
      onProfileChange,
      onCollectionChange,
      refresh,
      switchShelf,
      newShelf,
      renameShelf,
      importCollection,
    }
  }

  it('reloads prefs on profile switch, New, and Duplicate and surfaces note/restart notice', async () => {
    const { desk, reloadPrefs, switchShelf, newShelf } = makeShelfDesk({
      switchShelf: vi.fn(async (_kind: string, id: string) => ({
        id,
        note: 'Video canvas changed for this profile.',
        restart: 'Sample rate change takes effect after restart.',
        restart_detail: 'Restart Ferrocast to use 48 kHz audio.',
      })),
    })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>,
      )
    })
    await flushMicro()

    const profBtn = host.querySelector('button[aria-label="profile: Default"]') as HTMLButtonElement
    await act(async () => profBtn.click())
    const hdItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('HD 1080p'),
    ) as HTMLButtonElement
    await act(async () => hdItem.click())
    await flushMicro()

    expect(switchShelf).toHaveBeenCalledWith('profiles', 'hd')
    expect(reloadPrefs).toHaveBeenCalledTimes(1)
    // Single clear toast carries the restart/note info instead of swallowing it or duplicating.
    const toasts = currentToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.hint ?? toasts[0]?.message).toMatch(/restart|HD 1080p/i)
    expect(toasts[0]?.action?.label).toBe('Restart')
    dismissToast(toasts[0]!.id)

    // Profile New reloads prefs AND shows a confirmation toast.
    await act(async () => profBtn.click())
    const newItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('New profile'),
    ) as HTMLButtonElement
    await act(async () => newItem.click())
    const input = document.querySelector('dialog[open] input') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'Clean 720p')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const createBtn = Array.from(document.querySelectorAll('dialog[open] button')).find((b) =>
      b.textContent?.includes('Make it'),
    ) as HTMLButtonElement
    await act(async () => createBtn.click())
    await flushMicro()

    expect(newShelf).toHaveBeenCalledWith('profiles', 'Clean 720p', false)
    expect(reloadPrefs).toHaveBeenCalledTimes(2)
    expect(currentToasts().some((t) => /Clean 720p/i.test(t.message))).toBe(true)
  })

  it('shows confirmation toasts for collection Duplicate and Rename and blocks rapid double submits', async () => {
    let resolveSwitch!: (v: { id: string }) => void
    const pendingSwitch = new Promise<{ id: string }>((r) => {
      resolveSwitch = r
    })
    const { desk, newShelf, renameShelf, switchShelf } = makeShelfDesk({
      switchShelf: vi.fn(() => pendingSwitch),
    })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>,
      )
    })
    await flushMicro()

    // Rename produces confirmation toast.
    const colBtn = host.querySelector(
      'button[aria-label="scene collection: Main"]',
    ) as HTMLButtonElement
    await act(async () => colBtn.click())
    const renameItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.getAttribute('aria-label')?.includes('Rename'),
    ) as HTMLButtonElement | undefined
    if (renameItem) {
      await act(async () => renameItem.click())
    } else {
      const rowMenuBtn = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
        el.textContent?.includes('Rename'),
      ) as HTMLButtonElement
      await act(async () => rowMenuBtn.click())
    }
    const renameInput = document.querySelector('dialog[open] input') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(renameInput, 'Studio Main')
      renameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const saveBtn = Array.from(document.querySelectorAll('dialog[open] button')).find(
      (b) => b.textContent?.trim() === 'Rename',
    ) as HTMLButtonElement
    await act(async () => {
      saveBtn.click()
      saveBtn.click()
    })
    await flushMicro()
    expect(renameShelf).toHaveBeenCalledTimes(1)
    expect(currentToasts().some((t) => /Studio Main/i.test(t.message))).toBe(true)

    // Duplicate produces confirmation toast.
    await act(async () => colBtn.click())
    const dupItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Duplicate'),
    ) as HTMLButtonElement
    await act(async () => dupItem.click())
    const dupInput = document.querySelector('dialog[open] input') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(dupInput, 'Main Backup')
      dupInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const dupBtn = Array.from(document.querySelectorAll('dialog[open] button')).find((b) =>
      b.textContent?.includes('Make it'),
    ) as HTMLButtonElement
    await act(async () => dupBtn.click())
    await flushMicro()
    expect(newShelf).toHaveBeenCalledWith('collections', 'Main Backup', true)
    expect(currentToasts().some((t) => /Main Backup/i.test(t.message))).toBe(true)

    // Switch while in-flight disables both pills and ignores rapid second clicks.
    await act(async () => colBtn.click())
    const podcastItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Podcast'),
    ) as HTMLButtonElement
    await act(async () => {
      podcastItem.click()
      podcastItem.click()
    })
    const profBtn = host.querySelector('button[aria-label="profile: Default"]') as HTMLButtonElement
    expect(colBtn.disabled).toBe(true)
    expect(profBtn.disabled).toBe(true)
    expect(switchShelf).toHaveBeenCalledTimes(1)
    resolveSwitch({ id: 'podcast' })
    await flushMicro()
  })

  it('derives accurate busy headlines, retries shelf load errors, and clamps >100 char import names', async () => {
    for (const [msg, expected] of [
      ['Stop recording before changing scene collections.', 'Stop recording to switch'],
      ['Stop the virtual camera before changing profiles.', 'Stop Virtual Camera to switch'],
      ['Stop NDI before changing scene collections.', 'Stop NDI to switch'],
      ['Stop the replay buffer before changing profiles.', 'Stop the replay buffer to switch'],
      ['Stop the show before changing scene collections.', 'Stop the show to switch'],
    ] as const) {
      currentToasts().forEach((t) => dismissToast(t.id))
      showShelfError(new ApiError(409, 'studio_busy', msg))
      expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(expected)
    }

    let failLoad = true
    const shelfSpy = vi.fn(async (kind: string) => {
      if (kind === 'collections' && failLoad)
        throw new ApiError(500, 'shelf_err', 'Disk read error')
      return kind === 'collections'
        ? { current: 'main', list: [{ id: 'main', name: 'Main' }] }
        : { current: 'default', list: [{ id: 'default', name: 'Default' }] }
    })
    const { desk, importCollection } = makeShelfDesk({ shelf: shelfSpy })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>,
      )
    })
    await flushMicro()

    expect(
      currentToasts().some((t) => t.tone === 'error' && /Disk read error/.test(t.message)),
    ).toBe(true)
    const retryBtn = host.querySelector(
      'button[aria-label*="scene collection"]',
    ) as HTMLButtonElement
    expect(retryBtn).not.toBeNull()
    expect(retryBtn.disabled).toBe(false)
    failLoad = false
    await act(async () => retryBtn.click())
    await flushMicro()
    expect(host.querySelector('button[aria-label="scene collection: Main"]')).not.toBeNull()

    // >100-char imported collection name is clamped cleanly to <=100 chars.
    const fileInput = host.querySelector('input[type="file"]') as HTMLInputElement
    const longName = 'X'.repeat(140)
    const file = new File([JSON.stringify({ name: longName, sources: [] })], 'long.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify({ name: longName, sources: [] }),
    })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushMicro()
    expect(importCollection).toHaveBeenCalledTimes(1)
    const sentName = (importCollection.mock.calls[0] as unknown[])[0] as string
    expect([...sentName].length).toBeLessThanOrEqual(100)
  })
})
