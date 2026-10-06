// Designs at phone width (375 px) in both themes: nothing scrolls sideways, the designer's
// inspector becomes a bottom sheet, the guided view keeps its send and next buttons.

import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

async function noSideScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over, 'nothing scrolls sideways').toBeLessThanOrEqual(1)
}

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`375 px, ${scheme}`, () => {
    test.use({ viewport: { width: 375, height: 812 }, colorScheme: scheme })

    test('gallery', async ({ page }) => {
      await open(page, 'designs')
      await expect(page.getByRole('article').first()).toBeVisible()
      await noSideScroll(page)
      await page.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Bold' }).click()
      await expect(page.getByRole('article').first()).toBeVisible()
    })

    test('designer, stage view: the inspector is a bottom sheet', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('fc.designer.view', 'stage'))
      await open(page, 'designer/builtin.neon-sign')
      await noSideScroll(page)
      await page.getByRole('tab', { name: 'Text' }).click()
      await expect(page.getByRole('textbox', { name: 'Headline' })).toBeVisible()
      await page.getByRole('tab', { name: 'Text' }).click()
      await expect(page.getByRole('textbox', { name: 'Headline' })).toBeHidden()
    })

    test('designer, guided view: send and next stay in reach', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('fc.designer.view', 'guided'))
      await open(page, 'designer/builtin.glass-card')
      await noSideScroll(page)
      await expect(page.getByRole('button', { name: 'Send test', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Next: Text' }).last().click()
      await expect(page.getByRole('textbox', { name: 'Headline' })).toBeVisible()
    })
  })
}
