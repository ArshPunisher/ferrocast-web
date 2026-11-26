import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { useLive } from '../lib/store'
import { Chat } from './Chat'

let root: Root | null = null
let engine: DemoEngine | null = null

function createMatchMediaController(initialWide = true) {
  let isWide = initialWide
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => {
    const matchesQuery = () => (query.includes('min-width: 1024px') ? isWide : false)
    return {
      get matches() {
        return matchesQuery()
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => {
        listeners.add(fn)
      },
      removeEventListener: (_: string, fn: () => void) => {
        listeners.delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }
  }) as unknown as typeof window.matchMedia

  return {
    setWide(next: boolean) {
      isWide = next
      for (const fn of [...listeners]) fn()
    },
  }
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  engine?.dispose()
  engine = null
  document.body.innerHTML = ''
  localStorage.clear()
  useLive.setState({
    conn: null,
    chat: [],
    deleted: new Set(),
    held: new Map(),
    events: [],
    queue: null,
    connectors: null,
    remote: null,
  })
  vi.restoreAllMocks()
})

describe('Chat stability', () => {
  it('subtracts --fc-banners across viewport height classes and keeps composer mounted across 1024px', async () => {
    const media = createMatchMediaController(true)
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    useLive.setState({
      conn: { client, mode: 'demo' } as never,
      connectors: {
        twitch: { state: 'connected', channel: 'demo' },
        youtube: { state: 'off' },
        kick: { state: 'off' },
        facebook: { state: 'off' },
      } as never,
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Chat />)
    })

    const rootWrap = host.firstElementChild as HTMLElement
    expect(rootWrap.className).toContain(
      'h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-86px-env(safe-area-inset-bottom))]',
    )
    expect(rootWrap.className).toContain(
      'sm:h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-88px-env(safe-area-inset-bottom))]',
    )
    expect(rootWrap.className).toContain(
      'lg:h-[calc(100dvh-var(--fc-top,56px)-var(--fc-banners,0px)-24px-var(--fc-statusbar,0px))]',
    )

    const composerBefore = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[placeholder], textarea[placeholder]',
    )!
    expect(composerBefore).not.toBeNull()
    composerBefore.focus()
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composerBefore), 'value')!
    desc.set!.call(composerBefore, 'draft message before resize')
    composerBefore.dispatchEvent(new Event('input', { bubbles: true }))

    await act(async () => {
      media.setWide(false)
    })

    const composerNarrow = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[placeholder], textarea[placeholder]',
    )!
    expect(composerNarrow).toBe(composerBefore)
    expect(composerNarrow.value).toBe('draft message before resize')
    expect(document.activeElement).toBe(composerBefore)

    await act(async () => {
      media.setWide(true)
    })

    const composerWideAgain = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[placeholder], textarea[placeholder]',
    )!
    expect(composerWideAgain).toBe(composerBefore)
    expect(composerWideAgain.value).toBe('draft message before resize')
  })

  it('coalesces splitter pointermove updates via rAF with a single localStorage write on pointerup', async () => {
    createMatchMediaController(true)
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    useLive.setState({ conn: { client, mode: 'demo' } as never })

    vi.spyOn(HTMLDivElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'chat-events-pane') {
        return {
          x: 680,
          y: 0,
          width: 320,
          height: 600,
          top: 0,
          right: 1000,
          bottom: 600,
          left: 680,
          toJSON: () => ({}),
        } as DOMRect
      }
      return {
        x: 0,
        y: 0,
        width: 1000,
        height: 600,
        top: 0,
        right: 1000,
        bottom: 600,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect
    })

    const rafQueue: Array<FrameRequestCallback> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Chat />)
    })

    const splitter = host.querySelector<HTMLElement>('[data-testid="chat-events-splitter"]')!
    splitter.setPointerCapture = () => {}

    act(() => {
      splitter.dispatchEvent(new MouseEvent('pointerdown', { clientX: 680, bubbles: true }))
      splitter.dispatchEvent(new MouseEvent('pointermove', { clientX: 640, bubbles: true }))
      splitter.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, bubbles: true }))
    })

    expect(rafQueue).toHaveLength(1)
    expect(setItemSpy).not.toHaveBeenCalled()

    await act(async () => {
      while (rafQueue.length) rafQueue.shift()?.(0)
    })
    expect(setItemSpy).not.toHaveBeenCalled()

    await act(async () => {
      splitter.dispatchEvent(new MouseEvent('pointerup', { clientX: 590, bubbles: true }))
    })
    expect(setItemSpy).toHaveBeenCalledTimes(1)
  })
})
