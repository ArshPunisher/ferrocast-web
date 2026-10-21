import { afterEach, describe, expect, it } from 'vitest'
import { BROWSER_NOTICE, browserDidntOpen, externalPlan, inDesktopApp, webUrl } from './external'

const here = window.location.origin

afterEach(() => {
  delete window.__FERROCAST__
})

describe('opening web pages', () => {
  it('only opens http and https', () => {
    expect(webUrl('https://www.twitch.tv/activate')?.href).toBe('https://www.twitch.tv/activate')
    expect(webUrl('javascript:alert(1)')).toBeNull()
    expect(webUrl('file:///etc/passwd')).toBeNull()
    expect(webUrl('data:text/html,hi')).toBeNull()
    expect(externalPlan('javascript:alert(1)').how).toBe('none')
    expect(externalPlan('').how).toBe('none')
  })

  it('opens a new tab in a browser', () => {
    expect(inDesktopApp()).toBe(false)
    expect(externalPlan('https://rzp.io/rzp/abc')).toEqual({
      how: 'window',
      url: 'https://rzp.io/rzp/abc',
    })
  })

  it('hands web pages to the desktop window, which opens the browser', () => {
    window.__FERROCAST__ = { api: here, token: 't', desktop: true }
    expect(inDesktopApp()).toBe(true)
    expect(externalPlan('https://www.twitch.tv/activate')).toEqual({
      how: 'navigate',
      url: 'https://www.twitch.tv/activate',
    })
    // A page this PC serves asks for a new window (navigating would leave the dashboard).
    expect(externalPlan(`${here}/o/abc/`).how).toBe('window')
  })

  it('treats a phone as a browser', () => {
    window.__FERROCAST__ = { api: 'https://remote.example/r', remote: true }
    expect(inDesktopApp()).toBe(false)
    expect(externalPlan('https://www.twitch.tv/activate').how).toBe('window')
  })
})

describe('the YouTube sign-in page', () => {
  // What the engine's oauth::begin hands back: long, form-encoded, our address in the query.
  const google =
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=701866487620-p0npjp4t20ivffdcn89s5jhro9vik5cl.apps.googleusercontent.com&redirect_uri=http%3A%2F%2F127.0.0.1%3A53211%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.force-ssl+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly&code_challenge=N07XXTGhamNvXHT0LS_emRx0ieA0Ua8QfloveAbcdefg&code_challenge_method=S256&state=abcdefghijklmnopqrstuvwxyzAB_-&access_type=offline&prompt=consent'

  it('goes to the browser unchanged from the desktop app', () => {
    window.__FERROCAST__ = { api: here, token: 't', desktop: true }
    expect(externalPlan(google)).toEqual({ how: 'navigate', url: google })
  })

  it('opens a new tab in a browser, unchanged', () => {
    expect(externalPlan(google)).toEqual({ how: 'window', url: google })
  })
})

describe('a browser that did not open', () => {
  it("counts only the desktop app's notice since the dialog opened", () => {
    const notices = [
      { key: BROWSER_NOTICE, at: 100 },
      { key: 'account:youtube', at: 500 },
      { at: 600 },
    ]
    expect(browserDidntOpen(notices, 100)).toBe(true)
    expect(browserDidntOpen(notices, 101)).toBe(false)
    expect(browserDidntOpen([], 0)).toBe(false)
  })
})
