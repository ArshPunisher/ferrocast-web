import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getPreviewOverlays, resetPreviewOverlayRegistry } from '@ferrocast/ui'
import type { ConnectorState, Connectors, GoLiveFrame } from '@ferrocast/api'
import {
  buildStatusChips,
  computeStatusStripLayout,
  pickTopChipIndex,
  stateCopy,
} from './status-strip'
import { StatusStrip } from '../components/StatusStrip'
import { useLive } from './store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function conn(
  state: ConnectorState['state'],
  account: string | null = null,
  detail: string | null = null,
  last_event_at: number | null = state === 'connected' ? 1 : null,
): ConnectorState {
  return {
    state,
    account: account ? { name: account, avatar_url: null } : null,
    detail,
    last_event_at,
  }
}

function makeConnectors(overrides: Partial<Connectors> = {}): Connectors {
  return {
    twitch: conn('connected', 'NovaPlays'),
    youtube: conn('connected', 'Nova Plays'),
    kick: conn('connected', 'novaplays'),
    facebook: conn('off'),
    obs: conn('connected', 'OBS 31.1.2'),
    relay: conn('connected'),
    ...overrides,
  }
}

describe('status-strip chip builder and degrade logic', () => {
  it('translates connector states including first connect vs reconnect', () => {
    expect(stateCopy(conn('connected'))).toEqual({ label: 'Connected', tone: 'ok' })
    expect(stateCopy(conn('reconnecting', null, null, null))).toEqual({
      label: 'Connecting',
      tone: 'warn',
    })
    expect(stateCopy(conn('reconnecting', 'Nova', null, 123))).toEqual({
      label: 'Reconnecting',
      tone: 'warn',
    })
    expect(stateCopy(conn('disconnected'))).toEqual({ label: 'Disconnected', tone: 'danger' })
    expect(stateCopy(conn('sign_in_needed'))).toEqual({ label: 'Sign in again', tone: 'danger' })
    expect(stateCopy(conn('scopes_missing'))).toEqual({ label: 'Needs permission', tone: 'warn' })
    expect(stateCopy(conn('off'))).toEqual({ label: 'Not connected', tone: 'off' })
  })

  it('builds ordered chips, hides unused obs/facebook, and flags relay delay + golive issues', () => {
    const golive = {
      live: true,
      destinations: [
        {
          kind: 'kick',
          enabled: true,
          canvas: 'main',
          blocked: false,
          health: { state: 'reconnecting' },
        },
      ],
    } as unknown as GoLiveFrame

    const items = buildStatusChips({
      connectors: makeConnectors({
        facebook: conn('sign_in_needed'),
        relay: conn('reconnecting'),
      }),
      viewers: { twitch: 1420, youtube: 680, kick: 57 },
      golive,
      usesObs: false,
      cloud: false,
    })

    expect(items.map((i) => i.name)).toEqual(['twitch', 'youtube', 'kick', 'facebook'])
    expect(items[0]?.viewersCompact).toBe('1,420')
    expect(items[2]?.late).toBe(true)
    expect(items[2]?.streamIssue).toEqual({ text: 'stream reconnecting', danger: false })
    expect(items[2]?.title).toContain('Go live: stream reconnecting')
    expect(items[3]?.tone).toBe('danger')
    expect(items[3]?.href).toBe('#/settings/accounts')

    const cloudItems = buildStatusChips({
      connectors: makeConnectors(),
      viewers: {},
      golive: null,
      usesObs: true,
      cloud: true,
    })
    expect(cloudItems.every((i) => i.href === '#/cloud')).toBe(true)
  })

  it('picks the top live platform by viewers, falling back to attention chip then first', () => {
    const items = buildStatusChips({
      connectors: makeConnectors({
        twitch: conn('off'),
        youtube: conn('connected', 'YT'),
        kick: conn('connected', 'Kick'),
      }),
      viewers: { youtube: 680, kick: 940 },
      golive: null,
      usesObs: true,
      cloud: false,
    })
    // Kick has more live viewers than YouTube while Twitch is off.
    expect(items[pickTopChipIndex(items)]?.name).toBe('kick')

    const offlineItems = buildStatusChips({
      connectors: makeConnectors({
        twitch: conn('off'),
        youtube: conn('sign_in_needed'),
        kick: conn('off'),
        obs: conn('off'),
      }),
      viewers: {},
      golive: null,
      usesObs: true,
      cloud: false,
    })
    expect(offlineItems[pickTopChipIndex(offlineItems)]?.name).toBe('youtube')
  })

  it('degrades smoothly across full -> full-short -> icons -> overflow with +N attention state', () => {
    const items = buildStatusChips({
      connectors: makeConnectors({ kick: conn('off') }),
      viewers: { twitch: 1420, youtube: 680 },
      golive: null,
      usesObs: true,
      cloud: false,
    })

    // Null / unmeasured width defaults to full labels + viewer unit.
    const unmeasured = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: null,
    })
    expect(unmeasured.mode).toBe('full')
    expect(unmeasured.showViewerUnit).toBe(true)
    expect(unmeasured.overflowItems).toEqual([])

    // Wide desktop (e.g. 1440 / 1280): full labels + viewers unit.
    const wide = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: 900,
    })
    expect(wide.mode).toBe('full')
    expect(wide.showViewerUnit).toBe(true)

    // Medium-tight: drops "viewers" word while keeping full platform names.
    const fullShort = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: 700,
    })
    expect(fullShort.mode).toBe('full')
    expect(fullShort.showViewerUnit).toBe(false)

    // Medium (e.g. ~820px window): icon + status dot + count only.
    const icons = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: 340,
    })
    expect(icons.mode).toBe('icons')
    expect(icons.visibleItems).toHaveLength(4)
    expect(icons.overflowItems).toEqual([])

    // Narrow (e.g. 375px phone): top chip + "+3" with warn dot (Kick is off).
    const narrow = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: 190,
    })
    expect(narrow.mode).toBe('overflow')
    expect(narrow.visibleItems.map((i) => i.name)).toEqual(['twitch'])
    expect(narrow.overflowItems.map((i) => i.name)).toEqual(['youtube', 'kick', 'obs'])
    expect(narrow.overflowAttention).toBe('warn')

    // Danger inside overflow elevates attention tone to danger.
    const dangerItems = buildStatusChips({
      connectors: makeConnectors({ kick: conn('sign_in_needed') }),
      viewers: { twitch: 1420, youtube: 680 },
      golive: null,
      usesObs: true,
      cloud: false,
    })
    const narrowDanger = computeStatusStripLayout({
      items: dangerItems,
      socket: 'open',
      availableWidth: 190,
    })
    expect(narrowDanger.overflowAttention).toBe('danger')

    // All connected & healthy: no attention dot on +N.
    const healthyItems = buildStatusChips({
      connectors: makeConnectors(),
      viewers: { twitch: 412, youtube: 188, kick: 57 },
      golive: null,
      usesObs: true,
      cloud: false,
    })
    const narrowHealthy = computeStatusStripLayout({
      items: healthyItems,
      socket: 'open',
      availableWidth: 190,
    })
    expect(narrowHealthy.overflowAttention).toBe('none')
  })

  it('compacts top chip and socket pill when extremely narrow while reconnecting', () => {
    const items = buildStatusChips({
      connectors: makeConnectors(),
      viewers: { twitch: 1420, youtube: 680, kick: 57 },
      golive: null,
      usesObs: true,
      cloud: false,
    })
    const tight = computeStatusStripLayout({
      items,
      socket: 'retrying',
      availableWidth: 150,
    })
    expect(tight.mode).toBe('overflow')
    expect(tight.compactTopChip).toBe(true)
    expect(tight.compactSocket).toBe(true)
  })

  it('respects measured DOM minWidths overrides when font metrics exceed estimates', () => {
    const items = buildStatusChips({
      connectors: makeConnectors(),
      viewers: { twitch: 412, youtube: 188, kick: 57 },
      golive: null,
      usesObs: true,
      cloud: false,
    })
    const steppedDown = computeStatusStripLayout({
      items,
      socket: 'open',
      availableWidth: 700,
      minWidths: { 'full-unit': 720, 'full-short': 710 },
    })
    expect(steppedDown.mode).toBe('icons')
  })
})

