import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { LibraryBar, showShelfError } from './library'

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

describe('409 studio_busy on collection/profile switch while live', () => {
  it('showShelfError produces a calm one-line "Stop the stream to switch" toast with detail behind (i)', () => {
    const err = new ApiError(
      409,
      'studio_busy',
      'Stop streaming and recording before changing scene collections.',
      'Stop every active output first.',
    )
    showShelfError(err)
    const t = currentToasts().find((x) => x.key === 'studio:busy-switch')
    expect(t).toBeDefined()
    expect(t?.tone).toBe('warn')
    expect(t?.message).toBe('Stop the stream to switch')
    expect(t?.hint).toBeUndefined()
    expect(t?.detail).toContain('Stop streaming and recording')
    expect(t?.detail).toContain('Stop every active output first.')
  })

  it('switching a scene collection in LibraryBar when engine returns 409 studio_busy shows the one-line notice', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const switchShelf = vi.fn(async () => {
      throw new ApiError(
        409,
        'studio_busy',
        'Stop streaming and recording before changing scene collections.',
        'Stop every active output first.',
      )
    })
    const desk = {
      api: {
        shelf: async (kind: string) =>
          kind === 'collections'
            ? {
                current: 'main',
                list: [
                  { id: 'main', name: 'Main' },
                  { id: 'podcast', name: 'Podcast' },
                ],
              }
            : { current: 'default', list: [{ id: 'default', name: 'Default' }] },
        switchShelf,
      },
      refresh: vi.fn(),
      library: 0,
    } as unknown as Desk
    useLive.setState({ conn: { client: {} } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const btn = host.querySelector(
      'button[aria-label="scene collection: Main"]',
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    await act(async () => btn.click())

    const podcastItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Podcast'),
    ) as HTMLButtonElement | undefined
    expect(podcastItem).toBeDefined()
    await act(async () => podcastItem!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(switchShelf).toHaveBeenCalledWith('collections', 'podcast')
    const t = currentToasts().find((x) => x.message === 'Stop the stream to switch')
    expect(t).toBeDefined()
    expect(t?.detail).toContain('Stop streaming and recording')
  })
})
