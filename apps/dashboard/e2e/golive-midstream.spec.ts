import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open, settled } from './helpers'

// Phase 2 #17: destinations added and removed while the stream runs (demo engine, which
// answers like the engine: refusals, and the questions asked first).

const platforms = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your platforms' }) })
const sw = (page: Page, name: string) =>
  platforms(page).getByRole('switch', { name: `Stream to ${name}` })

async function live(page: Page, upload = 9000) {
  await open(page, 'studio/golive')
  await demo(
    page,
    `(d) => { d.studio.obs.streaming = true; d.setGoLive({ points_here: true, upload_kbps: ${upload} }) }`,
  )
  await expect(sw(page, 'Twitch')).toBeVisible()
  // The live lines: the page knows the stream is on.
  await expect(page.locator('#golive-live').getByText('Twitch: Live')).toBeVisible({
    timeout: 8000,
  })
}

for (const [label, size] of [
  ['1280 px', { width: 1280, height: 900 }],
  ['375 px', { width: 375, height: 800 }],
] as const) {
  test.describe(`mid-stream destinations at ${label}`, () => {
    test.use({ viewport: size })

    test('the last destination asks first, and the stream goes on when confirmed', async ({
      page,
    }) => {
      await live(page)
      await sw(page, 'YouTube').click()
      await expect(sw(page, 'YouTube')).toHaveAttribute('aria-checked', 'false')
      // While live, an unticked row says so.
      await expect(platforms(page).getByText('Off', { exact: true }).first()).toBeVisible()
      // Twitch is the last one ticked: it asks.
      await sw(page, 'Twitch').click()
      const ask = page.getByRole('dialog', { name: 'Stop sending to your last platform?' })
      await expect(ask).toBeVisible()
      await expect(ask).toContainText('The stream and the recording keep going')
      await ask.getByRole('button', { name: 'Keep it on' }).click()
      await expect(sw(page, 'Twitch')).toHaveAttribute('aria-checked', 'true')
      await sw(page, 'Twitch').click()
      await page
        .getByRole('dialog', { name: 'Stop sending to your last platform?' })
        .getByRole('button', { name: 'Stop sending' })
        .click()
      await expect(sw(page, 'Twitch')).toHaveAttribute('aria-checked', 'false')
      // Still live: the status strip still says so.
      expect(await demo<boolean>(page, '(d) => d.studio.obs.streaming')).toBe(true)
      if (size.width <= 400) {
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(over).toBeLessThanOrEqual(1)
      }
    })

    test('an upload that will not carry it asks, and a keyboard can answer', async ({ page }) => {
      await live(page, 13000)
      await page.getByRole('button', { name: 'Test upload' }).click()
      await expect(page.getByText(/Speed 13 Mbps/).first()).toBeVisible()
      await sw(page, 'YouTube').click()
      await expect(sw(page, 'YouTube')).toHaveAttribute('aria-checked', 'false')
      await expect(platforms(page).getByText('Off', { exact: true }).first()).toBeVisible()
      // Back on: two outputs at the stream's rate are more than 9 Mbps carries.
      await sw(page, 'YouTube').focus()
      await page.keyboard.press('Space')
      const ask = page.getByRole('dialog', { name: 'Your upload may not carry this' })
      await expect(ask).toBeVisible()
      await settled(page)
      await ask.getByRole('button', { name: 'Add it anyway' }).focus()
      await page.keyboard.press('Enter')
      await expect(sw(page, 'YouTube')).toHaveAttribute('aria-checked', 'true')
      const results = await new AxeBuilder({ page }).analyze()
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([])
    })

    test('a destination the running encode cannot serve says why and changes nothing', async ({
      page,
    }) => {
      await live(page, 60000)
      await demo(page, '(d) => { d.setGoLive({ kbps: 7500 }) }')
      await sw(page, 'Twitch').click() // off (YouTube stays on)
      await expect(sw(page, 'Twitch')).toHaveAttribute('aria-checked', 'false')
      await expect(platforms(page).getByText('Off', { exact: true }).first()).toBeVisible()
      await sw(page, 'Twitch').click()
      await expect(page.getByText(/Twitch takes at most 6,000 kbps/).first()).toBeVisible()
      await expect(sw(page, 'Twitch')).toHaveAttribute('aria-checked', 'false')
    })
  })
}
