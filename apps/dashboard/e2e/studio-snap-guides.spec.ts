import { expect, test, type Page } from '@playwright/test'

// Snap guides and alignment in the Studio preview, at desktop (1280) and phone (375, touch)
// widths, against mocked Studio engine endpoints (a canvas of 1920x1080 with three boxes).

async function mountMockStudio(page: Page) {
  // Each item's box on the 1920x1080 canvas, and every box request the page made.
  type Frame = [number, number, number, number, number, number]
  const frames: Record<number, Frame> = {
    1: [200, 0, 0, 100, 100, 100],
    2: [200, 0, 0, 100, 500, 100],
    3: [100, 0, 0, 100, 300, 400],
  }
  const single: { id: number; x: number; y: number; w: number; h: number; save: boolean }[] = []
  const many: {
    items: { id: number; x: number; y: number; w: number; h: number }[]
    save: boolean
  }[] = []
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
          scenes: [{ name: 'Live', items: 3, current: true, transition: null }],
          current: 'Live',
          transition: { kind: 'fade_transition', ms: 300 },
        },
      })
    }
    const item = (id: number, name: string) => ({
      id,
      name,
      kind: 'color_source_v3',
      visible: true,
      locked: false,
      audio: false,
      group: false,
      blend: 'normal',
      scale_filter: 'off',
      frame: frames[id],
      children: [],
    })
    const place = (id: number, x: number, y: number, w: number, h: number) => {
      frames[id] = [w, 0, 0, h, x, y]
      return item(id, ['', 'Alpha', 'Beta', 'Gamma'][id] ?? 'Item')
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items/boxes' && req.method() === 'PUT') {
      const body = req.postDataJSON() as {
        items: { id: number; x: number; y: number; w: number; h: number }[]
        save?: boolean
      }
      many.push({ items: body.items, save: !!body.save })
      return route.fulfill({ json: body.items.map((b) => place(b.id, b.x, b.y, b.w, b.h)) })
    }
    const one = path.match(/\/studio\/engine\/scenes\/Live\/items\/(\d+)\/box$/)
    if (one && req.method() === 'PUT') {
      const id = Number(one[1])
      const b = req.postDataJSON() as { x: number; y: number; w: number; h: number; save?: boolean }
      single.push({ id, ...b, save: !!b.save })
      return route.fulfill({ json: place(id, b.x, b.y, b.w, b.h) })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/items') {
      return route.fulfill({ json: [item(3, 'Gamma'), item(2, 'Beta'), item(1, 'Alpha')] })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/audio') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/sources') {
      return route.fulfill({
        json: [
          { name: 'Alpha', kind: 'color_source_v3', scenes: ['Live'] },
          { name: 'Beta', kind: 'color_source_v3', scenes: ['Live'] },
          { name: 'Gamma', kind: 'color_source_v3', scenes: ['Live'] },
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
          snapping: true,
          snap_px: 10,
          snap_screen: true,
          snap_center: true,
          snap_sources: true,
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

  return { puts, errors, frames, single, many }
}

type Box = { x: number; y: number; width: number; height: number }

/** The canvas box on the page, and canvas pixels turned into page coordinates. */
async function canvasBox(page: Page) {
  const box = (await page.locator('[data-canvas-box]').first().boundingBox()) as Box
  const scale = box.width / 1920
  return {
    box,
    scale,
    at: (x: number, y: number) => ({ x: box.x + x * scale, y: box.y + y * scale }),
  }
}

async function openPreview(page: Page, mobile: boolean) {
  await page.goto('./#/studio/golive')
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()
  if (mobile) await page.waitForTimeout(150)
}

/** The "pick one more" key: ⌘ on a Mac, Ctrl elsewhere (as OBS, and the page). */
async function toggleKey(page: Page) {
  const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform))
  return mac ? 'Meta' : 'Control'
}

/** A real touch (CDP) or mouse drag from canvas point `from` to `to`, calling `during` mid-way. */
async function dragBetween(
  page: Page,
  touch: boolean,
  from: { x: number; y: number },
  to: { x: number; y: number },
  during?: () => Promise<void>,
  modifiers: string[] = [],
) {
  const steps = 8
  const point = (k: number) => ({
    x: from.x + ((to.x - from.x) * k) / steps,
    y: from.y + ((to.y - from.y) * k) / steps,
  })
  if (touch) {
    const cdp = await page.context().newCDPSession(page)
    const send = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      p: { x: number; y: number } | null,
    ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ ...p, id: 1 }] : [] })
    await send('touchStart', from)
    for (let k = 1; k <= steps; k++) await send('touchMove', point(k))
    if (during) await during()
    await send('touchEnd', null)
    await cdp.detach()
    return
  }
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let k = 1; k <= steps; k++) await page.mouse.move(point(k).x, point(k).y)
  if (during) await during()
  await page.mouse.up()
  for (const m of modifiers) await page.keyboard.up(m)
}

