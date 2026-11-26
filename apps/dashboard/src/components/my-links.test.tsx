import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient, type OverlayState, type Widget } from '@ferrocast/api'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'
import { Toaster } from '@ferrocast/ui'
import { beginLabelsLoad, beginLinksLoad, useLive } from '../lib/store'
import { resolvePreviewLabelMap } from './design/previews'
import { LayoutEditor } from './layout/LayoutEditor'
import { MyLinksCard } from './my-links'

let root: Root | null = null
let engine: DemoEngine | null = null

function setupEnv() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
}

function setInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  proto?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('MyLinksCard, LayoutEditor links preview, and real label fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setupEnv()
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null, connectors: null, links: null, labels: null })
    engine?.dispose()
    engine = null
    vi.useRealTimers()
  })

  it('displays auto values, validates inputs inline, limits custom rows to 6, and saves to engine', async () => {
    const client = new FerroClient({ base: engine!.base, token: DEMO_TOKEN, fetch: engine!.fetch })
    const status = await client.status()
    useLive.setState({
      conn: { client, base: engine!.base } as never,
      status,
      connectors: status.connectors,
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <>
          <MyLinksCard />
          <Toaster />
        </>,
      )
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(host.textContent).toContain('Auto: twitch.tv/novaplays')
    expect(host.textContent).toContain('Auto: youtube.com/@NovaPlays')
    expect(host.textContent).toContain('Auto: kick.com/novaplays')

    const preview = host.querySelector('[data-testid="my-links-preview"]') as HTMLElement
    expect(preview.textContent).toContain('twitch.tv/novaplays')

    const discordInput = host.querySelector<HTMLInputElement>(
      'input[placeholder="discord.gg/yourserver"]',
    )!
    // Unsafe scheme shows inline validation error and disables save button.
    await act(async () => {
      setInputValue(discordInput, 'javascript:alert(1)')
    })
    expect(host.textContent).toContain('javascript:')
    const saveBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save links',
    )!
    expect(saveBtn.disabled).toBe(true)

    // Valid Discord link + schedule text + custom links save cleanly and sync useLive.links.
    await act(async () => {
      setInputValue(discordInput, 'https://discord.gg/novacrew/')
    })
    const schedInput = host.querySelector<HTMLInputElement>('input[placeholder="Fridays, 8 PM"]')!
    await act(async () => {
      setInputValue(schedInput, 'Sundays, 7 PM')
    })

    const addCustom = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add custom link'),
    )!
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        addCustom.click()
      })
    }
    expect(addCustom.disabled).toBe(true)
    const labelInputs = host.querySelectorAll<HTMLInputElement>('input[placeholder="Merch"]')
    const linkInputs = host.querySelectorAll<HTMLInputElement>(
      'input[placeholder="https://shop.example.gg"]',
    )
    expect(labelInputs.length).toBe(6)
    await act(async () => {
      setInputValue(labelInputs[0]!, 'Merch')
      setInputValue(linkInputs[0]!, 'https://shop.novacrew.gg/')
    })

    expect(saveBtn.disabled).toBe(false)
    await act(async () => {
      saveBtn.click()
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(document.body.textContent).toContain('My links saved. Overlays updated.')
    expect(useLive.getState().links?.discord).toBe('discord.gg/novacrew')
    expect(useLive.getState().links?.next_stream).toBe('Sundays, 7 PM')
    expect(preview.textContent).toContain('Merch: shop.novacrew.gg')
  })

  it('uses real /labels values and falls back per-key to samples cleanly', () => {
    const widgets: Widget[] = [
      {
        id: 'w1',
        kind: 'label',
        x: 0,
        y: 0,
        w: 300,
        h: 50,
        config: { source: 'latest_follower', template: 'Latest: {value}', theme: 'molten' },
      },
      {
        id: 'w2',
        kind: 'label',
        x: 0,
        y: 60,
        w: 300,
        h: 50,
        config: { source: 'latest_sub', template: 'Sub: {value}', theme: 'molten' },
      },
    ]

    expect(resolvePreviewLabelMap(widgets, { latest_follower: 'RealChatter' })).toEqual({
      w1: 'Latest: RealChatter',
      w2: 'Sub: rohanbuilds',
    })
    expect(resolvePreviewLabelMap(widgets, {})).toEqual({
      w1: 'Latest: NeelaMoth',
      w2: 'Sub: rohanbuilds',
    })
  })

  it('shows resolved links preview and Edit my links link when editing a tokenized text layer', async () => {
    const client = new FerroClient({ base: engine!.base, token: DEMO_TOKEN, fetch: engine!.fetch })
    useLive.setState({ conn: { client, base: engine!.base } as never })
    const linksRes = await client.links()
    const state: OverlayState = {
      goals: [],
      labels: {},
      viewers: {},
      events: [],
      chat: [],
      links: linksRes.resolved,
    }
    const textLayer: Widget = {
      id: 'txt-soc',
      kind: 'layer',
      x: 40,
      y: 40,
      w: 500,
      h: 50,
      config: { type: 'text', text: '{socials}', color: '#ffffff' },
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <LayoutEditor
          layout={{
            name: 'Main',
            width: 1920,
            height: 1080,
            widgets: [textLayer],
          }}
          onWidgets={vi.fn()}
          state={state}
          themes={[{ id: 'molten', name: 'Molten', description: '', pro: false }]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview
          media={[]}
          onUploaded={vi.fn()}
        />,
      )
    })

    // Click the layer row/widget so the text layer is selected.
    const item = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('{socials}'),
    )
    expect(item).toBeTruthy()
    await act(async () => {
      item!.click()
    })

    const editLink = host.querySelector<HTMLAnchorElement>('a[href="#/settings/accounts"]')
    expect(editLink?.textContent).toBe('Edit my links')
    expect(host.textContent).toContain('twitch.tv/novaplays')
  })

  it('ignores stale out-of-order labels/links loads and preserves newer saves', async () => {
    const lb1 = beginLabelsLoad()
    const lb2 = beginLabelsLoad()
    useLive.getState().setLabels({ latest_follower: 'NewerFollower' }, lb2)
    useLive.getState().setLabels({ latest_follower: 'StaleFollower' }, lb1)
    expect(useLive.getState().labels?.latest_follower).toBe('NewerFollower')

    const lkGet = beginLinksLoad()
    useLive.getState().setLinks({ discord: 'discord.gg/saved', custom: [], socials: [] })
    useLive.getState().setLinks({ discord: 'discord.gg/stale', custom: [], socials: [] }, lkGet)
    expect(useLive.getState().links?.discord).toBe('discord.gg/saved')
  })

  it('disables MyLinksCard inputs and Reset while a save request is pending', async () => {
    const baseClient = new FerroClient({
      base: engine!.base,
      token: DEMO_TOKEN,
      fetch: engine!.fetch,
    })
    let finishSave!: () => void
    const saveGate = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    const client = new Proxy(baseClient, {
      get(target, prop, receiver) {
        if (prop === 'saveLinks') {
          return async (...args: Parameters<FerroClient['saveLinks']>) => {
            const res = await target.saveLinks(...args)
            await saveGate
            return res
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const status = await baseClient.status()
    useLive.setState({
      conn: { client, base: engine!.base } as never,
      status,
      connectors: status.connectors,
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <>
          <MyLinksCard />
          <Toaster />
        </>,
      )
      await vi.advanceTimersByTimeAsync(10)
    })

    const discordInput = host.querySelector<HTMLInputElement>(
      'input[placeholder="discord.gg/yourserver"]',
    )!
    const schedInput = host.querySelector<HTMLInputElement>('input[placeholder="Fridays, 8 PM"]')!
    await act(async () => {
      setInputValue(discordInput, 'https://discord.gg/inflight')
    })

    const saveBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save links',
    )!
    const resetBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reset',
    )!

    await act(async () => {
      saveBtn.click()
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(discordInput.disabled).toBe(true)
    expect(schedInput.disabled).toBe(true)
    expect(saveBtn.disabled).toBe(true)
    expect(resetBtn.disabled).toBe(true)

    await act(async () => {
      finishSave()
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(discordInput.disabled).toBe(false)
    expect(schedInput.disabled).toBe(false)
    expect(useLive.getState().links?.discord).toBe('discord.gg/inflight')
  })

  it('disables editing until hydrated, shows auto URLs in transient connector states, keeps custom row identity, and avoids double Next stream prefix', async () => {
    const baseClient = new FerroClient({
      base: engine!.base,
      token: DEMO_TOKEN,
      fetch: engine!.fetch,
    })
    await baseClient.saveLinks({
      instagram: 'instagram.com/existing',
      schedule_text: 'Next stream: Fridays 8 PM',
      custom: [
        { label: 'Row A', value: 'a.example.gg' },
        { label: 'Row B', value: 'b.example.gg' },
      ],
    })

    let releaseLinks!: () => void
    const linksGate = new Promise<void>((resolve) => {
      releaseLinks = resolve
    })
    let gatedOnce = false
    const client = new Proxy(baseClient, {
      get(target, prop, receiver) {
        if (prop === 'links' && !gatedOnce) {
          gatedOnce = true
          return async () => {
            await linksGate
            return target.links()
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const status = await baseClient.status()
    useLive.setState({
      conn: { client, base: engine!.base } as never,
      status,
      connectors: {
        ...status.connectors,
        twitch: {
          ...status.connectors.twitch,
          state: 'reconnecting',
        },
        youtube: {
          ...status.connectors.youtube,
          state: 'scopes_missing',
        },
      },
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <>
          <MyLinksCard />
          <Toaster />
        </>,
      )
      await vi.advanceTimersByTimeAsync(1)
    })

    const discordBefore = host.querySelector<HTMLInputElement>(
      'input[placeholder="discord.gg/yourserver"]',
    )!
    const addBefore = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add custom link'),
    )!
    expect(discordBefore.disabled).toBe(true)
    expect(addBefore.disabled).toBe(true)

    await act(async () => {
      releaseLinks()
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(discordBefore.disabled).toBe(false)
    expect(host.textContent).toContain('Auto: twitch.tv/novaplays')
    expect(host.textContent).toContain('Auto: youtube.com/@NovaPlays')
    expect(host.textContent).not.toContain('Next stream: Next stream:')
    expect(host.textContent).toContain('Next stream: Fridays 8 PM')
    const preview = host.querySelector('[data-testid="my-links-preview"]') as HTMLElement
    expect(preview.textContent).toContain('twitch.tv/novaplays')

    // Removing custom row 0 preserves the actual DOM input element of row 1 (stable React key).
    const labelInputsBefore = host.querySelectorAll<HTMLInputElement>('input[placeholder="Merch"]')
    expect(labelInputsBefore).toHaveLength(2)
    const rowBInput = labelInputsBefore[1]!
    const removeBtn0 = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove custom link 1"]',
    )!
    await act(async () => {
      removeBtn0.click()
    })
    const labelInputsAfter = host.querySelectorAll<HTMLInputElement>('input[placeholder="Merch"]')
    expect(labelInputsAfter).toHaveLength(1)
    expect(labelInputsAfter[0]).toBe(rowBInput)
  })
})
