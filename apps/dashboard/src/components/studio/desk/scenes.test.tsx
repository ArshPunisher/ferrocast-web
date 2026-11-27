import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineScene, EngineScenes } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { DeskProvider, type Desk } from './common'
import { ScenesDock } from './scenes'

vi.mock('./layout', () => ({
  DockHeader: ({ title }: { title?: React.ReactNode }) => <header>{title ?? 'Scenes'}</header>,
}))

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

const roots: Root[] = []
let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.removeItem('fc-studio-scenes-grid')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  root = null
  for (const r of roots.splice(0)) {
    await act(async () => r.unmount())
  }
  document.body.innerHTML = ''
  localStorage.removeItem('fc-studio-scenes-grid')
  currentToasts().forEach((t) => dismissToast(t.id))
  vi.useRealTimers()
})

function makeScene(name: string, opts: Partial<EngineScene> = {}): EngineScene {
  return {
    name,
    current: false,
    preview: false,
    items: 1,
    transition: null,
    ...opts,
  }
}

function makeDesk(scenesData: EngineScenes, apiOverrides: Record<string, unknown> = {}) {
  const api = {
    moveScene: vi.fn(async () => undefined),
    duplicateScene: vi.fn(async () => undefined),
    removeScene: vi.fn(async () => undefined),
    setCurrent: vi.fn(async () => undefined),
    setPreview: vi.fn(async () => undefined),
    setTopLayer: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    addScene: vi.fn(async () => undefined),
    transitionNow: vi.fn(async () => undefined),
    thumbnail: vi.fn(async () => null),
    screenshot: vi.fn(async () => ({ file: '' })),
    ...apiOverrides,
  }
  const desk = {
    api,
    scenes: { data: scenesData, set: vi.fn(), reload: vi.fn(), error: null, loading: false },
    scene: scenesData.preview ?? scenesData.current,
    canvas: 'main',
    setCanvas: vi.fn(),
    size: { width: 1920, height: 1080 },
    pictureScenes: scenesData.scenes,
    pictureCurrent: scenesData.preview ?? scenesData.current,
    allScenes: scenesData.scenes,
    items: { data: [], set: vi.fn(), reload: vi.fn() },
    audio: { data: [], set: vi.fn(), reload: vi.fn() },
    kinds: { data: null, set: vi.fn(), reload: vi.fn() },
    prefs: { data: null, set: vi.fn(), reload: vi.fn() },
    screens: { data: [], set: vi.fn(), reload: vi.fn() },
    refresh: vi.fn(),
    undone: 0,
    selected: null,
    select: vi.fn(),
    also: [],
    pickMore: vi.fn(),
    pickSet: vi.fn(),
    itemMenu: { current: null },
    editing: null,
    edit: vi.fn(),
    editTab: null,
    adding: null,
    setAdding: vi.fn(),
    stats: null,
    setStats: vi.fn(),
    clip: null,
    setClip: vi.fn(),
    filterClip: null,
    setFilterClip: vi.fn(),
    openTransitions: vi.fn(),
  } as unknown as Desk
  return { desk, api }
}

async function mountScenes(scenesData: EngineScenes, apiOverrides: Record<string, unknown> = {}) {
  const { desk, api } = makeDesk(scenesData, apiOverrides)
  const host = document.body.appendChild(document.createElement('div'))
  const created = createRoot(host)
  roots.push(created)
  root = created
  await act(async () => {
    created.render(
      <DeskProvider value={desk}>
        <ScenesDock />
      </DeskProvider>,
    )
  })
  return { host, desk, api }
}

function setRowBoxes(host: Element, list: boolean) {
  const items = Array.from(host.querySelectorAll<HTMLElement>('[data-scene-name]'))
  items.forEach((el, idx) => {
    const rect = list
      ? {
          left: 0,
          right: 260,
          width: 260,
          top: idx * 36,
          bottom: idx * 36 + 36,
          height: 36,
          x: 0,
          y: idx * 36,
          toJSON: () => ({}),
        }
      : {
          left: (idx % 2) * 110,
          right: (idx % 2) * 110 + 100,
          width: 100,
          top: Math.floor(idx / 2) * 80,
          bottom: Math.floor(idx / 2) * 80 + 70,
          height: 70,
          x: (idx % 2) * 110,
          y: Math.floor(idx / 2) * 80,
          toJSON: () => ({}),
        }
    Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect })
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function pointerEvt(type: string, init: PointerEventInit & { clientX?: number; clientY?: number }) {
  const buttons =
    init.buttons !== undefined
      ? init.buttons
      : type === 'pointerup' || type === 'pointercancel'
        ? 0
        : 1
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
    pointerId: 1,
    pointerType: 'mouse',
    ...init,
  })
  return ev
}

