// The dashboard's look is a setting (`theme`): the demo engine takes the same values the real
// one does (docs/API-REQUESTS.md R12): follow the computer, dark, light, or one of the ten.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { THEME_IDS, type Settings } from '../src/types'

let engine: DemoEngine
let client: FerroClient
beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => engine.dispose())

describe('Settings.theme', () => {
  it('takes system, dark, light and each of the ten themes', async () => {
    for (const theme of ['system', 'dark', 'light', ...THEME_IDS] as const) {
      const saved = await client.saveSettings({ ...(await client.settings()), theme })
      expect(saved.theme).toBe(theme)
      expect((await client.settings()).theme).toBe(theme)
    }
  })

  it('refuses anything else, naming the field', async () => {
    const s = await client.settings()
    const err = await client
      .saveSettings({ ...s, theme: 'neon' as Settings['theme'] })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/theme/)
    expect((await client.settings()).theme).toBe(s.theme)
  })
})
