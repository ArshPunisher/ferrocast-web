import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { StudioSettings } from '@ferrocast/api'
import { toast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'

const saved = {
  sample_rate: 48000,
  fps: 60,
  width: 1920,
  height: 1080,
} as unknown as StudioSettings
const base = {
  studioSettings: vi.fn(async () => saved),
  setStudioSettings: vi.fn(),
  restart: vi.fn(async () => undefined),
  monitoring: vi.fn(async () => ({ devices: [] })),
}

// Any other call the Audio page makes answers an empty list.
const api = new Proxy(base, {
  get: (t, k: string) => (k in t ? t[k as keyof typeof t] : async () => []),
})

vi.mock('./common', async (orig) => ({
  ...(await orig<typeof import('./common')>()),
  useDesk: () => ({
    scene: 'Main',
    kinds: { data: { encoders: [], inputs: [] } },
    api,
    prefs: { set: () => {} },
  }),
}))

vi.mock('@ferrocast/ui', async (orig) => {
  const real = await orig<typeof import('@ferrocast/ui')>()
  return { ...real, toast: vi.fn() }
})

import { SettingsDialog } from './settings'

// jsdom has no modal dialog.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

let root: Root | null = null
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  vi.clearAllMocks()
})

async function saveWith(restart: string | null) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useLive.setState({ conn: { client: { request: vi.fn() } } as never })
  base.setStudioSettings.mockResolvedValue({
    settings: { ...saved, sample_rate: 44100 },
    restart,
  })
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<SettingsDialog open onClose={() => {}} start="audio" />))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  const rate = document.querySelector('select[aria-label="Sample rate"]') as HTMLSelectElement
  expect(rate).not.toBeNull()
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    set?.call(rate, '44100')
    rate.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const save = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement
  await act(async () => save.click())
  return vi.mocked(toast).mock.calls[0]![0]
}

describe('a save that needs a restart', () => {
  it('offers Restart, which asks Ferrocast to restart', async () => {
    const t = await saveWith('The sound rate applies after Ferrocast restarts.')
    expect(t.hint).toContain('applies after Ferrocast restarts')
    expect(t.action?.label).toBe('Restart')
    t.action?.run()
    expect(base.restart).toHaveBeenCalledTimes(1)
  })

  it('a plain save has no Restart', async () => {
    const t = await saveWith(null)
    expect(t.message).toBe('Saved.')
    expect(t.action).toBeUndefined()
  })
})
