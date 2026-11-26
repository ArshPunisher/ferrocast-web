import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { OverlayState, Widget } from '@ferrocast/api'
import { Toaster } from '@ferrocast/ui'
import { useHistory, useUndoKeys } from '../../lib/history'
import { useLive } from '../../lib/store'
import { LayoutEditor, containSize } from './LayoutEditor'

let root: Root | null = null

const EMPTY_STATE: OverlayState = {
  goals: [],
  labels: {},
  viewers: { twitch: 0, youtube: 0, kick: 0 },
  events: [],
  chat: [],
  poll: null,
  giveaway: null,
}

describe('LayoutEditor full-canvas Emote wall pointer transparency (Problem 5)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  it('does not block pointer events over underlying widgets when full-canvas Emote wall is on top', async () => {
    const labelWidget: Widget = {
      id: 'w-label',
      kind: 'label',
      x: 200,
      y: 200,
      w: 360,
      h: 80,
      config: {
        source: 'latest_follower',
        template: 'Latest: {value}',
        theme: 'molten',
      },
    }
    const emoteWall: Widget = {
      id: 'w-emote',
      kind: 'emote_wall',
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      config: {
        theme: 'molten',
        platforms: [],
        max_emotes: 40,
        size: 56,
        lifetime_s: 6,
        physics: 'bounce',
      },
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: [labelWidget, emoteWall] }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={false}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    const emoteBox = host.querySelector<HTMLElement>(
      '[role="button"][aria-label^="Emote wall widget"]',
    )!
    const labelBox = host.querySelector<HTMLElement>('[role="button"][aria-label^="Label widget"]')!
    expect(emoteBox).toBeTruthy()
    expect(labelBox).toBeTruthy()
    expect(emoteBox.className).toContain('pointer-events-none')

    await act(async () => {
      labelBox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    expect(labelBox.getAttribute('aria-pressed')).toBe('true')
    expect(emoteBox.getAttribute('aria-pressed')).toBe('false')
  })

  it('positions the widget tag above the widget when vertical clearance exists so live text stays uncovered', async () => {
    const labelWidget: Widget = {
      id: 'w-label',
      kind: 'label',
      x: 200,
      y: 400,
      w: 420,
      h: 64,
      config: {
        source: 'latest_follower',
        template: 'Latest: {value}',
        theme: 'molten',
      },
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: [labelWidget] }}
          onWidgets={vi.fn()}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={true}
          media={[]}
          onUploaded={vi.fn()}
        />,
      ),
    )

    const labelBox = host.querySelector<HTMLElement>('[role="button"][aria-label^="Label widget"]')!
    await act(async () => {
      labelBox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const tag = host.querySelector<HTMLElement>('[data-widget-tag="w-label"]')
    expect(tag).not.toBeNull()
    expect(tag!.className).toContain('bottom-[calc(100%+4px)]')
    expect(tag!.className).not.toContain('top-1')
  })
})

