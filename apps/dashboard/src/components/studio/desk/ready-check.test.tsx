import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Preflight } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { ReadyCheck, ReadyCheckRecallChip, ReadyPlacementContext } from './ready-check'
import { beginReadyCheckSession, resetReadyCheckState } from './ready-check-state'

let root: Root | null = null

function setupApi({
  preflight = { checks: [], ready: true },
  onFix,
}: {
  preflight?: Preflight
  onFix?: (action: string) => Preflight
} = {}) {
  const request = vi.fn(async (_m: string, path: string, body?: unknown) => {
    if (path.endsWith('/show/config')) return { mic_sources: [] }
    if (path.endsWith('/studio/engine/stats')) return { captures: [] }
    if (path.endsWith('/show/preflight')) return preflight
    if (path.endsWith('/show/preflight/fix')) {
      const action = (body as { action?: string } | undefined)?.action ?? ''
      return onFix ? onFix(action) : { checks: [], ready: true }
    }
    return {}
  })
  useLive.setState({ conn: { client: { request } } as never })
  return request
}

describe('ReadyCheck Option 1 pill and upward card', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
    resetReadyCheckState()
    vi.useRealTimers()
  })

  it('shows checking pill, then "All good" and auto-hides after 5s', async () => {
    setupApi({ preflight: { checks: [], ready: true } })
    const onClose = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="right">
          <ReadyCheck recovered={null} onClose={onClose} />
        </ReadyPlacementContext.Provider>,
      ),
    )

    const section = host.querySelector('section[aria-label="Ready check"]')
    expect(section).toBeTruthy()
    expect(section!.className).toContain('absolute right-2 bottom-2')

    const pill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(pill).toBeTruthy()
    expect(pill.className).toContain('h-9')
    expect(pill.textContent).toContain('Ready check')
    expect(pill.textContent).toContain('Checking…')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    expect(pill.textContent).toContain('All good')
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows "N to fix (M blocking)", expands upward, fixes issues, collapses with Escape and dismisses/restores focus', async () => {
    const initial: Preflight = {
      ready: false,
      checks: [
        {
          id: 'mic:Mic',
          label: 'Mic',
          status: 'fail',
          detail: 'Muted in Ferrocast.',
          fix: { label: 'Unmute', href: 'action:unmute:Mic' },
        },
        {
          id: 'cam:Webcam',
          label: 'Webcam',
          status: 'warn',
          detail: 'Hidden in "Gameplay".',
          fix: { label: 'Show it', href: 'action:show:Gameplay/Webcam' },
        },
      ],
    }
    const afterMicFix: Preflight = {
      ready: true,
      checks: [initial.checks[1]!],
    }
    const request = setupApi({
      preflight: initial,
      onFix: (action) => (action.includes('unmute') ? afterMicFix : { checks: [], ready: true }),
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="right">
          <ReadyCheck recovered={null} onClose={vi.fn()} />
          <ReadyCheckRecallChip variant="status-bar" />
        </ReadyPlacementContext.Provider>,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    const pill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(pill.textContent).toContain('Ready check')
    expect(pill.textContent).toContain('2 to fix (1 blocking)')

    // Expand upward card on click.
    await act(async () => pill.click())
    expect(pill.getAttribute('aria-expanded')).toBe('true')
    const card = document.getElementById(pill.getAttribute('aria-controls')!)
    expect(card).toBeTruthy()
    expect(card!.querySelectorAll('li')).toHaveLength(2)

    // Escape closes card and returns focus to pill trigger.
    const fixBtn = card!.querySelector('button[data-rc-fix]') as HTMLButtonElement
    fixBtn.focus()
    expect(document.activeElement).toBe(fixBtn)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(pill)

    // Re-expand and collapse via chevron button -> returns focus to pill.
    await act(async () => pill.click())
    const collapseBtn = host.querySelector(
      'button[aria-label="Collapse ready check"]',
    ) as HTMLButtonElement
    await act(async () => collapseBtn.click())
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(pill)

    // Re-expand and click Fix on Mic -> updates count to 1 to fix.
    await act(async () => pill.click())
    const micFix = host.querySelector('button[aria-label^="Fix Mic:"]') as HTMLButtonElement
    await act(async () => micFix.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/show/preflight/fix', {
      action: 'action:unmute:Mic',
    })
    expect(pill.textContent).toContain('1 to fix')
    expect(pill.textContent).not.toContain('blocking')

    // Click X to dismiss -> hides Ready check and focuses recall chip in status bar.
    const dismissBtn = host.querySelector(
      'button[aria-label="Dismiss ready check"]',
    ) as HTMLButtonElement
    await act(async () => dismissBtn.click())
    expect(host.querySelector('section[aria-label="Ready check"]')).toBeNull()

    const recallBtn = host.querySelector(
      'button[aria-label^="Show ready check"]',
    ) as HTMLButtonElement
    expect(recallBtn).toBeTruthy()
    expect(recallBtn.textContent).toContain('Ready check (1)')
    expect(document.activeElement).toBe(recallBtn)

    // Click recall chip -> restores pill and moves focus back to pill.
    await act(async () => recallBtn.click())
    const restoredPill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(restoredPill).toBeTruthy()
    expect(restoredPill.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(restoredPill)
  })

  it('positions above the mobile bottom nav in mobile placement and expands recovered crashes', async () => {
    setupApi({ preflight: { checks: [], ready: true } })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="mobile">
          <ReadyCheck
            recovered={{
              record: false,
              replay: false,
              live: true,
              again: [],
              failed: [],
            }}
            onClose={vi.fn()}
          />
        </ReadyPlacementContext.Provider>,
      ),
    )

    const section = host.querySelector('section[aria-label="Ready check"]')
    expect(section).toBeTruthy()
    expect(section!.className).toContain('fixed')
    expect(section!.className).toContain('bottom-[calc(64px+env(safe-area-inset-bottom)+8px)]')

    const pill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(pill.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('Ferrocast closed unexpectedly last time.')
  })

  it('preserves found issues and expanded state across responsive remounts without re-scanning', async () => {
    const initial: Preflight = {
      ready: false,
      checks: [
        {
          id: 'mic:Mic',
          label: 'Mic',
          status: 'fail',
          detail: 'Muted in Ferrocast.',
          fix: { label: 'Unmute', href: 'action:unmute:Mic' },
        },
      ],
    }
    const request = setupApi({ preflight: initial })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    beginReadyCheckSession(false)
    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="right">
          <ReadyCheck recovered={null} onClose={vi.fn()} />
        </ReadyPlacementContext.Provider>,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    const desktopPill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(desktopPill.textContent).toContain('1 to fix (1 blocking)')
    await act(async () => desktopPill.click())
    expect(desktopPill.getAttribute('aria-expanded')).toBe('true')

    const callsBeforeResize = request.mock.calls.length

    // Simulate DockWorkspace unmounting the desktop ReadyCheck and mounting the mobile ReadyCheck.
    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="mobile">
          <div key="mobile-branch">
            <ReadyCheck recovered={null} onClose={vi.fn()} />
          </div>
        </ReadyPlacementContext.Provider>,
      ),
    )

    const mobilePill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(mobilePill.textContent).toContain('1 to fix (1 blocking)')
    expect(mobilePill.textContent).not.toContain('Checking…')
    expect(mobilePill.getAttribute('aria-expanded')).toBe('true')
    expect(request.mock.calls.length).toBe(callsBeforeResize)

    // Starting a new session resets prior results cleanly.
    await act(async () => {
      beginReadyCheckSession(false)
    })
    expect(mobilePill.textContent).toContain('Checking…')
    expect(mobilePill.getAttribute('aria-expanded')).toBe('false')
  })
})
