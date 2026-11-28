import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, tabKey } from './helpers'

// Opt-in crash reports (3.8.1): the one calm prompt after a crash, and Settings › Privacy.
// The demo engine stands in for the app: `?crash=…` leaves a report waiting.

const Q = 'autoplay=0&latency=0'
const TITLE = 'Ferrocast closed unexpectedly'

const dialog = (page: Page) => page.getByRole('dialog', { name: TITLE })

test.describe('crash report prompt', () => {
  test('asks once, shows the exact text as plain text, and sends', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash`)
    const d = dialog(page)
    await expect(d).toBeVisible()
    await expect(
      d.getByText('Send a report to help fix it? It has no stream keys, passwords or emails.'),
    ).toBeVisible()
    // Hidden until asked for.
    await expect(d.getByTestId('crash-report-text')).toBeHidden()
    await d.getByText('See what’s sent').click()
    const text = d.getByTestId('crash-report-text')
    await expect(text).toBeVisible()
    await expect(text).toContainText('panicked at')
    await expect(text).toContainText('[REDACTED]')
    await d.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(d).toBeHidden()
    await expect(page.getByText('Report sent. Thank you.')).toBeVisible()
    expect(await page.evaluate(() => window.__ferrocastDemo!.crashReports.sends)).toBe(1)

    // The same report never asks again, even after a reload (nothing is waiting anyway).
    await page.reload()
    await expect(page.locator('#main')).toBeVisible()
    await expect(dialog(page)).toBeHidden()
  })

  test('the words follow what happened', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=hang`)
    await expect(page.getByRole('dialog', { name: 'Ferrocast stopped responding' })).toBeVisible()
  })

  test('Don’t send removes the report and sends nothing', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=unclean_exit`)
    await dialog(page).getByRole('button', { name: 'Don’t send' }).click()
    await expect(dialog(page)).toBeHidden()
    expect(await page.evaluate(() => window.__ferrocastDemo!.crashReports.sends)).toBe(0)
    expect(await page.evaluate(() => window.__ferrocastDemo!.crashReports.waiting)).toBe(false)
  })

  test('a plain page is shown as text, never as HTML', async ({ page }) => {
    let alerted = false
    page.on('dialog', async (d) => {
      alerted = true
      await d.dismiss()
    })
    await page.addInitScript(() => {
      // Set once the demo exists: the report text is hostile.
      const t = setInterval(() => {
        if (window.__ferrocastDemo) {
          clearInterval(t)
          window.__ferrocastDemo.setCrashReport({
            pending: 'crash',
            previewText: '<img src=x onerror=alert(1)>\n<script>alert(2)</script>',
          })
        }
      }, 1)
    })
    await open(page, 'home', Q)
    const d = dialog(page)
    await expect(d).toBeVisible()
    await d.getByText('See what’s sent').click()
    await expect(d.getByTestId('crash-report-text')).toHaveText(
      '<img src=x onerror=alert(1)>\n<script>alert(2)</script>',
    )
    expect(await d.locator('img, script').count()).toBe(0)
    expect(alerted).toBe(false)
  })

  test('Always send saves the setting and sends', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash`)
    const d = dialog(page)
    await d.getByLabel('Always send').check()
    await d.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(d).toBeHidden()
    // In the page (a reload would start a new demo engine).
    await page.evaluate(() => (location.hash = '#/settings/privacy'))
    await expect(page.getByRole('radio', { name: 'Always' })).toBeChecked()
  })

  test('Settings open behind the prompt shows Always afterwards, and keeps it', async ({
    page,
  }) => {
    await open(page, 'settings/privacy', `${Q}&crash=crash`)
    const d = dialog(page)
    await expect(d).toBeVisible()
    await d.getByLabel('Always send').check()
    await d.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(d).toBeHidden()
    const group = page.getByRole('radiogroup', { name: 'Send crash reports' })
    await expect(group.getByRole('radio', { name: 'Always' })).toBeChecked()
    // Another change on this page writes the whole settings back: Always must survive it.
    await page.getByRole('link', { name: 'Appearance' }).click()
    await expect(page.getByRole('heading', { name: 'Appearance' }).first()).toBeVisible()
    await page.getByRole('link', { name: 'Privacy' }).click()
    await expect(page.getByRole('radio', { name: 'Always' })).toBeChecked()
  })

  test('waits for the Pro unlock instead of opening over it', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash&pro=active&unlock=1`)
    const unlock = page.getByTestId('pro-unlock')
    await expect(unlock).toBeVisible()
    await page.waitForTimeout(2200)
    await expect(dialog(page)).toHaveCount(0)
    await unlock.getByRole('button', { name: /^(Done|Later)$/ }).click()
    await expect(dialog(page)).toBeVisible({ timeout: 4000 })
  })

  test('Send is disabled while Don’t send is running', async ({ page }) => {
    await open(page, 'home', 'autoplay=0&latency=400&crash=crash')
    const d = dialog(page)
    await expect(d).toBeVisible()
    await d.getByRole('button', { name: 'Don’t send' }).click()
    await expect(d.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  })

  for (const [mode, reason] of [
    ['old', 'relay too old'],
    ['limited', 'rate limited'],
    ['other', 'another reason'],
  ] as const) {
    test(`a send kept on this PC (${reason}) says so quietly`, async ({ page }) => {
      await open(page, 'home', `${Q}&crash=crash&crash_send=${mode}`)
      await dialog(page).getByRole('button', { name: 'Send', exact: true }).click()
      await expect(dialog(page)).toBeHidden()
      await expect(page.getByText('The report stays on this PC.')).toBeVisible()
      await expect(page.getByText('You can still save a support report in Settings')).toBeVisible()
      await expect(page.getByText('Report sent')).toHaveCount(0)
    })
  }

  test('a failed send also keeps it on this PC', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash&crash_send=fail`)
    await dialog(page).getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('The report stays on this PC.', { exact: true })).toBeVisible()
    await expect(page.getByText('couldn’t reach its server')).toBeVisible()
  })

  for (const setting of ['always', 'never']) {
    test(`with the setting on ${setting} nothing is asked`, async ({ page }) => {
      await open(page, 'home', `${Q}&crash=crash&crash_setting=${setting}`)
      await page.waitForTimeout(600)
      await expect(dialog(page)).toBeHidden()
      expect(await page.evaluate(() => window.__ferrocastDemo!.crashReports.sends)).toBe(0)
    })
  }

  test('Escape closes it without deciding', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash`)
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(await page.evaluate(() => window.__ferrocastDemo!.crashReports.sends)).toBe(0)
  })

  test('works by keyboard and has no accessibility violations', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash`)
    const d = dialog(page)
    await expect(d).toBeVisible()
    await d.getByText('See what’s sent').click()
    const results = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(results.violations).toEqual([])
    // The details toggle, the text (scrollable), the checkbox, and both buttons are reachable.
    const names: string[] = []
    await d.getByText('See what’s sent').focus()
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(tabKey(page))
      names.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ||
            document.activeElement?.textContent?.trim() ||
            (document.activeElement as HTMLInputElement | null)?.type ||
            '',
        ),
      )
    }
    expect(names.join('|')).toContain('The report, as plain text')
    expect(names.join('|')).toContain('Send')
  })

  test('at 375 px it fits and does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 })
    await open(page, 'home', `${Q}&crash=crash`)
    const d = dialog(page)
    await expect(d).toBeVisible()
    await d.getByText('See what’s sent').click()
    const box = await d.getByTestId('crash-report-text').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    await expect(d.getByRole('button', { name: 'Send', exact: true })).toBeInViewport()
    await expect(d.getByRole('button', { name: 'Don’t send' })).toBeInViewport()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })

  test('a phone never sees it', async ({ page }) => {
    await open(page, 'home', `${Q}&crash=crash&remote=owner`)
    await page.waitForTimeout(600)
    await expect(dialog(page)).toBeHidden()
  })

  test('cloud mode never sees it', async ({ page }) => {
    await page.goto(`./?${Q}&crash=crash&web=cloud#/cloud`)
    await expect(page.locator('#main')).toBeVisible()
    await page.waitForTimeout(600)
    await expect(dialog(page)).toBeHidden()
  })

  test('waits for another dialog instead of stacking on it', async ({ page }) => {
    // The Studio's "More" sheet on a phone-sized window is a dialog the streamer opened.
    await page.addInitScript(() => {
      const t = setInterval(() => {
        if (!document.querySelector('#main')) return
        clearInterval(t)
        const d = document.createElement('dialog')
        d.id = 'other-dialog'
        d.textContent = 'Another dialog'
        document.body.appendChild(d)
        d.showModal()
      }, 1)
    })
    await open(page, 'home', `${Q}&crash=crash`)
    await page.waitForTimeout(2200)
    await expect(page.locator('#other-dialog')).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
    await page.evaluate(() =>
      (document.querySelector('#other-dialog') as HTMLDialogElement).close(),
    )
    await expect(dialog(page)).toBeVisible({ timeout: 4000 })
  })
})

