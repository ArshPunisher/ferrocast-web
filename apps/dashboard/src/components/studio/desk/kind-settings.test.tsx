import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type EngineOption } from '@ferrocast/api'
import { KindSettings, layoutOf } from './kind-settings'
import { RowLook } from './options'

const opt = (
  key: string,
  label: string,
  kind: EngineOption['kind'],
  more: Partial<EngineOption> = {},
): EngineOption => ({
  key,
  label,
  kind,
  help: '',
  visible: true,
  enabled: true,
  min: null,
  max: null,
  step: null,
  slider: false,
  suffix: '',
  choices: [],
  values: [],
  group: [],
  ...more,
})

// The countdown's form as the engine describes it (crates/studio/src/kinds.rs).
const setTime = { key: 'mode', values: ['for'] }
const countdown: EngineOption[] = [
  opt('mode', 'Count', 'list', {
    choices: ['For a set time', 'Until a time of day'],
    values: ['for', 'until'],
  }),
  opt('minutes', 'Minutes', 'int', { min: 0, max: 1440, shown_when: setTime }),
  opt('seconds', 'Seconds', 'int', { min: 0, max: 59, shown_when: setTime }),
  opt('until', 'Time of day (21:30)', 'text', { shown_when: { key: 'mode', values: ['until'] } }),
  opt('before', 'Before the time', 'text'),
  opt('end', 'When it ends', 'text'),
  opt('font', 'Font', 'font'),
  opt('color1', 'Color', 'color_alpha'),
  opt('outline', 'Outline', 'bool'),
  opt('drop_shadow', 'Drop Shadow', 'bool'),
]

const drawn = (kind: string, opts: EngineOption[], values: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      RowLook.Provider,
      { value: 'lined' },
      createElement(KindSettings, { name: 'Timer', kind, opts, values, onChange: () => {} }),
    ),
  )

describe('settings laid out per kind (design A)', () => {
  it('puts a countdown in Timing, Words and Look, in that order', () => {
    const html = drawn('ferrocast_countdown', countdown, { mode: 'for', minutes: 5, seconds: 0 })
    const at = (s: string) => html.indexOf(s)
    expect(at('>Timing<')).toBeGreaterThan(-1)
    expect(at('>Timing<')).toBeLessThan(at('>Words<'))
    expect(at('>Words<')).toBeLessThan(at('>Look<'))
    expect(html).not.toContain('>More<')
  })

  it('shows minutes and seconds as one Length line, only for a set time', () => {
    const forTime = drawn('ferrocast_countdown', countdown, { mode: 'for', minutes: 5 })
    expect(forTime).toContain('>Length<')
    expect(forTime).toContain('aria-label="Minutes"')
    expect(forTime).toContain('aria-label="Seconds"')
    expect(forTime).not.toContain('Time of day')
    const until = drawn('ferrocast_countdown', countdown, { mode: 'until' })
    expect(until).not.toContain('>Length<')
    expect(until).toContain('Time of day')
    // A section's part with nothing showing draws nothing (no "No options." line).
    expect(until).not.toContain('No options')
  })

  it('uses clearer names than the engine where it has them', () => {
    const html = drawn('ferrocast_countdown', countdown, { mode: 'for' })
    expect(html).toContain('>Drop shadow<')
    expect(html).toContain('>Colour<')
    expect(html).not.toContain('>Drop Shadow<')
  })

  it('never loses a setting: what a layout doesn’t name goes under More', () => {
    const html = drawn('ferrocast_countdown', [...countdown, opt('glow', 'Glow', 'bool')], {
      mode: 'for',
    })
    expect(html).toContain('>More<')
    expect(html.indexOf('>More<')).toBeLessThan(html.indexOf('>Glow<'))
  })

  it('draws a few short choices as a segmented choice, a long list as a menu', () => {
    const html = drawn(
      'some_plugin_source',
      [opt('every', 'Every', 'list', { choices: ['10 s', '30 s', '1 min'], values: [10, 30, 60] })],
      { every: 30 },
    )
    expect(html.match(/role="radio"/g)).toHaveLength(3)
    expect(html).toMatch(/aria-checked="true"[^>]*>30 s</)
  })

  it('falls back to one Settings section for a kind without a layout', () => {
    expect(layoutOf('some_plugin_source')).toBeNull()
    const html = drawn('some_plugin_source', [opt('speed', 'Speed', 'int')], {})
    expect(html).toContain('>Settings<')
    expect(html).toContain('>Speed<')
  })
})
