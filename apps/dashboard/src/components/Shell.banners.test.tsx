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
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(document.documentElement.style.getPropertyValue('--fc-banners')).toBe('0px')
  })

  it('coalesces ResizeObserver bursts into one rAF and skips redundant setProperty writes', async () => {
    let bannerHeight = 44
    const client = {
      request: vi.fn(async () => null),
      settings: vi.fn(async () => ({ theme: 'dark' })),
      account: vi.fn(async () => ({ state: 'off' })),
      proStatus: vi.fn(async () => null),
      updates: vi.fn(async () => null),
    }
    useLive.setState({
      conn: { client, mode: 'demo' } as never,
      notices: [{ id: 1, at: 0, level: 'warn', message: 'Test banner' }],
    })
    const origRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName === 'HEADER') {
        return { height: 57, width: 1280, top: 0, left: 0, right: 1280, bottom: 57 } as DOMRect
      }
      if (this.dataset.bannersWrap === 'true') {
        return {
          height: bannerHeight,
          width: 1280,
          top: 57,
          left: 0,
          right: 1280,
          bottom: 57 + bannerHeight,
        } as DOMRect
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

    const setProp = vi.spyOn(document.documentElement.style, 'setProperty')

    // Unchanged height across repeated ResizeObserver notifications writes zero CSS vars.
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        for (const cb of roCallbacks) cb()
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    const unchangedCalls = setProp.mock.calls.filter(([name]) => name === '--fc-banners')
    expect(unchangedCalls).toHaveLength(0)

    // Multiple callbacks in a single frame with a changed height coalesce to one write.
    bannerHeight = 64
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        for (const cb of roCallbacks) cb()
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    const changedCalls = setProp.mock.calls.filter(([name]) => name === '--fc-banners')
    expect(changedCalls).toEqual([['--fc-banners', '64px']])
  })

  it('disables sidebar width and padding transitions on Studio while preserving slide elsewhere', async () => {
    const client = {
      request: vi.fn(async () => null),
      settings: vi.fn(async () => ({ theme: 'dark' })),
      account: vi.fn(async () => ({ state: 'off' })),
      proStatus: vi.fn(async () => null),
      updates: vi.fn(async () => null),
    }
    useLive.setState({
      conn: { client, mode: 'demo' } as never,
      notices: [],
    })
    window.location.hash = '#/studio'
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Shell demo={true}>
          <div>Child</div>
        </Shell>,
      )
    })

    const aside = () => host.querySelector<HTMLElement>('aside[aria-label="Sidebar"]')!
    const col = () => host.querySelector<HTMLElement>('.fc-shell-col')!
    expect(aside().className).not.toContain('duration-300')
    expect(aside().className).not.toContain('transition-[width]')
    expect(col()).not.toBeNull()
    expect(col().className).not.toContain('duration-300')
    expect(col().className).not.toContain('transition-[padding]')

    await act(async () => {
      window.location.hash = '#/'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(aside().className).toContain('duration-300')
    expect(aside().className).toContain('transition-[width]')
    expect(col().className).toContain('duration-300')
    expect(col().className).toContain('transition-[padding]')

    window.location.hash = ''
  })
})
