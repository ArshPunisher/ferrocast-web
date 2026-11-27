// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type GoLiveView } from '@ferrocast/api'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { StudioDesk } from './desk'

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  localStorage.clear()
  useLive.setState({ conn: null, status: null })
  currentToasts().forEach((t) => dismissToast(t.id))
  vi.restoreAllMocks()
})

const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

function makeView(): GoLiveView {
  return {
    ingest: 'rtmp://127.0.0.1:1935/live',
    obs: {
      connected: false,
      points_here: false,
      streaming: false,
      before: null,
      aitum: null,
      vertical: null,
    },
    live: false,
    stats: {
      kbps: 0,
      keyframe_interval_ms: null,
      video_codec: null,
      width: null,
      height: null,
      fps: null,
    },
    vertical_live: false,
    vertical_stats: {
      kbps: 0,
      keyframe_interval_ms: null,
      video_codec: null,
      width: null,
      height: null,
      fps: null,
    },
    destinations: [],
    upload: null,
    protect: true,
    aitum_ok: false,
    auto_quality: true,
    advanced: {
      rules: {
        slow_pct: 70,
        trouble_s: 4,
        calm_s: 10,
        first_pause_s: 60,
        max_pause_s: 600,
        first_to_pause: null,
      },
      keep_free_pct: 20,
      port: 1935,
      per: {},
      ignore_service_limits: false,
    },
    cut: {
      source: 'canvas',
      config: {
        layout: 'camera_top',
        camera: { x: 0.74, y: 0.04, w: 0.24, h: 0.31 },
        game: { x: 0.22, y: 0, w: 0.56, h: 1 },
        camera_share: 38,
        width: 1080,
        height: 1920,
        fps: 30,
        kbps: 4500,
        encoder: 'auto',
      },
      state: null,
      ffmpeg: { state: 'ready' },
    },
  }
}