describe('LayoutEditor steady containSize & single inspector scroller (Group A)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  it('containSize scales 16:9 wide/tall boxes, 9:16 portrait overlays, and guards zero boxes', () => {
    expect(containSize(0, 500, 1920, 1080)).toBeNull()
    expect(containSize(800, 0, 1920, 1080)).toBeNull()
    expect(containSize(-10, 400, 1920, 1080)).toBeNull()

    // Wide box (1200x400) constrains 16:9 by height -> 711x400
    const wide = containSize(1200, 400, 1920, 1080)!
    expect(wide.height).toBe(400)
    expect(wide.width).toBe(Math.floor((1920 * 400) / 1080))
    expect(wide.scale).toBeCloseTo(400 / 1080, 5)

    // Tall narrow box (640x700) constrains 16:9 by width -> 640x360
    const tall = containSize(640, 700, 1920, 1080)!
    expect(tall.width).toBe(640)
    expect(tall.height).toBe(360)
    expect(tall.scale).toBeCloseTo(640 / 1920, 5)

    // Portrait 9:16 overlay (1080x1920) inside 800x600 box constrains by height -> 337x600
    const portrait = containSize(800, 600, 1080, 1920)!
    expect(portrait.height).toBe(600)
    expect(portrait.width).toBe(Math.floor((1080 * 600) / 1920))
    expect(portrait.scale).toBeCloseTo(600 / 1920, 5)
  })

  it('renders fitViewport inspector with single scroller, guarded sticky mini-header, scroll-margin, and reduced-motion Layers jump', async () => {
    const textLayer: Widget = {
      id: 'l-text',
      kind: 'layer',
      x: 100,
      y: 100,
      w: 500,
      h: 100,
      config: { type: 'text', text: 'Hello' },
    }
    const queries: string[] = []
    const origMatchMedia = window.matchMedia
    window.matchMedia = vi.fn((query: string) => {
      queries.push(query)
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList
    })

    const origScrollIntoView = Element.prototype.scrollIntoView
    const scrollCalls: ScrollIntoViewOptions[] = []
    Element.prototype.scrollIntoView = vi.fn(function (
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      if (arg && typeof arg === 'object') scrollCalls.push(arg)
    })

    try {
      useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
      const host = document.body.appendChild(document.createElement('div'))
      root = createRoot(host)
      await act(async () =>
        root!.render(
          <LayoutEditor
            fitViewport
            layout={{ name: 'Main', width: 1920, height: 1080, widgets: [textLayer] }}
            onWidgets={vi.fn()}
            state={EMPTY_STATE}
            themes={[]}
            goals={[]}
            onGoalCreated={vi.fn()}
            preview={false}
            media={[]}
            onUploaded={vi.fn()}
          />,
        ),
      )

      expect(queries).toContain('(min-width: 1024px) and (min-height: 640px)')

      const layerBtn = host.querySelector<HTMLElement>(
        '[role="button"][aria-label^="Text: Hello"]',
      )!
      await act(async () => {
        layerBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      })

      const inspector = host.querySelector('aside.fc-overlay-inspector[aria-label="Inspector"]')!
      expect(inspector).toBeTruthy()
      const nestedScrollers = inspector.querySelectorAll(
        '[class*="overflow-y-auto"], [class*="max-h-72"]',
      )
      expect(nestedScrollers).toHaveLength(0)

      const miniHead = inspector.querySelector('.fc-overlay-inspector-head')
      expect(miniHead).toBeTruthy()
      expect(miniHead!.className).not.toContain('lg:sticky')

      const layersSection = inspector.querySelector(
        'section.fc-overlay-layers[aria-label="Layers"]',
      )
      expect(layersSection).toBeTruthy()
      const layersHeading = layersSection!.querySelector('h2')!

      const jumpBtn = [...inspector.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Layers (1)'),
      )!
      await act(async () => {
        jumpBtn.click()
      })
      expect(scrollCalls.at(-1)).toEqual({ behavior: 'smooth', block: 'start' })
      expect(document.activeElement).toBe(layersHeading)

      // App reduceMotion preference overrides smooth scrolling.
      document.documentElement.dataset.reduceMotion = 'true'
      await act(async () => {
        jumpBtn.click()
      })
      expect(scrollCalls.at(-1)).toEqual({ behavior: 'auto', block: 'start' })
    } finally {
      delete document.documentElement.dataset.reduceMotion
      Element.prototype.scrollIntoView = origScrollIntoView
      window.matchMedia = origMatchMedia
    }
  })
})

