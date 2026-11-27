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
  it('showShelfError derives exact active-output headlines from live stats and 409 codes', () => {
    const genericBusy = new ApiError(
      409,
      'studio_busy',
      'Stop streaming and recording before changing scene collections.',
      'Stop every active output first.',
    )

    // Streaming only
    showShelfError(genericBusy, {
      stream: { active: true, reconnecting: false, bytes: 0, frames: 0, dropped: 0, error: null },
      record: null,
    } as unknown as EngineStats)
    const t = currentToasts().find((x) => x.key === 'studio:busy-switch')
    expect(t?.tone).toBe('warn')
    expect(t?.message).toBe('Stop the stream to switch')
    expect(t?.hint).toBeUndefined()
    expect(t?.detail).toContain('Stop streaming and recording')
    dismissToast(t!.id)

    // Recording only (engine still sends generic "Stop streaming and recording..." message)
    showShelfError(genericBusy, {
      stream: null,
      record: {
        active: true,
        paused: false,
        bytes: 0,
        frames: 0,
        file: '/a.mp4',
        seconds: 1,
        error: null,
      },
    } as unknown as EngineStats)
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Stop recording to switch',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // Replay buffer only
    showShelfError(genericBusy, {
      stream: null,
      record: null,
      replay: { active: true, last: null, error: null },
    } as unknown as EngineStats)
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Stop the replay buffer to switch',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // Virtual Camera only
    showShelfError(genericBusy, {
      stream: null,
      record: null,
      virtualcam: { active: true },
    } as unknown as EngineStats)
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Stop Virtual Camera to switch',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // NDI only
    showShelfError(genericBusy, {
      stream: null,
      record: null,
      ndi: { name: 'Ferrocast' },
    } as unknown as EngineStats)
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Stop NDI to switch',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // Multiple or unknown outputs
    showShelfError(genericBusy, null)
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Stop active outputs to switch',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // Benchmark running (409 benchmark_running)
    showShelfError(new ApiError(409, 'benchmark_running', 'An encoder benchmark is running.'))
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      'Wait for the benchmark to finish',
    )
    currentToasts().forEach((x) => dismissToast(x.id))

    // Fail-closed status probe error
    showShelfError(
      new ApiError(
        409,
        'studio_busy',
        "Couldn't check stream status before changing profiles: timeout",
      ),
    )
    expect(currentToasts().find((x) => x.key === 'studio:busy-switch')?.message).toBe(
      "Couldn't check active outputs",
    )
  })

  it('switching a scene collection in LibraryBar when engine returns 409 studio_busy shows the active output notice', async () => {
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
      stats: {
        stream: null,
        record: {
          active: true,
          paused: false,
          bytes: 0,
          frames: 0,
          file: '/a.mp4',
          seconds: 3,
          error: null,
        },
      },
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
    const t = currentToasts().find((x) => x.message === 'Stop recording to switch')
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

  it('passes nextId to onProfileChange on switch/New and offers Restart only for restart notes', async () => {
    let currentProfile = 'default'
    const { desk, reloadPrefs, onProfileChange, switchShelf, newShelf } = makeShelfDesk({
      shelf: async (kind: string) =>
        kind === 'collections'
          ? { current: 'main', list: [{ id: 'main', name: 'Main' }] }
          : {
              current: currentProfile,
              list: [
                { id: 'default', name: 'Default' },
                { id: 'hd', name: 'HD 1080p' },
              ],
            },
      switchShelf: vi
        .fn()
        .mockImplementationOnce(async (_kind: string, id: string) => {
          currentProfile = id
          return {
            id,
            note: 'The sound rate applies after Ferrocast restarts.',
          }
        })
        .mockImplementationOnce(async (_kind: string, id: string) => {
          currentProfile = id
          return {
            id,
            note: "Headphones can't play sound; the system's device is used.",
          }
        }),
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
    expect(onProfileChange).toHaveBeenCalledWith('hd')
    expect(reloadPrefs).not.toHaveBeenCalled()
    // Single warn toast carries the restart note + Restart button directly from `res.note`.
    const toasts = currentToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.tone).toBe('warn')
    expect(toasts[0]?.hint).toBe('The sound rate applies after Ferrocast restarts.')
    expect(toasts[0]?.action?.label).toBe('Restart')
    dismissToast(toasts[0]!.id)

    // Non-restart `note` stays a calm info toast without a Restart button.
    await act(async () => profBtn.click())
    const defItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Default'),
    ) as HTMLButtonElement
    await act(async () => defItem.click())
    await flushMicro()
    const nonRestartToast = currentToasts()[0]
    expect(nonRestartToast?.tone).toBe('info')
    expect(nonRestartToast?.action).toBeUndefined()
    dismissToast(nonRestartToast!.id)

    // Profile New passes new id to onProfileChange AND shows a confirmation toast.
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
    expect(onProfileChange).toHaveBeenCalledWith('clean-720p')
    expect(currentToasts().some((t) => /Clean 720p/i.test(t.message))).toBe(true)
  })

  it('shows confirmation toasts for collection Duplicate and Rename, prevents dialog close while submitting, and preserves trigger focus during switch', async () => {
    let resolveSwitch!: (v: { id: string }) => void
    const pendingSwitch = new Promise<{ id: string }>((r) => {
      resolveSwitch = r
    })
    let resolveNew!: (v: { id: string }) => void
    const pendingNew = new Promise<{ id: string }>((r) => {
      resolveNew = r
    })
    const { desk, newShelf, renameShelf, switchShelf } = makeShelfDesk({
      switchShelf: vi.fn(() => pendingSwitch),
      newShelf: vi.fn((_k: string, name: string) =>
        name === 'Slow New' ? pendingNew : Promise.resolve({ id: 'main-backup' }),
      ),
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
    const rowMenuBtn = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Rename'),
    ) as HTMLButtonElement
    await act(async () => rowMenuBtn.click())
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

    // Mid-submit naming dialog ignores cancel/Escape close so user input isn't lost.
    await act(async () => colBtn.click())
    const newItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('New scene collection'),
    ) as HTMLButtonElement
    await act(async () => newItem.click())
    const slowInput = document.querySelector('dialog[open] input') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(slowInput, 'Slow New')
      slowInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const slowSubmit = Array.from(document.querySelectorAll('dialog[open] button')).find((b) =>
      b.textContent?.includes('Make it'),
    ) as HTMLButtonElement
    await act(async () => {
      slowSubmit.click()
    })
    const closeBtn = document.querySelector(
      'dialog[open] button[aria-label="Close"]',
    ) as HTMLButtonElement | null
    await act(async () => {
      document
        .querySelector('dialog[open]')
        ?.dispatchEvent(new Event('cancel', { cancelable: true }))
      closeBtn?.click()
    })
    expect(document.querySelector('dialog[open]')).not.toBeNull()
    resolveNew({ id: 'slow-new' })
    await flushMicro()
    expect(document.querySelector('dialog[open]')).toBeNull()

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

    // Switch while in-flight marks both pills aria-disabled, blocks rapid clicks, and preserves trigger focus.
    await act(async () => colBtn.click())
    const podcastItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Podcast'),
    ) as HTMLButtonElement
    await act(async () => {
      podcastItem.click()
      podcastItem.click()
    })
    const profBtn = host.querySelector('button[aria-label="profile: Default"]') as HTMLButtonElement
    expect(colBtn.getAttribute('aria-disabled')).toBe('true')
    expect(profBtn.getAttribute('aria-disabled')).toBe('true')
    expect(colBtn.disabled).toBe(false)
    expect(document.activeElement).toBe(colBtn)
    expect(switchShelf).toHaveBeenCalledTimes(1)
    resolveSwitch({ id: 'podcast' })
    await flushMicro()
  })

  it('retries shelf load errors with accessible visible Retry chip and clamps >100 char import names', async () => {
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
      'button[aria-label="Retry loading scene collections"]',
    ) as HTMLButtonElement
    expect(retryBtn).not.toBeNull()
    expect(retryBtn.disabled).toBe(false)
    const retryLabel = retryBtn.querySelector('span.truncate')
    expect(retryLabel?.textContent).toBe('Retry')
    expect(retryLabel?.className).not.toContain('hidden')
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
