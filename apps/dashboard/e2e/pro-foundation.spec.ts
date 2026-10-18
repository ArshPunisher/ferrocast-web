import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// The Pro panel pieces (ProChip, ProPanel) on the demo-only preview screen. The demo starts
// like the real relay today (off sale, no Pro, no features); `?pro=` switches it.
const preview = (page: Page, pro = '') =>
  open(page, 'preview/pro', `autoplay=0&latency=0${pro ? `&${pro}` : ''}`)
const any = (page: Page) => page.locator('#preview-pro-any')
const history = (page: Page) => page.locator('#preview-pro-history')

test.describe('Pro panels', () => {
  test('hidden while Pro is off sale and this install has none', async ({ page }) => {
    await preview(page)
    await expect(page.getByRole('heading', { name: 'Pro panels (demo preview)' })).toBeVisible()
    await expect(any(page)).toHaveCount(0)
    await expect(history(page)).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Part of Ferrocast Pro' })).toHaveCount(0)
  })

  test('on sale: one calm line and a link to Settings › Pro, never the feature', async ({ page }) => {
    await preview(page, 'pro=open')
    const p = any(page)
    await expect(p.getByTestId('pro-line')).toHaveText(
      'Runs on Ferrocast’s servers, part of Pro. Settings › Pro',
    )
    await expect(p.getByRole('img', { name: 'Part of Ferrocast Pro' })).toBeVisible()
    await expect(p.getByTestId('pro-preview-content')).toHaveCount(0)
    // A feature this relay doesn't have stays hidden even on sale.
    await expect(history(page)).toHaveCount(0)
    await p.getByRole('link', { name: 'Settings › Pro' }).click()
    await expect(page).toHaveURL(/#\/settings\/pro$/)
    await expect(page.locator('#settings-pro').getByTestId('pro-summary')).toBeVisible()
  })

  test('Pro: the feature itself, and a feature panel once the relay has it', async ({ page }) => {
    await preview(page, 'pro=active')
    await expect(any(page).getByTestId('pro-preview-content')).toBeVisible()
    await expect(any(page).getByTestId('pro-line')).toHaveCount(0)
    await expect(history(page)).toHaveCount(0)
    await preview(page, 'pro=active&pro_features=on')
    await expect(history(page).getByTestId('pro-preview-history')).toBeVisible()
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await preview(page, 'pro=open')
    await expect(any(page).getByTestId('pro-line')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#preview-pro-any').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Pro panels at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const pro of ['pro=open', 'pro=active&pro_features=on']) {
    test(`fit the phone width (${pro})`, async ({ page }) => {
      await preview(page, pro)
      const p = any(page)
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
