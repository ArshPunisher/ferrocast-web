import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Dialog, getPreviewOverlays, resetPreviewOverlayRegistry } from '@ferrocast/ui'
import { Menu } from './Menu'

let root: Root | null = null

describe('Menu viewport containment (Problem 4)', () => {
  beforeEach(() => {
    resetPreviewOverlayRegistry()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    }
    window.matchMedia = ((q: string) => ({
      matches: true,
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
    resetPreviewOverlayRegistry()
    vi.restoreAllMocks()
  })

  it('subtracts sticky header and Studio status footer when constraining menu height and flipping upward', async () => {
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)

    const header = document.createElement('header')
    header.style.position = 'sticky'
    header.getBoundingClientRect = () =>
      ({ top: 0, bottom: 56, left: 0, right: 1280, width: 1280, height: 56 }) as DOMRect
    document.body.appendChild(header)

    const footer = document.createElement('footer')
    footer.setAttribute('aria-label', 'Studio status')
    footer.style.position = 'fixed'
    footer.getBoundingClientRect = () =>
      ({ top: 772, bottom: 800, left: 240, right: 1280, width: 1040, height: 28 }) as DOMRect
    document.body.appendChild(footer)

    const items = Array.from({ length: 12 }, (_, i) => ({
      key: `item-${i}`,
      label: `Widget ${i}`,
      onSelect: vi.fn(),
    }))

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <Menu
          label="Add something else"
          items={items}
          trigger={(p) => (
            <button type="button" {...p}>
              More
            </button>
          )}
        />,
      ),
    )

    const wrap = host.firstElementChild as HTMLElement
    // Place trigger in lower half so downward would cross status bar; above has 500 - 6 - 64 = 430px.
    wrap.getBoundingClientRect = () =>
      ({ top: 500, bottom: 532, left: 400, right: 432, width: 32, height: 32 }) as DOMRect

    const origDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')!
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('role') === 'menu') return 480
      return Number(origDesc.get?.call(this) ?? 0)
    })

    const btn = host.querySelector('button')!
    await act(async () => btn.click())

    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    expect(menu).toBeTruthy()
    const top = parseFloat(menu.style.top)
    const maxHeight = parseFloat(menu.style.maxHeight)
    expect(top).toBeGreaterThanOrEqual(64)
    expect(top + Math.min(480, maxHeight)).toBeLessThanOrEqual(500)
    expect(maxHeight).toBeLessThanOrEqual(430)

    // Now test downward opening near mid-screen: top + maxHeight must stop before footer top (772 - 8 = 764).
    await act(async () => btn.click())
    wrap.getBoundingClientRect = () =>
      ({ top: 300, bottom: 332, left: 400, right: 432, width: 32, height: 32 }) as DOMRect
    await act(async () => btn.click())

    const menu2 = document.body.querySelector('[role="menu"]') as HTMLElement
    const top2 = parseFloat(menu2.style.top)
    const maxHeight2 = parseFloat(menu2.style.maxHeight)
    expect(top2).toBe(338)
    expect(top2 + maxHeight2).toBeLessThanOrEqual(764)
  })

  it('portals into enclosing dialog to escape overflow-hidden, skips visibility:hidden, and registers in PreviewOverlayRegistry (M5)', async () => {
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)

    const items = [
      { key: 'edit', label: 'Edit', onSelect: vi.fn() },
      { key: 'delete', label: 'Delete', danger: true, onSelect: vi.fn() },
    ]
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <Dialog open onClose={() => undefined} title="Auto replies">
          <div data-testid="clipped" className="overflow-hidden">
            <Menu
              label="Reply actions"
              items={items}
              trigger={(p) => (
                <button type="button" {...p}>
                  Actions
                </button>
              )}
            />
          </div>
        </Dialog>,
      ),
    )

    const dlg = document.querySelector('dialog[open]')!
    const clipped = dlg.querySelector('[data-testid="clipped"]')!
    const triggerWrap = clipped.firstElementChild as HTMLElement
    triggerWrap.getBoundingClientRect = () =>
      ({ top: 300, bottom: 332, left: 400, right: 480, width: 80, height: 32 }) as DOMRect

    const triggerBtn = clipped.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
    await act(async () => triggerBtn.click())

    const menu = dlg.querySelector('[role="menu"][aria-label="Reply actions"]') as HTMLElement
    expect(menu).toBeTruthy()
    // Portalled to the <dialog> top layer directly, never trapped inside the clipped container.
    expect(menu.parentElement).toBe(dlg)
    expect(clipped.contains(menu)).toBe(false)
    expect(menu.style.visibility).toBe('')
    expect(menu.style.transform).toBe('')
    expect(getPreviewOverlays().some((entry) => entry.target === menu)).toBe(true)
  })
})
