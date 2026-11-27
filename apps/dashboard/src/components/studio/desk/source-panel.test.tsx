import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineFilter, EngineStats } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { createDeskStatsStore, DeskProvider, type Desk } from './common'
import * as cleanmicUi from './cleanmic-ui'
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

describe('PositionTab grouped child frame sync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates cached frame inside group children when setTransform resolves', async () => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useLive.setState({ conn: { client: {} } as never })

    let cachedItems = [
      {
        id: 10,
        name: 'Cam Group',
        kind: 'group',
        visible: true,
        locked: false,
        audio: false,
        group: true,
        frame: [400, 0, 0, 300, 100, 100],
        children: [
          {
            id: 20,
            name: 'Cam',
            kind: 'av_capture_input_v2',
            visible: true,
            locked: false,
            audio: false,
            group: false,
            frame: [400, 0, 0, 300, 100, 100],
            children: [],
          },
        ],
      },
    ]

    const setTransform = vi.fn(async () => ({
      ...cachedItems[0]!.children[0]!,
      frame: [400, 0, 0, 300, 250, 100],
    }))

    const itemsResource = {
      get data() {
        return cachedItems
      },
      set: vi.fn((updater: (prev: typeof cachedItems | undefined) => typeof cachedItems) => {
        cachedItems = updater(cachedItems)
      }),
      reload: vi.fn(),
    }

    const desk = {
      api: {
        filters: vi.fn(async () => []),
        transform: vi.fn(async () => ({
          x: 100,
          y: 100,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          alignment: 5,
          bounds: 'stretch',
          bounds_alignment: 5,
          bounds_width: 400,
          bounds_height: 300,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 1920,
          height: 1080,
        })),
        setTransform,
        levels: vi.fn(async () => ({})),
      },
      audio: { data: [], set: vi.fn(), reload: vi.fn() },
      items: itemsResource,
      kinds: {
        data: {
          inputs: [{ id: 'av_capture_input_v2', name: 'Camera' }],
          filters: [],
          transitions: [],
          encoders: [],
          outputs: [],
        },
      },
      scene: 'Main',
      canvas: 'main',
      editing: 'Cam',
      edit: vi.fn(),
      editTab: 'position',
      selected: 20,
      size: { width: 1920, height: 1080 },
      refresh: vi.fn(),
      undone: 0,
    } as unknown as Desk

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <SourcePanel />
        </DeskProvider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const xInput = host.querySelector('input[aria-label="X"]') as HTMLInputElement
    expect(xInput).not.toBeNull()
    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    await act(async () => {
      setNativeValue.call(xInput, '250')
      xInput.dispatchEvent(new Event('input', { bubbles: true }))
      xInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setTransform).toHaveBeenCalledTimes(1)
    expect(itemsResource.set).toHaveBeenCalledTimes(1)
    expect(cachedItems[0]!.children[0]!.frame).toEqual([400, 0, 0, 300, 250, 100])
  })
})

