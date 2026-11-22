import { describe, expect, it } from 'vitest'
import { href, parseRoute } from './router'

describe('store routing', () => {
  it('parses and serializes store, item, creator, and ferrocast:// install links', () => {
    expect(parseRoute('#/store')).toEqual({ name: 'store' })
    expect(parseRoute('#/store/creator/mira-atelier')).toEqual({
      name: 'store',
      creator: 'mira-atelier',
    })
    expect(parseRoute('#/store/item/aurora-pulse')).toEqual({
      name: 'store',
      item: 'aurora-pulse',
    })
    const uri = 'ferrocast://store/install/aurora-pulse'
    const encoded = `#/store?link=${encodeURIComponent(uri)}`
    expect(parseRoute(encoded)).toEqual({ name: 'store', install: uri })
    expect(href({ name: 'store', install: uri })).toBe(encoded)
    expect(parseRoute('#/store?install=foundry-goal-widget')).toEqual({
      name: 'store',
      install: 'ferrocast://store/install/foundry-goal-widget',
    })
  })
})
