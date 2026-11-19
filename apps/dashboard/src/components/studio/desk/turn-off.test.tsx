import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineStats } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { DockWorkspace } from './layout'
import { LayoutMenu } from './desk'

// "Turn the Studio off" with a stream or a recording running asks first (S3, M9-05): it ends
// both for good, and the menu item used to do it at once.

type Req = [string, string, unknown?]
const calls: Req[] = []
let root: Root | null = null

const live = { stream: { active: true, reconnecting: false, error: null }, record: null }
const recording = { stream: null, record: { active: true } }
const nothing = { stream: null, record: null }

async function mount(stats: object, onStatus = vi.fn(), fail = false) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push([method, path, body])
    if (fail) throw new Error('the Studio is busy')
    return { running: false }
  })
  useLive.setState({ conn: { client: { request } } as never })
  const desk = { stats: stats as EngineStats } as unknown as Desk
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () =>
    root!.render(
      <DeskProvider value={desk}>
        <DockWorkspace
          top={<LayoutMenu onStatus={onStatus} />}
          stage={<div />}
          docks={() => null}
        />
      </DeskProvider>,
    ),
  )
  return { onStatus }
}

const stops = () => calls.filter((c) => c[1] === '/api/v1/studio/engine/stop')
const button = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('button,[role="menuitem"]')].find(
    (b) => b.textContent?.trim() === name,
  )
async function pressOff() {
  await act(async () =>
    document.querySelector<HTMLElement>('button[aria-label="Layout"][aria-haspopup]')!.click(),
  )
  await act(async () => button('Turn the Studio off')!.click())
}

beforeEach(() => {
  calls.length = 0
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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
  // jsdom has no modal dialog: open and closed by its attribute, as a browser shows it.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
})

describe('Turn the Studio off', () => {
  it('turns off at once when nothing is on air', async () => {
    const { onStatus } = await mount(nothing)
    await pressOff()
    expect(stops()).toHaveLength(1)
    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(document.querySelector('dialog[open]')).toBeNull()
  })

  it('asks first while live: nothing stops until it is confirmed, and Keep goes back', async () => {
    const { onStatus } = await mount(live)
    await pressOff()
    const dialog = document.querySelector('dialog[open]')
    expect(dialog?.textContent).toContain('Turn the Studio off?')
    expect(dialog?.textContent).toContain('The stream ends for everyone watching.')
    expect(stops()).toHaveLength(0)
    await act(async () => button('Keep streaming')!.click())
    expect(stops()).toHaveLength(0)
    // Back on the button that asked, for the keyboard.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Layout')
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('asks while recording too, says so, and a double press of Turn off stops once', async () => {
    const { onStatus } = await mount(recording)
    await pressOff()
    expect(document.querySelector('dialog[open]')?.textContent).toContain(
      'The recording is saved and closed.',
    )
    const off = button('Turn off')!
    await act(async () => {
      off.click()
      off.click()
    })
    expect(stops()).toHaveLength(1)
    expect(onStatus).toHaveBeenCalledTimes(1)
  })

  it('a failed stop closes the question (the error is a toast, the Studio stays on)', async () => {
    const { onStatus } = await mount(live, vi.fn(), true)
    await pressOff()
    await act(async () => button('Turn off')!.click())
    expect(stops()).toHaveLength(1)
    expect(onStatus).not.toHaveBeenCalled()
    expect(document.querySelector('dialog[open]')).toBeNull()
  })
})
