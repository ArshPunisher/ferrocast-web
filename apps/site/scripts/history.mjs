// Cloudflare Pages builds from a shallow clone (one commit), so every page in the sitemap
// would get the newest commit's date as lastmod. Fetch the full history first so
// astro.config.mjs can date each page by its own last change. Never fails the build:
// without history the sitemap falls back to the newest commit.
import { execFileSync } from 'node:child_process'

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60_000,
  }).trim()

try {
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    git('fetch', '--unshallow', '--quiet')
    console.log('history: fetched the full git history for sitemap dates')
  }
} catch {
  console.log('history: could not fetch the full git history; sitemap dates use the newest commit')
}
