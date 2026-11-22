import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Problem 11.2: Field schema Type select does not truncate Colour/Dropdown', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`Type select displays full "Colour" label without clipping (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'alerts/follow')
      await page.getByRole('button', { name: /^Custom HTML, CSS and schema/ }).click()
      await page.getByRole('switch', { name: 'Use custom HTML & CSS' }).click()

      const colorFieldRow = page.locator('[data-schema-field="accent_color"]')
      await expect(colorFieldRow).toBeVisible()

      const typeSelect = colorFieldRow.getByLabel('Type')
      const removeBtn = colorFieldRow.getByRole('button', { name: /Remove field/ })

      const metrics = await typeSelect.evaluate((sel) => {
        const el = sel as HTMLSelectElement
        const cs = getComputedStyle(el)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const longestText = Array.from(el.options).reduce(
          (max, o) => Math.max(max, ctx.measureText(o.textContent ?? '').width),
          0,
        )
        const pl = parseFloat(cs.paddingLeft) || 0
        const pr = parseFloat(cs.paddingRight) || 0
        return {
          clientWidth: el.clientWidth,
          neededWidth: Math.ceil(longestText + pl + pr),
        }
      })

      expect(metrics.clientWidth).toBeGreaterThanOrEqual(metrics.neededWidth)

      const selBox = (await typeSelect.boundingBox())!
      const btnBox = (await removeBtn.boundingBox())!
      expect(selBox.x + selBox.width).toBeLessThanOrEqual(btnBox.x)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
