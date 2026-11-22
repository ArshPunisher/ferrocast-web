import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bootstrap from '../src/widgets/alert-sandbox-bootstrap.js?raw'

/** Runs the frame's bootstrap in this document, standing in for the sandboxed page. */
function boot(): { send: (payload: unknown, origin?: string) => void; root: HTMLElement } {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.setAttribute('data-parent', location.origin)
  document.documentElement.removeAttribute('style')
  const style = document.createElement('style')
  style.id = 'fc-custom-style'
  const root = document.createElement('div')
  root.id = 'fc-custom-root'
  document.head.appendChild(style)
  document.body.appendChild(root)
  new Function(bootstrap)()
  return {
    root,
    send: (payload, origin = location.origin) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'ferro-custom-alert', payload },
          origin,
          source: window.parent,
        }),
      ),
  }
}

const payload = (html: string, over: Record<string, unknown> = {}) => ({
  alert_id: 'a1',
  html,
  css: '',
  vars: { name: 'Nova', message: 'hi' },
  fields: {},
  ...over,
})

describe('custom alert sandbox bootstrap', () => {
  beforeEach(() => {
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('strips everything that runs, navigates or fetches, and keeps ordinary markup', () => {
    const { send, root } = boot()
    send(
      payload(
        '<div class="card"><b>{name}</b></div>' +
          '<img src="data:," onerror="location.replace(\'https://evil.example/\')" alt="x">' +
          '<script>window.__x=1</script><meta http-equiv="refresh" content="0;url=https://evil.example">' +
          '<base href="https://evil.example/"><form action="https://evil.example"><input></form>' +
          '<a href="javascript:alert(1)" id="a1">x</a><a href="&#106;avascript:1" id="a2">x</a>' +
          '<img src="https://evil.example/p.gif" id="i1"><img src="https://cdn.discordapp.com/a.png" id="i2"><img src="https://cdn.discordapp.com/a.png?ex=1&amp;hm=2" id="i3">' +
          '<div id="d1" style="background:url(https://evil.example/a.png)">x</div>' +
          '<style>@import url(https://evil.example/a.css)</style>' +
          '<svg><script>1</script><animate attributeName="href" values="javascript:1"/></svg>' +
          '<audio src="data:audio/wav;base64,AAAA" autoplay></audio>',
      ),
    )
    expect(root.querySelector('b')?.textContent).toBe('Nova')
    expect(root.querySelector('.card')).not.toBeNull()
    expect(root.querySelector('script, meta, base, form, input, audio, animate, style')).toBeNull()
    expect(root.querySelector('[onerror]')).toBeNull()
    expect(root.querySelector('#a1')?.hasAttribute('href')).toBe(false)
    expect(root.querySelector('#a2')?.hasAttribute('href')).toBe(false)
    expect(root.querySelector('#i1')?.hasAttribute('src')).toBe(false)
    expect(root.querySelector('#i2')?.getAttribute('src')).toBe('https://cdn.discordapp.com/a.png')
    expect(root.querySelector('#i3')?.getAttribute('src')).toBe(
      'https://cdn.discordapp.com/a.png?ex=1&hm=2',
    )
    expect(root.querySelector('#d1')?.hasAttribute('style')).toBe(false)
    expect((window as unknown as { __x?: number }).__x).toBeUndefined()
  })

  it('writes viewer words as text only, and only into text and plain attributes', () => {
    const { send, root } = boot()
    const evil = `"><img src=x onerror=alert(1)> </b> {{x}} '`
    send(
      payload(
        '<p class="{name}" title="{name}" data-who="{name}" onclick="{name}">{name} / {message}</p>',
        { vars: { name: evil, message: '<script>1</script>' } },
      ),
    )
    const p = root.querySelector('p')!
    expect(p.textContent).toBe(`${evil} / <script>1</script>`)
    expect(p.children.length).toBe(0)
    expect(p.getAttribute('title')).toBe(evil)
    expect(p.getAttribute('data-who')).toBe(evil)
    expect(p.getAttribute('class')).toBe('{name}')
    expect(p.hasAttribute('onclick')).toBe(false)
  })

  it('does not fill tokens inside style blocks and caps what tokens can expand to', () => {
    const { send, root } = boot()
    send(
      payload('<style>.a::after{content:"{name}"}</style><p>' + '{message}'.repeat(500) + '</p>', {
        vars: { name: 'N', message: 'x'.repeat(2000) },
      }),
    )
    expect(root.querySelector('style')?.textContent).toContain('{name}')
    expect((root.querySelector('p')?.textContent ?? '').length).toBeLessThanOrEqual(200_000)
  })

  it('keeps field values out of the stylesheet syntax and checks the author CSS too', () => {
    const { send } = boot()
    send(
      payload('<p>x</p>', {
        css: '.a{background:u\\72l(https://evil.example/a.png)}',
        fields: { good: '#ff0000', sneaky: 'u\\72l(https://evil.example)', slash: '/*', num: 12 },
      }),
    )
    const style = document.documentElement.style
    expect(style.getPropertyValue('--field-good')).toBe('#ff0000')
    expect(style.getPropertyValue('--field-num')).toBe('12')
    expect(style.getPropertyValue('--field-sneaky')).toBe('')
    expect(style.getPropertyValue('--field-slash')).toBe('')
    expect(document.getElementById('fc-custom-style')?.textContent).toBe('')
  })

  it('renders once, and only for its own parent', () => {
    const { send, root } = boot()
    send(payload('<p>first</p>'), 'https://evil.example')
    expect(root.textContent).toBe('')
    send(payload('<p>first</p>'))
    send(payload('<p>second</p>'))
    expect(root.textContent).toBe('first')
  })
})
