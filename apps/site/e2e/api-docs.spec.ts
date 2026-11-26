import { expect, test } from '@playwright/test'
import { sitemapPaths } from './pages'

test('API reference renders OpenAPI 3.1 + AsyncAPI 3.0 specs, filters cleanly, and exposes spec JSON', async ({
  page,
  request,
}) => {
  expect(sitemapPaths()).toContain('/docs/api/')

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/docs/api/')

  await expect(page.getByRole('heading', { level: 1, name: /local rest/i })).toBeVisible()
  await expect(page.locator('.spec-bar')).toContainText('OpenAPI 3.1.0')
  await expect(page.locator('.spec-bar')).toContainText('AsyncAPI 3.0.0')

  const total = await page.locator('[data-op]').count()
  expect(total).toBeGreaterThan(100)

  // Search narrows endpoint cards dynamically.
  await page.locator('#api-search').fill('/obs/scene')
  await expect(page.locator('[data-filter-count]')).not.toContainText(`Showing ${total} of`)
  const firstVisible = page.locator('[data-op]:not([hidden])').first()
  await expect(firstVisible).toContainText('/api/v1/obs/scene')
  await firstVisible.locator('summary').click()
  await expect(firstVisible.locator('.op-body')).toBeVisible()

  // Clear search and test scope filter pill.
  await page.locator('#api-search').fill('')
  await page.getByRole('button', { name: 'PC only', exact: true }).click()
  await expect(page.locator('[data-op]:not([hidden])').first()).toContainText('PC only')

  // Verify downloadable OpenAPI / AsyncAPI assets.
  const oaResp = await request.get('/specs/openapi.json')
  expect(oaResp.ok()).toBe(true)
  const oaJson = (await oaResp.json()) as {
    openapi: string
    paths: Record<string, unknown>
    components: {
      schemas: {
        CreatorLinks: { properties: { custom: { type: unknown } } }
        LinksResponse: { properties: { custom: { type: unknown } } }
      }
    }
  }
  expect(oaJson.openapi).toBe('3.1.0')
  expect(oaJson.paths['/api/v1/api-keys']).toBeTruthy()
  expect(oaJson.components.schemas.CreatorLinks.properties.custom.type).toEqual(['array', 'null'])
  expect(oaJson.components.schemas.LinksResponse.properties.custom.type).toBe('array')

  const aaResp = await request.get('/specs/asyncapi.json')
  expect(aaResp.ok()).toBe(true)
  const aaJson = (await aaResp.json()) as { asyncapi: string; channels: Record<string, unknown> }
  expect(aaJson.asyncapi).toBe('3.0.0')
  expect(aaJson.channels.live).toBeTruthy()

  // Mobile 375px overflow check.
  await page.setViewportSize({ width: 375, height: 812 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
})

test('the category filter lists every tag in the spec and the Node quickstart calls a real route', async ({
  page,
  request,
}) => {
  const spec = (await (await request.get('/specs/openapi.json')).json()) as {
    paths: Record<string, Record<string, { tags?: string[] }>>
  }
  const tags = new Set<string>()
  for (const ops of Object.values(spec.paths))
    for (const op of Object.values(ops)) if (op.tags?.[0]) tags.add(op.tags[0])
  await page.goto('/docs/api/')
  const options = await page.locator('#api-tag option').allTextContents()
  for (const tag of tags) {
    expect(
      options.some((o) => o.trim().startsWith(tag)),
      `the category filter is missing ${tag}`,
    ).toBe(true)
  }
  // The quickstart's route is in the spec (it used to point at a route that returns 404).
  expect(spec.paths['/api/v1/counters/{name}/change']).toBeTruthy()
  await expect(page.locator('body')).toContainText('/api/v1/counters/follows/change')
})
