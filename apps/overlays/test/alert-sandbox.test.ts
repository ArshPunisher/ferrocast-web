import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAlert } from '../src/widgets/alerts'
import {
  buildSandboxSrcdoc,
  customAlertCsp,
  validateCustomRenderPayload,
} from '../src/widgets/alert-sandbox'
import { alert } from './helpers'

describe('custom alert sandbox & anim rendering (R25)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('builds strict CSP without network leaks or allow-same-origin', () => {
    const csp = customAlertCsp()
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).not.toContain('img-src *')
    expect(csp).not.toContain("connect-src 'self'")
    expect(csp).toContain('https://static-cdn.jtvnw.net')

    const srcdoc = buildSandboxSrcdoc('http://localhost:5280')
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"')
    expect(srcdoc).toContain("connect-src 'none'")
    expect(srcdoc).toContain('ev.origin')
  })

  it('validates custom payload strictly before postMessage', () => {
    const ok = validateCustomRenderPayload('a1', {
      html: '<div class="card">{name}</div>',
      css: '.card{color:#fff}',
      fields: { badge_label: 'VIP', glow_px: 8, is_vip: true },
      vars: { name: 'PixelPanda' },
    })
    expect(ok).toEqual({
      alert_id: 'a1',
      html: '<div class="card">{name}</div>',
      css: '.card{color:#fff}',
      fields: { badge_label: 'VIP', glow_px: 8, is_vip: true },
      vars: { name: 'PixelPanda' },
    })

    // Rejects invalid field keys or oversized HTML
    expect(
      validateCustomRenderPayload('a1', {
        html: 'x'.repeat(80_001),
        css: '',
        fields: {},
        vars: {},
      }),
    ).toBeNull()

    const filtered = validateCustomRenderPayload('a1', {
      html: '<div>ok</div>',
      css: '',
      fields: {
        valid_key: 'yes',
        BAD_KEY: 'drop-me',
        nested: { evil: 1 } as never,
      },
      vars: { name: 'Kai' },
    })
    expect(filtered?.fields).toEqual({ valid_key: 'yes' })
  })

  it('renders custom HTML alerts strictly inside a sandbox="allow-scripts" iframe (no allow-same-origin)', () => {
    const customAlert = alert('c1', {
      custom: {
        html: '<div class="custom-badge">{badge_label}: {name}</div>',
        css: '.custom-badge{color:#ffa424}',
        fields: { badge_label: 'Founder' },
        vars: { name: 'NovaRiver' },
      },
    })
    const host = buildAlert(customAlert, 'molten', false, false)
    document.body.appendChild(host)

    // Never injected into parent shadow DOM or document directly
    expect(document.querySelector('.custom-badge')).toBeNull()
    expect(host.shadowRoot?.querySelector('.custom-badge')).toBeNull()

    const iframe = host.shadowRoot?.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer')

    // Rejects forged messages from non-null origin or unknown source before ready
    const postSpy = vi.fn()
    Object.defineProperty(iframe!, 'contentWindow', {
      value: { postMessage: postSpy },
      configurable: true,
    })
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ferro-custom-alert-ready' },
        origin: 'https://evil.example',
        source: iframe!.contentWindow as Window,
      }),
    )
    expect(postSpy).not.toHaveBeenCalled()

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ferro-custom-alert-ready' },
        origin: 'null',
        source: iframe!.contentWindow as Window,
      }),
    )
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ferro-custom-alert',
        payload: expect.objectContaining({
          alert_id: 'c1',
          fields: { badge_label: 'Founder' },
          vars: { name: 'NovaRiver' },
        }),
      }),
      '*',
    )
  })

  it('applies animation metadata and per-character spans for rule text effects when motion is full', () => {
    const animAlert = alert('a-anim', {
      title: 'Nova joined!',
      anim: {
        in: 'pop',
        out: 'shrink',
        text: 'wave',
        in_ms: 500,
        out_ms: 400,
        text_delay_ms: 200,
      },
    })
    const host = buildAlert(animAlert, 'molten', false, false)
    const card = host.shadowRoot?.querySelector('.al') as HTMLElement
    expect(card.dataset.animIn).toBe('pop')
    expect(card.dataset.animOut).toBe('shrink')
    expect(card.dataset.textAnim).toBe('wave')
    expect(host.shadowRoot?.querySelectorAll('.al-word').length).toBe(2)
    expect(host.shadowRoot?.querySelectorAll('.al-char').length).toBe('Novajoined!'.length)

    // Low motion skips char splitting and uses simple fade
    const lowHost = buildAlert(animAlert, 'molten', true, false)
    const lowCard = lowHost.shadowRoot?.querySelector('.al') as HTMLElement
    expect(lowCard.dataset.motion).toBe('low')
    expect(lowHost.shadowRoot?.querySelectorAll('.al-char').length).toBe(0)
  })
})
