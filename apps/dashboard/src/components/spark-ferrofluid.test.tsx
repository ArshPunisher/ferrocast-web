import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SCALE_CHANGED_EVENT, SparkField } from '@ferrocast/ui'
import { mountFerrofluid } from '@ferrocast/ui/ferro'

let root: Root | null = null

function installDprMatchMedia(initialDpr = 1) {
  let dpr = initialDpr
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    get: () => dpr,
  })
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (_: string, fn: () => void) => {
      if (query.includes('resolution')) listeners.add(fn)
    },
    removeEventListener: (_: string, fn: () => void) => {
      if (query.includes('resolution')) listeners.delete(fn)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia

  return {
    setDpr(next: number) {
      dpr = next
      for (const fn of [...listeners]) fn()
    },
  }
}

function makeFake2dContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    isPointInPath: () => true,
    globalAlpha: 1,
    fillStyle: '#000',
  } as unknown as CanvasRenderingContext2D
}

function makeFakeWebGLContext() {
  const drawArrays = vi.fn()
  const viewport = vi.fn()
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    useProgram: () => {},
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    uniform1f: () => {},
    uniform2f: () => {},
    uniform3f: () => {},
    deleteProgram: () => {},
    deleteShader: () => {},
    deleteBuffer: () => {},
    getExtension: () => ({ loseContext: () => {} }),
    viewport,
    drawArrays,
  }
  return { gl: gl as unknown as WebGLRenderingContext, drawArrays, viewport }
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('Path2D', class {})
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SparkField & ferrofluid rAF resize + DPR listeners', () => {
  it('SparkField defers buffer resize into rAF draw, recovers from 0x0 mount, and tracks DPR changes', async () => {
    const dprCtrl = installDprMatchMedia(1)
    const roCallbacks: Array<() => void> = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const rafQueue: Array<FrameRequestCallback> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const ctx2d = makeFake2dContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx2d as never)

    let rect = { width: 0, height: 0 }
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: rect.width,
          bottom: rect.height,
          width: rect.width,
          height: rect.height,
          toJSON: () => ({}),
        }) as DOMRect,
    )

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<SparkField />)
    })

    const canvas = host.querySelector('canvas')!
    // Flush initial 0x0 rAF frame
    act(() => {
      const batch = rafQueue.splice(0)
      for (const cb of batch) cb(performance.now())
    })
    expect(canvas.width).toBe(1)

    // Resize to 400x300: synchronous RO callback must NOT blank-reset canvas.width yet
    rect = { width: 400, height: 300 }
    act(() => {
      for (const cb of roCallbacks) cb()
    })
    expect(canvas.width).toBe(1)

    // Next rAF applies the new size and draws non-empty particle set (> 0 arc calls)
    act(() => {
      const batch = rafQueue.splice(0)
      for (const cb of batch) cb(performance.now())
    })
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(300)
    expect((ctx2d.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(100)

    // DPR changes from 1 -> 2 via matchMedia
    dprCtrl.setDpr(2)
    act(() => {
      const batch = rafQueue.splice(0)
      for (const cb of batch) cb(performance.now())
    })
    expect(canvas.width).toBe(800)

    // Explicit scale event (2 -> 1.5) updates buffer even without ResizeObserver
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 1.5 })
    window.dispatchEvent(new CustomEvent(SCALE_CHANGED_EVENT, { detail: { scale: 1.5 } }))
    act(() => {
      const batch = rafQueue.splice(0)
      for (const cb of batch) cb(performance.now())
    })
    expect(canvas.width).toBe(600)
  })

  it('mountFerrofluid coalesces ResizeObserver via rAF and updates scale on DPR / scale-changed', () => {
    const dprCtrl = installDprMatchMedia(1)
    const roCallbacks: Array<() => void> = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const rafQueue: Array<FrameRequestCallback> = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const { gl, drawArrays } = makeFakeWebGLContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => gl as never)

    let rect = { width: 400, height: 200 }
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: rect.width,
          bottom: rect.height,
          width: rect.width,
          height: rect.height,
          toJSON: () => ({}),
        }) as DOMRect,
    )

    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const cleanup = mountFerrofluid(canvas, {
      background: '#000000',
      accent: '#ff5500',
      reducedMotion: true,
    })

    // scale = 0.75 * 1 = 0.75 -> 400 * 0.75 = 300
    expect(canvas.width).toBe(300)
    const initialDraws = drawArrays.mock.calls.length

    // Rapid ResizeObserver burst -> coalesced into rAF, NOT rendered synchronously per tick
    rect = { width: 600, height: 300 }
    for (const cb of roCallbacks) cb()
    rect = { width: 800, height: 400 }
    for (const cb of roCallbacks) cb()
    expect(canvas.width).toBe(300)
    expect(drawArrays.mock.calls.length).toBe(initialDraws)

    const batch1 = rafQueue.splice(0)
    expect(batch1).toHaveLength(1)
    for (const cb of batch1) cb(performance.now())
    expect(canvas.width).toBe(600) // 800 * 0.75
    expect(drawArrays.mock.calls.length).toBe(initialDraws + 1)

    // DPR monitor move 1 -> 1.5 updates buffer (0.75 * 1.5 * 800 = 900)
    dprCtrl.setDpr(1.5)
    const batch2 = rafQueue.splice(0)
    for (const cb of batch2) cb(performance.now())
    expect(canvas.width).toBe(900)

    // scale-changed to 1 updates buffer (0.75 * 1 * 800 = 600)
    window.dispatchEvent(new CustomEvent(SCALE_CHANGED_EVENT, { detail: { scale: 1 } }))
    const batch3 = rafQueue.splice(0)
    for (const cb of batch3) cb(performance.now())
    expect(canvas.width).toBe(600)

    cleanup()
  })
})