describe('ScenesDock Studio Mode footer actions (Extra bug #3)', () => {
  it('moves, copies, and removes the selected preview scene instead of the on-air scene and marks on-air overlap', async () => {
    const data: EngineScenes = {
      current: 'Main',
      preview: 'Chatting',
      transition: { kind: 'fade', ms: 300 },
      top_layer: null,
      vertical: null,
      scenes: [
        makeScene('Main', { current: true }),
        makeScene('Gameplay'),
        makeScene('Chatting', { preview: true }),
        makeScene('BRB'),
      ],
    }
    const { host, api } = await mountScenes(data)

    const up = host.querySelector<HTMLButtonElement>('button[aria-label="Move Chatting up"]')
    const down = host.querySelector<HTMLButtonElement>('button[aria-label="Move Chatting down"]')
    const copy = host.querySelector<HTMLButtonElement>('button[aria-label="Copy Chatting"]')
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Remove Chatting"]')
    expect(up).toBeTruthy()
    expect(down).toBeTruthy()
    expect(copy).toBeTruthy()
    expect(remove).toBeTruthy()
    expect(up!.disabled).toBe(false)
    expect(down!.disabled).toBe(false)

    await act(async () => up!.click())
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Chatting', 1)
    expect(host.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain(
      'Moved Chatting to position 2 of 4',
    )

    await act(async () => down!.click())
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Chatting', 3)

    await act(async () => copy!.click())
    await flush()
    expect(api.duplicateScene).toHaveBeenCalledWith('Chatting', 'Chatting 2')

    await act(async () => remove!.click())
    expect(host.textContent).toContain('Remove the scene Chatting?')
    const confirmRemove = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Remove',
    )!
    await act(async () => confirmRemove.click())
    await flush()
    expect(api.removeScene).toHaveBeenCalledWith('Chatting')
    expect(api.setPreview).toHaveBeenCalledWith('Main')

    // When preview === current, Remove label explicitly notes that the scene is also on air.
    const samePreview: EngineScenes = {
      ...data,
      preview: 'Main',
      scenes: [
        makeScene('Main', { current: true, preview: true }),
        makeScene('Gameplay'),
        makeScene('Chatting'),
        makeScene('BRB'),
      ],
    }
    const mountedSame = await mountScenes(samePreview)
    expect(
      mountedSame.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove Main (on air)"]',
      ),
    ).toBeTruthy()
  })
})

