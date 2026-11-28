import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Preflight } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { ReadyCheck, ReadyCheckRecallChip, ReadyPlacementContext } from './ready-check'
import {
  beginReadyCheckSession,
  getReadyCheckState,
  resetReadyCheckState,
  setReadyCheckFound,
} from './ready-check-state'

let root: Root | null = null

function setupApi({
  preflight = { checks: [], ready: true },
  onFix,
}: {
  preflight?: Preflight
  onFix?: (action: string) => Preflight | Promise<Preflight>
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

  it('can be dismissed from the collapsed pill, and stays away until a different problem turns up', async () => {
    const mic = {
      id: 'mic:Mic',
      label: 'Mic',
      status: 'fail' as const,
      detail: 'Muted.',
      fix: null,
    }
    const cam = {
      id: 'cam:Webcam',
      label: 'Webcam',
      status: 'warn' as const,
      detail: 'Hidden.',
      fix: null,
    }
    setupApi({ preflight: { ready: false, checks: [mic] } })
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
    // Collapsed, with a close button right on it.
    expect(host.querySelector('button[aria-expanded="false"]')).toBeTruthy()
    const x = host.querySelector('button[aria-label="Dismiss ready check"]') as HTMLButtonElement
    expect(x).toBeTruthy()
    await act(async () => x.click())
    expect(host.querySelector('section[aria-label="Ready check"]')).toBeNull()
    expect(host.querySelector('button[aria-label^="Show ready check"]')).toBeTruthy()

    const id = getReadyCheckState()!.sessionId
    // The same problem again, or one fewer: still dismissed.
    await act(async () => setReadyCheckFound(id, { ready: false, checks: [mic] }))
    expect(host.querySelector('section[aria-label="Ready check"]')).toBeNull()
    await act(async () => setReadyCheckFound(id, { ready: true, checks: [] }))
    expect(host.querySelector('section[aria-label="Ready check"]')).toBeNull()
    // A problem it had not shown: it comes back, collapsed.
    await act(async () => setReadyCheckFound(id, { ready: false, checks: [cam] }))
    const pill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(pill.textContent).toContain('1 to fix')
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

    // Expand upward card on click: pill hides so summary text appears once in card header.
    await act(async () => pill.click())
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    const card = host.querySelector('div[aria-labelledby]')
    expect(card).toBeTruthy()
    expect(card!.querySelectorAll('li')).toHaveLength(2)
    expect(host.textContent!.match(/2 to fix \(1 blocking\)/g)).toHaveLength(1)
    expect(host.textContent!.match(/Ready check/g)).toHaveLength(1)

    // Escape closes card and returns focus to the restored pill trigger.
    const fixBtn = card!.querySelector('button[data-rc-fix]') as HTMLButtonElement
    fixBtn.focus()
    expect(document.activeElement).toBe(fixBtn)

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    const afterEscapePill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(afterEscapePill).toBeTruthy()
    expect(afterEscapePill.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(afterEscapePill)

    // Re-expand and collapse via chevron button -> restores pill and returns focus to it.
    await act(async () => afterEscapePill.click())
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    const collapseBtn = host.querySelector(
      'button[aria-label="Collapse ready check"]',
    ) as HTMLButtonElement
    await act(async () => collapseBtn.click())
    const afterCollapsePill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(afterCollapsePill).toBeTruthy()
    expect(afterCollapsePill.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(afterCollapsePill)

    // Re-expand and click Fix on Mic -> updates card header badge to 1 to fix (appears once) and moves focus to Webcam Fix.
    await act(async () => afterCollapsePill.click())
    const micFix = host.querySelector('button[aria-label^="Fix Mic:"]') as HTMLButtonElement
    micFix.focus()
    await act(async () => micFix.click())
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/show/preflight/fix', {
      action: 'action:unmute:Mic',
    })
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    expect(host.textContent).toContain('1 to fix')
    expect(host.textContent).not.toContain('blocking')
    expect(host.textContent!.match(/1 to fix/g)).toHaveLength(1)
    expect(document.activeElement).toBe(host.querySelector('button[aria-label^="Fix Webcam:"]'))

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

    // Click recall chip -> restores collapsed pill and moves focus back to pill.
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

    // Card starts expanded (pill hidden) and shows crash recovery note without duplicate header.
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    expect(host.querySelector('div[aria-labelledby]')).toBeTruthy()
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
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    expect(host.querySelector('div[aria-labelledby]')).toBeTruthy()

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

    expect(host.querySelector('button[aria-expanded]')).toBeNull()
    const mobileCard = host.querySelector('div[aria-labelledby]')
    expect(mobileCard).toBeTruthy()
    expect(mobileCard!.textContent).toContain('1 to fix (1 blocking)')
    expect(host.textContent).not.toContain('Checking…')
    expect(request.mock.calls.length).toBe(callsBeforeResize)

    // Starting a new session resets prior results and shows collapsed pill cleanly.
    await act(async () => {
      beginReadyCheckSession(false)
    })
    const resetPill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(resetPill).toBeTruthy()
    expect(resetPill.textContent).toContain('Checking…')
    expect(resetPill.getAttribute('aria-expanded')).toBe('false')
  })

  it('restores focus after Fix only when Ready check still owns focus', async () => {
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
    let resolveFix: ((v: Preflight) => void) | null = null
    setupApi({
      preflight: initial,
      onFix: () =>
        new Promise<Preflight>((resolve) => {
          resolveFix = resolve
        }),
    })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <ReadyPlacementContext.Provider value="right">
          <button type="button" id="outside-control">
            Outside
          </button>
          <ReadyCheck recovered={null} onClose={vi.fn()} />
        </ReadyPlacementContext.Provider>,
      ),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    await act(async () =>
      (host.querySelector('button[aria-expanded]') as HTMLButtonElement).click(),
    )

    // 1. User moves focus outside Ready check while Fix #1 is in flight -> focus is NOT stolen.
    const outsideBtn = host.querySelector('#outside-control') as HTMLButtonElement
    const micFix = host.querySelector('button[aria-label^="Fix Mic:"]') as HTMLButtonElement
    micFix.focus()
    expect(document.activeElement).toBe(micFix)

    await act(async () => {
      micFix.click()
    })
    expect(micFix.getAttribute('aria-disabled')).toBe('true')
    outsideBtn.focus()
    expect(document.activeElement).toBe(outsideBtn)

    await act(async () => {
      resolveFix!({ ready: false, checks: [initial.checks[1]!] })
    })
    expect(document.activeElement).toBe(outsideBtn)

    // 2. Focus stays on Ready check during final Fix -> collapses and restores focus to pill.
    const camFix = host.querySelector('button[aria-label^="Fix Webcam:"]') as HTMLButtonElement
    camFix.focus()
    await act(async () => {
      camFix.click()
    })
    expect(document.activeElement).toBe(camFix)

    await act(async () => {
      resolveFix!({ ready: true, checks: [] })
    })
    const pill = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(pill).toBeTruthy()
    expect(pill.textContent).toContain('All good')
    expect(document.activeElement).toBe(pill)

    // 3. Re-seed a single issue; moving focus outside during the final Fix leaves external focus intact.
    await act(async () => {
      beginReadyCheckSession(false)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })
    await act(async () =>
      (host.querySelector('button[aria-expanded]') as HTMLButtonElement).click(),
    )
    const onlyFix = host.querySelector('button[aria-label^="Fix Mic:"]') as HTMLButtonElement
    onlyFix.focus()
    await act(async () => {
      onlyFix.click()
    })
    outsideBtn.focus()
    expect(document.activeElement).toBe(outsideBtn)

    await act(async () => {
      resolveFix!({ ready: true, checks: [] })
    })
    expect(host.querySelector('button[aria-expanded]')?.textContent).toContain('All good')
    expect(document.activeElement).toBe(outsideBtn)
  })
})
