import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { settled } from './helpers'

const SHOT_DIR = '/Users/arshramgarhia/Documents/Projects/ferrocast/notes/design/studio-clips'

async function openPreStartDemo(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
  })
  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
  await expect(page.getByTestId('studio-standby')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Start the Studio' })).toBeVisible()
  await expect(page.getByTestId('standby-platforms')).toBeVisible()
  await expect(page.getByTestId('standby-recent-clips')).toBeVisible()
  await settled(page)
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const maxRight = Math.max(
      ...[...document.querySelectorAll('#main *, [data-testid="studio-standby"] *')]
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null)
        .map((el) => el.getBoundingClientRect().right),
      0,
    )
    return {
      innerWidth: window.innerWidth,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      maxRight,
    }
  })
  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.maxRight).toBeLessThanOrEqual(metrics.innerWidth + 1)
}

async function assertNoVerticalPageScroll(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }))
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight)
}

async function maybeShot(page: Page, width: number) {
  if (!fs.existsSync(SHOT_DIR)) return
  await page.screenshot({ path: path.join(SHOT_DIR, `S3-${width}.png`) })
}

async function countWordOccurrences(root: Locator, word: string): Promise<number> {
  return root.evaluate((el, target) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let count = 0
    const re = new RegExp(`\\b${target}\\b`, 'gi')
    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue ?? ''
      const matches = text.match(re)
      if (matches) count += matches.length
    }
    return count
  }, word)
}

