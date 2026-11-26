import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatScroller } from './chat'

let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ChatScroller ResizeObserver attachment', () => {
  it('re-attaches ResizeObserver when child swaps from EmptyState to list on 0 -> 1 transition', async () => {
    const instances: Array<{ cb: () => void; observed: Element[]; unobserved: Element[] }> = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      rec: { cb: () => void; observed: Element[]; unobserved: Element[] }
      constructor(cb: () => void) {
        this.rec = { cb, observed: [], unobserved: [] }
        instances.push(this.rec)
      }
      observe(el: Element) {
        this.rec.observed.push(el)
      }
      unobserve(el: Element) {
        this.rec.unobserved.push(el)
      }
      disconnect() {}
    }

    let listHeight = 400
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <ChatScroller count={0} label="Test chat">
          <div data-testid="empty-state">Empty</div>
        </ChatScroller>,
      )
    })

    const log = host.querySelector<HTMLDivElement>('[role="log"]')!
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => listHeight })

    await act(async () => {
      root!.render(
        <ChatScroller count={1} label="Test chat">
          <ul data-testid="chat-list">
            <li>First line</li>
          </ul>
        </ChatScroller>,
      )
    })

    const listEl = host.querySelector<HTMLUListElement>('[data-testid="chat-list"]')!
    expect(instances.some((inst) => inst.observed.includes(listEl))).toBe(true)

    // Simulate list content growing async after mount (e.g. emote image load)
    listHeight = 620
    await act(async () => {
      for (const inst of instances) {
        if (inst.observed.includes(listEl)) inst.cb()
      }
    })
    expect(log.scrollTop).toBe(620)
  })
})
