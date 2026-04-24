import { expect, test } from '@playwright/test'
import { sitemapPaths } from './pages'

for (const path of sitemapPaths()) {
  test(`no sideways scroll at 375 px on ${path}`, async ({ page }) => {
    await page.goto(path)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('the mobile menu opens, traps nothing, and closes with Escape', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: 'Menu' })
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await btn.click()
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  const menu = page.getByRole('navigation', { name: 'Main mobile' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await btn.click()
  await menu.getByRole('link', { name: 'Pricing' }).click()
  await expect(page).toHaveURL(/\/pricing\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Free forever')
})

test('form controls and tap targets are big enough', async ({ page }) => {
  await page.goto('/')
  for (const name of ['Menu', /Switch to (light|dark) theme/]) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  }
})

for (const path of ['/', '/pricing/', '/compare/']) {
  test(`screenshot ${path} at 375`, async ({ page }, testInfo) => {
    await page.goto(path, { waitUntil: 'networkidle' })
    await page.evaluate(() =>
      document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')),
    )
    const name = path === '/' ? 'home' : path.replace(/\//g, '')
    await page.screenshot({ path: testInfo.outputPath(`${name}-375.png`), fullPage: true })
  })
}
