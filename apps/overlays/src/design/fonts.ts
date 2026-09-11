// Font families a design may name, as CSS stacks. Bundled fonts are loaded by the overlay
// page itself (no font CDN, R-52); Google Fonts and system names fall back to the closest
// bundled or system face when the computer doesn't have them.

import { isFontFamily } from '@ferrocast/api/design'

const SANS = "'Hanken Grotesk Variable', ui-sans-serif, system-ui, sans-serif"
const DISPLAY =
  "'Bricolage Grotesque Variable', 'Hanken Grotesk Variable', ui-sans-serif, system-ui, sans-serif"
const MONO = "'JetBrains Mono Variable', ui-monospace, 'SFMono-Regular', Menlo, monospace"
const SERIF = "Georgia, 'Times New Roman', serif"
const CONDENSED = "Impact, 'Arial Narrow Bold', 'Haettenschweiler', sans-serif"
const ROUNDED = "'Arial Rounded MT Bold', 'Hanken Grotesk Variable', sans-serif"
const HAND = "'Chalkboard SE', 'Comic Sans MS', 'Bricolage Grotesque Variable', cursive"

const BUNDLED: Record<string, string> = {
  'Bricolage Grotesque': DISPLAY,
  'Hanken Grotesk': SANS,
  'JetBrains Mono': MONO,
}

/** The Google Fonts families the designer offers, with what to fall back to. */
export const GOOGLE_FONTS: Record<string, string> = {
  Bangers: CONDENSED,
  'Press Start 2P': MONO,
  Poppins: SANS,
  Lora: SERIF,
  'Permanent Marker': HAND,
  Oswald: CONDENSED,
  Orbitron: MONO,
  Fredoka: ROUNDED,
  'Bebas Neue': CONDENSED,
  'Playfair Display': SERIF,
  'Space Grotesk': SANS,
  Rubik: SANS,
  Nunito: ROUNDED,
  Montserrat: SANS,
  Anton: CONDENSED,
  Righteous: DISPLAY,
  'Russo One': DISPLAY,
  'Luckiest Guy': CONDENSED,
  Caveat: HAND,
  'Caveat Brush': HAND,
  Pacifico: HAND,
  'Archivo Black': DISPLAY,
  Silkscreen: MONO,
  VT323: MONO,
  Audiowide: DISPLAY,
  Monoton: DISPLAY,
  Cinzel: SERIF,
  Creepster: CONDENSED,
  'Baloo 2': `${ROUNDED}, 'Kohinoor Devanagari'`,
  Teko: `${CONDENSED}, 'Kohinoor Devanagari'`,
  'Noto Sans Devanagari': `'Noto Sans Devanagari', 'Kohinoor Devanagari', ${SANS}`,
  Mukta: SANS,
}

/**
 * Google Fonts families that ship with Ferrocast (design/font-files.ts), so designs that
 * use them look the same offline. The rest fall back when the computer lacks them.
 */
export const DESIGN_FONTS: readonly string[] = [
  'Anton',
  'Audiowide',
  'Baloo 2',
  'Bangers',
  'Bebas Neue',
  'Caveat',
  'Caveat Brush',
  'Cinzel',
  'Creepster',
  'Fredoka',
  'Monoton',
  'Orbitron',
  'Oswald',
  'Pacifico',
  'Playfair Display',
  'Press Start 2P',
  'Righteous',
  'Russo One',
  'Silkscreen',
  'Space Grotesk',
  'Teko',
  'VT323',
]

export const SYSTEM_FONTS: Record<string, string> = {
  Impact: CONDENSED,
  Georgia: SERIF,
  'Arial Black': `'Arial Black', ${DISPLAY}`,
  Verdana: `Verdana, ${SANS}`,
  'Trebuchet MS': `'Trebuchet MS', ${SANS}`,
  'Courier New': `'Courier New', ${MONO}`,
}

/** A safe CSS font-family value for a design's family name. */
export function fontStack(family: unknown): string {
  if (typeof family !== 'string' || !isFontFamily(family)) return DISPLAY
  if (BUNDLED[family]) return BUNDLED[family]
  const fallback = GOOGLE_FONTS[family] ?? SYSTEM_FONTS[family] ?? DISPLAY
  // The name itself first: installed on this computer, it wins.
  return `'${family}', ${fallback}`
}
