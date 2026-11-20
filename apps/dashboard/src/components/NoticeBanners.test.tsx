import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { NoticeItem } from '../lib/store'
import { useLive } from '../lib/store'
import { NoticeBanners } from './NoticeBanners'

// jsdom doesn't run exit animations, so the old banners would stay in the page: plain elements.
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
    },
  }
})

// One banner at a time, one line, the detail behind an (i) (M12 C-3).

let root: Root | null = null
const n = (id: number, message: string, extra: Partial<NoticeItem> = {}): NoticeItem => ({
  id,
  at: 0,
  level: 'warn',
  message,
  ...extra,
})

async function mount(notices: NoticeItem[], dismiss = vi.fn()) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () => root!.render(<NoticeBanners notices={notices} dismiss={dismiss} />))
  return { dismiss }
}
const byName = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  )
const lines = () =>
  [...document.querySelectorAll('[role="status"] p, [role="alert"] p')].map((p) => p.textContent)

beforeEach(() => {
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
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('NoticeBanners', () => {
  it('shows nothing when there is nothing to say', async () => {
    await mount([])
    expect(document.body.textContent).toBe('')
  })

  it('shows only the newest and folds the rest behind a count that opens them', async () => {
    await mount([n(1, 'first'), n(2, 'second'), n(3, 'third')])
    expect(lines()).toEqual(['third'])
    const more = byName('+2 more')!
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await act(async () => more.click())
    expect(lines()).toEqual(['first', 'second', 'third'])
    await act(async () => byName('Show one')!.click())
    expect(lines()).toEqual(['third'])
  })

  it('a line with a detail has an (i) that opens it in place; without one there is none', async () => {
    await mount([n(1, 'Discord: the post failed', { detail: 'Discord said: Missing Access' })])
    expect(document.body.textContent).not.toContain('Missing Access')
    const i = byName('More about this notice')!
    expect(i.getAttribute('aria-expanded')).toBe('false')
    await act(async () => i.click())
    expect(i.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(i.getAttribute('aria-controls')!)?.textContent).toBe(
      'Discord said: Missing Access',
    )
    await act(async () => i.click())
    expect(document.body.textContent).not.toContain('Missing Access')
    await act(async () =>
      root!.render(<NoticeBanners notices={[n(2, 'Plain')]} dismiss={vi.fn()} />),
    )
    expect(byName('More about this notice')).toBeUndefined()
  })

  it('keeps the action link, errors announce as alerts, and Dismiss dismisses the shown one', async () => {
    const { dismiss } = await mount([
      n(7, 'Sign-in failed', { level: 'error', action: { label: 'Sign in', href: '#/settings' } }),
    ])
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.querySelector('a')?.getAttribute('href')).toBe('#/settings')
    await act(async () => byName('Dismiss')!.click())
    expect(dismiss).toHaveBeenCalledWith(7)
  })

  it('folds back to one when the others are gone', async () => {
    await mount([n(1, 'a'), n(2, 'b')])
    await act(async () => byName('+1 more')!.click())
    await act(async () => root!.render(<NoticeBanners notices={[n(2, 'b')]} dismiss={vi.fn()} />))
    expect(lines()).toEqual(['b'])
    expect(byName('Show one')).toBeUndefined()
  })

  it('an action with a request is a button: Reload POSTs it, then the banner goes', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    useLive.setState({ conn: { client: { request } } as never })
    const dismiss = vi.fn()
    await mount(
      [
        n(7, 'Alerts stopped drawing', {
          action: {
            label: 'Reload',
            href: '/api/v1/studio/engine/sources/Alerts/web',
            post: { do: 'reload' },
          },
        }),
      ],
      dismiss,
    )
    expect(document.querySelector('a[href*="/sources/"]')).toBeNull()
    const reload = byName('Reload')
    expect(reload).toBeDefined()
    await act(async () => reload!.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/studio/engine/sources/Alerts/web', {
      do: 'reload',
    })
    expect(dismiss).toHaveBeenCalledWith(7)
    useLive.setState({ conn: null })
  })

  it('a failed Reload keeps the banner (it can be tried again)', async () => {
    const request = vi.fn().mockRejectedValue(new Error('nope'))
    useLive.setState({ conn: { client: { request } } as never })
    const dismiss = vi.fn()
    await mount(
      [
        n(8, 'Chat stopped drawing', {
          action: { label: 'Reload', href: '/x', post: { do: 'reload' } },
        }),
      ],
      dismiss,
    )
    await act(async () => byName('Reload')!.click())
    expect(request).toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
    useLive.setState({ conn: null })
  })
})
