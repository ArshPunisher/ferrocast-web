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
