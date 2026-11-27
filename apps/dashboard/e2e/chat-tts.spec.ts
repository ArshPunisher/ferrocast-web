import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const SHOTS = process.env.FC_SHOTS
const tts = (page: Page) => page.locator('#s-tts')

async function enableChatTtsCommand(page: Page) {
  const mainSwitch = tts(page).getByRole('switch', { name: /Read messages aloud/ })
  await expect(mainSwitch).toBeVisible()
  if ((await mainSwitch.getAttribute('aria-checked')) !== 'true') await mainSwitch.click()

  const chatSwitch = tts(page).getByRole('switch', { name: /Read chat messages/ })
  await expect(chatSwitch).toBeVisible()
  if ((await chatSwitch.getAttribute('aria-checked')) !== 'true') await chatSwitch.click()

  await tts(page)
    .getByRole('radiogroup', { name: 'Who can trigger it' })
    .getByText('Command', { exact: true })
    .click()
}

test.describe('Chat TTS settings and Panic pause', () => {
  test('configures Chat TTS in Settings, validates command, persists in session, and passes Axe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 })
    await open(page, 'settings/tts', 'autoplay=0&latency=0')
    await enableChatTtsCommand(page)

    const cmd = tts(page).getByRole('textbox', { name: 'Command' })
    await expect(cmd).toHaveValue('!tts')

    // Invalid command shows inline validation and keeps previously valid setting untouched.
    await cmd.fill('notslash')
    await cmd.blur()
    await expect(tts(page).getByRole('alert')).toContainText(/Start with !/)

    // Valid command saves and stays set when leaving to Home and coming back.
    await cmd.fill('!shout')
    await cmd.blur()
    await expect(tts(page).getByRole('alert')).toHaveCount(0)

    if (SHOTS) {
      await tts(page).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${SHOTS}/chat-tts-desktop.png`, fullPage: true })
    }

    const axe = await new AxeBuilder({ page }).include('#s-tts').analyze()
    expect(axe.violations).toEqual([])

    await page.evaluate(() => {
      location.hash = '#/home'
    })
    await expect(tts(page)).toHaveCount(0)
    await page.evaluate(() => {
      location.hash = '#/settings/tts'
    })
    await expect(tts(page).getByRole('switch', { name: /Read chat messages/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(tts(page).getByRole('textbox', { name: 'Command' })).toHaveValue('!shout')
  })

  test('Moderation Panic mode with Pause text-to-speech toggles cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'moderation', 'autoplay=0&latency=0')

    const pauseTts = page.getByRole('switch', { name: /Pause text-to-speech/ })
    await expect(pauseTts).toBeVisible()
    if ((await pauseTts.getAttribute('aria-checked')) !== 'true') {
      await pauseTts.click()
      await expect(pauseTts).toHaveAttribute('aria-checked', 'true')
    }

    await page.getByRole('button', { name: 'Start panic mode' }).click()
    await expect(page.getByRole('button', { name: 'Turn panic off' })).toBeVisible()
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/panic-pause-tts.png` })
    }
    await page.getByRole('button', { name: 'Turn panic off' }).click()
    await expect(page.getByRole('button', { name: 'Start panic mode' })).toBeVisible()
  })

  test('Chat TTS controls fit cleanly at 375 px width without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'settings/tts', 'autoplay=0&latency=0')
    await enableChatTtsCommand(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/chat-tts-375px.png`, fullPage: true })
    }
  })
})
