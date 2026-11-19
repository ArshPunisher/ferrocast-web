import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, type MouseEvent as ReactMouseEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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

afterEach(async () => {
  vi.useRealTimers()
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
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
