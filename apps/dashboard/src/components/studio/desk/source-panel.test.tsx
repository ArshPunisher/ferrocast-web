import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineFilter } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { SourcePanel } from './source-panel'

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountFilters(
  initial: EngineFilter[],
  editFilter: (source: string, filter: string, act: string) => Promise<void>,
) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const filters = vi.fn(async () => initial)
  useLive.setState({ conn: { client: {} } as never })
  const desk = {
    api: {
      filters,
      editFilter,
      levels: async () => ({}),
    },
    audio: {
      data: [
        {
          name: 'Mic',
          kind: 'coreaudio_input_capture',
          channel: 1,
          volume_db: 0,
          muted: false,
          monitor: 'off',
        },
      ],
      set: vi.fn(),
      reload: vi.fn(),
    },
    items: { data: [], set: vi.fn(), reload: vi.fn() },
    kinds: {
      data: {
        inputs: [{ id: 'coreaudio_input_capture', name: 'Microphone' }],
        filters: [
          { id: 'expander_filter', name: 'Expander' },
          { id: 'upward_compressor_filter', name: 'Upward Compressor' },
        ],
        transitions: [],
        encoders: [],
        outputs: [],
      },
    },
    scene: 'Main',
    canvas: 'main',
    editing: 'Mic',
    edit: vi.fn(),
    editTab: 'filters',
    refresh: vi.fn(),
    undone: 0,
  } as unknown as Desk

  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <DeskProvider value={desk}>
        <SourcePanel />
      </DeskProvider>,
    ),
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return { host, filters }
}

describe('instant filter toggle (no reload)', () => {
  it('flips the filter switch immediately before the request resolves and never reloads the list', async () => {
    const req = deferred<void>()
    const editFilter = vi.fn(() => req.promise)
    const { host, filters } = await mountFilters(
      [{ name: 'Quieten the room', kind: 'expander_filter', enabled: true }],
      editFilter,
    )
    expect(filters).toHaveBeenCalledTimes(1)

    const sw = host.querySelector(
      'button[role="switch"][aria-label="Quieten the room on"]',
    ) as HTMLButtonElement
    expect(sw).not.toBeNull()
    expect(sw.getAttribute('aria-checked')).toBe('true')

    // Click while editFilter is still pending: UI flips synchronously!
    await act(async () => sw.click())
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(editFilter).toHaveBeenCalledWith('Mic', 'Quieten the room', 'disable')

    // Resolving must NOT trigger a GET /filters reload.
    await act(async () => {
      req.resolve()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(filters).toHaveBeenCalledTimes(1)
  })

  it('reverts and shows a toast if editFilter rejects, without reverting a newer click', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    let call = 0
    const editFilter = vi.fn(() => (++call === 1 ? first.promise : second.promise))
    const { host } = await mountFilters(
      [{ name: 'Lift quiet sounds', kind: 'upward_compressor_filter', enabled: true }],
      editFilter,
    )
    const sw = host.querySelector(
      'button[role="switch"][aria-label="Lift quiet sounds on"]',
    ) as HTMLButtonElement

    // Toggle off (req 1), then immediately back on (req 2).
    await act(async () => sw.click())
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await act(async () => sw.click())
    expect(sw.getAttribute('aria-checked')).toBe('true')

    // If req 1 rejects late, req 2's state ('true') stays intact.
    await act(async () => {
      first.reject(new Error('stale error'))
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(sw.getAttribute('aria-checked')).toBe('true')

    // If the latest request rejects, it reverts to 'false' and shows an error toast.
    await act(async () => {
      second.reject(new Error('Engine busy'))
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(currentToasts().some((t) => t.tone === 'error')).toBe(true)
  })

  it('does not corrupt another source when a slow toggle fails after switching sources', async () => {
    const req = deferred<void>()
    const editFilter = vi.fn(() => req.promise)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const filters = vi.fn(async (src: string) =>
      src === 'Mic'
        ? [{ name: 'Shared', kind: 'expander_filter', enabled: true }]
        : [{ name: 'Shared', kind: 'expander_filter', enabled: true }],
    )
    useLive.setState({ conn: { client: {} } as never })
    const makeDesk = (editing: string) =>
      ({
        api: { filters, editFilter, levels: async () => ({}) },
        audio: {
          data: [
            {
              name: 'Mic',
              kind: 'coreaudio_input_capture',
              channel: 1,
              volume_db: 0,
              muted: false,
              monitor: 'off',
            },
            {
              name: 'Desk',
              kind: 'coreaudio_output_capture',
              channel: 2,
              volume_db: 0,
              muted: false,
              monitor: 'off',
            },
          ],
          set: vi.fn(),
          reload: vi.fn(),
        },
        items: { data: [], set: vi.fn(), reload: vi.fn() },
        kinds: {
          data: {
            inputs: [],
            filters: [{ id: 'expander_filter', name: 'Expander' }],
            transitions: [],
            encoders: [],
            outputs: [],
          },
        },
        scene: 'Main',
        canvas: 'main',
        editing,
        edit: vi.fn(),
        editTab: 'filters',
        refresh: vi.fn(),
        undone: 0,
      }) as unknown as Desk

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <DeskProvider value={makeDesk('Mic')}>
          <SourcePanel />
        </DeskProvider>,
      ),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const micSwitch = host.querySelector(
      'button[role="switch"][aria-label="Shared on"]',
    ) as HTMLButtonElement
    await act(async () => micSwitch.click())
    expect(micSwitch.getAttribute('aria-checked')).toBe('false')

    // Switch drawer to Desk before Mic's toggle fails.
    await act(async () =>
      root!.render(
        <DeskProvider value={makeDesk('Desk')}>
          <SourcePanel />
        </DeskProvider>,
      ),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const deskSwitch = host.querySelector(
      'button[role="switch"][aria-label="Shared on"]',
    ) as HTMLButtonElement
    expect(deskSwitch.getAttribute('aria-checked')).toBe('true')

    // Mic's late failure must NOT flip Desk's identically named filter off.
    await act(async () => {
      req.reject(new Error('Mic offline'))
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(deskSwitch.getAttribute('aria-checked')).toBe('true')
  })
})
