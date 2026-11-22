import { describe, expect, it } from 'vitest'
import { FerroClient, storeApi } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { filterInstalled, latestOnly, withInstalled } from './store-state'

async function setup() {
  const demo = new DemoEngine({ latencyMs: 0, autoplay: false })
  const client = new FerroClient({
    base: demo.base,
    token: DEMO_TOKEN,
    fetch: demo.fetch,
    sleep: async () => {},
  })
  return { demo, store: storeApi(client) }
}

describe('latestOnly', () => {
  it('lets only the newest request act, and none after an invalidate', () => {
    const l = latestOnly()
    const a = l.next()
    const b = l.next()
    expect(l.isCurrent(a)).toBe(false)
    expect(l.isCurrent(b)).toBe(true)
    l.invalidate()
    expect(l.isCurrent(b)).toBe(false)
    expect(l.isCurrent(l.next())).toBe(true)
  })
})

describe('withInstalled', () => {
  it('takes the installed flags from the installed list, keeping the catalog', async () => {
    const { store } = await setup()
    await store.install('aurora-pulse')
    const cat = await store.catalog()
    expect(cat.items.find((i) => i.id === 'aurora-pulse')?.installed_version).not.toBeNull()
    await store.uninstall('aurora-pulse')
    const inst = await store.installed()
    const next = withInstalled(cat, inst.installed, inst.last_undo)
    expect(next.items.find((i) => i.id === 'aurora-pulse')?.installed_version).toBeNull()
    expect(next.items.find((i) => i.id === 'aurora-pulse')?.update_available).toBe(false)
    expect(next.items.length).toBe(cat.items.length)
    expect(next.last_undo).toEqual(inst.last_undo)
    expect(next.installed).toEqual([])
  })
})

describe('filterInstalled', () => {
  it('matches title, creator, kind and id, case-blind; empty search keeps all', async () => {
    const { store } = await setup()
    await store.install('aurora-pulse')
    await store.install('foundry-goal-widget')
    const rows = (await store.installed()).installed
    expect(filterInstalled(rows, '  ').length).toBe(2)
    expect(filterInstalled(rows, 'AURORA').map((r) => r.item_id)).toEqual(['aurora-pulse'])
    expect(filterInstalled(rows, 'goal').map((r) => r.item_id)).toEqual(['foundry-goal-widget'])
    expect(filterInstalled(rows, 'nothing-like-this')).toEqual([])
  })
})
