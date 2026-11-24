// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preflight } from '@ferrocast/api'
import { useLive } from '../../lib/store'
import { PreflightList } from './show'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useLive.setState({
    conn: {
      client: {
        request: vi.fn(async () => ({})),
      },
    } as never,
  })
})

afterEach(async () => {
  const prev = root
  root = null
  await act(async () => prev?.unmount())
  host?.remove()
  host = null
  useLive.setState({ conn: null })
})

describe('U3 PreflightList bordered tiles', () => {
  const pf: Preflight = {
    ready: true,
    checks: [
      { id: 'obs', label: 'Studio', status: 'ok', detail: 'Running.', fix: null },
      {
        id: 'discord',
        label: 'Discord',
        status: 'warn',
        detail: 'Set up a webhook to tell your server when you go live.',
        fix: { label: 'Discord settings', href: '#/settings/discord' },
      },
      {
        id: 'scene',
        label: 'Starting scene',
        status: 'fail',
        detail: 'No Starting Soon scene found.',
        fix: { label: 'Pick the scene again', href: '#/studio/show' },
      },
      { id: 'empty', label: 'Alerts', status: 'ok', detail: '', fix: null },
    ],
  }

  it('renders each check as a bordered tile with icon, status words, non-empty detail, real action buttons, and a calm summary', async () => {
    const onNavigate = vi.fn()
    await act(async () =>
      root!.render(<PreflightList pf={pf} onFixed={() => {}} onNavigate={onNavigate} />),
    )

    const tiles = Array.from(host!.querySelectorAll<HTMLElement>('[data-preflight-tile]'))
    expect(tiles).toHaveLength(4)
    for (const tile of tiles) {
      expect(tile.className).toContain('border')
      expect(tile.className).toContain('rounded-')
    }

    // Status shown by words + color/icon, not icon/color alone
    expect(host!.textContent).toContain('Problem')
    expect(host!.textContent).toContain('Warning')
    expect(host!.textContent).toContain('Ready')

    // Calm summary line
    const summary = host!.querySelector('[data-preflight-summary]')
    expect(summary?.textContent).toMatch(/2 items need attention, 2 passed/i)

    // Action fixes (including route navigation like Discord settings) are real buttons on the tile
    const buttons = Array.from(host!.querySelectorAll('button'))
    const discordBtn = buttons.find((b) => b.textContent?.trim() === 'Discord settings')
    expect(discordBtn).toBeTruthy()
    await act(async () => discordBtn!.click())
    expect(onNavigate).toHaveBeenCalled()

    // Empty detail produces no blank second-row paragraph
    const emptyTile = tiles.find((t) => t.textContent?.includes('Alerts'))!
    const detailPs = emptyTile.querySelectorAll('[data-tile-detail]')
    expect(detailPs).toHaveLength(0)
  })

  it('counts skipped checks separately from passed checks in summary text', async () => {
    await act(async () =>
      root!.render(
        <PreflightList
          pf={{
            ready: true,
            checks: [
              { id: 'obs', label: 'Studio', status: 'ok', detail: 'Running.', fix: null },
              { id: 'discord', label: 'Discord', status: 'skip', detail: 'Turned off.', fix: null },
            ],
          }}
          onFixed={() => {}}
        />,
      ),
    )
    const summary = host!.querySelector('[data-preflight-summary]')
    expect(summary?.textContent).toBe('1 passed, 1 skipped. Ready to start.')
  })
})
