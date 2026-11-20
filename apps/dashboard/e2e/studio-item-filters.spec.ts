import { expect, test, type Page } from '@playwright/test'

// Per-picture filters ("This picture only" / "Everywhere this source is used" + (i)) in the Studio desk, verified at
// desktop (1280×800) and phone (375×812) widths against mocked Studio engine endpoints so the
// test runs hermetically in CI without a live desktop app.

async function mountMockStudio(page: Page) {
  const puts: { url: string; body: Record<string, unknown> }[] = []
  const errors: string[] = []
  page.on('pageerror', (e) => {
    errors.push(`pageerror: ${e.message}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`console.error: ${m.text()}`)
    }
  })
  let own = false
  const scopeCalls: boolean[] = []
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
      api: window.location.origin,
      token: 'sidechain-e2e',
      desktop: true,
    })
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })

  await page.routeWebSocket('**/api/v1/live**', (ws) => {
    // Keep the live socket open quietly so no reconnect banners appear.
    void ws
  })

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

    if (path === '/api/v1/status') {
      return route.fulfill({
        json: {
          version: '3.4.0',
          port: 5281,
          live: { twitch: false, youtube: false, kick: false },
          connectors: {
            twitch: { state: 'disconnected', account: null },
            youtube: { state: 'disconnected', account: null },
            kick: { state: 'disconnected', account: null },
            obs: { state: 'disconnected' },
          },
          setup_done: true,
        },
      })
    }
    if (path === '/api/v1/session/ticket') {
      return route.fulfill({ json: { ticket: 'e2e-ticket' } })
    }
    if (path === '/api/v1/queue') {
      return route.fulfill({ json: { paused: false, current: null, queued: [] } })
    }
    if (path === '/api/v1/session/stats') {
      return route.fulfill({ json: { viewers: {} } })
    }
    if (path === '/api/v1/tts/pending') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/v1/events') {
      return route.fulfill({ json: { events: [], next_before: null } })
    }
    if (path === '/api/v1/connectors') {
      return route.fulfill({
        json: {
          twitch: { connected: true, user: 'streamer' },
          youtube: { connected: false },
          kick: { connected: false },
        },
      })
    }
    if (path === '/api/v1/golive') {
      return route.fulfill({
        json: {
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
        },
      })
    }
    if (path === '/api/v1/studio/engine') {
      return route.fulfill({
        json: {
          available: true,
          running: true,
          version: '3.4.0',
          renderer: 'Metal',
          detail: null,
          safe_mode: null,
        },
      })
    }
    if (path === '/api/v1/studio/engine/kinds') {
      return route.fulfill({
        json: {
          inputs: [
            { id: 'coreaudio_input_capture', name: 'Microphone' },
            { id: 'coreaudio_output_capture', name: 'Desktop Audio' },
            { id: 'av_capture_input', name: 'Camera' },
          ],
          filters: [{ id: 'ferrocast_rounded_corners', name: 'Rounded corners' }],
          transitions: [{ id: 'fade_transition', name: 'Fade' }],
          encoders: [],
          outputs: [],
        },
      })
    }
    if (path === '/api/v1/studio/engine/scenes') {
      return route.fulfill({
        json: {
          scenes: [{ name: 'Live', items: 1, current: true, transition: null }],
          current: 'Live',
          transition: { kind: 'fade_transition', ms: 300 },
        },
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items') {
      return route.fulfill({
        json: [
          {
            id: 5,
            name: 'Camera',
            kind: 'av_capture_input',
            visible: true,
            locked: false,
            audio: false,
            group: false,
            own_filters: own,
            blend: 'normal',
            scale_filter: 'off',
            frame: [640, 0, 0, 360, 0, 0],
            children: [],
          },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/audio') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/sources') {
      return route.fulfill({
        json: [{ name: 'Camera', kind: 'av_capture_input', scenes: ['Live'] }],
      })
    }
    if (path === '/api/v1/studio/engine/sources/Camera/filters') {
      return route.fulfill({
        json: [{ name: 'Round', kind: 'ferrocast_rounded_corners', enabled: true }],
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items/5/filters') {
      return route.fulfill({
        json: [{ name: 'Round', kind: 'ferrocast_rounded_corners', enabled: true, scope: 'item' }],
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items/5/filters/scope') {
      own = (req.postDataJSON() as { own: boolean }).own
      scopeCalls.push(own)
      return route.fulfill({ json: {} })
    }
    if (path === '/api/v1/studio/engine/sources/Camera/options') return route.fulfill({ json: [] })
    if (path.endsWith('/picture')) return route.fulfill({ json: { image: null } })
    if (path === '/api/v1/studio/engine/levels') {
      return route.fulfill({
        json: {
          'Mic/Aux': { peak: [-18, -18], magnitude: [-22, -22] },
          Music: { peak: [-14, -14], magnitude: [-18, -18] },
          Discord: { peak: [-45, -45], magnitude: [-50, -50] },
        },
      })
    }
    if (path === '/api/v1/studio/engine/stats') {
      return route.fulfill({
        json: {
          engine: { cpu: 4.2, fps: 60, frame_ms: 4.1, lagged: 0, frames: 1200, memory_mb: 180 },
          canvas: { width: 1920, height: 1080, fps: 60 },
          stream: null,
          record: null,
          scene: 'Live',
          history: { undo: null, redo: null },
        },
      })
    }
    if (path === '/api/v1/studio/engine/settings') {
      return route.fulfill({
        json: {
          encoder: 'hardware',
          video_kbps: 6000,
          vbr: false,
          keyframe_s: 2,
          profile: 'high',
          bframes: true,
          scale: null,
          audio_kbps: 160,
          width: 1920,
          height: 1080,
          fps: 60,
          record_folder: null,
          record_format: 'mp4',
          record_quality: 'stream',
          reconnect: true,
          reconnect_every_s: 5,
          reconnect_tries: 20,
          delay_s: 0,
          sample_rate: 48000,
          stereo: true,
          monitoring: null,
          hotkeys: {},
        },
      })
    }
    if (path.startsWith('/api/v1/studio/engine/library/')) {
      return route.fulfill({
        json: { current: 'default', list: [{ id: 'default', name: 'Default' }] },
      })
    }
    if (
      path === '/api/v1/studio/engine/screens' ||
      path === '/api/v1/studio/engine/missing-files'
    ) {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/v1/studio/engine/audio-care') {
      return route.fulfill({ json: { ducking: null, loudness_lufs: null } })
    }
    if (path === '/api/v1/studio/engine/privacy') {
      return route.fulfill({
        json: { hide_notifications: true, hide_apps: [], supported: true },
      })
    }
    if (path === '/api/v1/studio/guests') {
      return route.fulfill({ json: { invites: [], guests: [] } })
    }
    if (path === '/api/v1/studio/show') {
      return route.fulfill({ json: { config: {}, run: null } })
    }
    if (path === '/api/v1/pro') {
      return route.fulfill({
        json: {
          active: false,
          sales_open: false,
          sale: null,
          features: { history: false },
        },
      })
    }
    if (path === '/api/v1/account' || path === '/api/v1/cloud/summary') {
      return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'none' } } })
    }
    if (path === '/api/v1/stream-info') {
      return route.fulfill({ json: { presets: [], history: [], platforms: [] } })
    }
    if (path === '/api/v1/studio/preflight') {
      return route.fulfill({ json: { ready: true, checks: [] } })
    }
    if (path === '/api/v1/studio/switcher') {
      return route.fulfill({ json: { enabled: false, rules: [] } })
    }
    if (path === '/api/v1/updates') {
      return route.fulfill({ json: { current: '3.4.0', latest: null, available: false } })
    }
    if (path === '/api/v1/chat' || path === '/api/v1/mod/held') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/v1/goals') {
      return route.fulfill({ json: [] })
    }
    return route.fulfill({ json: {} })
  })

  return { puts, errors, scopeCalls }
}

async function openCameraFilters(page: Page, mobile: boolean) {
  await page.goto('./#/studio/golive')
  if (mobile) {
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Sources', { exact: true })
      .click()
  }
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await page.getByRole('button', { name: 'Settings of Camera' }).click()
  const drawer = page.getByRole('complementary', { name: 'Camera settings' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('tab', { name: 'Filters' }).click()
  return drawer
}

test.describe('studio item filters', () => {
  for (const [name, size] of [
    ['desktop 1280px', { width: 1280, height: 800 }],
    ['phone 375px', { width: 375, height: 812 }],
  ] as const) {
    test(`${name}: scope line, switch and (i) fit, and the switch asks for its own copy`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      const { errors, scopeCalls } = await mountMockStudio(page)
      const drawer = await openCameraFilters(page, size.width < 500)
      const line = drawer.getByTestId('filter-scope')
      await expect(line).toContainText('Everywhere this source is used')
      await drawer.getByRole('button', { name: 'About these filters' }).click()
      await expect(page.getByText(/Sound filters are always shared/).last()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('switch', { name: 'This picture only' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      await page.getByRole('switch', { name: 'This picture only' }).click()
      await expect.poll(() => scopeCalls).toEqual([true])
      await expect(line).toContainText('This picture only')
      await expect(page.getByRole('switch', { name: 'This picture only' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(page.getByRole('switch', { name: 'This picture only' })).toBeEnabled()
      // Nothing overflows sideways.
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(over).toBe(false)
      await page.screenshot({ path: `test-results/item-filters-${size.width}.png` })
      expect(errors).toEqual([])
    })
  }
})
