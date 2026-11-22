import { describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import {
  FerroClient,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_HTML,
  MAX_IN_MS,
  defaultAlertAnim,
  newVariation,
  renderAlert,
  sample,
  validateRule,
} from '../src/index'
import type { AlertRule, CustomField } from '../src/types'

function baseRule(): AlertRule {
  return {
    id: 'sub',
    name: 'Subscriptions',
    enabled: true,
    kinds: ['subscription'],
    platforms: [],
    interrupt: false,
    variations: [newVariation('default', '{name} subscribed!')],
  }
}

describe('Alert Editor v2 validation and rendering (R25)', () => {
  it('populates default animation timing and omits custom render payload when disabled', () => {
    const r = baseRule()
    const v = r.variations[0]!
    expect(v.anim).toEqual(defaultAlertAnim())
    expect(validateRule(r)).toBeNull()
    const rendered = renderAlert('a1', r, v, sample('subscription', 'twitch', 0)!)
    expect(rendered.anim).toEqual(defaultAlertAnim())
    expect(rendered.custom).toBeUndefined()
  })

  it('rejects unknown tokens in title, body and custom html', () => {
    const tBad = baseRule()
    tBad.variations[0]!.title = 'Hi {unknown_var}!'
    expect(validateRule(tBad)).toMatch(/unknown_var/)

    const bBad = baseRule()
    bBad.variations[0]!.body = '{ghost_token}'
    expect(validateRule(bBad)).toMatch(/ghost_token/)

    const hBad = baseRule()
    hBad.variations[0]!.html = '<div>{no_such_token}</div>'
    expect(validateRule(hBad)).toMatch(/no_such_token/)
  })

  it('allows style/script braces in html and validates timing constraints', () => {
    const r = baseRule()
    r.variations[0]!.html = '<div>{name}<style>.a{color:#fff}</style></div>'
    expect(validateRule(r)).toBeNull()

    const tooSlow = baseRule()
    tooSlow.variations[0]!.anim = { ...defaultAlertAnim(), in_ms: MAX_IN_MS + 1 }
    expect(validateRule(tooSlow)).toMatch(/entrance timing/)

    const overlap = baseRule()
    overlap.variations[0]!.duration_ms = 1000
    overlap.variations[0]!.anim = { ...defaultAlertAnim(), in_ms: 600, out_ms: 500 }
    expect(validateRule(overlap)).toMatch(/shorter than total alert duration/)
  })

  it('validates custom HTML size, CSS safety and field schema', () => {
    const bigHtml = baseRule()
    bigHtml.variations[0]!.html = 'a'.repeat(MAX_CUSTOM_HTML + 1)
    expect(validateRule(bigHtml)).toMatch(/20000/)

    const badCss = baseRule()
    badCss.variations[0]!.css = '@import url("https://evil.invalid/x.css");'
    expect(validateRule(badCss)).toMatch(/@import/)

    const shadowVar = baseRule()
    shadowVar.variations[0]!.fields = [{ key: 'name', label: 'Shadow', type: 'text', default: 'x' }]
    expect(validateRule(shadowVar)).toMatch(/built-in tokens|field key/i)

    const badColor = baseRule()
    badColor.variations[0]!.fields = [
      { key: 'accent_hex', label: 'Accent', type: 'color', default: 'red' },
    ]
    expect(validateRule(badColor)).toMatch(/#rrggbb/)

    const tooMany = baseRule()
    tooMany.variations[0]!.fields = Array.from(
      { length: MAX_CUSTOM_FIELDS + 1 },
      (_, i): CustomField => ({
        key: `field_${i}`,
        label: `Field ${i}`,
        type: 'text',
        default: 'ok',
      }),
    )
    expect(validateRule(tooMany)).toMatch(/32/)

    const badOverride = baseRule()
    badOverride.variations[0]!.fields = [
      { key: 'glow_px', label: 'Glow', type: 'number', default: 8, min: 0, max: 20 },
    ]
    badOverride.variations[0]!.field_values = { glow_px: 50 }
    expect(validateRule(badOverride)).toMatch(/at most 20/)
  })

  it('renders resolved custom fields and vars when custom_enabled is true', () => {
    const r = baseRule()
    const v = r.variations[0]!
    v.custom_enabled = true
    v.html = '<div class="wrap">{badge_text}: {name}</div>'
    v.css = '.wrap { color: var(--field-badge_color); }'
    v.fields = [
      { key: 'badge_text', label: 'Badge', type: 'text', default: 'VIP' },
      { key: 'badge_color', label: 'Color', type: 'color', default: '#ffa424' },
    ]
    v.field_values = { badge_text: 'Founder' }
    expect(validateRule(r)).toBeNull()

    const rendered = renderAlert('a2', r, v, sample('subscription', 'twitch', 0)!)
    expect(rendered.custom).toEqual({
      html: v.html,
      css: v.css,
      fields: { badge_text: 'Founder', badge_color: '#ffa424' },
      vars: expect.objectContaining({ name: 'PixelPanda', months: '6' }),
    })
  })

  it('enforces R25 validation in DemoEngine and stays backwards compatible with old rules', async () => {
    const e = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const c = new FerroClient({
      base: e.base,
      token: DEMO_TOKEN,
      fetch: e.fetch,
      sleep: async () => {},
    })
    const rule = (await c.alertRules())[0]!
    const bad = structuredClone(rule)
    bad.variations[0]!.title = 'Hi {bad_token}'
    await expect(c.saveAlertRule(bad)).rejects.toMatchObject({ status: 400 })

    const custom = structuredClone(rule)
    custom.variations[0]!.custom_enabled = true
    custom.variations[0]!.html = '<span>{badge}</span>'
    custom.variations[0]!.fields = [{ key: 'badge', label: 'Badge', type: 'text', default: 'Live' }]
    custom.variations[0]!.field_values = { badge: 'Hero' }
    const saved = await c.saveAlertRule(custom)
    expect(saved.variations[0]!.field_values).toEqual({ badge: 'Hero' })
    e.dispose()
  })

  it('refuses custom HTML that can run code, navigate or fetch (same rules as the engine)', () => {
    const run = (html: string) => {
      const r = baseRule()
      r.variations[0]!.custom_enabled = true
      r.variations[0]!.html = html
      return validateRule(r)
    }
    for (const bad of [
      '<p>{message}</p><img src="data:," onerror="location.replace(\'https://evil.example/\')">',
      '<div onclick="x()">hi</div>',
      '<DIV ONMOUSEOVER=x>hi</DIV>',
      "<script>fetch('https://evil.example')</script>",
      '<svg><script>1</script></svg>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
      '<form action="https://evil.example"><button>go</button></form>',
      '<iframe src="https://evil.example"></iframe>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href=" Java\tscript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<img src="https://evil.example/p.gif">',
      '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
      '<audio src="data:audio/wav;base64,AAAA" autoplay></audio>',
      '<div style="background:url(https://evil.example/a.png)">x</div>',
      '<style>@import url(https://evil.example/a.css);</style>',
      '<style>.a{background:u\\72l(https://evil.example/a.png)}</style>',
      '<div class="{name}">x</div>',
      '<div class={name}>x</div>',
      '<img src="{message}">',
      '<div style="color:{message}">x</div>',
    ]) {
      expect(run(bad), bad).not.toBeNull()
    }
    for (const good of [
      "<div class='card'><span>{name}</span><b>{message}</b></div>",
      '<img src="https://cdn.discordapp.com/a.png" alt="{name}">',
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<div style="color:#fff;background:linear-gradient(red,blue)" title="{name}">x</div>',
      '<style>.card{color:#fff}</style><p class="card" data-who="{name}">{{literal}}</p>',
      '<!-- a note --><p>{amount|default:"0"}</p>',
      "<style>.a{content:'{bogus}'}</style><p>{name}</p>",
    ]) {
      expect(run(good), good).toBeNull()
    }
    expect(run('<p>{bogus}</p>')).toMatch(/bogus/)
  })

  it('caps the looks per rule', () => {
    const r = baseRule()
    r.variations = Array.from({ length: 21 }, () => ({ ...r.variations[0]! }))
    expect(validateRule(r)).toMatch(/up to 20 looks/)
  })

  it('rejects wrong shapes the engine would refuse (arrays, strings, fractions)', () => {
    const t = (edit: (v: Record<string, unknown>) => void) => {
      const r = baseRule()
      edit(r.variations[0] as unknown as Record<string, unknown>)
      return validateRule(r)
    }
    expect(t((v) => (v.field_values = []))).toMatch(/field_values/)
    expect(t((v) => (v.fields = 'bad'))).toMatch(/fields must be a list/)
    expect(t((v) => (v.custom_enabled = 'yes'))).toMatch(/custom_enabled/)
    expect(t((v) => (v.html = 123))).toMatch(/html must be text/)
    expect(t((v) => (v.volume = 70.5))).toMatch(/whole number/)
    expect(t((v) => (v.duration_ms = Number.NaN))).toMatch(/whole number/)
    expect(t((v) => ((v.anim as Record<string, unknown>).in_ms = 400.5))).toMatch(/whole number/)
    expect(t(() => {})).toBeNull()
  })
})
