import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open } from './helpers'

// Studio in the demo engine: Start show, stream info, OBS helpers, moments, counters,
// quotes and modules, with their errors and accessibility.

const panel = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

test.describe('studio', () => {
  test('every Studio tab and Home loads', { tag: '@smoke' }, async ({ page }) => {
    for (const [route, heading] of [
      ['studio/vertical', 'Where it goes'],
      ['studio/show', 'Go-live checklist'],
      ['studio/info', 'Stream info'],
      ['studio/obs', 'Scenes'],
      ['studio/moments', 'Markers this stream'],
    ] as const) {
      await open(page, route)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    }
    await open(page, 'home')
    await expect(page.getByRole('button', { name: 'Start show' })).toBeVisible()
  })

  test('Start show from Home in two clicks, then go live from the countdown', async ({ page }) => {
    await open(page, 'home')
    await page.getByRole('button', { name: 'Start show' }).click()
    const dialog = page.getByRole('dialog', { name: 'Start show' })
    await expect(dialog.getByText('Reconnect Kick in Settings, Accounts')).toBeVisible()
    await dialog.getByRole('button', { name: 'Start show' }).click()
    await expect(page.getByText('Show started: counting down to the live scene.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Live in \d+:\d\d/ })).toBeVisible()
    await page.getByRole('link', { name: /Live in/ }).click()
    const show = panel(page, 'Show')
    await expect(show.getByText('Counting down')).toBeVisible()
    await expect(show.getByText('"Valorant ranked" sent to')).toHaveCount(0)
    await expect(show.getByText(/Kick: Kick needs a permission/)).toBeVisible()
    await show.getByRole('button', { name: 'Go live now' }).click()
    await expect(show.getByText('Live scene', { exact: true }).first()).toBeVisible()
    await show.getByRole('button', { name: 'End show' }).click()
    await expect(page.getByText('Show ended. Thanks posted in chat.')).toBeVisible()
    await expect(show.getByRole('button', { name: 'Start show' })).toBeVisible()
  })

  test('a muted mic fails the pre-flight; one click unmutes it', async ({ page }) => {
    await open(page, 'studio/show')
    await demo(page, '(d) => { d.studio.obs.muted.Mic = true }')
    await page.getByRole('button', { name: 'Check again' }).click()
    const pf = panel(page, 'Pre-flight')
    await expect(pf.getByText('Muted in OBS: nobody will hear you.')).toBeVisible()
    await pf.getByRole('button', { name: 'Unmute' }).click()
    await expect(page.getByText('Fixed.')).toBeVisible()
    await expect(pf.getByText('Muted in OBS')).toHaveCount(0)
  })

  test('stream info goes to every platform and says which one needs reconnecting', async ({
    page,
  }) => {
    await open(page, 'studio/info')
    const form = panel(page, 'Stream info')
    await form.getByLabel('Title').fill('Late night ranked')
    await form.getByLabel('Tags').fill('English, no spaces')
    await form.getByRole('button', { name: 'Update everywhere' }).click()
    await expect(form.getByRole('alert')).toHaveText(/letters and numbers/)
    await form.getByLabel('Tags').fill('English, Ranked')
    await form.getByRole('button', { name: 'Update everywhere' }).click()
    await expect(page.getByText('Updated on 2 of 3.')).toBeVisible()
    const results = form.getByRole('list', { name: 'What each platform said' })
    await expect(results.getByText('Twitch')).toBeVisible()
    await expect(results.getByRole('link', { name: 'Open Accounts' })).toHaveAttribute(
      'href',
      '#/settings/accounts',
    )
    await expect(panel(page, 'Last sent').getByText('Late night ranked')).toBeVisible()
  })

  test('a platform can have its own title; Everywhere shows it and it can be reset', async ({
    page,
  }) => {
    await open(page, 'studio/info')
    const form = panel(page, 'Stream info')
    await form.getByLabel('Title').fill('Day 41: Immortal or bust')
    await form.getByRole('tab', { name: 'Twitch' }).click()
    await expect(form.getByLabel('Title')).toHaveAttribute(
      'placeholder',
      'Same as everywhere: Day 41: Immortal or bust',
    )
    await form.getByLabel('Title').fill('Ranked grind | !socials')
    await expect(form.getByRole('tab', { name: 'Twitch (has its own)' })).toBeVisible()
    await form.getByRole('tab', { name: 'Everywhere' }).click()
    await expect(form.getByText('Twitch uses its own:')).toBeVisible()
    await form.getByRole('button', { name: 'Update everywhere' }).click()
    await expect(page.getByText('Updated on 2 of 3.')).toBeVisible()
    await expect(panel(page, 'Last sent').getByText('Day 41: Immortal or bust')).toBeVisible()
    // Arrow keys move between tabs; "Use the everywhere title" clears Twitch's own.
    await form.getByRole('tab', { name: 'Everywhere' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(form.getByRole('tab', { name: /Twitch/ })).toHaveAttribute('aria-selected', 'true')
    await form.getByRole('button', { name: 'Use the everywhere title' }).click()
    await expect(form.getByRole('tab', { name: 'Twitch', exact: true })).toBeVisible()
  })

  test('only Kick ticked: nobody took it, and the reason is shown', async ({ page }) => {
    await open(page, 'studio/info')
    const form = panel(page, 'Stream info')
    await form.getByRole('checkbox', { name: 'Twitch' }).uncheck()
    await form.getByRole('checkbox', { name: 'YouTube' }).uncheck()
    await form.getByRole('button', { name: 'Update everywhere' }).click()
    await expect(form.getByRole('alert')).toHaveText('No platform took the change.')
    await expect(form.getByText(/Kick needs a permission/)).toBeVisible()
  })

  test('a platform outage is a plain message', async ({ page }) => {
    await open(page, 'studio/info')
    await fault(page, {
      path: '/api/v1/stream-info/apply',
      status: 502,
      code: 'platform_unreachable',
      message: 'Couldn’t reach Twitch.',
      hint: 'Check your connection and try again.',
    })
    await panel(page, 'Stream info').getByRole('button', { name: 'Update everywhere' }).click()
    await expect(panel(page, 'Stream info').getByRole('alert')).toHaveText('Couldn’t reach Twitch.')
  })

  test('stop and start OBS streaming from the Show panel, with a confirm', async ({ page }) => {
    await open(page, 'studio/show')
    const show = panel(page, 'Show')
    await expect(show.getByText('OBS is streaming')).toBeVisible()
    await show.getByRole('button', { name: 'Stop streaming' }).click()
    const dialog = page.getByRole('dialog', { name: 'Stop streaming?' })
    await dialog.getByRole('button', { name: 'Keep streaming' }).click()
    await expect(show.getByText('OBS is streaming')).toBeVisible()
    await show.getByRole('button', { name: 'Stop streaming' }).click()
    await dialog.getByRole('button', { name: 'Stop streaming' }).click()
    await expect(show.getByText('OBS isn’t streaming')).toBeVisible()
    await show.getByRole('button', { name: 'Start streaming' }).click()
    await expect(show.getByText('OBS is streaming')).toBeVisible()
    // The checklist can press them too, with a delay before stopping.
    const cfg = panel(page, 'Go-live checklist')
    await cfg.getByRole('switch', { name: 'End show: stop streaming in OBS' }).click()
    await expect(cfg.getByLabel('Stop after')).toHaveValue('30')
  })

  test('description and thumbnail go to YouTube only, the others say why', async ({ page }) => {
    await open(page, 'studio/info')
    await page.getByLabel('Description').fill('Ranked all night')
    await page.getByRole('button', { name: 'Update everywhere' }).click()
    await expect(
      page.getByText('Skipped description: Twitch has no stream description'),
    ).toBeVisible()
    await expect(page.getByText(/YouTube updated .*description/)).toBeVisible()
    // A GIF isn't a YouTube thumbnail.
    await page.locator('input[type=file][accept*="image/png"]').setInputFiles({
      name: 'party.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    })
    await expect(page.getByText('YouTube thumbnails must be a JPEG or PNG picture.')).toBeVisible()
  })

  test('presets: save the form, fill it back, delete it', async ({ page }) => {
    await open(page, 'studio/info')
    const form = panel(page, 'Stream info')
    await form.getByLabel('Title').fill('Speedrun practice')
    await form.getByRole('button', { name: 'Save as preset' }).click()
    await form.getByLabel('Preset name').fill('Speedruns')
    await form.getByRole('button', { name: 'Save preset' }).click()
    await expect(page.getByText('Saved “Speedruns”.')).toBeVisible()
    const presets = panel(page, 'Presets')
    await presets.getByRole('button', { name: /^Just chatting/ }).click()
    await expect(form.getByLabel('Title')).toHaveValue('Coffee and chat, ask me anything')
    await presets.getByRole('button', { name: 'Delete Speedruns' }).click()
    await expect(presets.getByText('Speedruns')).toHaveCount(0)
  })

  test('OBS: switch scenes, clip that, BRB and back', async ({ page }) => {
    await open(page, 'studio/obs')
    const scenes = panel(page, 'Scenes')
    await scenes.getByRole('button', { name: /^Just Chatting/ }).click()
    await expect(page.getByText('Switched to Just Chatting.')).toBeVisible()
    await expect(scenes.getByRole('button', { name: /^Just Chatting/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await scenes.getByRole('button', { name: 'Clip that' }).click()
    await expect(page.getByText(/replay buffer isn’t running/)).toBeVisible()
    await demo(page, '(d) => { d.studio.obs.replay = true }')
    await scenes.getByRole('button', { name: 'Clip that' }).click()
    await expect(page.getByText('Clip saved. A marker was added too.')).toBeVisible()
    await scenes.getByRole('button', { name: 'BRB', exact: true }).click()
    await expect(page.getByText('On BRB.')).toBeVisible()
    await scenes.getByRole('button', { name: 'Back from BRB' }).click()
    await expect(page.getByText('Back on Just Chatting.')).toBeVisible()
  })

  test('Alt+2 switches to the second hotkey scene', async ({ page }) => {
    await open(page, 'studio/obs')
    await page.keyboard.press('Alt+Digit2')
    await expect(page.getByText('Switched to Gameplay.')).toBeVisible()
  })

  test('markers: add one and export CSV and text', async ({ page }) => {
    await open(page, 'studio/moments')
    const m = panel(page, 'Markers this stream')
    await expect(m.getByText('GlitchGarden raided with 38 viewers')).toBeVisible()
    await m.getByLabel('Marker label').fill('That clutch')
    await m.getByRole('button', { name: 'Add marker' }).click()
    await expect(m.getByText('That clutch')).toBeVisible()
    const csv = page.waitForEvent('download')
    await m.getByRole('button', { name: 'CSV' }).click()
    const file = await csv
    expect(file.suggestedFilename()).toBe('ferrocast-markers.csv')
    const text = page.waitForEvent('download')
    await m.getByRole('button', { name: 'Text' }).click()
    expect((await text).suggestedFilename()).toBe('ferrocast-markers.txt')
  })

  test('the Don’t miss lane pins big moments and dismisses them', async ({ page }) => {
    await open(page, 'home')
    const lane = panel(page, 'Don’t miss 2')
    await expect(lane.getByText('PixelMoth is chatting for the first time')).toBeVisible()
    await lane.getByRole('button', { name: /Dismiss: PixelMoth/ }).click()
    await expect(page.getByText('PixelMoth is chatting for the first time')).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.getByText('GlitchGarden raided with 38 viewers')).toHaveCount(0)
  })

  test('counters, quotes and modules on the Bot page', async ({ page }) => {
    await open(page, 'bot')
    const counters = panel(page, 'Counters')
    await counters.getByRole('button', { name: 'deaths plus one' }).click()
    await expect(counters.getByText('15', { exact: true })).toBeVisible()
    await counters.getByRole('button', { name: 'New counter' }).click()
    const d = page.getByRole('dialog', { name: 'New counter' })
    await d.getByLabel('Name').fill('Boss Wins')
    await expect(d.getByText('{count:boss_wins}')).toBeVisible()
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(counters.getByText('boss wins')).toBeVisible()
    await counters.getByRole('button', { name: 'New counter' }).click()
    await page.getByRole('dialog', { name: 'New counter' }).getByLabel('Name').fill('deaths')
    await page
      .getByRole('dialog', { name: 'New counter' })
      .getByRole('button', { name: 'Save' })
      .click()
    await expect(
      page.getByRole('dialog', { name: 'New counter' }).getByText(/already exists/),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    const quotes = panel(page, 'Quotes')
    await quotes.getByLabel('New quote').fill('gg no re')
    await quotes.getByRole('button', { name: 'Add' }).click()
    await expect(quotes.getByText('“gg no re”')).toBeVisible()
    const modules = panel(page, 'Chat modules')
    const roulette = modules.getByRole('switch', { name: 'Roulette' })
    await expect(roulette).toHaveAttribute('aria-checked', 'false')
    await roulette.click()
    await expect(roulette).toHaveAttribute('aria-checked', 'true')
  })

  for (const scheme of ['dark', 'light'] as const)
    for (const route of ['studio/show', 'studio/info', 'studio/obs', 'studio/moments', 'bot'])
      test(`${route} has no serious accessibility problems (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await open(page, route)
        await page.waitForTimeout(500)
        const r = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(
          bad.map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(', ')}`,
          ),
        ).toEqual([])
      })
})
