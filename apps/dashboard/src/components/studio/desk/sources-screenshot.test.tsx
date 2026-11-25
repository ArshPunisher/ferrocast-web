import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineItem, EngineStats } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { DeskProvider, type Desk } from './common'
import { SourcesDock } from './sources'

vi.mock('./layout', () => ({
  DockHeader: ({ title }: { title?: React.ReactNode }) => <header>{title ?? 'Sources'}</header>,
}))

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  currentToasts().forEach((t) => dismissToast(t.id))
})

function makeItem(overrides: Partial<EngineItem> = {}): EngineItem {
  return {
    id: 7,
    name: 'Camera',
    kind: 'av_capture_input_v2',
    visible: true,
    locked: false,
    audio: false,
    group: false,
    children: [],
    blend: 'normal',
    scale_filter: 'off',
    own_filters: false,
    ...overrides,
  } as EngineItem
}

async function mountSources(item: EngineItem) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const screenshot = vi.fn(async () => ({ file: '/recordings/Camera.png' }))
  const itemMenu: Desk['itemMenu'] = { current: null }
  const desk = {
    api: {
      screenshot,
      clipboard: vi.fn(async () => null),
      setItemTransition: vi.fn(async () => undefined),
    },
    scenes: {
      data: { scenes: [], current: 'Gameplay', vertical: null, preview: null },
      set: vi.fn(),
      reload: vi.fn(),
    },
    scene: 'Gameplay',
    canvas: 'main',
    setCanvas: vi.fn(),
    size: { width: 1920, height: 1080 },
    pictureScenes: [],
    pictureCurrent: 'Gameplay',
    allScenes: [],
    items: { data: [item], set: vi.fn(), reload: vi.fn() },
    audio: { data: [], set: vi.fn(), reload: vi.fn() },
    kinds: {
      data: { inputs: [], filters: [], transitions: [], encoders: [], outputs: [] },
      set: vi.fn(),
      reload: vi.fn(),
    },
    prefs: { data: null, set: vi.fn(), reload: vi.fn() },
    refresh: vi.fn(),
    undone: 0,
    selected: item.id,
    select: vi.fn(),
    also: [],
    pickMore: vi.fn(),
    pickSet: vi.fn(),
    itemMenu,
    editing: null,
    edit: vi.fn(),
    editTab: null,
    adding: null,
    setAdding: vi.fn(),
    stats: null as EngineStats | null,
    setStats: vi.fn(),
    clip: null,
    setClip: vi.fn(),
    filterClip: null,
    setFilterClip: vi.fn(),
    screens: { data: [], set: vi.fn(), reload: vi.fn() },
  } as unknown as Desk

  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <DeskProvider value={desk}>
        <SourcesDock />
      </DeskProvider>,
    )
  })
  return { host, desk, screenshot }
}

function clickMenuScreenshot() {
  const buttons = Array.from(document.body.querySelectorAll('button, [role="menuitem"]'))
  const item = buttons.find((el) => el.textContent?.trim() === 'Screenshot')
  expect(item).toBeTruthy()
  ;(item as HTMLElement).click()
}

describe('SourcesDock item screenshot', () => {
  it('passes scene and item id from the Sources list right-click Screenshot action', async () => {
    const cam = makeItem({ id: 7, name: 'Camera' })
    const { host, screenshot } = await mountSources(cam)

    const row = host.querySelector('[data-item-id="7"]') as HTMLElement
    expect(row).toBeTruthy()
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 40,
        }),
      )
    })
    await act(async () => {
      clickMenuScreenshot()
    })

    expect(screenshot).toHaveBeenCalledWith('Camera', { scene: 'Gameplay', item: 7 })
  })

  it('passes scene and item id from the Preview right-click menu Screenshot action', async () => {
    const cam = makeItem({ id: 12, name: 'Camera' })
    const { desk, screenshot } = await mountSources(cam)
    expect(desk.itemMenu.current).toBeTypeOf('function')

    await act(async () => {
      const dummy = document.createElement('div')
      desk.itemMenu.current?.(
        {
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
          clientX: 100,
          clientY: 120,
          currentTarget: dummy,
        } as unknown as React.MouseEvent,
        12,
      )
    })
    await act(async () => {
      clickMenuScreenshot()
    })

    expect(screenshot).toHaveBeenCalledWith('Camera', { scene: 'Gameplay', item: 12 })
  })
})
