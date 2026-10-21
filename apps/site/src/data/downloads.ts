// The files the download page offers, by kind, and where each one's thank-you page lives.
// A download button leads to /download/thanks/<kind>/, which starts that file's download
// itself (so leaving the download page can never cancel it) and shows its install steps.

import type { BetaAsset, BetaOs } from './releases'

export type Kind = 'mac' | 'windows' | 'appimage' | 'deb' | 'rpm'

export const OS_NAME: Record<BetaOs, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' }

/** The file's own name, from its download URL. */
export const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? '')

export function kindOf(url: string): Kind | null {
  const f = fileName(url)
  if (f.endsWith('.dmg')) return 'mac'
  if (f.endsWith('-setup.exe')) return 'windows'
  if (f.endsWith('.AppImage')) return 'appimage'
  if (f.endsWith('.deb')) return 'deb'
  if (f.endsWith('.rpm')) return 'rpm'
  return null
}

/** What the file is, in a few words: "the installer", "the AppImage". */
export const KIND_NAME: Record<Kind, string> = {
  mac: 'disk image',
  windows: 'installer',
  appimage: 'AppImage',
  deb: '.deb package',
  rpm: '.rpm package',
}

/** The thank-you page for a file, or null when it isn't one of the kinds above. */
export function thanksPath(asset: BetaAsset): string | null {
  const kind = kindOf(asset.url)
  return kind ? `/download/thanks/${kind}/` : null
}
