import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient, studioEngineApi, type StudioSettings } from '@ferrocast/api'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'
import { AutoConfigDialog, AutoConfigRollbackBar } from './auto-config'
import { DeskProvider, type Desk } from './common'
import { useLive } from '../../../lib/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

const mockGoLive = {
  view: async () => ({
    destinations: [
      {
        id: 'twitch',
        kind: 'twitch',
        canvas: 'main',
        name: 'Twitch',
        enabled: true,
        blocked: null,
      },
      {
        id: 'youtube',
        kind: 'youtube',
        canvas: 'main',
        name: 'YouTube',
        enabled: false,
        blocked: null,
      },
    ],
  }),
  uploadCheck: vi.fn(),
}

vi.mock('../golive', () => ({
  useGoLive: () => mockGoLive,
}))

let root: Root | null = null
let host: HTMLElement | null = null
let demo: DemoEngine | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  demo?.dispose()
  root = null
  host = null
  demo = null
  useLive.setState((s) => ({ ...s, studio: { ...s.studio, autoConfig: null } }))
})

function mkDesk(opts?: ConstructorParameters<typeof DemoEngine>[0]) {
  demo = new DemoEngine({
    autoplay: false,
    latencyMs: 0,
    studioEngine: { benchStepMs: 25, confirmTimeoutMs: 200, watchWindowMs: 500 },
    ...opts,
  })
  const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
  const api = studioEngineApi(client)
  const settings = {
    encoder: 'hardware',
    video_kbps: 6000,
    scale: null,
    fps: 60,
    width: 1920,
    height: 1080,
  } as unknown as StudioSettings
  const prefs = {
    data: settings,
    error: null,
    loading: false,
    reload: vi.fn(),
    set: vi.fn((next: StudioSettings) => {
      prefs.data = next
    }),
  }
  const desk = { api, prefs } as unknown as Desk
  return { demo, api, desk, prefs, settings }
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

describe('AutoConfigDialog & AutoConfigRollbackBar', () => {
  it('supports keyboard selection, running progress + cancel, done honest results table, Apply, Keep, and Undo', async () => {
    const { api, desk, settings } = mkDesk()
    await api.start()
    const onClose = vi.fn()
    const onApply = vi.fn()
    const onSynced = vi.fn()

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <AutoConfigDialog
            open
            onClose={onClose}
            s={settings}
            onApply={onApply}
            onSynced={onSynced}
          />
        </DeskProvider>,
      )
    })
    await flush(20)

    // 1. Idle setup state + keyboard arrow navigation across radiogroup
    const radios = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]'))
    expect(radios.length).toBeGreaterThanOrEqual(4)
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      radios[0]!.focus()
      radios[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      radios[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true')

    // 2. Start benchmark -> Running state + Cancel mid-run
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run benchmark'),
    )!
    await act(async () => {
      runBtn.click()
    })
    await flush(15)
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull()
    const cancelBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel test'),
    )!
    await act(async () => {
      cancelBtn.click()
    })
    await flush(20)
    expect(
      Array.from(document.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Run benchmark'),
      ),
    ).toBe(true)

    // 3. Re-run benchmark to completion -> Done state with tested candidates & honest numbers
    const runBtn2 = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run benchmark'),
    )!
    await act(async () => {
      runBtn2.click()
    })
    for (let i = 0; i < 30; i++) {
      await flush(30)
      if (document.body.textContent?.includes('What was tested')) break
    }
    expect(document.body.textContent).toContain('Recommended: Apple VideoToolbox')
    expect(document.body.textContent).toContain('x264 (veryfast)')
    expect(document.body.textContent).toContain('headroom')

    // 4. Edit bitrate override and Apply -> Applied state -> Keep -> Undo
    const kbpsInput = document.querySelector<HTMLInputElement>('#auto-config-kbps')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(kbpsInput, '5500')
      kbpsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const applyBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply settings'),
    )!
    await act(async () => {
      applyBtn.click()
    })
    await flush(30)
    expect(document.body.textContent).toContain('Settings applied. Keep these changes?')
    expect(document.body.textContent).toContain('Auto-undo in')

    const keepBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Keep',
    )!
    await act(async () => {
      keepBtn.click()
    })
    await flush(30)
    expect(document.body.textContent).toContain('New settings kept')

    const undoBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Undo'),
    )!
    await act(async () => {
      undoBtn.click()
    })
    await flush(30)
    expect(document.body.textContent).toContain('Restored your previous settings')
  })

  it('shows plain error when benchmark refuses while live (409) and renders persistent rollback bar', async () => {
    const { demo: d, api, desk, settings } = mkDesk()
    await api.start()
    d.studioEngine!.setStreamActive(true)

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={desk}>
          <AutoConfigRollbackBar />
          <AutoConfigDialog open onClose={() => {}} s={settings} onApply={() => {}} />
        </DeskProvider>,
      )
    })
    await flush(20)

    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run benchmark'),
    )!
    await act(async () => {
      runBtn.click()
    })
    await flush(30)
    expect(document.body.textContent).toContain(
      'Stop streaming and recording before testing the encoder.',
    )

    // First-minute dropped frames trigger automatic rollback on the persistent bar too.
    d.studioEngine!.setStreamActive(false)
    const retryBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again'),
    )!
    await act(async () => {
      retryBtn.click()
    })
    for (let i = 0; i < 30; i++) {
      await flush(30)
      if (document.body.textContent?.includes('What was tested')) break
    }
    const applyBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply settings'),
    )!
    await act(async () => {
      applyBtn.click()
    })
    await flush(30)
    const keepBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Keep'),
    )!
    await act(async () => {
      keepBtn.click()
    })
    await flush(30)
    await act(async () => {
      d.studioEngine!.injectDroppedFrames(7, 2)
    })
    await flush(600)
    expect(document.body.textContent).toContain('dropped frames')
  })
})
