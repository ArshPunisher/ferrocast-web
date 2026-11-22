import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Performance mode (pause the preview) and copy / paste across collections in the Studio desk.
// The Studio needs the desktop app's engine, so the engine is mocked here, statefully, and the
// page runs hermetically at 1280 and 375 px.

interface Opts {
  failPause?: boolean
  failPaste?: boolean
  withClip?: boolean
  notes?: string[]
}

async function mount(page: Page, opts: Opts = {}) {
  const calls: { m: string; p: string; b: unknown }[] = []
  const st = {
    paused: false,
    clip: opts.withClip
      ? { kind: 'source', name: 'Cam', from: 'Main', count: 1 }
      : (null as null | Record<string, unknown>),
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __FERROCAST__: unknown }
    w.__FERROCAST__ = Object.freeze({ api: location.origin, token: 'pc-e2e', desktop: true })
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    if (!localStorage.getItem('fc-studio-layout'))
      localStorage.setItem(
        'fc-studio-layout',
        JSON.stringify({
          left: [],
          right: ['sources'],
          bottom: [],
          hidden: [],
          locked: true,
          mob: 'sources',
        }),
      )
  })
  await page.routeWebSocket('**/api/v1/live**', (ws) => void ws)
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const method = req.method()
    const body = req.postData() ? (JSON.parse(req.postData() ?? 'null') as unknown) : undefined
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
    if (path === '/api/v1/queue')
      return route.fulfill({ json: { paused: false, muted: false, playing: null, waiting: [] } })
    if (path === '/api/v1/chat') return route.fulfill({ json: [] })
    if (path === '/api/v1/events') return route.fulfill({ json: { events: [], next_before: null } })
    if (path === '/api/v1/stats/session') return route.fulfill({ json: { viewers: {} } })
    if (path === '/api/v1/tts/pending') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/preview/pause') {
      if (method === 'PUT') {
        calls.push({ m: method, p: path, b: body })
        if (opts.failPause)
          return route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'busy',
                message: 'The preview is busy.',
                hint: 'Try again in a moment.',
              },
            },
          })
        st.paused = (body as { paused: boolean }).paused
      }
      return route.fulfill({ json: { paused: st.paused } })
    }
    if (path === '/api/v1/studio/engine/clipboard') {
      if (method === 'DELETE') {
        st.clip = null
        return route.fulfill({ status: 204, body: '' })
      }
      if (!st.clip)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: 'clipboard_empty',
              message: 'Nothing is copied yet.',
              hint: 'Copy a source first.',
            },
          },
        })
      return route.fulfill({ json: st.clip })
    }
    if (path === '/api/v1/studio/engine/clipboard/source') {
      calls.push({ m: method, p: path, b: body })
      st.clip = { kind: 'source', name: 'Music', from: 'Live', count: 1 }
      return route.fulfill({ json: st.clip })
    }
    if (path === '/api/v1/studio/engine/clipboard/paste/source') {
      calls.push({ m: method, p: path, b: body })
      if (opts.failPaste)
        return route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'studio_failed',
              message:
                '"Copy" shows "Red", which isn\'t in this collection: paste that source first.',
              hint: 'Paste Red first.',
            },
          },
        })
      return route.fulfill({ json: { item: { id: 7, name: 'Music 2' }, notes: opts.notes ?? [] } })
    }
    if (
      path.startsWith('/api/v1/studio/engine/record') ||
      path.startsWith('/api/v1/studio/engine/stream')
    )
      calls.push({ m: method, p: path, b: body })
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
  await expect(page.getByRole('region', { name: /Sources in/ })).toBeVisible()
  return { calls, st }
}

/** The performance button: on a phone the toolbar folds it into "More tools". */
async function perf(page: Page, name: RegExp | string) {
  const b = page.getByRole('button', { name })
  if (!(await b.isVisible())) await page.getByRole('button', { name: 'More tools' }).click()
  return b
}

const dock = (page: Page) => page.getByRole('region', { name: /Sources in/ })
const row = (page: Page) => dock(page).locator('[data-item-id]').first()