for (const [name, size, touch] of [
  ['desktop 1280px', { width: 1280, height: 800 }, false],
  ['phone 375px, touch', { width: 375, height: 812 }, true],
] as const) {
  test.describe(`snap guides and alignment, ${name}`, () => {
    test.use({ hasTouch: touch })

    test('dragging a source shows the guide it snaps to and the gap to its neighbour, and lands on it', async ({
      page,
    }) => {
      await page.setViewportSize(size)
      const { errors, frames, single } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      // Alpha is at x 100-300; Beta's left edge is 500. Pull Alpha's right edge to within 3 px of it.
      let seen: { guide: number; label: string | null } | null = null
      await dragBetween(page, touch, at(200, 150), at(397, 150), async () => {
        seen = {
          guide: await page.locator('[data-snap-guide="x"]').count(),
          label: await page.locator('[data-snap-gap-label]').first().textContent(),
        }
        await page.screenshot({ path: `test-results/snap-guides-${size.width}.png` })
      })
      expect(seen!.guide, 'a guide line is on show while it snaps').toBeGreaterThan(0)
      expect(seen!.label, 'the distance to its neighbour is on show').toMatch(/^\d+$/)
      // Let go: it is where the guide said (Alpha's right edge on Beta's left: x = 500 - 200).
      await expect.poll(() => single.at(-1)).toMatchObject({ id: 1, x: 300, save: true })
      expect(frames[1]?.[4]).toBe(300)
      await expect(page.locator('[data-snap-guide]')).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('Alt skips the snap and the guides', async ({ page }) => {
      test.skip(touch, 'no Alt key on a phone')
      await page.setViewportSize(size)
      await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      let guides = -1
      await dragBetween(
        page,
        touch,
        at(200, 150),
        at(397, 150),
        async () => {
          guides = await page.locator('[data-snap-guide]').count()
        },
        ['Alt'],
      )
      expect(guides).toBe(0)
    })

    test('a box dragged on empty canvas picks what it touches; Shift adds, Ctrl toggles', async ({
      page,
    }) => {
      await page.setViewportSize(size)
      const { errors } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      // Round Alpha and Beta (y 100-200): two picked, one box round both.
      await dragBetween(page, touch, at(50, 50), at(750, 250))
      await expect(page.locator('[data-group-box]')).toBeVisible()
      await expect(page.locator('[data-group-handle]')).toHaveCount(8)
      if (!touch) {
        // Shift adds Gamma; Ctrl takes Alpha off again (still two: Beta and Gamma).
        await dragBetween(page, touch, at(250, 350), at(450, 550), undefined, ['Shift'])
        await expect(page.locator('[data-group-handle]')).toHaveCount(8)
        await dragBetween(page, touch, at(60, 90), at(120, 140), undefined, [await toggleKey(page)])
        await expect(page.locator('[data-group-handle]')).toHaveCount(8)
        // A click on empty canvas drops them all.
        await page.mouse.click(at(1500, 800).x, at(1500, 800).y)
        await expect(page.locator('[data-group-box]')).toHaveCount(0)
      }
      await page.screenshot({ path: `test-results/snap-group-${size.width}.png` })
      expect(errors).toEqual([])
    })

    test('the picked ones move together in one request, one step', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, many, single } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      await dragBetween(page, touch, at(50, 50), at(750, 250))
      await dragBetween(page, touch, at(200, 150), at(240, 190))
      await expect.poll(() => many.length).toBeGreaterThan(0)
      const last = many.at(-1)!
      expect(last.save).toBe(true)
      expect(last.items.map((b) => b.id).sort()).toEqual([1, 2])
      // Both went by the same 40 pixels (the snap may add a little).
      const [a, b] = [last.items.find((i) => i.id === 1)!, last.items.find((i) => i.id === 2)!]
      expect(b.x - a.x).toBeCloseTo(400, 3)
      expect(single.filter((s) => s.save).length, 'no separate request per source').toBe(0)
      expect(errors).toEqual([])
    })

    test('a handle of the group box sizes them all together', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, many } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      await dragBetween(page, touch, at(50, 50), at(750, 250))
      // The group is x 100-700, y 100-200; pull its bottom right corner out to double the width.
      await dragBetween(page, touch, at(700, 200), at(1300, 400))
      await expect.poll(() => many.at(-1)?.save).toBe(true)
      const last = many.at(-1)!
      const a = last.items.find((i) => i.id === 1)!
      const b = last.items.find((i) => i.id === 2)!
      expect(a.w).toBeGreaterThan(200)
      expect(b.x).toBeGreaterThan(500)
      expect(b.w / a.w).toBeCloseTo(1, 1)
      expect(errors).toEqual([])
    })

    test('Align and Space out, from the bar, as one request', async ({ page }) => {
      await page.setViewportSize(size)
      const { errors, many } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      // Nothing picked: the button is off.
      await expect(
        page.getByRole('button', { name: 'Align and space out the picked sources' }),
      ).toBeDisabled()
      // Alpha, Beta and Gamma: round all three (y 100-500).
      await dragBetween(page, touch, at(50, 50), at(800, 560))
      await page.getByRole('button', { name: 'Align and space out the picked sources' }).click()
      await page.getByRole('menuitem', { name: 'Align' }).click()
      await page.getByRole('menuitem', { name: 'Align left edges' }).click()
      await expect.poll(() => many.length).toBeGreaterThan(0)
      let last = many.at(-1)!
      expect(last.save).toBe(true)
      // The selection's left is 100 (Alpha): Beta and Gamma move to it; Alpha was there.
      expect(last.items.map((i) => [i.id, i.x]).sort()).toEqual([
        [2, 100],
        [3, 100],
      ])
      const before = many.length
      await page.getByRole('button', { name: 'Align and space out the picked sources' }).click()
      await page.getByRole('menuitem', { name: 'Space out' }).click()
      await page.getByRole('menuitem', { name: 'Evenly down' }).click()
      await expect.poll(() => many.length).toBeGreaterThan(before)
      last = many.at(-1)!
      expect(last.items.every((i) => i.id !== 0)).toBe(true)
      expect(errors).toEqual([])
    })

    test('arrow keys nudge 1 pixel, Shift 10; several picked go as one request', async ({
      page,
    }) => {
      test.skip(touch, 'no keyboard on a phone')
      await page.setViewportSize(size)
      const { errors, single, many } = await mountMockStudio(page)
      await openPreview(page, touch)
      const { at } = await canvasBox(page)
      await page.mouse.click(at(200, 150).x, at(200, 150).y)
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => single.at(-1)).toMatchObject({ id: 1, x: 101, save: true })
      await page.keyboard.press('Shift+ArrowDown')
      await expect.poll(() => single.at(-1)).toMatchObject({ id: 1, x: 101, y: 110 })
      // Two picked: one request for both.
      await dragBetween(page, false, at(50, 50), at(750, 250))
      const before = many.length
      await page.keyboard.press('ArrowLeft')
      await expect.poll(() => many.length).toBeGreaterThan(before)
      expect(
        many
          .at(-1)!
          .items.map((i) => i.id)
          .sort(),
      ).toEqual([1, 2])
      expect(errors).toEqual([])
    })
  })
}
