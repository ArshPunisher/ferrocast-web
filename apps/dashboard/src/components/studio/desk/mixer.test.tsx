// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineAudio, EngineItem, EngineStats } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { createDeskStatsStore, DeskProvider, type Desk } from './common'
import { AudioDock, removeConfirmCopy, resolveRemoveTarget } from './mixer'

vi.mock('./layout', () => ({
  DockHeader: ({ title, actions }: { title?: React.ReactNode; actions?: React.ReactNode }) => (
    <header>
      <span>{title ?? 'Audio'}</span>
      {actions}
    </header>
  ),
}))

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

const makeAudio = (over: Partial<EngineAudio> = {}): EngineAudio => ({
  name: 'Mic',
  kind: 'coreaudio_input_capture',
  channel: null,
  volume_db: -4,
  muted: false,
  monitor: 'off',
  active: true,
  ...over,
})

const makeItem = (over: Partial<EngineItem> = {}): EngineItem => ({
  id: 10,
  name: 'Mic',
  kind: 'coreaudio_input_capture',
  visible: true,
  locked: false,
  audio: true,
  group: false,
  blend: 'normal',
  scale_filter: 'off',
  children: [],
  ...over,
})

describe('resolveRemoveTarget and removeConfirmCopy', () => {
  it('resolves global audio channels directly', () => {
    const a = makeAudio({ name: 'Mic', channel: 3 })
    const res = resolveRemoveTarget({
      audio: a,
      scene: 'Main',
      items: [],
      selected: null,
      ownerScenes: [],
    })
    expect(res).toEqual({ mode: 'global', audio: a })
    expect(removeConfirmCopy({ mode: 'global', audio: a }, false)).toEqual({
      title: 'Remove Mic from every scene?',
      description:
        'It plays in every scene. Press Undo to bring it back with its volume and filters.',
    })
    expect(removeConfirmCopy({ mode: 'global', audio: a }, true)).toEqual({
      title: 'Remove Mic from every scene?',
      description:
        'It plays in every scene. Press Undo to bring it back with its volume and filters. Viewers will stop hearing it right away.',
    })
  })

  it('resolves current-scene audio-only and video+audio sources with distinct copy', () => {
    const audioOnly = makeAudio({ name: 'Music', kind: 'coreaudio_output_capture' })
    const camAudio = makeAudio({ name: 'Capture Card', kind: 'av_capture_input_v2' })
    const items = [
      makeItem({ id: 1, name: 'Music', kind: 'coreaudio_output_capture' }),
      makeItem({ id: 2, name: 'Capture Card', kind: 'av_capture_input_v2' }),
    ]
    const t1 = resolveRemoveTarget({
      audio: audioOnly,
      scene: 'Main',
      items,
      selected: null,
      ownerScenes: ['Main'],
    })
    expect(t1).toEqual({ mode: 'scene', audio: audioOnly, scene: 'Main', itemId: 1 })
    expect(removeConfirmCopy(t1 as Extract<typeof t1, { mode: 'scene' }>, false)).toEqual({
      title: 'Remove Music from Main?',
      description: 'Other scenes keep it. Press Undo to bring it back.',
    })

    const t2 = resolveRemoveTarget({
      audio: camAudio,
      scene: 'Main',
      items,
      selected: null,
      ownerScenes: ['Main'],
    })
    expect(t2).toEqual({ mode: 'scene', audio: camAudio, scene: 'Main', itemId: 2 })
    expect(removeConfirmCopy(t2 as Extract<typeof t2, { mode: 'scene' }>, false)).toEqual({
      title: 'Remove Capture Card from Main?',
      description:
        'This removes both its picture and sound from Main. Use Hide to keep it in the scene.',
    })
  })

  it('resolves grouped items in the current scene', () => {
    const child = makeItem({ id: 42, name: 'Guest Mic', kind: 'ffmpeg_source' })
    const grp = makeItem({ id: 40, name: 'Guests', kind: 'group', group: true, children: [child] })
    const res = resolveRemoveTarget({
      audio: makeAudio({ name: 'Guest Mic', kind: 'ffmpeg_source' }),
      scene: 'Main',
      items: [grp],
      selected: 42,
      ownerScenes: ['Main'],
    })
    expect(res).toMatchObject({ mode: 'scene', scene: 'Main', itemId: 42 })
  })

  it('handles All-tab single other scene, All-tab multi-scene, and nested-scene fallback', () => {
    const bgm = makeAudio({ name: 'BGM', kind: 'ffmpeg_source' })
    expect(
      resolveRemoveTarget({
        audio: bgm,
        scene: 'Main',
        items: [],
        selected: null,
        ownerScenes: ['Gameplay'],
      }),
    ).toEqual({ mode: 'lookup_scene', audio: bgm, scene: 'Gameplay' })

    expect(
      resolveRemoveTarget({
        audio: bgm,
        scene: 'Main',
        items: [],
        selected: null,
        ownerScenes: ['Gameplay'],
        otherItems: [makeItem({ id: 88, name: 'BGM', kind: 'ffmpeg_source' })],
      }),
    ).toEqual({ mode: 'scene', audio: bgm, scene: 'Gameplay', itemId: 88 })

    expect(
      resolveRemoveTarget({
        audio: bgm,
        scene: 'Main',
        items: [],
        selected: null,
        ownerScenes: ['Gameplay', 'BRB'],
      }),
    ).toEqual({ mode: 'drawer', audio: bgm, scenes: ['Gameplay', 'BRB'] })

    const nestedOnly = [makeItem({ id: 5, name: 'BGM Scene', kind: 'scene', audio: false })]
    expect(
      resolveRemoveTarget({
        audio: bgm,
        scene: 'Main',
        items: nestedOnly,
        selected: null,
        ownerScenes: ['BGM Scene'],
      }),
    ).toEqual({ mode: 'lookup_scene', audio: bgm, scene: 'BGM Scene' })

    expect(
      resolveRemoveTarget({
        audio: bgm,
        scene: 'Main',
        items: nestedOnly,
        selected: null,
        ownerScenes: [],
      }),
    ).toEqual({ mode: 'drawer', audio: bgm, scenes: [] })
  })
})

