import { continueRender, delayRender, staticFile } from 'remotion'

// The dark tokens from packages/ui/src/styles/tokens.css, as values (Remotion renders
// inline styles, so CSS custom properties would only add indirection here).
export const C = {
  bg: '#0a0b0d',
  surface1: '#101216',
  surface2: '#16191e',
  surface3: '#1d2127',
  line: '#252a31',
  lineStrong: '#343a44',
  text: '#eef0f4',
  text2: '#b3b9c4',
  text3: '#8a919d',
  accent: '#3461f5',
  accentText: '#8eaaff',
  accentSoft: 'rgba(52, 97, 245, 0.16)',
  ok: '#3dd193',
  danger: '#ff5d6c',
  dangerFill: '#d9324a',
  twitch: '#a970ff',
  youtube: '#ff3b4e',
  kick: '#53fc18',
  tips: '#f2b84b',
} as const

export const FONT = {
  display: "'Bricolage Grotesque', 'Hanken Grotesk', sans-serif",
  sans: "'Hanken Grotesk', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

// Fontsource subsets: latin, and latin-ext (which carries ₹ and other currency signs).
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

const FACES: [string, string, string][] = [
  ['Bricolage Grotesque', 'fonts/bricolage-grotesque-latin-wght-normal.woff2', LATIN],
  ['Bricolage Grotesque', 'fonts/bricolage-grotesque-latin-ext-wght-normal.woff2', LATIN_EXT],
  ['Hanken Grotesk', 'fonts/hanken-grotesk-latin-wght-normal.woff2', LATIN],
  ['Hanken Grotesk', 'fonts/hanken-grotesk-latin-ext-wght-normal.woff2', LATIN_EXT],
  ['JetBrains Mono', 'fonts/jetbrains-mono-latin-wght-normal.woff2', LATIN],
]

let started = false

/** Loads the variable fonts once, holding the render until they are ready. */
export function loadFonts(): void {
  if (started || typeof document === 'undefined') return
  started = true
  const handle = delayRender('Loading fonts')
  Promise.all(
    FACES.map(async ([family, file, range]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, {
        weight: '100 900',
        unicodeRange: range,
      })
      await face.load()
      document.fonts.add(face)
    }),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => {
      console.error('font load failed', err)
      continueRender(handle)
    })
}
