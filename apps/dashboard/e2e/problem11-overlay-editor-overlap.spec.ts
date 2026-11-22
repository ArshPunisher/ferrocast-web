import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

type Box = { x: number; y: number; width: number; height: number }

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

test.describe('Problem 11.3: Unsaved layout bar and selection tag avoid covering content', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`Label selection tag sits outside widget box and Unsaved layout avoids Inspector Layers (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'overlays/ov-main')
      await expect(page.locator('#main')).toBeVisible()

      await page.getByRole('button', { name: 'More to add' }).click()
      await page.getByRole('menuitem', { name: 'Label' }).click()
      await settled(page)

      const unsavedBanner = page.getByText(
        'Unsaved layout. Your stream keeps the old one until you save.',
      )
      await expect(unsavedBanner).toBeVisible()

      const labelBtn = page.locator(
        '[role="button"][aria-label^="Label widget"][aria-pressed="true"]',
      )
      await expect(labelBtn).toBeVisible()
      const labelBox = (await labelBtn.boundingBox())!
      const tag = labelBtn.locator('[data-widget-tag]').first()
      await expect(tag).toBeVisible()
      const tagBox = (await tag.boundingBox())!
      expect(tagBox.y + tagBox.height).toBeLessThanOrEqual(labelBox.y + 1)

      if (vp.width >= 1024) {
        const layers = page.locator('aside[aria-label="Inspector"]').getByRole('region', {
          name: 'Layers',
        })
        await expect(layers).toBeVisible()
        await page.evaluate(() => window.scrollBy(0, 120))
        const layersBox = (await layers.boundingBox())!
        const bannerContainer = unsavedBanner.locator('..')
        const bannerBox = (await bannerContainer.boundingBox())!
        expect(intersects(bannerBox, layersBox)).toBe(false)
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
