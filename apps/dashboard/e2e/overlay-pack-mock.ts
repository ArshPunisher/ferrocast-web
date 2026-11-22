import { expect, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

export function buildOverlayPackBuffer(): Buffer {
  const cfg = {
    schemaVersion: 2,
    nodeType: 'RootNode',
    data: {
      scenes: {
        data: {
          items: [
            {
              name: 'Live Game',
              sceneId: 'sc-live',
              slots: {
                data: {
                  items: [
                    {
                      id: 'bg-1',
                      name: 'Overlay Frame',
                      sceneNodeType: 'item',
                      x: 0,
                      y: 0,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'ImageNode', data: { filename: 'assets/frame.png' } },
                    },
                    {
                      id: 'txt-1',
                      name: 'Stream Title',
                      sceneNodeType: 'item',
                      x: 0.05,
                      y: 0.05,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: {
                        nodeType: 'TextNode',
                        data: {
                          settings: { text: 'LIVE', font: { face: 'Montserrat', size: 48 } },
                        },
                      },
                    },
                    {
                      id: 'w-1',
                      name: 'AlertBox',
                      sceneNodeType: 'item',
                      x: 0.25,
                      y: 0.1,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'AlertBox' } },
                    },
                    {
                      id: 'w-2',
                      name: 'Legacy Sponsor',
                      sceneNodeType: 'item',
                      x: 0.7,
                      y: 0.8,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'SponsorBanner' } },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  }
  const bytes = zipSync({
    'config.json': Uint8Array.from(strToU8(JSON.stringify(cfg))),
    'assets/frame.png': PNG_1X1,
  })
  return Buffer.from(bytes)
}

export async function mountStudioWithOverlayDemo(page: Page) {
  const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const consoleErrors: string[] = []
  let allowExpectedUploadReject = false
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const txt = m.text()
    if (allowExpectedUploadReject && txt.includes('415 (Unsupported Media Type)')) return
    consoleErrors.push(`console.error: ${txt}`)
  })
  const setAllowExpectedUploadReject = (v: boolean) => {
    allowExpectedUploadReject = v
  }

  await page.addInitScript((token: string) => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
      api: window.location.origin,
      token,
      desktop: true,
    })
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  }, DEMO_TOKEN)

  await page.routeWebSocket('**/api/v1/live**', (ws) => {
    void ws
  })

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

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
          scenes: [{ name: 'Main', items: 0, current: true, transition: null }],
          current: 'Main',
          transition: { kind: 'fade_transition', ms: 300 },
        },
      })
    }
    if (path === '/api/v1/studio/engine/scenes/Main/items') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/scenes/Main/audio') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/sources') return route.fulfill({ json: [] })
    if (
      path === '/api/v1/studio/engine/sources/levels' ||
      path === '/api/v1/studio/engine/levels'
    ) {
      return route.fulfill({ json: {} })
    }
    if (path === '/api/v1/studio/engine/stats') {
      return route.fulfill({
        json: {
          engine: { cpu: 2.1, fps: 60, frame_ms: 3.0, lagged: 0, frames: 120, memory_mb: 120 },
          canvas: { width: 1920, height: 1080, fps: 60 },
          stream: null,
          record: null,
          scene: 'Main',
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
          b_frames: false,
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
      return route.fulfill({ json: { hide_notifications: true, hide_apps: [], supported: true } })
    }
    if (path === '/api/v1/studio/engine/history') {
      return route.fulfill({ json: { undo: [], redo: [] } })
    }
    if (path === '/api/v1/studio/engine/studio-mode') {
      return route.fulfill({ json: { active: false, scene: null } })
    }
    if (path === '/api/v1/studio/engine/captions') {
      return route.fulfill({
        json: { access: 'allowed', on: false, source: null, text: '', box: false },
      })
    }
    if (path === '/api/v1/studio/engine/vertical/follow') {
      return route.fulfill({ json: { on: false, scene: null, item: null, face: false } })
    }
    if (path === '/api/v1/studio/engine/encode-budget') {
      return route.fulfill({ json: { encoders: [], streams: 1, warning: null } })
    }
    if (path === '/api/v1/studio/engine/replay') {
      return route.fulfill({ json: { active: false } })
    }
    if (path === '/api/v1/studio/engine/virtualcam') {
      return route.fulfill({ json: { active: false } })
    }
    if (path === '/api/v1/studio/engine/virtualcam/setup') {
      return route.fulfill({ json: { supported: false, installed: false, every_app: false } })
    }
    if (path === '/api/v1/studio/engine/ndi') {
      return route.fulfill({ json: { active: false, name: null } })
    }
    if (path === '/api/v1/studio/engine/screen-access') {
      return route.fulfill({ json: { granted: true } })
    }
    if (path === '/api/v1/studio/engine/apps') {
      return route.fulfill({ json: { front: null, running: [] } })
    }
    if (path === '/api/v1/studio/engine/monitoring') {
      return route.fulfill({ json: { devices: [], current: { name: 'Default', id: 'default' } } })
    }
    if (path.endsWith('/thumbnail')) {
      return route.fulfill({ json: { image: '' } })
    }
    if (
      path.startsWith('/api/v1/studio/engine/') &&
      !path.startsWith('/api/v1/studio/engine/library/')
    ) {
      return route.fulfill({ json: {} })
    }
    if (path === '/api/v1/studio/guests') {
      return route.fulfill({ json: { invites: [], guests: [] } })
    }
    if (path === '/api/v1/session/ticket') return route.fulfill({ json: { ticket: 'e2e-ticket' } })

    // Delegate library routes, overlays, status, golive, connectors, accounts, etc. to DemoEngine.
    const ct = req.headers()['content-type'] ?? ''
    let body: BodyInit | undefined
    const headers: Record<string, string> = {
      authorization: req.headers().authorization ?? `Bearer ${DEMO_TOKEN}`,
    }
    if (ct.includes('multipart/form-data')) {
      const buf = req.postDataBuffer()
      if (buf) {
        body = await new Response(new Uint8Array(buf), {
          headers: { 'content-type': ct },
        }).formData()
      }
    } else {
      const txt = req.postData()
      if (txt !== null) {
        headers['content-type'] = ct || 'application/json'
        body = txt
      }
    }
    const init: RequestInit = {
      method: req.method(),
      headers,
    }
    if (body !== undefined) init.body = body
    const res = await demo.fetch(`${demo.base}${path}${url.search}`, init)
    const text = await res.text()
    return route.fulfill({
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/json',
      body: text,
    })
  })

  return { demo, consoleErrors, setAllowExpectedUploadReject }
}

