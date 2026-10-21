import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// The Pro panel pieces (ProChip, ProPanel) on smart moderation (`#/moderation`; Insights is
// free with an account since 1.4). The demo starts like a relay with Pro off sale and no
// Pro; `?pro=` and `?pro_features=on` switch it.
const history = (page: Page, pro = '') =>
  open(page, 'moderation', `autoplay=0&latency=0${pro ? `&${pro}` : ''}`)
const panel = (page: Page) => page.locator('#smart-moderation')

test.describe('Pro panels', () => {
  test('hidden while Pro is off sale and this install has none', async ({ page }) => {
    await history(page)
    await expect(page.getByRole('heading', { name: 'Moderation', exact: true })).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Part of Ferrocast Pro' })).toHaveCount(0)
    // Insights needs only the relay to keep history; this one doesn't.
    await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0)
  })

  test('on sale: one calm line and a link to Settings › Pro, never the feature', async ({
    page,
  }) => {
    await history(page, 'pro=open&pro_features=on')
    const p = panel(page)
    await expect(p.getByTestId('pro-line')).toHaveText(
      'Runs on Ferrocast’s servers, part of Pro. Settings › Pro',
    )
    await expect(p.getByRole('img', { name: 'Part of Ferrocast Pro' })).toBeVisible()
    await expect(p.getByTestId('smart-suggestion')).toHaveCount(0)
    await p.getByRole('link', { name: 'Settings › Pro' }).click()
    await expect(page).toHaveURL(/#\/settings\/pro$/)
    await expect(
      page.locator('#settings-pro').getByRole('heading', { name: /Pro adds the always-on parts/ }),
    ).toBeVisible()
  })

  test('a feature the relay lacks stays hidden, on sale or Pro', async ({ page }) => {
    for (const pro of ['pro=open', 'pro=active']) {
      await history(page, pro)
      await expect(page.getByRole('heading', { name: 'Moderation', exact: true })).toBeVisible()
      await expect(panel(page)).toHaveCount(0)
    }
  })

  test('Pro: the feature itself', async ({ page }) => {
    await history(page, 'pro=active&pro_features=on')
    await expect(panel(page).getByTestId('smart-suggestion').first()).toBeVisible()
    await expect(panel(page).getByTestId('pro-line')).toHaveCount(0)
    await expect(panel(page).getByRole('img', { name: 'Part of Ferrocast Pro' })).toBeVisible()
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await history(page, 'pro=open&pro_features=on')
    await expect(panel(page).getByTestId('pro-line')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#smart-moderation').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Pro panels at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const pro of ['pro=open&pro_features=on', 'pro=active&pro_features=on']) {
    test(`fit the phone width (${pro})`, async ({ page }) => {
      await history(page, pro)
      const p = panel(page)
      await expect(p).toBeVisible()
      const box = await p.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      await expect(p.getByRole('img', { name: 'Part of Ferrocast Pro' })).toBeVisible()
    })
  }
})
