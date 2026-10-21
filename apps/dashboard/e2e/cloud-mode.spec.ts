import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

// Cloud mode on the web dashboard (ferrocast docs/CLOUD.md), on the demo engine
// (`?web=cloud`): only the cloud's screens, the Cloud page (turn on, connect, disconnect,
// limits), chat to read, the cloud bot's switch, and Add to OBS as the paste-the-URL guide.
const CLOUD = 'autoplay=0&latency=0&web=cloud'

test.describe('Cloud mode', () => {
  test('lists only what runs in the cloud; other screens open the Cloud page', async ({ page }) => {
    await open(page, 'cloud', CLOUD)
    await expect(page.getByRole('heading', { name: 'Cloud mode', level: 1 })).toBeVisible()
    // The sidebar is the desktop's; a phone gets the same list in its tab bar and More sheet.
    test.skip(test.info().project.name === 'mobile', 'sidebar list checked on desktop')
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Cloud', 'Chat', 'Alerts', 'Overlays', 'Designs', 'Bot'])
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    for (const name of ['Home', 'Studio', 'Moderation', 'Community', 'Tips', 'Settings'])
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0)
    await page.evaluate(() => (location.hash = '#/moderation'))
    await expect(page.getByRole('heading', { name: 'Cloud mode', level: 1 })).toBeVisible()
    // No panic button: it needs the PC.
    await expect(page.getByRole('button', { name: /panic/i })).toHaveCount(0)
  })

  test('connects Kick, disconnects Twitch, shows the free limits', async ({ page }) => {
    await open(page, 'cloud', CLOUD)
    const twitch = page.getByTestId('cloud-channel-twitch')
    const kick = page.getByTestId('cloud-channel-kick')
    await expect(twitch).toContainText('Connected')
    await expect(page.getByTestId('cloud-channel-youtube')).toContainText('part of Pro')
    await kick.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByText('Kick is connected.')).toBeVisible()
    await expect(kick).toContainText('Connected')
    await expect(page).toHaveURL(/#\/cloud$/)

    await twitch.getByRole('button', { name: 'Disconnect' }).click()
    const dialog = page.getByRole('dialog', { name: 'Disconnect Twitch?' })
    await dialog.getByRole('button', { name: 'Disconnect' }).click()
    await expect(twitch.getByRole('button', { name: 'Connect' })).toBeVisible()

    await expect(page.getByRole('meter', { name: 'Media used' })).toHaveAttribute(
      'aria-valuenow',
      '19',
    )
    await expect(page.getByText('37.4 MB of 200 MB')).toBeVisible()
  })

  test('turns on from off', async ({ page }) => {
    await open(page, 'cloud', 'autoplay=0&latency=0&web=cloud-off')
    await page.getByRole('button', { name: 'Turn on cloud mode' }).click()
    await expect(page.getByText('Cloud mode is on.')).toBeVisible()
    await expect(page.getByTestId('cloud-channel-twitch')).toBeVisible()
  })

  test('a sleeping account says so', async ({ page }) => {
    await open(page, 'cloud', 'autoplay=0&latency=0&web=cloud-sleeping')
    await expect(page.getByText('Cloud mode was asleep.')).toBeVisible()
  })

  test('chat is read-only and the bot has one switch', async ({ page }) => {
    await open(page, 'chat', CLOUD)
    await expect(
      page.getByText('Sending messages and moderating need the Ferrocast app on your PC.'),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: /message/i })).toHaveCount(0)

    await open(page, 'bot', CLOUD)
    await expect(page.getByRole('heading', { name: 'Commands' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Run the bot in the cloud' })).toBeVisible()
    await expect(page.locator('#cloud-bot')).toHaveCount(0)
    const sw = page.getByRole('switch', { name: 'Bot on' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  test('Add to OBS shows how to paste the URL', async ({ page }) => {
    await open(page, 'overlays', CLOUD)
    await page.getByRole('button', { name: 'Add to OBS' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('the Cloud page passes axe in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((t) => localStorage.setItem('fc-theme', t), theme)
      await open(page, 'cloud', CLOUD)
      await expect(page.getByTestId('cloud-channel-twitch')).toBeVisible()
      const r = await new AxeBuilder({ page }).include('#main').analyze()
      expect(r.violations.map((v) => v.id)).toEqual([])
    }
  })

  test('fits a 375 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'cloud', CLOUD)
    await expect(page.getByTestId('cloud-channel-kick')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(overflow).toBe(false)
  })
})

test.describe('Cloud sync on the PC', () => {
  test('off by default and needs the account', async ({ page }) => {
    await open(page, 'settings/cloud', 'autoplay=0&latency=0')
    const panel = page.locator('#s-cloud')
    await expect(panel.getByText('Sign in to your Ferrocast account')).toBeVisible()
    await expect(panel.getByRole('switch', { name: 'Sync with cloud mode' })).toBeDisabled()
    await expect(panel.getByRole('switch', { name: 'Use cloud overlays' })).toBeDisabled()
  })

  test('signed in: sync on, then cloud overlays', async ({ page }) => {
    await open(page, 'settings/cloud', 'autoplay=0&latency=0&account=signed_in')
    const panel = page.locator('#s-cloud')
    const sync = panel.getByRole('switch', { name: 'Sync with cloud mode' })
    const use = panel.getByRole('switch', { name: 'Use cloud overlays' })
    await expect(sync).toHaveAttribute('aria-checked', 'false')
    await expect(use).toBeDisabled()
    await sync.click()
    await expect(sync).toHaveAttribute('aria-checked', 'true')
    await expect(panel.getByText(/Last synced/)).toBeVisible()
    await use.click()
    await expect(use).toHaveAttribute('aria-checked', 'true')
    // Sync off turns cloud overlays off too.
    await sync.click()
    await expect(use).toHaveAttribute('aria-checked', 'false')
    const r = await new AxeBuilder({ page }).include('#s-cloud').analyze()
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})
