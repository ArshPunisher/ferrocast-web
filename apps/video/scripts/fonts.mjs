// Copies the self-hosted variable fonts from @fontsource into public/fonts so Studio and
// the renderer load them with staticFile(): no font CDN, same files as the dashboard.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../../packages/ui/package.json'))
const out = join(here, '../public/fonts')
mkdirSync(out, { recursive: true })

const files = [
  ['@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2'],
  ['@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-ext-wght-normal.woff2'],
  ['@fontsource-variable/hanken-grotesk', 'hanken-grotesk-latin-wght-normal.woff2'],
  ['@fontsource-variable/hanken-grotesk', 'hanken-grotesk-latin-ext-wght-normal.woff2'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
]
for (const [pkg, file] of files) {
  const src = join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file)
  copyFileSync(src, join(out, file))
}
console.log(`fonts: copied ${files.length} files to public/fonts`)
