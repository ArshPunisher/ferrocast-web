import { expect, test } from '@playwright/test'

// Settings › Appearance and Accessibility (demo engine): the new controls fit at desktop and
// phone width in both themes, and the choices reach the page root and survive a reload.

const SHOTS = process.env.FC_SHOTS

for (const [name, size] of [
  ['1280', { width: 1280, height: 900 }],
  ['375', { width: 375, height: 812 }],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${name}px ${theme}: appearance controls work, fit, and are remembered`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      await page.addInitScript((t) => localStorage.setItem('fc-theme', t), theme)
      await page.goto('./#/settings/appearance')
      const size100 = page.getByLabel('Text size')
      await expect(size100).toBeVisible()
      await size100.fill('120')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
        .toBe('120%')
      await page.getByRole('radiogroup', { name: 'Row spacing' }).getByText('Compact').click()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.density))
        .toBe('compact')
      await page
        .getByRole('radiogroup', { name: 'Meter colours' })
        .getByText('Colour-blind')
        .click()
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.style.getPropertyValue('--fc-meter-ok')),
        )
        .toBe('#0072b2')
      await page.getByRole('switch', { name: 'Reduce motion' }).click()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion))
        .toBe('true')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true)
      if (SHOTS)
        await page.screenshot({ path: `${SHOTS}/appearance-${name}-${theme}.png`, fullPage: true })
      // Remembered after a reload, applied before the first paint.
      await page.reload()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
        .toBe('120%')
      await expect(page.getByLabel('Text size')).toHaveValue('120')
    })
  }
}
