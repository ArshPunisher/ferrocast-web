import { afterEach, describe, expect, it } from 'vitest'
import {
  cloudUsageLine,
  cloudUsageShare,
  isCloudVoice,
  orderCloudVoices,
  splitVoices,
  ttsVoicesApi,
} from '../src/tts-voices'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import type { TtsVoice } from '../src/types'

describe('Ferrocast voice helpers', () => {
  it('tells cloud voices from system ones', () => {
    expect(isCloudVoice('google:hi-IN-Neural2-A')).toBe(true)
    expect(isCloudVoice('Samantha')).toBe(false)
    expect(isCloudVoice(null)).toBe(false)
  })

  it('puts Hindi and Indian English first, keeping order within a language', () => {
    const v = [
      { id: 'a', language: 'en-US' },
      { id: 'b', language: 'en-IN' },
      { id: 'c', language: 'hi-IN' },
      { id: 'd', language: 'en-IN' },
      { id: 'e', language: 'hi-IN' },
    ]
    expect(orderCloudVoices(v).map((x) => x.id)).toEqual(['c', 'e', 'b', 'd', 'a'])
  })

  it('splits the voice list into this computer and Ferrocast', () => {
    const list: TtsVoice[] = [
      { id: 'Samantha', name: 'Samantha', language: 'en_US', pro: false },
      { id: 'google:en-US-Neural2-F', name: 'US', language: 'en-US', pro: true },
      { id: 'google:hi-IN-Neural2-A', name: 'Hindi', language: 'hi-IN', pro: true },
    ]
    const s = splitVoices(list)
    expect(s.system.map((v) => v.id)).toEqual(['Samantha'])
    expect(s.cloud.map((v) => v.id)).toEqual(['google:hi-IN-Neural2-A', 'google:en-US-Neural2-F'])
  })

  it('says the usage in words', () => {
    const u = { used: 4120, limit: 20000, reset_at: 0 }
    expect(cloudUsageLine(u)).toBe('4,120 of 20,000 characters this month')
    expect(cloudUsageShare(u)).toBeCloseTo(0.206)
    expect(cloudUsageShare({ used: 30000, limit: 20000, reset_at: 0 })).toBe(1)
  })
})

describe('Ferrocast voices in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (active: boolean, features = true) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active, features },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
    })
    return { c, api: ttsVoicesApi(c) }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('lists Ferrocast voices only with Pro and the feature', async () => {
    const { c } = setup(true)
    const all = await c.ttsVoices()
    expect(all.filter((v) => v.pro)).toHaveLength(10)
    expect(all.find((v) => v.pro)?.id).toBe('google:hi-IN-Neural2-A')
    engine?.dispose()
    const off = setup(false)
    expect((await off.c.ttsVoices()).some((v) => v.pro)).toBe(false)
    engine?.dispose()
    const noFeature = setup(true, false)
    expect((await noFeature.c.ttsVoices()).some((v) => v.pro)).toBe(false)
  })

  it('picks a voice with Pro, 402 without, 404 for an unknown one', async () => {
    const { api } = setup(true)
    const v = await api.cloud()
    expect(v.available).toBe(true)
    expect(v.usage).toMatchObject({ used: 4120, limit: 20000 })
    expect((await fails(api.setCloud('google:xx-XX-Nope'))).code).toBe('voice_not_found')
    expect((await api.setCloud('google:hi-IN-Neural2-A')).voice).toBe('google:hi-IN-Neural2-A')
    engine?.dispose()
    const free = setup(false).api
    const e = await fails(free.setCloud('google:hi-IN-Neural2-A'))
    expect(e.status).toBe(402)
    expect(e.code).toBe('pro_required')
    expect((await free.setCloud(null)).voice).toBeNull()
  })

  it('previews through the cloud once per voice and counts it', async () => {
    const { api } = setup(true)
    const p = await api.preview('google:hi-IN-Neural2-A')
    expect(p.cloud).toBe(true)
    expect(p.url.startsWith('data:audio/wav')).toBe(true)
    const used = (await api.cloud()).usage!.used
    expect(used).toBeGreaterThan(4120)
    const again = await api.preview('google:hi-IN-Neural2-A')
    expect(again.media_id).toBe(p.media_id)
    expect((await api.cloud()).usage!.used).toBe(used)
    // A system voice previews for free.
    const sys = await api.preview('kokoro-af-heart')
    expect(sys.cloud).toBe(false)
  })

  it('falls back with a reason when the voices are resting', async () => {
    const { api } = setup(true)
    engine!.setTtsVoices({ resting: true })
    const p = await api.preview('google:en-IN-Neural2-A')
    expect(p.cloud).toBe(false)
    expect(p.notice).toContain('resting')
    expect((await api.cloud()).resting).toBe(true)
  })
})
