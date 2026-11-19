import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Settings, YoutubePrivacy } from '@ferrocast/api'
import { Toaster, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { YoutubePrivacyGroup } from './youtube-privacy'

// Who can watch the lives Ferrocast makes on YouTube: shown with YouTube connected, saved at
// once, said back in one line, and never offered to an engine that would ignore it.

let root: Root | null = null
const base = { theme: 'system', currency: 'INR' } as unknown as Settings

async function mount(opts: {
  connected?: boolean
  privacy?: YoutubePrivacy | undefined
  save?: () => Promise<unknown>
  load?: () => Promise<Settings>
}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const saved: Settings[] = []
  const client = {
    settings:
      opts.load ??
      (async () => ({ ...base, ...(opts.privacy ? { youtube_privacy: opts.privacy } : {}) })),
    saveSettings: vi.fn(async (s: Settings) => {
      saved.push(s)
      await opts.save?.()
      return s
    }),
  }
  useLive.setState({
    conn: { client } as never,
    connectors: {
      youtube: { state: opts.connected === false ? 'disconnected' : 'connected' },
    } as never,
  })
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () =>
    root!.render(
      <>
        <YoutubePrivacyGroup />
        <Toaster />
      </>,
    ),
  )
  return { client, saved }
}
const radio = (value: string) =>
  document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)

beforeEach(() => {
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
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null, connectors: null as never })
  for (let i = 1; i < 30; i++) dismissToast(i)
})

describe('YoutubePrivacyGroup', () => {
  it('is not there without YouTube connected', async () => {
    await mount({ connected: false, privacy: 'public' })
    expect(document.body.textContent).toBe('')
  })

  it('is not offered by an engine that has no such setting', async () => {
    await mount({ privacy: undefined })
    expect(document.body.textContent).toBe('')
  })

  it('shows one line with the choice made, and the details behind an (i)', async () => {
    await mount({ privacy: 'unlisted' })
    expect(document.body.textContent).toContain('Who can watch new lives')
    const checked = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (r) => r.checked,
    )
    expect(checked?.value).toBe('unlisted')
    expect(document.body.textContent).toContain('Public')
    expect(document.body.textContent).toContain('Private')
    // The long words are not on the page until the (i) is used; the button explains itself.
    const i = document.querySelector('button[aria-label="About who can watch new lives"]')
    expect(i).not.toBeNull()
    expect(i?.getAttribute('aria-expanded')).toBe('false')
  })

  it('saves the choice at once with the rest of the settings untouched, and says what it means', async () => {
    const { saved } = await mount({ privacy: 'public' })
    await act(async () => radio('private')!.click())
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ currency: 'INR', youtube_privacy: 'private' })
    expect(document.body.textContent).toContain('New YouTube lives will be private.')
  })

  it('a save that fails puts the control back where the engine has it', async () => {
    let reads = 0
    const { client } = await mount({
      load: async () => {
        reads += 1
        return { ...base, youtube_privacy: 'public' } as Settings
      },
      save: async () => {
        throw new Error('the engine is busy')
      },
    })
    await act(async () => radio('unlisted')!.click())
    expect(client.saveSettings).toHaveBeenCalledTimes(1)
    expect(reads).toBe(2)
    const checked = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (r) => r.checked,
    )
    expect(checked?.value).toBe('public')
  })

  it('says so, with a way to retry, when the settings cannot be read', async () => {
    await mount({
      load: async () => {
        throw new Error('no answer')
      },
    })
    expect(document.body.textContent).toContain('Try again')
  })
})
