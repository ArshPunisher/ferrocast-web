import { describe, expect, it } from 'vitest'
import { prefersZoomFit } from '../src/runtime'

const WEBKIT_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

describe('prefersZoomFit', () => {
  it('is on for WebKit on Linux that supports zoom', () => {
    expect(prefersZoomFit(WEBKIT_LINUX, true)).toBe(true)
  })
  it('is off without zoom support', () => {
    expect(prefersZoomFit(WEBKIT_LINUX, false)).toBe(false)
  })
  it('stays on transforms for Safari, Chromium and Android', () => {
    expect(prefersZoomFit(MAC_SAFARI, true)).toBe(false)
    expect(prefersZoomFit(CHROME_LINUX, true)).toBe(false)
    expect(prefersZoomFit(ANDROID_CHROME, true)).toBe(false)
  })
})
