import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open } from './helpers'

// The 24/7 cloud bot (Pro) on the Bot page, on the demo engine (API.md §9.7).
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const ON_SALE = 'autoplay=0&latency=0&pro=open&pro_features=on'
const panel = (page: Page) => page.locator('#cloud-bot')
const sw = (page: Page) => panel(page).getByRole('switch', { name: 'Cloud bot' })

/** The demo engine lives in the page, so a reload would reset it: leave and come back. */
async function revisit(page: Page) {
  await page.evaluate(() => (location.hash = '#/home'))
  await expect(panel(page)).toHaveCount(0)
  await page.evaluate(() => (location.hash = '#/bot'))
  await expect(panel(page).getByTestId('cloud-bot-status')).toBeVisible()
}

test.describe('Cloud bot', () => {
  test('hidden without the feature; one calm line on sale without Pro (402)', async ({ page }) => {
    await open(page, 'bot', 'autoplay=0&latency=0')
    await expect(page.getByRole('heading', { name: 'Commands' })).toBeVisible()
    await expect(panel(page)).toHaveCount(0)

    await open(page, 'bot', ON_SALE)
    const line = panel(page).getByTestId('pro-line')
    await expect(line).toContainText('part of Pro')
    await expect(line.getByRole('link', { name: 'Settings › Pro' })).toBeVisible()
    await expect(sw(page)).toHaveCount(0)
  })

  test('says who answers, switches off and on', async ({ page }) => {
    await open(page, 'bot', PRO)
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText('Standing by')
    await expect(panel(page)).toContainText('This PC is answering')
    await expect(panel(page).getByTestId('cloud-bot-twitch')).toContainText(
      'AshaBot in Asha_Live’s chat',
    )
    await expect(panel(page).getByTestId('cloud-bot-twitch')).toContainText('Ready')
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true')
    await sw(page).click()
    await expect(sw(page)).toHaveAttribute('aria-checked', 'false')
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText('Off')
    await sw(page).click()
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true')

    // The PC went quiet: the cloud is on duty.
    await demo(page, '(d) => d.setCloudBot({ onDuty: true })')
    await revisit(page)
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText(
      /^On duty since \d{1,2}:\d\d(\s?[AP]M)?$/i,
    )
  })

  test('connects Twitch in two steps, Kick in one, and disconnects', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ empty: true })')
    await revisit(page)
    await expect(sw(page)).toBeDisabled()
    await expect(panel(page)).toContainText('Connect a channel below first.')

    const twitch = panel(page).getByTestId('cloud-bot-twitch')
    await twitch.getByRole('button', { name: 'Connect bot account' }).click()
    const open1 = twitch.getByRole('link', { name: /Open Twitch/ })
    await expect(open1).toHaveAttribute('href', /^https:\/\/id\.twitch\.tv\/oauth2\/authorize/)
    await expect(open1).toHaveAttribute('target', '_blank')
    await twitch.getByRole('button', { name: 'Check again' }).click()
    await expect(twitch).toContainText('One step left')
    await expect(sw(page)).toBeDisabled()
    await twitch.getByRole('button', { name: 'Allow it in your channel' }).click()
    await expect(twitch.getByRole('link', { name: /Open Twitch/ })).toHaveAttribute(
      'href',
      /channel%3Abot/,
    )
    await twitch.getByRole('button', { name: 'Check again' }).click()
    await expect(twitch).toContainText('Ready')
    await expect(sw(page)).toBeEnabled()
    await sw(page).click()
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true')

    const kick = panel(page).getByTestId('cloud-bot-kick')
    await kick.getByRole('button', { name: 'Connect Kick' }).click()
    await kick.getByRole('button', { name: 'Check again' }).click()
    await expect(kick).toContainText('Ready')

    await kick.getByRole('button', { name: 'Disconnect' }).click()
    const dlg = page.getByRole('dialog', { name: 'Disconnect Kick?' })
    await dlg.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(kick.getByRole('button', { name: 'Connect Kick' })).toBeVisible()
  })

  test('connects YouTube (beta) in one step and shows its daily units', async ({ page }) => {
    await open(page, 'bot', PRO)
    const yt = panel(page).getByTestId('cloud-bot-youtube')
    await expect(yt).toContainText('YouTube')
    await expect(yt).toContainText('Beta')
    await expect(yt).toContainText('midnight Pacific')
    await yt.getByRole('button', { name: 'Connect YouTube' }).click()
    const link = yt.getByRole('link', { name: /Open YouTube/ })
    await expect(link).toHaveAttribute('href', /^https:\/\/accounts\.google\.com\//)
    await expect(link).toHaveAttribute('href', /youtube\.force-ssl/)
    await yt.getByRole('button', { name: 'Check again' }).click()
    await expect(yt).toContainText('Ready')
    await expect(yt).toContainText('Speaks as Asha Live')
    await expect(yt.getByTestId('cloud-bot-youtube-quota')).toHaveText(
      'Uses about 1 of 1,500 YouTube units today',
    )
    await expect(yt.getByTestId('cloud-bot-youtube-moderation')).toContainText('while you’re live')
    await yt.getByRole('button', { name: 'Turn on' }).click()
    await yt.getByRole('button', { name: 'Check again' }).click()
    await expect(yt.getByTestId('cloud-bot-youtube-moderation')).toContainText('On.')

    await yt.getByRole('button', { name: 'Disconnect' }).click()
    const dlg = page.getByRole('dialog', { name: 'Disconnect YouTube?' })
    await dlg.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await expect(yt.getByRole('button', { name: 'Connect YouTube' })).toBeVisible()
  })

  test('YouTube without Accounts, and a used-up daily limit, say what to do', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ youtubeLinked: false })')
    await revisit(page)
    const yt = panel(page).getByTestId('cloud-bot-youtube')
    await yt.getByRole('button', { name: 'Connect YouTube' }).click()
    await expect(yt.getByRole('alert')).toContainText(
      'Connect YouTube in Accounts on this PC first.',
    )

    await demo(page, '(d) => d.setCloudBot({ youtube: "quota" })')
    await revisit(page)
    await expect(yt).toContainText('Ready')
    await expect(yt.getByTestId('cloud-bot-youtube-quota')).toContainText('1,486 of 1,500')
    await expect(yt.getByRole('status')).toContainText(
      /YouTube’s daily limit for the cloud bot is used up; it’s back at \d{1,2}:\d\d/,
    )
    await expect(yt.getByRole('status')).toContainText('isn’t affected')
    await expect(yt.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  })

  test('YouTube on duty and offline offers Check now', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ youtube: "ready", onDuty: true })')
    await revisit(page)
    const yt = panel(page).getByTestId('cloud-bot-youtube')
    await expect(yt).toContainText('looks less often')
    await yt.getByRole('button', { name: 'Check now' }).click()
    await expect(page.getByText('Looking for your YouTube stream now.')).toBeVisible()
    // Standing by (the PC answers): nothing to check from here.
    await demo(page, '(d) => d.setCloudBot({ youtube: "ready", onDuty: false })')
    await revisit(page)
    await expect(yt.getByRole('button', { name: 'Check now' })).toHaveCount(0)
  })

  test('errors say what to do', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ empty: true, kickLinked: false })')
    await revisit(page)
    await panel(page)
      .getByTestId('cloud-bot-kick')
      .getByRole('button', { name: 'Connect Kick' })
      .click()
    await expect(panel(page).getByRole('alert')).toContainText('Connect Kick in Accounts first.')
    await expect(panel(page).getByRole('alert')).toContainText('through that connection')
  })

  test('Twitch signing the bot out shows the reason and the fix', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ twitchError: true })')
    await revisit(page)
    const twitch = panel(page).getByTestId('cloud-bot-twitch')
    await expect(twitch).toContainText('Stopped')
    await expect(twitch.getByRole('alert')).toContainText('signed the bot account out')
    await expect(twitch.getByRole('alert')).toContainText('connect it again')
    await expect(twitch.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  })

  test('Twitch unreachable keeps going and offers Try again', async ({ page }) => {
    await open(page, 'bot', PRO)
    await demo(page, '(d) => d.setCloudBot({ twitchUnreachable: true, dropped: true })')
    await revisit(page)
    const twitch = panel(page).getByTestId('cloud-bot-twitch')
    await expect(twitch).toContainText('Ready')
    await expect(twitch.getByRole('status')).toContainText('Couldn’t reach Twitch')
    await expect(twitch.getByTestId('cloud-bot-twitch-drop')).toContainText('checked by mods')
    await twitch.getByRole('button', { name: 'Try again' }).click()
    await expect(twitch.getByRole('status')).toHaveCount(0)
    await expect(twitch.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  })

  test('shows this PC’s code and says when another PC answers', async ({ page }) => {
    await open(page, 'bot', PRO)
    await expect(panel(page).getByTestId('cloud-bot-pc-code')).toHaveText('7F3A-90C2')
    await demo(page, '(d) => d.setCloudBot({ otherPc: true })')
    await revisit(page)
    await expect(panel(page)).toContainText('Another of your PCs is answering')
  })

  test('the duty line updates on its own while the panel is open', async ({ page }) => {
    await page.clock.install()
    await open(page, 'bot', PRO)
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText('Standing by')
    await demo(page, '(d) => d.setCloudBot({ onDuty: true })')
    await page.clock.runFor(31_000)
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText(/^On duty since/)
  })

  test('relay offline and a 402 say what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      method: 'GET',
      path: '/api/v1/pro/bot',
      status: 502,
      code: 'relay_unreachable',
      message: 'Couldn’t reach the Ferrocast relay.',
      hint: 'Check your internet connection and try again. Everything else in Ferrocast keeps working.',
    })
    await page.evaluate(() => (location.hash = '#/bot'))
    await expect(panel(page).getByText('Couldn’t reach the Ferrocast relay.')).toBeVisible()
    await expect(panel(page).getByText(/Check your internet connection/)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Try again' }).click()
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText('Standing by')

    await fault(page, {
      method: 'PUT',
      path: '/api/v1/pro/bot/enabled',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
    })
    await sw(page).click()
    await expect(panel(page).getByRole('alert')).toContainText('part of Pro')
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true')
  })

  test('an owner’s phone may look and switch, never connect', async ({ page }) => {
    await open(page, 'bot', `${PRO}&remote=owner`)
    await expect(panel(page).getByTestId('cloud-bot-status')).toHaveText('Standing by')
    await expect(panel(page)).toContainText('Your PC is answering')
    await expect(panel(page)).toContainText('Your PC’s code')
    await expect(sw(page)).toBeEnabled()
    await expect(panel(page).getByRole('button', { name: /Connect|Disconnect/ })).toHaveCount(0)
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'bot', PRO)
      await expect(panel(page).getByTestId('cloud-bot-status')).toBeVisible()
      const r = await new AxeBuilder({ page }).include('#cloud-bot').analyze()
      expect(r.violations).toEqual([])
    })
  }
})

