// The design fonts that ship with Ferrocast (SIL Open Font License 1.1, each licence next to
// its files in src/fonts/). They are registered with the page but only downloaded when a
// design uses them, so an overlay that never shows Bangers never fetches it. No font CDN:
// OBS may be offline (R-52).

import anton from '../fonts/anton/anton-latin-400-normal.woff2?url'
import audiowide from '../fonts/audiowide/audiowide-latin-400-normal.woff2?url'
import baloo from '../fonts/baloo-2/baloo-2-latin-wght-normal.woff2?url'
import balooDeva from '../fonts/baloo-2/baloo-2-devanagari-wght-normal.woff2?url'
import bangers from '../fonts/bangers/bangers-latin-400-normal.woff2?url'
import bebas from '../fonts/bebas-neue/bebas-neue-latin-400-normal.woff2?url'
import caveat from '../fonts/caveat/caveat-latin-wght-normal.woff2?url'
import caveatBrush from '../fonts/caveat-brush/caveat-brush-latin-400-normal.woff2?url'
import cinzel from '../fonts/cinzel/cinzel-latin-wght-normal.woff2?url'
import creepster from '../fonts/creepster/creepster-latin-400-normal.woff2?url'
import fredoka from '../fonts/fredoka/fredoka-latin-wght-normal.woff2?url'
import monoton from '../fonts/monoton/monoton-latin-400-normal.woff2?url'
import orbitron from '../fonts/orbitron/orbitron-latin-wght-normal.woff2?url'
import oswald from '../fonts/oswald/oswald-latin-wght-normal.woff2?url'
import pacifico from '../fonts/pacifico/pacifico-latin-400-normal.woff2?url'
import playfair from '../fonts/playfair-display/playfair-display-latin-wght-normal.woff2?url'
import pressStart from '../fonts/press-start-2p/press-start-2p-latin-400-normal.woff2?url'
import righteous from '../fonts/righteous/righteous-latin-400-normal.woff2?url'
import russo from '../fonts/russo-one/russo-one-latin-400-normal.woff2?url'
import silkscreen from '../fonts/silkscreen/silkscreen-latin-400-normal.woff2?url'
import spaceGrotesk from '../fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2?url'
import teko from '../fonts/teko/teko-latin-wght-normal.woff2?url'
import tekoDeva from '../fonts/teko/teko-devanagari-wght-normal.woff2?url'
import vt323 from '../fonts/vt323/vt323-latin-400-normal.woff2?url'

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const DEVANAGARI =
  'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09'

interface Face {
  family: string
  url: string
  weight: string
  range?: string
}

/** Every face, by family. `weight` is a range for variable fonts. */
export const DESIGN_FONT_FACES: readonly Face[] = [
  { family: 'Anton', url: anton, weight: '400' },
  { family: 'Audiowide', url: audiowide, weight: '400' },
  { family: 'Baloo 2', url: baloo, weight: '400 800', range: LATIN },
  { family: 'Baloo 2', url: balooDeva, weight: '400 800', range: DEVANAGARI },
  { family: 'Bangers', url: bangers, weight: '400' },
  { family: 'Bebas Neue', url: bebas, weight: '400' },
  { family: 'Caveat', url: caveat, weight: '400 700' },
  { family: 'Caveat Brush', url: caveatBrush, weight: '400' },
  { family: 'Cinzel', url: cinzel, weight: '400 900' },
  { family: 'Creepster', url: creepster, weight: '400' },
  { family: 'Fredoka', url: fredoka, weight: '300 700' },
  { family: 'Monoton', url: monoton, weight: '400' },
  { family: 'Orbitron', url: orbitron, weight: '400 900' },
  { family: 'Oswald', url: oswald, weight: '200 700' },
  { family: 'Pacifico', url: pacifico, weight: '400' },
  { family: 'Playfair Display', url: playfair, weight: '400 900' },
  { family: 'Press Start 2P', url: pressStart, weight: '400' },
  { family: 'Righteous', url: righteous, weight: '400' },
  { family: 'Russo One', url: russo, weight: '400' },
  { family: 'Silkscreen', url: silkscreen, weight: '400' },
  { family: 'Space Grotesk', url: spaceGrotesk, weight: '300 700' },
  { family: 'Teko', url: teko, weight: '300 700', range: LATIN },
  { family: 'Teko', url: tekoDeva, weight: '300 700', range: DEVANAGARI },
  { family: 'VT323', url: vt323, weight: '400' },
]

let done = false

/** Registers the design fonts with the page (once). They load when text first uses them. */
export function registerDesignFonts(doc: Document = document): void {
  if (done || typeof FontFace !== 'function' || !doc.fonts) return
  done = true
  for (const f of DESIGN_FONT_FACES) {
    try {
      const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, {
        weight: f.weight,
        display: 'swap',
        ...(f.range ? { unicodeRange: f.range } : {}),
      })
      doc.fonts.add(face)
    } catch {
      /* the fallback stack still reads fine */
    }
  }
}
