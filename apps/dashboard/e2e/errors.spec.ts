import { expect, test } from '@playwright/test'
import { fault, open } from './helpers'

// Every status API.md documents must reach the streamer as plain words plus what to do.
const CASES: { status: number; code: string; message: string; hint: string }[] = [
  {
    status: 400,
    code: 'invalid',
    message: 'name: keep it under 60 characters.',
    hint: 'Shorten the name.',
  },
  {
    status: 401,
    code: 'unauthorized',
    message: 'This session has ended.',
    hint: 'Open the dashboard again from the Ferrocast app.',
  },
  {
    status: 403,
    code: 'forbidden',
    message: 'Ferrocast blocked this request.',
    hint: 'Turn on LAN access in Settings.',
  },
  {
    status: 404,
    code: 'overlay_not_found',
    message: 'That overlay doesn’t exist anymore.',
    hint: 'Reload the overlays list.',
  },
  {
    status: 409,
    code: 'name_taken',
    message: 'That name is already taken.',
    hint: 'Pick another name.',
  },
  {
    status: 413,
    code: 'too_large',
    message: 'Sounds can be up to 5 MB.',
    hint: 'Trim or compress it.',
  },
  {
    status: 415,
    code: 'unsupported_type',
    message: 'That file type isn’t supported.',
    hint: 'Use MP3, OGG or WAV.',
  },
  {
    status: 422,
    code: 'cannot_run',
    message: 'Twitch isn’t connected.',
    hint: 'Connect it in Settings → Accounts.',
  },
  {
    status: 429,
    code: 'rate_limited',
    message: 'You’re going a bit fast.',
    hint: 'Wait a moment and try again.',
  },
  {
    status: 503,
    code: 'starting',
    message: 'Ferrocast is still starting.',
    hint: 'This takes a second or two.',
  },
]

for (const c of CASES) {
  test(`a ${c.status} on a list shows its message, hint and a retry`, async ({ page }) => {
    await open(page, 'home')
    // 503 is retried by the client a few times first, so make it stick.
    await fault(page, {
      path: '/api/v1/overlays',
      status: c.status,
      code: c.code,
      message: c.message,
      hint: c.hint,
      times: 20,
    })
    await page.getByRole('link', { name: 'Overlays' }).first().click()
    const alert = page.getByRole('alert').filter({ hasText: c.message })
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(alert).toContainText(c.hint)
    await page.evaluate(() => window.__ferrocastDemo?.clearFaults())
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { name: 'Main scene' })).toBeVisible()
  })

  test(`a ${c.status} on an action becomes a toast, not a crash`, async ({ page }) => {
    await open(page, 'home')
    await fault(page, {
      path: '/api/v1/queue/pause',
      status: c.status,
      code: c.code,
      message: c.message,
      hint: c.hint,
      times: 20,
    })
    await page.getByRole('button', { name: 'Pause alerts' }).click()
    await expect(page.getByText(c.message).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(c.hint).first()).toBeVisible()
  })
}

test('an engine that stops answering is reported and recovers', async ({ page }) => {
  await open(page, 'home')
  await page.evaluate(() => window.__ferrocastDemo?.setOffline(true))
  await expect(
    page.getByRole('status').filter({ hasText: /Reconnecting to Ferrocast|Connecting/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pause alerts' }).click()
  await expect(
    page.getByText('Can’t reach Ferrocast.').or(page.getByText("Can't reach Ferrocast.")).first(),
  ).toBeVisible()
  await page.evaluate(() => window.__ferrocastDemo?.setOffline(false))
  await expect(
    page.getByRole('status').filter({ hasText: /Reconnecting to Ferrocast/ }),
  ).toBeHidden({ timeout: 20_000 })
})

test('an unreachable engine at boot explains what to do and offers the demo', async ({ page }) => {
  await page.goto('./?engine=http://127.0.0.1:9#pair=ABCD1234')
  await expect(page.getByRole('alert')).toContainText(/Can.t reach Ferrocast/)
  await page.getByRole('button', { name: 'Look around the demo' }).click()
  await expect(page.locator('#main')).toBeVisible()
})

test('a socket drop reconnects by itself', async ({ page }) => {
  await open(page, 'home')
  await page.evaluate(() => window.__ferrocastDemo?.dropSockets())
  await expect
    .poll(() => page.evaluate(() => window.__ferrocastDemo?.liveSocketCount), { timeout: 10_000 })
    .toBe(1)
})

test('a pairing link pasted into an open tab pairs without a reload', async ({ page }) => {
  // Not port 9 like the test above: WebKit refuses that port before routing sees it.
  const engine = 'http://127.0.0.1:47999'
  let paired = ''
  await page.route(`${engine}/api/v1/**`, async (route) => {
    const req = route.request()
    if (req.url().endsWith('/session/pair')) {
      paired = (req.postDataJSON() as { code: string }).code
      return route.fulfill({
        status: 410,
        json: { error: { code: 'pair_code_expired', message: 'That link has expired.' } },
      })
    }
    return route.fulfill({
      status: 401,
      json: { error: { code: 'unauthorized', message: 'Pair this browser first.' } },
    })
  })
  await page.goto(`./?engine=${engine}`)
  await expect(page.getByRole('alert')).toContainText('Link this browser to Ferrocast')
  await page.evaluate(() => {
    location.hash = '#pair=WXYZ5678'
  })
  await expect.poll(() => paired).toBe('WXYZ5678')
  await expect(page.getByText('That link has expired.').first()).toBeVisible()
})
