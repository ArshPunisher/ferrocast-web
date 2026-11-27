import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PopoverSurface, getPreviewOverlays, resetPreviewOverlayRegistry } from '@ferrocast/ui'
import { useContextMenu, type MenuItem } from './menu'

// A menu taller than the window scrolls instead of being cut off (12 Nov); scrolling it keeps it
// open, scrolling the page closes it, and a sub-menu about to open on hover doesn't open for a
// row that moved away (CodeRabbit, 19 Nov).

let opener: ((e: ReactMouseEvent, label: string, items: MenuItem[]) => void) | null = null
function Host() {
  const { open, menu } = useContextMenu()
  opener = open
  return <>{menu}</>
}

const many: MenuItem[] = [
  { label: 'Has more', items: [{ label: 'Inside', onSelect: () => {} }] },
  ...Array.from({ length: 40 }, (_, i) => ({ label: `Row ${i}`, onSelect: () => {} })),
]

let root: Root | null = null
async function openMenu() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(<Host />))
  const at = document.createElement('button')
  document.body.appendChild(at)
  const ev = {
    preventDefault() {},
    stopPropagation() {},
    currentTarget: at,
    clientX: 10,
    clientY: 10,
  }
  await act(async () => opener!(ev as unknown as ReactMouseEvent, 'Test', many))
}
const menus = () => document.querySelectorAll('[data-fc-menu]')

beforeEach(() => {
  resetPreviewOverlayRegistry()
})

afterEach(async () => {
  vi.useRealTimers()
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  resetPreviewOverlayRegistry()
  vi.restoreAllMocks()
})

describe('a long menu', () => {
  it('stays open while it scrolls, and closes when the page scrolls', async () => {
    await openMenu()
    const menu = menus()[0] as HTMLElement
    expect(menu).toBeTruthy()
    await act(async () => menu.dispatchEvent(new Event('scroll')))
    expect(menus().length).toBe(1)
    await act(async () => document.dispatchEvent(new Event('scroll')))
    expect(menus().length).toBe(0)
  })

  it("doesn't open a sub-menu for a row that scrolled away", async () => {
    vi.useFakeTimers()
    await openMenu()
    const menu = menus()[0] as HTMLElement
    const row = [...menu.querySelectorAll('[role=menuitem]')].find((r) =>
      r.textContent?.includes('Has more'),
    )!
    await act(async () => row.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })))
    // React listens for pointerenter through pointerover on the root.
    await act(async () => row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    await act(async () => menu.dispatchEvent(new Event('scroll')))
    await act(async () => vi.advanceTimersByTime(300))
    expect(menus().length).toBe(1)
  })
})

