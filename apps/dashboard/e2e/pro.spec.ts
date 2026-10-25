import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fault, open } from './helpers'

const panel = (page: import('@playwright/test').Page) => page.locator('#settings-pro')

test.describe('settings: Ferrocast Pro', () => {
  test('shows Pro as not on sale yet, calmly, with nothing to buy', async ({ page }) => {
    await open(page, 'settings/pro')
    const pro = panel(page)
    await expect(pro.getByRole('heading', { name: 'Ferrocast Pro' })).toBeVisible()
    await expect(pro.getByTestId('pro-summary')).toHaveText(/launches after version 1/)
    await expect(pro.getByText('Free', { exact: true })).toBeVisible()
    await expect(pro.getByRole('button', { name: 'Continue to Razorpay' })).toHaveCount(0)
    await expect(pro.getByRole('button', { name: 'Manage' })).toHaveCount(0)
    await pro.getByRole('button', { name: 'Check again' }).click()
    await expect(pro.getByTestId('pro-summary')).toHaveText(/launches after version 1/)
  })

  test('restore moves Pro here, then Manage opens the manage page', async ({ page }) => {
    await open(page, 'settings/pro')
    const pro = panel(page)
    await pro.getByText('Already have Pro? Move it to this PC').click()
    await pro.getByLabel('Subscription id').fill('sub_Wrong0000')
    await pro.getByLabel('Email you used at checkout').fill('streamer@example.com')
    await pro.getByRole('button', { name: 'Move Pro here' }).click()
    await expect(
      page.getByText('We couldn’t find Ferrocast Pro with that subscription id and email.'),
    ).toBeVisible()
    await pro.getByLabel('Subscription id').fill('sub_DemoPro00001')
    await pro.getByRole('button', { name: 'Move Pro here' }).click()
    // Pro just turned on here: the one-time unlock, then the app stays Pro.
    const unlock = page.getByTestId('pro-unlock')
    await expect(unlock.getByRole('heading', { name: 'You’re Pro' })).toBeVisible()
    await unlock.getByRole('button', { name: 'Done' }).click()
    await expect(unlock).toHaveCount(0)
    await expect(pro.getByTestId('pro-summary')).toHaveText(/is active\. Renews on/)
    // The subscription's id is an internal code: not shown once Pro is on.
    await expect(pro.getByText('sub_DemoPro00001')).toHaveCount(0)
    await pro.getByRole('button', { name: 'Manage' }).click()
    const link = pro.getByRole('link', { name: 'Open the manage page' })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
  })

  test('a relay error reaches the streamer as a message and what to do', async ({ page }) => {
    await open(page, 'settings/pro')
    await fault(page, {
      path: '/api/v1/pro/refresh',
      method: 'POST',
      status: 502,
      code: 'relay_unreachable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again.',
    })
    await panel(page).getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByText('Couldn’t reach the Ferrocast relay.')).toBeVisible()
    await expect(page.getByText('Check your internet connection and try again.')).toBeVisible()
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'settings/pro')
    await expect(panel(page).getByTestId('pro-summary')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#settings-pro').analyze()
    expect(r.violations).toEqual([])
  })
})
