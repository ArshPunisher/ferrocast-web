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

/** Compares `v1.2.3-beta.4` style tags: numbers numerically, a release above its betas. */
export function compareVersions(a: string, b: string): number {
  const parse = (t: string) => {
    const bare = t.replace(/^v/, '')
    const dash = bare.indexOf('-')
    const core = dash === -1 ? bare : bare.slice(0, dash)
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
    while (nums.length < 3) nums.push(0)
    if (dash === -1) return [...nums.slice(0, 3), Infinity]
    // Each number in the prerelease part in turn: beta.1.2 < beta.3, beta.4 < beta.10.
    const pre = (bare.slice(dash + 1).match(/\d+/g) ?? []).map(Number)
    return [...nums.slice(0, 3), 0, ...pre]
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** The newest published prerelease in a GitHub API answer, or null. Exported for tests. */
export function pickBeta(data: unknown): BetaRelease | null {
  if (!Array.isArray(data)) return null
  // Highest version, not the first listed: GitHub orders releases by the tagged commit's
  // date, which doesn't follow the version.
  const r = (data as GhRelease[])
    .filter(
      (x) =>
        x &&
        x.prerelease === true &&
        x.draft !== true &&
        typeof x.tag_name === 'string' &&
        x.tag_name !== 'beta',
    )
    .sort((a, b) => compareVersions(String(b.tag_name), String(a.tag_name)))[0]
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
