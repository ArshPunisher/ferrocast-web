import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Selective recording: each source is shown on the stream, in the recording or both. The Sources
// dock marks the ones that are for one only, the source's settings and the row's menu choose,
// at desktop (1280) and phone (375) widths, against mocked Studio engine endpoints so it runs
// hermetically without a live desktop app.

async function mountMockStudio(page: Page) {
  // Where each item is shown, and every edit word the page sent for it.
  const shown: Record<number, 'both' | 'stream' | 'recording'> = {
    8: 'both',
    9: 'both',
    10: 'both',
    5: 'both',
    6: 'stream',
    7: 'recording',
  }
  const edits: { id: number; do: string }[] = []
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
          scenes: [{ name: 'Live', items: 6, current: true, transition: null }],
          current: 'Live',
          transition: { kind: 'fade_transition', ms: 300 },
        },
      })
    }
    const edit = path.match(/^\/api\/v1\/studio\/engine\/scenes\/Live\/items\/(\d+)\/edit$/)
    if (edit && req.method() === 'POST') {
      const id = Number(edit[1])
      const what = (req.postDataJSON() as { do: string }).do
      edits.push({ id, do: what })
      if (what === 'stream_only') shown[id] = 'stream'
      else if (what === 'recording_only') shown[id] = 'recording'
      else if (what === 'stream_and_recording') shown[id] = 'both'
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items') {
      const item = (id: number, name: string, kind: string) => ({
        id,
        name,
        kind,
        visible: true,
        locked: false,
        audio: false,
        group: false,
        show: shown[id],
        blend: 'normal',
        scale_filter: 'off',
        frame: [640, 0, 0, 360, 0, 0],
        children: [],
      })
      return route.fulfill({
        json: [
          item(7, 'Face cam', 'av_capture_input'),
          item(6, 'Chat', 'browser_source'),
          item(5, 'Camera', 'av_capture_input'),
          item(8, 'Twin', 'av_capture_input'),
          item(9, 'Twin', 'av_capture_input'),
          { ...item(10, 'Mic', 'coreaudio_input_capture'), audio: true },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/audio') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/sources') {
      return route.fulfill({
        json: [
          { name: 'Camera', kind: 'av_capture_input', scenes: ['Live'] },
          { name: 'Chat', kind: 'browser_source', scenes: ['Live'] },
          { name: 'Face cam', kind: 'av_capture_input', scenes: ['Live'] },
          { name: 'Twin', kind: 'av_capture_input', scenes: ['Live'] },
          { name: 'Mic', kind: 'coreaudio_input_capture', scenes: ['Live'] },
        ],
      })
    }
    if (/\/studio\/engine\/sources\/[^/]+\/filters$/.test(path)) return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/scenes/Live/items/5/filters') {
      return route.fulfill({ json: [] })
    }
    if (/\/studio\/engine\/sources\/[^/]+\/options$/.test(path)) return route.fulfill({ json: [] })
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

  return { puts, errors, edits, shown }
}

async function openSettings(page: Page, name: string) {
  await page
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()
    .click()
  await page.getByRole('button', { name: `Settings of ${name}` }).click()
  const drawer = page.getByRole('complementary', { name: `${name} settings` })
  await expect(drawer).toBeVisible()
  return drawer
}

async function openSources(page: Page, mobile: boolean) {
  await page.goto('./#/studio/golive')
  if (mobile) {
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Sources', { exact: true })
      .click()
  }
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible()
}

for (const [name, size] of [
  ['desktop 1280px', { width: 1280, height: 800 }],
  ['phone 375px', { width: 375, height: 812 }],
] as const) {
  test.describe(`selective recording, ${name}`, () => {
    test('the list marks a source that is for one only, and nothing for both', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      await expect(page.getByRole('img', { name: 'Shown on the stream only' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Shown in the recording only' })).toBeVisible()
      // Camera is shown on both: no mark on its row.
      await expect(
        page.getByRole('button', { name: 'Camera', exact: true }).getByRole('img'),
      ).toHaveCount(0)
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(over, 'nothing overflows sideways').toBe(false)
      await page.screenshot({ path: `test-results/selective-list-${size.width}.png` })
      expect(errors).toEqual([])
    })

    test('the source settings choose, and the list follows', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, edits, shown } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      const drawer = await openSettings(page, 'Camera')
      const group = drawer.getByRole('radiogroup', { name: 'Shown in' })
      await expect(group).toBeVisible()
      await expect(group.getByRole('radio', { name: 'Both' })).toBeChecked()
      // The words are single, so the control fits a 375 px drawer.
      const box = await group.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= size.width).toBe(true)
      await group.getByText('Recording', { exact: true }).click()
      await expect.poll(() => edits).toEqual([{ id: 5, do: 'recording_only' }])
      expect(shown[5]).toBe('recording')
      await expect(group.getByRole('radio', { name: 'Recording' })).toBeChecked()
      // The list says so too.
      await expect(
        page
          .getByRole('button', { name: /^Camera/ })
          .first()
          .getByRole('img', { name: 'Shown in the recording only' }),
      ).toBeVisible()
      // Back to both: the mark goes.
      await group.getByText('Both', { exact: true }).click()
      await expect.poll(() => edits.at(-1)).toEqual({ id: 5, do: 'stream_and_recording' })
      await expect(
        page
          .getByRole('button', { name: /^Camera/ })
          .first()
          .getByRole('img'),
      ).toHaveCount(0)
      await page.screenshot({ path: `test-results/selective-settings-${size.width}.png` })
      expect(errors).toEqual([])
    })

    test('it can be chosen from the keyboard, and the (i) says what each is for', async ({
      page,
    }) => {
      await page.setViewportSize(size)
      const { errors, edits } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      const drawer = await openSettings(page, 'Camera')
      const both = drawer.getByRole('radio', { name: 'Both' })
      await both.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => edits).toEqual([{ id: 5, do: 'stream_only' }])
      await expect(drawer.getByRole('radio', { name: 'Stream' })).toBeChecked()
      await drawer.getByRole('button', { name: 'About where it is shown' }).click()
      await expect(page.getByText(/keeps it out of your recording/).last()).toBeVisible()
      await page.keyboard.press('Escape')
      expect(errors).toEqual([])
    })

    test('the row menu chooses too, with the current one ticked', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, edits } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      await page.getByRole('button', { name: /^Chat/ }).first().click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Shown in' }).click()
      await expect(page.getByRole('menuitemradio', { name: 'Stream only' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await page.getByRole('menuitemradio', { name: 'Stream and recording' }).click()
      await expect.poll(() => edits).toEqual([{ id: 6, do: 'stream_and_recording' }])
      await expect(
        page.getByRole('button', { name: /^Chat/ }).first().getByRole('img'),
      ).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('a sound source has no Shown in, in its settings or its menu', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      // Its menu first: a picture has the entry, the microphone doesn't.
      await page.getByRole('button', { name: /^Chat/ }).first().click({ button: 'right' })
      await expect(page.getByRole('menuitem', { name: 'Shown in' })).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Mic/ }).first().click({ button: 'right' })
      await expect(page.getByRole('menuitem', { name: 'Blending' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Shown in' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      expect(errors).toEqual([])
    })

    test('two items of one source: the settings are about the one picked', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, edits, shown } = await mountMockStudio(page)
      await openSources(page, size.width < 500)
      // The second Twin (id 9) is the lower row; pick it, open its settings, choose.
      await page.getByRole('button', { name: /^Twin/ }).nth(1).click()
      await page.getByRole('button', { name: 'Settings of Twin' }).click()
      const drawer = page.getByRole('complementary', { name: 'Twin settings' })
      await drawer
        .getByRole('radiogroup', { name: 'Shown in' })
        .getByText('Recording', { exact: true })
        .click()
      await expect.poll(() => edits).toEqual([{ id: 9, do: 'recording_only' }])
      expect(shown[9]).toBe('recording')
      expect(shown[8]).toBe('both')
      expect(errors).toEqual([])
    })

    test('no accessibility violations in the list or the control', async ({ page }) => {
      await page.setViewportSize(size)
      await mountMockStudio(page)
      await openSources(page, size.width < 500)
      await openSettings(page, 'Face cam')
      await expect(page.getByRole('radiogroup', { name: 'Shown in' })).toBeVisible()
      const scan = await new AxeBuilder({ page })
        // The control and the list: the drawer's own picture placeholder is another item.
        .include('[role="radiogroup"][aria-label="Shown in"]')
        .include('[aria-label="Sources, top first"]')
        .analyze()
      expect(
        scan.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
        ),
      ).toEqual([])
    })
  })
}
