import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient, studioEngineApi, type StudioSettings } from '@ferrocast/api'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'
import { AutoConfigDialog, AutoConfigRollbackBar } from './auto-config'
import { SettingsDialog } from './settings'
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
  useLive.setState((s) => ({
    ...s,
    conn: null,
    resyncs: 0,
    studio: { ...s.studio, autoConfig: null },
  }))
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
    for (let i = 0; i < 40; i++) {
      await flush(30)
      if (document.body.textContent?.includes('Recommended:')) break
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
    for (let i = 0; i < 40; i++) {
      await flush(30)
      if (document.body.textContent?.includes('Recommended:')) break
    }
    const kbpsInput = document.querySelector<HTMLInputElement>('#auto-config-kbps')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(kbpsInput, '7500')
      kbpsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
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

    // C5: go live -> network drops alone ignored; encoder drops deferred until stream ends.
    d.studioEngine!.setStreamActive(true)
    await act(async () => {
      d.studioEngine!.injectDroppedFrames(12, 0)
    })
    await flush(60)
    expect((await api.autoConfig()).rollback_offered).toBe(false)

    await act(async () => {
      d.studioEngine!.injectDroppedFrames(0, 7)
    })
    await flush(60)
    // Never mutates or shows dropped-rollback mid-stream.
    expect((await api.studioSettings()).video_kbps).toBe(7500)

    await act(async () => {
      d.studioEngine!.setStreamActive(false)
    })
    await flush(600)
    expect(document.body.textContent).toContain('dropped')
    expect(document.body.textContent).toContain('Undo')
  })

  it('covers M5 & L1: no refetch on radio click, running bar + resync refetch, inline bitrate validation, and Settings draft preservation', async () => {
    const { demo: d, api, desk, settings, prefs } = mkDesk()
    await api.start()
    useLive.setState({ conn: { client: { request: vi.fn() } } as never })
    const deskFull = {
      ...desk,
      kinds: { data: { encoders: [], inputs: [] } },
      prefs,
    } as unknown as Desk
    const autoConfigSpy = vi.spyOn(desk.api, 'autoConfig')

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <DeskProvider value={deskFull}>
          <AutoConfigRollbackBar />
          <SettingsDialog open onClose={() => {}} start="audio" />
          <AutoConfigDialog open onClose={() => {}} s={settings} onApply={() => {}} />
        </DeskProvider>,
      )
    })
    await flush(40)
    const callsAfterMount = autoConfigSpy.mock.calls.length

    // M5.1: clicking radio choices must not refetch GET /auto-config
    const recordRadio = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (el) => el.textContent?.includes('Recording'),
    )!
    await act(async () => {
      recordRadio.click()
    })
    await flush(20)
    expect(autoConfigSpy).toHaveBeenCalledTimes(callsAfterMount)

    // L1: resyncs increment triggers AutoConfigRollbackBar refetch
    await act(async () => {
      useLive.setState((s) => ({ ...s, resyncs: s.resyncs + 1 }))
    })
    await flush(30)
    expect(autoConfigSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)

    // Make an unrelated dirty edit on Audio page (switch sample rate) inside SettingsDialog
    const rate44 = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]')).find((el) =>
      el.textContent?.includes('44.1'),
    )
    if (rate44) {
      await act(async () => {
        rate44.click()
      })
      await flush(20)
      expect(document.body.textContent).toContain('Not saved yet')
    }

    // M5.2: running benchmark renders compact progress bar on AutoConfigRollbackBar even if dialog closes
    d.studioEngine!.configure({ benchStepMs: 120 })
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run benchmark'),
    )!
    await act(async () => {
      runBtn.click()
    })
    await act(async () => {
      root!.render(
        <DeskProvider value={deskFull}>
          <AutoConfigRollbackBar />
          <SettingsDialog open onClose={() => {}} start="audio" />
        </DeskProvider>,
      )
    })
    await flush(20)
    expect(document.body.textContent).toMatch(/Benchmark|Step 1|Step 2|Probing|Upload|Testing/i)
    d.studioEngine!.configure({ benchStepMs: 20 })

    // Re-open dialog & finish benchmark
    await act(async () => {
      root!.render(
        <DeskProvider value={deskFull}>
          <AutoConfigRollbackBar />
          <SettingsDialog open onClose={() => {}} start="audio" />
          <AutoConfigDialog open onClose={() => {}} s={settings} onApply={() => {}} />
        </DeskProvider>,
      )
    })
    for (let i = 0; i < 40; i++) {
      await flush(30)
      if (document.body.textContent?.includes('Recommended:')) break
    }

    // M5.3: invalid bitrate shows inline validation error & blocks Apply
    const kbpsInput = document.querySelector<HTMLInputElement>('#auto-config-kbps')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(kbpsInput, '200')
      kbpsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush(20)
    expect(document.body.textContent).toMatch(/500.*60,?000|between 500/i)
    const applyBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply settings'),
    ) as HTMLButtonElement
    expect(applyBtn.disabled).toBe(true)

    // Fix bitrate and Apply -> dirty Audio edit ("Not saved yet") must still survive Settings rollback!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(kbpsInput, '5500')
      kbpsInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      applyBtn.click()
    })
    await flush(40)
    if (rate44) {
      expect(document.body.textContent).toContain('Not saved yet')
    }
  })

  it('covers M6 & L2: clean heading level h3, aria-labelledby radiogroups, token colors, no ticking live-region spam, canvas size summary, and non-redundant kbps label', async () => {
    const { api, desk, settings } = mkDesk()
    await api.start()

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
    await flush(30)

    // M6.3: radiogroups match visible prompts via aria-labelledby
    const radiogroups = Array.from(document.querySelectorAll('[role="radiogroup"]'))
    expect(radiogroups.length).toBe(2)
    expect(radiogroups[0]?.hasAttribute('aria-labelledby')).toBe(true)
    expect(radiogroups[1]?.hasAttribute('aria-labelledby')).toBe(true)

    // M6.4: no hardcoded hex inline styles (#ef4444 / #64748b)
    expect(host.innerHTML).not.toMatch(
      /#ef4444|#64748b|rgb\(239,\s*68,\s*68\)|rgb\(100,\s*116,\s*139\)/i,
    )

    // Run to Done
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run benchmark'),
    )!
    await act(async () => {
      runBtn.click()
    })
    for (let i = 0; i < 40; i++) {
      await flush(30)
      if (document.body.textContent?.includes('Recommended:')) break
    }

    // M6.2: CandidateList uses h3 (never skips h3 -> h4)
    expect(document.querySelector('h4')).toBeNull()
    expect(document.querySelector('h3')?.textContent).toContain('What was tested')

    // L2.2: #auto-config-kbps relies on <label for="auto-config-kbps">, no duplicate aria-label
    const kbps = document.querySelector<HTMLInputElement>('#auto-config-kbps')!
    expect(kbps.hasAttribute('aria-label')).toBe(false)

    const applyBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply settings'),
    )!
    await act(async () => {
      applyBtn.click()
    })
    await flush(30)

    // L2.1: native canvas shows actual dimensions (1920×1080) instead of "Canvas size"
    expect(document.body.textContent).not.toContain('Canvas size')
    expect(document.body.textContent).toContain('1920×1080')

    // M6.1: role="status" never wraps ticking seconds ("Auto-undo in", "Keep within", "guard active")
    const statusRegions = Array.from(document.querySelectorAll('[role="status"]'))
    for (const el of statusRegions) {
      expect(el.textContent).not.toMatch(/\d+\s*s\s*(left|or automatic|1st-min)|Auto-undo in \d+/i)
    }
  })
})
