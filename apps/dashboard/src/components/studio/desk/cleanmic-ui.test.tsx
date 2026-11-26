// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { CLEAN_EXPANDER_FILTER, CLEAN_MIC_UPDATE_SKIP_KEY } from './cleanmic'
import { CleanMicControl } from './cleanmic-ui'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Clean up my mic', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    localStorage.removeItem(CLEAN_MIC_UPDATE_SKIP_KEY)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    localStorage.removeItem(CLEAN_MIC_UPDATE_SKIP_KEY)
    currentToasts().forEach((t) => dismissToast(t.id))
  })
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  const mount = async (api: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const onReload = vi.fn()
    await act(async () =>
      root.render(
        <CleanMicControl
          api={api as never}
          name="Mic"
          level={undefined}
          filters={[]}
          onReload={onReload}
          {...(extra as object)}
        />,
      ),
    )
    return { onReload }
  }
  const press = async (label: RegExp) => {
    const b = [...host.querySelectorAll('button')].find((x) => label.test(x.textContent ?? ''))
    await act(async () => b?.click())
  }

  it('takes back what it added when a step fails, and says so where the button is', async () => {
    let n = 0
    const api = {
      addFilter: vi.fn(async () => {
        if (++n === 3) throw new Error('The mic went away.')
      }),
      editFilter: vi.fn(async () => undefined),
      removeFilter: vi.fn(async () => undefined),
    }
    const { onReload } = await mount(api)
    await press(/Clean up my mic/)
    expect(api.removeFilter).toHaveBeenCalledTimes(2)
    expect(onReload).toHaveBeenCalled()
    expect(host.textContent).toMatch(/didn.t finish|nothing was changed|try again/i)
    // The button is still there to try again.
    expect(
      [...host.querySelectorAll('button')].some((b) => /Clean up my mic/.test(b.textContent ?? '')),
    ).toBe(true)
  })

  it('puts the gain first, or takes everything back when that fails', async () => {
    const api = {
      addFilter: vi.fn(async () => undefined),
      editFilter: vi.fn(async () => {
        throw new Error('busy')
      }),
      removeFilter: vi.fn(async () => undefined),
    }
    await mount(api)
    // A quiet voice: the plan then starts with a boost, which is moved to the top.
    for (let i = 0; i < 12; i++)
      await act(async () =>
        root.render(
          <CleanMicControl
            api={api as never}
            name="Mic"
            level={
              { peak: [-40 - (i % 2), -45], magnitude: [-50, -50], input_peak: [-40, -45] } as never
            }
            filters={[]}
            onReload={() => undefined}
          />,
        ),
      )
    await press(/Clean up my mic/)
    expect(api.editFilter).toHaveBeenCalled()
    expect(api.removeFilter.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('offers a retry when the filters could not be read, instead of no button', async () => {
    const { onReload } = await mount({}, { filters: null })
    const btn = [...host.querySelectorAll('button')].find((b) =>
      /try again|retry/i.test(b.textContent ?? ''),
    )
    expect(btn).toBeDefined()
    expect(btn?.textContent?.trim()).toBe('Try again')
    expect(host.textContent).toContain('Couldn’t read your mic’s filters.')
    await press(/Try again/)
    expect(onReload).toHaveBeenCalled()
  })

  it('renders a compact bordered tile with title, hint, action slot, and optional voice footer', async () => {
    const api = {
      addFilter: vi.fn(async () => undefined),
      editFilter: vi.fn(async () => undefined),
      removeFilter: vi.fn(async () => undefined),
    }
    await mount(api, { footer: <div data-testid="voice-footer">Presets</div> })
    const tile = host.querySelector('[data-testid="clean-mic-tile"]') as HTMLElement | null
    expect(tile).not.toBeNull()
    expect(tile?.className).toContain('border')
    expect(tile?.textContent).toContain('Auto mic cleanup')
    expect(tile?.textContent).toContain('Clean up my mic')
    expect(tile?.querySelector('[data-testid="voice-footer"]')).not.toBeNull()
    const sparkle = tile?.querySelector('button svg')
    expect(sparkle?.getAttribute('aria-hidden')).toBe('true')
  })

  it('defaults Auto boost ON and skips boost + Raise a quiet mic when turned OFF before cleanup', async () => {
    const added: { kind: string; name: string; settings?: Record<string, unknown> }[] = []
    const api = {
      addFilter: vi.fn(
        async (
          _src: string,
          spec: { kind: string; name: string; settings?: Record<string, unknown> },
        ) => {
          added.push(spec)
        },
      ),
      editFilter: vi.fn(async () => undefined),
      removeFilter: vi.fn(async () => undefined),
      filterSettings: vi.fn(async () => ({})),
    }
    await mount(api)

    const sw = host.querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw).not.toBeNull()
    expect(sw.getAttribute('aria-checked')).toBe('true')

    // Feed quiet voice samples that would normally schedule Raise a quiet mic.
    for (let i = 0; i < 12; i++) {
      await act(async () =>
        root.render(
          <CleanMicControl
            api={api as never}
            name="Mic"
            level={
              { peak: [-40 - (i % 2), -45], magnitude: [-50, -50], input_peak: [-40, -45] } as never
            }
            filters={[]}
            onReload={() => undefined}
          />,
        ),
      )
    }

    await act(async () => sw.click())
    expect(sw.getAttribute('aria-checked')).toBe('false')

    await press(/Clean up my mic/)
    expect(added.map((f) => f.kind)).toEqual([
      'noise_suppress_filter_v2',
      'expander_filter',
      'compressor_filter',
      'limiter_filter',
    ])
    const comp = added.find((f) => f.kind === 'compressor_filter')
    expect(comp?.settings).toMatchObject({ output_gain: 0 })
  })

  it('toggles Auto boost after cleanup, remembers previous boost dB, enables disabled compressor, inserts missing expander first, and reloads on undone', async () => {
    let compSettings: Record<string, unknown> = { ratio: 3, threshold: -26, output_gain: 12 }
    const filters = [
      { kind: 'noise_suppress_filter_v2', name: 'Remove background noise', enabled: true },
      { kind: 'expander_filter', name: CLEAN_EXPANDER_FILTER, enabled: true },
      { kind: 'compressor_filter', name: 'Even out loud moments', enabled: true },
      { kind: 'limiter_filter', name: 'Stop clipping', enabled: true },
    ]
    const api = {
      addFilter: vi.fn(async () => undefined),
      editFilter: vi.fn(async () => undefined),
      removeFilter: vi.fn(async () => undefined),
      filterSettings: vi.fn(async () => ({ ...compSettings })),
      updateFilter: vi.fn(async (_n: string, _f: string, next: Record<string, unknown>) => {
        compSettings = { ...next }
      }),
    }
    const { onReload } = await mount(api, { filters, undone: 0 })
    await flush()

    const sw = host.querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')

    await act(async () => sw.click())
    await flush()
    expect(api.updateFilter).toHaveBeenCalledWith('Mic', 'Even out loud moments', {
      ratio: 3,
      threshold: -26,
      output_gain: 0,
    })
    expect(onReload).toHaveBeenCalled()
    expect(currentToasts().some((t) => t.message === 'Auto boost off (0 dB).')).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('false')

    // Toggling back ON restores remembered 12 dB.
    await act(async () => sw.click())
    await flush()
    expect(api.updateFilter).toHaveBeenLastCalledWith('Mic', 'Even out loud moments', {
      ratio: 3,
      threshold: -26,
      output_gain: 12,
    })

    // External undone increment re-fetches filterSettings and syncs switch state.
    compSettings = { ratio: 3, output_gain: 0 }
    await mount(api, { filters, undone: 1 })
    await flush()
    expect((host.querySelector('[role="switch"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe(
      'false',
    )

    // Un-migrated chain (no expander, disabled 0 dB compressor) on fresh mount: toggling ON inserts expander first and enables compressor.
    act(() => root.unmount())
    root = createRoot(host)
    api.addFilter.mockClear()
    api.editFilter.mockClear()
    api.updateFilter.mockClear()
    const legacyNoBoost = [
      { kind: 'noise_suppress_filter_v2', name: 'Remove background noise', enabled: true },
      { kind: 'compressor_filter', name: 'Even out loud moments', enabled: false },
      { kind: 'limiter_filter', name: 'Stop clipping', enabled: true },
    ]
    await mount(api, { filters: legacyNoBoost, undone: 2 })
    await flush()

    const sw2 = host.querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw2.getAttribute('aria-checked')).toBe('false')

    await act(async () => sw2.click())
    await flush()
    expect(api.addFilter).toHaveBeenCalledWith(
      'Mic',
      expect.objectContaining({ kind: 'expander_filter', name: CLEAN_EXPANDER_FILTER }),
    )
    expect(api.editFilter).toHaveBeenCalledWith('Mic', CLEAN_EXPANDER_FILTER, 'up')
    expect(api.editFilter).toHaveBeenCalledWith('Mic', 'Even out loud moments', 'enable')
    expect(api.updateFilter).toHaveBeenCalledWith('Mic', 'Even out loud moments', {
      ratio: 3,
      output_gain: 9,
    })
  })

  it('rolls back newly inserted expander if updateFilter fails when toggling Auto boost ON', async () => {
    const legacyNoBoost = [
      { kind: 'noise_suppress_filter_v2', name: 'Remove background noise', enabled: true },
      { kind: 'compressor_filter', name: 'Even out loud moments', enabled: true },
      { kind: 'limiter_filter', name: 'Stop clipping', enabled: true },
    ]
    const api = {
      addFilter: vi.fn(async () => undefined),
      editFilter: vi.fn(async () => undefined),
      removeFilter: vi.fn(async () => undefined),
      filterSettings: vi.fn(async () => ({ ratio: 3, output_gain: 0 })),
      updateFilter: vi.fn(async () => {
        throw new Error('Filter write failed')
      }),
    }
    await mount(api, { filters: legacyNoBoost })
    await flush()

    const sw = host.querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await act(async () => sw.click())
    await flush()

    expect(api.addFilter).toHaveBeenCalledWith(
      'Mic',
      expect.objectContaining({ kind: 'expander_filter', name: CLEAN_EXPANDER_FILTER }),
    )
    expect(api.removeFilter).toHaveBeenCalledWith('Mic', CLEAN_EXPANDER_FILTER)
    expect(currentToasts().some((t) => t.tone === 'error')).toBe(true)
  })

  it('offers safe Update cleanup for legacy 3-filter chains, rolls back on failure, and honors Keep current', async () => {
    const legacy = [
      { kind: 'noise_suppress_filter_v2', name: 'Remove background noise', enabled: true },
      { kind: 'compressor_filter', name: 'Even out loud moments', enabled: true },
      { kind: 'limiter_filter', name: 'Stop clipping', enabled: true },
    ]
    const api = {
      addFilter: vi.fn(async () => undefined),
      editFilter: vi.fn(async (): Promise<void> => {
        throw new Error('Cannot reorder')
      }),
      removeFilter: vi.fn(async () => undefined),
      filterSettings: vi.fn(async () => ({ ratio: 3, output_gain: 9 })),
    }
    const { onReload } = await mount(api, { filters: legacy, isLive: true })
    await flush()

    expect(host.textContent).toContain('Update cleanup')
    expect(host.textContent).toContain('Keep current')
    expect(host.textContent).toMatch(/safe live/i)

    // Failing reorder rolls back newly added expander and does not dismiss the offer.
    await press(/Update cleanup/)
    await flush()
    expect(api.removeFilter).toHaveBeenCalledWith('Mic', CLEAN_EXPANDER_FILTER)
    expect(localStorage.getItem(CLEAN_MIC_UPDATE_SKIP_KEY)).toBeNull()

    // Succeeding reorder completes cleanly without rollback.
    api.removeFilter.mockClear()
    api.editFilter.mockClear()
    api.editFilter.mockImplementation(async () => undefined)
    await press(/Update cleanup/)
    await flush()
    expect(api.editFilter).toHaveBeenCalledTimes(2)
    expect(api.removeFilter).not.toHaveBeenCalled()
    expect(onReload).toHaveBeenCalled()

    // Dismissing hides the offer and persists skip key.
    await mount(api, { filters: legacy })
    await flush()
    await press(/Keep current/)
    expect(localStorage.getItem(CLEAN_MIC_UPDATE_SKIP_KEY)).toBe('1')
    expect(host.textContent).not.toContain('Update cleanup')
  })
})
