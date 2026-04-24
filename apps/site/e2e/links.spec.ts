import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { builtHtmlFiles, sitemapPaths } from './pages'

test('every internal link and asset resolves', async ({ request }) => {
  const targets = new Set<string>()
  for (const file of builtHtmlFiles()) {
    const html = readFileSync(file, 'utf8')
    for (const m of html.matchAll(/\s(?:href|src|poster|srcset)="([^"]+)"/g)) {
      const raw = m[1] ?? ''
      if (/^(https?:|mailto:|tel:|data:|#)/.test(raw)) continue
      targets.add(raw.split('#')[0]?.split(' ')[0] ?? raw)
    }
  }
  expect(targets.size).toBeGreaterThan(20)
  const broken: string[] = []
  for (const t of targets) {
    if (!t) continue
    const res = await request.get(t)
    if (res.status() !== 200) broken.push(`${t} → ${res.status()}`)
  }
  expect(broken).toEqual([])
})

test('internal page links use trailing slashes', () => {
  const bad: string[] = []
  for (const file of builtHtmlFiles()) {
    const html = readFileSync(file, 'utf8')
    for (const m of html.matchAll(/<a[^>]+href="(\/[^"#?]*)"/g)) {
      const href = m[1] ?? ''
      if (!href.endsWith('/') && !/\.[a-z0-9]+$/i.test(href)) bad.push(`${file}: ${href}`)
    }
  }
  expect(bad).toEqual([])
})

test('no em dash or en dash anywhere in the built text', () => {
  const hits: string[] = []
  for (const file of builtHtmlFiles()) {
    const text = readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
    if (/[–—]/.test(text)) hits.push(file)
  }
  expect(hits).toEqual([])
})

test('no third-party requests: everything is self-hosted', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.hostname !== 'localhost') external.push(r.url())
  })
  for (const p of sitemapPaths().slice(0, 6)) await page.goto(p, { waitUntil: 'networkidle' })
  expect(external).toEqual([])
})
