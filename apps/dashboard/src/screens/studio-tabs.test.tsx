// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { markRunningShow } from './Studio'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tabs: { value: string; label: ReactNode; title?: string }[] = [
  { value: 'golive', label: 'Go live' },
  { value: 'show', label: 'Show' },
]

describe('the Show tab while a show runs', () => {
  it('is left alone when none runs', () => {
    expect(markRunningShow(tabs, false)).toBe(tabs)
  })

  it('gets a dot, a title, and says (running) to a screen reader', async () => {
    const out = markRunningShow(tabs, true)
    expect(out[0]).toBe(tabs[0])
    expect(out[1]!.title).toBe('A show is running')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(<>{out[1]!.label}</>))
    expect(host.querySelector('[data-show-running]')).not.toBeNull()
    expect(host.querySelector('.sr-only')?.textContent).toBe('(running)')
    expect(host.textContent).toContain('Show')
    await act(async () => root.unmount())
    host.remove()
  })
})