describe('CleanMic stats selector subscription', () => {
  it('does not re-render CleanMic on 1 Hz stats ticks when stream.active stays unchanged', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const cleanMicSpy = vi.spyOn(cleanmicUi, 'CleanMicControl')
    useLive.setState({ conn: { client: {} } as never })
    const statsStore = createDeskStatsStore()
    statsStore.set({
      stream: { active: false, reconnecting: false, bytes: 0, frames: 0, dropped: 0, error: null },
      engine: { cpu: 5, fps: 60 },
    } as unknown as EngineStats)

    const desk = {
      api: {
        filters: vi.fn(async () => []),
        levels: vi.fn(async () => ({})),
        sources: vi.fn(async () => []),
        audioByName: vi.fn(async () => null),
        filterSettings: vi.fn(async () => ({})),
      },
      audio: {
        data: [
          {
            name: 'Mic',
            kind: 'coreaudio_input_capture',
            channel: 3,
            volume_db: 0,
            muted: false,
            monitor: 'off',
            balance: 0.5,
            sync_ms: 0,
            mono: false,
            tracks: [1],
            active: true,
          },
        ],
        set: vi.fn(),
        reload: vi.fn(),
      },
      items: { data: [], set: vi.fn(), reload: vi.fn() },
      scenes: { data: { current: 'Main', scenes: [] }, set: vi.fn(), reload: vi.fn() },
      pictureScenes: [{ name: 'Main' }],
      kinds: {
        data: {
          inputs: [{ id: 'coreaudio_input_capture', name: 'Microphone' }],
          filters: [],
          transitions: [],
          encoders: [],
          outputs: [],
        },
      },
      scene: 'Main',
      canvas: 'main',
      editing: 'Mic',
      edit: vi.fn(),
      editTab: 'sound',
      refresh: vi.fn(),
      undone: 0,
    } as unknown as Desk

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk} statsStore={statsStore}>
          <SourcePanel />
        </DeskProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const baseline = cleanMicSpy.mock.calls.length

    await act(async () => {
      statsStore.set({
        stream: {
          active: false,
          reconnecting: false,
          bytes: 500,
          frames: 30,
          dropped: 0,
          error: null,
        },
        engine: { cpu: 22, fps: 60 },
      } as unknown as EngineStats)
    })
    await act(async () => {
      statsStore.set({
        stream: {
          active: false,
          reconnecting: false,
          bytes: 1000,
          frames: 60,
          dropped: 0,
          error: null,
        },
        engine: { cpu: 30, fps: 60 },
      } as unknown as EngineStats)
    })
    expect(cleanMicSpy.mock.calls.length).toBe(baseline)
    cleanMicSpy.mockRestore()
  })

  it('drops buffered unmount edits when collectionKeyRef advances on collection switch and separates Plays in pills with gap-1', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useLive.setState({ conn: { client: {} } as never })
    const update = vi.fn(async () => ({}))
    const collectionKeyRef = { current: 1 }
    const desk = {
      api: {
        sourceOptions: vi.fn(async () => [
          {
            key: 'text',
            label: 'Text',
            kind: 'text',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: [],
            values: [],
            group: [],
            text_type: '',
          },
        ]),
        settings: vi.fn(async () => ({ text: 'Old Collection Text' })),
        update,
        filters: vi.fn(async () => []),
        levels: vi.fn(async () => ({})),
        sources: vi.fn(async () => [{ name: 'Banner', kind: 'ferrocast_text', scenes: ['Main'] }]),
      },
      scenes: { data: { scenes: [{ name: 'Main' }, { name: 'Outro' }] } },
      allScenes: [{ name: 'Main' }, { name: 'Outro' }],
      pictureScenes: [{ name: 'Main' }, { name: 'Outro' }],
      pictureCurrent: 'Main',
      scene: 'Main',
      canvas: 'main',
      audio: {
        data: [
          {
            name: 'Banner',
            kind: 'ferrocast_text',
            channel: null,
            volume_db: 0,
            muted: false,
            monitor: 'off',
          },
        ],
        set: vi.fn(),
        reload: vi.fn(),
      },
      items: {
        data: [
          {
            id: 5,
            name: 'Banner',
            kind: 'ferrocast_text',
            visible: true,
            locked: false,
            audio: true,
            group: false,
            blend: 'normal',
            scale_filter: 'off',
            children: [],
          },
        ],
        set: vi.fn(),
        reload: vi.fn(),
      },
      kinds: {
        data: {
          inputs: [
            {
              id: 'ferrocast_text',
              name: 'Text',
              fields: [{ key: 'text', kind: 'text', label: 'Text' }],
            },
          ],
          filters: [],
          transitions: [],
          encoders: [],
          outputs: [],
        },
      },
      editing: 'Banner',
      edit: vi.fn(),
      editTab: 'sound',
      selected: 5,
      size: { width: 1920, height: 1080 },
      refresh: vi.fn(),
      undone: 0,
      collectionKey: 1,
      collectionKeyRef,
    } as unknown as Desk

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <SourcePanel />
        </DeskProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const rg = host.querySelector('[role="radiogroup"][aria-labelledby="plays-in"]')
    expect(rg?.className).toMatch(/\bgap-1\b/)

    // Switch to Settings tab, type pending change, then bump collectionKeyRef before unmount.
    const settingsTab = host.querySelector('#tab-settings') as HTMLButtonElement | null
    expect(settingsTab).not.toBeNull()
    await act(async () => settingsTab!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const input = host.querySelector('input[type="text"], textarea') as HTMLInputElement | null
    expect(input).not.toBeNull()
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
      set.call(input, 'Unsaved Old Collection Edit')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Simulate closing SourcePanel specifically due to a collection change.
    collectionKeyRef.current = 2
    await act(async () => {
      root!.unmount()
    })
    root = null
    expect(update).not.toHaveBeenCalled()
  })
})
