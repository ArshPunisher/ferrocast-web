import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro tip page branding and goal page on the Tips screen (API.md §9.2). The demo starts
// like the real relay today (off sale, no Pro); `?pro=` switches it.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const brand = (page: Page) => page.locator('#tip-brand')
const goal = (page: Page) => page.locator('#tip-goal')
const preview = (page: Page) => page.getByTestId('tip-preview')

/** A 4 × 4 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP438AARwzEcQB+ohfxXaFgBQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('tips: Pro branding and goal', () => {
  test('hidden without Pro, one calm line while on sale', async ({ page }) => {
    await open(page, 'tips')
    await expect(page.locator('#tip-page')).toBeVisible()
    await expect(brand(page)).toHaveCount(0)
    await expect(goal(page)).toHaveCount(0)
    await open(page, 'tips', 'autoplay=0&latency=0&pro=open&pro_features=on')
    await expect(brand(page).getByTestId('pro-line')).toContainText(
      'Runs on Ferrocast’s servers, part of Pro.',
    )
    await expect(goal(page).getByTestId('pro-line')).toBeVisible()
    await expect(brand(page).getByLabel('Background')).toHaveCount(0)
  })

  test('colours: a live contrast note, the preview follows, and Save keeps them', async ({
    page,
  }) => {
    await open(page, 'tips', PRO)
    const b = brand(page)
    await expect(b.getByRole('heading', { name: 'Colours' })).toBeVisible()
    await expect(b.getByTestId('contrast-note')).toHaveText('Easy to read')
    await b.getByLabel('Background', { exact: true }).fill('#202020')
    await b.getByLabel('Text', { exact: true }).fill('#555555')
    await expect(b.getByTestId('contrast-note')).toContainText('Text is hard to read.')
    await expect(preview(page)).toHaveCSS('color', /rgb\(1[3-9]\d|rgb\(2\d\d/)
    await b.getByLabel('Accent', { exact: true }).fill('#zz')
    await expect(b.getByText('Use a hex colour like #3461F5.')).toBeVisible()
    await b.getByLabel('Accent', { exact: true }).fill('#FFA424')
    await b.getByRole('button', { name: 'Save colours' }).click()
    await expect(page.getByText('Colours saved. Your tip page uses them now.')).toBeVisible()
    await expect(b.getByRole('button', { name: 'Save colours' })).toBeDisabled()
    await b.getByRole('button', { name: 'Default colours' }).click()
    await expect(page.getByText('Back to the default colours.')).toBeVisible()
    await expect(b.getByLabel('Background', { exact: true })).toHaveValue('#0c0e12')
  })

  test('pictures: wrong type and too big are refused with the reason, a PNG shows in the preview', async ({
    page,
  }) => {
    await open(page, 'tips', PRO)
    const b = brand(page)
    await b
      .getByTestId('file-avatar')
      .setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
    await expect(b.getByTestId('slot-avatar').getByRole('alert')).toHaveText(
      /Avatars can be PNG, JPEG or WebP\./,
    )
    await b
      .getByTestId('file-avatar')
      .setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(1_000_001) })
    await expect(b.getByTestId('slot-avatar').getByRole('alert')).toHaveText(
      'Avatars can be up to 1 MB.',
    )
    // The engine's answer reaches the slot too (415 from the relay's own check).
    await b
      .getByTestId('file-banner')
      .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('not a png') })
    await expect(b.getByTestId('slot-banner').getByRole('alert')).toContainText(
      'Banners can be PNG, JPEG or WebP.',
    )
    await b
      .getByTestId('file-avatar')
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByText('Avatar saved.')).toBeVisible()
    await expect(b.getByTestId('slot-avatar').getByRole('alert')).toHaveCount(0)
    await expect(preview(page).locator('img')).toHaveCount(1)
    await b.getByRole('button', { name: 'Remove avatar' }).click()
    await expect(preview(page).locator('img')).toHaveCount(0)
  })

  test('a 413 from the relay shows next to the picture', async ({ page }) => {
    await open(page, 'tips', PRO)
    await fault(page, {
      path: '/api/v1/tips/brand/banner',
      method: 'PUT',
      status: 413,
      code: 'too_large',
      message: 'Banners can be up to 3 MB.',
      hint: 'Make the file smaller (or export it as JPEG) and try again.',
    })
    await brand(page)
      .getByTestId('file-banner')
      .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
    await expect(brand(page).getByTestId('slot-banner').getByRole('alert')).toContainText(
      'Banners can be up to 3 MB.',
    )
  })

  test('goal: start one, see progress and the link, then remove it', async ({ page }) => {
    await open(page, 'tips', PRO)
    const g = goal(page)
    await g.getByRole('button', { name: 'Start goal' }).click()
    await expect(g.getByText('The goal title must be 1 to 60 characters.')).toBeVisible()
    await g.getByLabel('Goal', { exact: true }).fill('New microphone')
    await g.getByLabel('Target').fill('10,000')
    await expect(g.getByText('Only tips in INR count. Refunds come off.')).toBeVisible()
    await g.getByRole('button', { name: 'Start goal' }).click()
    await expect(page.getByText('Your goal page is up.')).toBeVisible()
    await expect(g.getByTestId('goal-progress')).toContainText('of ₹10,000')
    await expect(g.getByText(/\/goal$/)).toBeVisible()
    await expect(g.getByRole('button', { name: 'Copy link' })).toBeVisible()
    await expect(g.getByRole('button', { name: 'Copy for OBS' })).toBeVisible()
    await expect(preview(page)).toContainText('New microphone')
    await g.getByLabel('Currency').selectOption('USD')
    await expect(g.getByText('Changing to USD starts the count again.')).toBeVisible()
    await g.getByLabel('Currency').selectOption('INR')
    await g.getByRole('button', { name: 'Remove goal' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Goal page removed.')).toBeVisible()
    await expect(g.getByRole('button', { name: 'Start goal' })).toBeVisible()
  })

  test('402 and offline reach the streamer as plain messages', async ({ page }) => {
    await open(page, 'tips', PRO)
    await fault(page, {
      path: '/api/v1/tips/brand',
      method: 'PUT',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro.',
    })
    const b = brand(page)
    await b.getByLabel('Background', { exact: true }).fill('#111111')
    await b.getByRole('button', { name: 'Save colours' }).click()
    await expect(
      page.getByText('This runs on Ferrocast’s servers and is part of Pro.'),
    ).toBeVisible()
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(true))
    await goal(page).getByLabel('Goal', { exact: true }).fill('Mic')
    await goal(page).getByLabel('Target').fill('500')
    await goal(page).getByRole('button', { name: 'Start goal' }).click()
    await expect(
      page.getByText('Can’t reach Ferrocast.').or(page.getByText("Can't reach Ferrocast.")).first(),
    ).toBeVisible()
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(false))
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'tips', PRO)
    await expect(brand(page).getByRole('heading', { name: 'Colours' })).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#tip-brand').include('#tip-goal').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('tips: Pro sections at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fit the phone width', async ({ page }) => {
    await open(page, 'tips', PRO)
    await expect(brand(page).getByRole('heading', { name: 'Colours' })).toBeVisible()
    await goal(page).scrollIntoViewIfNeeded()
    for (const p of [brand(page), goal(page)]) {
      const box = await p.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })
})
