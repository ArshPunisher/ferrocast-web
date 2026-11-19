import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { LiveAlert } from '@ferrocast/api'
import { Toaster, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import { LiveAlertToasts, foldAlerts } from './live-alerts'

// Live alerts are one toast: the newest wrong thing, the count behind it, the detail behind an (i).

const raised = (id: string, message: string, detail?: string): LiveAlert => ({
  id,
  level: 'error',
  message,
  ...(detail ? { detail } : {}),
  cleared: false,
})
const cleared = (id: string, message: string): LiveAlert => ({
  id,
  level: 'warn',
  message,
  cleared: true,
})

describe('foldAlerts', () => {
  it('shows the newest with how many wait behind it', () => {
    const a = foldAlerts([], raised('mic:A', 'A has no sound (2 min)', 'Is it unplugged?'))
    expect(a.shown).toMatchObject({
      message: 'A has no sound (2 min)',
      detail: 'Is it unplugged?',
      more: 0,
    })
    const b = foldAlerts(a.active, raised('camera:B:black', 'B is black (10 s)'))
    expect(b.shown).toMatchObject({ message: 'B is black (10 s)', more: 1, tone: 'error' })
    expect(b.shown.detail).toBeUndefined()
  })

  it('one fixed brings the other back; the last one fixed says so, green', () => {
    let s = foldAlerts([], raised('a', 'A wrong'))
    s = foldAlerts(s.active, raised('b', 'B wrong'))
    s = foldAlerts(s.active, cleared('b', 'B is fine again'))
    expect(s.shown).toMatchObject({ message: 'A wrong', more: 0, fixed: false })
    s = foldAlerts(s.active, cleared('a', 'A is fine again'))
    expect(s.shown).toMatchObject({ tone: 'ok', message: 'A is fine again', fixed: true })
    expect(s.active).toEqual([])
  })

  it('raised again moves to the front instead of counting twice', () => {
    let s = foldAlerts([], raised('a', 'A wrong'))
    s = foldAlerts(s.active, raised('b', 'B wrong'))
    s = foldAlerts(s.active, raised('a', 'A wrong again'))
    expect(s.active.map((x) => x.id)).toEqual(['b', 'a'])
    expect(s.shown).toMatchObject({ message: 'A wrong again', more: 1 })
  })
})

describe('LiveAlertToasts', () => {
  let root: Root | null = null
  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState((s) => ({ studio: { ...s.studio, alert: null } }))
    for (let i = 1; i < 50; i++) dismissToast(i)
  })

  it('puts two alerts in one toast with a count, and the detail behind its (i)', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia
    const el = document.body.appendChild(document.createElement('div'))
    root = createRoot(el)
    await act(async () =>
      root!.render(
        <>
          <LiveAlertToasts />
          <Toaster />
        </>,
      ),
    )
    const send = (alert: LiveAlert) =>
      act(async () => useLive.setState((s) => ({ studio: { ...s.studio, alert } })))
    await send(
      raised('mic:A', 'A has no sound (2 min)', 'Is it unplugged, or muted on the device?'),
    )
    await send(raised('camera:B:black', 'B is black (10 s)'))
    const toasts = document.querySelectorAll('section[aria-label="Notifications"] [role]')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.textContent).toContain('B is black (10 s)')
    expect(toasts[0]?.textContent).toContain('+1 more')
    // The newest has no detail, so no (i); the older one's detail comes back when B is fixed.
    expect(document.querySelector('[aria-label="More about this message"]')).toBeNull()
    await send(cleared('camera:B:black', 'B has a picture again'))
    const i = document.querySelector<HTMLElement>('[aria-label="More about this message"]')!
    expect(i).not.toBeNull()
    await act(async () => i.click())
    expect(document.body.textContent).toContain('Is it unplugged, or muted on the device?')
  })
})
