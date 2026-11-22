import { describe, expect, it } from 'vitest'
import {
  FerroClient,
  parseFerrocastStoreLink,
  storeApi,
  type AlertRule,
  type ApiError,
  type Variation,
} from '../src'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

// What a Store action changes is what it puts back: install, uninstall and undo touch only what
// the Store itself changed, and an undo is the latest one or nothing (the engine's rules,
// `crates/engine/src/store_catalog.rs`).

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

type Client = ReturnType<typeof setup>['client']

const followRule = async (client: Client): Promise<AlertRule> => {
  const r = (await client.alertRules()).find((x) => x.kinds.includes('follow'))
  if (!r) throw new Error('no follow rule')
  return r
}

const defaultOf = (r: AlertRule): Variation | undefined =>
  r.variations.find((v) => v.condition === null)

/** The person's own follow look, saved before a pack comes. */
async function myOwnLook(client: Client): Promise<Variation> {
  const rule = await followRule(client)
  const look = defaultOf(rule)
  if (!look) throw new Error('no default look')
  look.title = '{name} joined MY crew!'
  look.volume = 33
  await client.saveAlertRule(rule)
  return structuredClone(look)
}

const fails = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected an error')
}

describe('removing and undoing', () => {
  it('gives the user their own default look back when an alert pack is removed', async () => {
    const { store, client } = setup()
    const mine = await myOwnLook(client)
    await store.install('arcade-ticker-alert')
    const during = await followRule(client)
    expect(defaultOf(during)?.id.startsWith('store:arcade-ticker-alert:')).toBe(true)
    // Another action comes after: the undo of this install is no longer the latest, yet the
    // look is still kept with the install.
    await store.install('foundry-goal-widget')
    await store.uninstall('arcade-ticker-alert')
    const back = defaultOf(await followRule(client))
    expect(back).toEqual(mine)
  })

  it('keeps the displaced look across an update of the pack', async () => {
    const { demo, store, client } = setup()
    const mine = await myOwnLook(client)
    await store.install('arcade-ticker-alert')
    demo.bumpStoreItemVersion('arcade-ticker-alert', '1.9.0')
    await store.update('arcade-ticker-alert')
    await store.uninstall('arcade-ticker-alert')
    expect(defaultOf(await followRule(client))).toEqual(mine)
  })

  it('undoes only the Store change to an alert rule: a later edit stays', async () => {
    const { store, client } = setup()
    const mine = await myOwnLook(client)
    const inst = await store.install('arcade-ticker-alert')
    const rule = await followRule(client)
    const extra: Variation = {
      ...structuredClone(rule.variations.find((v) => v.condition !== null) ?? rule.variations[0]!),
      id: 'my-big-follow',
      name: 'Mine',
      condition: { type: 'tier_at_least', tier: 2 },
    } as Variation
    rule.variations.push(extra)
    rule.name = 'My follows'
    await client.saveAlertRule(rule)
    await store.undo(inst.undo.token)
    const after = await followRule(client)
    expect(after.name).toBe('My follows')
    expect(after.variations.some((v) => v.id === 'my-big-follow')).toBe(true)
    expect(after.variations.some((v) => v.id.startsWith('store:'))).toBe(false)
    expect(defaultOf(after)).toEqual(mine)
  })

  it('refuses an alert pack that has no rule to go into, and records nothing', async () => {
    const { store, client } = setup()
    for (const r of await client.alertRules()) {
      if (r.kinds.includes('follow') || r.kinds.includes('subscription'))
        await client.deleteAlertRule(r.id)
    }
    const err = await fails(store.install('arcade-ticker-alert'))
    expect(err).toMatchObject({ status: 422, code: 'store_alert_no_target' })
    expect((await store.installed()).installed).toEqual([])
    expect((await store.installed()).last_undo).toBeNull()
  })

  it('leaves a later alert pick alone, and puts back one the Store cleared only if none was picked since', async () => {
    const { store, client } = setup()
    const aurora = await store.install('aurora-pulse')
    const companion = aurora.designs.find((d) => d.kind === 'alert')
    if (!companion) throw new Error('aurora has an alert design')
    await client.setActiveAlertDesign(companion.id)
    // An install that doesn't touch the alert pick: a later pick (here, none) is not "restored".
    const slate = await store.install('intermission-slate')
    await client.setActiveAlertDesign(null)
    await store.undo(slate.undo.token)
    expect((await client.activeAlertDesign()).design_id).toBeNull()
    // Removing aurora clears its active alert; undoing it brings it back when nothing else is picked.
    const removed = await store.uninstall('aurora-pulse')
    expect((await client.activeAlertDesign()).design_id).toBeNull()
    await client.setActiveAlertDesign(companion.id).catch(() => undefined)
    await store.undo(removed.undo.token)
    expect((await client.designs()).some((d) => d.id === companion.id)).toBe(true)
  })

  it('keeps the installed design ids through an update, and the active alert with them', async () => {
    const { demo, store, client } = setup()
    const first = await store.install('aurora-pulse')
    const ids = first.designs.map((d) => d.id).sort()
    const companion = first.designs.find((d) => d.kind === 'alert')
    if (!companion) throw new Error('aurora has an alert design')
    await client.setActiveAlertDesign(companion.id)
    demo.bumpStoreItemVersion('aurora-pulse', '1.9.0')
    const updated = await store.update('aurora-pulse')
    expect(updated.designs.map((d) => d.id).sort()).toEqual(ids)
    expect(updated.installed?.design_ids.slice().sort()).toEqual(ids)
    expect((await client.activeAlertDesign()).design_id).toBe(companion.id)
    expect((await client.designs()).filter((d) => ids.includes(d.id)).length).toBe(ids.length)
    // And undoing the update puts the old version's designs back under the same ids.
    await store.undo(updated.undo.token)
    expect((await client.designs()).filter((d) => ids.includes(d.id)).length).toBe(ids.length)
  })

  it('never replaces a plugin the user already has', async () => {
    const { demo, store } = setup()
    demo.plugins.upsert({
      id: 'com.velaforge.softdimmer',
      name: 'My own dimmer',
      version: '0.1.0',
      author: 'me',
      description: 'mine',
      kind: 'effect',
      actions: [],
      on: true,
      problem: null,
    })
    const err = await fails(store.install('soft-dimmer-shader'))
    expect(err).toMatchObject({ status: 409, code: 'store_plugin_exists' })
    expect(demo.plugins.all().find((p) => p.id === 'com.velaforge.softdimmer')?.name).toBe(
      'My own dimmer',
    )
    expect((await store.installed()).installed).toEqual([])
  })

  it('keeps the widget design through a catalog failure, and removes and restores it', async () => {
    const { demo, store, client } = setup()
    const inst = await store.install('foundry-goal-widget')
    const id = inst.designs[0]?.id
    if (!id) throw new Error('a widget design')
    const has = async () => (await client.designs()).some((d) => d.id === id)
    expect(await has()).toBe(true)
    demo.setStoreFault('bad_signature')
    await expect(store.catalog(true)).rejects.toMatchObject({ code: 'store_bad_signature' })
    expect(await has(), 'still there while the catalog fails').toBe(true)
    const removed = await store.uninstall('foundry-goal-widget')
    expect(await has(), 'gone after uninstall').toBe(false)
    await store.undo(removed.undo.token)
    expect(await has(), 'back after undo').toBe(true)
  })
})

