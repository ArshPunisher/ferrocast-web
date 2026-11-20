import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { LiveAlert } from '@ferrocast/api'
import { Toaster, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import type { FerroClient } from '@ferrocast/api'
import { LiveAlertToasts, alertFix, foldAlerts } from './live-alerts'

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

// A fake client: records each request and answers the Studio's mixer calls.
function fakeClient(volume = -10) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const request = (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body })
    if (path.endsWith('/engine/scenes')) return Promise.resolve({ current: 'Live', scenes: [] })
    if (path.endsWith('/audio') && method === 'GET')
      return Promise.resolve([
        { name: 'KREO', kind: 'coreaudio_input_capture', volume_db: volume, muted: false },
      ])
    return Promise.resolve(undefined)
  }
  return { client: { request } as unknown as FerroClient, calls }
}

const fixable = (action: NonNullable<LiveAlert['action']>, source = 'KREO'): LiveAlert => ({
  id: `mic:x:${source}`,
  level: 'warn',
  message: 'Your voice is very quiet.',
  cleared: false,
  source,
  action,
})

describe('alertFix', () => {
  it('offers nothing for an alert without a source or a known action', () => {
    const { client } = fakeClient()
    expect(alertFix(raised('mic:A', 'A'), client)).toBeUndefined()
    expect(alertFix(fixable('pick_scene'), client)).toBeUndefined()
    const { source: _source, ...noSource } = fixable('unmute')
    expect(alertFix(noSource, client)).toBeUndefined()
  })

  it('unmutes the named source', async () => {
    const { client, calls } = fakeClient()
    const fix = alertFix(fixable('unmute'), client)!
    expect(fix.label).toBe('Unmute')
    await fix.run()
    expect(calls).toEqual([
      { method: 'PUT', path: '/api/v1/studio/engine/sources/KREO/audio', body: { muted: false } },
    ])
  })

  it('raises the gain 6 dB from where the fader is now, never past the top', async () => {
    const a = fakeClient(-10)
    await alertFix(fixable('gain_up'), a.client)!.run()
    expect(a.calls.at(-1)?.body).toEqual({ volume_db: -4 })
    const b = fakeClient(24)
    await alertFix(fixable('gain_up'), b.client)!.run()
    expect(b.calls.at(-1)?.body).toEqual({ volume_db: 26 })
  })

  it('says so when the mic is not in the scene on air', async () => {
    const { client } = fakeClient()
    await expect(alertFix(fixable('gain_up', 'Other'), client)!.run()).rejects.toThrow(
      /isn't in the scene/,
    )
  })
})

describe('LiveAlertToasts one-tap fix', () => {
  let root: Root | null = null
  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState((s) => ({ conn: null, studio: { ...s.studio, alert: null } }))
    for (let i = 1; i < 80; i++) dismissToast(i)
  })

  it('shows the fix as a button on the toast and runs it', async () => {
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
    const { client, calls } = fakeClient()
    useLive.setState({ conn: { client } as never })
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
    const muted: LiveAlert = {
      id: 'mic:muted:KREO',
      level: 'warn',
      message: 'You’re talking but KREO is muted.',
      detail: 'Nobody hears you.',
      cleared: false,
      source: 'KREO',
      action: 'unmute',
    }
    await act(async () => useLive.setState((s) => ({ studio: { ...s.studio, alert: muted } })))
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Unmute')
    expect(button).toBeDefined()
    await act(async () => button!.click())
    expect(calls.some((c) => c.method === 'PUT' && c.path.endsWith('/KREO/audio'))).toBe(true)
    // An alert with no fix has no button.
    const { action: _action, ...plain } = { ...muted, id: 'scene:empty' }
    await act(async () => useLive.setState((s) => ({ studio: { ...s.studio, alert: plain } })))
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Unmute')).toBe(
      false,
    )
  })
})
