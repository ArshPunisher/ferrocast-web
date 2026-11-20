import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineFilter, EngineItem } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { SourcePanel } from './source-panel'
import { filterApi } from './item-filters'

// A camera in the Vertical canvas: its filter drawer edits this picture's own filters when it
// has them ("This picture only"), else the source's ("Everywhere this source is used").

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

const shared: EngineFilter[] = [{ name: 'Round', kind: 'ferrocast_rounded_corners', enabled: true }]
const own: EngineFilter[] = [
  { name: 'Round', kind: 'ferrocast_rounded_corners', enabled: true, scope: 'item' },
]

const camera = (own_filters: boolean): EngineItem =>
  ({
    id: 5,
    name: 'Camera',
    kind: 'av_capture_input',
    visible: true,
    locked: false,
    audio: false,
    group: false,
    children: [],
    own_filters,
  }) as unknown as EngineItem

function engine() {
  return {
    filters: vi.fn(async () => shared),
    itemFilters: vi.fn(async () => own),
    editFilter: vi.fn(async () => undefined),
    editItemFilter: vi.fn(async () => undefined),
    setItemFilterScope: vi.fn(async () => camera(true)),
    sourcePicture: vi.fn(async () => ({ image: null })),
    itemPicture: vi.fn(async () => ({ image: null })),
    levels: async () => ({}),
  }
}

async function mount(item: EngineItem | null, api: ReturnType<typeof engine>) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useLive.setState({ conn: { client: {} } as never })
  const refresh = vi.fn()
  const desk = {
    api,
    audio: { data: [], set: vi.fn(), reload: vi.fn() },
    items: { data: item ? [item] : [], set: vi.fn(), reload: vi.fn() },
    kinds: {
      data: {
        inputs: [{ id: 'av_capture_input', name: 'Camera' }],
        filters: [{ id: 'ferrocast_rounded_corners', name: 'Rounded corners' }],
        transitions: [],
        encoders: [],
        outputs: [],
      },
    },
    scene: 'Vertical',
    canvas: 'vertical',
    editing: 'Camera',
    edit: vi.fn(),
    editTab: 'filters',
    refresh,
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
    await new Promise((r) => setTimeout(r, 30))
  })
  return { host, refresh }
}

const scope = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-testid="filter-scope"]')
const scopeSwitch = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="This picture only"]')

describe('the filter drawer of a scene item', () => {
  it('shared: says so, lists the source’s filters, and the switch is off', async () => {
    const api = engine()
    const { host } = await mount(camera(false), api)
    expect(scope(host)?.textContent).toContain('Everywhere this source is used')
    expect(scopeSwitch(host)?.getAttribute('aria-checked')).toBe('false')
    expect(api.filters).toHaveBeenCalledWith('Camera')
    expect(api.itemFilters).not.toHaveBeenCalled()
    // Its explanation is behind the (i), not on the line.
    expect(host.querySelector('[aria-label="About these filters"]')).not.toBeNull()
  })

  it('the switch gives this picture its own copy, then the lists are read again', async () => {
    const api = engine()
    const { host, refresh } = await mount(camera(false), api)
    await act(async () => scopeSwitch(host)?.click())
    expect(api.setItemFilterScope).toHaveBeenCalledWith('Vertical', 5, true)
    expect(refresh).toHaveBeenCalled()
  })

  it('own: says "This picture only", edits go to the item, never the source', async () => {
    const api = engine()
    const { host } = await mount(camera(true), api)
    expect(scope(host)?.textContent).toContain('This picture only')
    expect(scopeSwitch(host)?.getAttribute('aria-checked')).toBe('true')
    expect(api.itemFilters).toHaveBeenCalledWith('Vertical', 5)
    expect(api.filters).not.toHaveBeenCalled()
    const sw = host.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Round on"]')
    expect(sw).not.toBeNull()
    await act(async () => sw?.click())
    expect(api.editItemFilter).toHaveBeenCalledWith('Vertical', 5, 'Round', 'disable')
    expect(api.editFilter).not.toHaveBeenCalled()
  })

  it('the switch goes back to the shared filters', async () => {
    const api = engine()
    const { host } = await mount(camera(true), api)
    await act(async () => scopeSwitch(host)?.click())
    expect(api.setItemFilterScope).toHaveBeenCalledWith('Vertical', 5, false)
  })

  it('a source not in this scene (no item) has no scope line', async () => {
    const api = engine()
    const { host } = await mount(null, api)
    expect(scope(host)).toBeNull()
  })
})

describe('filterApi', () => {
  it('routes by whether the item has its own filters', async () => {
    const api = engine() as never as Parameters<typeof filterApi>[0]
    const a = engine()
    const shared = filterApi(a as never, 'Vertical', camera(false))
    await shared.editFilter('Camera', 'Round', 'up')
    expect(a.editFilter).toHaveBeenCalledWith('Camera', 'Round', 'up')
    const mine = filterApi(a as never, 'Vertical', camera(true))
    await mine.editFilter('Camera', 'Round', 'up')
    expect(a.editItemFilter).toHaveBeenCalledWith('Vertical', 5, 'Round', 'up')
    await mine.picture('Camera', 640, true)
    expect(a.itemPicture).toHaveBeenCalledWith('Vertical', 5, 640, true)
    // The picture without filters is the source's own, whichever list.
    await mine.picture('Camera', 640, false)
    expect(a.sourcePicture).toHaveBeenCalledWith('Camera', 640, false)
    expect(api).toBeDefined()
  })
})
