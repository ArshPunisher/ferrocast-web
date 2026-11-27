import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient, type Overlay } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { OverlayEditor } from './OverlayEditor'

let root: Root | null = null
let engine: DemoEngine | null = null

async function flushTicks(turns = 30, until?: () => boolean): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (until?.()) return
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

async function mountEditor(id: string, client: FerroClient) {
  useLive.setState({ conn: { client } as never })
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <>
        <OverlayEditor id={id} />
        <Toaster />
      </>,
    )
  })
  await flushTicks(40, () => !!host.querySelector('[data-testid="overlay-status-bar"]'))
  const bar = host.querySelector('[data-testid="overlay-status-bar"]')
  if (!bar) throw new Error('OverlayEditor did not finish loading')
  return host
}

function findButton(rootEl: HTMLElement, label: string | RegExp): HTMLButtonElement {
  const btns = [...rootEl.querySelectorAll<HTMLButtonElement>('button')]
  const hit = btns.find((b) => {
    const aria = b.getAttribute('aria-label') ?? ''
    const text = b.textContent?.trim() ?? ''
    return typeof label === 'string'
      ? aria === label || text === label
      : label.test(aria) || label.test(text)
  })
  if (!hit) throw new Error(`Missing button matching ${String(label)}`)
  return hit
}

function maybeButton(rootEl: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...rootEl.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
  )
}

function layerCount(rootEl: HTMLElement): number {
  const section = rootEl.querySelector('section[aria-label="Layers"]')
  if (!section) throw new Error('Missing Layers section')
  return section.querySelectorAll('ul > li').length
}

