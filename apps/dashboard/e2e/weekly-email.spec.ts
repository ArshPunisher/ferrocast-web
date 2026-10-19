import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro's weekly email: the card at the end of `#/history`.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const card = (page: Page) => page.locator('#weekly-email')

async function openCard(page: Page, state?: Record<string, unknown>) {
  await open(page, 'home', PRO)
  // The demo keeps its state across hash changes: always say which one.
  const s = state ?? { status: 'none' }
  await page.evaluate((x) => window.__ferrocastDemo?.setWeeklyEmail(x as never), s)
  await page.evaluate(() => (location.hash = '#/history'))
  await expect(card(page)).toBeVisible()
}

test.describe('Weekly email', () => {
  // The relay's day (UTC) is the same weekday in India.
  test.use({ timezoneId: 'Asia/Kolkata' })

  test('save, check your inbox, resend, then on and stop', async ({ page }) => {
    await openCard(page)
    const c = card(page)
    await expect(c.getByText('Your week, in your inbox')).toBeVisible()
    const input = c.getByLabel('Email address')
    // A typo is caught before anything is sent.
    await input.fill('asha@gmail')
    await c.getByRole('button', { name: 'Save' }).click()
    await expect(c.getByRole('alert')).toContainText('doesn’t look right')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await input.fill('asha@gmail.com')
    await c.getByRole('button', { name: 'Save' }).click()
    await expect(c.getByTestId('weekly-email-pending')).toBeVisible()
    await expect(c.getByText('Check your inbox')).toBeVisible()
    await expect(c.getByText('a•••@gmail.com')).toBeVisible()
    await c.getByRole('button', { name: 'Resend' }).click()
    await expect(page.getByText('Sent again. Check your inbox.')).toBeVisible()
    // The link's Confirm button pressed (in the email): the card shows it when opened again.
    await page.evaluate(() => window.__ferrocastDemo?.setWeeklyEmail({ confirm: true }))
    await page.evaluate(() => (location.hash = '#/home'))
    await page.evaluate(() => (location.hash = '#/history'))
    await expect(c.getByTestId('weekly-email-on')).toBeVisible()
    await expect(c.getByText('Weekly email is on')).toBeVisible()
    await expect(c.getByText(/Every Monday to/)).toBeVisible()
    await c.getByRole('button', { name: 'Stop emails' }).click()
    await expect(page.getByText('Weekly emails stopped. The address is deleted.')).toBeVisible()
    await expect(c.getByLabel('Email address')).toBeVisible()
  })

  test('the same address again and too many confirm emails say what to do', async ({ page }) => {
    await openCard(page, { status: 'on', address: 'asha@gmail.com' })
    const c = card(page)
    await c.getByRole('button', { name: 'Change address' }).click()
    await c.getByLabel('Email address').fill('asha@gmail.com')
    await c.getByRole('button', { name: 'Send link' }).click()
    await expect(c.getByRole('alert')).toContainText('already go to that address')
    await c.getByRole('button', { name: 'Keep the current address' }).click()
    await expect(c.getByTestId('weekly-email-on')).toBeVisible()

    await page.evaluate(() => window.__ferrocastDemo?.setWeeklyEmail({ sentToday: 3 }))
    await c.getByRole('button', { name: 'Change address' }).click()
    await c.getByLabel('Email address').fill('new@example.com')
    await c.getByRole('button', { name: 'Send link' }).click()
    const alert = c.getByRole('alert')
    await expect(alert).toContainText('3 confirm emails today')
    await expect(alert).toContainText('spam')
  })

  test('a refused address shows as paused', async ({ page }) => {
    await openCard(page, { status: 'paused', address: 'old@example.com' })
    const c = card(page)
    await expect(c.getByTestId('weekly-email-paused')).toBeVisible()
    await expect(c.getByText('o•••@example.com')).toBeVisible()
    await expect(c.getByText('refused our email')).toBeVisible()
    await c.getByRole('button', { name: 'Use another address' }).click()
    await expect(c.getByLabel('Email address')).toBeVisible()
  })

  test('a new address waits while the confirmed one keeps going', async ({ page }) => {
    await openCard(page, { status: 'on', address: 'asha@gmail.com' })
    const c = card(page)
    await c.getByRole('button', { name: 'Change address' }).click()
    await c.getByLabel('Email address').fill('new@example.com')
    await c.getByRole('button', { name: 'Send link' }).click()
    await expect(c.getByTestId('weekly-email-on')).toBeVisible()
    const waiting = c.getByTestId('weekly-email-waiting')
    await expect(waiting).toContainText('Waiting for n•••@example.com to be confirmed')
    await expect(waiting).toContainText('reports keep going to a•••@gmail.com')
    await expect(waiting.getByRole('button', { name: 'Resend' })).toBeVisible()
  })

  test('a paused address says why, even when it can’t be shown', async ({ page }) => {
    await openCard(page, { status: 'paused', pausedReason: 'unreadable', noHint: true })
    const c = card(page)
    await expect(c.getByText('Ferrocast couldn’t read the saved address')).toBeVisible()
    await expect(c.getByText('null')).toHaveCount(0)
    await c.getByRole('button', { name: 'Save your address again' }).click()
    await expect(c.getByLabel('Email address')).toBeVisible()
    await openCard(page, { status: 'pending', address: 'x@y.co', noHint: true })
    await expect(c.getByText('We sent a link to your address.')).toBeVisible()
  })

  test('402 from the relay says what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      path: '/api/v1/pro/history/email',
      method: 'GET',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
      times: 1,
    })
    await page.evaluate(() => (location.hash = '#/history'))
    const alert = card(page).getByRole('alert')
    await expect(alert).toContainText('part of Pro')
    await expect(alert).toContainText('Settings › Pro')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(card(page).getByLabel('Email address')).toBeVisible()
  })

  test('the relay offline says so, and saving keeps the form', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      path: '/api/v1/pro/history/email',
      method: 'GET',
      status: 502,
      code: 'relay_unreachable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again.',
      times: 1,
    })
    await page.evaluate(() => (location.hash = '#/history'))
    await expect(card(page).getByRole('alert')).toContainText('Couldn’t reach the Ferrocast relay')
    await card(page).getByRole('button', { name: 'Try again' }).click()
    const c = card(page)
    await fault(page, {
      path: '/api/v1/pro/history/email',
      method: 'PUT',
      status: 502,
      code: 'mail_failed',
      message: 'The confirm email couldn’t be sent right now.',
      hint: 'Try again in a few minutes.',
      times: 1,
    })
    await c.getByLabel('Email address').fill('asha@gmail.com')
    await c.getByRole('button', { name: 'Save' }).click()
    await expect(c.getByRole('alert')).toContainText('couldn’t be sent right now')
    await expect(c.getByLabel('Email address')).toHaveValue('asha@gmail.com')
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await openCard(page, { status: 'pending', address: 'asha@gmail.com' })
    await expect(card(page).getByTestId('weekly-email-pending')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#weekly-email').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Weekly email in another time zone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  // The relay's Monday 04:00 UTC is Sunday evening in Los Angeles: the card says Sunday.
  test('shows the day in the viewer’s own time', async ({ page }) => {
    await openCard(page)
    await expect(card(page).getByText(/every Sunday around/)).toBeVisible()
    await openCard(page, { status: 'on', address: 'asha@gmail.com' })
    await expect(card(page).getByText(/Every Sunday to/)).toBeVisible()
  })
})

test.describe('Weekly email at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fits the phone width in every state', async ({ page }) => {
    for (const state of [
      undefined,
      { status: 'pending', address: 'a.very.long.address.for.testing@streamer-mail.example.com' },
      { status: 'on', address: 'asha@gmail.com' },
      {
        status: 'on',
        address: 'asha@gmail.com',
        pending: 'a.very.long.address.for.testing@streamer-mail.example.com',
      },
      { status: 'paused', pausedReason: 'unreadable', noHint: true },
    ]) {
      await openCard(page, state)
      await card(page).scrollIntoViewIfNeeded()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow, JSON.stringify(state)).toBe(false)
    }
    await openCard(page)
    const button = card(page).getByRole('button', { name: 'Save' })
    const box = await button.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})
