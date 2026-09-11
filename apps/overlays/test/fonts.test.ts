// Every font a built-in design names ships with Ferrocast, so designs look the same offline.

import { describe, expect, it } from 'vitest'
import type { Design, Widget } from '@ferrocast/api'
import { BUILTINS } from '@ferrocast/designs'
import { DESIGN_FONTS, fontStack } from '../src/design/fonts'
import { DESIGN_FONT_FACES } from '../src/design/font-files'

const BUNDLED = ['Bricolage Grotesque', 'Hanken Grotesk', 'JetBrains Mono']

function fontsOf(d: Design): string[] {
  const out: string[] = []
  const fromLayers = (ls: Widget[]) => {
    for (const l of ls) {
      const c = l.config as { font?: unknown; style?: { font?: unknown } }
      if (typeof c.font === 'string') out.push(c.font)
      if (typeof c.style?.font === 'string') out.push(c.style.font)
    }
  }
  if (d.kind === 'alert')
    for (const e of Object.values(d.content.events))
      for (const v of e?.variations ?? []) out.push(v.look.font.family)
  if (d.kind === 'theme') for (const s of d.content.scenes) fromLayers(s.layers)
  if (d.kind === 'scene') fromLayers(d.content.layers)
  if (d.kind === 'widget' && d.content.style.font) out.push(d.content.style.font)
  return out
}

describe('design fonts', () => {
  it('every font a built-in uses is bundled with the app', () => {
    for (const d of BUILTINS)
      for (const f of fontsOf(d))
        expect([...BUNDLED, ...DESIGN_FONTS], `${d.id} uses ${f}`).toContain(f)
  })

  it('every bundled family has a face, and the stack names it first', () => {
    const faces = new Set(DESIGN_FONT_FACES.map((f) => f.family))
    for (const f of DESIGN_FONTS) {
      expect(faces.has(f), f).toBe(true)
      expect(fontStack(f).startsWith(`'${f}'`)).toBe(true)
    }
    expect(DESIGN_FONTS.length).toBeGreaterThanOrEqual(15)
  })
})