test.describe('Studio > Go live pre-start S3 (Studio-Desk Silhouette)', () => {
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    test(`fits ${vp.width}x${vp.height} without scroll, mirrors Studio layout, and shows platforms once`, async ({
      page,
    }) => {
      await openPreStartDemo(page, vp)

      await assertNoHorizontalOverflow(page)
      await assertNoVerticalPageScroll(page)

      const standby = page.getByTestId('studio-standby')
      const stage = page.getByTestId('standby-stage-frame')
      const dock = standby.locator('aside[aria-label="Pre-start dock"]')
      const clips = page.getByTestId('standby-recent-clips')

      const stageBox = await stage.boundingBox()
      const dockBox = await dock.boundingBox()
      const clipsBox = await clips.boundingBox()
      expect(stageBox).not.toBeNull()
      expect(dockBox).not.toBeNull()
      expect(clipsBox).not.toBeNull()

      // Left stage sits to the left of right dock; aspect ratio is 16:9.
      expect(stageBox!.x).toBeLessThan(dockBox!.x)
      expect(Math.abs(stageBox!.width / stageBox!.height - 16 / 9)).toBeLessThan(0.1)
      // Full-width recent recordings strip sits below the top stage/dock row.
      expect(clipsBox!.y).toBeGreaterThanOrEqual(stageBox!.y + stageBox!.height)

      // Start the Studio primary orange button with white text.
      const startBtn = page.getByRole('button', { name: 'Start the Studio' })
      const styles = await startBtn.evaluate((el) => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, color: s.color }
      })
      expect(styles.bg).toBe('rgb(192, 77, 0)')
      expect(styles.color).toBe('rgb(255, 255, 255)')

      // Last scene thumbnail rendered inside the 16:9 standby stage.
      await expect(stage.locator('img')).toBeVisible()

      // Platforms are shown ONCE inside the right dock, never duplicated elsewhere in Studio main.
      const platforms = page.getByTestId('standby-platforms')
      await expect(platforms.getByText('Twitch', { exact: true })).toBeVisible()
      await expect(platforms.getByText('YouTube', { exact: true })).toBeVisible()
      await expect(platforms.getByText('Kick', { exact: true })).toBeVisible()
      const main = page.locator('#main')
      expect(await countWordOccurrences(main, 'Twitch')).toBe(1)
      expect(await countWordOccurrences(main, 'YouTube')).toBe(1)
      expect(await countWordOccurrences(main, 'Kick')).toBe(1)

      // Quick checks show Mic, Camera, Disk, Connections.
      const checks = page.getByTestId('standby-quick-checks')
      for (const label of ['Mic', 'Camera', 'Disk', 'Connections']) {
        await expect(checks.getByText(label, { exact: true })).toBeVisible()
      }

      // Compact recent clip cards (horizontal mini-thumb + label, not full-width blocks).
      const firstClipBtn = clips.getByRole('button').nth(1)
      const clipBox = await firstClipBtn.boundingBox()
      expect(clipBox).not.toBeNull()
      expect(clipBox!.height).toBeLessThanOrEqual(85)

      // Capture deliverable screenshot before mutating schedule/route state.
      await maybeShot(page, vp.width)

      // Planned streams stays reachable inside the dock and can plan & remove a stream.
      await dock.getByRole('button', { name: 'Plan a stream' }).click()
      const dialog = page.getByRole('dialog', { name: 'Plan a stream' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Title').fill('Evening dev stream')
      await dialog.getByRole('button', { name: 'Plan it' }).click()
      await expect(dock.getByText('Evening dev stream')).toBeVisible()
      await dock.getByRole('button', { name: 'Remove Evening dev stream' }).click()
      const confirmRemove = page.getByRole('alertdialog', { name: 'Remove Evening dev stream?' })
      if (await confirmRemove.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmRemove.getByRole('button', { name: 'Remove' }).click()
      }
      await expect(dock.getByText('Nothing planned yet.')).toBeVisible()

      // Clicking Open clips navigates cleanly to Studio > Clips.
      await clips.getByRole('button', { name: 'Open clips' }).click()
      await expect(page).toHaveURL(/#\/studio\/clips/)
    })
  }

  test('stacks cleanly at 375 px with zero horizontal overflow', async ({ page }) => {
    await openPreStartDemo(page, { width: 375, height: 812 })
    await assertNoHorizontalOverflow(page)

    const standby = page.getByTestId('studio-standby')
    const stage = page.getByTestId('standby-stage-frame')
    const dock = standby.locator('aside[aria-label="Pre-start dock"]')
    const clips = page.getByTestId('standby-recent-clips')

    const stageBox = await stage.boundingBox()
    const dockBox = await dock.boundingBox()
    const clipsBox = await clips.boundingBox()
    expect(stageBox!.y).toBeLessThan(dockBox!.y)
    expect(dockBox!.y).toBeLessThan(clipsBox!.y)

    const checks = page.getByTestId('standby-quick-checks')
    for (const label of ['Mic', 'Camera', 'Disk', 'Connections']) {
      await expect(checks.getByText(label, { exact: true })).toBeVisible()
    }

    const main = page.locator('#main')
    expect(await countWordOccurrences(main, 'Twitch')).toBe(1)
    expect(await countWordOccurrences(main, 'YouTube')).toBe(1)
    expect(await countWordOccurrences(main, 'Kick')).toBe(1)

    await maybeShot(page, 375)
  })

  test('handles not-started, starting, failed (retry + mic alert), and running transitions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    let running = false
    let startAttempts = 0
    let resolveDelayedStart: (() => void) | null = null

    await page.addInitScript(() => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
        api: window.location.origin,
        token: 's3-e2e-token',
        desktop: true,
      })
      localStorage.setItem('fc-golive-picture', 'ferrocast')
    })

    await page.routeWebSocket('**/api/v1/live**', (ws) => {
      void ws
    })

    await page.route('**/api/v1/**', async (route) => {
      const req = route.request()
      const pathName = new URL(req.url()).pathname

      if (pathName === '/api/v1/status') {
        return route.fulfill({
          json: {
            version: '3.4.0',
            port: 5355,
            live: { twitch: false, youtube: false, kick: false },
            connectors: {
              twitch: {
                state: 'connected',
                account: { name: 'streamer', avatar_url: null },
                detail: null,
                last_event_at: null,
              },
              youtube: {
                state: 'connected',
                account: { name: 'StreamerYT', avatar_url: null },
                detail: null,
                last_event_at: null,
              },
              kick: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              facebook: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              obs: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              relay: { state: 'disconnected', account: null, detail: null, last_event_at: null },
            },
            setup_done: true,
          },
        })
      }
      if (pathName === '/api/v1/session/ticket') return route.fulfill({ json: { ticket: 's3' } })
      if (pathName === '/api/v1/queue') {
        return route.fulfill({ json: { paused: false, current: null, queued: [] } })
      }
      if (pathName === '/api/v1/session/stats') return route.fulfill({ json: { viewers: {} } })
      if (pathName === '/api/v1/tts/pending') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/events') {
        return route.fulfill({ json: { events: [], next_before: null } })
      }
      if (pathName === '/api/v1/schedule') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/clips') {
        return route.fulfill({
          json: {
            folder: '/Movies/Ferrocast',
            ffmpeg_ready: true,
            youtube_connected: true,
            clips: [],
          },
        })
      }
      if (pathName === '/api/v1/show') return route.fulfill({ json: { show: null } })
      if (pathName === '/api/v1/show/config') {
        return route.fulfill({
          json: {
            preset_id: null,
            starting_scene: 'Starting Soon',
            countdown_s: 30,
            live_scene: 'Live',
            alerts_on: true,
            discord: false,
            bot_on: false,
            replay_buffer: false,
            start_stream: true,
            ending_scene: null,
            stop_stream: true,
            stop_delay_s: 0,
            recap_message: null,
            mic_sources: ['USB Mic'],
            cam_sources: ['Facecam'],
            min_disk_gb: 5,
            platforms: ['twitch'],
          },
        })
      }
      if (pathName === '/api/v1/show/preflight') {
        return route.fulfill({
          status: 422,
          json: { code: 'studio_not_running', message: 'Not running yet.' },
        })
      }
      if (pathName === '/api/v1/golive') {
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
            destinations: [
              {
                id: 'twitch',
                kind: 'twitch',
                canvas: 'main',
                name: 'Twitch',
                account: 'streamer',
                enabled: true,
                connected: true,
                health: null,
                blocked: null,
                rules: [],
              },
            ],
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
            cut: { source: 'canvas', config: null, state: null, ffmpeg: { state: 'ready' } },
          },
        })
      }
      if (pathName === '/api/v1/studio/engine') {
        return route.fulfill({
          json: {
            available: true,
            running,
            version: '3.4.0',
            renderer: 'Metal',
            detail: null,
            safe_mode: null,
          },
        })
      }
      if (pathName === '/api/v1/studio/engine/start') {
        startAttempts += 1
        if (startAttempts === 1) {
          // Hold attempt 1 long enough to assert the `starting` state, then reject with audio error.
          await new Promise<void>((resolve) => {
            resolveDelayedStart = resolve
          })
          return route.fulfill({
            status: 500,
            json: {
              error: {
                code: 'studio_audio_busy',
                message: 'Could not open microphone audio device.',
                hint: 'Close other apps using the mic and retry.',
              },
            },
          })
        }
        running = true
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
      if (pathName === '/api/v1/studio/engine/library/collections') {
        return route.fulfill({
          json: { current: 'main', list: [{ id: 'main', name: 'Main Show' }] },
        })
      }
      if (pathName === '/api/v1/studio/engine/library/profiles') {
        return route.fulfill({
          json: { current: 'p1', list: [{ id: 'p1', name: '1080p60' }] },
        })
      }
      if (pathName === '/api/v1/studio/engine/settings') {
        return route.fulfill({
          json: {
            width: 1920,
            height: 1080,
            fps: 60,
            video_kbps: 6000,
            audio_kbps: 160,
            encoder: 'hardware',
            vbr: true,
            keyframe_s: 2,
            profile: 'high',
            b_frames: false,
            scale: null,
            record_folder: null,
            record_folder_default: '/Users/demo/Movies/Ferrocast',
            record_format: 'mkv',
            record_quality: 'high',
            reconnect: true,
            reconnect_every_s: 5,
            reconnect_tries: 10,
            delay_s: 0,
            sample_rate: 48000,
            stereo: true,
            monitoring: null,
            hotkeys: {},
          },
        })
      }
      if (pathName === '/api/v1/studio/engine/scenes') {
        return route.fulfill({
          json: {
            scenes: [{ name: 'Live', items: 1, current: true, transition: null }],
            current: 'Live',
            transition: { kind: 'fade_transition', ms: 300 },
          },
        })
      }
      if (pathName === '/api/v1/studio/engine/scenes/Live/thumbnail') {
        return route.fulfill({ status: 422, json: { code: 'studio_not_running', message: 'Off' } })
      }
      if (pathName === '/api/v1/studio/engine/scenes/Live/items') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/studio/engine/scenes/Live/audio') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/studio/engine/sources') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/studio/engine/kinds') {
        return route.fulfill({
          json: { inputs: [], filters: [], transitions: [], encoders: [], outputs: [] },
        })
      }
      if (pathName === '/api/v1/studio/engine/library') {
        return route.fulfill({ json: { entries: [] } })
      }
      if (pathName === '/api/v1/studio/engine/stats') {
        return route.fulfill({
          json: {
            engine: { cpu: 2.1, fps: 60, frame_ms: 3.1, lagged: 0, frames: 120, memory_mb: 160 },
            canvas: { width: 1920, height: 1080, fps: 60 },
            stream: null,
            record: null,
            scene: 'Live',
            history: { undo: null, redo: null },
          },
        })
      }
      if (pathName === '/api/v1/pro') {
        return route.fulfill({
          json: { active: false, sales_open: false, sale: null, features: { history: false } },
        })
      }
      if (pathName === '/api/v1/studio/show') {
        return route.fulfill({ json: { config: {}, run: null } })
      }
      if (pathName === '/api/v1/stream-info') {
        return route.fulfill({ json: { presets: [], history: [], platforms: [] } })
      }
      return route.fulfill({ status: 404, json: { code: 'not_found', message: 'Not mocked' } })
    })

    await page.goto('./#/studio')
    const startBtn = page.getByRole('button', { name: 'Start the Studio' })
    await expect(startBtn).toBeVisible()
    // Cold start without thumbnail still falls back cleanly without any vertical overflow.
    await assertNoVerticalPageScroll(page)
    await assertNoHorizontalOverflow(page)

    // 1. Trigger `starting` state
    await startBtn.click()
    await expect(page.getByTestId('standby-starting-banner')).toBeVisible()
    await expect(startBtn).toBeDisabled()
    await assertNoVerticalPageScroll(page)

    // 2. Release first attempt -> transitions to `failed` state with Mic check flagged danger
    expect(resolveDelayedStart).not.toBeNull()
    resolveDelayedStart!()
    const failedBanner = page.getByTestId('standby-failed-banner')
    await expect(failedBanner).toBeVisible()
    await expect(failedBanner).toContainText('Could not open microphone audio device.')
    await expect(page.locator('[data-check-id="mic"][data-check-tone="danger"]')).toBeVisible()
    await assertNoVerticalPageScroll(page)

    // 3. Click Retry -> second attempt succeeds -> running Studio appears
    await failedBanner.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible({ timeout: 10_000 })
  })

  test('renders unavailable state cleanly when Studio engine cannot start', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
        api: window.location.origin,
        token: 's3-e2e-token',
        desktop: true,
      })
      localStorage.setItem('fc-golive-picture', 'ferrocast')
    })
    await page.routeWebSocket('**/api/v1/live**', (ws) => void ws)
    await page.route('**/api/v1/**', async (route) => {
      const pathName = new URL(route.request().url()).pathname
      if (pathName === '/api/v1/status') {
        return route.fulfill({
          json: {
            version: '3.4.0',
            port: 5355,
            live: { twitch: false, youtube: false, kick: false },
            connectors: {
              twitch: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              youtube: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              kick: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              facebook: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              obs: { state: 'disconnected', account: null, detail: null, last_event_at: null },
              relay: { state: 'disconnected', account: null, detail: null, last_event_at: null },
            },
            setup_done: true,
          },
        })
      }
      if (pathName === '/api/v1/session/ticket') return route.fulfill({ json: { ticket: 's3' } })
      if (pathName === '/api/v1/queue')
        return route.fulfill({ json: { paused: false, current: null, queued: [] } })
      if (pathName === '/api/v1/session/stats') return route.fulfill({ json: { viewers: {} } })
      if (pathName === '/api/v1/tts/pending') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/events')
        return route.fulfill({ json: { events: [], next_before: null } })
      if (pathName === '/api/v1/schedule') return route.fulfill({ json: [] })
      if (pathName === '/api/v1/clips') {
        return route.fulfill({
          json: { folder: '', ffmpeg_ready: false, youtube_connected: false, clips: [] },
        })
      }
      if (pathName === '/api/v1/golive') {
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
            cut: { source: 'canvas', config: null, state: null, ffmpeg: { state: 'ready' } },
          },
        })
      }
      if (pathName === '/api/v1/studio/engine') {
        return route.fulfill({
          json: {
            available: false,
            running: false,
            version: null,
            renderer: null,
            detail: 'OBS helper runtime is missing on this computer.',
            safe_mode: null,
          },
        })
      }
      return route.fulfill({
        status: 422,
        json: { code: 'studio_not_running', message: 'Not running.' },
      })
    })

    await page.goto('./#/studio')
    const failedBanner = page.getByTestId('standby-failed-banner')
    await expect(failedBanner).toBeVisible()
    await expect(failedBanner).toContainText('OBS helper runtime is missing on this computer.')
    await expect(page.getByRole('button', { name: 'Start the Studio' })).toBeDisabled()
    await assertNoVerticalPageScroll(page)
    await assertNoHorizontalOverflow(page)
  })

  test('supports full keyboard navigation and passes axe-core in dark and light themes', async ({
    page,
  }) => {
    for (const theme of ['slate', 'daylight'] as const) {
      await page.addInitScript((t) => {
        localStorage.setItem('fc-theme', t)
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      }, theme)
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
      await expect(page.getByTestId('studio-standby')).toBeVisible({ timeout: 10_000 })
      await settled(page)

      const axe = await new AxeBuilder({ page }).include('[data-testid="studio-standby"]').analyze()
      expect(axe.violations).toEqual([])
    }

    // Keyboard: focus Manage -> open dialog with Enter -> close with Escape; focus Plan a stream -> Escape.
    const startBtn = page.getByRole('button', { name: 'Start the Studio' })
    await startBtn.focus()
    await expect(startBtn).toBeFocused()

    await page.getByRole('button', { name: 'Manage' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Your platforms' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Your platforms' })).toBeHidden()

    await page.getByRole('button', { name: 'Plan a stream' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Plan a stream' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Plan a stream' })).toBeHidden()
  })
})