describe('LayoutEditor Backspace/Delete layer removal (Group B)', () => {
  const goalWidget: Widget = {
    id: 'w-goal',
    kind: 'goal',
    x: 100,
    y: 100,
    w: 440,
    h: 112,
    config: { goal_id: 'g1', theme: 'molten' },
  }
  const textLayer: Widget = {
    id: 'l-text',
    kind: 'layer',
    x: 200,
    y: 300,
    w: 600,
    h: 120,
    config: { type: 'text', text: 'Hello stream' },
  }
  const lockedLayer: Widget = {
    id: 'l-locked',
    kind: 'layer',
    x: 300,
    y: 450,
    w: 300,
    h: 80,
    locked: true,
    config: { type: 'shape', shape: 'rect', fill: '#16191e' },
  }
  const brandLayer: Widget = {
    id: 'l-brand',
    kind: 'layer',
    x: 20,
    y: 20,
    w: 64,
    h: 64,
    config: { type: 'brand', variant: 'mark' },
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  async function renderEditor(
    widgets: Widget[],
    opts: { readOnly?: boolean; brandLocked?: boolean } = {},
  ) {
    const onWidgets = vi.fn()
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <>
          <LayoutEditor
            layout={{ name: 'Main', width: 1920, height: 1080, widgets }}
            onWidgets={onWidgets}
            state={EMPTY_STATE}
            themes={[]}
            goals={[]}
            onGoalCreated={vi.fn()}
            preview={false}
            media={[]}
            onUploaded={vi.fn()}
            readOnly={opts.readOnly ?? false}
            brandLocked={opts.brandLocked ?? false}
          />
          <Toaster />
        </>,
      ),
    )
    return { host, onWidgets }
  }

  async function selectWidget(host: HTMLElement, ariaPrefix: string) {
    const el = host.querySelector<HTMLElement>(`[role="button"][aria-label^="${ariaPrefix}"]`)!
    expect(el).toBeTruthy()
    await act(async () => {
      el.focus()
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    return el
  }

  function pressKey(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(ev)
    return ev
  }

  it('Backspace with a canvas layer or widget selected removes it without merge and prevents default', async () => {
    const { host, onWidgets } = await renderEditor([goalWidget, textLayer])
    const goalBtn = await selectWidget(host, 'Goal widget')

    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(goalBtn, 'Backspace')
    })

    expect(ev.defaultPrevented).toBe(true)
    expect(onWidgets).toHaveBeenCalledTimes(1)
    expect(onWidgets.mock.calls[0]?.[0]).toEqual([textLayer])
    expect(onWidgets.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('Delete with a canvas layer selected removes that layer', async () => {
    const { host, onWidgets } = await renderEditor([goalWidget, textLayer])
    const textBtn = await selectWidget(host, 'Text: Hello stream')

    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(textBtn, 'Delete')
    })

    expect(ev.defaultPrevented).toBe(true)
    expect(onWidgets).toHaveBeenCalledWith([goalWidget])
  })

  it('Backspace in the Text field of a selected text layer does not remove the layer or preventDefault', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    await selectWidget(host, 'Text: Hello stream')

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    expect(textarea).toBeTruthy()
    let ev!: KeyboardEvent
    await act(async () => {
      textarea.focus()
      ev = pressKey(textarea, 'Backspace')
    })

    expect(ev.defaultPrevented).toBe(false)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace in a number input or range/select control does not remove the layer', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    await selectWidget(host, 'Text: Hello stream')

    const numInput = host.querySelector<HTMLInputElement>('input[type="number"]')!
    expect(numInput).toBeTruthy()
    let numEv!: KeyboardEvent
    await act(async () => {
      numInput.focus()
      numEv = pressKey(numInput, 'Backspace')
    })
    expect(numEv.defaultPrevented).toBe(false)
    expect(onWidgets).not.toHaveBeenCalled()

    const rangeInput = host.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(rangeInput).toBeTruthy()
    let rangeEv!: KeyboardEvent
    await act(async () => {
      rangeInput.focus()
      rangeEv = pressKey(rangeInput, 'Backspace')
    })
    expect(rangeEv.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()

    const selectEl = host.querySelector<HTMLSelectElement>('select')!
    expect(selectEl).toBeTruthy()
    let selectEv!: KeyboardEvent
    await act(async () => {
      selectEl.focus()
      selectEv = pressKey(selectEl, 'Backspace')
    })
    expect(selectEv.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace on an inspector Switch, slider, or listbox does not remove the layer and calls preventDefault', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    await selectWidget(host, 'Text: Hello stream')

    const switchBtn = host.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(switchBtn).toBeTruthy()
    let switchEv!: KeyboardEvent
    await act(async () => {
      switchBtn.focus()
      switchEv = pressKey(switchBtn, 'Backspace')
    })
    expect(switchEv.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()

    await act(async () => {
      pressKey(switchBtn, 'Delete')
    })
    expect(onWidgets).not.toHaveBeenCalled()

    for (const role of ['slider', 'listbox']) {
      const ctrl = document.createElement('div')
      ctrl.setAttribute('role', role)
      ctrl.tabIndex = 0
      host.appendChild(ctrl)
      let roleEv!: KeyboardEvent
      await act(async () => {
        ctrl.focus()
        roleEv = pressKey(ctrl, 'Backspace')
      })
      expect(roleEv.defaultPrevented).toBe(true)
      expect(onWidgets).not.toHaveBeenCalled()
    }
  })

  it('Backspace in a contenteditable element, ARIA textbox, or IME composition does not remove the layer', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    const btn = await selectWidget(host, 'Text: Hello stream')

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    host.appendChild(editable)
    let ceEv!: KeyboardEvent
    await act(async () => {
      editable.focus()
      ceEv = pressKey(editable, 'Backspace')
    })
    expect(ceEv.defaultPrevented).toBe(false)
    expect(onWidgets).not.toHaveBeenCalled()

    const ariaBox = document.createElement('div')
    ariaBox.setAttribute('role', 'textbox')
    ariaBox.tabIndex = 0
    host.appendChild(ariaBox)
    let roleEv!: KeyboardEvent
    await act(async () => {
      ariaBox.focus()
      roleEv = pressKey(ariaBox, 'Backspace')
    })
    expect(roleEv.defaultPrevented).toBe(false)
    expect(onWidgets).not.toHaveBeenCalled()

    await act(async () => {
      btn.focus()
      pressKey(btn, 'Backspace', { isComposing: true })
    })
    expect(onWidgets).not.toHaveBeenCalled()

    const imeEv = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(imeEv, 'keyCode', { value: 229 })
    await act(async () => {
      btn.dispatchEvent(imeEv)
    })
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace with modifier keys (Cmd/Ctrl/Alt) does not remove the layer', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    const btn = await selectWidget(host, 'Text: Hello stream')

    await act(async () => {
      pressKey(btn, 'Backspace', { metaKey: true })
      pressKey(btn, 'Backspace', { ctrlKey: true })
      pressKey(btn, 'Backspace', { altKey: true })
    })
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace while an open modal dialog, alertdialog, or dropdown Menu exists does not remove the layer', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    const btn = await selectWidget(host, 'Text: Hello stream')

    const dlg = document.createElement('div')
    dlg.setAttribute('role', 'dialog')
    host.appendChild(dlg)
    await act(async () => {
      pressKey(btn, 'Backspace')
    })
    expect(onWidgets).not.toHaveBeenCalled()
    dlg.remove()

    const nativeDlg = document.createElement('dialog')
    nativeDlg.setAttribute('open', '')
    host.appendChild(nativeDlg)
    await act(async () => {
      pressKey(btn, 'Backspace')
    })
    expect(onWidgets).not.toHaveBeenCalled()
    nativeDlg.remove()

    const alertDlg = document.createElement('div')
    alertDlg.setAttribute('role', 'alertdialog')
    host.appendChild(alertDlg)
    await act(async () => {
      pressKey(btn, 'Backspace')
    })
    expect(onWidgets).not.toHaveBeenCalled()
    alertDlg.remove()

    // Real dropdown menu ("More to add") opens [role="menu"].
    const moreBtn = host.querySelector<HTMLButtonElement>('button[aria-label="More to add"]')!
    await act(async () => {
      moreBtn.click()
    })
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy()
    await act(async () => {
      pressKey(document.body.querySelector('[role="menu"]')!, 'Backspace')
    })
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace with a locked layer selected does not remove it and calls preventDefault', async () => {
    const { host, onWidgets } = await renderEditor([lockedLayer])
    const btn = await selectWidget(host, 'Box layer')

    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(btn, 'Backspace')
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace with a brand-locked built-in mark selected does not remove it', async () => {
    const { host, onWidgets } = await renderEditor([brandLayer], { brandLocked: true })
    const btn = await selectWidget(host, 'Ferrocast mark layer')

    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(btn, 'Backspace')
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Backspace with nothing selected calls preventDefault and leaves widgets unchanged', async () => {
    const { host, onWidgets } = await renderEditor([textLayer])
    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(host, 'Backspace')
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('ignores Backspace/Delete in readOnly mode', async () => {
    const { host, onWidgets } = await renderEditor([textLayer], { readOnly: true })
    const btn = await selectWidget(host, 'Text: Hello stream')
    let ev!: KeyboardEvent
    await act(async () => {
      ev = pressKey(btn, 'Backspace')
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(onWidgets).not.toHaveBeenCalled()
  })

  it('Cmd/Ctrl+Z after Backspace deletion restores the removed layer at its original z-order', async () => {
    const initial: Widget[] = [goalWidget, textLayer, lockedLayer]
    function HistoryHarness() {
      const h = useHistory<Widget[]>(initial)
      useUndoKeys(h)
      return (
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: h.value }}
          onWidgets={(next, opts) => {
            h.set(next, opts)
          }}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={false}
          media={[]}
          onUploaded={vi.fn()}
        />
      )
    }
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<HistoryHarness />))

    const textBtn = await selectWidget(host, 'Text: Hello stream')
    await act(async () => {
      pressKey(textBtn, 'Backspace')
    })
    expect(host.querySelector('[role="button"][aria-label^="Text: Hello stream"]')).toBeNull()

    await act(async () => {
      pressKey(window, 'z', { ctrlKey: true })
    })
    const buttons = [...host.querySelectorAll('[role="button"][aria-label*=" at "]')].map((n) =>
      n.getAttribute('aria-label'),
    )
    expect(buttons).toHaveLength(3)
    expect(buttons[1]).toContain('Text: Hello stream')
  })

  it('clicking another same-kind layer in Layers moves focus from textarea so Backspace deletes it, and adding blurs textarea', async () => {
    const textTwo: Widget = {
      id: 'l-text-2',
      kind: 'layer',
      x: 200,
      y: 460,
      w: 600,
      h: 120,
      config: { type: 'text', text: 'Second text' },
    }
    const { host, onWidgets } = await renderEditor([textLayer, textTwo])
    await selectWidget(host, 'Text: Hello stream')

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => {
      textarea.focus()
    })
    expect(document.activeElement).toBe(textarea)

    // Clicking the second text layer in Layers (even in webviews that don't focus buttons on click)
    // moves focus onto that row button so Backspace deletes Second text instead of editing textarea.
    const layersSection = host.querySelector('section[aria-label="Layers"]')!
    const rowBtn = [...layersSection.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Text: Second text'),
    )!
    await act(async () => {
      rowBtn.click()
    })
    expect(document.activeElement).toBe(rowBtn)

    await act(async () => {
      pressKey(rowBtn, 'Backspace')
    })
    expect(onWidgets).toHaveBeenCalledWith([textLayer])

    // Re-focus textarea and click toolbar Text button: textarea blurs so Backspace won't edit text.
    await act(async () => {
      textarea.focus()
    })
    const toolbar = host.querySelector('[role="toolbar"][aria-label="Canvas"]')!
    const addTextBtn = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Text',
    )!
    await act(async () => {
      addTextBtn.click()
    })
    expect(document.activeElement).not.toBe(textarea)
  })

  it('Trash removal and keyboard delete restore focus to canvas, announce politely, use latest onWidgets, and clean up listener on unmount', async () => {
    const latestWidgets = vi.fn()
    const firstWidgets = vi.fn()
    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    const renderWith = (cb: (w: Widget[]) => void, widgets: Widget[]) =>
      act(async () =>
        root!.render(
          <>
            <LayoutEditor
              layout={{ name: 'Main', width: 1920, height: 1080, widgets }}
              onWidgets={cb}
              state={EMPTY_STATE}
              themes={[]}
              goals={[]}
              onGoalCreated={vi.fn()}
              preview={false}
              media={[]}
              onUploaded={vi.fn()}
            />
            <Toaster />
          </>,
        ),
      )

    await renderWith(firstWidgets, [goalWidget, textLayer])
    await renderWith(latestWidgets, [goalWidget, textLayer])

    // Keyboard shortcuts trigger is a focusable InfoTip button.
    expect(host.querySelector('button[aria-label="Keyboard shortcuts"]')).toBeTruthy()

    // Select text layer and remove via Trash button: canvas gets focus + polite live announcement.
    await selectWidget(host, 'Text: Hello stream')
    const trashBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Remove layer"]')!
    await act(async () => {
      trashBtn.click()
    })
    expect(latestWidgets).toHaveBeenCalledWith([goalWidget])
    expect(firstWidgets).not.toHaveBeenCalled()
    const canvasEl = host.querySelector('[role="group"][aria-label="Main layout, 1920 by 1080"]')
    expect(document.activeElement).toBe(canvasEl)
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Removed Text: Hello stream. Press Cmd or Ctrl + Z to undo.',
    )

    // Keyboard delete after onWidgets swap calls latestWidgets, not stale firstWidgets.
    const goalBtn = await selectWidget(host, 'Goal widget')
    await act(async () => {
      pressKey(goalBtn, 'Delete')
    })
    expect(latestWidgets).toHaveBeenCalledTimes(2)
    expect(firstWidgets).not.toHaveBeenCalled()

    // Unmount cleans up the window keydown listener so Backspace is no longer intercepted.
    await act(async () => root?.unmount())
    root = null
    let afterEv!: KeyboardEvent
    await act(async () => {
      afterEv = pressKey(document.body, 'Backspace')
    })
    expect(afterEv.defaultPrevented).toBe(false)
  })
})

