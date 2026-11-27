import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountPlatform, ConnectFlow, ConnectorState, Connectors } from '@ferrocast/api'
import { useConnect } from './accounts'
import { useLive } from '../lib/store'

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
}

const mockConnect = vi.fn<(p: AccountPlatform) => Promise<ConnectFlow>>()

vi.mock('../lib/hooks', async () => {
  const actual = await vi.importActual<typeof import('../lib/hooks')>('../lib/hooks')
  return {
    ...actual,
    useClient: () => ({ connect: mockConnect }),
  }
})

function makeConnectors(twitch: ConnectorState): Connectors {
  const off: ConnectorState = { state: 'off', account: null, detail: null, last_event_at: null }
  return {
    twitch,
    youtube: off,
    kick: off,
    facebook: off,
    obs: off,
    relay: { state: 'connected', account: null, detail: null, last_event_at: null },
  }
}

function Harness({ onConnected }: { onConnected: (p: AccountPlatform) => void }) {
  const { connect, dialog } = useConnect(onConnected)
  return (
    <MotionConfig reducedMotion="always">
      <div>
        <button type="button" onClick={() => void connect('twitch')}>
          Reconnect
        </button>
        {dialog}
      </div>
    </MotionConfig>
  )
}

let root: Root | null = null

afterEach(async () => {
  vi.useRealTimers()
  vi.clearAllMocks()
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
  useLive.setState({ connectors: null, notices: [] })
})

describe('useConnect', () => {
  it('keeps the device code dialog open when reconnecting an already connected platform until approval finishes', async () => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    useLive.setState({
      connectors: makeConnectors({
        state: 'connected',
        account: { name: 'NovaPlays', avatar_url: null },
        detail: null,
        last_event_at: 1000,
      }),
      notices: [],
    })

    mockConnect.mockResolvedValue({
      flow: 'device_code',
      user_code: 'FRRO-4821',
      verification_url: 'https://www.twitch.tv/activate',
      expires_at: Date.now() + 600_000,
    })

    const onConnected = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(<Harness onConnected={onConnected} />)
    })

    const btn = host.querySelector('button')!
    await act(async () => {
      btn.click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('FRRO-4821')

    // Even after >900ms while connectors state still says `connected`, incoming chat events
    // bumping `last_event_at` must NOT auto-close the dialog before leaving `connected`.
    await act(async () => {
      useLive.setState({
        connectors: makeConnectors({
          state: 'connected',
          account: { name: 'NovaPlays', avatar_url: null },
          detail: null,
          last_event_at: 2500,
        }),
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(document.body.textContent).toContain('FRRO-4821')
    expect(onConnected).not.toHaveBeenCalled()

    // Backend transitions to `reconnecting`, then back to `connected` after Twitch approval.
    await act(async () => {
      useLive.setState({
        connectors: makeConnectors({
          state: 'reconnecting',
          account: null,
          detail: 'Waiting for you to finish signing in…',
          last_event_at: 2000,
        }),
      })
    })
    expect(document.body.textContent).toContain('FRRO-4821')

    await act(async () => {
      useLive.setState({
        connectors: makeConnectors({
          state: 'connected',
          account: { name: 'NovaPlays', avatar_url: null },
          detail: null,
          last_event_at: 3000,
        }),
      })
    })

    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(onConnected).toHaveBeenCalledWith('twitch')
    expect(document.body.textContent).toContain('Twitch connected')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(document.body.textContent).not.toContain('FRRO-4821')
  })
})
