import { afterEach, describe, expect, it } from 'vitest'
import {
  contrastRatio,
  fixTipColours,
  majorToMinor,
  normaliseHex,
  readableOn,
  tipBrandApi,
  tipGoalProblem,
  tipImageProblem,
  tipPalette,
} from '../src/tip-brand'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import type { FerroEvent } from '../src/types'

describe('tip page colours (mirrors the relay)', () => {
  it('normalises hex colours', () => {
    expect(normaliseHex('#3461F5')).toBe('#3461f5')
    expect(normaliseHex(' #fff ')).toBe('#ffffff')
    for (const bad of ['', 'fff', '#ffff', '#ggg', 'red']) expect(normaliseHex(bad)).toBeNull()
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('lifts unreadable text and accent and says what changed', () => {
    const { colours, changes } = fixTipColours({ accent: '#2b2b2b', background: '#202020', text: '#555555' })
    expect(colours.background).toBe('#202020')
    expect(contrastRatio(colours.text, '#202020')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colours.accent, '#202020')).toBeGreaterThanOrEqual(3)
    expect(changes.map((c) => c.field)).toEqual(['text', 'accent'])
    expect(changes[0]?.message).toContain('4.5:1')
    expect(fixTipColours({ accent: '#ffa424', background: '#0a0b0d', text: '#eef0f4' }).changes).toEqual([])
  })

  it('always finds a readable colour', () => {
    for (let v = 0; v <= 255; v += 15) {
      const bg = `#${v.toString(16).padStart(2, '0').repeat(3)}`
      expect(contrastRatio(readableOn(bg, bg, 4.5), bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('draws the default look without colours', () => {
    expect(tipPalette(null).accent).toBe('#3461f5')
    const p = tipPalette({ accent: '#cf7400', background: '#f6f1e7', text: '#1a140c' })
    expect(contrastRatio(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('goal and image checks', () => {
  it('converts major units by currency', () => {
    expect(majorToMinor('5000', 'INR')).toBe(500_000)
    expect(majorToMinor('5,000.50', 'INR')).toBe(500_050)
    expect(majorToMinor('500', 'JPY')).toBe(500)
    expect(majorToMinor('1.5', 'JPY')).toBeNull()
    expect(majorToMinor('abc', 'INR')).toBeNull()
  })

  it('names the problem field', () => {
    expect(tipGoalProblem({ title: '', target: '0', currency: 'RUPEE', ends: '' })).toEqual({
      title: expect.any(String),
      target: expect.any(String),
      currency: expect.any(String),
    })
    expect(tipGoalProblem({ title: 'Mic', target: '500', currency: 'INR', ends: '2000-01-01' }).ends).toBeTruthy()
    expect(tipGoalProblem({ title: 'Mic', target: '500', currency: 'INR', ends: '' })).toEqual({})
  })

  it('refuses images before sending', () => {
    expect(tipImageProblem('avatar', { type: 'image/gif', size: 10 })).toContain('PNG, JPEG or WebP')
    expect(tipImageProblem('avatar', { type: 'image/png', size: 1_000_001 })).toBe('Avatars can be up to 1 MB.')
    expect(tipImageProblem('banner', { type: 'image/jpeg', size: 3_000_001 })).toBe('Banners can be up to 3 MB.')
    expect(tipImageProblem('banner', { type: 'image/webp', size: 2_000 })).toBeNull()
  })
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

describe('the demo engine', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (pro: boolean) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active: pro, features: true },
    })
    const c = new FerroClient({ base: 'http://127.0.0.1:47820', token: DEMO_TOKEN, fetch: engine.fetch })
    return { c, api: tipBrandApi(c) }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('needs Pro', async () => {
    const { api } = setup(false)
    expect((await fails(api.brand())).code).toBe('pro_required')
    expect((await fails(api.goal())).status).toBe(402)
  })

  it('saves colours with the same fixes as the relay', async () => {
    const { api } = setup(true)
    const b = await api.saveColours({ accent: '#2b2b2b', background: '#202020', text: '#555555' })
    expect(b.changes).toHaveLength(2)
    expect(b.applied).toBe(true)
    expect((await fails(api.saveColours({ accent: 'red', background: '#000', text: '#fff' }))).status).toBe(400)
    await api.resetColours()
    expect((await api.brand()).accent).toBeNull()
  })

  it('checks images like the relay', async () => {
    const { api } = setup(true)
    const gif = new Blob(['GIF89a'], { type: 'image/gif' })
    expect((await fails(api.uploadImage('avatar', gif))).status).toBe(415)
    const big = new Blob([new Uint8Array(1_000_001)], { type: 'image/png' })
    const e = await fails(api.uploadImage('avatar', big))
    expect([e.status, e.message]).toEqual([413, 'Avatars can be up to 1 MB.'])
    const lie = new Blob(['not an image at all'], { type: 'image/png' })
    expect((await fails(api.uploadImage('banner', lie))).status).toBe(415)
    const ok = await api.uploadImage('avatar', new Blob([PNG], { type: 'image/png' }))
    expect(ok.avatar_url).toBeTruthy()
    await api.deleteImage('avatar')
    expect((await api.brand()).avatar_url).toBeNull()
  })

  it('counts tips in the goal currency and takes refunds off', async () => {
    const { c, api } = setup(true)
    await c.deleteTips()
    expect((await fails(api.saveGoal({ title: 'Mic', target: 100_000, currency: 'INR' }))).code).toBe('no_tip_page')
    await c.saveTips({ handle: 'novademo', display_name: 'Nova', message: '', razorpay: null, kofi: null, stripe: null })
    expect((await fails(api.goal())).status).toBe(404)
    const g = await api.saveGoal({ title: 'Mic', target: 100_000, currency: 'inr' })
    expect([g.currency, g.raised]).toEqual(['INR', 0])
    expect(g.page_url).toMatch(/\/novademo\/goal$/)
    const tip = (id: string, minor: number, currency: string): FerroEvent =>
      ({
        id,
        seq: 1,
        platform: 'tips',
        channel: null,
        source_id: id,
        occurred_at: 0,
        received_at: 0,
        origin: 'live',
        kind: {
          type: 'tip',
          actor: { platform: 'tips', id: 'a', login: null, display_name: 'A', color: null, roles: [], avatar_url: null },
          money: { minor, currency },
          message: null,
          provider: 'razorpay',
          payment_ref: id,
          status: 'captured',
        },
      }) as unknown as FerroEvent
    const feature = (engine as unknown as { tipBrand: { onEvent(e: FerroEvent): void } }).tipBrand
    feature.onEvent(tip('rzp:1', 50_000, 'INR'))
    feature.onEvent(tip('rzp:2', 900, 'USD'))
    expect((await api.goal()).raised).toBe(50_000)
    feature.onEvent({
      ...tip('x', 0, 'INR'),
      kind: { type: 'reversal', original_source_id: 'rzp:1', reason: 'refund' },
    } as FerroEvent)
    expect((await api.goal()).raised).toBe(0)
    await api.deleteGoal()
    expect((await fails(api.goal())).status).toBe(404)
  })
})
