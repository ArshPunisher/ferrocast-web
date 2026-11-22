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
})
