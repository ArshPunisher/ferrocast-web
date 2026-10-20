import { afterEach, describe, expect, it } from 'vitest'
import { externalPlan, inDesktopApp, webUrl } from './external'

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
