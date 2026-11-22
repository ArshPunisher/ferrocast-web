import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ApiKeyCreated, ApiKeysView } from '@ferrocast/api'
import { Toaster } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { ApiKeysSection } from './api-keys'

// jsdom has no native modal dialog methods.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

let root: Root | null = null

const sampleView: ApiKeysView = {
  keys: [
    {
      id: 'k_existing',
      name: 'Stream Deck XL',
      prefix: 'fc_key_7a91c4e0...',
      scopes: ['read_only', 'studio_control'],
      created_at: 1_700_000_000_000,
      expires_at: null,
      last_used_at: 1_700_000_500_000,
      revoked_at: null,
    },
  ],
  audit: [
    {
      id: 'a_1',
      key_id: 'k_existing',
      key_name: 'Stream Deck XL',
      method: 'POST',
      path: '/obs/scene',
      status: 200,
      at: 1_700_000_500_000,
    },
  ],
}

async function mount(overrides: Record<string, unknown> = {}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const createdToken = `fc_key_${'ab'.repeat(32)}`
  const createdResp: ApiKeyCreated = {
    key: {
      id: 'k_new',
      name: 'Node Reactor',
      prefix: `${createdToken.slice(0, 15)}...`,
      scopes: ['read_only', 'alerts'],
      created_at: Date.now(),
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
    },
    token: createdToken,
  }
  const client = {
    apiKeys: vi.fn(async () => sampleView),
    createApiKey: vi.fn(async () => createdResp),
    revokeApiKey: vi.fn(async () => undefined),
    ...overrides,
  }
  useLive.setState({ conn: { client } as never })
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <>
        <Toaster />
        <ApiKeysSection />
      </>,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
  return { host, client, createdToken }
}

afterEach(async () => {
  if (root) {
    const r = root
    root = null
    await act(async () => r.unmount())
  }
  useLive.setState({ conn: null })
  document.body.innerHTML = ''
})

describe('ApiKeysSection', () => {
  it('lists keys with scopes and recent activity without secrets', async () => {
    const { host } = await mount()
    expect(host.textContent).toContain('Stream Deck XL')
    expect(host.textContent).toContain('fc_key_7a91c4e0...')
    expect(host.textContent).toContain('POST /obs/scene')
    expect(host.textContent).toContain('Studio control')
  })

  it('creates a key, displays the secret once, and validates missing name', async () => {
    const { host, client, createdToken } = await mount()
    const createBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create API key'),
    )!
    await act(async () => createBtn.click())

    // Native <dialog> renders inside document
    const submitBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Create key',
    )!
    await act(async () => submitBtn.click())
    expect(document.body.textContent).toContain('Give this key a clear name')
    expect(client.createApiKey).not.toHaveBeenCalled()

    const nameInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Stream Deck XL"]',
    )!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(nameInput, 'Node Reactor')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => submitBtn.click())
    await act(async () => Promise.resolve())
    expect(client.createApiKey).toHaveBeenCalledTimes(1)
    const tokenInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Generated API key secret"]',
    )
    expect(tokenInput?.value).toBe(createdToken)
  })

  it('revokes an active key after confirmation', async () => {
    const { client } = await mount()
    const revokeBtn = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Revoke Stream Deck XL"]',
    )!
    await act(async () => revokeBtn.click())

    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revoke key',
    )!
    await act(async () => confirmBtn.click())
    await act(async () => Promise.resolve())
    expect(client.revokeApiKey).toHaveBeenCalledWith('k_existing')
  })

  it('does not count expired keys as active', async () => {
    const view: ApiKeysView = {
      ...sampleView,
      keys: [
        ...sampleView.keys,
        {
          ...sampleView.keys[0]!,
          id: 'k_old',
          name: 'Old script',
          expires_at: 1_700_000_100_000,
        },
      ],
    }
    const { host } = await mount({ apiKeys: vi.fn(async () => view) })
    expect(host.textContent).toContain('1 of ')
    expect(host.textContent).toContain('Expired')
  })

  it('asks before closing the show-once secret by Escape or a click outside, unless it was copied', async () => {
    const { host } = await mount()
    const click = async (label: string) =>
      act(async () => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => x.textContent?.trim() === label,
        )
        expect(b, label).toBeTruthy()
        b!.click()
      })
    await click('Create API key')
    const nameInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Stream Deck XL"]',
    )!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(nameInput, 'Node Reactor')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Create key')
    await act(async () => Promise.resolve())
    expect(host.ownerDocument.body.textContent).toContain('This secret is shown once.')
    // Escape (the dialog's cancel event) asks instead of closing.
    await act(async () => {
      document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    expect(document.body.textContent).toContain('You haven’t copied it')
    await click('Keep it open')
    expect(document.body.textContent).not.toContain('You haven’t copied it')
    expect(document.querySelector('input[aria-label="Generated API key secret"]')).toBeTruthy()
  })
})