describe('AudioDock row and strip Remove', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.removeItem('fc-studio-mixer')
    host = document.body.appendChild(document.createElement('div'))
    useLive.setState({ conn: { client: {} } as never })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host.remove()
    document.body.innerHTML = ''
    localStorage.removeItem('fc-studio-mixer')
    useLive.setState({ conn: null })
    currentToasts().forEach((t) => dismissToast(t.id))
  })

  async function flush() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function makeDesk(opts: {
    audioList: EngineAudio[]
    items?: EngineItem[]
    editing?: string | null
    live?: boolean
    api?: Record<string, unknown>
  }) {
    const edit = vi.fn()
    const refresh = vi.fn()
    const api = {
      audio: vi.fn(async () => opts.audioList),
      items: vi.fn(async () => opts.items ?? []),
      sources: vi.fn(async () => []),
      levels: vi.fn(async () => ({})),
      setAudio: vi.fn(async () => undefined),
      setChannel: vi.fn(async () => undefined),
      editItem: vi.fn(async () => undefined),
      undo: vi.fn(async () => ({ done: 'Remove', undo: null, redo: null })),
      pasteFilters: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
      ...opts.api,
    }
    const statsStore = createDeskStatsStore()
    if (opts.live) {
      statsStore.set({
        stream: { active: true, reconnecting: false, bytes: 0, frames: 0, dropped: 0, error: null },
      } as unknown as EngineStats)
    }
    const desk = {
      api,
      scenes: { data: { current: 'Main', scenes: [] }, set: vi.fn(), reload: vi.fn() },
      scene: 'Main',
      canvas: 'main',
      pictureScenes: [{ name: 'Main' }, { name: 'Gameplay' }, { name: 'BRB' }],
      pictureCurrent: 'Main',
      allScenes: [{ name: 'Main' }, { name: 'Gameplay' }, { name: 'BRB' }],
      items: { data: opts.items ?? [], set: vi.fn(), reload: vi.fn() },
      audio: { data: opts.audioList, set: vi.fn(), reload: vi.fn() },
      kinds: { data: { inputs: [], filters: [], transitions: [], encoders: [], outputs: [] } },
      prefs: { data: {} },
      refresh,
      undone: 0,
      selected: null,
      select: vi.fn(),
      also: [],
      pickMore: vi.fn(),
      pickSet: vi.fn(),
      itemMenu: { current: null },
      editing: opts.editing ?? null,
      edit,
      editTab: null,
      adding: null,
      setAdding: vi.fn(),
      stats: null,
      setStats: statsStore.set,
      clip: null,
      setClip: vi.fn(),
      filterClip: null,
      setFilterClip: vi.fn(),
      screens: { data: [] },
      openSettings: vi.fn(),
    } as unknown as Desk
    return { desk, api, edit, refresh, statsStore }
  }

  async function mountAudio(desk: Desk, statsStore: ReturnType<typeof createDeskStatsStore>) {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk} statsStore={statsStore}>
          <AudioDock />
        </DeskProvider>,
      )
    })
    await flush()
  }

  it('places danger Remove at the bottom of the row menu and strip menu, and confirms + undoes global device removal', async () => {
    localStorage.setItem(
      'fc-studio-mixer',
      JSON.stringify({
        vertical: false,
        locked: ['Mic'],
        hidden: [],
        decay: 'fast',
        activeOnly: false,
      }),
    )
    const mic = makeAudio({ name: 'Mic', channel: 3 })
    const { desk, api, edit, refresh, statsStore } = makeDesk({
      audioList: [mic],
      editing: 'Mic',
      live: true,
    })
    await mountAudio(desk, statsStore)

    const moreBtn = host.querySelector('button[aria-label="More for Mic"]') as HTMLButtonElement
    expect(moreBtn).not.toBeNull()
    await act(async () => moreBtn.click())

    const menu = document.querySelector('[role="menu"][aria-label="Mic"]') as HTMLElement
    expect(menu).not.toBeNull()
    const entries = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
    const last = entries[entries.length - 1] as HTMLElement
    expect(last.textContent).toContain('Remove')
    expect(last.className).toContain('text-danger')
    expect(last.previousElementSibling?.getAttribute('role')).toBe('separator')

    await act(async () => last.click())
    await flush()

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Remove Mic from every scene?')
    expect(dialog.textContent).toContain('Viewers will stop hearing it right away.')

    const removeBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Remove',
    )!
    await act(async () => removeBtn.click())
    await flush()

    expect(api.setChannel).toHaveBeenCalledWith(3, null)
    expect(edit).toHaveBeenCalledWith(null)
    expect(refresh).toHaveBeenCalled()
    // Volume lock preference stays intact so Undo restores it.
    expect(JSON.parse(localStorage.getItem('fc-studio-mixer')!).locked).toContain('Mic')

    const undoToast = currentToasts().find((t) => t.action?.label === 'Undo')
    expect(undoToast).toBeDefined()
    await act(async () => undoToast!.action!.run())
    await flush()
    expect(api.undo).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('removes a scene video+audio source via editItem with picture warning, and removes from vertical strip', async () => {
    localStorage.setItem(
      'fc-studio-mixer',
      JSON.stringify({ vertical: true, locked: [], hidden: [], decay: 'fast', activeOnly: false }),
    )
    const cam = makeAudio({ name: 'Capture Card', kind: 'av_capture_input_v2', channel: null })
    const { desk, api, statsStore } = makeDesk({
      audioList: [cam],
      items: [makeItem({ id: 77, name: 'Capture Card', kind: 'av_capture_input_v2' })],
    })
    await mountAudio(desk, statsStore)

    const stripBtn = host.querySelector(
      'button[aria-label="More for Capture Card"]',
    ) as HTMLButtonElement
    await act(async () => stripBtn.click())
    const menu = document.querySelector('[role="menu"][aria-label="Capture Card"]') as HTMLElement
    const rmItem = [...menu.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Remove'),
    ) as HTMLElement
    await act(async () => rmItem.click())
    await flush()

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Remove Capture Card from Main?')
    expect(dialog.textContent).toContain(
      'This removes both its picture and sound from Main. Use Hide to keep it in the scene.',
    )

    const removeBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Remove',
    )!
    await act(async () => removeBtn.click())
    await flush()

    expect(api.editItem).toHaveBeenCalledWith('Main', 77, 'remove')
    expect(currentToasts().some((t) => t.action?.label === 'Undo')).toBe(true)
  })

  it('opens the Sound drawer tab when removing an All-tab multi-scene source, and surfaces API errors via toast', async () => {
    const bgm = makeAudio({ name: 'BGM', kind: 'ffmpeg_source', channel: null })
    const { desk, api, edit, statsStore } = makeDesk({
      audioList: [],
      items: [],
      api: {
        audio: vi.fn(async (sc: string) => (sc === 'Main' ? [] : [bgm])),
        sources: vi.fn(async () => [
          { name: 'BGM', kind: 'ffmpeg_source', scenes: ['Gameplay', 'BRB'] },
        ]),
      },
    })
    await mountAudio(desk, statsStore)

    const allOpt = [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'All')
    await act(async () => allOpt?.click())
    await flush()

    const moreBtn = host.querySelector('button[aria-label="More for BGM"]') as HTMLButtonElement
    await act(async () => moreBtn.click())
    const menu = document.querySelector('[role="menu"][aria-label="BGM"]') as HTMLElement
    const rmItem = [...menu.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Remove'),
    ) as HTMLElement
    await act(async () => rmItem.click())
    await flush()

    expect(edit).toHaveBeenCalledWith('BGM', 'sound')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    // Error toast on failed single-scene removal
    const errMic = makeAudio({ name: 'FailMic', kind: 'coreaudio_input_capture', channel: null })
    const failDesk = makeDesk({
      audioList: [errMic],
      items: [makeItem({ id: 9, name: 'FailMic', kind: 'coreaudio_input_capture' })],
      api: {
        editItem: vi.fn(async () => {
          throw new Error('Engine locked')
        }),
      },
    })
    await act(async () =>
      root!.render(
        <DeskProvider value={failDesk.desk} statsStore={failDesk.statsStore}>
          <AudioDock />
        </DeskProvider>,
      ),
    )
    await flush()

    const failMore = host.querySelector(
      'button[aria-label="More for FailMic"]',
    ) as HTMLButtonElement
    await act(async () => failMore.click())
    const failMenu = document.querySelector('[role="menu"][aria-label="FailMic"]') as HTMLElement
    const failRm = [...failMenu.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Remove'),
    ) as HTMLElement
    await act(async () => failRm.click())
    await flush()
    const confirmBtn = [...document.querySelectorAll('[role="alertdialog"] button')].find(
      (b) => b.textContent?.trim() === 'Remove',
    ) as HTMLButtonElement
    await act(async () => confirmBtn.click())
    await flush()

    expect(currentToasts().some((t) => t.tone === 'error')).toBe(true)
    expect(currentToasts().some((t) => t.action?.label === 'Undo')).toBe(false)
    expect(api.editItem).not.toHaveBeenCalled()
  })
})
