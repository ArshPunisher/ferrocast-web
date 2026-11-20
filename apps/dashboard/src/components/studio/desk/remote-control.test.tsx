// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteControl } from '@ferrocast/api'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let state: RemoteControl = {
  enabled: false,
  port: 4455,
  lan: false,
  has_password: false,
  clients: 0,
  listening: false,
  error: null,
}
const remoteControl = vi.fn(async () => ({ ...state }))
const setRemoteControl = vi.fn(
  async (patch: { enabled?: boolean; port?: number; lan?: boolean }) => {
    const first = patch.enabled === true && !state.has_password
    state = {
      ...state,
      ...patch,
      has_password: state.has_password || first,
      listening: patch.enabled ?? state.enabled,
    }
    return first ? { ...state, password: 'Sekrit24CharPasswordXyz' } : { ...state }
  },
)
const newRemoteControlPassword = vi.fn(async () => ({ password: 'FreshOnePasswordAbc23456' }))
const desk = { api: { remoteControl, setRemoteControl, newRemoteControlPassword } }
vi.mock('./common', async (orig) => ({
  ...(await orig<typeof import('./common')>()),
  useDesk: () => desk,
}))
vi.mock('@ferrocast/ui', async (orig) => ({
  ...(await orig<typeof import('@ferrocast/ui')>()),
  copyText: vi.fn(async () => true),
}))

import { RemoteControlSection } from './remote-control'

let root: Root | null = null
let host: HTMLElement

beforeEach(() => {
  state = {
    enabled: false,
    port: 4455,
    lan: false,
    has_password: false,
    clients: 0,
    listening: false,
    error: null,
  }
  vi.clearAllMocks()
  host = document.body.appendChild(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  host.remove()
})

async function mount() {
  root = createRoot(host)
  await act(async () => root?.render(<RemoteControlSection />))
  await act(async () => undefined)
}

const toggle = (label: string) =>
  host.querySelector<HTMLInputElement>(`[aria-label="${label}"], input[type="checkbox"]`)

describe('Remote control settings', () => {
  it('is off by default: only the switch shows, no password and no port', async () => {
    await mount()
    expect(host.textContent).toContain('Let other apps control Ferrocast')
    expect(host.querySelector('[data-testid="remote-password"]')).toBeNull()
    expect(host.querySelector('[aria-label="Port"]')).toBeNull()
  })

  it('shows the password once after switching on, with Copy and New password', async () => {
    await mount()
    await act(async () => toggle('Let other apps control Ferrocast')?.click())
    await act(async () => undefined)
    expect(setRemoteControl).toHaveBeenCalledWith({ enabled: true })
    expect(host.querySelector('[data-testid="remote-password"]')?.textContent).toBe(
      'Sekrit24CharPasswordXyz',
    )
    expect(host.textContent).toContain('Shown once')
    expect(host.textContent).toContain('Listening on port 4455')
    expect(host.textContent).toContain('ws://127.0.0.1:4455')
    const renew = [...host.querySelectorAll('button')].find((b) => b.textContent === 'New password')
    await act(async () => renew?.click())
    await act(async () => undefined)
    expect(newRemoteControlPassword).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="remote-password"]')?.textContent).toBe(
      'FreshOnePasswordAbc23456',
    )
  })

  it('says the app is open to the network only when asked, and why it cannot listen', async () => {
    state = {
      ...state,
      enabled: true,
      has_password: true,
      listening: false,
      error: 'Port 4455 can’t be used.',
    }
    await mount()
    expect(host.textContent).toContain('Only this computer')
    expect(host.textContent).toContain('Port 4455 can’t be used.')
    expect(host.querySelector('[data-testid="remote-password"]')).toBeNull()
    expect(host.textContent).toContain('Kept hidden')
  })
})
