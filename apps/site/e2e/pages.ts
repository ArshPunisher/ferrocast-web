// The list of pages comes from the built sitemap, so a new page is tested automatically.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const ORIGIN = 'https://ferrocast.clearcraftlabs.com'
const dist = join(process.cwd(), 'dist')

export function sitemapPaths(): string[] {
  const files = readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f))
  const urls = files.flatMap((f) =>
    [...readFileSync(join(dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1] ?? '',
    ),
  )
  return urls.map((u) => new URL(u).pathname).sort()
}

export function builtHtmlFiles(dir = dist): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...builtHtmlFiles(p))
    else if (e.name.endsWith('.html')) out.push(p)
  }
  return out
}
