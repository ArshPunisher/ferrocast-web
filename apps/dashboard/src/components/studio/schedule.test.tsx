import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ScheduledStream } from '@ferrocast/api'
import { Plan } from './schedule'
import { httpsUrl } from '../../lib/external'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