describe('ScenesDock pointer drag and keyboard reorder (Group E)', () => {
  const sample: EngineScenes = {
    current: 'Main',
    preview: null,
    transition: { kind: 'fade', ms: 300 },
    top_layer: null,
    vertical: null,
    scenes: [makeScene('Main', { current: true }), makeScene('Gameplay'), makeScene('Chatting')],
  }

  it('drags inactive scene in list mode (>5 px threshold), shows drop line and ghost, suppresses delayed synthetic switch click', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameLi = host.querySelector<HTMLElement>('[data-scene-name="Gameplay"]')!
    const gameBtn = gameLi.querySelector<HTMLButtonElement>('button')!
    const captureSpy = vi.fn()
    const releaseSpy = vi.fn()
    let hasCap = false
    Object.defineProperty(gameLi, 'setPointerCapture', {
      configurable: true,
      value: (id: number) => {
        hasCap = true
        captureSpy(id)
      },
    })
    Object.defineProperty(gameLi, 'hasPointerCapture', {
      configurable: true,
      value: () => hasCap,
    })
    Object.defineProperty(gameLi, 'releasePointerCapture', {
      configurable: true,
      value: (id: number) => {
        hasCap = false
        releaseSpy(id)
      },
    })

    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 54 }))
    })
    // Below 5 px threshold: no drop line, ghost, or capture yet.
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 57 }))
    })
    expect(host.querySelector('[data-drop-line]')).toBeNull()
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
    expect(captureSpy).not.toHaveBeenCalled()

    // Move past 5 px onto bottom half of Chatting (y: 96 is inside index 2 [72..108]).
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 96 }))
    })
    expect(captureSpy).toHaveBeenCalledWith(1)
    expect(document.body.dataset.sceneDrag).toBe('1')
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()
    expect(host.querySelector('[data-scene-ghost]')?.textContent).toContain('Gameplay')

    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 96 }))
    })
    expect(releaseSpy).toHaveBeenCalledWith(1)
    expect(document.body.dataset.sceneDrag).toBeUndefined()

    // Delayed compatibility click (touch/WebKit macrotask after setTimeout 0) must NOT switch scenes.
    await act(async () => {
      vi.advanceTimersByTime(120)
      gameBtn.click()
      vi.runAllTimers()
    })
    await flush()

    expect(api.moveScene).toHaveBeenCalledWith('Gameplay', 2)
    expect(api.setCurrent).not.toHaveBeenCalled()
    expect(api.setPreview).not.toHaveBeenCalled()
  })

  it('treats self-drop or adjacent-seam no-op drop as a no-op with zero API calls', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const mainBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Main"] button')!
    await act(async () => {
      mainBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 18 }))
      // Top half of Gameplay (y=40 in [36..72]) resolves to index 0 (same as Main's current slot).
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 40 }))
    })
    expect(host.querySelector('[data-drop-line]')).toBeNull()

    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 40 }))
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).not.toHaveBeenCalled()
  })

  it('cancels active drag on Escape on an inactive scene and suppresses post-Escape release click even after holding', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const chatBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!
    await act(async () => {
      chatBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 90 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 18 }))
    })
    expect(host.querySelector('[data-scene-ghost]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()

    // User keeps holding pointer for >1s after Escape, then releases and browser emits click.
    await act(async () => {
      vi.advanceTimersByTime(1200)
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 90 }))
      chatBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).not.toHaveBeenCalled()
    expect(api.setCurrent).not.toHaveBeenCalled()
  })

  it('suppresses click after pointercancel or blur, and allows a subsequent fresh click on another scene', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button')!
    const chatBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!

    // pointercancel after active drag must swallow click.
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 90 }))
      window.dispatchEvent(pointerEvt('pointercancel', { clientX: 20, clientY: 90 }))
      gameBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).not.toHaveBeenCalled()
    expect(api.setCurrent).not.toHaveBeenCalled()

    // window blur after active drag must swallow click too.
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 90 }))
      window.dispatchEvent(new Event('blur'))
      gameBtn.click()
    })
    await flush()
    expect(api.setCurrent).not.toHaveBeenCalled()

    // A fresh user pointerdown + pointerup + click immediately after on Chatting still switches normally.
    await act(async () => {
      chatBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 90 }))
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 90 }))
      chatBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(api.setCurrent).toHaveBeenCalledWith('Chatting')
  })

  it('cancels stuck drag when mouse buttons===0 or lostpointercapture fires', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameLi = host.querySelector<HTMLElement>('[data-scene-name="Gameplay"]')!
    const gameBtn = gameLi.querySelector<HTMLButtonElement>('button')!

    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 90 }))
    })
    expect(host.querySelector('[data-scene-ghost]')).not.toBeNull()

    // Releasing mouse outside window returns with buttons: 0.
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 85, buttons: 0 }))
      gameBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
    expect(api.moveScene).not.toHaveBeenCalled()
    expect(api.setCurrent).not.toHaveBeenCalled()

    // Descendant implicit touch capture handoff bubbles lostpointercapture and must NOT cancel drag.
    const gameHandle = gameLi.querySelector<HTMLElement>('[data-drag-handle]')!
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 90 }))
      gameHandle.dispatchEvent(
        pointerEvt('lostpointercapture', { pointerType: 'touch', clientX: 20, clientY: 90 }),
      )
    })
    expect(host.querySelector('[data-scene-ghost]')).not.toBeNull()

    // lostpointercapture on the <li> itself also cleans up drag and suppresses release click.
    await act(async () => {
      gameLi.dispatchEvent(pointerEvt('lostpointercapture', { clientX: 20, clientY: 90 }))
      gameBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
    expect(api.moveScene).not.toHaveBeenCalled()
    expect(api.setCurrent).not.toHaveBeenCalled()
  })

  it('supports touch drag on [data-drag-handle] only (preserving scroll on label) and vertical canvas reorder', async () => {
    const verticalData: EngineScenes = {
      current: 'Main',
      preview: null,
      transition: { kind: 'cut', ms: 0 },
      top_layer: null,
      vertical: {
        width: 1080,
        height: 1920,
        current: 'Tall 1',
        scenes: [makeScene('Tall 1', { current: true }), makeScene('Tall 2'), makeScene('Tall 3')],
      },
      scenes: [makeScene('Main', { current: true }), makeScene('Gameplay')],
    }
    const { desk, api } = makeDesk(verticalData)
    desk.canvas = 'vertical'
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <ScenesDock />
        </DeskProvider>,
      )
    })
    setRowBoxes(host, true)

    const tall2Btn = host.querySelector<HTMLButtonElement>('[data-scene-name="Tall 2"] button')!
    const tall2Handle = host.querySelector<HTMLElement>(
      '[data-scene-name="Tall 2"] [data-drag-handle]',
    )!

    // Touch on button label outside handle does NOT start a drag.
    await act(async () => {
      tall2Btn.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 80, clientY: 54 }),
      )
      window.dispatchEvent(
        pointerEvt('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 80, clientY: 96 }),
      )
    })
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
    await act(async () => {
      window.dispatchEvent(
        pointerEvt('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 80, clientY: 96 }),
      )
    })

    // Touch on [data-drag-handle] drags Tall 2 onto bottom half of Tall 3 without calling setCurrent.
    await act(async () => {
      tall2Handle.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 12, clientY: 54 }),
      )
      window.dispatchEvent(
        pointerEvt('pointermove', { pointerType: 'touch', pointerId: 3, clientX: 12, clientY: 96 }),
      )
    })
    expect(host.querySelector('[data-scene-ghost]')?.textContent).toContain('Tall 2')
    await act(async () => {
      window.dispatchEvent(
        pointerEvt('pointerup', { pointerType: 'touch', pointerId: 3, clientX: 12, clientY: 96 }),
      )
      vi.advanceTimersByTime(150)
      tall2Btn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Tall 2', 2)
    expect(api.setCurrent).not.toHaveBeenCalled()
  })

  it('auto-scrolls continuously via rAF when holding near the scroll edge', async () => {
    const { host } = await mountScenes(sample)
    setRowBoxes(host, true)
    const scrollEl = host.querySelector<HTMLDivElement>('ul')!.parentElement as HTMLDivElement
    Object.defineProperty(scrollEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 200, left: 0, right: 260, width: 260, height: 200 }),
    })
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 600 })
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 200 })
    scrollEl.scrollTop = 0

    const gameBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button')!
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      // Hold pointer in bottom 32px edge zone (y=190 in 0..200) with no subsequent pointermove.
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 190 }))
    })
    const scrollAfterMove = scrollEl.scrollTop
    await act(async () => {
      vi.advanceTimersByTime(80)
    })
    expect(scrollEl.scrollTop).toBeGreaterThan(scrollAfterMove)

    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 190 }))
      vi.runAllTimers()
    })
  })

  it('does not start drag for <5 px clicks and allows normal scene switch', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button')!
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 52 }))
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 52 }))
      gameBtn.click()
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).not.toHaveBeenCalled()
    expect(api.setCurrent).toHaveBeenCalledWith('Gameplay')
  })

  it('does not drag with only 1 scene or while inline rename input is open', async () => {
    const { host, api } = await mountScenes({
      ...sample,
      scenes: [makeScene('Main', { current: true })],
    })
    setRowBoxes(host, true)
    expect(host.querySelector('[data-drag-handle]')).toBeNull()
    const singleBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Main"] button')!
    await act(async () => {
      singleBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 18 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 50 }))
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 50 }))
    })
    expect(api.moveScene).not.toHaveBeenCalled()

    // Multi-scene with F2 rename open disables dragging while input is active.
    const multi = await mountScenes(sample)
    setRowBoxes(multi.host, true)
    const gameBtn = multi.host.querySelector<HTMLButtonElement>(
      '[data-scene-name="Gameplay"] button',
    )!
    await act(async () => {
      gameBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    })
    const li = multi.host.querySelector<HTMLElement>('[data-scene-name="Chatting"] button')!
    await act(async () => {
      li.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 85 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 18 }))
    })
    expect(multi.host.querySelector('[data-scene-ghost]')).toBeNull()
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 20, clientY: 18 }))
    })
    expect(multi.api.moveScene).not.toHaveBeenCalled()
  })

  it('reorders cleanly in grid mode using horizontal 2D drop lines', async () => {
    localStorage.setItem('fc-studio-scenes-grid', '1')
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, false)

    // Tile 0 (Main) is at left 0..100, Tile 1 (Gameplay) is at left 110..210 top 0..70.
    const mainBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Main"] button')!
    await act(async () => {
      mainBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 30, clientY: 30 }))
      // Drop onto right half of Gameplay (x=190 > 110+50).
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 190, clientY: 30 }))
    })
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 190, clientY: 30 }))
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Main', 1)
  })

  it('supports Alt+ArrowUp/Down keyboard reorder, keeps focus after re-render, and announces via aria-live', async () => {
    const { desk, host, api } = await mountScenes(sample)
    const chatBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!
    chatBtn.focus()
    expect(document.activeElement).toBe(chatBtn)

    await act(async () => {
      chatBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
      )
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Chatting', 1)
    expect(host.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain(
      'Moved Chatting to position 2 of 3',
    )

    // Simulate refreshed scene order arriving from engine; focus stays on Chatting button.
    const reordered: Desk = {
      ...desk,
      scenes: {
        ...desk.scenes,
        data: {
          ...sample,
          scenes: [
            makeScene('Main', { current: true }),
            makeScene('Chatting'),
            makeScene('Gameplay'),
          ],
        },
      },
    }
    await act(async () => {
      root!.render(
        <DeskProvider value={reordered}>
          <ScenesDock />
        </DeskProvider>,
      )
    })
    const movedBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!
    expect(document.activeElement).toBe(movedBtn)

    // Alt+ArrowUp at index 0 is a no-op with zero moveScene calls.
    const mainBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Main"] button')!
    expect(mainBtn.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown')
    mainBtn.focus()
    await act(async () => {
      mainBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
      )
    })
    expect(api.moveScene).toHaveBeenCalledTimes(1)

    // Modifier conflicts (Option+Shift+Arrow, Cmd+Ctrl+Shift+Arrow) do not reorder.
    await act(async () => {
      movedBtn.focus()
      movedBtn.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowUp',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      )
      movedBtn.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowUp',
          ctrlKey: true,
          shiftKey: true,
          metaKey: true,
          bubbles: true,
        }),
      )
    })
    expect(api.moveScene).toHaveBeenCalledTimes(1)
  })

  it('does not announce failed moves, clears pendingFocus on failure/blur, and supports Alt+ArrowLeft/Right in grid mode', async () => {
    const { desk, host, api } = await mountScenes(sample, {
      moveScene: vi.fn(async () => {
        throw new Error('engine busy')
      }),
    })
    const chatBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!
    const otherBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add a scene"]',
    ) as HTMLButtonElement | null
    const focusTarget =
      otherBtn ?? host.querySelector<HTMLButtonElement>('button[aria-label="Move Main down"]')!
    chatBtn.focus()

    await act(async () => {
      chatBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
      )
    })
    await flush()

    // Failed moveScene must not lie in aria-live.
    expect(host.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? '').toBe('')

    // Move focus elsewhere, then simulate background poll list update: focus must NOT be yanked back to Chatting.
    focusTarget.focus()
    expect(document.activeElement).toBe(focusTarget)
    await act(async () => {
      root!.render(
        <DeskProvider
          value={{
            ...desk,
            scenes: {
              ...desk.scenes,
              data: {
                ...sample,
                scenes: [...sample.scenes],
              },
            },
          }}
        >
          <ScenesDock />
        </DeskProvider>,
      )
    })
    expect(document.activeElement).toBe(focusTarget)

    // Grid mode supports Alt+ArrowLeft/Right and exposes arrow shortcuts in aria-keyshortcuts.
    localStorage.setItem('fc-studio-scenes-grid', '1')
    const gridMount = await mountScenes(sample)
    const gridMain = gridMount.host.querySelector<HTMLButtonElement>(
      '[data-scene-name="Main"] button',
    )!
    expect(gridMain.getAttribute('aria-keyshortcuts')).toBe(
      'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight',
    )
    gridMain.focus()
    await act(async () => {
      gridMain.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }),
      )
    })
    await flush()
    expect(gridMount.api.moveScene).toHaveBeenCalledWith('Main', 1)
    expect(api.moveScene).toHaveBeenCalledTimes(1)
  })

  it('ignores pointercancel from a different pointer while keeping window blur cancel', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameHandle = host.querySelector<HTMLElement>(
      '[data-scene-name="Gameplay"] [data-drag-handle]',
    )!
    await act(async () => {
      gameHandle.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 54 }),
      )
      window.dispatchEvent(
        pointerEvt('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 96 }),
      )
    })
    expect(document.body.dataset.sceneDrag).toBe('1')
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()

    // Foreign pointercancel (second finger) must NOT abort the active drag.
    await act(async () => {
      window.dispatchEvent(
        pointerEvt('pointercancel', {
          pointerType: 'touch',
          pointerId: 2,
          clientX: 60,
          clientY: 20,
        }),
      )
    })
    expect(document.body.dataset.sceneDrag).toBe('1')
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(
        pointerEvt('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 96 }),
      )
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Gameplay', 2)

    // Window blur still cancels an active drag unconditionally.
    const nextGameHandle = host.querySelector<HTMLElement>(
      '[data-scene-name="Gameplay"] [data-drag-handle]',
    )!
    await act(async () => {
      nextGameHandle.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 12, clientY: 54 }),
      )
      window.dispatchEvent(
        pointerEvt('pointermove', { pointerType: 'touch', pointerId: 4, clientX: 12, clientY: 96 }),
      )
    })
    expect(document.body.dataset.sceneDrag).toBe('1')
    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(document.body.dataset.sceneDrag).toBeUndefined()
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
  })

  it('keeps the active drag when a second pointer presses another scene handle', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)

    const gameHandle = host.querySelector<HTMLElement>(
      '[data-scene-name="Gameplay"] [data-drag-handle]',
    )!
    const mainHandle = host.querySelector<HTMLElement>(
      '[data-scene-name="Main"] [data-drag-handle]',
    )!

    await act(async () => {
      gameHandle.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 54 }),
      )
      window.dispatchEvent(
        pointerEvt('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 96 }),
      )
    })
    expect(host.querySelector('[data-scene-ghost]')?.textContent).toContain('Gameplay')

    // Second pointer presses and releases Main without moving: must not hijack or strand ghost/drop.
    await act(async () => {
      mainHandle.dispatchEvent(
        pointerEvt('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 12, clientY: 18 }),
      )
      window.dispatchEvent(
        pointerEvt('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 12, clientY: 18 }),
      )
    })
    expect(host.querySelector('[data-scene-ghost]')?.textContent).toContain('Gameplay')
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()

    // Releasing the original pointer still completes Gameplay's reorder and clears drag visuals.
    await act(async () => {
      window.dispatchEvent(
        pointerEvt('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 12, clientY: 96 }),
      )
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Gameplay', 2)
    expect(host.querySelector('[data-scene-ghost]')).toBeNull()
    expect(host.querySelector('[data-drop-line]')).toBeNull()
    expect(document.body.dataset.sceneDrag).toBeUndefined()
  })

  it('does not steal focus back when the user focuses another scene row before refreshed list arrives', async () => {
    const { desk, host, api } = await mountScenes(sample)
    const chatBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Chatting"] button')!
    const gameBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button')!
    chatBtn.focus()

    await act(async () => {
      chatBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
      )
    })
    await flush()
    expect(api.moveScene).toHaveBeenCalledWith('Chatting', 1)

    // User tabs to Gameplay before the refreshed list renders.
    await act(async () => {
      gameBtn.focus()
    })
    expect(document.activeElement).toBe(gameBtn)

    const reordered: Desk = {
      ...desk,
      scenes: {
        ...desk.scenes,
        data: {
          ...sample,
          scenes: [
            makeScene('Main', { current: true }),
            makeScene('Chatting'),
            makeScene('Gameplay'),
          ],
        },
      },
    }
    await act(async () => {
      root!.render(
        <DeskProvider value={reordered}>
          <ScenesDock />
        </DeskProvider>,
      )
    })
    expect(document.activeElement).toBe(
      host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button'),
    )
  })

  it('cancels drop marker and skips moveScene when released outside the dock bounds', async () => {
    const { host, api } = await mountScenes(sample)
    setRowBoxes(host, true)
    const scrollEl = host.querySelector<HTMLDivElement>('ul')!.parentElement as HTMLDivElement
    Object.defineProperty(scrollEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 160, left: 0, right: 260, width: 260, height: 160 }),
    })

    const gameBtn = host.querySelector<HTMLButtonElement>('[data-scene-name="Gameplay"] button')!
    await act(async () => {
      gameBtn.dispatchEvent(pointerEvt('pointerdown', { clientX: 20, clientY: 54 }))
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 20, clientY: 96 }))
    })
    expect(host.querySelector('[data-drop-line]')).not.toBeNull()

    // Drag horizontally out of the dock into an adjacent pane at the same Y height.
    await act(async () => {
      window.dispatchEvent(pointerEvt('pointermove', { clientX: 420, clientY: 96 }))
    })
    expect(host.querySelector('[data-drop-line]')).toBeNull()

    await act(async () => {
      window.dispatchEvent(pointerEvt('pointerup', { clientX: 420, clientY: 96 }))
      vi.runAllTimers()
    })
    await flush()
    expect(api.moveScene).not.toHaveBeenCalled()
  })

  it('keeps 16:9 grid tiles, gates scene thumbnail polling during scenesSettling, and re-fetches on collectionKey change', async () => {
    const prevDesktop = window.__FERROCAST__
    window.__FERROCAST__ = { api: '', desktop: true }
    localStorage.setItem('fc-studio-scenes-grid', '1')
    let generation = 1
    const thumbnail = vi.fn(async (name: string) => ({
      image: `data:image/png;base64,${name}-gen-${generation}`,
    }))
    const scenesA: EngineScenes = {
      current: 'Main',
      preview: null,
      transition: { kind: 'fade', ms: 300 },
      top_layer: null,
      vertical: null,
      scenes: [makeScene('Main', { current: true })],
    }
    const scenesB: EngineScenes = {
      current: 'Outro',
      preview: null,
      transition: { kind: 'fade', ms: 300 },
      top_layer: null,
      vertical: null,
      scenes: [makeScene('Outro', { current: true })],
    }
    const { desk } = makeDesk(scenesA, { thumbnail })
    Object.assign(desk as unknown as Record<string, unknown>, {
      size: { width: 1024, height: 768 },
      collectionKey: 1,
      scenesSettling: false,
    })
    const host = document.body.appendChild(document.createElement('div'))
    const created = createRoot(host)
    roots.push(created)
    root = created
    try {
      await act(async () => {
        created.render(
          <DeskProvider value={desk}>
            <ScenesDock />
          </DeskProvider>,
        )
      })
      await flush()

      const firstImg = host.querySelector('img') as HTMLImageElement | null
      expect(firstImg?.src).toContain('Main-gen-1')
      // Grid tiles stay 16:9 (aspect-video).
      const thumbBox = firstImg?.parentElement as HTMLElement | null
      expect(thumbBox?.className).toContain('aspect-video')
      expect(thumbBox?.style.aspectRatio).toBe('')

      // Mid-switch while scenesSettling=true and old scene names are still present: must NOT fetch old scene thumbnails.
      generation = 2
      const settlingDesk = {
        ...desk,
        collectionKey: 2,
        scenesSettling: true,
        scenes: { ...desk.scenes, data: { ...scenesA } },
      } as unknown as Desk
      await act(async () => {
        created.render(
          <DeskProvider value={settlingDesk}>
            <ScenesDock />
          </DeskProvider>,
        )
      })
      await flush()
      expect(thumbnail).toHaveBeenCalledTimes(1)

      // Once scenes settle with Collection B's scenes, fetch thumbnail for Outro.
      const settledDesk = {
        ...desk,
        collectionKey: 2,
        scenesSettling: false,
        scenes: { ...desk.scenes, data: { ...scenesB } },
      } as unknown as Desk
      await act(async () => {
        created.render(
          <DeskProvider value={settledDesk}>
            <ScenesDock />
          </DeskProvider>,
        )
      })
      await flush()
      expect(thumbnail).toHaveBeenCalledTimes(2)
      expect(thumbnail).toHaveBeenLastCalledWith('Outro', 256)
      expect((host.querySelector('img') as HTMLImageElement | null)?.src).toContain('Outro-gen-2')
    } finally {
      if (prevDesktop === undefined) delete window.__FERROCAST__
      else window.__FERROCAST__ = prevDesktop
    }
  })
})
