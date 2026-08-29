// Primary buttons carry white text: the fill must pass WCAG AA (4.5:1) with it, hover too,
// and stand out from the page (3:1) in both themes.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/** The first value of `name` in the block that starts with `selector`. */
function token(name: string, selector = ':root {'): string {
  const start = css.indexOf(selector)
  const block = css.slice(start, css.indexOf('\n}', start))
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)
  if (!m?.[1]) throw new Error(`${name} not found in ${selector}`)
  return m[1]
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

describe('primary button tokens', () => {
  const fill = token('--fc-btn-primary')
  const hover = token('--fc-btn-primary-hover')
  const text = token('--fc-on-btn-primary')

  it('white text passes AA on the fill and on hover', () => {
    expect(text.toLowerCase()).toBe('#ffffff')
    expect(contrast(fill, text)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hover, text)).toBeGreaterThanOrEqual(4.5)
  })

  it('the button stands out from the page in both themes', () => {
    const dark = token('--fc-bg')
    const light = token('--fc-bg', ":root[data-theme='light'] {")
    for (const bg of [dark, light]) {
      expect(contrast(fill, bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(hover, bg)).toBeGreaterThanOrEqual(3)
    }
  })

  it('no theme block overrides the button fill with one that fails', () => {
    // The light blocks inherit the :root values; if one ever sets its own, it must pass too.
    for (const m of css.matchAll(/--fc-btn-primary(?:-hover)?:\s*(#[0-9a-f]{6})/gi))
      expect(contrast(m[1] as string, text)).toBeGreaterThanOrEqual(4.5)
  })
})
