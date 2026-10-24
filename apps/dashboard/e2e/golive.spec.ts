import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

// Go live everywhere (Studio's first tab) in the demo engine: setup, the upload check, a
// server of your own, and the health lines while OBS streams.

const panel = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

/** The demo's OBS starts out streaming; most tests want it stopped first. */
async function obsStopped(page: Page) {
  await demo(page, '(d) => { d.studio.obs.streaming = false }')
}

test.describe('go live everywhere', () => {
  test('is Studio’s first tab and lists the platforms', { tag: '@smoke' }, async ({ page }) => {
    await open(page, 'studio')
    await expect(page.getByRole('radio', { name: 'Go live' })).toBeChecked()
    const p = panel(page, 'Your platforms')
    await expect(p.getByText('Twitch', { exact: true })).toBeVisible()
    await expect(p.getByRole('switch', { name: 'Stream to Twitch' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(p.getByRole('switch', { name: 'Stream to Kick' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await expect(p.getByText('Going to 2 places.')).toBeVisible()
    await expect(panel(page, 'Set up once').getByText('OBS is connected')).toBeVisible()
  })

  test('set up once: point OBS here, test the upload, then put OBS back', async ({ page }) => {
    await open(page, 'studio/golive')
    const setup = panel(page, 'Set up once')
    // While OBS streams, its setting can't change.
    await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeDisabled()
    await obsStopped(page)
    await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeEnabled({
      timeout: 8000,
    })
    await setup.getByRole('button', { name: 'Point OBS at Ferrocast' }).click()
    await expect(page.getByText('OBS now streams to Ferrocast.')).toBeVisible()
    await setup.getByRole('button', { name: 'Test upload' }).click()
    const upload = panel(page, 'Your upload')
    await expect(
      upload.getByText('Your upload is 24 Mbps. 2 platforms fit, using 12 Mbps.'),
    ).toBeVisible()
    await expect(upload.getByRole('cell', { name: 'a.rtmps.youtube.com' })).toBeVisible()
    // Done: the steps shrink to one line with the way back.
    const obs = panel(page, 'OBS')
    await expect(obs.getByText('OBS sends to Ferrocast')).toBeVisible()
    await obs.getByRole('button', { name: 'Put OBS back to Twitch' }).click()
    await expect(page.getByText('OBS streams to Twitch again.')).toBeVisible()
    await expect(panel(page, 'Set up once')).toBeVisible()
  })

  test('a slow upload says what fits, in words', async ({ page }) => {
    await open(page, 'studio/golive')
    await demo(page, '(d) => d.setGoLive({ upload_kbps: 9000 })')
    await panel(page, 'Set up once').getByRole('button', { name: 'Test upload' }).click()
    await expect(
      panel(page, 'Your upload').getByText(
        '2 platforms need 12 Mbps; you have 9.0 Mbps. Send 1 platform at this quality, or all 2 at about 3.6 Mbps each (lower the bitrate in OBS).',
      ),
    ).toBeVisible()
  })

  test('a server of your own: checked, added, and removed after asking', async ({ page }) => {
    await open(page, 'studio/golive')
    await page.getByRole('button', { name: 'Add a destination' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a destination' })
    await dialog.getByLabel('Name').fill('Backup PC')
    await dialog.getByLabel('Server').fill('https://example.com/live')
    await dialog.getByLabel('Stream key', { exact: true }).fill('abc123')
    await dialog.getByRole('button', { name: 'Add server' }).click()
    await expect(
      dialog.getByText('The server address must start with rtmp:// or rtmps://.'),
    ).toBeVisible()
    await dialog.getByLabel('Server').fill('rtmp://backup.local/live')
    await dialog.getByRole('button', { name: 'Add server' }).click()
    await expect(page.getByText('Backup PC added.')).toBeVisible()
    const p = panel(page, 'Your platforms')
    await expect(p.getByText('backup.local · video only')).toBeVisible()
    await p.getByRole('button', { name: 'Remove Backup PC' }).click()
    const ask = page.getByRole('dialog', { name: 'Remove Backup PC?' })
    await ask.getByRole('button', { name: 'Keep it' }).click()
    await expect(p.getByText('backup.local · video only')).toBeVisible()
    await p.getByRole('button', { name: 'Remove Backup PC' }).click()
    await page
      .getByRole('dialog', { name: 'Remove Backup PC?' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await expect(page.getByText('Backup PC removed.')).toBeVisible()
    await expect(p.getByText('backup.local · video only')).toHaveCount(0)
  })

  test('while live: a health line per platform, and one that reconnects can be stopped', async ({
    page,
  }) => {
    await open(page, 'studio/golive')
    await demo(page, '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }')
    await panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to Kick' }).click()
    const live = page.locator('#golive-live')
    await expect(live.getByText('Twitch: Live')).toBeVisible({ timeout: 8000 })
    await expect(live.getByText(/Kick: Reconnecting, try \d/)).toBeVisible()
    // The pill at the top says so from any page.
    await expect(
      page.getByRole('link', { name: /Kick:.*Go live: stream reconnecting/ }),
    ).toBeVisible()
    await live.getByRole('button', { name: 'Stop trying' }).click()
    await expect(
      panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to Kick' }),
    ).toHaveAttribute('aria-checked', 'false')
    await expect(live.getByText(/Kick:/)).toHaveCount(0)
  })

  test('a weak upload pauses the bottom platform; Resume now and the switch', async ({ page }) => {
    test.slow()
    await open(page, 'studio/golive')
    await demo(
      page,
      '(d) => { d.setGoLive({ points_here: true, upload_kbps: 9000 }); d.studio.obs.streaming = true }',
    )
    const live = page.locator('#golive-live')
    await expect(live.getByText('YouTube: Paused')).toBeVisible({ timeout: 20_000 })
    await expect(
      live.getByText('Your upload dipped, so this paused to keep Twitch smooth.', { exact: false }),
    ).toBeVisible()
    await expect(live.getByText(/Back in \d+ s at the earliest\./)).toBeVisible()
    await expect(live.getByText(/1 of 2 live · 1 paused/)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /YouTube:.*stream paused to save upload/ }),
    ).toBeVisible()
    await live.getByRole('button', { name: 'Resume now' }).click()
    await expect(page.getByText('YouTube is coming back.')).toBeVisible()
    await expect(live.getByText('YouTube: Live')).toBeVisible()
    const toggle = panel(page, 'Your platforms').getByRole('switch', { name: 'Upload protection' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(page.getByText('Upload protection is off.')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  test('the platform list reorders from the keyboard', async ({ page }) => {
    await open(page, 'studio/golive')
    const p = panel(page, 'Your platforms')
    await p.getByRole('button', { name: 'Move Twitch: arrow up or down' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(p.locator('li b').first()).toHaveText('YouTube')
    await expect(p.locator('li b').nth(1)).toHaveText('Twitch')
  })

  test('the Show tab says where the stream goes', async ({ page }) => {
    await open(page, 'studio/show')
    await expect(
      page.getByRole('link', { name: /Going to 2 places with Go live everywhere/ }),
    ).toBeVisible()
  })

  for (const scheme of ['dark', 'light'] as const)
    test(`has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'studio/golive')
      await demo(
        page,
        '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }',
      )
      await page.getByRole('button', { name: 'Test upload' }).click()
      await expect(page.getByText('Twitch: Live')).toBeVisible({ timeout: 8000 })
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        ),
      ).toEqual([])
    })
})
