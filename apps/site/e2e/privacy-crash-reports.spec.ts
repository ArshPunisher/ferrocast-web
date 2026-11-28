import { expect, test } from '@playwright/test'

// Opt-in crash reports (3.8.1): the privacy policy says what one holds, where it goes, how
// long it is kept and how to turn it off, and no page still says nothing ever leaves the PC.

test.describe('privacy policy: crash reports', () => {
  test('has a section with the facts', async ({ page }) => {
    await page.goto('/privacy/')
    const h = page.getByRole('heading', { name: 'Crash reports', level: 2 })
    await expect(h).toBeVisible()
    await expect(h).toHaveAttribute('id', 'crash-reports')
    const text = await page.locator('article.prose').innerText()
    const from = text.indexOf('Crash reports\n')
    const body = text.slice(from, text.indexOf('Tip pages', from))
    expect(body).toMatch(/Nothing is sent unless you say yes/)
    expect(body).toMatch(/error details, the crash trace and recent logs/i)
    expect(body).toMatch(
      /we strip stream keys, passwords, tokens and email addresses before it is sent/i,
    )
    expect(body).toMatch(/memory dumps are never sent/i)
    expect(body).not.toMatch(/never in one/i)
    expect(body).not.toMatch(/stops responding/i)
    expect(body).toMatch(/backups of the relay’s database can hold that summary for up to 30 days/i)
    expect(body).toMatch(/ClearCraft Labs’ Ferrocast server/)
    expect(body).toMatch(/deleted after 90 days/)
    expect(body).toMatch(/up to 1 year/)
    expect(body).toMatch(/Settings → Privacy/)
    expect(body).toMatch(/Never/)
  })

  test('the short version links to it, and the link lands on the section', async ({ page }) => {
    await page.goto('/privacy/')
    const link = page.getByRole('link', { name: /What one holds and how long we keep it/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '#crash-reports')
    // The target exists once (the page scrolls smoothly, so where it lands isn't asserted).
    await expect(page.locator('#crash-reports')).toHaveCount(1)
  })

  test('the “we cannot see it” and relay lines are qualified', async ({ page }) => {
    await page.goto('/privacy/')
    const text = await page.locator('article.prose').innerText()
    expect(text).toMatch(/We cannot see it, apart from a crash report you choose to send/)
    expect(text).toMatch(/It also receives crash reports, but only the ones you choose to send/)
  })

  test('is dated today', async ({ page }) => {
    await page.goto('/privacy/')
    await expect(page.locator('time')).toHaveText('28 November 2026')
  })

  test('fits at 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/privacy/#crash-reports')
    await expect(page.locator('#crash-reports')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })
})

test.describe('no page says nothing leaves the PC without the crash-report exception', () => {
  test('FAQ answer', async ({ page }) => {
    await page.goto('/faq/')
    const text = (await page.locator('main').textContent()) ?? ''
    expect(text).toMatch(/and crash reports you choose to send, nothing else is kept/)
    expect(text).toMatch(/It asks first, shows you exactly what is sent/)
  })

  test('features page tiles', async ({ page }) => {
    await page.goto('/features/')
    const text = await page.locator('main').innerText()
    expect(text).toMatch(
      /Your keys and chat stay on it\. A crash report goes only if you say yes\./,
    )
    expect(text).toMatch(/Your chat, events and keys stay on your PC\. A crash report goes only/)
    expect(text).not.toMatch(/never leave it/)
  })

  test('store docs say telemetry is zero but name the crash report', async ({ page }) => {
    await page.goto('/docs/submit-to-store/')
    await expect(page.getByText('crash report is sent only if the streamer says yes')).toBeVisible()
  })

  test('no page claims data never leaves the PC', async ({ page }) => {
    for (const path of ['/', '/faq/', '/features/', '/compare/', '/privacy/', '/terms/']) {
      await page.goto(path)
      const text = await page.locator('body').innerText()
      expect(text, path).not.toMatch(/nothing (ever )?leaves your (pc|computer)/i)
      expect(text, path).not.toMatch(/never leaves? (your|the) (pc|computer)/i)
      expect(text, path).not.toMatch(/\bno telemetry\b/i)
    }
  })
})
