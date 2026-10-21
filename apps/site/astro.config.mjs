import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { UNCONFIRMED } from './src/data/company.ts'

// Lists every company fact the owner still has to confirm, at the end of each build.
const unconfirmedWarning = {
  name: 'ferrocast:unconfirmed-company-facts',
  hooks: {
    'astro:build:done': ({ logger }) => {
      if (UNCONFIRMED.size === 0) return
      logger.warn(
        `${UNCONFIRMED.size} company facts are not confirmed yet (src/data/company.ts): ` +
          `${[...UNCONFIRMED].join(', ')}. They stay out of JSON-LD; confirm them before launch.`,
      )
    },
  },
}

// lastmod for the sitemap: the last commit that touched the page's own file or the data it
// renders (titles and descriptions, structured data, feature and FAQ copy, legal facts), so
// search engines see a page change only when it really changed. The build time when git
// can't say (no history, or one of those files has uncommitted changes).
const buildTime = new Date().toISOString()
const root = fileURLToPath(new URL('.', import.meta.url))
const DATA = {
  '': ['src/data/schema.ts'],
  '/features': ['src/data/features.ts'],
  '/faq': ['src/data/faq.ts'],
  '/compare': ['src/data/compare.ts'],
  '/pricing': ['src/data/company.ts'],
  '/terms': ['src/data/company.ts'],
  '/privacy': ['src/data/company.ts'],
  '/refunds': ['src/data/company.ts'],
  '/contact': ['src/data/company.ts'],
}
function lastmod(url) {
  const path = new URL(url).pathname.replace(/\/$/, '')
  const page = [`src/pages${path}/index.astro`, `src/pages${path}.astro`].find((f) =>
    existsSync(root + f),
  )
  if (!page) return buildTime
  const section = Object.keys(DATA).find((k) => k && path.startsWith(k)) ?? (path ? null : '')
  const files = [page, 'src/data/pages.ts', ...(section !== null ? DATA[section] : [])].filter(
    (f) => existsSync(root + f),
  )
  try {
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    const date = git('log', '-1', '--format=%cI', '--', ...files)
    if (date && !git('status', '--porcelain', '--', ...files)) return new Date(date).toISOString()
  } catch {
    // No git here: fall through.
  }
  return buildTime
}

// Static site for ferrocast.clearcraftlabs.com. Directory-style URLs with trailing slashes
// so every canonical URL ends in "/".
export default defineConfig({
  site: 'https://ferrocast.clearcraftlabs.com',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  integrations: [
    unconfirmedWarning,
    sitemap({
      // Thank-you pages are a step after a download, not pages to find.
      filter: (page) =>
        !page.includes('/og/') && !page.endsWith('/404/') && !page.includes('/download/thanks/'),
      serialize: (item) => ({ ...item, lastmod: lastmod(item.url) }),
    }),
  ],
  server: { port: 5300 },
  preview: { port: 5301 },
  vite: { build: { assetsInlineLimit: 2048 } },
})
