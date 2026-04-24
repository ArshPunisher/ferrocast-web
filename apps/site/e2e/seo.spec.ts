import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { COMPANY, UNCONFIRMED } from '../src/data/company'
import { ORIGIN, builtHtmlFiles, sitemapPaths } from './pages'

const paths = sitemapPaths()

test('the sitemap lists every page', () => {
  expect(paths).toEqual(
    expect.arrayContaining([
      '/',
      '/features/',
      '/features/alerts/',
      '/features/overlays/',
      '/features/chat-moderation/',
      '/features/bot/',
      '/features/tips/',
      '/features/own-your-data/',
      '/download/',
      '/pricing/',
      '/compare/',
      '/faq/',
      '/docs/getting-started/',
      '/terms/',
      '/privacy/',
      '/refunds/',
      '/contact/',
    ]),
  )
  expect(paths.some((p) => p.includes('404') || p.startsWith('/og/'))).toBe(false)
})

for (const path of paths) {
  test(`SEO tags on ${path}`, async ({ page, request }) => {
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    const title = await page.title()
    expect(title.length).toBeGreaterThan(10)
    expect(title.length).toBeLessThanOrEqual(60)

    const desc = await page.locator('meta[name="description"]').getAttribute('content')
    expect(desc?.length ?? 0).toBeGreaterThanOrEqual(120)
    expect(desc?.length ?? 0).toBeLessThanOrEqual(160)

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}${path}`)
    for (const prop of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'])
      expect(
        await page.locator(`meta[property="${prop}"]`).getAttribute('content'),
        prop,
      ).toBeTruthy()
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${ORIGIN}${path}`,
    )

    const og = (await page.locator('meta[property="og:image"]').getAttribute('content')) ?? ''
    expect(og.startsWith(`${ORIGIN}/og/`)).toBe(true)
    const img = await request.get(new URL(og).pathname)
    expect(img.status()).toBe(200)
    expect(img.headers()['content-type']).toContain('image/png')
    const body = await img.body()
    expect(body.readUInt32BE(16)).toBe(1200) // PNG IHDR width
    expect(body.readUInt32BE(20)).toBe(630)

    await expect(page.locator('h1')).toHaveCount(1)

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(blocks.length).toBeGreaterThan(0)
    const types: string[] = []
    for (const b of blocks) {
      const json = JSON.parse(b) as { '@context'?: string; '@type'?: string }
      expect(json['@context']).toBe('https://schema.org')
      expect(json['@type']).toBeTruthy()
      types.push(String(json['@type']))
    }
    if (path === '/')
      expect(types).toEqual(expect.arrayContaining(['SoftwareApplication', 'Organization']))
    else expect(types).toContain('BreadcrumbList')
    if (path === '/faq/') expect(types).toContain('FAQPage')
    if (path === '/docs/getting-started/') expect(types).toContain('HowTo')
  })
}

test('the FAQ JSON-LD matches the visible questions', async ({ page }) => {
  await page.goto('/faq/')
  const json = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
  ) as { mainEntity: { name: string }[] }
  const visible = await page.locator('summary h3').allTextContents()
  expect(json.mainEntity.map((q) => q.name)).toEqual(visible)
  expect(visible.length).toBeGreaterThanOrEqual(10)
})

test('the 404 page is not indexed and has no canonical', async ({ page }) => {
  const res = await page.goto('/this-does-not-exist/')
  expect(res?.status()).toBe(404)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
})

test('robots.txt and sitemap are valid', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('User-agent: *')
  expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap-index.xml`)
  const index = await (await request.get('/sitemap-index.xml')).text()
  expect(index).toContain('<sitemapindex')
  expect(index).toContain(`${ORIGIN}/sitemap-0.xml`)
  const map = await (await request.get('/sitemap-0.xml')).text()
  for (const loc of map.matchAll(/<loc>([^<]+)<\/loc>/g)) expect(loc[1]?.endsWith('/')).toBe(true)
  const manifest = await request.get('/site.webmanifest')
  expect(manifest.status()).toBe(200)
  expect((await manifest.json()).name).toBe('Ferrocast')
})

test('titles and descriptions are unique across the site', () => {
  const titles = new Map<string, string>()
  const descs = new Map<string, string>()
  for (const file of builtHtmlFiles()) {
    if (file.endsWith('404.html')) continue
    const html = readFileSync(file, 'utf8')
    const t = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? ''
    const d = /<meta name="description" content="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(titles.get(t), `title "${t}" in ${file} and ${titles.get(t)}`).toBeUndefined()
    expect(descs.get(d), `description in ${file} and ${descs.get(d)}`).toBeUndefined()
    titles.set(t, file)
    descs.set(d, file)
  }
  expect(titles.size).toBeGreaterThanOrEqual(17)
})

test('unconfirmed company facts never reach JSON-LD', () => {
  const values: string[] = []
  if (UNCONFIRMED.has('email')) values.push(COMPANY.email)
  if (UNCONFIRMED.has('billingEmail')) values.push(COMPANY.billingEmail)
  if (UNCONFIRMED.has('privacyEmail')) values.push(COMPANY.privacyEmail)
  if (UNCONFIRMED.has('phone')) values.push(COMPANY.phone, '"telephone"')
  if (UNCONFIRMED.has('legalName')) values.push('"legalName"')
  if (UNCONFIRMED.has('address')) values.push('PostalAddress')
  const leaks: string[] = []
  for (const file of builtHtmlFiles()) {
    const html = readFileSync(file, 'utf8')
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
      for (const v of values) if ((m[1] ?? '').includes(v)) leaks.push(`${file}: ${v}`)
  }
  expect(leaks).toEqual([])
})
