import { describe, expect, it } from 'vitest'
import { ApiError, FerroClient, catalogNotPublished, storeApi } from '../src'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

const unreachable = (message: string) =>
  new ApiError(502, 'store_unreachable', message, 'Check the internet and try again.')

describe('a catalog that is not published', () => {
  it('is told apart from a catalog that cannot be reached', () => {
    // What the engine says when the catalog address answers 404 (or 410): nothing is there.
    expect(
      catalogNotPublished(unreachable('The catalog server didn’t answer: it said 404 Not Found')),
    ).toBe(true)
    expect(
      catalogNotPublished(unreachable('The catalog server didn’t answer: it said 410 Gone')),
    ).toBe(true)
    // A real outage, a refusal, a timeout: the internet may well be the problem.
    expect(
      catalogNotPublished(
        unreachable('The catalog server didn’t answer: it said 500 Internal Server Error'),
      ),
    ).toBe(false)
    expect(
      catalogNotPublished(unreachable('The catalog server didn’t answer: connection refused')),
    ).toBe(false)
    expect(
      catalogNotPublished(
        unreachable('The catalog server didn’t answer: it said 503 Service Unavailable'),
      ),
    ).toBe(false)
    // Only the unreachable answer can mean it; a 404 of another kind is something else.
    expect(catalogNotPublished(new ApiError(404, 'store_item_not_found', 'No such item 404'))).toBe(
      false,
    )
    expect(catalogNotPublished(new Error('404'))).toBe(false)
    expect(catalogNotPublished(null)).toBe(false)
  })

  it('shows up in the demo as the engine says it', async () => {
    const demo = new DemoEngine({ latencyMs: 0, autoplay: false })
    const store = storeApi(
      new FerroClient({
        base: demo.base,
        token: DEMO_TOKEN,
        fetch: demo.fetch,
        sleep: async () => {},
      }),
    )
    demo.setStoreFault('not_published')
    const err = await store.catalog(true).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 502, code: 'store_unreachable' })
    expect(catalogNotPublished(err)).toBe(true)
    // Installed items still list while it is gone.
    expect((await store.installed()).installed).toEqual([])
  })
})
