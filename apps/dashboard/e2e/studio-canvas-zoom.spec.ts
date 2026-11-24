import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { settled } from './helpers'

async function openStudioDesk(page: Page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
    localStorage.removeItem('fc-preview-view')
  })
  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  const box = page.locator('[data-canvas-box]')
  await expect(box).toBeVisible({ timeout: 10_000 })
  await settled(page)
  return box
}

async function boxMetrics(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-canvas-box]')
    const stage = box?.parentElement
    if (!box || !stage) throw new Error('canvas box not mounted')
    const b = box.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    return {
      width: b.width,
      height: b.height,
      offsetX: b.left + b.width / 2 - (s.left + s.width / 2),
      offsetY: b.top + b.height / 2 - (s.top + s.height / 2),
      stageWidth: s.width,
      stageHeight: s.height,
    }
  })
}

test.describe('Studio canvas zoom buttons (U1)', () => {
  test('clicking Fit, 75%, 50%, 100% five times each is strictly idempotent and centered', async ({
    page,
  }) => {
    await openStudioDesk(page, { width: 1440, height: 900 })

    const fit = page.getByRole('button', { name: /^Fit the canvas/ })
    const pct75 = page.getByRole('button', { name: 'Zoom 75%' })
    const pct50 = page.getByRole('button', { name: 'Zoom 50%' })
    const pct100 = page.getByRole('button', { name: 'Zoom 100%, canvas pixels' })

    const fitBase = await boxMetrics(page)
    expect(Math.abs(fitBase.offsetX)).toBeLessThan(1)
    expect(Math.abs(fitBase.offsetY)).toBeLessThan(1)

    for (const [label, btn, expectedWidth] of [
      ['100%', pct100, 1920],
      ['75%', pct75, fitBase.width * 0.75],
      ['50%', pct50, fitBase.width * 0.5],
      ['Fit', fit, fitBase.width],
    ] as const) {
      // Rapid 5 consecutive clicks with no wait in between (catches stale-closure double-zoom).
      for (let i = 1; i <= 5; i++) {
        await btn.click()
      }
      const after5 = await boxMetrics(page)
      expect(after5.width, `${label} width after 5 rapid clicks`).toBeCloseTo(expectedWidth, 0)
      expect(Math.abs(after5.offsetX), `${label} centered X`).toBeLessThan(1)
      expect(Math.abs(after5.offsetY), `${label} centered Y`).toBeLessThan(1)
      await expect(btn).toHaveAttribute('aria-pressed', 'true')

      // Check step-by-step clicks 1..5 produce identical measurements.
      await fit.click()
      await btn.click()
      const first = await boxMetrics(page)
      for (let i = 2; i <= 5; i++) {
        await btn.click()
        const next = await boxMetrics(page)
        expect(next.width, `${label} width on click ${i}`).toBeCloseTo(first.width, 1)
        expect(next.height, `${label} height on click ${i}`).toBeCloseTo(first.height, 1)
        expect(next.offsetX, `${label} offsetX on click ${i}`).toBeCloseTo(first.offsetX, 1)
        expect(next.offsetY, `${label} offsetY on click ${i}`).toBeCloseTo(first.offsetY, 1)
      }
    }
  })

  test('wheel scrolling pans inside zoomed canvas without scrolling page, and Fit recenters', async ({
    page,
  }) => {
    await openStudioDesk(page, { width: 1440, height: 900 })
    const pct100 = page.getByRole('button', { name: 'Zoom 100%, canvas pixels' })
    const fit = page.getByRole('button', { name: /^Fit the canvas/ })
    await pct100.click()

    const before = await boxMetrics(page)
    const stageCenter = await page.evaluate(() => {
      const s = document.querySelector('[data-canvas-box]')?.parentElement?.getBoundingClientRect()
      if (!s) throw new Error('no stage')
      return { x: s.left + s.width / 2, y: s.top + s.height / 2 }
    })

    await page.mouse.move(stageCenter.x, stageCenter.y)
    await page.mouse.wheel(120, 90)
    const panned = await boxMetrics(page)
    expect(panned.offsetX).toBeLessThan(before.offsetX - 10)
    expect(panned.offsetY).toBeLessThan(before.offsetY - 10)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    // Returning to Fit clears offset and fits cleanly.
    await fit.click()
    const reset = await boxMetrics(page)
    expect(Math.abs(reset.offsetX)).toBeLessThan(1)
    expect(Math.abs(reset.offsetY)).toBeLessThan(1)
  })

  for (const vp of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 375, height: 812 },
  ]) {
    test(`works at ${vp.width} px with no sideways scroll`, async ({ page }) => {
      await openStudioDesk(page, vp)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflow, `overflow at ${vp.width}`).toBe(false)
    })
  }

  test('light and dark themes have no axe violations on stage', async ({ page }) => {
    await openStudioDesk(page, { width: 1440, height: 900 })
    const lightA11y = await new AxeBuilder({ page }).include('[data-stage]').analyze()
    expect(lightA11y.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkA11y = await new AxeBuilder({ page }).include('[data-stage]').analyze()
    expect(darkA11y.violations).toEqual([])
  })
})