describe('StatusStrip component states', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
    resetPreviewOverlayRegistry()
  })

  it('renders loading skeletons when loading and connectors are not yet ready', () => {
    useLive.setState({ conn: null, connectors: null, socket: 'open', viewers: {} })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root?.render(createElement(StatusStrip, { loading: true })))
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(host.querySelectorAll('.fc-skeleton')).toHaveLength(3)
  })

  it('portals summary overflow popover via PopoverSurface and registers in PreviewOverlayRegistry', async () => {
    resetPreviewOverlayRegistry()
    useLive.setState({
      conn: null,
      connectors: makeConnectors(),
      socket: 'open',
      viewers: { twitch: 12, youtube: 8, kick: 3 },
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root?.render(createElement(StatusStrip, { summary: true })))

    const btn = host.querySelector('[data-testid="connections-overflow"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    btn.getBoundingClientRect = () =>
      ({ left: 20, top: 8, right: 140, bottom: 40, width: 120, height: 32 }) as DOMRect

    await act(async () => btn.click())

    const pop = document.body.querySelector(
      '[data-testid="connections-overflow-popover"]',
    ) as HTMLElement
    expect(pop).toBeTruthy()
    expect(getPreviewOverlays().some((e) => e.target === pop)).toBe(true)
  })
})
