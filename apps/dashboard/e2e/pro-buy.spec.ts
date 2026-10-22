import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open, settled } from './helpers'

const panel = (page: Page) => page.locator('#settings-pro')
const ON_SALE = 'autoplay=0&latency=0&pro=open&pro_features=on'

/** Steps 1 and 2 with a good email, ending on the receipt. */
async function toReview(page: Page, plan: 'Monthly' | 'Yearly' = 'Yearly') {
  const pro = panel(page)
  await pro.getByRole('radio', { name: new RegExp(plan) }).click()
  await pro.getByRole('button', { name: 'Continue' }).click()
  await pro.getByLabel('Email', { exact: true }).fill('noor.plays@example.com')
  await pro.getByRole('button', { name: 'Review' }).click()
  await expect(pro.getByRole('heading', { name: 'Check and pay' })).toBeFocused()
}

test.describe('settings: buying Pro in three steps', () => {
  test('plan, receipts, review, pay, then Pro turns on by itself', async ({ page, context }) => {
    await open(page, 'settings/pro', ON_SALE)
    const pro = panel(page)
    await expect(pro.getByRole('heading', { name: /Pro adds the always-on parts/ })).toBeVisible()
    await expect(pro.getByText('Free plan')).toBeVisible()
    await expect(pro.getByText('Step 1 of 3')).toBeVisible()
    // Both prices at once, yearly picked, with what it saves.
    const yearly = pro.getByRole('radio', { name: /Yearly/ })
    await expect(yearly).toHaveAttribute('aria-checked', 'true')
    await expect(yearly).toContainText('₹1,999')
    await expect(yearly).toContainText('Save ₹389')
    await expect(yearly).toContainText('About ₹167 a month')
    await expect(pro.getByRole('radio', { name: /Monthly/ })).toContainText('₹199')
    for (const f of [
      'YouTube from the cloud',
      'Smart moderation',
      'Smart replies and a written recap',
      'A year of insights',
      '24/7 cloud bot',
      'Dashboard from anywhere',
      'Ferrocast voices',
      'Cloud backups',
      'Discord bot',
      'Weekly email and tip page extras',
    ])
      await expect(pro.getByText(f, { exact: true })).toBeVisible()
    // Arrow keys move the choice.
    await yearly.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(pro.getByRole('radio', { name: /Monthly/ })).toBeFocused()
    await expect(pro.getByRole('radio', { name: /Monthly/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('ArrowRight')
    await pro.getByRole('button', { name: 'Continue' }).click()

    // Receipts: checked before anything is sent.
    await expect(pro.getByRole('heading', { name: 'Where should receipts go?' })).toBeFocused()
    await pro.getByRole('button', { name: 'Review' }).click()
    await expect(pro.getByText('Add an email so we can send your receipt.')).toBeVisible()
    await pro.getByLabel('Email', { exact: true }).fill('noor@plays')
    await pro.getByRole('button', { name: 'Review' }).click()
    await expect(pro.getByText(/That email looks incomplete/)).toBeVisible()
    await pro.getByLabel('Email', { exact: true }).fill('noor.plays@example.com')
    await pro.getByRole('button', { name: 'Review' }).click()

    // Review: a receipt to check.
    const receipt = pro.getByTestId('pro-receipt')
    await expect(receipt).toContainText('Ferrocast Pro, yearly')
    await expect(receipt).toContainText('noor.plays@example.com')
    await expect(receipt).toContainText('Today')
    // Back keeps what was typed.
    await pro.getByRole('button', { name: 'Back' }).click()
    await expect(pro.getByLabel('Email', { exact: true })).toHaveValue('noor.plays@example.com')
    await pro.getByRole('button', { name: 'Review' }).click()

    // Pay opens Razorpay's page outside the dashboard and waits here.
    const popup = context.waitForEvent('page')
    await pro.getByRole('button', { name: 'Pay ₹1,999 on Razorpay' }).click()
    await (await popup).close()
    await expect(pro.getByRole('heading', { name: 'Finish paying in your browser' })).toBeVisible()
    const again = pro.getByRole('link', { name: 'Open checkout again' })
    await expect(again).toHaveAttribute('target', '_blank')
    await pro.getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByText('Not paid yet.')).toBeVisible()

    // Razorpay says paid: the waiting screen notices on its own.
    await demo(page, '(d) => d.setPro({ paid: true })')
    const unlock = page.getByTestId('pro-unlock')
    await expect(unlock.getByRole('heading', { name: 'You’re Pro' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(unlock.getByRole('link', { name: 'Set up the cloud bot' })).toBeVisible()
    await unlock.getByRole('button', { name: 'Later' }).click()
    await expect(pro.getByRole('heading', { name: 'Pro is on' })).toBeVisible()
    await expect(pro.getByTestId('pro-summary')).toContainText('Pro (yearly) is active')
    await expect(pro.getByTestId('pro-summary')).toContainText('noor.plays@example.com')
    await expect(pro.getByRole('button', { name: 'Manage' })).toBeVisible()
    await expect(pro.getByText('Already have Pro? Move it to this PC')).toHaveCount(0)

    // The app stays Pro: the account chip and Home's welcome strip.
    await page.goto(`./?${ON_SALE}#/home`)
    await expect(page.getByTestId('pro-welcome')).toContainText('Pro is on')
    await expect(page.getByTestId('pro-unlock')).toHaveCount(0)
  })

  test('the unlock plays once, and the welcome strip can be hidden', async ({ page }) => {
    await open(page, 'home', 'autoplay=0&latency=0&pro=active&pro_features=on&unlock=1')
    const unlock = page.getByTestId('pro-unlock')
    await expect(unlock.getByRole('heading', { name: 'You’re Pro' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(unlock).toHaveCount(0)
    const welcome = page.getByTestId('pro-welcome')
    await expect(welcome).toContainText('Pro is on. Three things worth setting up')
    await expect(welcome.getByRole('link', { name: 'Cloud bot' })).toHaveAttribute('href', '#/bot')
    await expect(welcome.getByRole('link', { name: 'Discord roles' })).toHaveAttribute(
      'href',
      '#/settings/discord',
    )
    await expect(welcome.getByRole('link', { name: 'Backups' })).toHaveAttribute(
      'href',
      '#/settings/data',
    )
    await page.reload()
    await expect(page.locator('#main')).toBeVisible()
    await expect(page.getByTestId('pro-welcome')).toBeVisible()
    await expect(page.getByTestId('pro-unlock')).toHaveCount(0)
    await page.getByTestId('pro-welcome').getByRole('button', { name: 'Hide this' }).click()
    await expect(page.getByTestId('pro-welcome')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('#main')).toBeVisible()
    await expect(page.getByTestId('pro-welcome')).toHaveCount(0)
  })

  test('nothing Pro shows on the free app', async ({ page }) => {
    await open(page, 'home', ON_SALE)
    await expect(page.getByTestId('pro-welcome')).toHaveCount(0)
    await expect(page.getByTestId('pro-account')).toHaveCount(0)
    await expect(page.getByTestId('pro-seam')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Ferrocast Pro is on' })).toHaveCount(0)
  })

  test('a checkout error reaches the streamer with what to do, and stays on the receipt', async ({
    page,
  }) => {
    await open(page, 'settings/pro', ON_SALE)
    await toReview(page)
    await fault(page, {
      path: '/api/v1/pro/checkout',
      method: 'POST',
      status: 503,
      code: 'billing_unavailable',
      message: 'Ferrocast can’t take payments right now.',
      hint: 'Try again in a few minutes. Nothing was charged.',
    })
    await panel(page)
      .getByRole('button', { name: /Pay .* on Razorpay/ })
      .click()
    await expect(page.getByText('Ferrocast can’t take payments right now.')).toBeVisible()
    await expect(page.getByText('Try again in a few minutes. Nothing was charged.')).toBeVisible()
    await expect(panel(page).getByTestId('pro-receipt')).toBeVisible()
  })

  test('an email the relay refuses goes back to the email step with its words', async ({
    page,
  }) => {
    await open(page, 'settings/pro', ON_SALE)
    await toReview(page, 'Monthly')
    await fault(page, {
      path: '/api/v1/pro/checkout',
      method: 'POST',
      status: 422,
      code: 'invalid_email',
      message: 'That email address doesn’t look right.',
      hint: 'Use the address where you want Razorpay’s receipts.',
    })
    await panel(page).getByRole('button', { name: 'Pay ₹199 on Razorpay' }).click()
    await expect(
      panel(page).getByRole('heading', { name: 'Where should receipts go?' }),
    ).toBeVisible()
    await expect(panel(page).getByRole('alert')).toContainText(
      'That email address doesn’t look right.',
    )
  })

  test('a test grant shows, and Manage hides once it has ended', async ({ page }) => {
    await open(page, 'home', 'autoplay=0&latency=0')
    await demo(page, "(d) => d.setPro({ testGrant: 'active' })")
    await page.evaluate(() => (location.hash = '#/settings/pro'))
    const pro = panel(page)
    // It is Pro on this PC, so the unlock plays once.
    await page.getByTestId('pro-unlock').getByRole('button', { name: 'Done' }).click()
    await expect(pro.getByTestId('pro-summary')).toContainText('Test Pro is on until')
    await expect(pro.getByRole('button', { name: 'Manage' })).toHaveCount(0)
    await demo(page, "(d) => d.setPro({ testGrant: 'ended', salesOpen: true })")
    await pro.getByRole('button', { name: 'Check again' }).click()
    await expect(pro.getByTestId('pro-summary')).toHaveText('Your test Pro has ended.')
    await expect(pro.getByRole('button', { name: 'Manage' })).toHaveCount(0)
    // A real subscription can still be bought or moved here.
    await expect(pro.getByRole('heading', { name: /Pro adds the always-on parts/ })).toBeVisible()
    await expect(pro.getByText('Already have Pro? Move it to this PC')).toBeVisible()
  })

  test('on the free app, Check again picks up Pro given elsewhere', async ({ page }) => {
    await open(page, 'settings/pro', ON_SALE)
    const pro = panel(page)
    await expect(pro.getByTestId('pro-summary')).toContainText('You’re on the free app')
    await demo(page, "(d) => d.setPro({ testGrant: 'active' })")
    await pro.getByRole('button', { name: 'Check again' }).click()
    await expect(pro.getByTestId('pro-summary')).toContainText('Test Pro is on until')
  })

  test('has no accessibility violations on each step', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'settings/pro', ON_SALE)
    const pro = panel(page)
    const axe = async () => {
      await settled(page)
      const r = await new AxeBuilder({ page }).include('#settings-pro').analyze()
      expect(r.violations).toEqual([])
    }
    await expect(pro.getByRole('heading', { name: /Pro adds the always-on parts/ })).toBeVisible()
    await axe()
    await toReview(page)
    await axe()
    await pro.getByRole('button', { name: /Pay/ }).click()
    await expect(pro.getByRole('heading', { name: 'Finish paying in your browser' })).toBeVisible()
    await axe()
  })
})
