import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { BUILTINS } from '@ferrocast/designs'
import { THEME_APPLIED_EVENT } from '../lib/themes'
import { useLive } from '../lib/store'
import { Shell } from './Shell'
import { StudioStatusBar } from './studio/desk/status-bar'
import { DeskProvider, type Desk } from './studio/desk/common'
import { SourcePanel } from './studio/desk/source-panel'
import { Alerts } from '../screens/Alerts'
import { Settings } from '../screens/Settings'
import { Designer } from '../screens/Designer'
import { Designs } from '../screens/Designs'
import { Store } from '../screens/Store'
import { Onboarding } from '../screens/Onboarding'
import { VerticalTab } from './studio/vertical'

let root: Root | null = null
let engine: DemoEngine | null = null

async function flushUntil(fn: () => boolean, maxTurns = 80): Promise<void> {
  for (let i = 0; i < maxTurns; i++) {
    if (fn()) return
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
  }
  throw new Error('Condition did not become true after flushing async turns')
}

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
}

function makeClient(opts: { studioEngine?: boolean } = {}) {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0, designs: BUILTINS, ...opts })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  useLive.setState({ conn: { client, mode: 'demo' } as never })
  return client
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  stubMatchMedia()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  engine?.dispose()
  engine = null
  document.body.innerHTML = ''
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.theme
  useLive.setState({
    conn: null,
    notices: [],
    status: null,
    remote: null,
    connectors: null,
    goliveView: null,
  })
  vi.restoreAllMocks()
})

