import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { Overlays } from './Overlays'

let root: Root | null = null
let engine: DemoEngine | null = null

async function flushTicks(turns = 30, until?: () => boolean): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (until?.()) return
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

async function mountOverlays(client: FerroClient) {
  useLive.setState({ conn: { client } as never })
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <>
        <Overlays />
        <Toaster />
      </>,
    )
  })
  await flushTicks(40, () => !!host.querySelector('button[aria-label^="More for "]'))
  return host
}

function setInputValue(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function openRenameDialog(host: HTMLElement) {
  const moreBtn = host.querySelector<HTMLButtonElement>('button[aria-label^="More for "]')
  if (!moreBtn) throw new Error('Missing overlay card menu trigger')
  await act(async () => {
    moreBtn.click()
  })
  const renameItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (m) => m.textContent?.trim() === 'Rename',
  )
  if (!renameItem) throw new Error('Missing Rename menu item')
  await act(async () => {
    renameItem.click()
  })
  const dialog = document.body.querySelector<HTMLDialogElement>('dialog[open]')
  if (!dialog || !dialog.textContent?.includes('Rename overlay')) {
    throw new Error('Rename dialog did not open')
  }
  return dialog
}

describe('Overlays rename validation (Extra bug #6)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLDialogElement.prototype.showModal ??= function showModal() {
      this.open = true
    }
    HTMLDialogElement.prototype.close ??= function close() {
      this.open = false
    }
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    engine?.dispose()
    engine = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null, connectors: null })
    currentToasts().forEach((t) => dismissToast(t.id))
  })

  it('disables Save and blocks Enter submit with inline validation error for empty or whitespace-only names', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const saveSpy = vi.spyOn(client, 'saveOverlay')
    const host = await mountOverlays(client)

    await openRenameDialog(host)

    const dialog = document.body.querySelector<HTMLDialogElement>('dialog[open]')!
    const input = dialog.querySelector<HTMLInputElement>('input')!
    const saveBtn = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Save',
    )!

    // Empty string disables Save.
    await act(async () => {
      setInputValue(input, '')
    })
    expect(saveBtn.disabled).toBe(true)

    // Whitespace-only disables Save, and form submit shows inline error without calling saveOverlay.
    await act(async () => {
      setInputValue(input, '   ')
    })
    expect(saveBtn.disabled).toBe(true)

    await act(async () => {
      saveBtn.click()
    })
    expect(saveSpy).not.toHaveBeenCalled()

    const form = dialog.querySelector('form')
    expect(form).not.toBeNull()
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(saveSpy).not.toHaveBeenCalled()
    expect(dialog.textContent).toContain('Give it a name')

    // Valid name clears error, re-enables Save, and submits trimmed value.
    await act(async () => {
      setInputValue(input, '  Main Stage  ')
    })
    expect(saveBtn.disabled).toBe(false)
    expect(dialog.textContent).not.toContain('Give it a name')

    await act(async () => {
      saveBtn.click()
    })
    await flushTicks(20, () => !document.body.querySelector('dialog[open]'))
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0]?.[0].name).toBe('Main Stage')
    expect(document.body.querySelector('dialog[open]')).toBeNull()
    expect(host.textContent).toContain('Main Stage')
  })

  it('clears previous rename validation error when dialog closes and reopens', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const host = await mountOverlays(client)

    let dialog = await openRenameDialog(host)
    await act(async () => {
      setInputValue(dialog.querySelector('input')!, '   ')
    })
    await act(async () => {
      dialog
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(dialog.textContent).toContain('Give it a name')

    await act(async () => {
      const cancelBtn = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === 'Cancel',
      )!
      cancelBtn.click()
    })
    expect(document.body.querySelector('dialog[open]')).toBeNull()

    dialog = await openRenameDialog(host)
    expect(dialog.textContent).not.toContain('Give it a name')
  })
})
