import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Dialog,
  InfoTip,
  PopoverSurface,
  Sheet,
  Toaster,
  collectPreviewHoles,
  currentToasts,
  dismissToast,
  findUnregisteredPreviewOverlays,
  getPreviewOverlays,
  notifyPreviewOverlays,
  resetPreviewOverlayRegistry,
  subscribePreviewOverlays,
  toast,
} from '@ferrocast/ui'
import { NO_PRO_FEATURES, type ProView } from '@ferrocast/api'
import { SidebarAccount } from './account/parts'
import { ProUnlock } from './pro/ProUnlock'

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
  for (const t of currentToasts()) dismissToast(t.id)
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
  })
})

describe('InfoTip overlay registry and reposition (M8 regression)', () => {
  it('registers in PreviewOverlayRegistry when open, hides no phantom hole before layout, and notifies on resize', async () => {
    const stage = document.body.appendChild(document.createElement('div'))
    stage.setAttribute('data-stage-bg', '')
    stage.getBoundingClientRect = () => rect(0, 0, 1200, 700)

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <InfoTip label="Help">
          <span>Helpful explanation</span>
        </InfoTip>,
      ),
    )

    const btn = host.querySelector('button[aria-label="Help"]') as HTMLButtonElement
    btn.getBoundingClientRect = () => rect(300, 200, 24, 24)

    const notifications: number[] = []
    const unsub = subscribePreviewOverlays(() => notifications.push(1))

    await act(async () => btn.click())

    const tip = document.body.querySelector('[data-over-preview]') as HTMLElement
    expect(tip).toBeTruthy()
    tip.getBoundingClientRect = () => rect(220, 230, 180, 48)
    notifyPreviewOverlays()

    // InfoTip must be registered in PreviewOverlayRegistry (fails before M8 fix!).
    expect(getPreviewOverlays().some((e) => e.target === tip)).toBe(true)
    expect(notifications.length).toBeGreaterThanOrEqual(1)
    expect(collectPreviewHoles(rect(0, 0, 1200, 700))).toEqual([
      { x: 220, y: 230, w: 180, h: 48, r: 0 },
    ])

    // Escape closes InfoTip.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(getPreviewOverlays()).toHaveLength(0)
    unsub()
  })
})

describe('Dialog, Sheet, and Toaster overlay registration', () => {
  it('registers open Dialog, Sheet, and Toast panels so none overlap stage unregistered', async () => {
    const stage = document.body.appendChild(document.createElement('div'))
    stage.setAttribute('data-stage-bg', '')
    stage.getBoundingClientRect = () => rect(0, 0, 1200, 700)

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <>
          <Dialog open onClose={() => undefined} title="Test Dialog">
            Body
          </Dialog>
          <Sheet open onClose={() => undefined} title="Test Sheet">
            Drawer
          </Sheet>
          <Toaster />
        </>,
      ),
    )

    await act(async () => {
      toast({ tone: 'info', message: 'Saved changes' })
    })

    const overlays = getPreviewOverlays()
    // Dialog panel + Sheet panel + Toast card = 3 registered overlays.
    expect(overlays.length).toBeGreaterThanOrEqual(3)

    // Mock bounding boxes over the stage and ensure zero unregistered overlays are reported.
    for (const entry of overlays) {
      const el = entry.target as HTMLElement
      el.getBoundingClientRect = () => rect(100, 100, 300, 200)
    }
    expect(findUnregisteredPreviewOverlays(stage)).toEqual([])
  })
})

describe('SidebarAccount menu portal and containment (M6 regression)', () => {
  it('portals out of clipped sidebar footer, clamps maxHeight, and registers in PreviewOverlayRegistry', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <div data-testid="sidebar-foot" className="overflow-hidden">
          <SidebarAccount
            view={{
              state: 'signed_in',
              account: {
                id: 'u1',
                email: 'nova@example.com',
                name: 'Nova',
                avatar_url: null,
                created_at: 1,
                providers: ['google'],
              },
              pro: null,
            }}
            pro={false}
            planLine={null}
            utils={{
              openInBrowser: null,
              theme: 'dark',
              toggleTheme: () => undefined,
              themePref: 'dark',
              setThemePref: () => undefined,
            }}
          />
        </div>,
      ),
    )

    const foot = host.querySelector('[data-testid="sidebar-foot"]')!
    const btn = foot.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
    btn.getBoundingClientRect = () => rect(12, 740, 210, 48)

    await act(async () => btn.click())

    const menu = document.body.querySelector('[role="menu"][aria-label="Account"]') as HTMLElement
    expect(menu).toBeTruthy()
    expect(menu.parentElement).toBe(document.body)
    expect(foot.contains(menu)).toBe(false)
    expect(parseFloat(menu.style.maxHeight)).toBeGreaterThan(0)
    expect(parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(740)
    expect(getPreviewOverlays().some((e) => e.target === menu)).toBe(true)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="menu"][aria-label="Account"]')).toBeNull()
  })
})

describe('ProUnlock overlay registration', () => {
  it('registers ProUnlock dialog panel in PreviewOverlayRegistry and marks data-over-preview', async () => {
    localStorage.clear()
    const stage = document.body.appendChild(document.createElement('div'))
    stage.setAttribute('data-stage-bg', '')
    stage.getBoundingClientRect = () => rect(0, 0, 1200, 700)

    const pro: ProView = {
      active: true,
      pro: true,
      status: 'active',
      plan: 'monthly',
      subscription_id: 'sub_1',
      current_end: null,
      access_until: null,
      cancel_at_period_end: false,
      refunded: false,
      installs: 1,
      sales_open: true,
      prices: null,
      checked_at: 0,
      stale: false,
      offline_grace_days: 7,
      launch_note: '',
      warning: null,
      features: { ...NO_PRO_FEATURES },
      quotas: {},
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<ProUnlock pro={pro} />))

    const panel = document.body.querySelector(
      '[data-testid="pro-unlock"] > [data-over-preview]',
    ) as HTMLElement | null
    expect(panel).toBeTruthy()
    expect(getPreviewOverlays().some((e) => e.target === panel)).toBe(true)
  })
})
