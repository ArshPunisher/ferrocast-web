// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreviewOverlays, resetPreviewOverlayRegistry } from '@ferrocast/ui'
import { TokenChipField } from './TokenChipField'

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

describe('TokenChipField popover portal and preview hole registration (F6)', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    resetPreviewOverlayRegistry()
    host = document.body.appendChild(document.createElement('div'))
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host.remove()
    document.body.innerHTML = ''
    resetPreviewOverlayRegistry()
    vi.restoreAllMocks()
  })

  it('portals token palette out of clipped forms, registers a preview hole, and restores focus on Escape', async () => {
    const onChange = vi.fn()
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <div data-testid="clipped-form" className="overflow-hidden">
          <TokenChipField
            label="Headline"
            value="Hello "
            maxLength={100}
            options={[{ key: 'name', label: 'Viewer name' }]}
            allowedSet={new Set(['name'])}
            onChange={onChange}
          />
        </div>,
      ),
    )

    const clipped = host.querySelector('[data-testid="clipped-form"]')!
    const btn = host.querySelector('button[aria-label="Tokens for Headline"]') as HTMLButtonElement
    btn.getBoundingClientRect = () => rect(400, 300, 72, 28)

    await act(async () => btn.click())

    const palette = document.body.querySelector(
      '[role="group"][aria-label="Insert token into Headline"]',
    ) as HTMLElement | null
    expect(palette).toBeTruthy()
    expect(clipped.contains(palette)).toBe(false)
    expect(palette!.parentElement).toBe(document.body)
    expect(palette!.hasAttribute('data-over-preview')).toBe(true)
    expect(getPreviewOverlays().some((e) => e.target === palette)).toBe(true)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(
      document.body.querySelector('[role="group"][aria-label="Insert token into Headline"]'),
    ).toBeNull()
    expect(document.activeElement).toBe(btn)
    expect(getPreviewOverlays()).toHaveLength(0)

    // Inserting a token updates value and closes cleanly.
    await act(async () => btn.click())
    const optBtn = document.body.querySelector('[data-insert-token="name"]') as HTMLButtonElement
    await act(async () => optBtn.click())
    expect(onChange).toHaveBeenCalledWith('Hello {name}')
    expect(
      document.body.querySelector('[role="group"][aria-label="Insert token into Headline"]'),
    ).toBeNull()
  })
})
