// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CleanMicControl } from './cleanmic-ui'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Clean up my mic', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
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
    await press(/try again|retry/i)
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
  })
})
