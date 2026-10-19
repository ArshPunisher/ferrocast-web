import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open, settled } from './helpers'

// The Ferrocast bot (Pro) in Settings › Discord, on the demo engine.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const ON_SALE = 'autoplay=0&latency=0&pro=open&pro_features=on'
const bot = (page: Page) => page.locator('#discord-pro')

async function connected(page: Page) {
  await open(page, 'home', PRO)
  await demo(page, '(d) => d.setDiscordPro({ connected: true })')
  await page.evaluate(() => (location.hash = '#/settings/discord'))
  await expect(bot(page).getByTestId('discord-guild')).toHaveText('Asha’s Lounge')
}

test.describe('Ferrocast bot in Discord', () => {
  test('no roles: Add rule says why, and Refresh picks up a new role', async ({ page }) => {
    await open(page, 'home', PRO)
    await demo(page, '(d) => d.setDiscordPro({ connected: true, discordDown: true })')
    await page.evaluate(() => (location.hash = '#/settings/discord'))
    const hint = bot(page).getByTestId('discord-roles-hint')
    await expect(hint).toContainText('Make a role in Discord first')
    await expect(bot(page).getByRole('button', { name: 'Add rule' })).toBeDisabled()
    await demo(page, '(d) => d.setDiscordPro({ discordDown: false })')
    await hint.getByRole('button', { name: 'Refresh' }).click()
    await expect(hint).toHaveCount(0)
    await expect(bot(page).getByRole('button', { name: 'Add rule' })).toBeEnabled()
  })

  test('hidden without the feature; one calm line on sale without Pro', async ({ page }) => {
    await open(page, 'settings/discord', 'autoplay=0&latency=0')
    await expect(page.locator('#s-discord')).toBeVisible()
    await expect(bot(page)).toHaveCount(0)

    await open(page, 'settings/discord', ON_SALE)
    const line = bot(page).getByTestId('pro-line')
    await expect(line).toContainText('part of Pro')
    await expect(line.getByRole('link', { name: 'Settings › Pro' })).toBeVisible()
    await expect(bot(page).getByRole('button', { name: 'Connect server' })).toHaveCount(0)
  })

  test('connects a server, picks a channel and posts go-live instead of the webhook', async ({
    page,
  }) => {
    await open(page, 'settings/discord', PRO)
    await bot(page).getByRole('button', { name: 'Connect server' }).click()
    const invite = bot(page).getByRole('link', { name: /Open Discord/ })
    await expect(invite).toHaveAttribute('href', /^https:\/\/discord\.com\/oauth2\/authorize/)
    await expect(invite).toHaveAttribute('target', '_blank')
    await bot(page).getByRole('button', { name: 'Check again' }).click()
    await expect(bot(page).getByTestId('discord-guild')).toHaveText('Asha’s Lounge')
    await expect(bot(page).getByTestId('discord-linked')).toContainText('42')
    await expect(bot(page).getByTestId('discord-linked')).toContainText('Members linked')

    const sw = bot(page).getByRole('switch', { name: 'Post when I go live' })
    await expect(sw).toBeDisabled()
    await bot(page).getByLabel('Channel').selectOption({ label: '#going-live' })
    await expect(sw).toBeEnabled()
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    // The free webhook form says the bot posts now.
    await expect(page.getByTestId('discord-pro-posts')).toBeVisible()

    const box = bot(page).getByLabel(/Message above the post/)
    await box.fill('   Come say hi!   ')
    await bot(page).getByRole('button', { name: 'Save message' }).click()
    await expect(page.getByText('Message saved.')).toBeVisible()
    // The box shows what was kept (trimmed), not what was typed.
    await expect(box).toHaveValue('Come say hi!')
    await expect(bot(page).getByRole('button', { name: 'Save message' })).toBeDisabled()

    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('discord-pro-posts')).toHaveCount(0)
  })

  test('adds, edits and deletes a role rule', async ({ page }) => {
    await connected(page)
    const rules = bot(page).getByTestId('discord-rules')
    await expect(rules.locator('li')).toHaveCount(1)
    await expect(rules).toContainText('Twitch sub')

    await bot(page).getByRole('button', { name: 'Add rule' }).click()
    const dlg = page.getByRole('dialog', { name: 'Add a rule' })
    await dlg.getByLabel('Who gets it').selectOption('tip_min')
    await dlg.getByLabel('At least').fill('0')
    await dlg.getByRole('button', { name: 'Add rule' }).click()
    await expect(dlg.getByText('Enter an amount above zero.')).toBeVisible()
    await dlg.getByLabel('At least').fill('500')
    await dlg.getByLabel('Role').selectOption({ label: '@Supporter' })
    await dlg.getByLabel('Keep it for').fill('0')
    await dlg.getByRole('button', { name: 'Add rule' }).click()
    await expect(dlg).toHaveCount(0)
    await expect(rules.locator('li')).toHaveCount(2)
    await expect(rules.locator('li').nth(1)).toContainText('Tip of ₹500+')
    await expect(rules.locator('li').nth(1)).toContainText('@Supporter')
    await expect(rules.locator('li').nth(1)).toContainText('Keeps it')

    await bot(page).getByRole('button', { name: 'Edit rule: Tip of ₹500+' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit rule' })
    await expect(edit.getByLabel('At least')).toHaveValue('500')
    await edit.getByLabel('At least').fill('1000')
    await edit.getByRole('button', { name: 'Save rule' }).click()
    await expect(rules.locator('li').nth(1)).toContainText('Tip of ₹1,000+')

    await bot(page).getByRole('button', { name: 'Delete rule: Tip of ₹1,000+' }).click()
    await page
      .getByRole('dialog', { name: 'Delete this rule?' })
      .getByRole('button', { name: 'Delete rule' })
      .click()
    await expect(rules.locator('li')).toHaveCount(1)
  })

  test('a role above Ferrocast’s says how to fix it', async ({ page }) => {
    await connected(page)
    await bot(page).getByRole('button', { name: 'Add rule' }).click()
    const dlg = page.getByRole('dialog', { name: 'Add a rule' })
    // The role picker greys it out and explains why.
    await expect(dlg.getByRole('option', { name: /@Mods/ })).toBeDisabled()
    await expect(dlg.getByText(/Server Settings › Roles/)).toBeVisible()
    // The relay can still refuse (the role moved meanwhile): 403 missing_permission.
    await fault(page, {
      method: 'PUT',
      path: '/api/v1/pro/discord/rules',
      status: 403,
      code: 'missing_permission',
      message: 'Discord says Ferrocast can’t give that role.',
      hint: 'Move Ferrocast’s role above the perk roles in Server Settings › Roles.',
    })
    await dlg.getByRole('button', { name: 'Add rule' }).click()
    await expect(dlg.getByRole('alert')).toContainText(
      'Discord says Ferrocast can’t give that role.',
    )
    await expect(dlg.getByRole('alert')).toContainText('Move Ferrocast’s role above')
  })

  test('copies the viewer link', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await connected(page)
    const url = bot(page).getByTestId('discord-link-url')
    await expect(url).toHaveText('https://ferrocast-relay.clearcraftlabs.com/d/k7m2qx4p/link')
    await bot(page).getByRole('button', { name: 'Copy link' }).click()
    await expect(page.getByText('Link copied.')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://ferrocast-relay.clearcraftlabs.com/d/k7m2qx4p/link',
    )
  })

  test('says which PC added the bot, and the code to compare on Discord’s page', async ({
    page,
  }) => {
    await open(page, 'settings/discord', PRO)
    await bot(page).getByRole('button', { name: 'Connect server' }).click()
    await expect(bot(page).getByTestId('discord-pc-code')).toContainText('7F3A-90C2')
    await bot(page).getByRole('button', { name: 'Check again' }).click()
    await expect(bot(page).getByTestId('discord-connected-by')).toHaveText(
      'Added from this PC, code 7F3A-90C2',
    )
  })

  test('the install link is offered again once it expires', async ({ page }) => {
    await page.clock.install()
    await open(page, 'settings/discord', PRO)
    await bot(page).getByRole('button', { name: 'Connect server' }).click()
    await expect(bot(page).getByTestId('discord-invite')).toBeVisible()
    await page.clock.fastForward('10:01')
    await expect(bot(page).getByTestId('discord-invite')).toHaveCount(0)
    await expect(bot(page).getByRole('button', { name: 'Connect server' })).toBeVisible()
  })

  test('roles that couldn’t be given show which rule and what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await demo(page, '(d) => d.setDiscordPro({ connected: true, perkBlocked: true })')
    await page.evaluate(() => (location.hash = '#/settings/discord'))
    const issue = bot(page).getByTestId('discord-perk-issue')
    await expect(issue).toContainText('Some roles couldn’t be given')
    await expect(issue).toContainText('Rule: Twitch sub.')
    await expect(issue).toContainText('Server Settings › Roles')
    await expect(bot(page).getByTestId('discord-rules').getByText('Not given')).toBeVisible()
  })

  test('a failed disconnect keeps the dialog open with the reason', async ({ page }) => {
    await connected(page)
    await fault(page, {
      method: 'DELETE',
      path: '/api/v1/pro/discord',
      status: 502,
      code: 'relay_unreachable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again.',
    })
    await bot(page).getByRole('button', { name: 'Disconnect server' }).click()
    const dlg = page.getByRole('dialog', { name: /Disconnect Asha’s Lounge/ })
    await dlg.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(dlg.getByRole('alert')).toContainText('Couldn’t reach the Ferrocast relay.')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(bot(page).getByRole('button', { name: 'Connect server' })).toBeVisible()
  })

  test('hidden on a phone through Ferrocast’s servers, like the webhook form', async ({ page }) => {
    await open(page, 'settings', `${PRO}&remote=owner`)
    await expect(page.locator('#settings-discord-pro')).toHaveCount(0)
    await expect(page.locator('#s-discord')).toHaveCount(0)
  })

  test('disconnects after asking', async ({ page }) => {
    await connected(page)
    await bot(page).getByRole('button', { name: 'Disconnect server' }).click()
    const dlg = page.getByRole('dialog', { name: /Disconnect Asha’s Lounge/ })
    await dlg.getByRole('button', { name: 'Keep it' }).click()
    await expect(bot(page).getByTestId('discord-guild')).toBeVisible()
    await bot(page).getByRole('button', { name: 'Disconnect server' }).click()
    await dlg.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(bot(page).getByRole('button', { name: 'Connect server' })).toBeVisible()
  })

  test('a 402 and an unreachable relay say what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      method: 'GET',
      path: '/api/v1/pro/discord',
      status: 502,
      code: 'relay_unreachable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again. Everything else in Ferrocast keeps working.',
    })
    await page.evaluate(() => (location.hash = '#/settings/discord'))
    await expect(bot(page).getByText('Couldn’t reach the Ferrocast relay.')).toBeVisible()
    await bot(page)
      .getByRole('button', { name: /Try again|Retry/ })
      .click()
    await expect(bot(page).getByRole('button', { name: 'Connect server' })).toBeVisible()

    await fault(page, {
      method: 'POST',
      path: '/api/v1/pro/discord/connect',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
    })
    await bot(page).getByRole('button', { name: 'Connect server' }).click()
    await expect(
      page.getByText('This runs on Ferrocast’s servers and is part of Pro.'),
    ).toBeVisible()
  })

  test('Discord unreachable keeps the rest working', async ({ page }) => {
    await open(page, 'home', PRO)
    await demo(page, '(d) => d.setDiscordPro({ connected: true, discordDown: true })')
    await page.evaluate(() => (location.hash = '#/settings/discord'))
    await expect(bot(page).getByRole('status')).toContainText('couldn’t be reached')
    await expect(bot(page).getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await connected(page)
      const r = await new AxeBuilder({ page }).include('#discord-pro').analyze()
      expect(r.violations).toEqual([])
      await bot(page).getByRole('button', { name: 'Add rule' }).click()
      await expect(page.getByRole('dialog', { name: 'Add a rule' })).toBeVisible()
      await settled(page)
      const d = await new AxeBuilder({ page }).include('dialog[open]').analyze()
      expect(d.violations).toEqual([])
    })
  }
})

