// The Overlays, Designs and Community Store redesigns: a full-width card grid (no preset strip),
// a slim filter rail with a dense gallery, and a category and trust rail with an honest "not
// published" state. Each at 1440, 1280 and 375 px, with no sideways scroll.

import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '375', width: 375, height: 812 },
] as const

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

/** How many of `selector` sit on the first row of the grid. */
async function firstRow(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((els) => {
    const tops = els.map((e) => Math.round(e.getBoundingClientRect().top))
    return tops.filter((t) => Math.abs(t - (tops[0] ?? 0)) <= 2).length
  })
}

for (const size of SIZES) {
  test.describe(`at ${size.name}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('Overlays: a full-width card grid, and no preset strip', async ({ page }) => {
      await open(page, 'overlays', 'autoplay=0&latency=0')
      await expect(page.getByRole('heading', { name: 'Overlays', level: 1 })).toBeVisible()
      await expect(page.getByText(/Quick-create from preset/i)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'New overlay' })).toBeVisible()
      const list = page.locator('main ul').first()
      await expect(list).toBeVisible()
      const box = await list.boundingBox()
      const main = await page.locator('#main').boundingBox()
      // The grid uses the page's whole width, not a centred column.
      expect(box!.width).toBeGreaterThanOrEqual(main!.width - 72)
      expect(await noSidewaysScroll(page)).toBe(true)
      await page.screenshot({ path: `../../../notes/design/redesign/built/B1-${size.name}.png` })
    })

    test('Designs: a left filter rail and a dense gallery', async ({ page }) => {
      await open(page, 'designs', 'autoplay=0&latency=0')
      await expect(page.getByRole('heading', { name: 'Designs', level: 1 })).toBeVisible()
      const rail = page.getByRole('complementary', { name: 'Filters' })
      await expect(rail).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search themes' })).toBeVisible()
      const style = page.getByRole('group', { name: 'Style' })
      await expect(style.getByRole('button', { name: /^All styles/ }).first()).toBeVisible()
      await expect(page.getByRole('radiogroup', { name: 'Motion' })).toBeVisible()
      await page.locator('main [aria-live="polite"] > *').first().waitFor()
      const row = await firstRow(page, 'main [aria-live="polite"] > *')
      if (size.width === 1440) expect(row).toBe(4)
      if (size.width === 1280) expect(row).toBe(3)
      if (size.width === 375) expect(row).toBe(1)
      if (size.width >= 1024) {
        // The rail is a column beside the gallery.
        const r = await rail.boundingBox()
        const g = await page.locator('main [aria-live="polite"]').boundingBox()
        expect(r!.x + r!.width).toBeLessThanOrEqual(g!.x)
      }
      expect(await noSidewaysScroll(page)).toBe(true)
      await page.screenshot({ path: `../../../notes/design/redesign/built/C1-${size.name}.png` })
    })

    test('Store: a category and trust rail, and a full-width grid', async ({ page }) => {
      await open(page, 'store', 'autoplay=0&latency=0')
      await expect(page.getByRole('heading', { name: 'Community Store', level: 1 })).toBeVisible()
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
      const rail = page.getByRole('complementary', { name: 'Store filters' })
      await expect(rail).toBeVisible()
      await expect(rail.getByRole('group', { name: 'Store categories' })).toBeVisible()
      await expect(rail.getByText('Pure data')).toBeVisible()
      const row = await firstRow(page, '[data-testid^="store-card-"]')
      if (size.width >= 1280) expect(row).toBeGreaterThanOrEqual(3)
      if (size.width === 375) expect(row).toBe(1)
      expect(await noSidewaysScroll(page)).toBe(true)
      await page.screenshot({ path: `../../../notes/design/redesign/built/D1-${size.name}.png` })
    })

    test('Store: a catalog that is not published says so, and the internet is not blamed', async ({
      page,
    }) => {
      await open(page, 'store', 'autoplay=0&latency=0')
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
      await page.evaluate(() => window.__ferrocastDemo?.setStoreFault('not_published'))
      await page.getByRole('button', { name: 'Refresh catalog' }).click()
      const note = page.getByTestId('store-not-published')
      await expect(note).toBeVisible()
      await expect(note).toContainText('isn’t published yet')
      await expect(note).toContainText('internet connection is fine')
      await expect(page.getByText(/Check the internet/)).toHaveCount(0)
      // Nothing here promises installing from a link: that needs the catalog too.
      await expect(note).not.toContainText('ferrocast://')
      await expect(note.getByRole('button', { name: 'Check again' })).toBeVisible()
      await expect(note.getByRole('link', { name: 'Browse built-in designs' })).toBeVisible()
      expect(await noSidewaysScroll(page)).toBe(true)
      // A real outage still says to check the connection.
      await page.evaluate(() => window.__ferrocastDemo?.setStoreFault('unreachable'))
      await note.getByRole('button', { name: 'Check again' }).click()
      await expect(page.getByRole('alert')).toContainText(/connection/i)
      await page.evaluate(() => window.__ferrocastDemo?.setStoreFault(null))
    })

    test('Store: plain words (no internal names), and Reset brings the Trust filters back', async ({
      page,
    }) => {
      const jargon = /\bp2e\b|WGSL|WASM|SHA-256/i
      await open(page, 'store', 'autoplay=0&latency=0')
      await expect(page.getByTestId('store-card-soft-dimmer-shader')).toBeVisible()
      // The list: cards, chips, the rail.
      expect(await page.locator('#main').innerText()).not.toMatch(jargon)
      await expect(page.getByText('Shader (sandboxed)').first()).toBeVisible()
      // The rail's note about local installs shows from the desktop widths up.
      if (size.width >= 1024)
        await expect(page.getByText('Verified on this PC').first()).toBeVisible()
      // An item's own page, for an alert and a shader.
      for (const id of ['arcade-ticker-alert', 'soft-dimmer-shader']) {
        await page.evaluate((i) => {
          window.location.hash = `#/store/item/${i}`
        }, id)
        const detail = page.getByTestId('store-item-detail')
        await expect(detail).toBeVisible()
        expect(await detail.innerText()).not.toMatch(/\bp2e\b|WGSL|WASM/i)
        await page.keyboard.press('Escape')
        await expect(detail).toHaveCount(0)
      }
      // What a link says it will check.
      await page.evaluate(() => {
        window.location.hash = `#/store?link=${encodeURIComponent('ferrocast://store/install/arcade-ticker-alert')}`
      })
      const dlg = page.getByTestId('ferrocast-link-dialog')
      await expect(dlg.getByText(/Install “Arcade Ticker Alert”/)).toBeVisible()
      expect(await dlg.innerText()).not.toMatch(jargon)
      await dlg.getByRole('button', { name: 'Cancel' }).click()
      await expect(dlg).toHaveCount(0)

      // Reset filters: both Trust boxes are back, with the category and search.
      await page.getByLabel('Pure data').uncheck()
      await page.getByLabel('Sandboxed', { exact: true }).uncheck()
      await expect(page.getByText('No store items match that search')).toBeVisible()
      await page.getByRole('button', { name: 'Reset filters' }).click()
      await expect(page.getByLabel('Pure data')).toBeChecked()
      await expect(page.getByLabel('Sandboxed', { exact: true })).toBeChecked()
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
    })
  })
}
