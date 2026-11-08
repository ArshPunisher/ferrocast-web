import { expect, test, type Page } from '@playwright/test'

// The Studio's "Add to <scene>" dialog against the real engine (owner, 8 Nov, on Windows): the
// camera, screen and capture card lists show at once, devices show as tiles or a list (kept
// after a restart), and a kind with nothing plugged in says so instead of showing a settings
// form.

// Needs the desktop app's engine (the demo has none): run against a dev app with
// FC_API=http://127.0.0.1:<port> FC_TOKEN=<token> (its debug token file), and the app started
// with FERROCAST_DEV_ORIGIN set to this server's origin.
const api = process.env.FC_API
const token = process.env.FC_TOKEN
test.skip(!api || !token, 'Needs a running Ferrocast app (FC_API and FC_TOKEN).')
test.skip(({ isMobile }) => !!isMobile, 'The desk on a phone is checked elsewhere.')

async function desk(page: Page): Promise<void> {
  await page.addInitScript(
    ([a, t]) => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
        api: a,
        token: t,
        desktop: true,
      })
    },
    [api, token],
  )
  await page.goto('./#/studio/golive')
  await page
    .getByRole('radiogroup', { name: 'Picture from' })
    .getByText('Ferrocast', { exact: true })
    .click()
  const start = page.getByRole('button', { name: 'Start the Studio' })
  if (await start.isVisible().catch(() => false)) await start.click()
  await expect(page.getByRole('button', { name: /^Add a source to / })).toBeVisible({
    timeout: 20_000,
  })
}

async function openCamera(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Add a source to / }).click()
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
}

test('the device lists are read ahead as the dialog opens', async ({ page }) => {
  const asked = new Set<string>()
  page.on('request', (r) => {
    const m = /\/studio\/engine\/kinds\/([^/]+)\/options/.exec(r.url())
    if (m?.[1]) asked.add(decodeURIComponent(m[1]))
  })
  await desk(page)
  await page.getByRole('button', { name: /^Add a source to / }).click()
  // Cameras, screens, windows and microphones, before any kind is picked.
  await expect.poll(() => asked.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(3)
})

test('devices show as tiles or a list, and the choice is kept', async ({ page }) => {
  await desk(page)
  await openCamera(page)
  const group = page.getByRole('group', { name: 'Show devices as' })
  const none = page.getByText('No camera found')
  await expect(group.or(none)).toBeVisible()
  // A Mac or PC with no camera at all shows the empty state instead: nothing to switch.
  test.skip(await none.isVisible(), 'No camera on this computer.')
  await group.getByRole('button', { name: 'List' }).click()
  await expect(group.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await openCamera(page)
  await expect(
    page.getByRole('group', { name: 'Show devices as' }).getByRole('button', { name: 'List' }),
  ).toHaveAttribute('aria-pressed', 'true')
  // Back to tiles for the next run.
  await page
    .getByRole('group', { name: 'Show devices as' })
    .getByRole('button', { name: 'Tiles' })
    .click()
})

test('no camera plugged in: says so, offers to look again, and Add waits', async ({ page }) => {
  let looks = 0
  await page.route('**/studio/engine/kinds/*/options', async (r) => {
    if (!/kinds\/(av_capture_input_v2|dshow_input|v4l2_input)\//.test(r.request().url()))
      return r.continue()
    looks++
    await r.fulfill({
      json: [
        {
          key: /dshow/.test(r.request().url())
            ? 'video_device_id'
            : /v4l2/.test(r.request().url())
              ? 'device_id'
              : 'device',
          label: 'Device',
          kind: 'list',
          choices: [],
          values: [],
          visible: true,
          enabled: true,
        },
      ],
    })
  })
  await desk(page)
  await openCamera(page)
  await expect(page.getByText('No camera found')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  // No settings form in its place.
  await expect(page.getByRole('dialog').getByText('Settings', { exact: true })).toHaveCount(0)
  const before = looks
  await page.getByRole('button', { name: 'Look again' }).click()
  await expect.poll(() => looks).toBeGreaterThan(before)
})