function suite() {
  test('performance mode pauses the preview, shows a card, never touches the outputs, and resumes', async ({
    page,
  }) => {
    const { calls } = await mount(page)
    const toggle = await perf(page, /Pause the preview/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Preview paused')).toHaveCount(0)
    await toggle.click()
    await expect(page.getByText('Preview paused').first()).toBeVisible()
    await expect(
      page.getByText('Your stream and recording are not affected.').first(),
    ).toBeVisible()
    await expect(await perf(page, 'Resume the preview')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Resume preview' }).first().click()
    await expect(page.getByText('Preview paused')).toHaveCount(0)
    expect(calls.map((c) => `${c.m} ${c.p} ${JSON.stringify(c.b)}`)).toEqual([
      'PUT /api/v1/studio/engine/preview/pause {"paused":true}',
      'PUT /api/v1/studio/engine/preview/pause {"paused":false}',
    ])
  })

  test('a pause set by a shortcut shows up by itself', async ({ page }) => {
    const { st } = await mount(page)
    st.paused = true
    await expect(page.getByText('Preview paused').first()).toBeVisible({ timeout: 9000 })
    st.paused = false
    await expect(page.getByText('Preview paused')).toHaveCount(0, { timeout: 9000 })
  })

  test('a refused pause says why and what to do, and the preview stays on', async ({ page }) => {
    await mount(page, { failPause: true })
    await (await perf(page, /Pause the preview/)).click()
    await expect(page.getByText('The preview is busy.')).toBeVisible()
    await expect(page.getByText('Try again in a moment.')).toBeVisible()
    await expect(page.getByText('Preview paused')).toHaveCount(0)
    await expect(await perf(page, /Pause the preview/)).toBeEnabled()
  })

  test('copy and paste in the Sources dock: buttons, then paste is possible', async ({ page }) => {
    const { calls } = await mount(page)
    await expect(dock(page).getByRole('button', { name: 'Paste a copied source' })).toBeDisabled()
    await row(page).locator('button').first().click()
    await dock(page).getByRole('button', { name: 'Copy Music' }).click()
    await expect(page.getByText(/Copied Music/)).toBeVisible()
    const paste = dock(page).getByRole('button', { name: /^Paste Music into Live/ })
    await expect(paste).toBeEnabled()
    await paste.click()
    await expect(page.getByText('Pasted Music 2.')).toBeVisible()
    expect(calls.map((c) => `${c.m} ${c.p} ${JSON.stringify(c.b)}`)).toEqual([
      'POST /api/v1/studio/engine/clipboard/source {"scene":"Live","id":1}',
      'POST /api/v1/studio/engine/clipboard/paste/source {"scene":"Live"}',
    ])
  })

  test('the context menu copies and pastes (the only way on a phone)', async ({ page }) => {
    const { calls } = await mount(page, {
      withClip: true,
      notes: ['The compressor "Duck" listened to "Music": set to None.'],
    })
    await row(page).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /^Copy/ }).first().click()
    await expect(page.getByText(/Copied Music/)).toBeVisible()
    await row(page).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Paste Music from the clipboard/ }).click()
    await expect(page.getByText('Pasted Music 2.')).toBeVisible()
    await expect(page.getByText(/set to None/)).toBeVisible()
    expect(calls.some((c) => c.p.endsWith('/paste/source'))).toBe(true)
  })

  test('a paste that cannot go in says why and what to do, and nothing changes', async ({
    page,
  }) => {
    await mount(page, { withClip: true, failPaste: true })
    await dock(page)
      .getByRole('button', { name: /^Paste Cam into Live/ })
      .click()
    await expect(page.getByText(/which isn't in this collection/)).toBeVisible()
    await expect(page.getByText('Paste Red first.')).toBeVisible()
    await expect(dock(page).getByRole('button', { name: /^Paste Cam into Live/ })).toBeEnabled()
  })

  test('Ctrl/Cmd+C and V on the list, and a text field keeps its own keys', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'A phone has no keyboard.')
    const { calls } = await mount(page)
    // The desktop Chrome profile reports Windows: Ctrl.
    const mod = 'Control'
    await row(page).locator('button').first().click()
    await page.keyboard.press(`${mod}+c`)
    await expect(page.getByText(/Copied Music/)).toBeVisible()
    await page.keyboard.press(`${mod}+v`)
    await expect(page.getByText('Pasted Music 2.')).toBeVisible()
    expect(calls.map((c) => c.p)).toEqual([
      '/api/v1/studio/engine/clipboard/source',
      '/api/v1/studio/engine/clipboard/paste/source',
    ])
    // In a text field the keys are the field's own.
    await row(page).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const input = page.getByLabel('New name for Music')
    await input.press(`${mod}+c`)
    await input.press(`${mod}+v`)
    expect(calls).toHaveLength(2)
  })

  test('the keys leave an open dialog alone', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'A phone has no keyboard.')
    const { calls } = await mount(page, { withClip: true })
    await row(page).locator('button').first().click()
    await dock(page)
      .getByRole('button', { name: /^Remove Music/ })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Control+v')
    await page.keyboard.press('Control+c')
    expect(calls.filter((c) => c.p.includes('/clipboard/'))).toEqual([])
  })

  test('no accessibility violations and no sideways scroll', async ({ page }) => {
    await mount(page, { withClip: true })
    const r = await new AxeBuilder({ page }).include('section[aria-label^="Sources in"]').analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}

test.describe('Performance mode and clipboard at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test.skip(({ isMobile }) => !!isMobile, 'The phone run has its own block.')
  suite()
})

test.describe('Performance mode and clipboard at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test.skip(({ isMobile }) => !isMobile, 'Runs in the phone project.')
  suite()
})
