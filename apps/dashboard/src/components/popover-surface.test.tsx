import { act, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Dialog,
  PopoverSurface,
  getPreviewOverlays,
  resetPreviewOverlayRegistry,
  safeViewportBounds,
} from '@ferrocast/ui'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

let root: Root | null = null

beforeEach(() => {
  resetPreviewOverlayRegistry()
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  resetPreviewOverlayRegistry()
  vi.restoreAllMocks()
})

describe('PopoverSurface', () => {
  it('mounts only when open, portals into document.body or enclosing dialog, and registers in PreviewOverlayRegistry', async () => {
    const onClose = vi.fn()
    function Host({ insideDialog = false }: { insideDialog?: boolean }) {
      const [open, setOpen] = useState(false)
      const [dlgOpen, setDlgOpen] = useState(insideDialog)
      const btn = useRef<HTMLButtonElement>(null)
      const content = (
        <>
          <button ref={btn} type="button" onClick={() => setOpen((o) => !o)}>
            Open pop
          </button>
          <PopoverSurface
            open={open}
            onClose={() => {
              onClose()
              setOpen(false)
            }}
            anchorRef={btn}
            role="menu"
            aria-label="Test pop"
          >
            <button type="button" role="menuitem">
              Action
            </button>
          </PopoverSurface>
        </>
      )
      return insideDialog ? (
        <Dialog open={dlgOpen} onClose={() => setDlgOpen(false)} title="Box">
          {content}
        </Dialog>
      ) : (
        <div className="overflow-hidden">{content}</div>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host />))

    // Never mounted while closed.
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(getPreviewOverlays()).toHaveLength(0)

    const trigger = container.querySelector('button')!
    trigger.getBoundingClientRect = () => rect(200, 120, 80, 32)
    await act(async () => trigger.click())

    const pop = document.body.querySelector('[role="menu"][aria-label="Test pop"]') as HTMLElement
    expect(pop).toBeTruthy()
    expect(pop.parentElement).toBe(document.body)
    expect(pop.hasAttribute('data-over-preview')).toBe(true)
    expect(pop.style.visibility).toBe('')
    expect(getPreviewOverlays().some((e) => e.target === pop)).toBe(true)

    // Inside a <dialog>, portals directly into <dialog> (top layer, escaping panel overflow-hidden).
    await act(async () => root!.render(<Host key="dlg" insideDialog />))
    const dlg = document.querySelector('dialog[open]')!
    const dlgTrigger = [...dlg.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open pop',
    )!
    dlgTrigger.getBoundingClientRect = () => rect(400, 260, 80, 32)
    await act(async () => dlgTrigger.click())

    const dlgPop = dlg.querySelector('[role="menu"][aria-label="Test pop"]') as HTMLElement
    expect(dlgPop).toBeTruthy()
    expect(dlgPop.parentElement).toBe(dlg)

    // Escape closes the popover without closing the enclosing dialog.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dlg.querySelector('[role="menu"]')).toBeNull()
    expect(dlg.hasAttribute('open')).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('ignores stale pre-open scroll events on anchor ancestors when scrollTop has not changed', async () => {
    const onClose = vi.fn()
    function Host() {
      const [open, setOpen] = useState(false)
      const btn = useRef<HTMLButtonElement>(null)
      return (
        <div data-testid="scroller" className="overflow-y-auto">
          <button ref={btn} type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <PopoverSurface
            open={open}
            onClose={() => {
              onClose()
              setOpen(false)
            }}
            anchorRef={btn}
            role="menu"
            aria-label="Scroll test"
          >
            <button type="button" role="menuitem">
              Item
            </button>
          </PopoverSurface>
        </div>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host />))

    const scroller = container.querySelector('[data-testid="scroller"]') as HTMLElement
    const btn = container.querySelector('button')!
    btn.getBoundingClientRect = () => rect(40, 200, 60, 28)
    let scrollY = 120
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollY,
      set: (v: number) => {
        scrollY = v
      },
    })

    await act(async () => btn.click())
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy()

    // Deferred scroll event from pre-open scrollIntoView has same scrollTop -> ignored.
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: false }))
    })
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    // Actual user scroll after open changes scrollTop -> closes cleanly.
    scrollY = 150
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: false }))
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('excludes dismissible=false submenus from openPopoverStack and tracks dismissible changes', async () => {
    const closeRoot = vi.fn()
    const closeSub = vi.fn()
    function Host({ subDismissible = false }: { subDismissible?: boolean }) {
      const rootBtn = useRef<HTMLButtonElement>(null)
      const subBtn = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={rootBtn} type="button">
            Root
          </button>
          <PopoverSurface
            open
            onClose={closeRoot}
            anchorRef={rootBtn}
            anchorRect={rect(100, 100, 80, 32)}
            role="group"
            aria-label="Root"
          >
            <button ref={subBtn} type="button">
              Sub
            </button>
          </PopoverSurface>
          <PopoverSurface
            open
            dismissible={subDismissible}
            onClose={closeSub}
            anchorRef={subBtn}
            anchorRect={rect(200, 100, 80, 32)}
            role="menu"
            aria-label="Submenu"
          >
            <div>Sub item</div>
          </PopoverSurface>
        </>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host subDismissible={false} />))

    // Escape must reach Root even though Submenu mounted after it with dismissible=false.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeRoot).toHaveBeenCalledWith('escape')
    expect(closeSub).not.toHaveBeenCalled()

    // Toggling dismissible true -> false -> true updates stack ownership cleanly.
    closeRoot.mockClear()
    await act(async () => root!.render(<Host subDismissible />))
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeSub).toHaveBeenCalledWith('escape')
    expect(closeRoot).not.toHaveBeenCalled()

    closeSub.mockClear()
    await act(async () => root!.render(<Host subDismissible={false} />))
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeRoot).toHaveBeenCalledWith('escape')
  })

  it('preserves authored CSS max-width and caps matchAnchorWidth minWidth at pos.maxWidth', async () => {
    const styleTag = document.head.appendChild(document.createElement('style'))
    styleTag.textContent = '.cap-300 { max-width: 300px; }'

    function Host({ match = false }: { match?: boolean }) {
      const btn = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={btn} type="button">
            Anchor
          </button>
          <PopoverSurface
            open
            onClose={() => undefined}
            anchorRef={btn}
            anchorRect={match ? rect(0, 100, 400, 32) : rect(100, 100, 40, 24)}
            matchAnchorWidth={match}
            role="tooltip"
            className={match ? '' : 'cap-300'}
          >
            <span>Tooltip text</span>
          </PopoverSurface>
        </>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host match={false} />))

    const tip = document.body.querySelector('[role="tooltip"]') as HTMLElement
    // Must not overwrite CSS max-width: 300px with bounds width (1264px).
    expect(parseFloat(tip.style.maxWidth || '300')).toBeLessThanOrEqual(300)

    // With 400px viewport (maxWidth = 384) and 400px anchor + matchAnchorWidth, minWidth caps at 384.
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(400)
    await act(async () => root!.render(<Host key="narrow" match />))
    const matched = document.body.querySelector('[role="tooltip"]') as HTMLElement
    expect(parseFloat(matched.style.maxWidth)).toBe(384)
    expect(parseFloat(matched.style.minWidth)).toBe(384)

    styleTag.remove()
  })

  it('keeps global listeners stable across parent re-renders and avoids body-to-dialog double mount', async () => {
    const addWin = vi.spyOn(window, 'addEventListener')
    const addDoc = vi.spyOn(document, 'addEventListener')
    const mounts: string[] = []

    function Probe() {
      useEffect(() => {
        const dlg = document.querySelector('dialog[open]')
        const inDialog = Boolean(dlg?.contains(document.querySelector('[data-probe]')))
        mounts.push(inDialog ? 'dialog' : 'body')
      }, [])
      return <span data-probe>Probe</span>
    }

    function Host({ tick }: { tick: number }) {
      const btn = useRef<HTMLButtonElement>(null)
      return (
        <Dialog open onClose={() => undefined} title={`Box ${tick}`}>
          <button ref={btn} type="button">
            Open
          </button>
          <PopoverSurface
            open
            onClose={() => undefined}
            anchorRef={btn}
            anchorRect={{ left: 200, top: 200, right: 260, bottom: 230, width: 60, height: 30 }}
            shouldIgnoreOutsidePointerDown={() => false}
            role="menu"
          >
            <Probe />
          </PopoverSurface>
        </Dialog>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host tick={1} />))

    // Probe must mount straight into <dialog>, never mounting into document.body first.
    expect(mounts).toEqual(['dialog'])

    const resizeAdds = addWin.mock.calls.filter(([t]) => t === 'resize').length
    const downAdds = addDoc.mock.calls.filter(([t]) => t === 'pointerdown').length

    // Re-rendering with fresh inline callbacks and inline rect objects must not re-bind listeners.
    await act(async () => root!.render(<Host tick={2} />))
    await act(async () => root!.render(<Host tick={3} />))
    expect(addWin.mock.calls.filter(([t]) => t === 'resize').length).toBe(resizeAdds)
    expect(addDoc.mock.calls.filter(([t]) => t === 'pointerdown').length).toBe(downAdds)
  })

  it('prevents default and returns focus to trigger on closeOnTab', async () => {
    function Host() {
      const [open, setOpen] = useState(false)
      const btn = useRef<HTMLButtonElement>(null)
      return (
        <div>
          <button ref={btn} type="button" onClick={() => setOpen(true)}>
            Trigger
          </button>
          <PopoverSurface
            open={open}
            onClose={() => setOpen(false)}
            anchorRef={btn}
            anchorRect={rect(100, 100, 80, 32)}
            closeOnTab
            role="menu"
          >
            <button type="button" role="menuitem">
              Item 1
            </button>
          </PopoverSurface>
        </div>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host />))

    const btn = container.querySelector('button')!
    btn.focus()
    await act(async () => btn.click())

    const item = document.body.querySelector('[role="menuitem"]') as HTMLButtonElement
    item.focus()
    const tabEv = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => {
      item.dispatchEvent(tabEv)
    })
    expect(tabEv.defaultPrevented).toBe(true)
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('prefers header[data-app-header] over dock/panel headers in safeViewportBounds', () => {
    const dockHdr = document.body.appendChild(document.createElement('header'))
    dockHdr.style.position = 'sticky'
    dockHdr.getBoundingClientRect = () => rect(0, 0, 300, 200)

    const appHdr = document.body.appendChild(document.createElement('header'))
    appHdr.setAttribute('data-app-header', '')
    appHdr.style.position = 'sticky'
    appHdr.getBoundingClientRect = () => rect(0, 0, 1280, 56)

    const bounds = safeViewportBounds(8, false)
    expect(bounds.top).toBe(64)
  })

  it('ignores scroll events on unrelated sibling elements while closing when an anchor ancestor actually scrolls', async () => {
    const onClose = vi.fn()
    function Host() {
      const ancestor = useRef<HTMLDivElement>(null)
      const btn = useRef<HTMLButtonElement>(null)
      const sibling = useRef<HTMLTextAreaElement>(null)
      return (
        <div>
          <textarea ref={sibling} defaultValue="scrollable sibling" />
          <div ref={ancestor} data-anchor-ancestor>
            <button ref={btn} type="button">
              Anchor
            </button>
          </div>
          <PopoverSurface
            open
            onClose={onClose}
            anchorRef={btn}
            anchorRect={rect(100, 100, 80, 32)}
            role="group"
            aria-label="Tokens"
          >
            <button type="button">First</button>
          </PopoverSurface>
        </div>
      )
    }

    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => root!.render(<Host />))

    const sibling = container.querySelector('textarea')!
    const ancestor = container.querySelector<HTMLElement>('[data-anchor-ancestor]')!

    // Scrolling an unrelated sibling element must NOT close the popover.
    await act(async () => {
      sibling.scrollTop = 40
      sibling.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).not.toHaveBeenCalled()

    // Scrolling an actual ancestor whose scrollTop changed MUST close the popover.
    await act(async () => {
      ancestor.scrollTop = 24
      ancestor.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).toHaveBeenCalledWith('scroll')
  })
})
