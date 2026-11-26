import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FerroEvent, Overlay, OverlayState } from '@ferrocast/api'
import { AlertStage, OverlayPreview } from './AlertStage'

let root: Root | null = null

describe('AlertStage blocked preview message (Problem 10)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })

  it('shows emptyMessage instead of mounting a sandbox frame when custom code is invalid', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <AlertStage
          alert={null}
          theme="molten"
          emptyMessage={'Preview paused: custom HTML can\'t use the "onerror" attribute.'}
        />,
      ),
    )

    expect(host.textContent).toContain(
      'Preview paused: custom HTML can\'t use the "onerror" attribute.',
    )
    expect(host.querySelector('iframe')).toBeNull()
  })
})

describe('OverlayPreview incremental state updates (Finding #6)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })

  it('sends state instead of snapshot when only label/goal state updates, preserving Events DOM nodes', async () => {
    const events: FerroEvent[] = [
      {
        id: 'ev-1',
        seq: 1,
        platform: 'twitch',
        channel: null,
        source_id: 's1',
        occurred_at: 1000,
        received_at: 1000,
        origin: 'live',
        kind: {
          type: 'follow',
          actor: {
            platform: 'twitch',
            id: 'u1',
            login: 'alice',
            display_name: 'Alice',
            avatar_url: null,
            color: null,
            badges: [],
            roles: 0,
            anonymous: false,
          },
        },
      },
    ]
    const chat: FerroEvent[] = []
    const baseOverlay: Overlay = {
      id: 'ov-1',
      name: 'Main',
      url: '',
      width: 1920,
      height: 1080,
      updated_at: 0,
      widgets: [
        {
          id: 'w-events',
          kind: 'events',
          x: 40,
          y: 40,
          w: 400,
          h: 300,
          config: { kinds: ['follow'], max_items: 6, theme: 'molten' },
        },
        {
          id: 'w-label',
          kind: 'label',
          x: 500,
          y: 40,
          w: 400,
          h: 64,
          config: { source: 'latest_follower', template: 'Latest: {value}', theme: 'molten' },
        },
      ],
    }
    const baseState: OverlayState = {
      goals: [],
      labels: { 'w-label': 'Latest: LunaLagoon' },
      viewers: {},
      events,
      chat,
      poll: null,
      giveaway: null,
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<OverlayPreview overlay={baseOverlay} state={baseState} />)
    })

    const shadow = host.querySelector('[data-overlay-preview] > div')?.shadowRoot
    expect(shadow).toBeTruthy()
    const firstEventLi = shadow!.querySelector('.fc-events > li')
    expect(firstEventLi).toBeTruthy()
    expect(shadow!.querySelector('.fc-label-text')?.textContent).toBe('Latest: LunaLagoon')

    // Edit label template and labels map while keeping events/chat arrays unchanged:
    // EventsWidget DOM node must stay identical (no snapshot tear-down).
    const nextOverlay: Overlay = {
      ...baseOverlay,
      widgets: baseOverlay.widgets.map((w) =>
        w.id === 'w-label' && w.kind === 'label'
          ? { ...w, config: { ...w.config, template: 'Newest: {value}' } }
          : w,
      ),
    }
    const nextState: OverlayState = {
      ...baseState,
      labels: { 'w-label': 'Newest: LunaLagoon' },
    }
    await act(async () => {
      root!.render(<OverlayPreview overlay={nextOverlay} state={nextState} />)
    })
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    })

    expect(shadow!.querySelector('.fc-label-text')?.textContent).toBe('Newest: LunaLagoon')
    expect(shadow!.querySelector('.fc-events > li')).toBe(firstEventLi)

    // When events actually changes, a snapshot updates EventsWidget.
    const secondEvents: FerroEvent[] = [
      ...events,
      {
        ...events[0]!,
        id: 'ev-2',
        seq: 2,
      },
    ]
    await act(async () => {
      root!.render(
        <OverlayPreview overlay={nextOverlay} state={{ ...nextState, events: secondEvents }} />,
      )
    })
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    })
    expect(shadow!.querySelectorAll('.fc-events > li')).toHaveLength(2)
  })

  it('sends incremental state frames carrying links without resetting EventsWidget DOM nodes', async () => {
    const events: FerroEvent[] = [
      {
        id: 'ev-1',
        seq: 1,
        platform: 'twitch',
        channel: null,
        source_id: 's1',
        occurred_at: 1000,
        received_at: 1000,
        origin: 'live',
        kind: {
          type: 'follow',
          actor: {
            platform: 'twitch',
            id: 'u1',
            login: 'alice',
            display_name: 'Alice',
            avatar_url: null,
            color: null,
            badges: [],
            roles: 0,
            anonymous: false,
          },
        },
      },
    ]
    const chat: FerroEvent[] = []
    const baseOverlay: Overlay = {
      id: 'ov-links',
      name: 'Links',
      url: '',
      width: 1920,
      height: 1080,
      updated_at: 0,
      widgets: [
        {
          id: 'w-events',
          kind: 'events',
          x: 40,
          y: 40,
          w: 400,
          h: 300,
          config: { kinds: ['follow'], max_items: 6, theme: 'molten' },
        },
        {
          id: 'w-soc',
          kind: 'layer',
          x: 40,
          y: 900,
          w: 600,
          h: 60,
          config: { type: 'text', text: '{socials}', color: '#ffffff' },
        },
      ],
    }
    const baseState: OverlayState = {
      goals: [],
      labels: {},
      viewers: {},
      events,
      chat,
      poll: null,
      giveaway: null,
      links: null,
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<OverlayPreview overlay={baseOverlay} state={baseState} />)
    })

    const shadow = host.querySelector('[data-overlay-preview] > div')?.shadowRoot
    expect(shadow).toBeTruthy()
    const firstEventLi = shadow!.querySelector('.fc-events > li')
    expect(firstEventLi).toBeTruthy()
    expect(shadow!.querySelector('.fc-lt')?.textContent).toBe('twitch.tv/novaplays')

    await act(async () => {
      root!.render(
        <OverlayPreview
          overlay={baseOverlay}
          state={{
            ...baseState,
            links: {
              twitch: 'twitch.tv/realcreator',
              youtube: null,
              kick: null,
              facebook: null,
              discord: null,
              instagram: null,
              x: null,
              tiktok: null,
              website: null,
              custom: [],
              socials: ['twitch.tv/realcreator'],
              channel_name: 'RealCreator',
              next_stream: null,
              next_stream_at: null,
            },
          }}
        />,
      )
    })
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    })

    expect(shadow!.querySelector('.fc-lt')?.textContent).toBe('twitch.tv/realcreator')
    expect(shadow!.querySelector('.fc-events > li')).toBe(firstEventLi)

    await act(async () => {
      root!.render(<OverlayPreview overlay={baseOverlay} state={{ ...baseState, links: null }} />)
    })
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    })
    expect(shadow!.querySelector('.fc-lt')?.textContent).toBe('twitch.tv/novaplays')
    expect(shadow!.querySelector('.fc-events > li')).toBe(firstEventLi)
  })
})
