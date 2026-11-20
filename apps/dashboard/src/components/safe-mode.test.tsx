import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, type SafeModeStatus, type Status } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import {
  SafeModeBanner,
  SafeModeScreen,
  heldBackItems,
  isSafeModeLocked,
  resolveSafeMode,
  safeModeSummary,
} from './safe-mode'

let root: Root | null = null

const crashSafeMode: SafeModeStatus = {
  unclean_exit: true,
  active: true,
  offer: true,
  collection_pending: true,
  plugins_disabled: true,
  vsts_disabled: true,
  auto_start_disabled: true,
  reason: 'Ferrocast closed unexpectedly last time.',
}

const flagSafeMode: SafeModeStatus = {
  unclean_exit: false,
  active: true,
  offer: false,
  collection_pending: true,
  plugins_disabled: true,
  vsts_disabled: true,
  auto_start_disabled: true,
  reason: 'Started in Safe Mode (--safe-mode).',
}

function seedStatus(safeMode?: SafeModeStatus): Status {
  return {
    version: '3.4.0',
    port: 47820,
    live: { twitch: false, youtube: false, kick: false },
    connectors: {} as Status['connectors'],
    setup_done: true,
    ...(safeMode ? { safe_mode: safeMode } : {}),
  }
}

async function mount(node: React.ReactElement): Promise<HTMLDivElement> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () => root!.render(node))
  return el
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null, status: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

describe('Safe Mode helpers', () => {
  it('lists every held-back protection with calm one-line labels and (i) details', () => {
    expect(heldBackItems(crashSafeMode).map((x) => x.label)).toEqual([
      'Plugins paused',
      'Audio VSTs paused',
      'Auto-start off',
      'Saved scenes held back',
    ])
    expect(isSafeModeLocked(crashSafeMode)).toBe(false)
    expect(isSafeModeLocked(flagSafeMode)).toBe(true)
    expect(safeModeSummary(crashSafeMode).line).toBe(
      'Safe Mode: plugins, VSTs, auto-start and saved scenes held back.',
    )
    expect(safeModeSummary({ ...crashSafeMode, collection_pending: false }).line).toBe(
      'Safe Mode: plugins, VSTs and auto-start held back.',
    )
  })
})

