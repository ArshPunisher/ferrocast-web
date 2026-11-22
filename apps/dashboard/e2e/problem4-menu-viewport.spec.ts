import { expect, test } from '@playwright/test'
import { settled } from './helpers'

test.describe('Problem 4: Overlay Editor More-to-add menu stays inside safe viewport', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`More to add menu stays clear of top header, Studio status bar, and mobile bottom nav (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      // Start Studio Engine inside the same SPA session so StudioStatusBar stays active.
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      })
      await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
      const startBtn = page.getByRole('button', { name: 'Start the Studio' })
      if (await startBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await startBtn.click()
        await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible({ timeout: 10_000 })
      }
      await page.evaluate(() => {
        window.location.hash = '#/overlays'
      })
      await expect(page.locator('#main')).toBeVisible()

      await page.locator('a[href^="#/overlays/"]').first().click()
      await expect(page.getByRole('toolbar', { name: 'Canvas' })).toBeVisible({ timeout: 10_000 })

      // Select/add a Label widget so the inspector fills the side column cleanly like in 41-temp-menu.png.
      const addTextBtn = page.getByRole('button', { name: 'Text', exact: true })
      if (await addTextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await addTextBtn.click()
      }

      const moreBtn = page.getByRole('button', { name: 'More to add' })
      await moreBtn.scrollIntoViewIfNeeded()
      const btnBox = await moreBtn.boundingBox()
      expect(btnBox).not.toBeNull()
      if (vp.width >= 1024 && btnBox) {
        const targetY = 384
        if (btnBox.y > targetY) {
          await page.evaluate((delta) => window.scrollBy(0, delta), btnBox.y - targetY)
        }
      }

      await moreBtn.click()
      const menu = page.getByRole('menu', { name: 'Add something else' })
      await expect(menu).toBeVisible()
      await settled(page)

      const metrics = await page.evaluate(() => {
        const ul = document.querySelector('[role="menu"][aria-label="Add something else"]')
        if (!ul) return null
        const r = ul.getBoundingClientRect()
        const header = document.querySelector('header')
        const headerRect =
          header && getComputedStyle(header).display !== 'none'
            ? header.getBoundingClientRect()
            : null
        const footer = document.querySelector('footer[aria-label="Studio status"]')
        const footerRect =
          footer && getComputedStyle(footer).display !== 'none'
            ? footer.getBoundingClientRect()
            : null
        const mobileNav = document.querySelector('nav[data-tab-bar]')
        const navRect =
          mobileNav && getComputedStyle(mobileNav).display !== 'none'
            ? mobileNav.getBoundingClientRect()
            : null
        return {
          rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height },
          vw: document.documentElement.clientWidth,
          vh: document.documentElement.clientHeight,
          headerBottom: headerRect ? headerRect.bottom : 0,
          footerTop: footerRect ? footerRect.top : null,
          navTop: navRect ? navRect.top : null,
          canScrollInside: ul.scrollHeight >= ul.clientHeight,
        }
      })

      expect(metrics).not.toBeNull()
      expect(metrics!.rect.left).toBeGreaterThanOrEqual(4)
      expect(metrics!.rect.right).toBeLessThanOrEqual(metrics!.vw - 4)
      expect(metrics!.rect.top).toBeGreaterThanOrEqual(metrics!.headerBottom)
      expect(metrics!.rect.bottom).toBeLessThanOrEqual(metrics!.vh - 4)
      if (metrics!.footerTop !== null) {
        expect(metrics!.rect.bottom).toBeLessThanOrEqual(metrics!.footerTop - 4)
      }
      if (metrics!.navTop !== null) {
        expect(metrics!.rect.bottom).toBeLessThanOrEqual(metrics!.navTop - 4)
      }
    })
  }
})
