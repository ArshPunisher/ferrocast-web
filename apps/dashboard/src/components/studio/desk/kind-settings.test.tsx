// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type EngineOption } from '@ferrocast/api'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
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
    expect(html).toMatch(/aria-checked="true"[^>]*><span[^>]*>30 s</)
  })

  it('falls back to one Settings section for a kind without a layout', () => {
    expect(layoutOf('some_plugin_source')).toBeNull()
    const html = drawn('some_plugin_source', [opt('speed', 'Speed', 'int')], {})
    expect(html).toContain('>Settings<')
    expect(html).toContain('>Speed<')
  })
})

describe('duplicate source Mirror and SourcePreview selection', () => {
  let root: Root | null = null

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useLive.setState({ conn: null })
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('Mirror toggle and SourcePreview flip reflect the selected item when a camera appears twice in one scene', async () => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useLive.setState({ conn: { client: {} } as never })

    const transform = vi.fn(async (_scene: string, id: number) => ({
      x: 0,
      y: 0,
      rotation: 0,
      scale_x: id === 2 ? -1 : 1,
      scale_y: 1,
      alignment: 5,
      bounds: 'stretch' as const,
      bounds_alignment: 5,
      bounds_width: 1920,
      bounds_height: 1080,
      crop_left: 0,
      crop_top: 0,
      crop_right: 0,
      crop_bottom: 0,
      width: 1920,
      height: 1080,
    }))
    const editItem = vi.fn(async () => undefined)
    const sourcePicture = vi.fn(async () => ({
      image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      width: 1280,
      height: 720,
    }))

    const desk = {
      api: {
        transform,
        editItem,
        sourcePicture,
        sources: vi.fn(async () => []),
      },
      items: {
        data: [
          {
            id: 1,
            name: 'Cam',
            kind: 'av_capture_input_v2',
            visible: true,
            locked: false,
            audio: false,
            group: false,
            frame: [1920, 0, 0, 1080, 0, 0],
            children: [],
          },
          {
            id: 2,
            name: 'Cam',
            kind: 'av_capture_input_v2',
            visible: true,
            locked: false,
            audio: false,
            group: false,
            frame: [-1920, 0, 0, 1080, 1920, 0],
            children: [],
          },
        ],
        set: vi.fn(),
        reload: vi.fn(),
      },
      audio: { data: [], set: vi.fn(), reload: vi.fn() },
      scene: 'Main',
      selected: 2,
      refresh: vi.fn(),
      undone: 0,
    } as unknown as Desk

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <RowLook.Provider value="lined">
            <KindSettings
              name="Cam"
              kind="av_capture_input_v2"
              opts={[]}
              values={{}}
              onChange={() => {}}
            />
          </RowLook.Provider>
        </DeskProvider>,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(transform).toHaveBeenCalledWith('Main', 2)
    const mirror = host.querySelector(
      'button[role="switch"][aria-label="Mirror"]',
    ) as HTMLButtonElement
    expect(mirror).not.toBeNull()
    expect(mirror.getAttribute('aria-checked')).toBe('true')

    const img = host.querySelector('img[alt="Cam now"]') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.style.transform).toBe('scale(-1, 1)')

    await act(async () => {
      mirror.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(editItem).toHaveBeenCalledWith('Main', 2, 'flip_h')
  })
})
