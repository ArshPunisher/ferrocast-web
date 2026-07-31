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

test('theme switch: System, Light and Dark; a choice is remembered and never flashes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const theme = page.getByRole('group', { name: 'Theme' })
  await expect(theme.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
  await theme.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(242, 243, 246)')
  await expect(theme.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
  // back to System: follows the OS again and forgets the saved choice
  await theme.getByRole('button', { name: 'System' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  expect(await page.evaluate(() => localStorage.getItem('fc-theme'))).toBeNull()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(10, 11, 13)',
  )
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(242, 243, 246)',
  )
  await theme.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('reduced motion: videos never autoplay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/features/')
  await page.locator('.video-slot').first().scrollIntoViewIfNeeded()
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
  await page.goto('/features/')
  const slot = page.locator('.video-slot').first()
  await slot.scrollIntoViewIfNeeded()
  const video = slot.locator('video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  await slot.getByRole('button', { name: /^Pause video/ }).click()
  await expect(slot.getByRole('button', { name: /^Play video/ })).toBeVisible()
  await page.mouse.wheel(0, 2000)
  await slot.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
})

test('ban demo: spam leaves all three chats at once, then the pill confirms', async ({ page }) => {
  await page.goto('/')
  const stage = page.locator('[data-ban]')
  await stage.scrollIntoViewIfNeeded()
  await expect(stage).toHaveClass(/spam-in/, { timeout: 6000 })
  await expect(stage).toHaveClass(/banned/, { timeout: 8000 })
  // the three spam rows go in the same frame, and the pill shows
  const states = await stage.evaluate((el) =>
    [...el.querySelectorAll('.spam')].map((r) => getComputedStyle(r).transitionDelay),
  )
  expect(new Set(states).size).toBe(1)
  await expect(stage.locator('.pill')).toHaveCSS('opacity', '1')
  // it can be paused (WCAG 2.2.2)
  await page.getByRole('button', { name: 'Pause the ban demo' }).click()
  await expect(page.getByRole('button', { name: 'Play the ban demo' })).toBeVisible()
})

test('ban demo: reduced motion shows the finished state, without a pause button', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const stage = page.locator('[data-ban]')
  await expect(stage).toHaveClass(/banned/)
  await expect(page.locator('[data-ban-pause]')).toBeHidden()
})

test('spark line: section dots are links and the current one is marked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const rail = page.getByRole('navigation', { name: 'Sections on this page' })
  await expect(rail).toHaveClass(/fc-spark/)
  await expect(rail.getByRole('link')).toHaveCount(8)
  await page.evaluate(() =>
    window.scrollTo({
      top: (document.querySelector('#moderation') as HTMLElement).offsetTop,
      behavior: 'instant',
    }),
  )
  await expect(rail.getByRole('link', { name: 'Moderation' })).toHaveAttribute(
    'aria-current',
    'location',
  )
  await rail.getByRole('link', { name: 'Tips' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#tips$/)
})

test('signal dial: on narrower screens a corner knob opens the section list', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/')
  await expect(page.locator('.fc-spark')).toBeHidden()
  // out of the way over the hero, in once you scroll
  const knob = page.getByRole('button', { name: /Sections\. Now reading/ })
  await expect(knob).toBeHidden()
  await page.evaluate(() =>
    window.scrollTo({
      top: (document.querySelector('#moderation') as HTMLElement).offsetTop,
      behavior: 'instant',
    }),
  )
  await expect(knob).toBeVisible()
  await expect(knob).toHaveAccessibleName(/Moderation/)
  await knob.click()
  await expect(knob).toHaveAttribute('aria-expanded', 'true')
  const menu = page.locator('#fc-dial-menu')
  await expect(menu.getByRole('link')).toHaveCount(8)
  await expect(menu.getByRole('link', { name: /Moderation/ })).toHaveAttribute(
    'aria-current',
    'location',
  )
  await page.keyboard.press('Escape')
  await expect(knob).toHaveAttribute('aria-expanded', 'false')
  await expect(knob).toBeFocused()
  await knob.click()
  await menu.getByRole('link', { name: /Tips/ }).click()
  await expect(page).toHaveURL(/#tips$/)
  await expect(knob).toHaveAttribute('aria-expanded', 'false')
})

test('3D never sits behind text: no full-page canvas, every station is its own box', async ({
  page,
}) => {
  await page.goto('/')
  // the old scroll ruler, rotating sidebar, strand rail and fixed full-screen stage are gone
  await expect(page.locator('.fc-ruler, .fc-side, .fc-stage, .fc-rail')).toHaveCount(0)
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const overlaps = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-station]')].map((s) =>
        s.getBoundingClientRect(),
      )
      const texts = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li')]
        .filter((t) => !t.closest('[data-station]'))
        .map((t) => ({ t: (t.textContent ?? '').slice(0, 40), r: t.getBoundingClientRect() }))
      const hit: string[] = []
      for (const b of boxes)
        for (const { t, r } of texts)
          if (
            r.width &&
            r.height &&
            r.left < b.right - 1 &&
            r.right > b.left + 1 &&
            r.top < b.bottom - 1 &&
            r.bottom > b.top + 1
          )
            hit.push(t)
      return hit
    })
    expect(overlaps, `at ${width}px`).toEqual([])
  }
})
