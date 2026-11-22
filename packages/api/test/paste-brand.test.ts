import { describe, expect, it } from 'vitest'
import { goliveApi, urlAfterBrand } from '../src/golive'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'

const FACEBOOK = 'rtmps://live-api-s.facebook.com:443/rtmp/'

describe('urlAfterBrand', () => {
  it('fills an empty server with the brand’s own, and clears it when the brand changes again', () => {
    expect(urlAfterBrand('', null, 'facebook')).toBe(FACEBOOK)
    // Instagram, X and "other" have no preset: the Facebook server must not stay under them.
    expect(urlAfterBrand(FACEBOOK, 'facebook', 'instagram')).toBe('')
    expect(urlAfterBrand(FACEBOOK, 'facebook', 'x')).toBe('')
    expect(urlAfterBrand(FACEBOOK, 'facebook', null)).toBe('')
  })

  it('never touches an address the person typed or pasted', () => {
    const mine = 'rtmps://my.own/server/'
    expect(urlAfterBrand(mine, 'facebook', 'instagram')).toBe(mine)
    expect(urlAfterBrand(mine, null, 'facebook')).toBe(mine)
    // Facebook's server with something added after it is theirs too.
    expect(urlAfterBrand(`${FACEBOOK}extra`, 'facebook', 'instagram')).toBe(`${FACEBOOK}extra`)
  })
})

describe('a branded server in the view', () => {
  it('carries its brand, and a plain one has none', async () => {
    const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const api = goliveApi(client)
    await api.addCustom('My Facebook', FACEBOOK, 'key-1', 'main', 'facebook')
    await api.addCustom('Plain', 'rtmp://backup.local/live', 'key-2')
    const rows = (await api.view()).destinations
    expect(rows.find((d) => d.name === 'My Facebook')?.brand).toBe('facebook')
    expect(rows.find((d) => d.name === 'Plain')?.brand).toBeUndefined()
  })
})