describe('undo tokens', () => {
  it('are the latest or refused, and never the latest by default', async () => {
    const { store, client } = setup()
    expect(await fails(store.undo())).toMatchObject({ status: 404, code: 'store_nothing_to_undo' })
    const first = await store.install('aurora-pulse')
    const second = await store.install('foundry-goal-widget')
    const count = async () => (await store.installed()).installed.length
    // Empty, blank, null, not text: refused, nothing undone.
    for (const token of ['', '   ', null, 7, ['x']]) {
      const err = await fails(client.request('POST', '/api/v1/store/undo', { token }))
      expect(err, JSON.stringify(token)).toMatchObject({
        status: 400,
        code: 'store_undo_bad_token',
      })
      expect(await count()).toBe(2)
    }
    expect(await fails(store.undo(''))).toMatchObject({ status: 400, code: 'store_undo_bad_token' })
    expect(await fails(store.undo('nope'))).toMatchObject({
      status: 404,
      code: 'store_undo_unknown',
    })
    expect(await fails(store.undo(first.undo.token))).toMatchObject({
      status: 409,
      code: 'store_undo_out_of_order',
    })
    expect(await count()).toBe(2)
    await store.undo(second.undo.token)
    expect(await count()).toBe(1)
    // Leaving the token out is the way to ask for the latest.
    expect((await store.undo()).item_id).toBe('aurora-pulse')
    expect(await count()).toBe(0)
  })

  it('does not undo an older install under an update of the same item', async () => {
    const { demo, store } = setup()
    const install = await store.install('intermission-slate')
    demo.bumpStoreItemVersion('intermission-slate', '1.2.0')
    const update = await store.update('intermission-slate')
    expect(await fails(store.undo(install.undo.token))).toMatchObject({
      code: 'store_undo_out_of_order',
    })
    expect((await store.installed()).installed[0]?.version).toBe('1.2.0')
    await store.undo(update.undo.token)
    expect((await store.installed()).installed[0]?.version).toBe('1.1.0')
  })

  it('an empty token from the client is sent as one, not as "the latest"', async () => {
    const seen: unknown[] = []
    const client = {
      request: async (_m: string, _p: string, body: unknown) => {
        seen.push(body)
        return {}
      },
    } as never
    await storeApi(client).undo('')
    await storeApi(client).undo()
    await storeApi(client).undo('su_abc')
    expect(seen).toEqual([{ token: '' }, {}, { token: 'su_abc' }])
  })
})

