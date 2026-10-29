import { describe, expect, it } from 'vitest'
import { CAPTIONS_SOURCE, captionsBox, captionsStep, pickMic } from './captions-box'

describe('live captions', () => {
  it('shows the right step for each macOS answer', () => {
    expect(captionsStep({ access: 'allowed' })).toBe('ready')
    expect(captionsStep({ access: 'not_asked' })).toBe('ask')
    expect(captionsStep({ access: 'denied' })).toBe('blocked')
    expect(captionsStep({ access: 'restricted' })).toBe('blocked')
    expect(captionsStep({ access: 'unsupported' })).toBe('elsewhere')
    // An answer this page doesn't know is treated as "not here", never as allowed.
    expect(captionsStep({ access: 'later' as never })).toBe('elsewhere')
  })

  it('keeps the mic in use, else a Pre-flight mic, else the first', () => {
    expect(pickMic('Mic B', ['Mic A', 'Mic B'], ['Mic A'])).toBe('Mic B')
    expect(pickMic('Gone', ['Mic A', 'Mic B'], ['Mic B'])).toBe('Mic B')
    expect(pickMic(null, ['Mic A', 'Mic B'], ['Elsewhere'])).toBe('Mic A')
    expect(pickMic(null, [], ['Mic A'])).toBeNull()
  })

  it('puts the box along the bottom, wrapped inside the canvas', () => {
    const b = captionsBox(1920, 1080)
    expect(b.source.name).toBe(CAPTIONS_SOURCE)
    expect(b.source.settings?.custom_width).toBe(1536)
    expect(b.x).toBe(192)
    expect(b.y).toBe(864)
    expect(b.x + Number(b.source.settings?.custom_width)).toBeLessThanOrEqual(1920)
  })

  it('reads on a vertical canvas and never gets tiny or zero', () => {
    const v = captionsBox(1080, 1920)
    expect((v.source.settings?.font as { size: number }).size).toBe(54)
    const tiny = captionsBox(0, -5)
    expect((tiny.source.settings?.font as { size: number }).size).toBe(24)
    expect(tiny.source.settings?.custom_width).toBeGreaterThan(0)
  })
})
