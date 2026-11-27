import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FerroClient, type Connectors, type PollsCapabilities, type PollView } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine } from '@ferrocast/api/demo'
import { PollPanel } from './polls'
import { useLive } from '../../lib/store'

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
}

let root: Root | null = null
let engine: DemoEngine | null = null

const CONNECTED = {
  state: 'connected' as const,
  account: { name: 'NovaPlays', avatar_url: null },
  detail: null,
  last_event_at: 1000,
}
const OFF = { state: 'off' as const, account: null, detail: null, last_event_at: null }

function setStore(client: FerroClient, connectors?: Connectors, youtubeLive = true) {
  const effectiveConnectors = connectors ?? {
    twitch: CONNECTED,
    youtube: CONNECTED,
    kick: CONNECTED,
    facebook: OFF,
    obs: OFF,
    relay: { state: 'connected', account: null, detail: null, last_event_at: null },
  }
  useLive.setState({
    conn: {
      mode: 'demo',
      client,
      socket: engine
        ? (u) => engine!.socket(u)
        : ((() => {
            throw new Error('no socket')
          }) as never),
    },
    connectors: effectiveConnectors,
    status: {
      version: '3.7.0',
      port: 47820,
      live: { twitch: true, youtube: youtubeLive, kick: true },
      connectors: effectiveConnectors,
      setup_done: true,
    },
    poll: undefined,
    notices: [],
  })
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  engine?.dispose()
  engine = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null, connectors: null, status: null, poll: undefined, notices: [] })
  vi.restoreAllMocks()
})

describe('PollPanel', () => {
  it('shows load error and retries cleanly', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    let calls = 0
    const mockClient = {
      poll: vi.fn(() => {
        calls += 1
        return calls === 1 ? Promise.reject(new Error('Engine unreachable')) : Promise.resolve(null)
      }),
      pollCapabilities: vi.fn(async (): Promise<PollsCapabilities> => ({ platforms: [] })),
    } as unknown as FerroClient
    setStore(mockClient)

    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MotionConfig reducedMotion="always">
          <PollPanel />
        </MotionConfig>,
      )
    })
    await flushUi()

    expect(host.textContent).toContain('Try again')
    const retryBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Try again'),
    )
    expect(retryBtn).toBeTruthy()
    await act(async () => {
      retryBtn!.click()
    })
    await flushUi()
    expect(host.querySelector('input[placeholder*="Ask viewers"]')).toBeTruthy()
  })

  it('shows platform capabilities, uses 1. prefixes when all native, and lets user start untimed No timer poll', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    setStore(client)

    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MotionConfig reducedMotion="always">
          <PollPanel />
        </MotionConfig>,
      )
    })
    await flushUi()

    const modeStrip = host.querySelector('[aria-label="Platform poll modes"]')!
    expect(modeStrip.textContent).toContain('Native')
    expect(modeStrip.textContent).toContain('!vote')

    // Toggle chat_fallback off, pick No timer, fill question + Yes or no preset, submit.
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => {
      checkbox.click()
    })
    const noTimerLabel = [
      ...host.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label'),
    ].find((l) => l.textContent?.includes('No timer'))
    const noTimerRadio = noTimerLabel?.querySelector('input') ?? null
    expect(noTimerRadio).toBeTruthy()
    await act(async () => {
      noTimerRadio?.click()
    })
    const qInput = host.querySelector<HTMLInputElement>('input[placeholder*="Ask viewers"]')!
    await act(async () => {
      setInput(qInput, 'Wait for boss?')
    })
    const presetBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Yes or no',
    )!
    await act(async () => {
      presetBtn.click()
    })
    const form = host.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flushUi()

    expect(host.textContent).toContain('No timer')
    expect(host.textContent).toContain('Live')
    expect(host.textContent).toContain('Wait for boss?')

    // End now -> closed -> Ask again preserves `duration_s: null` and `chat_fallback: false`.
    const endBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('End now'),
    )!
    await act(async () => {
      endBtn.click()
    })
    await flushUi()

    expect(host.textContent).toContain('Poll closed.')
    const askAgainBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ask again'),
    )!
    await act(async () => {
      askAgainBtn.click()
    })
    await flushUi()

    const noTimerAgainLabel = [
      ...host.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label'),
    ].find((l) => l.textContent?.includes('No timer'))
    const noTimerAgain = noTimerAgainLabel?.querySelector('input') ?? null
    expect(noTimerAgain?.checked).toBe(true)
    const fallbackAgain = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(fallbackAgain.checked).toBe(false)
  })

  it('shows Reconnect button when Twitch needs scopes and switches labels to 1. when all platforms are native', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, twitchPollScopeMissing: true })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    setStore(client)

    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MotionConfig reducedMotion="always">
          <PollPanel />
        </MotionConfig>,
      )
    })
    await flushUi()

    const reconnectBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Reconnect',
    )
    expect(reconnectBtn).toBeTruthy()
    await act(async () => {
      reconnectBtn!.click()
    })
    await flushUi()

    expect(document.body.textContent).toContain('FRRO-4821')

    // All-native capability hides `!vote N` prefix in compose inputs and uses `1.`.
    const nativeOnlyClient = {
      poll: vi.fn(async (): Promise<PollView | null> => null),
      pollCapabilities: vi.fn(async (): Promise<PollsCapabilities> => ({
        platforms: [
          {
            platform: 'twitch',
            mode: 'native',
            limits: {
              min_options: 2,
              max_options: 5,
              min_duration_s: 15,
              max_duration_s: 1800,
              supports_no_timer: true,
              question_chars: 60,
              option_chars: 25,
            },
          },
        ],
      })),
    } as unknown as FerroClient

    await act(async () => {
      root!.unmount()
    })
    document.body.innerHTML = ''
    setStore(nativeOnlyClient)
    const host2 = document.createElement('div')
    document.body.appendChild(host2)
    root = createRoot(host2)
    await act(async () => {
      root!.render(
        <MotionConfig reducedMotion="always">
          <PollPanel />
        </MotionConfig>,
      )
    })
    await flushUi()

    expect(host2.textContent).toContain('1.')
    expect(host2.textContent).not.toContain('!vote 1')
    expect(host2.querySelector('input[type="checkbox"]')).toBeNull()
  })
})
