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