test.describe('Cloud bot at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const mode of [
    'ready',
    'empty',
    'on sale',
    'retry',
    'youtube quota',
    'youtube check',
  ] as const) {
    test(`fits the phone width (${mode})`, async ({ page }) => {
      await open(page, 'bot', mode === 'on sale' ? ON_SALE : PRO)
      if (mode === 'youtube check') {
        await demo(page, '(d) => d.setCloudBot({ youtube: "ready", onDuty: true })')
        await revisit(page)
      }
      if (mode === 'empty' || mode === 'retry' || mode === 'youtube quota') {
        await demo(
          page,
          mode === 'empty'
            ? '(d) => d.setCloudBot({ empty: true })'
            : mode === 'retry'
              ? '(d) => d.setCloudBot({ twitchUnreachable: true, dropped: true })'
              : '(d) => d.setCloudBot({ youtube: "quota" })',
        )
        await revisit(page)
      }
      await panel(page).scrollIntoViewIfNeeded()
      await expect(panel(page)).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      const box = await panel(page).boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(375)
      if (mode === 'youtube check') {
        const yt = panel(page).getByTestId('cloud-bot-youtube')
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          const row = yt.getByRole('button', { name: 'Check now' }).locator('..')
          await row.screenshot({ path: test.info().outputPath(`youtube-check-${scheme}.png`) })
        }
      }
    })
  }
})
