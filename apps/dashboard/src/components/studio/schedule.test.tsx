import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ScheduledStream } from '@ferrocast/api'
import { Plan, PlanDialog } from './schedule'
import { StatusStrip } from '../StatusStrip'
import { useLive } from '../../lib/store'
import { httpsUrl } from '../../lib/external'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function plan(url: string): ScheduledStream {
  return {
    id: 'p1',
    info: { title: 'Friday stream' },
    platforms: ['facebook'],
    start_ms: 2_000_000_000_000,
    remind_minutes: 10,
    reminded: false,
    broadcasts: [{ platform: 'facebook', id: 'lv1', ...(url ? { url } : {}) }],
  }
}

function render(s: ScheduledStream): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root?.render(
      <ul>
        <Plan s={s} now={0} busy={false} onDelete={() => {}} />
      </ul>,
    ),
  )
  return host
}

describe('a planned stream links to its broadcast', () => {
  it('only to an https address, never javascript: or a path of this page', () => {
    for (const bad of [
      'javascript:alert(document.cookie)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>1</script>',
      'http://www.facebook.com/p/videos/1',
      '/page/videos/1',
      '//evil.example/x',
      'https://user:pass@evil.example/x',
      '',
    ]) {
      const el = render(plan(bad))
      expect(el.querySelector('a'), JSON.stringify(bad)).toBeNull()
      act(() => root?.unmount())
      el.remove()
    }
  })

  it('opens a good one the way every outside link opens', () => {
    const el = render(plan('https://www.facebook.com/page/videos/1'))
    const a = el.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://www.facebook.com/page/videos/1')
    expect(a?.getAttribute('rel')).toContain('noopener')
  })
})

describe('httpsUrl', () => {
  it('is the address for https and null for the rest', () => {
    expect(httpsUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(httpsUrl('http://example.com')).toBeNull()
    expect(httpsUrl('/relative')).toBeNull()
    expect(httpsUrl('javascript:1')).toBeNull()
    expect(httpsUrl('https://u:p@example.com')).toBeNull()
  })
})

// ---------------------------------------------------------------------- the planning dialog

function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(node))
  return host
}

function typeInto(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const submitForm = (el: HTMLElement) =>
  act(() => {
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
  })

describe('the planning dialog', () => {
  function setup() {
    const request = vi.fn(async () => ({}))
    useLive.setState({ conn: { client: { request } } as never })
    return request
  }

  it('does not plan on Enter without a title, and plans once on a double Enter', async () => {
    const request = setup()
    const el = mount(<PlanDialog open onClose={() => {}} onSaved={() => {}} />)
    submitForm(el)
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
    typeInto(el.querySelector('input[name="title"]') as HTMLInputElement, 'Friday stream')
    submitForm(el)
    submitForm(el)
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('starts an hour from when it is opened, not from when the page was', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-12-01T10:00:00'))
      setup()
      const el = mount(<PlanDialog open onClose={() => {}} onSaved={() => {}} />)
      const start = () => (el.querySelector('input[name="start"]') as HTMLInputElement).value
      expect(start()).toBe('2026-12-01T11:00')
      act(() => root?.render(<PlanDialog open={false} onClose={() => {}} onSaved={() => {}} />))
      vi.setSystemTime(new Date('2026-12-01T15:30:00'))
      act(() => root?.render(<PlanDialog open onClose={() => {}} onSaved={() => {}} />))
      expect(start()).toBe('2026-12-01T16:30')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a plan in the list', () => {
  it('names the time zone, and asks before removing one that has a broadcast', () => {
    const onDelete = vi.fn()
    const s = plan('https://www.facebook.com/page/videos/1')
    const el = (() => {
      host = document.createElement('div')
      document.body.appendChild(host)
      root = createRoot(host)
      act(() =>
        root?.render(
          <ul>
            <Plan s={s} now={0} busy={false} onDelete={onDelete} />
          </ul>,
        ),
      )
      return host
    })()
    const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(s.start_ms)
      .find((p) => p.type === 'timeZoneName')?.value
    expect(zone).toBeTruthy()
    expect(el.textContent).toContain(zone as string)
    act(() => (el.querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click())
    expect(onDelete).not.toHaveBeenCalled()
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Remove',
    )
    expect(confirm).toBeTruthy()
    act(() => confirm?.click())
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('removes one with no broadcast made at once', () => {
    const onDelete = vi.fn()
    const s = { ...plan(''), broadcasts: [{ platform: 'facebook' as const, note: 'Connect it' }] }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <ul>
          <Plan s={s} now={0} busy={false} onDelete={onDelete} />
        </ul>,
      ),
    )
    act(() => (host?.querySelector('button[aria-label^="Remove"]') as HTMLButtonElement).click())
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

describe('the status strip', () => {
  const conn = (state: string) =>
    ({ state, account: null, last_event_at: null, detail: null }) as never
  const strip = (facebook: string) => {
    useLive.setState({
      conn: null,
      connectors: {
        twitch: conn('connected'),
        youtube: conn('off'),
        kick: conn('off'),
        facebook: conn(facebook),
        relay: conn('connected'),
      } as never,
    })
    return mount(<StatusStrip />)
  }
  it('shows Facebook once it is connected or needs signing in, and not while it is off', () => {
    expect(strip('off').textContent).not.toContain('Facebook')
    act(() => root?.unmount())
    host?.remove()
    expect(strip('connected').textContent).toContain('Facebook')
    act(() => root?.unmount())
    host?.remove()
    expect(strip('sign_in_needed').textContent).toContain('Facebook')
  })
})
