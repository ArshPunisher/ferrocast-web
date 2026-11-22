// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OverflowRow, type OverflowItem } from './overflow-row'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout: every item is 60 px wide, the More button 26, gaps 10, as a fake row.
let rowWidth = 1000
const widthOf = (el: HTMLElement) => (el.dataset.ov ? 60 : el.hasAttribute('data-more') ? 26 : 0)
const used = (row: HTMLElement) => {
  const parts: number[] = [...row.querySelectorAll<HTMLElement>(':scope > [data-ov]')].map(widthOf)
  const more = row.querySelector<HTMLElement>(':scope > [data-more]')
  if (more && !more.classList.contains('hidden')) parts.push(26)
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 10
}

describe('OverflowRow', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.hasAttribute('data-overflow-row') ? rowWidth : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.hasAttribute('data-overflow-row') ? Math.max(rowWidth, used(this)) : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        if (this.dataset?.ovSpacer !== undefined) {
          const row = this.parentElement as HTMLElement
          return Math.max(0, rowWidth - used(row) - 10)
        }
        return widthOf(this)
      },
    })
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    // @ts-expect-error restore jsdom's own accessors
    delete HTMLElement.prototype.clientWidth
    // @ts-expect-error restore jsdom's own accessors
    delete HTMLElement.prototype.scrollWidth
    // @ts-expect-error restore jsdom's own accessors
    delete HTMLElement.prototype.offsetWidth
  })

  const items: OverflowItem[] = [
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => ({
      key: k,
      rank: i,
      render: () => <button>{k}</button>,
    })),
    { key: 'spacer', spacer: true, render: () => null },
    { key: 'fixed', render: () => <button>fixed</button> },
  ]
  const mount = async (w: number) => {
    rowWidth = w
    root = createRoot(host)
    await act(async () => root.render(<OverflowRow items={items} />))
  }
  const row = () => host.querySelector<HTMLElement>('[data-overflow-row]')!

  for (const w of [1280, 1024, 768, 375]) {
    it(`stays on one row at ${w} px`, async () => {
      await mount(w)
      expect(row().scrollWidth).toBeLessThanOrEqual(row().clientWidth + 1)
      // The item that never moves is always on the row.
      expect(row().querySelector('[data-ov="fixed"]')).not.toBeNull()
    })
  }

  it('moves the lowest-ranked items first, shows the More button, and brings them back', async () => {
    await mount(300)
    const onRow = () =>
      [...row().querySelectorAll('[data-ov]')].map((e) => (e as HTMLElement).dataset.ov)
    expect(onRow()).not.toContain('a')
    expect(onRow()).toContain('fixed')
    const more = host.querySelector<HTMLElement>('button[aria-label="More tools"]')!
    expect(more.closest('.hidden')).toBeNull()
    // The panel lists what moved.
    expect(host.querySelector('[data-ov-panel="a"]')).not.toBeNull()
    rowWidth = 1280
    await act(async () => {
      root.render(<OverflowRow items={[...items]} />)
    })
    expect(onRow()).toContain('a')
    expect(host.querySelector('[data-ov-panel]')).toBeNull()
  })

  it('stays open for a menu a button in the panel opened, not for any other menu', async () => {
    await mount(300)
    const more = host.querySelector<HTMLElement>('button[aria-label="More tools"]')!
    await act(async () => more.click())
    expect(more.getAttribute('aria-expanded')).toBe('true')
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    // A menu nothing in the panel opened (no press in the panel before it): a press in it is
    // outside the panel, and the panel closes.
    await act(async () => {
      menu.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    // Opened again; a press on a button in the panel, then a press in the menu it opens: stays.
    await act(async () => more.click())
    const panelButton = host.querySelector<HTMLElement>('[data-ov-panel] button, [data-ov-panel]')!
    await act(async () => {
      panelButton.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      menu.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(more.getAttribute('aria-expanded')).toBe('true')
    // A press on the page itself closes it.
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    menu.remove()
  })

  it('stays open for a menu a button in the panel opened with the keyboard', async () => {
    await mount(300)
    const more = host.querySelector<HTMLElement>('button[aria-label="More tools"]')!
    await act(async () => more.click())
    const panelButton = host.querySelector<HTMLElement>('[data-ov-panel] button, [data-ov-panel]')!
    await act(async () => {
      panelButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    await act(async () => {
      menu.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(more.getAttribute('aria-expanded')).toBe('true')
    menu.remove()
  })
})
