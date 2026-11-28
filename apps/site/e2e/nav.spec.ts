import { expect, test } from '@playwright/test'
import { MENUS } from '../src/data/nav'

const trigger = (page: import('@playwright/test').Page, key: string) =>
  page.locator(`[data-mm-trigger="${key}"]`)

test('hovering a trigger opens its panel; moving to the next one switches; leaving closes', async ({
  page,
}) => {
  await page.goto('/pricing/')
  await trigger(page, 'features').hover()
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'true')
  await expect(
    page.locator('#mm-features').getByRole('link', { name: /Multistream/ }),
  ).toBeVisible()
  await trigger(page, 'usecases').hover()
  await expect(trigger(page, 'usecases')).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'false')
  await page.mouse.move(700, 880)
  await expect(trigger(page, 'usecases')).toHaveAttribute('aria-expanded', 'false')
})

test('keyboard: focus opens a panel, ArrowDown enters it, Escape closes and returns focus', async ({
  page,
}) => {
  await page.goto('/pricing/')
  await page.mouse.move(700, 880)
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    if (await trigger(page, 'features').evaluate((el) => el === document.activeElement)) break
  }
  await expect(trigger(page, 'features')).toBeFocused()
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#mm-features a').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger(page, 'features')).toBeFocused()
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'false')
  // focus returning to the trigger must not reopen it
  await page.waitForTimeout(150)
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'false')
})

test('a panel that holds keyboard focus stays open when the mouse leaves; unfocused hover still closes', async ({
  page,
}) => {
  await page.goto('/pricing/')
  await trigger(page, 'features').hover()
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'true')
  await trigger(page, 'features').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#mm-features a').first()).toBeFocused()
  await page.mouse.move(700, 880)
  await page.waitForTimeout(500)
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#mm-features a').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger(page, 'features')).toHaveAttribute('aria-expanded', 'false')
  // no focus inside: moving away closes it as before
  await trigger(page, 'resources').hover()
  await expect(trigger(page, 'resources')).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.move(700, 880)
  await expect(trigger(page, 'resources')).toHaveAttribute('aria-expanded', 'false')
})

test('a click on a trigger keeps the panel open after the hover; a second click closes it', async ({
  page,
}) => {
  await page.goto('/pricing/')
  await trigger(page, 'resources').click()
  await expect(trigger(page, 'resources')).toHaveAttribute('aria-expanded', 'true')
  await trigger(page, 'resources').click()
  await expect(trigger(page, 'resources')).toHaveAttribute('aria-expanded', 'false')
})

test('every menu link goes to a real page', async ({ page, request }) => {
  await page.goto('/')
  const hrefs = new Set<string>()
  for (const m of MENUS)
    for (const g of m.groups) for (const i of g.items) if (!i.external) hrefs.add(i.href)
  for (const href of hrefs) {
    const [path, hash] = href.split('#')
    const res = await request.get(path ?? '/')
    expect(res.status(), href).toBe(200)
    if (hash) expect(await res.text(), href).toContain(`id="${hash}"`)
  }
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the drawer opens, shows the accordions, closes with Escape and returns focus', async ({
    page,
  }) => {
    await page.goto('/pricing/')
    const burger = page.locator('[data-mm-burger]')
    await expect(page.locator('[data-mm-drawer]')).toBeHidden()
    await burger.click()
    await expect(burger).toHaveAttribute('aria-expanded', 'true')
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Use cases' }).click()
    await expect(drawer.getByRole('link', { name: /Gaming/ })).toBeVisible()
    await expect(drawer.getByRole('link', { name: /Docs/ })).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(burger).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
