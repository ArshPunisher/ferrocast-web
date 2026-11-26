import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Dialog,
  PopoverSurface,
  getPreviewOverlays,
  resetPreviewOverlayRegistry,
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
})
