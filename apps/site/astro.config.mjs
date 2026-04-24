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
      filter: (page) => !page.includes('/og/') && !page.endsWith('/404/'),
    }),
  ],
  server: { port: 5300 },
  preview: { port: 5301 },
  vite: { build: { assetsInlineLimit: 2048 } },
})
