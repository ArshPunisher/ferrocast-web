import { afterEach, describe, expect, it } from 'vitest'
import { NO_PRO_FEATURES, proApi, proPanelState, rupeesFromPaise, type ProView } from '../src/pro'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'

describe('rupeesFromPaise', () => {
  it('shows whole rupees without paise', () => {
    expect(rupeesFromPaise(19900)).toBe('₹199')
    expect(rupeesFromPaise(199900)).toBe('₹1,999')
  })

  it('keeps paise when the price is not a whole rupee', () => {
    expect(rupeesFromPaise(19950)).toBe('₹199.50')
  })
})

const view = (over: Partial<ProView> = {}): ProView => ({
  active: false,
  pro: false,
  status: 'none',
  plan: null,
  subscription_id: null,
  current_end: null,
  access_until: null,
  cancel_at_period_end: false,
  refunded: false,
  installs: 0,
  sales_open: false,
  prices: null,
  checked_at: 0,
  stale: false,
  offline_grace_days: 7,
  launch_note: '',
  warning: null,
  features: { ...NO_PRO_FEATURES },
  quotas: {},
  ...over,
})

describe('proPanelState', () => {
  it('hides Pro panels while Pro is off sale and this install has none', () => {
    expect(proPanelState(view())).toBe('hidden')
    expect(proPanelState(null), 'still loading').toBe('hidden')
  })

  it('shows one calm line when Pro is on sale, the feature when Pro', () => {
    expect(proPanelState(view({ sales_open: true }))).toBe('locked')
    expect(proPanelState(view({ active: true }))).toBe('open')
    expect(proPanelState(view({ active: true, sales_open: true }))).toBe('open')
  })

  it('hides a feature this relay does not have, even for Pro', () => {
    const pro = view({ active: true })
    expect(proPanelState(pro, 'history')).toBe('hidden')
    const withHistory = view({ active: true, features: { ...NO_PRO_FEATURES, history: true } })
    expect(proPanelState(withHistory, 'history')).toBe('open')
    expect(proPanelState(withHistory, 'tts')).toBe('hidden')
  })

  it('uses active (offline grace included), not what the relay last said', () => {
    expect(proPanelState(view({ pro: true, active: false }))).toBe('hidden')
  })
})

describe('demo Pro', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const status = (e: DemoEngine) =>
    proApi(new FerroClient({ base: e.base, token: DEMO_TOKEN, fetch: e.fetch })).status()

  it('is honest by default: off sale, not Pro, no features, no quotas', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const p = await status(engine)
    expect(p.sales_open).toBe(false)
    expect(p.active).toBe(false)
    expect(p.features).toEqual(NO_PRO_FEATURES)
    expect(p.quotas).toEqual({})
  })

  it('can be put on sale, made active and given features for tests', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, pro: { salesOpen: true } })
    expect((await status(engine)).sales_open).toBe(true)
    engine.setPro({ active: true, features: true })
    const p = await status(engine)
    expect(p.active).toBe(true)
    expect(p.subscription_id).toBe('sub_DemoPro00001')
    expect(Object.values(p.features).every(Boolean)).toBe(true)
    engine.setPro({ active: false, features: false })
    const off = await status(engine)
    expect(off.active).toBe(false)
    expect(off.features).toEqual(NO_PRO_FEATURES)
  })
})
