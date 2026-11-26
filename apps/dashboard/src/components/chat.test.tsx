// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Roles, type FerroEvent } from '@ferrocast/api'
import { useLive } from '../lib/store'
import { ChatLine, lineActions, type ChatActions } from './chat'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function chatEvent(over: {
  id?: string
  platform?: 'twitch' | 'youtube' | 'kick'
  roles?: number
  name?: string
  text?: string
  source_id?: string | null
}): FerroEvent {
  return {
    id: over.id ?? 'ev-1',
    platform: over.platform ?? 'kick',
    origin: 'live',
    received_at: 1_700_000_000_000,
    source_id: over.source_id === undefined ? 'msg-1' : over.source_id,
    kind: {
      type: 'chat_message',
      actor: {
        platform: over.platform ?? 'kick',
        id: 'u-1',
        login: (over.name ?? 'Streamer').toLowerCase(),
        display_name: over.name ?? 'Streamer',
        avatar_url: null,
        color: null,
        roles: over.roles ?? Roles.BROADCASTER,
        badges: [],
        anonymous: false,
      },
      content: {
        text: over.text ?? 'Hey guys',
        fragments: [{ type: 'text', text: over.text ?? 'Hey guys' }],
      },
      reply_to: null,
      is_action: false,
    },
  } as unknown as FerroEvent
}

function makeActions(over: Partial<ChatActions> = {}): ChatActions {
  return {
    approve: vi.fn(),
    drop: vi.fn(),
    reply: vi.fn(),
    remove: vi.fn(),
    timeout: vi.fn(),
    ban: vi.fn(),
    highlight: vi.fn(),
    highlightedId: null,
    card: vi.fn(),
    sheet: vi.fn(),
    ...over,
  }
}

describe('lineActions', () => {
  it('exposes highlight only when online, not held, and highlight handler exists', () => {
    const ev = chatEvent({})
    expect(lineActions({ highlight: vi.fn() }, ev)).toMatchObject({ highlight: true })
    expect(lineActions({ highlight: vi.fn(), offline: true }, ev)).toMatchObject({
      highlight: false,
    })
    expect(lineActions({ highlight: vi.fn() }, ev, true)).toMatchObject({ highlight: false })
    expect(lineActions({}, ev)).toMatchObject({ highlight: false })
  })
})

describe('ChatLine inline pin button', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'))
    useLive.setState({ chatters: new Map() })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host.remove()
  })

  async function renderLine(props: {
    event: FerroEvent
    actions: ChatActions | null
    dense?: boolean
    deleted?: boolean
    held?: string
  }) {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <ul className="@container">
          <ChatLine
            event={props.event}
            now={1_700_000_010_000}
            deleted={props.deleted ?? false}
            held={props.held}
            actions={props.actions}
            {...(props.dense !== undefined ? { dense: props.dense } : {})}
          />
        </ul>,
      )
    })
  }

  it('renders an inline Pin button (not a floating bordered box) on broadcaster rows with title="Pin"', async () => {
    const actions = makeActions()
    const ev = chatEvent({ roles: Roles.BROADCASTER, text: 'Hey guys' })
    await renderLine({ event: ev, actions })

    const li = host.querySelector('li.fc-row') as HTMLElement
    const pinBtn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLButtonElement
    expect(pinBtn).not.toBeNull()
    expect(pinBtn.getAttribute('title')).toBe('Pin')
    expect(pinBtn.getAttribute('aria-pressed')).toBe('false')
    // Must not sit inside an absolute floating bordered toolbar box.
    expect(pinBtn.closest('.absolute')).toBeNull()
    expect(pinBtn.closest('.shadow-2')).toBeNull()
    // Inline in trailing slot as a sibling after the message text div (not inside message text).
    const msgDiv = li.children[1] as HTMLElement
    expect(msgDiv.contains(pinBtn)).toBe(false)
    // Shares the trailing grid slot with <time> (and <time> hides on hover/focus).
    const timeEl = li.querySelector('time') as HTMLElement
    expect(timeEl).not.toBeNull()
    expect(pinBtn.parentElement?.contains(timeEl)).toBe(true)
    expect(timeEl.className).toContain('group-hover:opacity-0')
    expect(timeEl.className).toContain('group-focus-within:opacity-0')
    // Focus-visible & group-focus-within make it visible on Tab.
    expect(pinBtn.className).toContain('group-focus-within:opacity-100')

    await act(async () => pinBtn.click())
    expect(actions.highlight).toHaveBeenCalledWith(ev)
  })

  it('toggles title="Unpin", aria-pressed="true", stays visible, and hides <time> when pinned', async () => {
    const ev = chatEvent({ id: 'ev-pin', roles: Roles.BROADCASTER })
    const actions = makeActions({ highlightedId: 'ev-pin' })
    await renderLine({ event: ev, actions })

    const li = host.querySelector('li.fc-row') as HTMLElement
    const unpinBtn = li.querySelector(
      'button[aria-label="Unpin message from stream"]',
    ) as HTMLButtonElement
    expect(unpinBtn).not.toBeNull()
    expect(unpinBtn.getAttribute('title')).toBe('Unpin')
    expect(unpinBtn.getAttribute('aria-pressed')).toBe('true')
    expect(unpinBtn.className).toContain('opacity-100')
    expect(unpinBtn.className).not.toContain('opacity-0')

    const timeEl = li.querySelector('time') as HTMLElement
    expect(timeEl.className).toContain('opacity-0')
  })

  it('keeps the trailing slot inline in dense mode and hides pin when highlight is disallowed', async () => {
    const ev = chatEvent({ roles: Roles.BROADCASTER })
    await renderLine({ event: ev, actions: makeActions(), dense: true })
    const li = host.querySelector('li.fc-row') as HTMLElement
    expect(li.querySelector('time')).toBeNull()
    const pinBtn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLButtonElement
    expect(pinBtn).not.toBeNull()
    expect(pinBtn.className).toContain('size-[26px]')

    // Without highlight capability (cloud / mod phone), no Pin button and <time> stays visible.
    await renderLine({
      event: ev,
      actions: makeActions({ highlight: undefined }),
      dense: false,
    })
    expect(host.querySelector('button[aria-label*="Pin"]')).toBeNull()
    const timeEl = host.querySelector('time') as HTMLElement
    expect(timeEl.className).not.toContain('opacity-0')
  })

  it('places viewer row Pin inline in the trailing slot while keeping moderation actions accessible', async () => {
    const ev = chatEvent({ id: 'ev-viewer', roles: 0, name: 'ViewerOne', text: 'GGs!' })
    const actions = makeActions()
    await renderLine({ event: ev, actions })

    const li = host.querySelector('li.fc-row') as HTMLElement
    const pinBtn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLButtonElement
    const timeEl = li.querySelector('time') as HTMLElement
    expect(pinBtn).not.toBeNull()
    expect(pinBtn.getAttribute('title')).toBe('Pin')
    expect(pinBtn.closest('.absolute')).toBeNull()
    expect(pinBtn.parentElement?.contains(timeEl)).toBe(true)

    for (const label of [
      'Reply on the same platform',
      'Delete message',
      'Time out for 10 minutes',
      'Ban everywhere',
      'Viewer card',
    ]) {
      expect(li.querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
    }
  })
})
