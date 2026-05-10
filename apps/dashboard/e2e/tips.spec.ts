import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fault, open } from './helpers'

const EMPTY = 'autoplay=0&latency=0&tips=empty'

/** Presses Tab until `target` has focus (keyboard-only flows). */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

const pagePanel = (page: Page) => page.locator('#tip-page')
const providers = (page: Page) => page.locator('#tip-providers')

async function createPage(page: Page, handle = 'nova', name = 'Nova'): Promise<void> {
  await page.getByLabel('Page name').fill(handle)
  await page.getByLabel('Name viewers see').fill(name)
  await page.getByRole('button', { name: 'Create tip page' }).click()
  await expect(page.getByText('Your tip page is up', { exact: true })).toBeVisible()
}

test.describe('tips: first-time setup', () => {
  test('two fields make the page, then Razorpay takes three steps', async ({ page }) => {
    await open(page, 'tips', EMPTY)
    await expect(page.getByRole('heading', { name: 'Create your tip page' })).toBeVisible()
    // No webhook addresses before the first save: the providers are locked.
    await expect(providers(page).getByRole('button')).toHaveCount(0)
    await expect(providers(page)).toContainText('Create your tip page first')

    await page.getByLabel('Page name').fill('  NoVa ')
    await page.getByLabel('Name viewers see').fill('Nova')
    await expect(pagePanel(page)).toContainText('/t/nova')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    await expect(page.getByText('Your tip page is up. Now add a way to pay.')).toBeVisible()
    // The server's normalised name comes back into the field.
    await expect(page.getByLabel('Page name')).toHaveValue('nova')
    await expect(pagePanel(page).locator('code')).toHaveText(/\/t\/nova$/)
    await expect(pagePanel(page).getByRole('link', { name: /Open/ })).toHaveAttribute(
      'href',
      /\/t\/nova$/,
    )

    // Razorpay opens by itself, with its webhook address and events.
    const setup = page.getByRole('form', { name: 'Razorpay setup' })
    await expect(setup).toBeVisible()
    await expect(setup).toContainText(/\/v1\/tips\/razorpay\//)
    for (const e of [
      'payment.captured',
      'payment_link.paid',
      'refund.processed',
      'payment.dispute.created',
    ])
      await expect(setup.getByText(e, { exact: true })).toBeVisible()
    await expect(setup.getByRole('link', { name: /Open Razorpay webhooks/ })).toHaveAttribute(
      'href',
      'https://dashboard.razorpay.com/app/webhooks',
    )

    await setup.getByLabel('Your Razorpay page link').fill('https://razorpay.me/@nova')
    const secret = setup.getByLabel('Webhook secret')
    await expect(secret).toHaveAttribute('type', 'password')
    await secret.fill('my-rzp-secret-9')
    await setup.getByRole('button', { name: 'Turn on Razorpay' }).click()
    await expect(page.getByText('Razorpay is on. Its button is on your tip page.')).toBeVisible()
    await expect(providers(page).getByRole('button', { name: /^Razorpay/ })).toContainText('On')
    await expect(page.getByText('Tip with UPI or card')).toBeVisible()
    // The secret is never echoed back anywhere on the page.
    await expect(setup).toBeHidden()
    expect(await page.content()).not.toContain('my-rzp-secret-9')

    // Editing later shows "saved" with Replace, never the secret itself.
    await providers(page)
      .getByRole('button', { name: /^Razorpay/ })
      .click()
    await expect(setup.getByText('Webhook secret saved')).toBeVisible()
    await setup.getByRole('button', { name: 'Replace' }).click()
    await expect(setup.getByLabel('Webhook secret')).toBeFocused()
    await expect(setup.getByLabel('Webhook secret')).toHaveValue('')
  })

  test('the page name and display name are checked before saving', async ({ page }) => {
    await open(page, 'tips', EMPTY)
    const create = page.getByRole('button', { name: 'Create tip page' })
    await create.click()
    await expect(page.getByText(/must be 3 to 30 lowercase letters/)).toBeVisible()
    await expect(page.getByText('The display name must be 1 to 40 characters.')).toBeVisible()
    await expect(page.getByLabel('Page name')).toBeFocused()
    for (const h of ['pay', 'tips', 'my-twitch', 'kofi-nova', 'novaofficial']) {
      await page.getByLabel('Page name').fill(h)
      await expect(page.getByText('That tip page name is reserved. Pick another.')).toBeVisible()
    }
    await page.getByLabel('Page name').fill('nova plays')
    await expect(page.getByText(/must be 3 to 30 lowercase letters/)).toBeVisible()
    await page.getByLabel('Message on your page').fill('x'.repeat(281))
    await expect(page.getByText('The tip page message can be up to 280 characters.')).toBeVisible()
  })
})

test.describe('tips: every error the server can send', () => {
  test('409: someone else has the name', async ({ page }) => {
    await open(page, 'tips', EMPTY)
    await page.getByLabel('Page name').fill('asha')
    await page.getByLabel('Name viewers see').fill('Asha')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    await expect(page.getByText(/That tip page name is taken\./)).toBeVisible()
    await expect(page.getByText(/stay with them for 30 days/)).toBeVisible()
    await expect(page.getByLabel('Page name')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Page name')).toBeFocused()
  })

  test('429: three name changes a day', async ({ page }) => {
    await open(page, 'tips')
    const save = page.getByRole('button', { name: 'Save changes' }).first()
    for (const h of ['nova-one', 'nova-two', 'nova-three']) {
      await page.getByLabel('Page name').fill(h)
      await expect(pagePanel(page)).toContainText(`New link:`)
      await save.click()
      await expect(pagePanel(page).locator('code')).toHaveText(new RegExp(`/t/${h}$`))
    }
    await page.getByLabel('Page name').fill('nova-four')
    await save.click()
    await expect(page.getByText(/You changed your tip page name too often today\./)).toBeVisible()
    await expect(page.getByText(/Try again tomorrow/)).toBeVisible()
    await expect(pagePanel(page).locator('code')).toHaveText(/\/t\/nova-three$/)
  })

  test('422: a build with no relay says so', async ({ page }) => {
    await open(page, 'tips', `${EMPTY}&relay=0`)
    await page.getByLabel('Page name').fill('nova')
    await page.getByLabel('Name viewers see').fill('Nova')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    const alert = pagePanel(page).getByRole('alert')
    await expect(alert).toContainText('This build of Ferrocast has no relay set up')
    await expect(alert).toContainText(/official Ferrocast build/)
  })

  test('400: the server’s field message lands on that field', async ({ page }) => {
    await open(page, 'tips', EMPTY)
    await fault(page, {
      method: 'PUT',
      path: '/api/v1/tips',
      status: 400,
      code: 'invalid',
      message: 'The display name must be 1 to 40 characters.',
    })
    await page.getByLabel('Page name').fill('nova')
    await page.getByLabel('Name viewers see').fill('Nova')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    await expect(page.getByLabel('Name viewers see')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(/The display name must be 1 to 40 characters/)).toBeVisible()
    // Typing clears it, and the next save goes through.
    await page.getByLabel('Name viewers see').fill('Nova!')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    await expect(page.getByText('Your tip page is up', { exact: true })).toBeVisible()
  })

  for (const c of [
    {
      status: 401,
      code: 'unauthorized',
      message: 'This session has ended.',
      hint: 'Open the dashboard again from the Ferrocast app.',
    },
    {
      status: 403,
      code: 'forbidden',
      message: 'Ferrocast blocked this request.',
      hint: 'Turn on LAN access in Settings.',
    },
    {
      status: 503,
      code: 'starting',
      message: 'Ferrocast is still starting.',
      hint: 'This takes a second or two.',
    },
  ]) {
    test(`${c.status}: other failures show plain words and what to do`, async ({ page }) => {
      await open(page, 'tips', EMPTY)
      await fault(page, { method: 'PUT', path: '/api/v1/tips', times: 20, ...c })
      await createPage(page).catch(() => undefined)
      const alert = pagePanel(page).getByRole('alert')
      await expect(alert).toContainText(c.message, { timeout: 15_000 })
      await expect(alert).toContainText(c.hint)
    })
  }

  test('provider: a Stripe API key is refused before it leaves the browser', async ({ page }) => {
    await open(page, 'tips')
    await providers(page)
      .getByRole('button', { name: /^Stripe/ })
      .click()
    const setup = page.getByRole('form', { name: 'Stripe setup' })
    await setup.getByLabel('Your Stripe Payment Link').fill('https://stripe.com/x')
    await setup.getByLabel('Signing secret').fill('sk_live_abc')
    await setup.getByRole('button', { name: 'Turn on Stripe' }).click()
    await expect(
      setup.getByText('The Stripe link must be an https link on buy.stripe.com.'),
    ).toBeVisible()
    await expect(setup.getByText(/That’s a Stripe API key/)).toBeVisible()
    await setup.getByLabel('Your Stripe Payment Link').fill('https://buy.stripe.com/abc')
    await setup.getByLabel('Signing secret').fill('nope1234')
    await expect(setup.getByText(/starts with whsec_\. Copy it/)).toBeVisible()
    await setup.getByLabel('Signing secret').fill('whsec_abc')
    await setup.getByText('More options').click()
    await setup.getByLabel('Only payments from this link').fill('pl_123')
    await setup.getByRole('button', { name: 'Turn on Stripe' }).click()
    await expect(setup.getByText(/must be a Payment Link id that starts with plink_/)).toBeVisible()
    await setup.getByLabel('Only payments from this link').fill('plink_1Abc')
    await setup.getByRole('switch', { name: 'Accept test payments' }).click()
    await setup.getByRole('button', { name: 'Turn on Stripe' }).click()
    await expect(page.getByText('Stripe is on. Its button is on your tip page.')).toBeVisible()
    await expect(providers(page).getByRole('button', { name: /^Stripe/ })).toContainText(
      'Test mode',
    )
  })

  test('provider: a server refusal shows next to the field it is about', async ({ page }) => {
    await open(page, 'tips')
    await providers(page)
      .getByRole('button', { name: /^Ko-fi/ })
      .click()
    const setup = page.getByRole('form', { name: 'Ko-fi setup' })
    await setup.getByLabel('Your Ko-fi page link').fill('https://ko-fi.com/nova')
    await setup.getByLabel('Verification token').fill('kofi-token-1')
    await fault(page, {
      method: 'PUT',
      path: '/api/v1/tips',
      status: 400,
      code: 'invalid',
      message: 'That Ko-fi secret is too long to be a webhook secret.',
    })
    await setup.getByRole('button', { name: 'Turn on Ko-fi' }).click()
    await expect(setup.getByLabel('Verification token')).toHaveAttribute('aria-invalid', 'true')
    await expect(setup.getByText(/too long to be a webhook secret/)).toBeVisible()
    await fault(page, {
      method: 'PUT',
      path: '/api/v1/tips',
      status: 422,
      code: 'unavailable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again.',
    })
    await setup.getByRole('button', { name: 'Turn on Ko-fi' }).click()
    await expect(setup.getByRole('alert')).toContainText('Couldn’t reach the Ferrocast relay.')
    await setup.getByRole('button', { name: 'Turn on Ko-fi' }).click()
    await expect(page.getByText('Ko-fi is on. Its button is on your tip page.')).toBeVisible()
  })

  test('taking the page down failing is reported, not swallowed', async ({ page }) => {
    await open(page, 'tips')
    await fault(page, {
      method: 'DELETE',
      path: '/api/v1/tips',
      status: 422,
      code: 'unavailable',
      message: 'This build of Ferrocast has no relay set up.',
      hint: 'Use an official Ferrocast build.',
    })
    await page.getByRole('button', { name: 'Take the tip page down' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Take it down' }).click()
    await expect(
      page.getByText('This build of Ferrocast has no relay set up.').first(),
    ).toBeVisible()
    await expect(page.getByText('Your tip page is up', { exact: true })).toBeVisible()
  })
})

test.describe('tips: the rest', () => {
  test('copy the page link and a webhook address', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, 'tips')
    await pagePanel(page).getByRole('button', { name: 'Copy tip page link' }).click()
    await expect(pagePanel(page).getByRole('button', { name: 'Link copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/t\/novaplays$/)
    await providers(page)
      .getByRole('button', { name: /^Ko-fi/ })
      .click()
    await page.getByRole('button', { name: 'Copy Ko-fi webhook address' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/v1\/tips\/kofi\//)
  })

  test('turn a provider off, with a confirm', async ({ page }) => {
    await open(page, 'tips')
    await providers(page)
      .getByRole('button', { name: /^Razorpay/ })
      .click()
    await page.getByRole('button', { name: 'Turn off Razorpay' }).click()
    const dialog = page.getByRole('dialog', { name: 'Turn off Razorpay tips?' })
    await expect(dialog).toContainText('forgets its secret')
    await dialog.getByRole('button', { name: 'Turn off' }).click()
    await expect(page.getByText('Razorpay is off.')).toBeVisible()
    await expect(page.getByText('Tips aren’t set up yet.')).toBeVisible()
    await expect(providers(page).getByRole('button', { name: /^Razorpay/ })).toContainText('Set up')
  })

  test('take the page down, then put it back in one click', async ({ page }) => {
    await open(page, 'tips')
    await page.getByRole('button', { name: 'Take the tip page down' }).click()
    const dialog = page.getByRole('dialog', { name: 'Take your tip page down?' })
    await expect(dialog).toContainText('stays reserved for you for 30 days')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Take the tip page down' }).click()
    await dialog.getByRole('button', { name: 'Take it down' }).click()
    await expect(page.getByText('Your tip page is down.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Create your tip page' })).toBeVisible()
    await expect(page.getByLabel('Page name')).toHaveValue('novaplays')
    await page.getByRole('button', { name: 'Create tip page' }).click()
    await expect(pagePanel(page).locator('code')).toHaveText(/\/t\/novaplays$/)
  })

  test('saving a provider keeps unsaved page edits', async ({ page }) => {
    await open(page, 'tips')
    await page.getByLabel('Message on your page').fill('Not saved yet')
    await providers(page)
      .getByRole('button', { name: /^Ko-fi/ })
      .click()
    const setup = page.getByRole('form', { name: 'Ko-fi setup' })
    await setup.getByLabel('Your Ko-fi page link').fill('https://ko-fi.com/nova')
    await setup.getByLabel('Verification token').fill('kofi-token-1')
    await setup.getByRole('button', { name: 'Turn on Ko-fi' }).click()
    await expect(page.getByText('Ko-fi is on. Its button is on your tip page.')).toBeVisible()
    await expect(page.getByLabel('Message on your page')).toHaveValue('Not saved yet')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  test('the preview follows what is typed', async ({ page }) => {
    await open(page, 'tips')
    await page.getByLabel('Name viewers see').fill('Nova Live')
    await page.getByLabel('Message on your page').fill('Chai fund, thank you!')
    const preview = page.getByRole('figure')
    await expect(preview).toContainText('Nova Live')
    await expect(preview).toContainText('Chai fund, thank you!')
    await expect(preview).toContainText('Tip with UPI or card')
  })

  test('keyboard only: make the page and turn on Ko-fi', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit tabs past buttons unless macOS Full Keyboard Access is on',
    )
    await open(page, 'tips', EMPTY)
    await tabTo(page, page.getByLabel('Page name'))
    await page.keyboard.type('nova')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Name viewers see')).toBeFocused()
    await page.keyboard.type('Nova')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Your tip page is up', { exact: true })).toBeVisible()
    // Close Razorpay (opened for us) and open Ko-fi, all from the keyboard.
    await tabTo(page, providers(page).getByRole('button', { name: /^Razorpay/ }))
    await page.keyboard.press('Enter')
    await tabTo(page, providers(page).getByRole('button', { name: /^Ko-fi/ }))
    await page.keyboard.press('Enter')
    const setup = page.getByRole('form', { name: 'Ko-fi setup' })
    await tabTo(page, setup.getByLabel('Your Ko-fi page link'))
    await page.keyboard.type('https://ko-fi.com/nova')
    await tabTo(page, setup.getByLabel('Verification token'))
    await page.keyboard.type('kofi-token-1')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Ko-fi is on. Its button is on your tip page.')).toBeVisible()
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`no serious accessibility problems mid-setup, with errors showing (${scheme})`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'axe runs once, in Chromium')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'tips', EMPTY)
      await page.getByRole('button', { name: 'Create tip page' }).click()
      await expect(page.getByText(/must be 3 to 30 lowercase letters/)).toBeVisible()
      await createPage(page)
      const setup = page.getByRole('form', { name: 'Razorpay setup' })
      await setup.getByRole('button', { name: 'Turn on Razorpay' }).click()
      await expect(setup.getByText(/Add the Razorpay webhook secret/)).toBeVisible()
      await setup.getByText('More options').click()
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])
    })
  }
})
