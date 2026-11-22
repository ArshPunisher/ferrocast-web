import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLive } from '../../../lib/store'
import { ReadyCheck } from './ready-check'

let root: Root | null = null

describe('ReadyCheck placement (Problem 7)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
  })

  it('renders as an in-flow workspace banner rather than a fixed corner overlay', async () => {
    const request = vi.fn(async (_m: string, path: string) => {
      if (path.endsWith('/studio/engine/devices')) return []
      if (path.endsWith('/studio/engine/scenes')) return { current: 'Main', scenes: [] }
      if (path.endsWith('/show/preflight')) return { checks: [], ready: true }
      return {}
    })
    useLive.setState({ conn: { client: { request } } as never })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<ReadyCheck recovered={null} onClose={vi.fn()} />))

    const section = host.querySelector('section[aria-label="Ready check"]')
    expect(section).toBeTruthy()
    expect(section!.className).not.toMatch(/\bfixed\b/)
  })
})
