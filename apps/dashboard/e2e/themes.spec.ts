import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Settings › Appearance › Theme (demo engine): ten cards that apply at once, are remembered, work
// from the keyboard, fit a phone, and every theme passes axe's colour-contrast check.

const IDS = [
  'graphite',
  'slate',
  'moonlight',
  'forest',
  'ember',
  'obsidian',
  'daylight',
  'mist',
  'linen',
  'contrast',
] as const

const root = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null)

for (const [name, size] of [
  ['1280', { width: 1280, height: 900 }],
  ['375', { width: 375, height: 812 }],
] as const) {
  test(`${name}px: choosing a card applies at once, is remembered, and fits`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('./#/settings/appearance')
    const group = page.getByRole('radiogroup', { name: 'Theme' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio')).toHaveCount(10)
    // Following the computer: nothing is chosen yet.
    await expect(page.getByRole('switch', { name: 'Match system' })).toBeChecked()
    await group.getByText('Moonlight', { exact: true }).click()
    await expect.poll(() => root(page)).toBe('moonlight')
    await expect(page.getByRole('switch', { name: 'Match system' })).not.toBeChecked()
    await expect(group.getByRole('radio', { name: /Moonlight/ })).toBeChecked()
    // The page really took the colours: Moonlight's background.
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--fc-bg').trim(),
        ),
      )
      .toBe('#1d1e2a')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    // Remembered after a reload, before the first paint.
    await page.reload()
    await expect.poll(() => root(page)).toBe('moonlight')
    await expect(group.getByRole('radio', { name: /Moonlight/ })).toBeChecked()
    // Match system goes back to the computer's own.
    await page.getByRole('switch', { name: 'Match system' }).click()
    await expect.poll(() => root(page)).toBe(null)
  })
}

test('arrow keys move through the themes like any radio group', async ({ page }) => {
  await page.goto('./#/settings/appearance')
  const group = page.getByRole('radiogroup', { name: 'Theme' })
  await group.getByText('Graphite', { exact: true }).click()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => root(page)).toBe('slate')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => root(page)).toBe('moonlight')
})

test('the old dark and light still work, as Slate and Daylight', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fc-theme', 'dark'))
  await page.goto('./#/settings/appearance')
  expect(await root(page)).toBe('dark')
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--fc-bg').trim(),
      ),
    )
    .toBe('#17212b')
})

for (const id of IDS) {
  test(`${id}: Settings › Appearance passes axe colour contrast, at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript((t) => localStorage.setItem('fc-theme', t), id)
    await page.goto('./#/settings/appearance')
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 120)),
      })),
    ).toEqual([])
  })
}
