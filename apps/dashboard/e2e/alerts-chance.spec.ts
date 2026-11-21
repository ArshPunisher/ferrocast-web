import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open } from './helpers'

// The alert editor's new controls: "Interrupt the alert on screen" (per alert type) and a
// look's "Chance" (weight), in the demo engine, at 1280 and 375 px.

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

async function addLookWithMore(page: Page) {
  await open(page, 'alerts/tip')
  await page.getByRole('button', { name: 'Add a look' }).click()
  await page.locator('summary', { hasText: 'More' }).click()
}

function suite() {
  test('interrupt is off by default, saves on, and the engine keeps it', async ({ page }) => {
    await open(page, 'alerts/tip')
    const sw = page.getByRole('switch', { name: 'Interrupt the alert on screen' })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await saveButton(page).click()
    await expect(page.getByText(/“Tips” saved/)).toBeVisible()
    expect(await demo<boolean>(page, '(d) => d.rules.find((r) => r.id === "tip").interrupt')).toBe(
      true,
    )
  })

  test('a look has a chance that saves; the default look has none', async ({ page }) => {
    await open(page, 'alerts/tip')
    await page.locator('summary', { hasText: 'More' }).click()
    await expect(page.getByLabel('Chance')).toHaveCount(0)
    await page.getByRole('button', { name: 'Add a look' }).click()
    await page.locator('summary', { hasText: 'More' }).click()
    const chance = page.getByLabel('Chance')
    await expect(chance).toHaveValue('1')
    await chance.fill('7')
    await expect(chance).toHaveValue('7')
    if (process.env.SHOTS)
      await page.screenshot({
        fullPage: true,
        path: `${process.env.SHOTS}/alerts-chance-${page.viewportSize()?.width}.png`,
      })
    await saveButton(page).click()
    await expect(page.getByText(/“Tips” saved/)).toBeVisible()
    expect(
      await demo<number>(
        page,
        '(d) => d.rules.find((r) => r.id === "tip").variations.find((v) => v.name === "New look").weight',
      ),
    ).toBe(7)
  })

  test('chance is held between 0 and 1000', async ({ page }) => {
    await addLookWithMore(page)
    const chance = page.getByLabel('Chance')
    await chance.fill('5000')
    await expect(chance).toHaveValue('1000')
    await chance.fill('-4')
    await expect(chance).toHaveValue('0')
  })

  test('a refused save says why and what to do', async ({ page }) => {
    await open(page, 'alerts/tip')
    await page.getByRole('switch', { name: 'Interrupt the alert on screen' }).click()
    await fault(page, {
      path: '/api/v1/alert-rules/tip',
      method: 'PUT',
      status: 400,
      message: "variation 'x': weight must be 0 to 1000",
      hint: 'Pick a smaller number.',
    })
    await saveButton(page).click()
    await expect(page.getByText('weight must be 0 to 1000')).toBeVisible()
    await expect(page.getByText('Pick a smaller number.')).toBeVisible()
    await expect(saveButton(page)).toBeEnabled()
  })

  test('keyboard can reach and flip the interrupt switch; no axe violations', async ({ page }) => {
    await open(page, 'alerts/tip')
    const sw = page.getByRole('switch', { name: 'Interrupt the alert on screen' })
    await sw.focus()
    await page.keyboard.press('Space')
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    const r = await new AxeBuilder({ page })
      // The Message section's h3 under the page's h1 predates these controls.
      .disableRules(['heading-order'])
      .analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(over).toBe(false)
  })
}

test.describe('Alert interrupt and chance at 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test.skip(({ isMobile }) => !!isMobile, 'The phone run has its own block.')
  suite()
})

test.describe('Alert interrupt and chance at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test.skip(({ isMobile }) => !isMobile, 'Runs in the phone project.')
  suite()
})
