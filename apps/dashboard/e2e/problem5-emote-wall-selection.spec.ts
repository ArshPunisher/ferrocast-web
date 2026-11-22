import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

test.describe('Problem 5: Full-canvas Emote wall does not block canvas selection of widgets beneath it', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`clicking underlying widgets works on canvas even when Emote wall is topmost (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'overlays/ov-main')

      // Ensure a Label widget exists underneath, then add full-canvas Emote wall on top.
      await page.getByRole('button', { name: 'More to add' }).click()
      await page.getByRole('menuitem', { name: 'Label' }).click()
      await settled(page)
      const inspector = page.getByRole('complementary', { name: 'Inspector' })
      await expect(inspector.getByRole('heading', { name: 'Label', level: 3 })).toBeVisible()

      await page.getByRole('button', { name: 'More to add' }).click()
      await page.getByRole('menuitem', { name: 'Emote wall' }).click()
      await settled(page)
      await expect(inspector.getByRole('heading', { name: 'Emote wall', level: 3 })).toBeVisible()

      // Clicking the underlying Label widget directly on the canvas must select it cleanly.
      const labelWidget = page.getByRole('button', { name: /Label widget/ }).first()
      await labelWidget.scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, -100))
      await labelWidget.click({ timeout: 5000 })

      await expect(inspector.getByRole('heading', { name: 'Label', level: 3 })).toBeVisible()
      await expect(labelWidget).toHaveAttribute('aria-pressed', 'true')

      // Clicking Emote wall's perimeter rail still selects Emote wall cleanly.
      const emoteEdge = page.locator('[data-emote-wall-edge="top"]').first()
      await expect(emoteEdge).toBeVisible()
      await emoteEdge.click()
      await expect(inspector.getByRole('heading', { name: 'Emote wall', level: 3 })).toBeVisible()
    })
  }
})
