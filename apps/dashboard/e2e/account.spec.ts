import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const bar = (page: import('@playwright/test').Page) => page.getByTestId('account-bar')

test.describe('Ferrocast account', () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test('signs in through the browser from the sidebar, then the menu signs out', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // The desktop app hands sign-in pages to the browser; here a new window stands in.
      window.open = (() => null) as typeof window.open
    })
    await open(page, 'home')
    await expect(bar(page)).toHaveAttribute('data-state', 'signed_out')
    await expect(page.getByTestId('get-pro')).toBeVisible()
    await bar(page)
      .getByRole('button', { name: /Sign in/ })
      .click()
    await expect(bar(page)).toHaveAttribute('data-state', 'pending')
    await expect(bar(page).getByText('Finish in browser')).toBeVisible()
    // The demo's browser comes back by itself.
    await expect(bar(page)).toHaveAttribute('data-state', 'signed_in')
    const acct = bar(page).getByRole('button', { name: /Kabir Sethi/ })
    await acct.click()
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(
      menu
        .getByRole('menuitem', { name: 'Light theme' })
        .or(menu.getByRole('menuitem', { name: 'Dark theme' })),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(acct).toBeFocused()
    await acct.click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(bar(page)).toHaveAttribute('data-state', 'signed_out')
  })

  test('cancel stops waiting for the browser', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = (() => null) as typeof window.open
    })
    await open(page, 'home', 'autoplay=0&latency=0')
    await bar(page)
      .getByRole('button', { name: /Sign in/ })
      .click()
    await bar(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(bar(page)).toHaveAttribute('data-state', 'signed_out')
  })

  test('Get Pro opens the plans page with both plans and Continue in browser', async ({ page }) => {
    await open(page, 'home', 'autoplay=0&latency=0&pro=open')
    await page.getByTestId('get-pro').click()
    await expect(page).toHaveURL(/#\/plans$/)
    await expect(page.getByRole('heading', { name: 'Ferrocast Pro' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Yearly/ })).toBeChecked()
    await page.getByText('Monthly', { exact: true }).click()
    await expect(page.getByRole('radio', { name: /Monthly/ })).toBeChecked()
    await expect(page.getByTestId('plans-continue')).toBeVisible()
    await expect(page.getByText('You’ll sign in first')).toBeVisible()
    await expect(page.getByLabel('Have a code?')).toBeVisible()
    const a11y = await new AxeBuilder({ page }).include('#main').analyze()
    expect(a11y.violations).toEqual([])
  })

  test('the Account page: Pro header, billing, devices, sign out a device', async ({ page }) => {
    await open(page, 'account', 'autoplay=0&latency=0&pro=active&account=signed_in')
    const pageEl = page.getByTestId('account-page')
    await expect(pageEl.getByRole('heading', { name: 'Kabir Sethi' })).toBeVisible()
    await expect(pageEl.locator('header[data-pro]')).toBeVisible()
    await expect(pageEl.getByRole('heading', { name: 'Plan and billing' })).toBeVisible()
    await expect(pageEl.getByText('This device', { exact: true })).toBeVisible()
    await pageEl.getByRole('button', { name: 'Sign out Safari on iPhone' }).click()
    await expect(page.getByText('That device is signed out.')).toBeVisible()
    await expect(pageEl.getByText('Safari on iPhone')).toHaveCount(0)
    await pageEl.getByRole('button', { name: 'Sign out everywhere else' }).click()
    await page.getByRole('button', { name: 'Sign them out' }).click()
    await expect(page.getByText('Signed out everywhere else.')).toBeVisible()
    await expect(pageEl.getByRole('button', { name: 'Sign out everywhere else' })).toHaveCount(0)
    const a11y = await new AxeBuilder({ page }).include('#main').analyze()
    expect(a11y.violations).toEqual([])
  })

  test('free account at 375px: See Pro plans, no billing, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'account', 'autoplay=0&latency=0&account=signed_in')
    const pageEl = page.getByTestId('account-page')
    await expect(pageEl.getByText('Free plan')).toBeVisible()
    await expect(pageEl.getByRole('link', { name: 'See Pro plans' })).toBeVisible()
    await expect(pageEl.getByRole('heading', { name: 'Plan and billing' })).toHaveCount(0)
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(sideways).toBe(false)
  })

  test('signed out, the Account page offers sign-in', async ({ page }) => {
    await open(page, 'account')
    await expect(page.getByRole('heading', { name: 'Your Ferrocast account' })).toBeVisible()
    await expect(
      page.getByTestId('account-page').getByRole('button', { name: 'Sign in' }),
    ).toBeVisible()
  })
})
