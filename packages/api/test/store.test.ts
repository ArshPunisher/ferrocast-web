import { describe, expect, it } from 'vitest'
import {
  FerroClient,
  parseFerrocastStoreLink,
  safeCreatorLinkUrl,
  storeApi,
  type ApiError,
} from '../src'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

function setup() {
  const demo = new DemoEngine({ latencyMs: 0, autoplay: false })
  const client = new FerroClient({
    base: demo.base,
    token: DEMO_TOKEN,
    fetch: demo.fetch,
    sleep: async () => {},
  })
  return { demo, client, store: storeApi(client) }
}

describe('Community Store client & demo engine (R37)', () => {
  it('validates ferrocast:// install links and safe creator URLs strictly', () => {
    expect(parseFerrocastStoreLink('ferrocast://store/install/aurora-pulse')).toEqual({
      action: 'install',
      id: 'aurora-pulse',
      version: null,
    })
    expect(parseFerrocastStoreLink('ferrocast://install/foundry-goal-widget?v=1.0.0')).toEqual({
      action: 'install',
      id: 'foundry-goal-widget',
      version: '1.0.0',
    })
    expect(parseFerrocastStoreLink('ferrocast://store/item/intermission-slate')).toEqual({
      action: 'view',
      id: 'intermission-slate',
      version: null,
    })
    for (const bad of [
      'https://evil.com/store/install/aurora-pulse',
      'ferrocast://evil.com/install/aurora-pulse',
      'ferrocast://store/install/../secrets',
      'ferrocast://store/install/bad%2fid',
      'ferrocast://store/install/aurora-pulse?evil=1',
      'ferrocast://store/install/Bad!Id',
    ]) {
      expect(parseFerrocastStoreLink(bad), bad).toBeNull()
    }

    expect(safeCreatorLinkUrl('https://github.com/ArshPunisher')).toBe(
      'https://github.com/ArshPunisher',
    )
    for (const badUrl of [
      'javascript:alert(1)',
      'http://example.com',
      'https://127.0.0.1:47820/secret',
      'https://192.168.1.1/admin',
      'https://user:pass@github.com',
    ]) {
      expect(safeCreatorLinkUrl(badUrl), badUrl).toBeNull()
    }
  })

  it('installs, updates, uninstalls, undoes in one click, and resolves ferrocast:// without auto-installing', async () => {
    const { demo, store, client } = setup()
    const cat = await store.catalog()
    expect(cat.items.length).toBeGreaterThanOrEqual(5)
    expect(cat.creators.length).toBe(3)

    // Resolving a link always asks confirmation and never installs.
    const countBefore = (await store.installed()).installed.length
    const preview = await store.resolveLink('ferrocast://store/install/aurora-pulse')
    expect(preview.requires_confirmation).toBe(true)
    expect(preview.item.id).toBe('aurora-pulse')
    expect((await store.installed()).installed.length).toBe(countBefore)

    // Install theme -> adds designs; Undo -> removes them cleanly.
    const inst = await store.install('aurora-pulse')
    expect(inst.designs.length).toBe(2)
    expect((await client.designs()).some((d) => d.name === 'Aurora Pulse')).toBe(true)
    const undone = await store.undo(inst.undo.token)
    expect(undone.reverted_action).toBe('install')
    expect((await client.designs()).some((d) => d.name === 'Aurora Pulse')).toBe(false)

    // Install custom sandboxed p2e alert -> adds custom variation on follow rule.
    const alertInst = await store.install('arcade-ticker-alert')
    expect(alertInst.installed?.rule_ids.length).toBe(1)
    const follow = (await client.alertRules()).find((r) => r.kinds.includes('follow'))
    expect(
      follow?.variations.some(
        (v) => v.id.startsWith('store:arcade-ticker-alert:') && v.custom_enabled,
      ),
    ).toBe(true)

    // Install overlay, bump catalog version to 1.2.0, update, then Undo update -> back to 1.1.0.
    await store.install('intermission-slate')
    demo.bumpStoreItemVersion('intermission-slate', '1.2.0')
    const bumpedCat = await store.catalog(true)
    expect(bumpedCat.items.find((i) => i.id === 'intermission-slate')?.update_available).toBe(true)
    const upd = await store.update('intermission-slate')
    expect(upd.installed?.version).toBe('1.2.0')
    await store.undo(upd.undo.token)
    const afterUndo = await store.installed()
    expect(afterUndo.installed.find((i) => i.item_id === 'intermission-slate')?.version).toBe(
      '1.1.0',
    )
  })

  it('keeps installed items working and uninstallable even when catalog verification fails', async () => {
    const { demo, store } = setup()
    await store.install('foundry-goal-widget')
    demo.setStoreFault('bad_signature')
    await expect(store.catalog(true)).rejects.toMatchObject({
      status: 502,
      code: 'store_bad_signature',
    } satisfies Partial<ApiError>)
    demo.setStoreFault('oversized')
    await expect(store.catalog(true)).rejects.toMatchObject({
      status: 413,
      code: 'store_catalog_too_large',
    })

    const stillInstalled = await store.installed()
    expect(stillInstalled.installed.some((i) => i.item_id === 'foundry-goal-widget')).toBe(true)
    const removed = await store.uninstall('foundry-goal-widget')
    expect(removed.action).toBe('uninstall')
    await store.undo(removed.undo.token)
    expect(
      (await store.installed()).installed.some((i) => i.item_id === 'foundry-goal-widget'),
    ).toBe(true)
  })
})
