// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserMicFallback } from './MediaCheckStep'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeStream() {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop }
}

describe('the browser camera and mic test', () => {
  let host: HTMLElement
  let root: Root
  let closed: ReturnType<typeof vi.fn>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    closed = vi.fn(async () => undefined)
    class Ctx {
      createMediaStreamSource() {
        return { connect() {} }
      }
      createAnalyser() {
        return { fftSize: 0, getFloatTimeDomainData() {} }
      }
      close = closed
    }
    vi.stubGlobal('AudioContext', Ctx)
    window.AudioContext = Ctx as never
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })
  const button = (name: RegExp) =>
    [...host.querySelectorAll('button')].find((b) => name.test(b.textContent ?? ''))

  it('shows the camera picture (the video exists before the stream is attached) and closes the audio context', async () => {
    const { stream, stop } = fakeStream()
    const getUserMedia = vi.fn(async () => stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    })
    await act(async () => root.render(<BrowserMicFallback />))
    await act(async () => button(/test|start|camera/i)?.click())
    const video = host.querySelector('video') as HTMLVideoElement | null
    expect(video).not.toBeNull()
    expect(video?.srcObject).toBe(stream)
    expect(video?.getAttribute('aria-label')).toMatch(/camera/i)
    await act(async () => button(/stop/i)?.click())
    expect(stop).toHaveBeenCalled()
    expect(closed).toHaveBeenCalled()
  })

  it('still tests the mic when there is no camera, and says what to do when everything is refused', async () => {
    const { stream } = fakeStream()
    const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
      if (c.video) throw new DOMException('no camera', 'NotFoundError')
      return stream
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    })
    await act(async () => root.render(<BrowserMicFallback />))
    await act(async () => button(/test|start|camera/i)?.click())
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(host.textContent).toMatch(/Browser mic input/)
    await act(async () => button(/stop/i)?.click())

    const denied = vi.fn(async () => {
      throw new DOMException('no', 'NotAllowedError')
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: denied },
      configurable: true,
    })
    await act(async () => button(/test|start|camera/i)?.click())
    expect(host.textContent).toMatch(/site settings|address bar|Retry|Continue/i)
  })
})
