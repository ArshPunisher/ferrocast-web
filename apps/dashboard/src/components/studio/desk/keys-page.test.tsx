// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StudioSettings } from '@ferrocast/api'
import { DeskProvider } from './common'
import { KeysPage } from './settings'
import { useLive } from '../../../lib/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const nop: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === 'then' ? undefined : nop),
  apply: () => nop,
})

function desk() {
  const t = {
    api: { items: async () => [], filters: async () => [] },
    allScenes: [{ name: 'Main' }, { name: 'BRB' }],
    scenes: { data: { quick: [] } },
    audio: { data: [{ name: 'Mic' }] },
  }
  return new Proxy(t, { get: (o: Record<string, unknown>, k: string) => (k in o ? o[k] : nop) })
}

describe('the Shortcuts page', () => {
  let root: Root
  let host: HTMLDivElement
  let saved: Record<string, string>
  beforeEach(() => {
    useLive.setState({ conn: { client: {} } as never })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const mount = async (hotkeys: Record<string, string>) => {
    saved = hotkeys
    function Harness() {
      const [s, setS] = useState({ hotkeys } as unknown as StudioSettings)
      return (
        <DeskProvider value={desk() as never}>
          <KeysPage
            s={s}
            set={(p: Partial<StudioSettings>) => {
              setS((x) => ({ ...x, ...p }))
              if (p.hotkeys) saved = p.hotkeys
            }}
          />
        </DeskProvider>
      )
    }
    await act(async () => root.render(<Harness />))
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
  }
  const rows = () => [...host.querySelectorAll('section > div')]
  const row = (text: string) =>
    rows().find((r) => r.querySelector('span')?.textContent === text) as HTMLElement
  const byLabel = (el: ParentNode, re: RegExp) =>
    [...el.querySelectorAll<HTMLElement>('[aria-label]')].find((e) =>
      re.test(e.getAttribute('aria-label') ?? ''),
    )
  const press = (code: string, mods: KeyboardEventInit = {}) =>
    act(
      () =>
        void window.dispatchEvent(
          new KeyboardEvent('keydown', {
            code,
            key: code,
            bubbles: true,
            cancelable: true,
            ...mods,
          }),
        ),
    )

  it('lists the missing OBS start and stop actions and the scene, source and sound ones', async () => {
    await mount({})
    const text = host.textContent ?? ''
    for (const t of [
      'Start recording',
      'Stop recording',
      'Resume recording',
      'Start the replay buffer',
      'Stop the virtual camera',
      'Main',
      'BRB',
      'Mute or unmute Mic',
    ])
      expect(text, t).toContain(t)
  })

  it('searches by action name and by key text', async () => {
    await mount({ 'mute:Mic': 'Alt+KeyM', record: 'F9' })
    const search = host.querySelector<HTMLInputElement>('input[type=search]')!
    const type = async (v: string) => {
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        set.call(search, v)
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await type('virtual')
    expect(host.textContent).toContain('Start the virtual camera')
    expect(host.textContent).not.toContain('Go live')
    await type('f9')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.textContent).toContain('Start or stop recording')
    await type('zzz')
    expect(host.textContent).toContain('No shortcut matches')
  })

  it('finds by a pressed key', async () => {
    await mount({ record: 'F9', undo: 'F9|Cmd+KeyZ', redo: 'F8' })
    await act(async () => void byLabel(host, /^$/)?.click())
    const find = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Find by key')!
    await act(async () => find.click())
    expect(host.textContent).toContain('Press keys')
    await press('F9')
    expect(rows().map((r) => r.querySelector('span')?.textContent)).toEqual([
      'Start or stop recording',
      'Undo',
    ])
    const stop = byLabel(host, /^Stop looking for that key/)!
    await act(async () => stop.click())
    expect(rows().length).toBeGreaterThan(2)
  })

  it('gives an action several keys, each removable, up to four', async () => {
    await mount({ record: 'F9' })
    const add = byLabel(row('Start or stop recording'), /^Add another key to/)!
    await act(async () => add.click())
    await press('F10')
    expect(saved.record).toBe('F9|F10')
    await act(async () => byLabel(row('Start or stop recording'), /^Add another key to/)!.click())
    await press('F11')
    await act(async () => byLabel(row('Start or stop recording'), /^Add another key to/)!.click())
    await press('F12')
    expect(saved.record).toBe('F9|F10|F11|F12')
    expect(
      (byLabel(row('Start or stop recording'), /^Add another key to/) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    await act(async () => byLabel(row('Start or stop recording'), /^Remove F10/)!.click())
    expect(saved.record).toBe('F9|F11|F12')
    await act(async () => byLabel(row('Start or stop recording'), /^Clear every shortcut/)!.click())
    expect('record' in saved).toBe(false)
  })

  it('warns when a key is used twice, keeps both, and resets a row to what it was', async () => {
    await mount({ record: 'F9' })
    await act(async () => byLabel(row('Undo'), /^Set a key for Undo/)!.click())
    await press('F9')
    expect(saved).toEqual({ record: 'F9', undo: 'F9' })
    expect(row('Undo').textContent).toContain('Shared with')
    expect(row('Start or stop recording').textContent).toContain('Shared with')
    // The row Undo changed offers Reset; going back removes the key.
    await act(async () => byLabel(row('Undo'), /^Reset Undo/)!.click())
    expect(saved).toEqual({ record: 'F9' })
    expect(row('Start or stop recording').textContent).not.toContain('Shared with')
  })
})
