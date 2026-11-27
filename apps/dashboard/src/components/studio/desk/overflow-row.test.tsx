// @vitest-environment jsdom
import { Profiler, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreviewOverlays, resetPreviewOverlayRegistry } from '@ferrocast/ui'
import { OverflowRow, type OverflowItem } from './overflow-row'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout: every item is 60 px wide by default (customizable via itemWidths), More 26, gaps 10.
let rowWidth = 1000
const itemWidths = new Map<string, number>()
const widthOf = (el: HTMLElement) =>
  el.dataset.ov
    ? (itemWidths.get(el.dataset.ov) ?? 60)
    : el.hasAttribute('data-more')
      ? 26
      : 0
const used = (row: HTMLElement) => {
  const parts: number[] = [...row.querySelectorAll<HTMLElement>(':scope > [data-ov]')]
    .map(widthOf)
    .filter((w) => w > 0)
  const more = row.querySelector<HTMLElement>(':scope > [data-more]')
  if (more && !more.classList.contains('hidden')) parts.push(26)
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 10
}

describe('OverflowRow', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    itemWidths.clear()
    resetPreviewOverlayRegistry()
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
    resetPreviewOverlayRegistry()
    vi.unstubAllGlobals()
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
    // Not mounted while closed (M1): no inline hidden DOM or phantom hole.
    expect(document.body.querySelector('[data-ov-panel]')).toBeNull()
    expect(getPreviewOverlays()).toHaveLength(0)

    more.getBoundingClientRect = () =>
      ({ left: 260, top: 700, right: 286, bottom: 726, width: 26, height: 26 }) as DOMRect
    await act(async () => more.click())
    // Portals to document.body outside host and registers in PreviewOverlayRegistry.
    const movedItem = document.body.querySelector('[data-ov-panel="a"]') as HTMLElement
    expect(movedItem).not.toBeNull()
    expect(host.contains(movedItem)).toBe(false)
    const panelGroup = document.body.querySelector('[role="group"][aria-label="More tools"]')!
    expect(panelGroup.hasAttribute('data-over-preview')).toBe(true)
    expect(getPreviewOverlays().some((entry) => entry.target === panelGroup)).toBe(true)

    rowWidth = 1280
    await act(async () => {
      root.render(<OverflowRow items={[...items]} />)
    })
    expect(onRow()).toContain('a')
    expect(document.body.querySelector('[data-ov-panel]')).toBeNull()
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
    const panelButton = document.body.querySelector<HTMLElement>(
      '[data-ov-panel] button, [data-ov-panel]',
    )!
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
    const panelButton = document.body.querySelector<HTMLElement>(
      '[data-ov-panel] button, [data-ov-panel]',
    )!
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

  it('converges in a single pass on mount and coalesces ResizeObserver updates via rAF', async () => {
    const roCallbacks: Array<() => void> = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        cb: () => void
        constructor(cb: () => void) {
          this.cb = cb
          roCallbacks.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )

    let itemRenderCount = 0
    const trackedItems: OverflowItem[] = items.map((item) =>
      item.spacer
        ? item
        : {
            ...item,
            render: (inPanel) => {
              if (item.key === 'fixed') itemRenderCount += 1
              return item.render(inPanel)
            },
          },
    )
    const commits: Array<{ phase: string; ovCount: number; itemRenderCount: number }> = []
    rowWidth = 300
    root = createRoot(host)
    await act(async () => {
      root.render(
        <Profiler
          id="overflow"
          onRender={(_id, phase) =>
            commits.push({
              phase,
              ovCount: host.querySelectorAll('[data-ov]').length,
              itemRenderCount,
            })
          }
        >
          <OverflowRow items={trackedItems} />
        </Profiler>,
      )
    })

    // Single-pass collapse: initial mount (n=0) + 1 settled update (n=4), not N incremental steps.
    expect(commits).toHaveLength(2)
    expect(host.querySelectorAll('[data-ov]')).toHaveLength(3)

    commits.length = 0
    itemRenderCount = 0
    // Repeated ResizeObserver bursts without width change schedule 0 state commits.
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        for (const cb of roCallbacks) cb()
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(commits).toHaveLength(0)

    // Widening to 1280px coalesces burst RO events into 1 rAF and restores all items in 1 commit.
    rowWidth = 1280
    await act(async () => {
      for (let i = 0; i < 4; i++) {
        for (const cb of roCallbacks) cb()
      }
      expect(commits).toHaveLength(0)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(commits).toEqual([{ phase: 'update', ovCount: 7, itemRenderCount: 1 }])
    expect(host.querySelectorAll('[data-ov]')).toHaveLength(7)

    vi.unstubAllGlobals()
  })

  it('moves focus into More panel on open and handles Shift+Tab / Tab back to More button (F3)', async () => {
    await mount(240)
    const more = host.querySelector<HTMLElement>('button[aria-label="More tools"]')!
    more.getBoundingClientRect = () =>
      ({ left: 200, top: 700, right: 226, bottom: 726, width: 26, height: 26 }) as DOMRect

    await act(async () => more.click())
    const panel = document.body.querySelector('[role="group"][aria-label="More tools"]')!
    const panelBtns = [...panel.querySelectorAll<HTMLButtonElement>('button')]
    expect(panelBtns.length).toBeGreaterThan(1)
    expect(document.activeElement).toBe(panelBtns[0])
    expect(panel.querySelector('[data-ov-panel]')?.className).toContain('flex-wrap')

    // Shift+Tab from first item closes panel and returns focus to More button.
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      panelBtns[0]!.dispatchEvent(shiftTab)
    })
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.body.querySelector('[data-ov-panel]')).toBeNull()
    expect(document.activeElement).toBe(more)

    // Re-open, focus last button, Tab closes and returns focus to More button.
    await act(async () => more.click())
    const panel2Btns = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[data-ov-panel] button'),
    ]
    const lastBtn = panel2Btns[panel2Btns.length - 1]!
    lastBtn.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => {
      lastBtn.dispatchEvent(tab)
    })
    expect(tab.defaultPrevented).toBe(true)
    expect(document.body.querySelector('[data-ov-panel]')).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  it('refits when a control changes width without resizing the row (CR-2)', async () => {
    const observedEls: Element[] = []
    let roCb: (() => void) | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          roCb = cb
        }
        observe(el: Element) {
          observedEls.push(el)
        }
        unobserve() {}
        disconnect() {}
      },
    )

    const growItems: OverflowItem[] = [
      { key: 'a', rank: 0, render: () => <button>a</button> },
      { key: 'b', rank: 1, render: () => <button>b</button> },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    rowWidth = 220
    itemWidths.set('a', 60)
    itemWidths.set('b', 60)
    itemWidths.set('fixed', 60)
    root = createRoot(host)
    await act(async () => root.render(<OverflowRow items={growItems} />))
    expect(row().querySelectorAll('[data-ov]')).toHaveLength(3)
    expect(observedEls.length).toBeGreaterThan(1)

    // Child 'b' widens from 60px to 140px with same rowWidth and same orderKey -> overflows unless refit runs.
    itemWidths.set('b', 140)
    await act(async () => {
      root.render(<OverflowRow items={[...growItems]} />)
      roCb?.()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(row().scrollWidth).toBeLessThanOrEqual(row().clientWidth + 1)
    expect(row().querySelector('[data-ov="a"]')).toBeNull()
  })

  it('credits freed More width when restoring last item and ignores 0px hidden items when collapsing (CR-6, F9)', async () => {
    const few: OverflowItem[] = [
      { key: 'a', rank: 0, render: () => <button>a</button> },
      { key: 'b', rank: 1, render: () => <button>b</button> },
      { key: 'spacer', spacer: true, render: () => null },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    // Shrink to 160 so 'a' moves into More (used with b+fixed+More = 166 > 160 -> b moves too? At 170, b(60)+fixed(60)+More(26)+20 = 166 <= 170 -> only 'a' moved!).
    rowWidth = 170
    root = createRoot(host)
    await act(async () => root.render(<OverflowRow items={few} />))
    expect(row().querySelector('[data-ov="a"]')).toBeNull()
    expect(row().querySelector('[data-ov="b"]')).not.toBeNull()

    // Widen to 220: spacer has 44px slack; restoring 'a' (60) replaces More (26) -> net +34px <= 44px!
    rowWidth = 220
    await act(async () => root.render(<OverflowRow items={[...few]} />))
    expect(row().querySelector('[data-ov="a"]')).not.toBeNull()
    expect(host.querySelector('[data-more]')?.classList.contains('hidden')).toBe(true)

    // Zero-width hidden item must not falsely credit +GAP when collapsing.
    itemWidths.set('hiddenItem', 0)
    itemWidths.set('vis', 60)
    const withHidden: OverflowItem[] = [
      { key: 'first', rank: 0, render: () => <button>first</button> },
      { key: 'hiddenItem', rank: 1, render: () => null },
      { key: 'vis', rank: 2, render: () => <button>vis</button> },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    // Total visible width = 60+60+60 + 20 = 200. At 195px (overflow = 5):
    // moving 'first' frees 60 - 26 = 34 > 5 -> fits in 1 collapse pass.
    // Instead test rank 0 = 40 (gain 40-26 = 14), rank 1 = 0 (gain MUST be 0, not +10!), rank 2 = 60 (gain 70) at overflow 20:
    itemWidths.set('first', 40)
    rowWidth = 160 // used = 40+60+60+20 = 180 -> overflow = 20!
    await act(async () => root.render(<OverflowRow items={withHidden} />))
    // After moving first (+14) and hiddenItem (+0 < 20), vis MUST also move so row does not overflow!
    expect(row().querySelector('[data-ov="vis"]')).toBeNull()
  })

  it('measures available width when row has no spacer (CR-7) and resets stored n when ranked items are removed (CR-11)', async () => {
    const noSpacer: OverflowItem[] = [
      { key: 'a', rank: 0, render: () => <button>a</button> },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    itemWidths.set('a', 60)
    itemWidths.set('fixed', 40)
    // All items fit in 110px. At 90px, 'a' moves into More (used = 40+26+10 = 76).
    rowWidth = 90
    root = createRoot(host)
    await act(async () => root.render(<OverflowRow items={noSpacer} />))
    expect(row().querySelector('[data-ov="a"]')).toBeNull()

    // Widen to 140px with NO spacer: 'a' must restore cleanly instead of seeing scrollWidth === clientWidth (0 slack).
    rowWidth = 140
    await act(async () => root.render(<OverflowRow items={[...noSpacer]} />))
    expect(row().querySelector('[data-ov="a"]')).not.toBeNull()

    // CR-11: move 3 ranked items into More, remove all ranked items, then add 3 new ranked items on a wide row.
    const three: OverflowItem[] = [
      { key: 'r1', rank: 0, render: () => <button>r1</button> },
      { key: 'r2', rank: 1, render: () => <button>r2</button> },
      { key: 'r3', rank: 2, render: () => <button>r3</button> },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    rowWidth = 90
    await act(async () => root.render(<OverflowRow items={three} />))
    expect(row().querySelectorAll('[data-ov]')).toHaveLength(1) // only fixed remains

    // Remove all ranked items.
    await act(async () =>
      root.render(<OverflowRow items={[{ key: 'fixed', render: () => <button>fixed</button> }]} />),
    )

    // Widen row and add 3 brand-new ranked items: all 3 must render on the row, not trapped in More!
    rowWidth = 500
    const nextThree: OverflowItem[] = [
      { key: 'n1', rank: 0, render: () => <button>n1</button> },
      { key: 'n2', rank: 1, render: () => <button>n2</button> },
      { key: 'n3', rank: 2, render: () => <button>n3</button> },
      { key: 'fixed', render: () => <button>fixed</button> },
    ]
    await act(async () => root.render(<OverflowRow items={nextThree} />))
    expect(row().querySelectorAll('[data-ov]')).toHaveLength(4)
  })
})
