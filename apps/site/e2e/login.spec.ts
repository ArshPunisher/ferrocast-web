import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { API_ORIGIN } from '../src/data/api'

// Sign-in on the website (plan §9) against a mocked server: the real one is covered by the
// relay's own tests (crates/relay/src/accounts/tests.rs, "Sign-in from the website").

async function mock(page: Page, opts: { app?: boolean; signedIn?: boolean } = {}) {
  const seen: { path: string; csrf: string | null; body: unknown }[] = []
  await page.route(`${API_ORIGIN}/v1/account`, (r) =>
    r.fulfill({ status: 401, json: { error: { code: 'signed_out', message: 'Signed out.' } } }),
  )
  await page.route(`${API_ORIGIN}/v1/login**`, async (r) => {
    const u = new URL(r.request().url())
    seen.push({
      path: u.pathname,
      csrf: r.request().headers()['x-csrf-token'] ?? null,
      body: r.request().postDataJSON(),
    })
    if (u.pathname === '/v1/login')
      return r.fulfill({
        json: {
          csrf: 'tok1',
          google: true,
          app: !!opts.app,
          signed_in: !!opts.signedIn,
          next: '/app/',
        },
      })
    if (u.pathname === '/v1/login/email') return r.fulfill({ json: { magic_id: 'ml_1' } })
    if (u.pathname === '/v1/login/code') {
      const code = (r.request().postDataJSON() as { code: string }).code
      return code === 'ABCDEFGH'
        ? r.fulfill({ json: { done: 'web', next: '/app/' } })
        : r.fulfill({
            status: 422,
            json: {
              error: {
                code: 'wrong_code',
                message: 'That code isn’t right. 4 tries left.',
                hint: null,
              },
            },
          })
    }
    return r.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'No.' } } })
  })
  return seen
}

test('email, a wrong code, then the right one opens the dashboard', async ({ page }) => {
  const seen = await mock(page)
  await page.route('**/app/**', (r) => r.fulfill({ body: 'dashboard', contentType: 'text/html' }))
  await page.goto('/login/')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByText('Type your email address')).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('ana@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByText('We sent a link to ana@example.com')).toBeVisible()
  await expect(page.getByLabel('Or type the code from the email')).toBeFocused()
  await page.getByLabel('Or type the code from the email').fill('wxyz-wxyz')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('#code-error')).toHaveText('That code isn’t right. 4 tries left.')
  await page.getByLabel('Or type the code from the email').fill('abcd-efgh')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/$/)
  const email = seen.find((s) => s.path === '/v1/login/email')
  expect(email?.csrf).toBe('tok1')
  expect(email?.body).toMatchObject({ email: 'ana@example.com', next: '/app/' })
})

test('signing in for the app says so, and a signed-in browser goes straight in', async ({
  page,
}) => {
  await mock(page, { app: true })
  await page.goto('/login/?flow=fl_1')
  await expect(page.getByText('Sign in to link this Ferrocast app to your account')).toBeVisible()
  await page.unrouteAll()
  await mock(page, { signedIn: true })
  await page.route('**/app/**', (r) => r.fulfill({ body: 'dashboard', contentType: 'text/html' }))
  await page.goto('/login/')
  await expect(page).toHaveURL(/\/app\/$/)
})

test('the sign-in page has no accessibility violations', async ({ page }) => {
  await mock(page)
  await page.goto('/login/')
  await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible()
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(r.violations).toEqual([])
})

test('a used link opened again while signed in opens the dashboard', async ({ page }) => {
  await mock(page, { signedIn: true })
  await page.route(`${API_ORIGIN}/v1/login/link`, (r) =>
    r.fulfill({
      status: 403,
      json: {
        error: { code: 'other_browser', message: 'Open it where you asked.', hint: null },
      },
    }),
  )
  await page.route('**/app/**', (r) => r.fulfill({ body: 'dashboard', contentType: 'text/html' }))
  await page.goto('/login/link/#t=used-token')
  await expect(page).toHaveURL(/\/app\/$/)
})

test('a busy server still says so while signed in', async ({ page }) => {
  await mock(page, { signedIn: true })
  await page.route(`${API_ORIGIN}/v1/login/link`, (r) =>
    r.fulfill({
      status: 429,
      json: {
        error: { code: 'rate_limited', message: 'Too many tries.', hint: 'Wait a minute.' },
      },
    }),
  )
  await page.goto('/login/link/#t=some-token')
  await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait a minute.')
  await expect(page).toHaveURL(/\/login\/link\/$/)
})

test('a bad link says why and offers to start again', async ({ page }) => {
  await mock(page)
  await page.route(`${API_ORIGIN}/v1/login/link`, (r) =>
    r.fulfill({
      status: 410,
      json: {
        error: { code: 'link_expired', message: 'This link expired.', hint: 'Ask for a new one.' },
      },
    }),
  )
  await page.goto('/login/link/#t=old-token')
  await expect(page.getByRole('alert')).toHaveText('This link expired. Ask for a new one.')
  await expect(page.getByRole('link', { name: 'Start again' })).toBeVisible()
  await expect(page).toHaveURL(/\/login\/link\/$/)
})
