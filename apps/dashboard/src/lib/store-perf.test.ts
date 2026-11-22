import { beforeEach, describe, expect, it } from 'vitest'
import { FerroClient, storeApi } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { clearLocalPerfCache, measureItemLocally } from './store-perf'

describe('store-perf local benchmarking', () => {
  beforeEach(() => {
    clearLocalPerfCache()
  })

  it('measures catalog items locally, stays within 0..100, and cleans hidden benchmark DOM', async () => {
    const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
    const cat = await storeApi(client).catalog()

    for (const item of cat.items) {
      const report = measureItemLocally(item, true)
      expect(report.score).toBeGreaterThanOrEqual(15)
      expect(report.score).toBeLessThanOrEqual(100)
      expect(report.mountMs).toBeGreaterThanOrEqual(0)
      expect(report.nodeCount).toBeGreaterThanOrEqual(1)
      expect(['light', 'balanced', 'heavy']).toContain(report.tier)
      expect(document.querySelectorAll('[data-store-perf-host]').length).toBe(0)
    }
    demo.dispose()
  })

  it("never puts a custom alert's HTML or CSS into the dashboard document", async () => {
    const item = {
      id: 'evil',
      version: '1.0.0',
      kind: 'alert',
      package: { size: 1000 },
      preview: {
        layers_hint: 2,
        custom_alert: {
          html: '<div><svg><style><img src="https://attacker.example/beacon"></style></svg><p>hi</p></div>',
          css: '.a{filter:blur(2px)} @keyframes x{from{opacity:0}to{opacity:1}}',
        },
      },
    } as never
    const touched: string[] = []
    const real = Node.prototype.appendChild
    const realAppend = Element.prototype.append
    Node.prototype.appendChild = function <T extends Node>(this: Node, n: T): T {
      if (this === document.body || this === document.head)
        touched.push((n as unknown as Element).outerHTML ?? '')
      return real.call(this, n) as T
    }
    Element.prototype.append = function (this: Element, ...n: (Node | string)[]) {
      touched.push(...n.map((x) => (typeof x === 'string' ? x : ((x as Element).outerHTML ?? ''))))
      return realAppend.apply(this, n)
    }
    try {
      const report = measureItemLocally(item, true)
      expect(report.nodeCount).toBeGreaterThanOrEqual(3)
    } finally {
      Node.prototype.appendChild = real
      Element.prototype.append = realAppend
    }
    // Nothing of the alert (its img, its style, its text) was handed to the live document.
    expect(touched.join('')).not.toContain('attacker.example')
    expect(touched.join('')).not.toContain('@keyframes')
    expect(document.querySelector('img[src*="attacker"]')).toBeNull()
  })
})