describe('OverlayEditor save preserves undo stack (Extra bug #9)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    engine?.dispose()
    engine = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null, connectors: null, links: null, labels: null })
    currentToasts().forEach((t) => dismissToast(t.id))
  })

  it('keeps Undo/Redo working after Save and clears Unsaved state despite server metadata updates', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list.find((o) => !o.design?.branded) ?? list[0]
    if (!base) throw new Error('No overlay in demo seed')

    const initialOverlay: Overlay = {
      ...base,
      updated_at: 1000,
      design: { id: 'molten', scene: 'main', follows: true, branded: false },
    }
    let currentServer: Overlay = initialOverlay
    vi.spyOn(client, 'overlay').mockImplementation(async (id) => {
      if (id === initialOverlay.id) return structuredClone(currentServer)
      return structuredClone(list.find((o) => o.id === id) ?? initialOverlay)
    })
    const saveSpy = vi.spyOn(client, 'saveOverlay').mockImplementation(async (o) => {
      currentServer = {
        ...structuredClone(o),
        updated_at: 99999,
        design: o.design ? { ...o.design, follows: false } : null,
      }
      return structuredClone(currentServer)
    })

    const host = await mountEditor(initialOverlay.id, client)
    const startCount = layerCount(host)
    const toolbar = host.querySelector<HTMLElement>('[role="toolbar"][aria-label="Canvas"]')
    if (!toolbar) throw new Error('Missing canvas toolbar')

    expect(findButton(host, 'Undo').disabled).toBe(true)
    expect(maybeButton(host, 'Save')).toBeUndefined()

    // Edit 1: add a Text layer.
    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    expect(layerCount(host)).toBe(startCount + 1)
    expect(findButton(host, 'Undo').disabled).toBe(false)
    expect(maybeButton(host, 'Save')).toBeTruthy()

    // Edit 2: add a quick widget (different kind/prefix).
    const quickBtn = toolbar.querySelectorAll<HTMLButtonElement>('button')[2]
    if (!quickBtn) throw new Error('Missing third toolbar button')
    await act(async () => {
      quickBtn.click()
    })
    expect(layerCount(host)).toBe(startCount + 2)

    // Save: server returns new updated_at and follows: false.
    await act(async () => {
      findButton(host, 'Save').click()
    })
    await flushTicks(20, () => saveSpy.mock.calls.length === 1 && !maybeButton(host, 'Save'))
    expect(saveSpy).toHaveBeenCalledTimes(1)

    // After Save: clean state (`Save` hidden), and Undo remains enabled!
    expect(maybeButton(host, 'Save')).toBeUndefined()
    expect(host.querySelector('[data-testid="overlay-status-bar"]')?.textContent).toContain('Saved')
    expect(findButton(host, 'Undo').disabled).toBe(false)

    // Undo step 1: restores intermediate layout and marks Unsaved again against saved layout.
    await act(async () => {
      findButton(host, 'Undo').click()
    })
    expect(layerCount(host)).toBe(startCount + 1)
    expect(maybeButton(host, 'Save')).toBeTruthy()
    expect(findButton(host, 'Redo').disabled).toBe(false)

    // Undo step 2: restores original layout.
    await act(async () => {
      findButton(host, 'Undo').click()
    })
    expect(layerCount(host)).toBe(startCount)

    // Redo back twice: returns cleanly to the saved layout (`Saved` bar, `Save` hidden).
    await act(async () => {
      findButton(host, 'Redo').click()
      findButton(host, 'Redo').click()
    })
    expect(layerCount(host)).toBe(startCount + 2)
    expect(maybeButton(host, 'Save')).toBeUndefined()
  })

  it('clears Unsaved state after Save when server reorders widget keys and omits default fields, while keeping Undo', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list.find((o) => !o.design?.branded) ?? list[0]
    if (!base) throw new Error('No overlay in demo seed')

    const initialOverlay: Overlay = {
      ...base,
      updated_at: 1000,
      design: { id: 'molten', scene: 'main', follows: true, branded: false },
      widgets: [
        {
          id: 'l-locked',
          kind: 'layer',
          x: 40,
          y: 40,
          w: 400,
          h: 100,
          locked: true,
          hidden: true,
          rotation: 0,
          opacity: 1,
          config: { type: 'text', text: 'Alpha' },
        },
      ],
    }

    const rustNormalizeWidget = (w: Overlay['widgets'][number]) => {
      const cfgEntries = Object.entries(w.config as unknown as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      )
      const out: Record<string, unknown> = {
        config: Object.fromEntries(cfgEntries),
        h: w.h,
        id: w.id,
        kind: w.kind,
        w: w.w,
        x: w.x,
        y: w.y,
      }
      if (w.locked) out.locked = true
      if (w.hidden) out.hidden = true
      if (w.rotation && w.rotation !== 0) out.rotation = w.rotation
      if (w.opacity !== undefined && w.opacity !== 1) out.opacity = w.opacity
      return out as unknown as Overlay['widgets'][number]
    }

    let currentServer: Overlay = initialOverlay
    vi.spyOn(client, 'overlay').mockImplementation(async () => structuredClone(currentServer))
    const saveSpy = vi.spyOn(client, 'saveOverlay').mockImplementation(async (o) => {
      currentServer = {
        ...structuredClone(o),
        updated_at: 99999,
        design: o.design ? { ...o.design, follows: false } : null,
        widgets: o.widgets.map(rustNormalizeWidget),
      }
      return structuredClone(currentServer)
    })

    const host = await mountEditor(initialOverlay.id, client)
    const toolbar = host.querySelector<HTMLElement>('[role="toolbar"][aria-label="Canvas"]')!

    // Unlock and unhide the layer (writes explicit locked: false / hidden: false) and duplicate (writes locked: false).
    await act(async () => {
      findButton(host, 'Unlock Text: Alpha').click()
    })
    await act(async () => {
      findButton(host, 'Show Text: Alpha').click()
    })
    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    const textLayerBtn = host.querySelector<HTMLElement>(
      '[role="button"][aria-label^="Text: Alpha"]',
    )!
    await act(async () => {
      textLayerBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      findButton(host, 'Duplicate').click()
    })
    expect(maybeButton(host, 'Save')).toBeTruthy()

    // Save: server returns reordered widget keys and omits locked: false / hidden: false / rotation: 0 / opacity: 1.
    await act(async () => {
      findButton(host, 'Save').click()
    })
    await flushTicks(20, () => saveSpy.mock.calls.length === 1 && !maybeButton(host, 'Save'))
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(maybeButton(host, 'Save')).toBeUndefined()
    expect(host.querySelector('[data-testid="overlay-status-bar"]')?.textContent).toContain('Saved')
    expect(findButton(host, 'Undo').disabled).toBe(false)

    // Undo makes layout dirty again; Redo restores the exact saved layout and clears Unsaved.
    await act(async () => {
      findButton(host, 'Undo').click()
    })
    expect(maybeButton(host, 'Save')).toBeTruthy()
    await act(async () => {
      findButton(host, 'Redo').click()
    })
    expect(maybeButton(host, 'Save')).toBeUndefined()
  })

  it('keeps Unsaved state if an edit happens while Save is in flight', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list[0]!

    let resolveSave!: (o: Overlay) => void
    vi.spyOn(client, 'saveOverlay').mockImplementation(
      () =>
        new Promise<Overlay>((resolve) => {
          resolveSave = resolve
        }),
    )

    const host = await mountEditor(base.id, client)
    const toolbar = host.querySelector<HTMLElement>('[role="toolbar"][aria-label="Canvas"]')!
    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    const startCount = layerCount(host)

    await act(async () => {
      findButton(host, 'Save').click()
    })

    // Edit again while Save is still in flight.
    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    expect(layerCount(host)).toBe(startCount + 1)

    await act(async () => {
      resolveSave({
        ...base,
        widgets: base.widgets,
        updated_at: 99999,
      })
    })
    await flushTicks(10)
    expect(maybeButton(host, 'Save')).toBeTruthy()
  })

  it('Discard reverts changes and resets undo; switching overlay id loads the new overlay cleanly', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const first = list[0]
    const second = list[1]
    if (!first || !second) throw new Error('Need at least two overlays in demo seed')

    const host = await mountEditor(first.id, client)
    const toolbar = host.querySelector<HTMLElement>('[role="toolbar"][aria-label="Canvas"]')
    if (!toolbar) throw new Error('Missing canvas toolbar')
    const startCount = layerCount(host)

    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    expect(layerCount(host)).toBe(startCount + 1)
    expect(findButton(host, 'Undo').disabled).toBe(false)

    await act(async () => {
      findButton(host, 'Discard').click()
    })
    expect(layerCount(host)).toBe(startCount)
    expect(maybeButton(host, 'Save')).toBeUndefined()
    expect(findButton(host, 'Undo').disabled).toBe(true)

    // Make an edit, then switch to the second overlay id: history must reset to the second overlay.
    await act(async () => {
      findButton(toolbar, 'Text').click()
    })
    expect(findButton(host, 'Undo').disabled).toBe(false)

    await act(async () => {
      root!.render(
        <>
          <OverlayEditor id={second.id} />
          <Toaster />
        </>,
      )
    })
    await flushTicks(40, () => host.querySelector('h1')?.textContent?.trim() === second.name)
    expect(host.querySelector('h1')?.textContent?.trim()).toBe(second.name)
    expect(findButton(host, 'Undo').disabled).toBe(true)
    expect(maybeButton(host, 'Save')).toBeUndefined()
  })

  it('shows skeleton instead of stale overlay while switching IDs and clears selection across shared widget IDs', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list[0]!

    const ovA: Overlay = {
      ...base,
      id: 'ov-a',
      name: 'First Overlay',
      widgets: [
        {
          id: 'w-shared',
          kind: 'goal',
          x: 40,
          y: 40,
          w: 440,
          h: 112,
          config: { goal_id: 'g1', theme: 'molten' },
        },
      ],
    }
    const ovB: Overlay = {
      ...base,
      id: 'ov-b',
      name: 'Second Overlay',
      widgets: [
        {
          id: 'w-shared',
          kind: 'goal',
          x: 120,
          y: 120,
          w: 440,
          h: 112,
          config: { goal_id: 'g1', theme: 'molten' },
        },
      ],
    }

    let resolveB!: (o: Overlay) => void
    vi.spyOn(client, 'overlay').mockImplementation(async (id) => {
      if (id === 'ov-a') return structuredClone(ovA)
      if (id === 'ov-b') {
        return new Promise<Overlay>((resolve) => {
          resolveB = resolve
        })
      }
      throw new Error(`Unexpected overlay ${id}`)
    })

    const host = await mountEditor('ov-a', client)
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('First Overlay')

    // Select the shared-ID widget in ov-a.
    const widgetA = host.querySelector<HTMLElement>('[role="button"][aria-label^="Goal widget"]')!
    await act(async () => {
      widgetA.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    expect(widgetA.getAttribute('aria-pressed')).toBe('true')

    // Switch to ov-b while its fetch is still pending: ov-a must NOT stay visible/editable.
    await act(async () => {
      root!.render(
        <>
          <OverlayEditor id="ov-b" />
          <Toaster />
        </>,
      )
    })
    expect(host.querySelector('h1')).toBeNull()
    expect(host.querySelector('[data-testid="overlay-status-bar"]')).toBeNull()

    // Resolve ov-b: Second Overlay mounts cleanly without leaking selection from ov-a.
    await act(async () => {
      resolveB(structuredClone(ovB))
    })
    await flushTicks(20, () => host.querySelector('h1')?.textContent?.trim() === 'Second Overlay')
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Second Overlay')
    const widgetB = host.querySelector<HTMLElement>('[role="button"][aria-label^="Goal widget"]')!
    expect(widgetB.getAttribute('aria-pressed')).toBe('false')
    expect(findButton(host, 'Undo').disabled).toBe(true)
  })

  it('sets --fc-toast-offset above overlay-status-bar so Toaster clears Discard/Save and removes it on unmount', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list[0]!

    const origInnerW = window.innerWidth
    const origInnerH = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'overlay-status-bar') {
          return {
            x: 80,
            y: 740,
            width: 800,
            height: 48,
            top: 740,
            right: 880,
            bottom: 788,
            left: 80,
            toJSON: () => ({}),
          } as DOMRect
        }
        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect
      })

    try {
      await mountEditor(base.id, client)
      const toaster = document.querySelector('section[aria-label="Notifications"]')
      expect(toaster?.className).toContain('var(--fc-toast-offset,0px)')
      expect(document.documentElement.style.getPropertyValue('--fc-toast-offset')).toBe('52px')

      await act(async () => root?.unmount())
      root = null
      expect(document.documentElement.style.getPropertyValue('--fc-toast-offset')).toBe('')
    } finally {
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerW })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: origInnerH })
    }
  })

  it('updates stale useLive.links when fresh /api/v1/links resolves on mount', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base: Overlay = {
      ...list[0]!,
      widgets: [
        {
          id: 'w-soc',
          kind: 'layer',
          x: 40,
          y: 900,
          w: 600,
          h: 60,
          config: { type: 'text', text: '{socials}', color: '#ffffff' },
        },
      ],
    }
    vi.spyOn(client, 'overlay').mockResolvedValue(structuredClone(base))
    await client.saveLinks({ twitch: 'twitch.tv/freshmount', custom: [] })

    // Pre-populate stale links in store before OverlayEditor mounts.
    useLive.setState({
      links: {
        twitch: 'twitch.tv/staleprev',
        youtube: null,
        kick: null,
        facebook: null,
        discord: null,
        instagram: null,
        x: null,
        tiktok: null,
        website: null,
        custom: [],
        socials: ['twitch.tv/staleprev'],
        channel_name: 'Stale',
        next_stream: null,
        next_stream_at: null,
      },
    })

    const host = await mountEditor(base.id, client)
    await flushTicks(20, () => useLive.getState().links?.twitch === 'twitch.tv/freshmount')
    expect(useLive.getState().links?.twitch).toBe('twitch.tv/freshmount')
    const shadow = host.querySelector('[data-overlay-preview] > div')?.shadowRoot
    expect(shadow?.textContent).toContain('twitch.tv/freshmount')
  })

  it('reacts to fc:statusbar-change via rAF without observing html.style mutations', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const list = await client.overlays()
    const base = list[0]!

    const htmlStyleObserved: Array<MutationObserverInit | undefined> = []
    const origObserve = MutationObserver.prototype.observe
    const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
      this: MutationObserver,
      target: Node,
      options?: MutationObserverInit,
    ) {
      if (target === document.documentElement && options?.attributeFilter?.includes('style')) {
        htmlStyleObserved.push(options)
      }
      return origObserve.call(this, target, options)
    })

    const origInnerW = window.innerWidth
    const origInnerH = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'overlay-status-bar') {
          return {
            x: 80,
            y: 740,
            width: 800,
            height: 48,
            top: 740,
            right: 880,
            bottom: 788,
            left: 80,
            toJSON: () => ({}),
          } as DOMRect
        }
        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect
      })

    try {
      await mountEditor(base.id, client)
      expect(htmlStyleObserved).toEqual([])
      expect(document.documentElement.style.getPropertyValue('--fc-toast-offset')).toBe('52px')

      await act(async () => {
        document.documentElement.style.setProperty('--fc-statusbar', '28px')
        window.dispatchEvent(new CustomEvent('fc:statusbar-change'))
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
      })
      expect(document.documentElement.style.getPropertyValue('--fc-toast-offset')).toBe('24px')
    } finally {
      observeSpy.mockRestore()
      rectSpy.mockRestore()
      document.documentElement.style.removeProperty('--fc-statusbar')
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerW })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: origInnerH })
    }
  })
})
