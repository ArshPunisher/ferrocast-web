import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DIVIDER_DRAG_EVENT,
  PREVIEW_LIVE_RESIZE_EVENT,
  SCALE_CHANGED_EVENT,
  dispatchDividerDrag,
  dispatchPreviewLiveResize,
  dispatchScaleChanged,
  isSafeStillUrl,
  isValidPreviewLiveResizePayload,
  isValidScaleChangedPayload,
} from './preview-events'

describe('preview window events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('validates fc://preview-live-resize and fc://scale-changed payloads', () => {
    expect(isValidPreviewLiveResizePayload({ active: true, reason: 'window', seq: 1 })).toBe(true)
    expect(isValidPreviewLiveResizePayload({ active: false })).toBe(true)
    expect(isValidPreviewLiveResizePayload({ reason: 'window' })).toBe(false)
    expect(isValidPreviewLiveResizePayload(null)).toBe(false)

    expect(isValidScaleChangedPayload({ scale: 2, previousScale: 1, display: 'HDMI-1' })).toBe(true)
    expect(isValidScaleChangedPayload({ scale: 1.25 })).toBe(true)
    expect(isValidScaleChangedPayload({ scale: 0 })).toBe(false)
    expect(isValidScaleChangedPayload({ scale: -2 })).toBe(false)
    expect(isValidScaleChangedPayload({ scale: Number.NaN })).toBe(false)
    expect(isValidScaleChangedPayload(undefined)).toBe(false)
  })

  it('is a safe no-op when window is unavailable', () => {
    expect(() => dispatchPreviewLiveResize({ active: true })).not.toThrow()
    expect(() => dispatchScaleChanged({ scale: 2 })).not.toThrow()
    expect(() => dispatchDividerDrag({ active: true, axis: 'x' })).not.toThrow()
  })

  it('dispatches fc://preview-live-resize, fc://scale-changed, and fc:divider-drag on window', () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)

    const events: Array<{ type: string; detail: unknown }> = []
    const onResize = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail })
    const onScale = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail })
    const onDivider = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail })

    window.addEventListener(PREVIEW_LIVE_RESIZE_EVENT, onResize)
    window.addEventListener(SCALE_CHANGED_EVENT, onScale)
    window.addEventListener(DIVIDER_DRAG_EVENT, onDivider)

    dispatchPreviewLiveResize({ active: true, reason: 'window', seq: 4, scale: 2 })
    dispatchScaleChanged({ scale: 1.5, previousScale: 2 })
    dispatchScaleChanged({ scale: 0 })
    dispatchDividerDrag({ active: true, axis: 'x' })

    window.removeEventListener(PREVIEW_LIVE_RESIZE_EVENT, onResize)
    window.removeEventListener(SCALE_CHANGED_EVENT, onScale)
    window.removeEventListener(DIVIDER_DRAG_EVENT, onDivider)

    expect(events).toEqual([
      {
        type: 'fc://preview-live-resize',
        detail: { active: true, reason: 'window', seq: 4, scale: 2 },
      },
      {
        type: 'fc://scale-changed',
        detail: { scale: 1.5, previousScale: 2 },
      },
      {
        type: 'fc:divider-drag',
        detail: { active: true, axis: 'x' },
      },
    ])
  })

  it('validates still image URLs against injection, SVG data URLs, and external HTTP(S) schemes', () => {
    expect(isSafeStillUrl('data:image/png;base64,abc123+/=')).toBe(true)
    expect(isSafeStillUrl('data:image/jpeg;base64,STILL_1')).toBe(true)
    expect(isSafeStillUrl('blob:https://127.0.0.1:47820/1234-5678')).toBe(true)
    expect(isSafeStillUrl('/api/v1/thumb.png')).toBe(true)

    expect(isSafeStillUrl('')).toBe(false)
    expect(isSafeStillUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeStillUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isSafeStillUrl('data:image/svg+xml,<script>alert(1)</script>')).toBe(false)
    expect(
      isSafeStillUrl(
        'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2F%22%3E%3C%2Fsvg%3E',
      ),
    ).toBe(false)
    expect(isSafeStillUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E')).toBe(false)
    expect(isSafeStillUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
    expect(isSafeStillUrl('https://cdn.example.com/thumb.png')).toBe(false)
    expect(isSafeStillUrl('http://cdn.example.com/thumb.png')).toBe(false)
    expect(isSafeStillUrl('https://evil.test/x");background:url(y')).toBe(false)
    expect(isSafeStillUrl('https://evil.test/x\\n')).toBe(false)
    expect(isSafeStillUrl('//evil.test/protocol-relative')).toBe(false)
  })
})
