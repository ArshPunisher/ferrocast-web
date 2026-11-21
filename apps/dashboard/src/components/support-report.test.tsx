import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, type SupportReport, type WrittenSupportReport } from '@ferrocast/api'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { SupportReportSection } from './support-report'

let root: Root | null = null

const unmountRoot = async () => {
  if (!root) return
  const prev = root
  root = null
  await act(async () => prev.unmount())
}

const sampleReport: SupportReport = {
  generated_at: 1_700_000_000_000,
  likely_causes: [
    {
      severity: 'warning',
      code: 'audio_sample_rate_mismatch',
      title: "Audio device sample rate differs from Ferrocast's 48000 Hz mix",
      detail: 'USB Mic (input at 44100 Hz)',
      recommendation: 'Match device and Studio sample rates.',
    },
  ],
  app: { version: '3.4.0', os: 'macos', arch: 'aarch64', build_mode: 'release' },
  os: { name: 'macOS', version: '15.2', long_version: 'macOS 15.2', kernel_version: '24.2' },
  gpu: {
    name: 'Apple M3 Pro',
    backend: 'Metal',
    device_type: 'IntegratedGpu',
    driver: '',
    driver_info: '',
    is_software: false,
    active_renderer: 'ferrocore',
  },
  encoders: [
    {
      id: 'com.apple.videotoolbox.videoencoder.ave.avc',
      label: 'Apple VT H264 Hardware Encoder',
      hardware: true,
      codec: 'H.264',
      selected: true,
    },
  ],
  audio: {
    studio_sample_rate_hz: 48_000,
    monitoring_device: 'Studio Headphones',
    devices: [
      {
        kind: 'input',
        name: 'USB Mic',
        is_default: true,
        sample_rate_hz: 44_100,
        supported_sample_rates_hz: [44_100, 48_000],
        channels: 2,
      },
    ],
  },
  last_streams: [],
  crashes: [],
  connectors: [],
  logs_included: ['logs/ferrocast.log'],
  disk_free_mb: 100_000,
  safe_mode: false,
  unclean_exit: false,
}

async function mount(clientOverrides: Record<string, unknown> = {}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const client = {
    diagnosticsPreview: vi.fn(async () => sampleReport),
    createSupportReport: vi.fn(async (): Promise<WrittenSupportReport> => ({
      cancelled: false,
      path: '/Users/[REDACTED_USER]/Downloads/ferrocast-support-demo.zip',
      filename: 'ferrocast-support-demo.zip',
      size_bytes: 4096,
      report: sampleReport,
    })),
    downloadSupportReportZip: vi.fn(
      async () => new Blob(['PK\x03\x04'], { type: 'application/zip' }),
    ),
    ...clientOverrides,
  }
  await unmountRoot()
  useLive.setState({ conn: { client } as never })
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () => {
    root!.render(
      <>
        <SupportReportSection />
        <Toaster />
      </>,
    )
    await Promise.resolve()
  })
  return { el, client }
}

afterEach(async () => {
  currentToasts().forEach((t) => dismissToast(t.id))
  await unmountRoot()
  document.body.innerHTML = ''
  delete (window as { __FERROCAST__?: unknown }).__FERROCAST__
  useLive.setState({ conn: null })
  vi.restoreAllMocks()
})

describe('SupportReportSection (#7)', () => {
  it('renders ranked likely causes and downloads zip in browser mode', async () => {
    const createUrl = vi.fn(() => 'blob:mock-zip')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
    const { el, client } = await mount()

    expect(el.textContent).toContain('Likely causes')
    expect(el.textContent).toContain('Audio device sample rate differs')
    expect(el.textContent).toContain('Apple M3 Pro')
    expect(el.textContent).toContain('48000 Hz')

    const btn = el.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await Promise.resolve()
    })

    expect(client.downloadSupportReportZip).toHaveBeenCalledTimes(1)
    expect(el.querySelector('[data-testid="support-report-downloaded"]')?.textContent).toContain(
      'ferrocast-support-',
    )
  })

  it('uses native folder picker flow in desktop mode and shows saved path or error', async () => {
    ;(window as { __FERROCAST__?: unknown }).__FERROCAST__ = { desktop: true }
    const { el, client } = await mount()

    const primary = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create support report'),
    )!
    await act(async () => {
      primary.click()
      await Promise.resolve()
    })
    expect(client.createSupportReport).toHaveBeenCalledWith(null)
    expect(el.querySelector('[data-testid="support-report-saved"]')?.textContent).toContain(
      'ferrocast-support-demo.zip',
    )

    // Failure surfaces structured describeError copy calmly
    const errClient = await mount({
      createSupportReport: vi.fn(async () => {
        throw new ApiError(400, 'invalid', 'Folder cannot be written.')
      }),
    })
    const errBtn = Array.from(errClient.el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create support report'),
    )!
    await act(async () => {
      errBtn.click()
      await Promise.resolve()
    })
    expect(errClient.el.querySelector('[role="alert"]')?.textContent).toContain(
      'Folder cannot be written.',
    )
  })
})
