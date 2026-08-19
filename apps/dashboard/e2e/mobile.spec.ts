import { expect, test } from '@playwright/test'
import { open } from './helpers'

const SCREENS = [
  'home',
  'chat',
  'alerts',
  'alerts/tip',
  'overlays',
  'overlays/ov-main',
  'moderation',
  'bot',
  'tips',
  'settings',
  'community',
  'recap',
  'import',
  'import/streamlabs',
]

test.use({ viewport: { width: 375, height: 812 } })

for (const s of SCREENS) {
  test(`${s} fits a 375 px phone`, async ({ page }) => {
    await open(page, s)
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible()
  })
}

test('a mod can act on a message with one tap', async ({ page }) => {
  await open(page, 'chat')
  const line = page.getByRole('log', { name: 'Merged chat' }).getByRole('listitem').last()
  await line.locator('span[dir=auto]').last().tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: 'Ban everywhere' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Time out 10 minutes' }).tap()
  await expect(page.getByText(/timed out for 10 minutes/)).toBeVisible()
})

test('More opens the rest of the app', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'More' }).tap()
  await page.getByRole('dialog').getByRole('link', { name: 'Overlays' }).tap()
  await expect(page.getByRole('heading', { name: 'Overlays', level: 1 })).toBeVisible()
})

test('panic is reachable from every screen', async ({ page }) => {
  await open(page, 'tips')
  await page.getByRole('button', { name: /^Panic/ }).tap()
  await expect(page.getByText('Panic mode is on.').first()).toBeVisible()
})

test('a tip page and a payment page can be set up on a phone', async ({ page }) => {
  await open(page, 'tips', 'autoplay=0&latency=0&tips=empty')
  await page.getByLabel('Page name').fill('nova')
  await page.getByLabel('Name viewers see').fill('Nova')
  await page.getByRole('button', { name: 'Create tip page' }).tap()
  const setup = page.getByRole('form', { name: 'Razorpay setup' })
  await expect(setup).toBeVisible()
  await expect(setup.getByRole('button', { name: /Copy Razorpay webhook address/ })).toBeVisible()
  await setup.getByLabel('Your Razorpay page link').fill('https://razorpay.me/@nova')
  await setup.getByLabel('Webhook secret').fill('my-rzp-secret-9')
  await setup.getByRole('button', { name: 'Turn on Razorpay' }).tap()
  await expect(page.getByText('Razorpay is on. Its button is on your tip page.')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