test.describe('Ferrocast bot at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const mode of ['connected', 'not connected', 'on sale'] as const) {
    test(`fits the phone width (${mode})`, async ({ page }, info) => {
      if (mode === 'connected') await connected(page)
      else await open(page, 'settings/discord', mode === 'on sale' ? ON_SALE : PRO)
      // Measure the finished section, not its loading state.
      if (mode === 'on sale') await expect(bot(page).getByTestId('pro-line')).toBeVisible()
      if (mode === 'not connected')
        await expect(bot(page).getByRole('button', { name: 'Connect server' })).toBeVisible()
      await bot(page).scrollIntoViewIfNeeded()
      await settled(page)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      const box = await bot(page).boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(375)
      // A clean shot for review: the whole page, with the sticky header and the phone tab
      // bar hidden so they can't cover the section.
      await info.attach(`discord-pro-375-${mode}`, {
        body: await page.screenshot({
          fullPage: true,
          style: 'header.sticky, nav[aria-label="Main"].fixed { visibility: hidden !important; }',
          animations: 'disabled',
        }),
        contentType: 'image/png',
      })
      if (mode === 'connected') {
        await bot(page).getByRole('button', { name: 'Add rule' }).click()
        const dlg = page.getByRole('dialog', { name: 'Add a rule' })
        await dlg.getByLabel('Who gets it').selectOption('tip_min')
        await settled(page)
        const b = await dlg.boundingBox()
        expect(b && b.x + b.width).toBeLessThanOrEqual(375)
      }
    })
  }
})
