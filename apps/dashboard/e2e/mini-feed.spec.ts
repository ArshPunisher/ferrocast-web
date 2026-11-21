import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// The Studio's Mini Feed bar (events panel): pause, skip, mute, test alert, type filters and
// read marks. The Studio needs the desktop app's engine, so the engine is mocked here
// (statefully for the queue) and the page runs hermetically at 1280 and 375 px.

type Q = { paused: boolean; muted: boolean; playing: unknown; waiting: unknown[] }

const at = Date.now()
const ev = (id: string, type: string, extra: object, n: number) => ({
  id,
  seq: n,
  platform: 'twitch',
  channel: null,
  source_id: null,
  occurred_at: at + n,
  received_at: at + n,
  origin: 'live',
  kind: { type, ...extra },
})
const actor = (name: string) => ({
  platform: 'twitch',
  id: name,
  login: name,
  display_name: name,
  roles: 0,
  anonymous: false,
  color: null,
  avatar_url: null,
})
const EVENTS = [
  ev('e1', 'follow', { actor: actor('Mira') }, 1),
  ev('e2', 'raid', { from: actor('Okoye'), viewers: 12 }, 2),
  ev('e3', 'follow', { actor: actor('Tomas') }, 3),
]

async function mount(page: Page, opts: { failSkip?: boolean; empty?: boolean } = {}) {
  const calls: string[] = []
  const q: Q = {
    paused: false,
    muted: false,
    playing: { alert: { alert_id: 'a1', kind: 'follow', title: 'Mira followed' }, started_at: at },
    waiting: [],
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __FERROCAST__: unknown }
    w.__FERROCAST__ = Object.freeze({ api: location.origin, token: 'mf-e2e', desktop: true })
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.setItem(
      'fc-studio-layout',
      JSON.stringify({
        left: [],
        right: ['events'],
        bottom: [],
        hidden: [],
        locked: true,
        mob: 'events',
      }),
    )
  })
  await page.routeWebSocket('**/api/v1/live**', (ws) => void ws)
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const key = `${req.method()} ${path}`
    if (path === '/api/v1/status')
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
    if (path === '/api/v1/session/ticket') return route.fulfill({ json: { ticket: 't' } })
    if (path === '/api/v1/queue' && req.method() === 'GET') return route.fulfill({ json: q })
    if (path.startsWith('/api/v1/queue/')) {
      calls.push(key)
      if (opts.failSkip && path.endsWith('/skip'))
        return route.fulfill({
          status: 503,
          json: { error: { code: 'busy', message: 'The engine is busy.', hint: 'Try again.' } },
        })
      const op = path.split('/').pop()
      if (op === 'pause') q.paused = true
      if (op === 'resume') q.paused = false
      if (op === 'mute') q.muted = true
      if (op === 'unmute') q.muted = false
      if (op === 'skip') q.playing = null
      return route.fulfill({ json: q })
    }
    if (path === '/api/v1/test') {
      calls.push(key)
      return route.fulfill({ status: 202, json: { ok: true } })
    }
    if (path === '/api/v1/events')
      return route.fulfill({
        json: { events: opts.empty ? [] : EVENTS, next_before: null },
      })
    if (path === '/api/v1/chat') return route.fulfill({ json: [] })
    if (path === '/api/v1/stats/session') return route.fulfill({ json: { viewers: {} } })
    if (path === '/api/v1/tts/pending') return route.fulfill({ json: [] })
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
    return route.fulfill({
      status: 404,
      json: { error: { code: 'not_found', message: 'Not in this test.' } },
    })
  })
  await page.goto('./#/studio/golive')
  const picture = page.getByRole('radiogroup', { name: 'Picture from' })
  if (await picture.isVisible().catch(() => false))
    await picture.getByText('Ferrocast', { exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Alert controls' })).toBeVisible()
  return { calls, q }
}

function suite() {
  test('pause, mute and skip call the engine and show their state', async ({ page }) => {
    const { calls } = await mount(page)
    const bar = page.getByRole('toolbar', { name: 'Alert controls' })
    await bar.getByRole('button', { name: 'Pause alerts' }).click()
    await expect(bar.getByRole('button', { name: 'Resume alerts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('status').filter({ hasText: 'Alerts paused' })).toBeVisible()
    await bar.getByRole('button', { name: 'Mute alert sounds' }).click()
    await expect(bar.getByRole('button', { name: 'Unmute alert sounds' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('status').filter({ hasText: 'Alert sounds muted' })).toBeVisible()
    if (process.env.SHOTS)
      await page.screenshot({
        path: `${process.env.SHOTS}/minifeed-${page.viewportSize()?.width}.png`,
      })
    await bar.getByRole('button', { name: 'Skip this alert' }).click()
    await expect(bar.getByRole('button', { name: 'Skip this alert' })).toBeDisabled()
    await bar.getByRole('button', { name: 'Resume alerts' }).click()
    await bar.getByRole('button', { name: 'Unmute alert sounds' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Alert' })).toHaveCount(0)
    expect(calls).toEqual([
      'POST /api/v1/queue/pause',
      'POST /api/v1/queue/mute',
      'POST /api/v1/queue/skip',
      'POST /api/v1/queue/resume',
      'POST /api/v1/queue/unmute',
    ])
  })

  test('state survives a reload (it comes from the engine)', async ({ page }) => {
    await mount(page)
    const bar = page.getByRole('toolbar', { name: 'Alert controls' })
    await bar.getByRole('button', { name: 'Pause alerts' }).click()
    await bar.getByRole('button', { name: 'Mute alert sounds' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Resume alerts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Unmute alert sounds' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('a failed skip says why and what to do', async ({ page }) => {
    await mount(page, { failSkip: true })
    await page.getByRole('button', { name: 'Skip this alert' }).click()
    await expect(page.getByText('The engine is busy.')).toBeVisible()
    await expect(page.getByText('Try again.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip this alert' })).toBeEnabled()
  })

  test('Test alert sends a test event', async ({ page }) => {
    const { calls } = await mount(page)
    await page.getByRole('button', { name: 'Send a test alert' }).click()
    await expect(page.getByText('Test alert sent.')).toBeVisible()
    expect(calls).toContain('POST /api/v1/test')
  })

  test('filters by type, with an empty state for a type with no events', async ({ page }) => {
    await mount(page)
    const list = page.getByRole('region', { name: 'Events' })
    const filters = page.getByRole('group', { name: 'Show event types' })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await filters.getByRole('button', { name: 'Raids' }).click()
    await expect(filters.getByRole('button', { name: 'Raids' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await filters.getByRole('button', { name: 'Tips and bits' }).click()
    await expect(page.getByText('Nothing of this type yet')).toBeVisible()
    await page.reload()
    await expect(filters.getByRole('button', { name: 'Tips and bits' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('unread count, mark one, mark all, and it is remembered', async ({ page }) => {
    await page.addInitScript(
      () =>
        localStorage.getItem('fc-feed-read') ??
        localStorage.setItem('fc-feed-read', JSON.stringify({ before: 0, ids: [] })),
    )
    await mount(page)
    await expect(page.getByText('3 new')).toBeVisible()
    const first = page.getByRole('region', { name: 'Events' }).getByRole('listitem').first()
    await first.getByRole('button', { name: 'Mark as read' }).click()
    await expect(page.getByText('2 new')).toBeVisible()
    await page.reload()
    await expect(page.getByText('2 new')).toBeVisible()
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(page.getByText('All read')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })

  test('no events at all shows the empty state', async ({ page }) => {
    await mount(page, { empty: true })
    await expect(page.getByText('No events yet')).toBeVisible()
  })

  test('has no accessibility violations and fits the width', async ({ page }) => {
    await mount(page)
    const r = await new AxeBuilder({ page }).include('section[aria-label="Events"]').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(over).toBe(false)
  })

  test('keyboard: the controls are reachable by Tab and work with Enter', async ({ page }) => {
    await mount(page)
    const pause = page.getByRole('button', { name: 'Pause alerts' })
    await pause.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Resume alerts' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Skip this alert' })).toBeFocused()
  })
}

test.describe('Mini Feed at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test.skip(({ isMobile }) => !!isMobile, 'The phone run has its own block.')
  suite()
})

test.describe('Mini Feed at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test.skip(({ isMobile }) => !isMobile, 'Runs in the phone project.')
  suite()
})