export async function runImportFlow(
  page: Page,
  setAllowExpectedUploadReject?: (v: boolean) => void,
) {
  await page.goto('./#/studio/golive')
  const colBtn = page.getByRole('button', { name: 'scene collection: Main Show' })
  await expect(colBtn).toBeVisible()
  await colBtn.click()

  await page.getByRole('menuitem', { name: /Import a theme pack/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Import a theme pack' })
  await expect(dialog).toBeVisible()

  const input = dialog.locator('input[type="file"]')
  // Verify invalid archive rejection inline
  setAllowExpectedUploadReject?.(true)
  await input.setInputFiles({
    name: 'corrupt.overlay',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a valid zip archive'),
  })
  await expect(dialog.getByRole('alert')).toContainText('.overlay zip archive')
  setAllowExpectedUploadReject?.(false)

  // Upload valid .overlay fixture -> Preview
  await input.setInputFiles({
    name: 'SolarPack.overlay',
    mimeType: 'application/zip',
    buffer: buildOverlayPackBuffer(),
  })
  const previewDialog = page.getByRole('dialog', { name: 'Review theme pack' })
  await expect(previewDialog).toBeVisible()
  await expect(previewDialog.getByText('Montserrat')).toBeVisible()
  await expect(previewDialog.getByText('Will fetch from Google Fonts')).toBeVisible()
  await expect(previewDialog.getByText('SponsorBanner')).toBeVisible()

  const nameInput = previewDialog.getByLabel('Scene collection name')
  await nameInput.fill('Solar Stream')
  await previewDialog.getByRole('button', { name: 'Import theme pack' }).click()

  // Result view
  const resultDialog = page.getByRole('dialog', { name: 'Theme pack imported' })
  await expect(resultDialog).toBeVisible()
  await expect(
    resultDialog.getByText('Imported "Solar Stream" and switched Studio to it.'),
  ).toBeVisible()
  await expect(resultDialog.getByText('Downloaded (Google Fonts)')).toBeVisible()
  await expect(resultDialog.getByText(/Solar Stream.*Live Game/)).toBeVisible()
  // Background LibraryBar updates behind the modal <dialog> (inert to ARIA while modal is open).
  await expect(page.locator('button[aria-label="scene collection: Solar Stream"]')).toBeVisible()

  // Check zero sideways scroll
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)

  // Undo import -> restores Main Show
  await resultDialog.getByRole('button', { name: 'Undo import' }).click()
  const undoneDialog = page.getByRole('dialog', { name: 'Theme pack undone' })
  await expect(undoneDialog).toBeVisible()
  await undoneDialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'scene collection: Main Show' })).toBeVisible()
}
