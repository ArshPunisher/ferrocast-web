import { expect, test } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

test.describe('Problem 11.4: Unified 3.4.x demo versions and unobstructed Settings Version footer', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`Settings sidebar version matches 3.4.0 and clears Studio status bar (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      })

      if (vp.width >= 1024) {
        // Start simulated Studio engine so footer[aria-label="Studio status"] is visible at 1280x800
        await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
        await expect(page.locator('#main')).toBeVisible()
        await page.getByRole('button', { name: 'Start the Studio' }).click()
        await expect(page.locator('footer[aria-label="Studio status"]')).toBeVisible()
        await page.evaluate(() => {
          location.hash = '#/settings/appearance'
        })
      } else {
        await page.goto('./?autoplay=0&latency=0&studioEngine=1#/settings/appearance')
      }

      await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()

      if (vp.width >= 1024) {
        const nav = page.getByRole('navigation', { name: 'Settings sections' })
        const versionLink = page.getByTestId('app-version')
        await expect(versionLink).toContainText('Version 3.4.0')
        const statusBar = page.locator('footer[aria-label="Studio status"]')
        const statusBox = (await statusBar.boundingBox())!
        const navBox = (await nav.boundingBox())!
        expect(intersects(navBox, statusBox)).toBe(false)
        await versionLink.scrollIntoViewIfNeeded()
        const verBox = (await versionLink.boundingBox())!
        expect(intersects(verBox, statusBox)).toBe(false)

        await expect(page.locator('aside').getByTestId('update-nav')).toHaveAttribute(
          'aria-label',
          /3\.4\.1/,
        )
      } else {
        await page.getByRole('button', { name: 'More' }).click()
        await expect(page.getByRole('dialog').getByTestId('update-nav')).toContainText('3.4.1')
        await page.keyboard.press('Escape')
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