describe('the demo store as the engine serves it', () => {
  it('has a picture for a listed asset only', async () => {
    const { demo } = setup()
    const get = (p: string) =>
      demo.fetch(`${demo.base}/api/v1/store/assets/${p}`, {
        headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
      })
    expect((await get('aurora-pulse/preview.png')).status).toBe(200)
    expect((await get('aurora-pulse/other.png')).status).toBe(404)
    expect((await get('no-such-item/preview.png')).status).toBe(404)
    // An item with no assets has none to show.
    expect((await get('foundry-goal-widget/preview.png')).status).toBe(404)
  })

  it('reads a ferrocast link by its raw path: an encoded dot is not an innocent dot', () => {
    for (const bad of [
      'ferrocast://store/install/%2e/aurora-pulse',
      'ferrocast://store/install/%2E/aurora-pulse',
      'ferrocast://store/install/./aurora-pulse',
      'ferrocast://store/install/.%2e/aurora-pulse',
      'ferrocast://store/install//aurora-pulse',
      'ferrocast://store/item/%2e/aurora-pulse',
      'ferrocast://install/%2e/aurora-pulse',
    ]) {
      expect(parseFerrocastStoreLink(bad), bad).toBeNull()
    }
    for (const good of [
      'ferrocast://store/install/aurora-pulse',
      'ferrocast://store/install/aurora-pulse/',
      'ferrocast://install/aurora-pulse',
      'ferrocast://store/item/aurora-pulse?v=1.0.0',
    ]) {
      expect(parseFerrocastStoreLink(good), good).not.toBeNull()
    }
  })

  it('says what will be checked, not that it was', async () => {
    const { store } = setup()
    const preview = await store.resolveLink('ferrocast://store/install/arcade-ticker-alert')
    const notes = preview.safety_notes.join(' | ')
    expect(notes).toContain('when you install')
    expect(notes).not.toMatch(/verified by|p2e|Sandboxed plugin verified/)
  })
})