test.describe('Settings › Privacy', () => {
  test('Ask, Always, Never, saved and remembered, with an (i) tip', async ({ page }) => {
    await open(page, 'settings/privacy', Q)
    await expect(
      page.locator('#settings-privacy').getByRole('heading', { name: 'Privacy' }),
    ).toBeVisible()
    const group = page.getByRole('radiogroup', { name: 'Send crash reports' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio', { name: 'Ask' })).toBeChecked()
    await group.getByText('Never', { exact: true }).click()
    await expect(group.getByRole('radio', { name: 'Never' })).toBeChecked()
    await group.getByText('Always', { exact: true }).click()
    await expect(group.getByRole('radio', { name: 'Always' })).toBeChecked()

    const tip = page.getByRole('button', { name: 'About crash reports' })
    await tip.focus()
    await page.keyboard.press('Enter')
    const text = page.getByText('ClearCraft Labs’ Ferrocast server')
    await expect(text).toBeVisible()
    await expect(text).toContainText('Never a memory dump')
    await expect(text).toContainText('90 days')
  })

  test('is a section in the list, and a phone doesn’t get it', async ({ page }) => {
    await open(page, 'settings/privacy', Q)
    const nav = page.getByRole('navigation', { name: 'Settings sections' })
    await expect(nav.getByRole('link', { name: 'Privacy' })).toHaveAttribute('aria-current', 'page')
    await open(page, 'settings', `${Q}&remote=owner`)
    await expect(nav.getByRole('link', { name: 'Privacy' })).toHaveCount(0)
  })

  test('at 375 px it fits', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'settings/privacy', Q)
    await expect(page.getByRole('radiogroup', { name: 'Send crash reports' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
