import { describe, expect, it } from 'vitest'
import { BUILTINS } from '../src'
import { scopeCss } from '../src/kit'

const S = ':where(.f-plate)'

describe('scopeCss', () => {
  it('ties card rules to the frame the design was drawn for', () => {
    expect(scopeCss('.fa{gap:0}', 'plate')).toBe(`.fa${S}{gap:0}`)
    expect(scopeCss('.fa.lay-over .fa-text{x:1}', 'plate')).toBe(`.fa${S}.lay-over .fa-text{x:1}`)
    expect(scopeCss('.fa::before{x:1}', 'plate')).toBe(`.fa${S}::before{x:1}`)
    expect(scopeCss('.f-plate .fa-media{z-index:1}', 'plate')).toBe(
      `.f-plate${S} .fa-media{z-index:1}`,
    )
    expect(scopeCss('.fa-emblem svg,.fa-title .ch{x:1}', 'plate')).toBe(
      `${S} .fa-emblem svg,${S} .fa-title .ch{x:1}`,
    )
    expect(scopeCss('.fa-media>img{x:1}', 'plate')).toBe(`${S} .fa-media>img{x:1}`)
  })

  it('leaves the stage decorations, :host and keyframes alone', () => {
    const src =
      '.fa-stage::before{content:""}@keyframes fc-petal{from{opacity:0}to{opacity:1}}:host{x:1}'
    expect(scopeCss(src, 'plate')).toBe(src)
  })

  it('keeps commas inside :is() together', () => {
    expect(scopeCss('.fa-title :is(.w,.ch){x:1}', 'neon')).toBe(
      ':where(.f-neon) .fa-title :is(.w,.ch){x:1}',
    )
  })

  it('is used by every built-in alert look, on its own frame', () => {
    for (const d of BUILTINS)
      if (d.kind === 'alert')
        for (const looks of Object.values(d.content.events))
          for (const v of looks?.variations ?? []) {
            const { css, frame } = v.look
            const rules = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
            for (const [, prelude] of rules.matchAll(/([^{}]+)\{[^}]*\}/g))
              for (const sel of prelude!.split(/,(?![^(]*\))/))
                if (!sel.startsWith('.fa-stage') && !sel.startsWith(':host'))
                  expect(sel, `${d.id} ${v.id}`).toContain(`:where(.f-${frame})`)
          }
  })
})
