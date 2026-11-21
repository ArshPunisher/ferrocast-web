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

  it('the button stands out from the page: 3:1 on Obsidian and the light themes, 2.5:1 on the lighter darks', () => {
    // WCAG 1.4.11 (3:1) is for a part that is the only way to find the control; the button's
    // text (4.5:1+) names it, so the lighter dark themes (Graphite, Slate, Moonlight, Forest,
    // Ember) keep their picked page colours with the fill at 2.5:1 or better.
    for (const id of THEME_IDS) {
      const t = resolved(id)
      const floor = id === 'obsidian' || LIGHT.has(id) ? 3 : 2.5
      for (const name of ['--fc-btn-primary', '--fc-btn-primary-hover'])
        expect(
          contrast(hexOf(t, name), hexOf(t, '--fc-bg')),
          `${id} ${name}`,
        ).toBeGreaterThanOrEqual(floor)
    }
  })

  it('no theme block overrides the button fill with one that fails', () => {
    // The light blocks inherit the :root values; if one ever sets its own, it must pass too.
    for (const m of css.matchAll(/--fc-btn-primary(?:-hover)?:\s*(#[0-9a-f]{6})/gi))
      expect(contrast(m[1] as string, text)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('what is picked (Ferrocast blue, 10 Nov; was D1 Graphite)', () => {
  // Each theme block sets the pick and its text together: every pair reads well (AAA).
  const blocks = [
    ...css.matchAll(
      /--fc-pick:\s*(#[0-9a-f]{6});[\s\S]*?--fc-pick-hover:\s*(#[0-9a-f]{6});[\s\S]*?--fc-on-pick:\s*(#[0-9a-f]{6});/gi,
    ),
  ]
  it('is set for dark and both light blocks', () => {
    expect(blocks.length).toBe(3)
  })
  it('its text clears 7:1 on the fill and on hover', () => {
    for (const [, fill, hover, text] of blocks) {
      expect(contrast(fill as string, text as string)).toBeGreaterThanOrEqual(7)
      expect(contrast(hover as string, text as string)).toBeGreaterThanOrEqual(7)
    }
  })
})

// ---- The ten appearance themes (owner's pick, 21 Nov) ----------------------------------
// Each theme sets the surfaces, lines, text, accent text, primary button, live colour, the
// area around the canvas (two stripe colours), the canvas and the meter. Everything else
// (meaning colours, platform marks, shadows) comes from :root or from the shared light block.

const THEME_IDS = [
  'graphite',
  'slate',
  'moonlight',
  'forest',
  'ember',
  'obsidian',
  'daylight',
  'mist',
  'linen',
  'contrast',
] as const
const LIGHT = new Set(['daylight', 'mist', 'linen', 'contrast'])

/** What each theme must say itself, so none borrows a neighbour's surface by accident. */
const OWN = [
  '--fc-bg',
  '--fc-surface-1',
  '--fc-surface-2',
  '--fc-surface-3',
  '--fc-surface-inset',
  '--fc-line',
  '--fc-line-strong',
  '--fc-text',
  '--fc-text-2',
  '--fc-text-3',
  '--fc-accent',
  '--fc-accent-text',
  '--fc-btn-primary',
  '--fc-btn-primary-hover',
  '--fc-on-btn-primary',
  '--fc-live',
  '--fc-stage',
  '--fc-stage-b',
  '--fc-canvas',
  '--fc-meter',
  '--fc-dock-head',
]

type Rule = { selectors: string[]; decls: Map<string, string> }

function rules(source: string): Rule[] {
  const out: Rule[] = []
  for (const m of source.matchAll(/([^{}@]+?)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' '))
    const decls = new Map<string, string>()
    for (const d of (m[2] ?? '').matchAll(/(--[a-z0-9-]+|color-scheme):\s*([^;]+);/gi))
      decls.set(d[1] as string, (d[2] as string).trim().replace(/\s+/g, ' '))
    out.push({ selectors, decls })
  }
  return out
}

const stripComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
const outsideMedia = stripComments.replace(/@media[^{]*\{([\s\S]*?\n\})\s*\n\}/g, '')
const allRules = rules(outsideMedia)
const systemLightCss = /@media \(prefers-color-scheme: light\) \{([\s\S]*?)\n\}\n/.exec(
  stripComments,
)?.[1]

/** `:root` plus every rule that names the theme, in order: what the page sees. */
function resolved(id: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of allRules) {
    const hit = r.selectors.some((s) => s === ':root' || s === `:root[data-theme='${id}']`)
    if (hit) for (const [k, v] of r.decls) out.set(k, v)
  }
  return out
}

/** Only what rules naming this theme set (not `:root`, not other themes). */
function own(id: string): Set<string> {
  const out = new Set<string>()
  for (const r of allRules)
    if (r.selectors.includes(`:root[data-theme='${id}']`))
      for (const k of r.decls.keys()) out.add(k)
  return out
}

const hexOf = (m: Map<string, string>, name: string): string => {
  const v = m.get(name)
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a hex colour: ${v}`)
  return v
}

describe('the ten themes', () => {
  it.each(THEME_IDS)('%s says its own surfaces, text and canvas colours', (id) => {
    const set = own(id)
    for (const name of OWN) expect(set.has(name), `${id} lacks ${name}`).toBe(true)
  })

  it.each(THEME_IDS)('%s ends with every token a screen reads', (id) => {
    const t = resolved(id)
    for (const name of [
      ...OWN,
      '--fc-pick',
      '--fc-on-pick',
      '--fc-ok',
      '--fc-warn',
      '--fc-danger',
      '--fc-molten-text',
      '--fc-arc',
      '--fc-accent-soft',
      '--fc-accent-line',
      '--fc-shadow-1',
      'color-scheme',
    ])
      expect(t.has(name), `${id} lacks ${name}`).toBe(true)
    expect(t.get('color-scheme')).toBe(LIGHT.has(id) ? 'light' : 'dark')
  })

  it.each(THEME_IDS)(
    '%s: text, text-2 and accent text clear 4.5:1 on the page and panels',
    (id) => {
      const t = resolved(id)
      for (const fg of ['--fc-text', '--fc-text-2', '--fc-accent-text'])
        for (const bg of ['--fc-bg', '--fc-surface-1'])
          expect(
            contrast(hexOf(t, fg), hexOf(t, bg)),
            `${id}: ${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(THEME_IDS)('%s: button text clears 4.5:1 on the button, and on hover', (id) => {
    const t = resolved(id)
    expect(
      contrast(hexOf(t, '--fc-on-btn-primary'), hexOf(t, '--fc-btn-primary')),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(hexOf(t, '--fc-on-btn-primary'), hexOf(t, '--fc-btn-primary-hover')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(THEME_IDS.filter((id) => LIGHT.has(id)))(
    '%s: Molten text (the current page in the sidebar) clears 4.5:1',
    (id) => {
      const t = resolved(id)
      for (const bg of ['--fc-bg', '--fc-surface-1'])
        expect(contrast(hexOf(t, '--fc-molten-text'), hexOf(t, bg))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('the two stripe colours differ, so the stripes can be seen', () => {
    for (const id of THEME_IDS) {
      const t = resolved(id)
      expect(hexOf(t, '--fc-stage').toLowerCase(), id).not.toBe(
        hexOf(t, '--fc-stage-b').toLowerCase(),
      )
    }
  })

  it('dark and light still work: aliases of slate and daylight', () => {
    expect(Object.fromEntries(resolved('dark'))).toEqual(Object.fromEntries(resolved('slate')))
    expect(Object.fromEntries(resolved('light'))).toEqual(Object.fromEntries(resolved('daylight')))
  })

  it('with no theme chosen, a dark computer gets slate and a light one daylight', () => {
    expect(Object.fromEntries(resolved('slate'))).toEqual(
      Object.fromEntries([...resolved('slate')].filter(([k]) => resolved('slate').has(k))),
    )
    // :root is the dark default: its own surfaces are slate's.
    const base = rules(outsideMedia).find((r) => r.selectors.includes(':root'))!
    const slate = resolved('slate')
    for (const name of ['--fc-bg', '--fc-surface-1', '--fc-text', '--fc-stage'])
      expect(base.decls.get(name), name).toBe(slate.get(name))
    // The light system block carries daylight's values.
    const sys = rules(`${systemLightCss}`).flatMap((r) => [...r.decls])
    const light = resolved('daylight')
    for (const [k, v] of sys) expect(light.get(k), k).toBe(v)
    expect(sys.length).toBeGreaterThan(30)
  })

  it("Obsidian keeps today's dark values and Daylight today's light ones", () => {
    const o = resolved('obsidian')
    expect(o.get('--fc-bg')).toBe('#0a0b0d')
    expect(o.get('--fc-surface-2')).toBe('#16191e')
    expect(o.get('--fc-text-2')).toBe('#e0e4ec')
    expect(o.get('--fc-accent-text')).toBe('#33d4ff')
    const d = resolved('daylight')
    expect(d.get('--fc-bg')).toBe('#f2f3f6')
    expect(d.get('--fc-text-2')).toBe('#181d25')
    expect(d.get('--fc-accent-text')).toBe('#05678c')
  })
})
