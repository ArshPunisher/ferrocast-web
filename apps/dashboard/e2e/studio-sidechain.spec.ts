import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Compressor sidechain UI ("Duck under" + (i)) in Ferrocast's own Studio desk, verified at
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
  let filterSettings: Record<string, unknown> = {
    threshold: -18,
    ratio: 10,
    attack_time: 6,
    release_time: 60,
    output_gain: 0,
    sidechain_source: 'none',
  }

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
    const method = req.method()

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
          ],
          filters: [{ id: 'compressor_filter', name: 'Compressor' }],
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
            id: 1,
            name: 'Music',
            kind: 'coreaudio_output_capture',
            visible: true,
            locked: false,
            audio: true,
            group: false,
            blend: 'normal',
            scale_filter: 'off',
            children: [],
          },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Live/audio') {
      return route.fulfill({
        json: [
          {
            name: 'Mic/Aux',
            kind: 'coreaudio_input_capture',
            channel: 3,
            volume_db: -4,
            muted: false,
            monitor: 'off',
            active: true,
          },
          {
            name: 'Music',
            kind: 'coreaudio_output_capture',
            channel: null,
            volume_db: -12,
            muted: false,
            monitor: 'off',
            active: true,
          },
          {
            name: 'Discord',
            kind: 'coreaudio_output_capture',
            channel: null,
            volume_db: -8,
            muted: false,
            monitor: 'off',
            active: true,
          },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/sources') {
      return route.fulfill({
        json: [
          { name: 'Music', kind: 'coreaudio_output_capture', scenes: ['Live'] },
          { name: 'Discord', kind: 'coreaudio_output_capture', scenes: ['Live'] },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/sources/Music/filters') {
      return route.fulfill({
        json: [{ name: 'Compressor', kind: 'compressor_filter', enabled: true }],
      })
    }
    if (path === '/api/v1/studio/engine/sources/Music/filters/Compressor/options') {
      return route.fulfill({
        json: [
          {
            key: 'ratio',
            label: 'Ratio',
            kind: 'float',
            help: '',
            visible: true,
            enabled: true,
            min: 1,
            max: 32,
            step: 0.1,
            slider: true,
            suffix: ':1',
            default: 10,
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'threshold',
            label: 'Threshold',
            kind: 'float',
            help: '',
            visible: true,
            enabled: true,
            min: -60,
            max: 0,
            step: 0.5,
            slider: true,
            suffix: ' dB',
            default: -18,
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'attack_time',
            label: 'Attack',
            kind: 'int',
            help: '',
            visible: true,
            enabled: true,
            min: 1,
            max: 500,
            step: 1,
            slider: true,
            suffix: ' ms',
            default: 6,
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'release_time',
            label: 'Release',
            kind: 'int',
            help: '',
            visible: true,
            enabled: true,
            min: 1,
            max: 1000,
            step: 1,
            slider: true,
            suffix: ' ms',
            default: 60,
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'output_gain',
            label: 'Output Gain',
            kind: 'float',
            help: '',
            visible: true,
            enabled: true,
            min: -32,
            max: 32,
            step: 0.5,
            slider: true,
            suffix: ' dB',
            default: 0,
            choices: [],
            values: [],
            group: [],
          },
          {
            key: 'sidechain_source',
            label: 'Duck under',
            kind: 'list',
            help: 'Lower this sound while another source plays, like your mic.',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            default: 'none',
            choices: ['None', 'Mic/Aux', 'Discord'],
            values: ['none', 'Mic/Aux', 'Discord'],
            group: [],
          },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/sources/Music/filters/Compressor/settings') {
      if (method === 'PUT') {
        const payload = req.postDataJSON() as { settings?: Record<string, unknown> }
        puts.push({ url: path, body: payload })
        filterSettings = { ...filterSettings, ...(payload.settings ?? {}) }
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill({ json: filterSettings })
    }
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

  return { puts, errors }
}

async function openMusicCompressor(page: Page, mobile: boolean) {
  await page.goto('./#/studio/golive')
  if (mobile) {
    // On a phone, switch the single visible dock to Audio first.
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Audio', { exact: true })
      .click()
  }
  const moreMusic = page.getByRole('button', { name: 'More for Music' })
  await expect(moreMusic).toBeVisible()
  await moreMusic.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await moreMusic.click()
  await page.getByRole('menuitem', { name: 'Filters', exact: true }).click()

  const drawer = page.getByRole('complementary', { name: 'Music settings' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: /^Compressor\b/ }).click()
  return drawer
}

test.describe('studio sidechain compressor', () => {
  test('desktop 1280px: Duck under select, info tip, settings PUT and a11y', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const { puts, errors } = await mountMockStudio(page)
    const drawer = await openMusicCompressor(page, false)

    const select = drawer.getByLabel('Duck under', { exact: true })
    await expect(select).toBeVisible()
    await expect(select.locator('option')).toHaveText(['None', 'Mic/Aux', 'Discord'])
    await expect(select).toHaveValue('0')

    // Info tip (i) opens cleanly inside the drawer.
    await drawer.getByRole('button', { name: 'About duck under' }).click()
    await expect(
      page
        .locator('div[data-over-preview]')
        .filter({ hasText: 'Lower this sound while another source plays, like your mic.' }),
    ).toBeVisible()

    // Picking Mic/Aux persists sidechain_source via PUT.
    await select.selectOption({ label: 'Mic/Aux' })
    await expect
      .poll(() =>
        puts.find((p) => p.body.settings && 'sidechain_source' in (p.body.settings as object)),
      )
      .toMatchObject({
        body: { settings: { sidechain_source: 'Mic/Aux' } },
      })

    await page.screenshot({ path: testInfo.outputPath('sidechain-1280.png') })

    // Close the tip before running axe so the portal bubble isn't checked mid-transition.
    await page.keyboard.press('Escape')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const a11y = await new AxeBuilder({ page })
      .include('aside[aria-label="Music settings"]')
      .analyze()
    expect(a11y.violations).toEqual([])
    expect(errors).toEqual([])
  })

  test('mobile 375px: Duck under fits cleanly with zero horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const { puts, errors } = await mountMockStudio(page)
    const drawer = await openMusicCompressor(page, true)

    const select = drawer.getByLabel('Duck under', { exact: true })
    await expect(select).toBeVisible()
    await expect(select.locator('option')).toHaveText(['None', 'Mic/Aux', 'Discord'])

    await select.selectOption({ label: 'Mic/Aux' })
    await expect
      .poll(() =>
        puts.find((p) => p.body.settings && 'sidechain_source' in (p.body.settings as object)),
      )
      .toMatchObject({
        body: { settings: { sidechain_source: 'Mic/Aux' } },
      })

    // Open (i) tip at 375px and verify it stays inside the viewport.
    await drawer.getByRole('button', { name: 'About duck under' }).click()
    const tip = page
      .locator('div[data-over-preview]')
      .filter({ hasText: 'Lower this sound while another source plays, like your mic.' })
    await expect(tip).toBeVisible()
    const box = await tip.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)

    await page.screenshot({ path: testInfo.outputPath('sidechain-375.png') })

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    expect(errors).toEqual([])
  })
})