describe('StudioDesk full collection switch reset', () => {
  it('reloads scenes, sources, audio, missing files, Go Live, and drops stale selection without 404 bursts on switch', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia

    let currentCol = 'col-a'
    const colScenes: Record<string, string[]> = {
      'col-a': ['Main', 'Gaming'],
      'col-b': ['Main', 'Outro'],
    }
    const itemsCalls: string[] = []
    const missingCalls: string[] = []
    let statsCol = 'col-a'
    let statsProfile = 'prof-a'
    const settingsSpy = vi.fn(async (patch?: Record<string, unknown>) => {
      void patch
      return { restart: null }
    })

    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (path === '/api/v1/studio/engine') {
        return {
          installed: true,
          running: true,
          starting: false,
          available: true,
          install_hint: null,
          safe_mode: null,
        }
      }
      if (path === '/api/v1/studio/engine/library/collections') {
        return {
          current: currentCol,
          list: [
            { id: 'col-a', name: 'Gaming Pack' },
            { id: 'col-b', name: 'Podcast Pack' },
          ],
        }
      }
      if (path === '/api/v1/studio/engine/library/profiles') {
        return {
          current: statsProfile,
          list: [
            { id: 'prof-a', name: 'Default' },
            { id: 'prof-b', name: 'Small 720p' },
          ],
        }
      }
      if (path === '/api/v1/studio/engine/library/collections/current' && method === 'PUT') {
        const nextId = (body as { id: string }).id
        currentCol = nextId
        statsCol = nextId
        return { id: nextId }
      }
      if (path === '/api/v1/studio/engine/library/profiles/current' && method === 'PUT') {
        const nextId = (body as { id: string }).id
        statsProfile = nextId
        return { id: nextId }
      }
      if (path === '/api/v1/studio/engine/scenes') {
        return {
          collection_id: currentCol,
          current: colScenes[currentCol]![0]!,
          preview: null,
          transition: { kind: 'fade', ms: 300 },
          top_layer: null,
          vertical: null,
          scenes: colScenes[currentCol]!.map((name, idx) => ({
            name,
            current: idx === 0,
            preview: false,
            items: 1,
            transition: null,
          })),
        }
      }
      const itemsMatch = path.match(/^\/api\/v1\/studio\/engine\/scenes\/([^/]+)\/items$/)
      if (itemsMatch) {
        const sc = decodeURIComponent(itemsMatch[1]!)
        itemsCalls.push(`${currentCol}:${sc}`)
        if (!colScenes[currentCol]!.includes(sc)) {
          throw new ApiError(404, 'not_found', `Scene ${sc} not in ${currentCol}`)
        }
        return [
          {
            id: currentCol === 'col-a' ? 1 : 2,
            name: currentCol === 'col-a' ? 'Cam A' : 'Mic B',
            kind: 'av_capture_input_v2',
            visible: true,
            locked: false,
            audio: true,
            group: false,
            blend: 'normal',
            scale_filter: 'off',
            children: [],
          },
        ]
      }
      const audioMatch = path.match(/^\/api\/v1\/studio\/engine\/scenes\/([^/]+)\/audio$/)
      if (audioMatch) {
        const sc = decodeURIComponent(audioMatch[1]!)
        if (!colScenes[currentCol]!.includes(sc)) {
          throw new ApiError(404, 'not_found', `Audio ${sc} not in ${currentCol}`)
        }
        return [
          {
            name: currentCol === 'col-a' ? 'Mic A' : 'Mic B',
            kind: 'coreaudio_input_capture',
            channel: null,
            volume_db: -3,
            muted: false,
            monitor: 'off',
            active: true,
          },
        ]
      }
      if (path === '/api/v1/studio/engine/kinds') {
        return {
          inputs: [{ id: 'av_capture_input_v2', name: 'Camera', fields: [] }],
          filters: [],
          transitions: [],
          encoders: [],
          outputs: [],
        }
      }
      if (path === '/api/v1/studio/engine/settings') {
        if (method === 'PUT') return await settingsSpy(body as Record<string, unknown>)
        return {
          width: statsProfile === 'prof-a' ? 1920 : 1280,
          height: statsProfile === 'prof-a' ? 1080 : 960,
          fps: 60,
        }
      }
      if (path === '/api/v1/studio/engine/missing-files') {
        missingCalls.push(currentCol)
        return currentCol === 'col-a'
          ? [
              {
                source: 'Intro',
                kind: 'ffmpeg_source',
                field: 'local_file',
                path: '/old.mp4',
                missing: true,
              },
            ]
          : []
      }
      if (path === '/api/v1/studio/engine/stats') {
        return {
          collection_id: statsCol,
          profile_id: statsProfile,
          engine: {
            cpu: 12,
            fps: 60,
            frame_ms: 8.3,
            lagged: 0,
            frames: 100,
            memory_mb: 120,
          },
          stream: { active: false, reconnecting: false, error: null, frames: 10 },
          record: null,
          canvas: {
            width: statsProfile === 'prof-a' ? 1920 : 1280,
            height: statsProfile === 'prof-a' ? 1080 : 960,
            fps: 60,
          },
        }
      }
      if (path === '/api/v1/studio/engine/history') return { undo: null, redo: null, entries: [] }
      if (path === '/api/v1/studio/engine/sources') return []
      if (path.includes('/thumbnail')) return { image: `data:image/png;base64,${currentCol}` }
      if (path.endsWith('/show/config'))
        return { start_stream: false, stop_stream: true, stop_delay_s: 0 }
      if (path.endsWith('/show')) return { show: null }
      if (path.includes('/stream-info')) return { last: null, history: [], presets: [] }
      return {}
    })

    useLive.setState({
      conn: { client: { request } } as never,
      status: {
        engine: {
          installed: true,
          running: true,
          starting: false,
          available: true,
          install_hint: null,
          safe_mode: null,
        },
      } as never,
    })

    const reloadGoLive = vi.fn()
    const res = {
      data: makeView(),
      error: null,
      loading: false,
      reload: reloadGoLive,
      set: vi.fn(),
    }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<StudioDesk res={res as never} view={res.data} />)
    })
    await flush(60)

    expect(host.textContent).toContain('Cam A')
    expect(host.textContent).toContain('1 file a source uses is missing.')

    // Switch collection from Gaming Pack (Main) -> Podcast Pack (Main):
    // Missing files re-checked cleanly and Go Live reloaded, old items cleared.
    const colBtn = host.querySelector(
      'button[aria-label="scene collection: Gaming Pack"]',
    ) as HTMLButtonElement
    await act(async () => colBtn.click())
    const podItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Podcast Pack'),
    ) as HTMLButtonElement
    itemsCalls.length = 0
    await act(async () => podItem.click())
    await flush(60)

    expect(host.textContent).toContain('Mic B')
    expect(host.textContent).not.toContain('Cam A')
    expect(host.textContent).not.toContain('missing')
    expect(reloadGoLive).toHaveBeenCalled()
    expect(missingCalls.filter((c) => c === 'col-b').length).toBeGreaterThanOrEqual(1)

    // Switch back from "Outro" (in Podcast Pack) -> Gaming Pack without issuing 404 items/Outro after switch.
    const outroBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Outro'),
    ) as HTMLButtonElement | undefined
    if (outroBtn) {
      await act(async () => outroBtn.click())
      await flush(30)
    }
    const podBtn = host.querySelector(
      'button[aria-label="scene collection: Podcast Pack"]',
    ) as HTMLButtonElement
    await act(async () => podBtn.click())
    const gamingItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Gaming Pack'),
    ) as HTMLButtonElement
    itemsCalls.length = 0
    await act(async () => gamingItem.click())
    await flush(60)
    expect(itemsCalls).not.toContain('col-a:Outro')
    expect(host.textContent).toContain('Cam A')

    // Switch profile Default (1920x1080) -> Small 720p (1280x960 = 4:3) reloads prefs & updates preview aspect.
    const profBtn = host.querySelector('button[aria-label="profile: Default"]') as HTMLButtonElement
    await act(async () => profBtn.click())
    const smallItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Small 720p'),
    ) as HTMLButtonElement
    await act(async () => smallItem.click())
    await flush(60)
    const box = host.querySelector<HTMLElement>('[data-canvas-box]')
    expect(box?.style.aspectRatio).toBe('1280 / 960')
  })
})