describe('submenu flipping, safe bounds, and button anchoring (M4)', () => {
  it('flips submenus cleanly against parent menu left edge and subtracts chrome bounds', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(600)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)

    const header = document.body.appendChild(document.createElement('header'))
    header.style.position = 'sticky'
    header.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 600, bottom: 56, width: 600, height: 56 }) as DOMRect

    const nav = document.body.appendChild(document.createElement('nav'))
    nav.setAttribute('data-tab-bar', '')
    nav.style.position = 'fixed'
    nav.getBoundingClientRect = () =>
      ({ left: 0, top: 540, right: 600, bottom: 600, width: 600, height: 60 }) as DOMRect

    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () => root!.render(<Host />))
    const btn = document.body.appendChild(document.createElement('button'))

    // Mock parent menu dimensions so submenu (width 180) cannot fit on right of parent (left 380..right 590).
    const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('aria-label') === 'Test') return 210
      if (this.getAttribute('aria-label') === 'Has more') return 180
      return Number(origOffsetWidth.get?.call(this) ?? 0)
    })

    await act(async () =>
      opener!(
        {
          type: 'contextmenu',
          preventDefault() {},
          stopPropagation() {},
          currentTarget: btn,
          clientX: 380,
          clientY: 200,
        } as unknown as ReactMouseEvent,
        'Test',
        many,
      ),
    )

    const rootMenu = menus()[0] as HTMLElement
    expect(rootMenu).toBeTruthy()
    rootMenu.getBoundingClientRect = () =>
      ({ left: 380, top: 200, right: 590, bottom: 360, width: 210, height: 160 }) as DOMRect
    // Must subtract header (56+6=62) and tab-bar (540-6=534) -> maxHeight <= 534 - 200 = 334.
    expect(parseFloat(rootMenu.style.maxHeight)).toBeLessThanOrEqual(334)
    expect(getPreviewOverlays().some((e) => e.target === rootMenu)).toBe(true)

    const row = [...rootMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((r) =>
      r.textContent?.includes('Has more'),
    )!
    row.getBoundingClientRect = () =>
      ({ left: 384, top: 240, right: 586, bottom: 272, width: 202, height: 32 }) as DOMRect
    await act(async () => row.click())

    const subMenu = menus()[1] as HTMLElement
    expect(subMenu).toBeTruthy()
    const subLeft = parseFloat(subMenu.style.left)
    // Placed to the left of parent (parent left 380 + 4 overlap - 180 width = 204), never -220px gap!
    expect(subLeft).toBeGreaterThanOrEqual(200)
    expect(subLeft).toBeLessThanOrEqual(210)
    expect(getPreviewOverlays().some((e) => e.target === subMenu)).toBe(true)
  })

  it('anchors button clicks below trigger rect rather than pointer coordinates', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)

    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () => root!.render(<Host />))

    const btn = document.body.appendChild(document.createElement('button'))
    btn.getBoundingClientRect = () =>
      ({ left: 100, top: 80, right: 132, bottom: 112, width: 32, height: 32 }) as DOMRect

    await act(async () =>
      opener!(
        {
          type: 'click',
          preventDefault() {},
          stopPropagation() {},
          currentTarget: btn,
          clientX: 116,
          clientY: 96,
        } as unknown as ReactMouseEvent,
        'Actions',
        many.slice(0, 3),
      ),
    )

    const menu = menus()[0] as HTMLElement
    expect(menu).toBeTruthy()
    // Below the button bottom (112 + 6 = 118), never covering button at clientY=96.
    expect(parseFloat(menu.style.top)).toBe(118)
  })

  it('moves focus into opened submenu on click even if hover opened it first, so ArrowLeft returns cleanly', async () => {
    vi.useFakeTimers()
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)

    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () => root!.render(<Host />))
    const btn = document.body.appendChild(document.createElement('button'))

    await act(async () =>
      opener!(
        {
          type: 'click',
          preventDefault() {},
          stopPropagation() {},
          currentTarget: btn,
          clientX: 40,
          clientY: 40,
        } as unknown as ReactMouseEvent,
        'Test',
        many,
      ),
    )

    const rootMenu = menus()[0] as HTMLElement
    const row = [...rootMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((r) =>
      r.textContent?.includes('Has more'),
    )!

    // Simulate hover timer opening submenu, then pointer focus moving onto parent row before click.
    await act(async () => row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    await act(async () => vi.advanceTimersByTime(150))
    expect(menus().length).toBe(2)

    await act(async () => row.focus())
    expect(document.activeElement).toBe(row)

    await act(async () => row.click())
    const subMenu = menus()[1] as HTMLElement
    expect(subMenu).toBeTruthy()
    expect(subMenu.contains(document.activeElement)).toBe(true)

    // ArrowLeft inside submenu closes it and returns focus to parent row.
    await act(async () => {
      ;(document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      )
    })
    expect(menus().length).toBe(1)
    expect(document.activeElement).toBe(row)
  })

  it('closes root MenuList on Escape over another PopoverSurface even when items are disabled, and closes submenu first', async () => {
    const closePanel = vi.fn()
    function LayeredHost() {
      const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null)
      const panelBtnRef = useRef<HTMLButtonElement>(null)
      const { open, menu } = useContextMenu()
      return (
        <div>
          <PopoverSurface
            open
            onClose={closePanel}
            anchorRef={panelBtnRef}
            anchorRect={{ left: 100, top: 100, right: 140, bottom: 130, width: 40, height: 30 }}
            role="group"
            aria-label="More tools"
          >
            <button
              ref={panelBtnRef}
              type="button"
              onClick={(e) =>
                open(
                  e,
                  'History',
                  menuItems ?? [{ label: 'Nothing to undo yet', disabled: true }],
                )
              }
            >
              History
            </button>
            <button
              type="button"
              onClick={(e) => {
                setMenuItems([{ label: 'With sub', items: [{ label: 'Disabled sub', disabled: true }] }])
                open(e, 'Guides', [{ label: 'With sub', items: [{ label: 'Disabled sub', disabled: true }] }])
              }}
            >
              Guides
            </button>
          </PopoverSurface>
          {menu}
        </div>
      )
    }

    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () => root!.render(<LayeredHost />))

    // Open History with only a disabled item (focus stays outside menu items): Escape must still close MenuList!
    const historyBtn = document.body.querySelector('button')!
    await act(async () => historyBtn.click())
    expect(menus().length).toBe(1)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(menus().length).toBe(0)
    expect(closePanel).not.toHaveBeenCalled()

    // Open menu with submenu whose item is disabled -> Escape closes submenu first, then root menu, then panel.
    const guidesBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent === 'Guides',
    )!
    await act(async () => guidesBtn.click())
    const row = menus()[0]!.querySelector('[role="menuitem"]') as HTMLElement
    await act(async () => row.click())
    expect(menus().length).toBe(2)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(menus().length).toBe(1)
    expect(closePanel).not.toHaveBeenCalled()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(menus().length).toBe(0)
    expect(closePanel).not.toHaveBeenCalled()
  })
})