describe('a slow Studio status asked for before the streamer chose', () => {
  it('does not bring "saved scenes held back" and its Load button back', async () => {
    vi.useFakeTimers()
    try {
      const afterConfirm: SafeModeStatus = {
        ...crashSafeMode,
        offer: false,
        collection_pending: false,
      }
      const client = {
        request: vi.fn(async () => ({ available: true, running: true, safe_mode: afterConfirm })),
        status: vi.fn(async () => seedStatus(afterConfirm)),
      }
      useLive.setState({ conn: { client } as never, status: seedStatus(crashSafeMode) })

      // The desk asks the engine for its status at t=1000; the answer is slow.
      vi.setSystemTime(1000)
      const askedAt = Date.now()
      // At t=2000 the streamer loads their scenes (the engine answers).
      vi.setSystemTime(2000)
      await resolveSafeMode(client as never, { safe_mode: true, confirm_collection: true })
      expect(useLive.getState().status?.safe_mode?.collection_pending).toBe(false)
      // At t=8000 the old status arrives, still saying "pending".
      vi.setSystemTime(8000)
      useLive.getState().setSafeMode(crashSafeMode, askedAt)
      expect(useLive.getState().status?.safe_mode?.collection_pending).toBe(false)
      // A status asked for after the choice is believed (the engine can change by itself).
      useLive.getState().setSafeMode(crashSafeMode, 8000)
      expect(useLive.getState().status?.safe_mode?.collection_pending).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SafeModeScreen', () => {
  it('shows held-back features behind (i) and sends { safe_mode: true, confirm_collection: true } on Load my scenes', async () => {
    const calls: [string, string, unknown?][] = []
    const afterConfirm: SafeModeStatus = {
      ...crashSafeMode,
      offer: false,
      collection_pending: false,
    }
    const client = {
      request: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push([method, path, body])
        return {
          available: true,
          running: true,
          version: '3.4.0',
          renderer: 'Metal',
          detail: null,
          safe_mode: afterConfirm,
        }
      }),
      status: vi.fn(async () => seedStatus(afterConfirm)),
    }
    useLive.setState({ conn: { client } as never, status: seedStatus(crashSafeMode) })
    const onResolved = vi.fn()

    const el = await mount(<SafeModeScreen safeMode={crashSafeMode} onResolved={onResolved} />)

    expect(el.textContent).toContain('Started in Safe Mode')
    expect(el.textContent).toContain('Ferrocast closed unexpectedly last time.')
    expect(el.textContent).toContain('Plugins paused')
    expect(el.textContent).toContain('Audio VSTs paused')
    expect(el.textContent).toContain('Auto-start off')
    expect(el.textContent).toContain('Saved scenes held back')
    // Details stay hidden behind (i) until expanded.
    expect(el.textContent).not.toContain('Built-in audio filters still work.')

    const vstInfo = el.querySelector(
      'button[aria-label="More about Audio VSTs paused"]',
    ) as HTMLButtonElement
    await act(async () => vstInfo.click())
    expect(el.textContent).toContain('Built-in audio filters still work.')

    const loadBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load my scenes'),
    ) as HTMLButtonElement
    await act(async () => loadBtn.click())

    expect(calls).toEqual([
      ['POST', '/api/v1/studio/engine/start', { safe_mode: true, confirm_collection: true }],
    ])
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(useLive.getState().status?.safe_mode?.collection_pending).toBe(false)
    expect(currentToasts().some((t) => t.message === 'Scenes loaded in Safe Mode.')).toBe(true)
  })

  it('sends { safe_mode: false, confirm_collection: true } on Start normally', async () => {
    const calls: [string, string, unknown?][] = []
    const client = {
      request: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push([method, path, body])
        return { available: true, running: true, version: '3.4.0', renderer: 'Metal', detail: null }
      }),
      status: vi.fn(async () =>
        seedStatus({
          ...crashSafeMode,
          active: false,
          offer: false,
          collection_pending: false,
          plugins_disabled: false,
          vsts_disabled: false,
          auto_start_disabled: false,
        }),
      ),
    }
    useLive.setState({ conn: { client } as never, status: seedStatus(crashSafeMode) })
    const onResolved = vi.fn()

    const el = await mount(<SafeModeScreen safeMode={crashSafeMode} onResolved={onResolved} />)
    const normalBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start normally'),
    ) as HTMLButtonElement
    await act(async () => normalBtn.click())

    expect(calls).toEqual([
      ['POST', '/api/v1/studio/engine/start', { safe_mode: false, confirm_collection: true }],
    ])
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(useLive.getState().status?.safe_mode?.active).toBe(false)
  })

  it('hides Start normally when locked by --safe-mode and surfaces inline errors cleanly', async () => {
    const client = {
      request: vi.fn(async () => {
        throw new ApiError(
          409,
          'safe_mode_locked',
          'Ferrocast was started with --safe-mode.',
          'Restart Ferrocast normally to turn plugins and auto-start back on.',
        )
      }),
      status: vi.fn(async () => seedStatus(flagSafeMode)),
    }
    useLive.setState({ conn: { client } as never, status: seedStatus(flagSafeMode) })
    const onResolved = vi.fn()

    const el = await mount(<SafeModeScreen safeMode={flagSafeMode} onResolved={onResolved} />)
    expect(
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Start normally'),
      ),
    ).toBeUndefined()
    expect(el.textContent).toContain('--safe-mode')

    // Triggering an error on Load my scenes displays an accessible role="alert" inline.
    const loadBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load my scenes'),
    ) as HTMLButtonElement
    await act(async () => loadBtn.click())
    const alert = el.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Ferrocast was started with --safe-mode.')
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('SafeModeBanner shows calm one-line status and allows switching to Normal Mode', async () => {
    const request = vi.fn(async () => ({
      available: true,
      running: true,
      version: '3.4.0',
      renderer: 'Metal',
      detail: null,
    }))
    const client = {
      request,
      status: vi.fn(async () => seedStatus()),
    }
    const activeLoaded: SafeModeStatus = {
      ...crashSafeMode,
      offer: false,
      collection_pending: false,
    }
    useLive.setState({ conn: { client } as never, status: seedStatus(activeLoaded) })

    const el = await mount(<SafeModeBanner safeMode={activeLoaded} />)
    expect(el.textContent).toContain('Safe Mode: plugins, VSTs and auto-start held back.')
    expect(
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Load my scenes'),
      ),
    ).toBeUndefined()
    const normalBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start normally'),
    ) as HTMLButtonElement
    expect(normalBtn).toBeDefined()
    await act(async () => normalBtn.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/studio/engine/start', {
      safe_mode: false,
      confirm_collection: true,
    })
  })
})
