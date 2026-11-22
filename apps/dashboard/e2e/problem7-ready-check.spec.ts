import { expect, test } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

test.describe('Problem 7: Ready check must not cover desktop mixer or mobile nav/scenes', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`Ready check avoids controls, status bar, and bottom nav (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      })
      await page.goto('./?autoplay=0&latency=150&studioEngine=1#/studio')
      await expect(page.locator('#main')).toBeVisible()

      const startBtn = page.getByRole('button', { name: 'Start the Studio' })
      await expect(startBtn).toBeVisible()
      await startBtn.click()

      const ready = page.getByRole('region', { name: 'Ready check' })
      await expect(ready).toBeVisible({ timeout: 10_000 })
      const readyBox = await ready.boundingBox()
      expect(readyBox).not.toBeNull()

      const scenesBox = await page.getByRole('region', { name: 'Scenes' }).boundingBox()
      expect(scenesBox).not.toBeNull()
      expect(intersects(readyBox!, scenesBox!)).toBe(false)

      if (vp.width >= 1024) {
        const audioBox = await page.getByRole('region', { name: 'Audio' }).boundingBox()
        expect(audioBox).not.toBeNull()
        expect(intersects(readyBox!, audioBox!)).toBe(false)

        const footer = page.locator('footer[aria-label="Studio status"]')
        if (await footer.isVisible().catch(() => false)) {
          const footerBox = await footer.boundingBox()
          expect(footerBox).not.toBeNull()
          expect(intersects(readyBox!, footerBox!)).toBe(false)
        }
      } else {
        const navBox = await page.locator('nav[data-tab-bar]').boundingBox()
        expect(navBox).not.toBeNull()
        expect(intersects(readyBox!, navBox!)).toBe(false)
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
