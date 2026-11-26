import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLive } from '../lib/store'
import { Shell } from './Shell'

vi.mock('motion/react', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    AnimatePresence: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children as never),
    useReducedMotion: () => false,
    motion: {
      div: ({
        children,
        role,
        className,
      }: {
        children: unknown
        role?: string
        className?: string
      }) => createElement('div', { role, className }, children as never),
      span: ({ children, className }: { children?: unknown; className?: string }) =>
        createElement('span', { className }, children as never),
    },
  }
})

let root: Root | null = null
let roCallbacks: Array<() => void> = []

describe('Shell --fc-top and --fc-banners measurement', () => {
  beforeEach(() => {
    roCallbacks = []
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--fc-top')
    document.documentElement.style.removeProperty('--fc-banners')
    useLive.setState({ conn: null, notices: [], status: null, remote: null })
    vi.restoreAllMocks()
  })

  it('measures banner height into --fc-banners separately from --fc-top when notices render', async () => {
    const client = {
      request: vi.fn(async () => null),
      settings: vi.fn(async () => ({ theme: 'dark' })),
      account: vi.fn(async () => ({ state: 'off' })),
      proStatus: vi.fn(async () => null),
      updates: vi.fn(async () => null),
    }
    useLive.setState({
      conn: { client, mode: 'demo' } as never,
      notices: [
        {
          id: 1,
          at: 0,
          level: 'warn',
          message: 'OBS disconnected',
        },
      ],
    })

    const origRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName === 'HEADER') {
        return {
          width: 1200,
          height: 57,
          top: 0,
          left: 0,
          bottom: 57,
          right: 1200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }
      }
      if (this.dataset.bannersWrap === 'true') {
        const hasBanner = this.childElementCount > 0
        const h = hasBanner ? 44 : 0
        return {
          width: 1200,
          height: h,
          top: 57,
          left: 0,
          bottom: 57 + h,
          right: 1200,
          x: 0,
          y: 57,
          toJSON: () => ({}),
        }
      }
      return origRect.call(this)
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Shell demo={true}>
          <div>Child</div>
        </Shell>,
      )
    })

    expect(document.documentElement.style.getPropertyValue('--fc-top')).toBe('57px')
    expect(document.documentElement.style.getPropertyValue('--fc-banners')).toBe('44px')

    await act(async () => {
      useLive.setState({ notices: [] })
    })
    await act(async () => {
      for (const cb of roCallbacks) cb()
    })
    expect(document.documentElement.style.getPropertyValue('--fc-banners')).toBe('0px')
  })
})