describe('LayoutEditor same-millisecond layer ID uniqueness (Extra bug #5)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  it('assigns distinct IDs when adding and duplicating layers within the same millisecond', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'))

    const hUpdates: Widget[][] = []
    function ControlledHarness() {
      const h = useHistory<Widget[]>([])
      return (
        <LayoutEditor
          layout={{ name: 'Main', width: 1920, height: 1080, widgets: h.value }}
          onWidgets={(next, opts) => {
            hUpdates.push(next)
            h.set(next, opts)
          }}
          state={EMPTY_STATE}
          themes={[]}
          goals={[]}
          onGoalCreated={vi.fn()}
          preview={false}
          media={[]}
          onUploaded={vi.fn()}
        />
      )
    }

    useLive.setState({ conn: { client: { request: vi.fn(async () => undefined) } } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<ControlledHarness />))

    const toolbar = host.querySelector('[role="toolbar"][aria-label="Canvas"]')!
    const textBtn = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Text',
    )!
    await act(async () => {
      textBtn.click()
    })
    await act(async () => {
      textBtn.click()
    })

    const dupBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Duplicate"]')!
    await act(async () => {
      dupBtn.click()
    })
    await act(async () => {
      dupBtn.click()
    })

    const latest = hUpdates.at(-1) ?? []
    expect(latest).toHaveLength(4)
    expect(new Set(latest.map((w) => w.id)).size).toBe(4)

    // Deleting one added/duplicated layer leaves the other 3 intact.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Remove layer"]')!.click()
    })
    expect(hUpdates.at(-1)).toHaveLength(3)
  })
})
