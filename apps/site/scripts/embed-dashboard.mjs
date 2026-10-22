// Puts the web dashboard at /app on the website (one Cloudflare Pages project, plan §9).
// Runs after `astro build`: builds the dashboard if the root build hasn't, copies it into
// dist/app, and adds the config script that tells it where Ferrocast's server is (the API
// host, through the server's Cloudflare Tunnel). FC_API_ORIGIN overrides it for testing.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(site, '../..')
const built = join(root, 'dist/dashboard')
const out = join(site, 'dist/app')
const api = (process.env.FC_API_ORIGIN ?? 'https://api.clearcraftlabs.com').replace(/\/+$/, '')

if (!/^https:\/\/[a-z0-9.-]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) {
  throw new Error(`FC_API_ORIGIN must be an https origin, got "${api}"`)
}
if (!existsSync(join(built, 'index.html'))) {
  console.log('embed-dashboard: building the dashboard first')
  execSync('pnpm --filter @ferrocast/dashboard build', { cwd: root, stdio: 'inherit' })
}

rmSync(out, { recursive: true, force: true })
cpSync(built, out, { recursive: true })

// The same config the server used to add: the dashboard reads it before it starts.
const config = 'ferrocast-remote.js'
writeFileSync(
  join(out, config),
  `window.__FERROCAST__ = Object.freeze({ api: ${JSON.stringify(`${api}/r`)}, remote: true });\n`,
)
const index = join(out, 'index.html')
const html = readFileSync(index, 'utf8')
const tag = `<script src="/app/${config}"></script>`
const at = html.search(/<head[^>]*>/i)
if (at < 0) throw new Error('embed-dashboard: the dashboard has no <head>')
const end = html.indexOf('>', at) + 1
writeFileSync(index, html.slice(0, end) + tag + html.slice(end))
console.log(`embed-dashboard: /app ready, server ${api}`)
