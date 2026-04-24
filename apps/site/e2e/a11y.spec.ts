import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  '/',
  '/pricing/',
  '/compare/',
  '/faq/',
  '/contact/',
  '/features/alerts/',
  '/download/',
  '/docs/getting-started/',
  '/privacy/',
]

for (const scheme of ['dark', 'light'] as const) {
  for (const path of pages) {
    test(`axe ${scheme} ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.evaluate(() =>
        document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')),
      )
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([])
    })
  }
}

test('keyboard: skip link, then the main nav', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('theme toggle switches, remembers, and never flashes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(242, 243, 246)')
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
})

test('reduced motion: videos never autoplay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('#alerts').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const playing = await page.evaluate(() =>
    [...document.querySelectorAll('video')].some((v) => !v.paused),
  )
  expect(playing).toBe(false)
})

for (const [path, name] of [
  ['/', 'home'],
  ['/pricing/', 'pricing'],
  ['/compare/', 'compare'],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`screenshot ${name} 1440 ${scheme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.evaluate(() =>
        document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')),
      )
      await page.waitForTimeout(600)
      await page.screenshot({
        path: testInfo.outputPath(`${name}-1440-${scheme}.png`),
        fullPage: true,
      })
    })
  }
}

test('every looping video can be paused and stays paused', async ({ page }) => {
  await page.goto('/')
  await page.locator('#alerts').scrollIntoViewIfNeeded()
  const video = page.locator('#alerts video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  const btn = page.locator('#alerts').getByRole('button', { name: 'Pause video' })
  await btn.click()
  await expect(page.locator('#alerts').getByRole('button', { name: 'Play video' })).toBeVisible()
  await page.mouse.wheel(0, 2000)
  await page.locator('#alerts').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
})
