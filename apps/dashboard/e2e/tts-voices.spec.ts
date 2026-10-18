import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open } from './helpers'

// Ferrocast voices (Pro) in Settings › Text-to-speech, on the demo engine.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const tts = (page: Page) => page.locator('#s-tts')
const voice = (page: Page) => tts(page).getByLabel('Voice', { exact: true })

async function turnOn(page: Page) {
  const sw = tts(page).getByRole('switch', { name: /Read messages aloud/ })
  await expect(sw).toBeVisible()
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click()
  await expect(voice(page)).toBeEnabled()
}

test.describe('Ferrocast voices', () => {
  test('hidden without the feature; one calm line on sale without Pro', async ({ page }) => {
    await open(page, 'settings/tts', 'autoplay=0&latency=0')
    await expect(tts(page)).toBeVisible()
    await expect(tts(page).getByTestId('tts-pro-line')).toHaveCount(0)
    await expect(tts(page).getByTestId('tts-cloud')).toHaveCount(0)
    await expect(voice(page).locator('optgroup[label^="Ferrocast"]')).toHaveCount(0)

    await open(page, 'settings/tts', 'autoplay=0&latency=0&pro=open&pro_features=on')
    const line = tts(page).getByTestId('tts-pro-line')
    await expect(line).toContainText('part of Pro')
    await expect(line.getByRole('link', { name: 'Settings › Pro' })).toBeVisible()
    await expect(voice(page).locator('optgroup[label^="Ferrocast"]')).toHaveCount(0)
    await expect(tts(page).getByTestId('tts-usage')).toHaveCount(0)
  })

  test('a 402 from picking says what to do', async ({ page }) => {
    await open(page, 'settings/tts', PRO)
    await turnOn(page)
    await fault(page, {
      method: 'PUT',
      path: '/api/v1/tts/cloud',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. The voices on this computer stay free.',
    })
    await voice(page).selectOption('google:hi-IN-Neural2-A')
    await expect(
      page.getByText('This runs on Ferrocast’s servers and is part of Pro.'),
    ).toBeVisible()
    await expect(tts(page).getByLabel('Backup voice')).toHaveCount(0)
  })

  test('picks a Ferrocast voice, keeps a backup, shows usage', async ({ page }) => {
    await open(page, 'settings/tts', PRO)
    await turnOn(page)
    const group = voice(page).locator('optgroup[label^="Ferrocast"] option')
    await expect(group).toHaveCount(10)
    await expect(group.first()).toHaveText('Hindi, female (Neural2)')
    await expect(group.nth(4)).toHaveText('Indian English, female (Neural2)')
    await expect(tts(page).getByTestId('tts-usage')).toHaveText(
      '4,120 of 20,000 characters this month',
    )
    await voice(page).selectOption('google:en-IN-Neural2-B')
    const backup = tts(page).getByLabel('Backup voice')
    await expect(backup).toBeVisible()
    await expect(voice(page)).toHaveValue('google:en-IN-Neural2-B')
    // Back to a computer voice: the backup picker goes.
    await voice(page).selectOption('kokoro-bm-george')
    await expect(backup).toHaveCount(0)
    await expect(voice(page)).toHaveValue('kokoro-bm-george')
  })

  test('preview plays through the same path and counts characters', async ({ page }) => {
    await open(page, 'settings/tts', PRO)
    await turnOn(page)
    await voice(page).selectOption('google:hi-IN-Neural2-A')
    await tts(page).getByRole('button', { name: 'Preview' }).click()
    await expect(tts(page).getByTestId('tts-usage')).not.toHaveText(
      '4,120 of 20,000 characters this month',
    )
    await expect(tts(page).getByTestId('tts-usage')).toContainText(
      'of 20,000 characters this month',
    )
    await expect(tts(page).getByRole('status')).toHaveCount(0)
  })

  test('resting voices fall back with a clear note', async ({ page }) => {
    await open(page, 'home', PRO)
    await demo(page, '(d) => d.setTtsVoices({ resting: true })')
    await page.evaluate(() => (location.hash = '#/settings/tts'))
    await turnOn(page)
    await expect(tts(page).getByTestId('tts-cloud')).toContainText('resting until next month')
    await voice(page).selectOption('google:hi-IN-Neural2-A')
    await tts(page).getByRole('button', { name: 'Preview' }).click()
    await expect(tts(page).getByText('You heard this PC’s voice instead.')).toBeVisible()
  })

  test('has no accessibility violations', async ({ page }) => {
    await open(page, 'settings/tts', PRO)
    await turnOn(page)
    await voice(page).selectOption('google:hi-IN-Neural2-A')
    await expect(tts(page).getByLabel('Backup voice')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#s-tts').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Ferrocast voices at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const q of [PRO, 'autoplay=0&latency=0&pro=open&pro_features=on']) {
    test(`fits the phone width${q === PRO ? '' : ' (on sale)'}`, async ({ page }) => {
      await open(page, 'settings/tts', q)
      await turnOn(page)
      if (q === PRO) await voice(page).selectOption('google:hi-IN-Neural2-A')
      await tts(page).scrollIntoViewIfNeeded()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      const box = await tts(page).boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(375)
      const btn = await tts(page).getByRole('button', { name: 'Preview' }).boundingBox()
      expect(btn && btn.x + btn.width).toBeLessThanOrEqual(375)
    })
  }
})