describe('Chrome CSS custom property coordination and viewport height/sticky classes', () => {
  it('Shell dispatches fc:nav-width-change when sidebar fold toggles --fc-nav-w', async () => {
    localStorage.setItem('fc-nav-folded', '0')
    makeClient()
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Shell demo>
          <div>child</div>
        </Shell>,
      )
    })

    const onNav = vi.fn()
    window.addEventListener('fc:nav-width-change', onNav)
    const toggle = host.querySelector<HTMLButtonElement>(
      'aside[aria-label="Sidebar"] button[aria-expanded]',
    )
    expect(toggle).not.toBeNull()

    await act(async () => {
      toggle!.click()
    })
    expect(onNav).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('--fc-nav-w')).toBe('60px')

    window.removeEventListener('fc:nav-width-change', onNav)
  })

  it('StudioStatusBar dispatches fc:statusbar-change when mounted', async () => {
    const client = makeClient({ studioEngine: true })
    const spy = vi.fn()
    window.addEventListener('fc:statusbar-change', spy)

    useLive.setState({ conn: { client } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<StudioStatusBar />)
    })

    expect(spy).toHaveBeenCalled()
    window.removeEventListener('fc:statusbar-change', spy)
  })

  it('SourcePanel coalesces --fc-drawer writes via rAF and dedupes unchanged widths', async () => {
    makeClient({ studioEngine: true })
    const roCallbacks: Array<() => void> = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const rafQueue: Array<FrameRequestCallback> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    let currentW = 360
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(() => currentW)

    const setPropSpy = vi.spyOn(document.documentElement.style, 'setProperty')
    const desk = {
      api: { filters: async () => [], editFilter: async () => {}, levels: async () => ({}) },
      audio: { data: [], set: vi.fn(), reload: vi.fn() },
      items: { data: [], set: vi.fn(), reload: vi.fn() },
      kinds: { data: { inputs: [], filters: [], transitions: [], encoders: [], outputs: [] } },
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
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <SourcePanel />
        </DeskProvider>,
      )
    })

    const initialDrawerCalls = setPropSpy.mock.calls.filter(([k]) => k === '--fc-drawer')
    expect(initialDrawerCalls).toEqual([['--fc-drawer', '360px']])
    setPropSpy.mockClear()

    // Burst RO notifications with unchanged width -> skipped when rAF flushes.
    act(() => {
      roCallbacks.forEach((cb) => cb())
      roCallbacks.forEach((cb) => cb())
      roCallbacks.forEach((cb) => cb())
      while (rafQueue.length) rafQueue.shift()?.(0)
    })
    expect(setPropSpy.mock.calls.filter(([k]) => k === '--fc-drawer')).toHaveLength(0)

    // Burst RO notifications while width changes 360 -> 380 -> 400 -> coalesced into one write of 400px.
    act(() => {
      currentW = 380
      roCallbacks.forEach((cb) => cb())
      currentW = 400
      roCallbacks.forEach((cb) => cb())
    })
    expect(setPropSpy.mock.calls.filter(([k]) => k === '--fc-drawer')).toHaveLength(0)
    act(() => {
      while (rafQueue.length) rafQueue.shift()?.(0)
    })
    expect(setPropSpy.mock.calls.filter(([k]) => k === '--fc-drawer')).toEqual([
      ['--fc-drawer', '400px'],
    ])
    widthSpy.mockRestore()
  })

  it('Alerts editor subtracts --fc-banners from desktop viewport height', async () => {
    const client = makeClient()
    const rules = await client.alertRules()
    expect(rules.length).toBeGreaterThan(0)
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Alerts ruleId={rules[0]!.id} />)
    })
    await flushUntil(() => !!host.querySelector('[data-testid="alert-editor"]'))
    const editor = host.querySelector<HTMLElement>('[data-testid="alert-editor"]')!
    expect(editor.className).toContain('var(--fc-banners,0px)')
    expect(editor.className).toContain('var(--fc-top,56px)')
    expect(editor.className).toContain('var(--fc-statusbar,0px)')
  })

  it('Settings nav uses --fc-top for sticky top and subtracts --fc-banners from max-h', async () => {
    makeClient()
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Settings section="appearance" />)
    })
    await flushUntil(() => !!host.querySelector('nav[aria-label="Settings sections"]'))
    const nav = host.querySelector<HTMLElement>('nav[aria-label="Settings sections"]')!
    expect(nav.className).not.toContain('lg:top-20')
    expect(nav.className).toContain('var(--fc-top,56px)')
    expect(nav.className).toContain('var(--fc-banners,0px)')
    expect(nav.className).toContain('var(--fc-statusbar,0px)')
  })

  it('Designer GuidedView clears sticky header and StageView avoids fixed right-[392px] squeeze', async () => {
    makeClient()
    localStorage.setItem('fc.designer.view', 'guided')
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Designer id="builtin.neon-sign" />)
    })
    await flushUntil(() => !!host.querySelector('aside[aria-label="Preview"]'))
    const previewAside = host.querySelector<HTMLElement>('aside[aria-label="Preview"]')!
    expect(previewAside.className).not.toContain('max-lg:top-0')
    expect(previewAside.className).not.toContain('lg:top-4')
    expect(previewAside.className).toContain('max-lg:top-[var(--fc-top,56px)]')
    expect(previewAside.className).toContain('lg:top-[calc(var(--fc-top,56px)+16px)]')

    await act(async () => root!.unmount())
    localStorage.setItem('fc.designer.view', 'stage')
    root = createRoot(host)
    await act(async () => {
      root!.render(<Designer id="builtin.neon-sign" />)
    })
    await flushUntil(() => !!host.querySelector('section[aria-label="Inspector"]'))
    const inspector = host.querySelector<HTMLElement>('section[aria-label="Inspector"]')!
    const stageGrid = inspector.parentElement!
    expect(stageGrid.innerHTML).not.toContain('right-[392px]')
    expect(stageGrid.className).toContain('grid-cols-')
    expect(stageGrid.className).toContain('clamp(')
  })

  it('Designs, Store, and Studio Vertical clear sticky header via --fc-top', async () => {
    makeClient({ studioEngine: true })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () => {
      root!.render(<Designs tab="alerts" />)
    })
    await flushUntil(() => !!host.querySelector('aside[aria-label="Filters"]'))
    const designsFilters = host.querySelector<HTMLElement>('aside[aria-label="Filters"]')!
    expect(designsFilters.className).not.toContain('lg:top-3')
    expect(designsFilters.className).toContain('var(--fc-top,56px)')

    await act(async () => {
      root!.render(<Store route={{ name: 'store' }} />)
    })
    await flushUntil(() => !!host.querySelector('aside[aria-label="Store filters"]'))
    const storeFilters = host.querySelector<HTMLElement>('aside[aria-label="Store filters"]')!
    expect(storeFilters.className).not.toContain('lg:top-3')
    expect(storeFilters.className).toContain('var(--fc-top,56px)')

    await act(async () => {
      root!.render(<VerticalTab />)
    })
    await flushUntil(() => !!host.querySelector('figure img, figure canvas, figure'))
    const figure = host.querySelector<HTMLElement>('figure.md\\:sticky, figure')!
    expect(figure.className).not.toContain('md:top-4')
    expect(figure.className).toContain('var(--fc-top,56px)')
  })

  it('Onboarding does not observe html style mutations and updates SparkField on THEME_APPLIED_EVENT', async () => {
    makeClient({ studioEngine: true })
    const observeCalls: Array<MutationObserverInit | undefined> = []
    const origObserve = MutationObserver.prototype.observe
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
      this: MutationObserver,
      target: Node,
      options?: MutationObserverInit,
    ) {
      if (target === document.documentElement) observeCalls.push(options)
      return origObserve.call(this, target, options)
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Onboarding demo onDone={() => undefined} />)
    })

    for (const opt of observeCalls) {
      expect(opt?.attributeFilter ?? []).not.toContain('style')
    }

    await act(async () => {
      document.documentElement.dataset.theme = 'contrast'
      window.dispatchEvent(new Event(THEME_APPLIED_EVENT))
    })
    expect(host.querySelector('canvas')?.getAttribute('data-tone')).toBe('light')
  })
})
