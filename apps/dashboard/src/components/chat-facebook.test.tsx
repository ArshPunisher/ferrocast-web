import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FerroEvent } from '@ferrocast/api'
import { Composer, lineActions } from './chat'
import { useLive } from '../lib/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useLive.setState({ conn: null })
})

const comment = (platform: 'facebook' | 'twitch'): FerroEvent =>
  ({
    id: 'e1',
    platform,
    source_id: 'src-1',
    kind: { type: 'chat_message' },
  }) as unknown as FerroEvent

describe('a Facebook comment line', () => {
  it('can be removed, but offers no timeout or ban (Facebook lets apps do neither)', () => {
    const a = lineActions({}, comment('facebook'))
    expect(a.remove).toBe(true)
    expect(a.timeout).toBe(false)
    expect(a.ban).toBe(false)
    const t = lineActions({}, comment('twitch'))
    expect(t.timeout && t.ban && t.remove).toBe(true)
  })
})

function setup(reply: Parameters<typeof Composer>[0]['reply']) {
  const send = vi.fn(async () => ({ sent: ['facebook'], failed: [] }))
  useLive.setState({
    conn: { client: { send } } as never,
    connectors: {
      twitch: { state: 'connected' },
      youtube: { state: 'off' },
      kick: { state: 'off' },
      facebook: { state: 'connected' },
    } as never,
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(<Composer reply={reply} onClearReply={() => {}} />))
  return { send, el: host }
}

function type(el: HTMLElement, text: string) {
  const ta = el.querySelector('textarea') as HTMLTextAreaElement
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    set?.call(ta, text)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
  })
}

describe('the composer', () => {
  it('sends a reply to the platform of the comment, not to all', async () => {
    const { send, el } = setup({ event: comment('facebook'), name: 'Asha' } as never)
    type(el, 'thanks!')
    await act(async () => {})
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('thanks!', ['facebook'], {
      platform: 'facebook',
      message_id: 'src-1',
    })
  })

  it('offers Facebook as a place to send to once it is connected', () => {
    const { el } = setup(null)
    expect(el.querySelector('[title="Only Facebook"]')).not.toBeNull()
    expect(el.querySelector('[title="Only Twitch"]')).not.toBeNull()
    expect(el.querySelector('[title="Only Kick"]')).toBeNull()
  })
})
