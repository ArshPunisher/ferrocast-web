import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import {
  FerroClient,
  LABEL_SOURCES,
  remoteAllowed,
  validateLabelConfig,
  validateLayout,
  type LabelSource,
  type Overlay,
} from '../src'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
    sleep: async () => {},
  })
})

afterEach(() => engine.dispose())

describe('Label validation & sources (#8)', () => {
  it('accepts every documented label source and validates train and timezone bounds', () => {
    expect(LABEL_SOURCES.length).toBe(28)
    for (const src of LABEL_SOURCES) {
      expect(
        validateLabelConfig({
          source: src.value,
          template: '{value}',
          theme: 'molten',
        }),
      ).toBeNull()
    }

    expect(
      validateLabelConfig({
        source: 'hype_train',
        template: 'Lv.{level} ({count}) {timer}',
        theme: 'molten',
        train_window_s: 90,
        train_step_s: 20,
        train_max_s: 240,
        train_threshold: 2,
      }),
    ).toBeNull()

    expect(
      validateLabelConfig({ source: 'unknown_src', template: '{value}', theme: 'molten' }),
    ).toMatch(/source/)
    expect(validateLabelConfig({ source: 'monthly_subs', timezone_offset_min: 900 })).toMatch(
      /timezone_offset_min/,
    )
    expect(validateLabelConfig({ source: 'monthly_subs', timezone: 'Europe/London' })).toBeNull()
    expect(validateLabelConfig({ source: 'monthly_subs', timezone: 'Australia/Sydney' })).toBeNull()
    expect(validateLabelConfig({ source: 'monthly_subs', timezone: 'Mars/Olympus' })).toMatch(
      /timezone/,
    )
    expect(validateLabelConfig({ source: 'hype_train', train_window_s: 5 })).toMatch(
      /train_window_s/,
    )
    expect(
      validateLabelConfig({ source: 'hype_train', train_window_s: 120, train_max_s: 60 }),
    ).toMatch(/train_max_s/)
    expect(validateLabelConfig({ source: 'hype_train', train_threshold: 0 })).toMatch(
      /train_threshold/,
    )

    const ov: Overlay = {
      id: 'ov-test',
      name: 'Test',
      url: 'http://127.0.0.1:47820/overlay/x',
      width: 1920,
      height: 1080,
      updated_at: 0,
      widgets: [
        {
          id: 'lbl1',
          kind: 'label',
          x: 20,
          y: 20,
          w: 400,
          h: 64,
          config: {
            source: 'hype_train',
            template: '{value}',
            theme: 'molten',
            train_window_s: 2,
          },
        },
      ],
    }
    expect(validateLayout(ov.name, ov.width, ov.height, ov.widgets)).toMatch(/label 'lbl1'/)
  })

  it('demo engine tracks session, monthly, alltime, latest and hype train labels', async () => {
    const created = await client.createOverlay('Labels', 'blank')
    const edited = await client.saveOverlay({
      ...created,
      widgets: [
        {
          id: 'lf',
          kind: 'label',
          x: 10,
          y: 10,
          w: 300,
          h: 50,
          config: { source: 'latest_follower', template: '{value}', theme: 'molten' },
        },
        {
          id: 'mf',
          kind: 'label',
          x: 10,
          y: 70,
          w: 300,
          h: 50,
          config: { source: 'monthly_follows', template: '{value}', theme: 'molten' },
        },
        {
          id: 'at',
          kind: 'label',
          x: 10,
          y: 130,
          w: 300,
          h: 50,
          config: { source: 'alltime_tips', template: '{value}', theme: 'molten' },
        },
        {
          id: 'ts',
          kind: 'label',
          x: 10,
          y: 190,
          w: 300,
          h: 50,
          config: { source: 'top_supporter_alltime', template: '{value}', theme: 'molten' },
        },
        {
          id: 'ht',
          kind: 'label',
          x: 10,
          y: 250,
          w: 420,
          h: 50,
          config: { source: 'hype_train', template: '{value}', theme: 'molten' },
        },
      ],
    })
    expect(edited.widgets.map((w) => (w.config as { source: LabelSource }).source)).toContain(
      'hype_train',
    )
  })
})

describe('Diagnostics preview & zip export (#7)', () => {
  it('returns redacted preview, zip export with likely causes at top, and blocks paired phones', async () => {
    const preview = await client.diagnosticsPreview()
    expect(preview.likely_causes.length).toBeGreaterThan(0)
    expect(preview.app.version).toBeTruthy()
    expect(preview.gpu.name).toBeTruthy()
    expect(preview.audio.devices.length).toBeGreaterThan(0)
    expect(preview.last_streams.length).toBeGreaterThan(0)

    const cancelled = await client.createSupportReport('__cancel__')
    expect(cancelled.cancelled).toBe(true)

    const written = await client.createSupportReport('/tmp/picked-support')
    expect(written.cancelled).toBe(false)
    expect(written.path).toContain('/tmp/picked-support/ferrocast-support-demo.zip')

    const blob = await client.downloadSupportReportZip()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const entries = unzipSync(bytes)
    expect(Object.keys(entries)).toContain('SUMMARY.txt')
    expect(Object.keys(entries)).toContain('report.json')
    expect(Object.keys(entries)).toContain('logs/ferrocast.log')
    const summary = strFromU8(entries['SUMMARY.txt']!)
    const causePos = summary.indexOf('=== LIKELY CAUSES ===')
    const appPos = summary.indexOf('=== APP & OS VERSIONS ===')
    expect(causePos).toBeGreaterThan(-1)
    expect(causePos).toBeLessThan(appPos)

    expect(remoteAllowed('owner', 'GET', '/diagnostics/preview')).toBe(false)
    expect(remoteAllowed('owner', 'POST', '/diagnostics/report')).toBe(false)
    expect(remoteAllowed('mod', 'POST', '/diagnostics/report.zip')).toBe(false)
  })
})
