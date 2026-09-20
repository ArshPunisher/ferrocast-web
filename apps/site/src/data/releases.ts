// The newest Ferrocast beta, read from GitHub's public API when the site is built (no
// token, no client-side requests). Anything going wrong (no network, rate limit, no beta
// published yet) gives `null`, and the download page falls back to the releases page.
//
// Builds can skip the network with FERROCAST_RELEASES=off, or read a saved API answer
// with FERROCAST_RELEASES=<path to a JSON file> (tests).

import { readFile } from 'node:fs/promises'
import { COMPANY } from './company'

export type BetaOs = 'mac' | 'windows' | 'linux'

export interface BetaAsset {
  os: BetaOs
  label: string
  url: string
  /** Bytes. */
  size: number
}

export interface BetaRelease {
  tag: string
  version: string
  url: string
  publishedAt: string
  assets: BetaAsset[]
  checksums: string | null
}

const API = 'https://api.github.com/repos/ArshPunisher/ferrocast/releases?per_page=30'

type GhAsset = { name?: unknown; browser_download_url?: unknown; size?: unknown }
type GhRelease = {
  tag_name?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
  published_at?: unknown
  assets?: unknown
}

/** Which download each file is, by the names the Release workflow produces. */
const KINDS: { os: BetaOs; label: string; test: (n: string) => boolean }[] = [
  {
    os: 'mac',
    label: 'macOS (.dmg, Apple Silicon and Intel)',
    test: (n) => n.endsWith('_universal.dmg'),
  },
  { os: 'windows', label: 'Windows (installer, .exe)', test: (n) => n.endsWith('-setup.exe') },
  { os: 'linux', label: 'Linux (AppImage)', test: (n) => n.endsWith('.AppImage') },
  { os: 'linux', label: 'Linux (.deb)', test: (n) => n.endsWith('.deb') },
  { os: 'linux', label: 'Linux (.rpm)', test: (n) => n.endsWith('.rpm') },
]

const releaseDownload = (u: unknown): u is string =>
  typeof u === 'string' && u.startsWith(`${COMPANY.github}/releases/download/`)

/** The newest published prerelease in a GitHub API answer, or null. Exported for tests. */
export function pickBeta(data: unknown): BetaRelease | null {
  if (!Array.isArray(data)) return null
  const r = (data as GhRelease[]).find(
    (x) =>
      x &&
      x.prerelease === true &&
      x.draft !== true &&
      typeof x.tag_name === 'string' &&
      x.tag_name !== 'beta',
  )
  if (!r || typeof r.tag_name !== 'string') return null
  const files = Array.isArray(r.assets) ? (r.assets as GhAsset[]) : []
  const assets: BetaAsset[] = []
  for (const k of KINDS) {
    const f = files.find(
      (a) =>
        typeof a.name === 'string' && k.test(a.name) && releaseDownload(a.browser_download_url),
    )
    if (f)
      assets.push({
        os: k.os,
        label: k.label,
        url: f.browser_download_url as string,
        size: typeof f.size === 'number' ? f.size : 0,
      })
  }
  const sums = files.find(
    (a) => a.name === 'SHA256SUMS.txt' && releaseDownload(a.browser_download_url),
  )
  const html =
    typeof r.html_url === 'string' && r.html_url.startsWith(COMPANY.github) ? r.html_url : null
  return {
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/, ''),
    url: html ?? `${COMPANY.github}/releases/tag/${encodeURIComponent(r.tag_name)}`,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    assets,
    checksums: sums ? (sums.browser_download_url as string) : null,
  }
}

let cached: Promise<BetaRelease | null> | undefined

/** The newest beta, fetched once per build. */
export function latestBeta(): Promise<BetaRelease | null> {
  cached ??= load()
  return cached
}

async function load(): Promise<BetaRelease | null> {
  const mode = process.env.FERROCAST_RELEASES ?? ''
  if (mode === 'off') return null
  try {
    if (mode) return pickBeta(JSON.parse(await readFile(mode, 'utf8')))
    const res = await fetch(API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ferrocast-site-build' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(
        `[releases] GitHub answered ${res.status}; the download page links to the releases page.`,
      )
      return null
    }
    return pickBeta(await res.json())
  } catch (e) {
    console.warn(
      `[releases] couldn't read GitHub releases (${String(e)}); the download page links to the releases page.`,
    )
    return null
  }
}
