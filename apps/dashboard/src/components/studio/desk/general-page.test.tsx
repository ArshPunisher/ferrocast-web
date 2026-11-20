// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StudioSettings } from '@ferrocast/api'
import { GeneralPage } from './settings'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Settings › General', () => {
  let root: Root
  let host: HTMLDivElement
  let saved: Partial<StudioSettings>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    saved = {}
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    delete (window as { __FERROCAST__?: unknown }).__FERROCAST__
  })
  const mount = async (s: Partial<StudioSettings> = {}) => {
    function H() {
      const [v, setV] = useState(s as StudioSettings)
      return (
        <GeneralPage
          s={v}
          set={(p: Partial<StudioSettings>) => {
            saved = { ...saved, ...p }
            setV((x) => ({ ...x, ...p }))
          }}
        />
      )
    }
    await act(async () => root.render(<H />))
  }
  const sw = (label: string) =>
    [...host.querySelectorAll<HTMLElement>('[role=switch]')].find(
      (e) =>
        e.getAttribute('aria-label') === label ||
        e.closest('label,div')?.textContent?.includes(label),
    )

  it('has the Output group: ask first, and record or replay with the stream', async () => {
    await mount()
    const text = host.textContent ?? ''
    for (const t of [
      'Before going live',
      'Before ending the stream',
      'Before stopping a recording',
      'Record while live',
      'Keep recording after the stream ends',
      'Replay buffer while live',
      'Keep the buffer after the stream ends',
    ])
      expect(text, t).toContain(t)
    // Keeping what the stream started is only offered when the stream starts it.
    expect(
      sw('Keep recording after the stream ends')?.hasAttribute('disabled') ||
        sw('Keep recording after the stream ends')?.getAttribute('aria-disabled') === 'true',
    ).toBe(true)
  })

  it('shows the projector options in the app only, and saves each', async () => {
    await mount()
    expect(host.textContent).not.toContain('Projectors')
    act(() => root.unmount())
    root = createRoot(host)
    ;(window as { __FERROCAST__?: unknown }).__FERROCAST__ = { desktop: true, token: 't' }
    await mount()
    expect(host.textContent).toContain('Projectors')
    for (const [label, key] of [
      ['Keep new projector windows on top', 'projector_on_top'],
      ['One full-screen projector per display', 'projector_one_per_screen'],
      ['Open them again next time', 'projector_restore'],
      ['Hide the mouse pointer over projectors', 'projector_hide_cursor'],
    ] as const) {
      const el = sw(label)
      expect(el, label).toBeTruthy()
      await act(async () => el?.click())
      expect(saved[key], key).toBe(true)
    }
  })
})
