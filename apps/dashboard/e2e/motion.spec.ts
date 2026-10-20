// The designer's Motion area (the approved motion board): recipes, the live option lists,
// feel, impact, placement and sound, Surprise me, Copy motion from another alert, the test
// amounts, the screenshot backdrop with its errors, saving, accessibility and 375 px.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

async function motionTab(page: Page): Promise<void> {
  await open(page, 'designer/builtin.molten-plate')
  await page.locator('#tab-motion').click()
  await expect(page.getByRole('button', { name: 'Play alert' })).toBeVisible()
}

const section = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}`) }).first()

test.describe('Motion area', () => {
  test('a recipe sets the motion, the timeline shows the hit, and it plays in the real renderer', async ({
    page,
  }) => {
    await motionTab(page)
    await section(page, 'Recipes').click()
    await page.getByRole('button', { name: /^Heavy hitter/ }).click()
    await expect(page.getByRole('button', { name: /^Heavy hitter/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText(/hit lands at 170 ms/)).toBeVisible()
    await expect(page.getByLabel('Timeline').getByText('Breathe')).toBeVisible()
    await page.getByRole('button', { name: 'Play alert' }).click()
    // At the hit the stage flashes, shakes and throws particles on its own canvas.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = [...document.querySelectorAll('.fc-design-host')]
            .map((h) => h.shadowRoot)
            .find((x) => x?.querySelector('.fa-punch'))
          return !!r?.querySelector('.fa-flash') && !!r?.querySelector('canvas.fa-fx')
        }),
      )
      .toBe(true)
  })

  test('picking an entrance, an idle loop and a spot, then saving, keeps them', async ({
    page,
  }) => {
    await motionTab(page)
    await page.getByRole('button', { name: /^Bolt strike/ }).click()
    await expect(section(page, 'Entrance')).toContainText('Bolt strike')
    await section(page, 'While on screen').click()
    await page.getByRole('button', { name: /^Jelly/ }).click()
    await page.getByRole('button', { name: 'Bottom right' }).click()
    await expect(page.getByRole('button', { name: 'Bottom right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // A built-in saves as your own copy, and the copy opens.
    await page.getByRole('button', { name: 'Save my copy' }).click()
    await expect(page.getByText(/your own copy/)).toBeVisible()
    await page.locator('#tab-motion').click()
    await expect(section(page, 'Entrance')).toContainText('Bolt strike')
    await expect(section(page, 'While on screen')).toContainText('Jelly')
    await expect(page.getByRole('button', { name: 'Bottom right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('the simple 1.0 entrances are still there and keep their own timing edges', async ({
    page,
  }) => {
    await motionTab(page)
    await page.getByRole('button', { name: 'Fade', exact: true }).first().click()
    await expect(section(page, 'Entrance')).toContainText('Fade')
    await expect(page.getByRole('slider', { name: 'Entrance length' })).toBeVisible()
    await page.getByRole('button', { name: /^Slam/ }).click()
    // The motion designer's entrances take their length from Feel instead.
    await expect(page.getByRole('slider', { name: 'Entrance length' })).toHaveCount(0)
  })

  test('Surprise me picks a new combination and drops the recipe', async ({ page }) => {
    await motionTab(page)
    await section(page, 'Recipes').click()
    await page.getByRole('button', { name: /^Heavy hitter/ }).click()
    await page.getByRole('button', { name: 'Surprise me' }).click()
    await expect(section(page, 'Recipes')).toContainText('Custom')
  })

  test('copies the motion from another alert', async ({ page }) => {
    await motionTab(page)
    const copy = page.getByLabel('Copy motion from another alert')
    const first = await copy.locator('option').nth(1).getAttribute('value')
    expect(first).toBeTruthy()
    await copy.selectOption(first as string)
    await expect(page.getByText(/Copied the motion from your/)).toBeVisible()
  })

  test('feel presets and sliders, impact switches, beat and tempo', async ({ page }) => {
    await motionTab(page)
    await page.getByRole('radio', { name: 'Punchy' }).check({ force: true })
    await expect(page.getByText('Lots')).toBeVisible()
    await page.getByRole('switch', { name: 'Screen shake' }).click()
    await page.getByRole('switch', { name: 'Land on the beat' }).click()
    // The beat moves only the motion designer's entrances; a simple one keeps its timing.
    await expect(page.getByText(/waits \d+ ms for the beat/)).toHaveCount(0)
    await page.getByRole('button', { name: /^Slam/ }).click()
    await expect(page.getByText(/waits \d+ ms for the beat/)).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Impact sounds' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  test('tip-size test amounts change the preview amount', async ({ page }) => {
    await motionTab(page)
    const group = page.getByRole('radiogroup', { name: 'Test amount' })
    await group.getByText('₹50,000').click()
    await expect(page.getByLabel('Test amount', { exact: true }).last()).toHaveValue('50000')
  })

  test('a screenshot backdrop refuses the wrong file and an oversized one, in words', async ({
    page,
  }) => {
    await motionTab(page)
    const input = page.locator('input[type=file][accept^="image/png"]')
    await input.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hi'),
    })
    await expect(page.getByRole('alert')).toContainText('isn’t a supported image')
    await input.setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    })
    await expect(page.getByRole('alert')).toContainText('under 10 MB')
  })

  for (const scheme of ['dark', 'light'] as const)
    test(`has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await motionTab(page)
      await settled(page)
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#designer-pane')
        .analyze()
      expect(
        r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])
    })

  test('fits a 375 px phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'designer/builtin.molten-plate')
    await page.locator('#tab-motion').click()
    await expect(page.getByRole('button', { name: 'Play alert' })).toBeVisible()
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(over).toBeLessThanOrEqual(0)
  })
})
