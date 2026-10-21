import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

// The audience features: polls, giveaways, points, new faces, the recap, Discord, OBS
// auto-detect, starter commands and the poll/giveaway overlay widgets. Every bad input
// must end in a clear inline message, never a crash or a blank screen.

let errors: string[] = []
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(e.message))
})
test.afterEach(async ({ page }) => {
  expect(errors, 'no uncaught errors').toEqual([])
  if (page.url() === 'about:blank') return // skipped before opening a screen
  await expect(page.locator('#main')).toBeVisible()
  await expect(page.locator('#main')).not.toBeEmpty()
})

const poll = (page: Page) => page.locator('#community-polls')
const giveaway = (page: Page) => page.locator('#community-giveaway')

/** The number in a giveaway stat tile ("Entries", "Tickets"). */
async function stat(page: Page, name: string): Promise<number> {
  const t = await giveaway(page)
    .locator('dl > div')
    .filter({ hasText: name })
    .locator('dd')
    .textContent()
  return Number((t ?? '0').replace(/\D/g, ''))
}

test.describe('community: polls', () => {
  test('start a poll, votes come in, end it early', async ({ page }) => {
    await open(page, 'community')
    const p = poll(page)
    await p.getByLabel('Question').fill('Which map next?')
    await p.getByRole('button', { name: 'A, B or C' }).click()
    await p.getByRole('radiogroup', { name: 'How long' }).getByText('30 s').click()
    await expect(p.getByRole('radio', { name: '30 s' })).toBeChecked()
    await p.getByRole('button', { name: 'Start poll' }).click()
    await expect(page.getByText('Poll started and posted to chat.')).toBeVisible()
    await expect(p.getByText('Live', { exact: true })).toBeVisible()
    await expect(p.getByLabel('Time left')).toBeVisible()
    const results = p.getByRole('list', { name: 'Results' })
    await expect(results.getByRole('listitem')).toHaveCount(3)
    await expect(p.getByText(/^[1-9][\d,]* votes?$/)).toBeVisible({ timeout: 15_000 })
    await p.getByRole('button', { name: 'End now' }).click()
    await expect(p.getByText('Closed', { exact: true })).toBeVisible()
    await expect(p.getByText(/The result was posted to chat\./)).toBeVisible()
    await expect(p.getByText('Winner').first()).toBeVisible()
    // Ask again keeps the question and answers.
    await p.getByRole('button', { name: 'Ask again' }).click()
    await expect(p.getByLabel('Question')).toHaveValue('Which map next?')
    await expect(p.getByRole('textbox', { name: 'Answer 3' })).toHaveValue('C')
  })

  test('one answer is refused inline', async ({ page }) => {
    await open(page, 'community')
    const p = poll(page)
    await p.getByLabel('Question').fill('Only one?')
    await p.getByRole('textbox', { name: 'Answer 1' }).fill('Yes')
    await p.getByRole('button', { name: 'Start poll' }).click()
    await expect(p.getByRole('alert')).toHaveText(/^Give 2 to 5 answers/)
    await expect(p.getByRole('textbox', { name: 'Answer 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    // Two is the floor: the remove buttons are off.
    await expect(p.getByRole('button', { name: 'Remove answer 1' })).toBeDisabled()
  })

  test('a sixth answer cannot be added', async ({ page }) => {
    await open(page, 'community')
    const p = poll(page)
    const add = p.getByRole('button', { name: 'Add answer' })
    for (let i = 0; i < 3; i++) await add.click()
    await expect(p.getByRole('textbox', { name: /^Answer \d$/ })).toHaveCount(5)
    await expect(add).toBeHidden()
  })

  test('an empty question and duplicate answers are explained', async ({ page }) => {
    await open(page, 'community')
    const p = poll(page)
    await p.getByRole('button', { name: 'Yes or no' }).click()
    await p.getByRole('button', { name: 'Start poll' }).click()
    await expect(p.getByRole('alert')).toHaveText(/^Ask something 1 to 120 characters long/)
    await expect(p.getByLabel('Question')).toHaveAttribute('aria-invalid', 'true')
    await p.getByLabel('Question').fill('Same?')
    await p.getByRole('textbox', { name: 'Answer 2' }).fill('yes')
    await p.getByRole('button', { name: 'Start poll' }).click()
    await expect(p.getByRole('alert')).toHaveText(/in the list twice/)
  })

  test('over-long text is capped at the limit', async ({ page }) => {
    await open(page, 'community')
    const p = poll(page)
    await p.getByLabel('Question').fill('q'.repeat(400))
    await expect(p.getByLabel('Question')).toHaveValue('q'.repeat(120))
    await p.getByRole('textbox', { name: 'Answer 1' }).fill('a'.repeat(400))
    await expect(p.getByRole('textbox', { name: 'Answer 1' })).toHaveValue('a'.repeat(60))
  })
})

test.describe('community: giveaway', () => {
  test('open, draw, redraw, cancel', async ({ page }) => {
    await open(page, 'community')
    const g = giveaway(page)
    await g.getByLabel('Prize').fill('A Steam key for Hades II')
    await g.getByRole('button', { name: 'Start giveaway' }).click()
    await expect(page.getByText('Giveaway started. Viewers type !join to enter.')).toBeVisible()
    await expect(g.getByText('Taking entries')).toBeVisible()
    await expect.poll(() => stat(page, 'Entries'), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    await g.getByRole('button', { name: 'Draw winner' }).click()
    const winner = g.getByRole('status')
    await expect(winner).toContainText('Winner')
    const first = await winner.locator('span[dir=auto]').textContent()
    await g.getByRole('button', { name: 'Redraw' }).click()
    await expect(winner).toContainText('Winner (draw 2)')
    await expect(winner.locator('span[dir=auto]')).not.toHaveText(first ?? '')
    await g.getByRole('button', { name: 'Cancel' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cancel this giveaway?' })
    await dialog.getByRole('button', { name: 'Cancel giveaway' }).click()
    await expect(page.getByText(/^Giveaway cancelled\./)).toBeVisible()
    await expect(g.getByLabel('Prize')).toBeVisible()
  })

  test('drawing with no entries is not possible', async ({ page }) => {
    await open(page, 'community')
    const g = giveaway(page)
    await g.getByLabel('Prize').fill('A sticker')
    await g.getByRole('button', { name: 'Start giveaway' }).click()
    await expect(g.getByText('Waiting for entries')).toBeVisible()
    await expect(g.getByRole('button', { name: 'Draw winner' })).toBeDisabled()
    await g.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).click()
    await expect(g.getByText('Taking entries')).toBeVisible()
  })

  test('an engine refusal to draw is shown, not swallowed', async ({ page }) => {
    await open(page, 'community')
    const g = giveaway(page)
    await g.getByLabel('Prize').fill('A sticker')
    await g.getByRole('button', { name: 'Start giveaway' }).click()
    await expect.poll(() => stat(page, 'Entries'), { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
    await demo(
      page,
      `(d) => d.addFault({ path: /giveaways\\/current\\/draw/, status: 422, code: 'unavailable', message: 'Nobody has entered yet.' })`,
    )
    await g.getByRole('button', { name: 'Draw winner' }).click()
    await expect(page.getByText('Nobody has entered yet.')).toBeVisible()
    await expect(g.getByRole('button', { name: 'Draw winner' })).toBeVisible()
  })

  test('empty prize, bad keyword and bad cost are explained inline', async ({ page }) => {
    await open(page, 'community')
    const g = giveaway(page)
    await g.getByRole('button', { name: 'Start giveaway' }).click()
    await expect(g.getByRole('alert')).toHaveText(/^Say what they can win/)
    await g.getByLabel('Prize').fill('Key')
    await g.getByLabel('Keyword').fill('join')
    await g.getByRole('button', { name: 'Start giveaway' }).click()
    await expect(g.getByLabel('Keyword')).toHaveAttribute('aria-invalid', 'true')
    await g.getByLabel('Keyword').fill('!join')
    for (const bad of ['-5', 'lots', '99999999999']) {
      await g.getByLabel('Cost in points').fill(bad)
      await g.getByRole('button', { name: 'Start giveaway' }).click()
      await expect(g.getByRole('alert')).toHaveText('Use a whole number from 0 to 1,000,000,000.')
    }
    await expect(g.getByLabel('Prize')).toBeVisible()
  })
})

test.describe('community: points', () => {
  test('save the earning settings', async ({ page }) => {
    await open(page, 'community/points')
    await page.getByLabel('Per follow').fill('75')
    await page.getByRole('button', { name: 'Save', exact: true }).first().click()
    await expect(page.getByText('Points settings saved.')).toBeVisible()
    await expect(page.getByLabel('Per follow')).toHaveValue('75')
  })

  test('bad earning settings are explained under the field', async ({ page }) => {
    await open(page, 'community/points')
    const name = page.getByLabel('Name', { exact: true })
    const save = page.locator('#community-points').getByRole('button', { name: 'Save' })
    await name.fill('')
    await save.click()
    await expect(page.getByText(/^Call them something 1 to 20 characters long/)).toBeVisible()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await name.fill('gems!!')
    await save.click()
    await expect(page.getByText(/^Use letters, numbers, spaces/)).toBeVisible()
    await name.fill('gems')
    await page.getByLabel('Per follow').fill('9999999')
    await save.click()
    await expect(page.getByText(/^This must be between 0 and 1,000,000/)).toBeVisible()
    await page.getByLabel('Per follow').fill('-abc')
    await expect(page.getByLabel('Per follow')).toHaveValue('0')
    await page.getByLabel('Every how many minutes').fill('0')
    await save.click()
    await expect(page.getByText(/between 1 and 120 minutes/)).toBeVisible()
  })

  test('adjust points from the leaderboard', async ({ page }) => {
    await open(page, 'community/points')
    await page
      .getByRole('list', { name: /Leaderboard by/ })
      .getByRole('button')
      .first()
      .click()
    const d = page.getByRole('dialog')
    await d.getByLabel(/^Change /).fill('250')
    await d.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(/^Gave 250 points\. Now [\d,]+ points\.$/)).toBeVisible()
  })

  test('the points adjuster on the viewer card', async ({ page }) => {
    await open(page, 'chat')
    await page
      .getByRole('log', { name: 'Merged chat' })
      .getByRole('listitem')
      .filter({ hasNotText: 'NovaPlays' })
      .last()
      .getByRole('button')
      .first()
      .click()
    const d = page.getByRole('dialog')
    const amount = d.getByLabel('Change points')
    await amount.fill('1,000')
    await d.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(/^Gave 1,000 points\. Now [\d,]+ points\.$/)).toBeVisible()
    await amount.fill('40')
    await d.getByRole('button', { name: 'Take', exact: true }).click()
    await expect(page.getByText(/^Took 40 points\./)).toBeVisible()
    for (const bad of ['-50', '99999999999', 'ten', '1.5', '']) {
      await amount.fill(bad)
      await d.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(d.getByRole('alert')).toHaveText('Enter a whole number from 1 to 1,000,000,000.')
      await expect(amount).toHaveAttribute('aria-invalid', 'true')
    }
  })

  test('taking more than they have is explained', async ({ page }) => {
    await open(page, 'community/points')
    await page
      .getByRole('list', { name: /Leaderboard by/ })
      .getByRole('button')
      .last()
      .click()
    const d = page.getByRole('dialog')
    await d.getByLabel(/^Change /).fill('1000000000')
    await d.getByRole('button', { name: 'Take', exact: true }).click()
    await expect(d.getByRole('alert')).not.toBeEmpty()
  })
})

test.describe('community: new faces', () => {
  test('save the welcome, and bad values are explained', async ({ page }) => {
    await open(page, 'community/welcome')
    const w = page.locator('#community-welcome')
    const msg = w.getByLabel('Welcome message')
    await msg.fill('')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(w.getByRole('alert')).toHaveText(/^Write a welcome of 1 to 300 characters/)
    await msg.fill('Welcome {user')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(w.getByRole('alert')).toHaveText(/is never closed/)
    await msg.fill('Welcome {user}!')
    await w.getByLabel('Counts as back after').fill('3')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(w.getByRole('alert')).toHaveText(/between 7 and 365 days/)
    await w.getByLabel('Counts as back after').fill('30')
    await w.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
    await msg.fill('x'.repeat(500))
    await expect(msg).toHaveValue('x'.repeat(300))
  })

  test('chat marks a first message ever and someone coming back', async ({ page }) => {
    await open(page, 'chat')
    await demo(
      page,
      `(d) => {
        const actor = { platform: 'twitch', id: 'e2e-fresh', login: 'freshface', display_name: 'FreshFace',
          avatar_url: null, color: null, roles: 0, badges: [], anonymous: false }
        const msg = (text) => ({ type: 'chat_message', actor, content: { text, fragments: [{ type: 'text', text }] },
          reply_to: null, is_action: false })
        d.inject(msg('hi everyone'), 'twitch')
        const again = d.inject(msg('back again'), 'twitch')
        d.host.broadcastLive({ v: 1, type: 'chatter', data: { event_id: again.id, kind: 'returning', days: 42 } })
      }`,
    )
    const log = page.getByRole('log', { name: 'Merged chat' })
    await expect(
      log.getByRole('listitem').filter({ hasText: 'hi everyone' }).getByText('First message ever'),
    ).toBeVisible()
    await expect(
      log.getByRole('listitem').filter({ hasText: 'back again' }).getByText('Back after 42 days'),
    ).toBeVisible()
    await expect(
      log.getByRole('listitem').filter({ hasText: 'back again' }).getByText('First message ever'),
    ).toHaveCount(0)
  })
})

test.describe('recap', () => {
  test('opens from Home and copies the thank-you', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only in Playwright')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    await page.getByRole('link', { name: 'Stream recap' }).click()
    await expect(page.getByRole('heading', { name: 'Stream recap', level: 1 })).toBeVisible()
    await expect(page.getByText('Peak viewers')).toBeVisible()
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(page.getByText(/Thank-you copied/)).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Thank you /)
  })

  test('a failed load says what happened and can retry', async ({ page }) => {
    await open(page)
    await demo(
      page,
      `(d) => d.addFault({ path: /recap/, status: 500, code: 'internal', message: 'The engine is busy.' })`,
    )
    await page.getByRole('link', { name: 'Stream recap' }).click()
    await expect(page.getByText('The engine is busy.')).toBeVisible()
    await page.getByRole('button', { name: /Try again|Retry/ }).click()
    await expect(page.getByText('Peak viewers')).toBeVisible()
  })
})

test.describe('settings: Discord and OBS', () => {
  const GOOD =
    'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123'

  test('paste a webhook, see only a masked hint, send a test', async ({ page }) => {
    await open(page, 'settings')
    const s = page.locator('#s-discord')
    await s.getByLabel('Webhook URL').fill(GOOD)
    await s.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Discord settings saved.')).toBeVisible()
    await expect(s.getByText('discord.com webhook …5678')).toBeVisible()
    await expect(s.getByLabel(/Replace the webhook/)).toHaveValue('')
    await expect(s).not.toContainText('abcdefghijklmnop')
    await s.getByRole('button', { name: 'Send test' }).click()
    await expect(page.getByText('Test sent. Check your Discord channel.')).toBeVisible()
  })

  test('a URL that is not Discord is refused inline', async ({ page }) => {
    await open(page, 'settings')
    const s = page.locator('#s-discord')
    await expect(s.getByRole('button', { name: 'Send test' })).toBeDisabled()
    for (const bad of [
      'https://example.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'not a url',
    ]) {
      await s.getByLabel('Webhook URL').fill(bad)
      await s.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(s.getByRole('alert')).toHaveText(
        /starts with https:\/\/discord\.com\/api\/webhooks\//,
      )
      await expect(s.getByLabel('Webhook URL')).toHaveAttribute('aria-invalid', 'true')
    }
    await expect(s.getByText('Saved', { exact: true })).toHaveCount(0)
  })

  test('an empty or unclosed message is explained', async ({ page }) => {
    await open(page, 'settings')
    const s = page.locator('#s-discord')
    await s.getByLabel('Message').fill('')
    await s.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(s.getByRole('alert')).toHaveText(/^Write a message of 1 to 1,500 characters/)
    await s.getByLabel('Message').fill('{name is live')
    await s.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(s.getByRole('alert')).toHaveText(/is never closed/)
  })

  test('OBS found on this computer is used without a click, and typed details win', async ({
    page,
  }) => {
    await open(page, 'settings')
    const s = page.locator('#s-obs')
    await expect(s.getByText('Using OBS’s own settings')).toBeVisible()
    await expect(s.getByLabel('Password', { exact: true })).toHaveAttribute(
      'placeholder',
      'From OBS. Type to replace',
    )
    await expect(s.getByText('Found OBS on this computer')).toBeHidden()

    // The streamer types other details: the toast says what really happened.
    await s.getByLabel('Port').fill('4460')
    await s.getByRole('button', { name: 'Connect OBS' }).click()
    const toasts = page.getByRole('region', { name: 'Notifications' })
    await expect(toasts.getByText('Saved, but OBS isn’t connected yet.')).toBeVisible()
    await expect(toasts.getByText('OBS connected.')).toHaveCount(0)
    await expect(s.getByText('Disconnected')).toBeVisible()
    await expect(s.getByText('Using OBS’s own settings')).toBeHidden()

    // OBS's own details are offered back, one click.
    await expect(s.getByText(/Port 4455, password included/)).toBeVisible()
    await s.getByRole('button', { name: 'Use these' }).click()
    await expect(toasts.getByText('OBS connected.')).toBeVisible()
    await expect(toasts.getByText('Saved, but OBS isn’t connected yet.')).toHaveCount(0)
    await expect(s.getByText('Found OBS on this computer')).toBeHidden()
    await expect(page.locator('header a[href$="settings/obs"]').first()).toContainText('Connected')
  })
})

test.describe('bot: starter commands', () => {
  test('the button goes away once all four are there', async ({ page }) => {
    await open(page, 'bot')
    const add = page.getByRole('button', { name: 'Add starter commands' })
    await add.first().click()
    await expect(page.getByText(/^Added /)).toBeVisible()
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible()) await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(add).toHaveCount(0)
    for (const name of ['!socials', '!lurk', '!uptime', '!so'])
      await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toHaveCount(1)
  })
})

test.describe('overlay editor: poll and giveaway widgets', () => {
  test('add both and save', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    for (const kind of ['Poll', 'Giveaway']) {
      await page.getByRole('button', { name: 'More to add' }).click()
      await page.getByRole('menuitem', { name: kind }).click()
      await expect(
        page.getByRole('button', { name: new RegExp(`^${kind} widget at`) }),
      ).toBeVisible()
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Overlay saved. OBS updates by itself.')).toBeVisible()
    await expect(page.getByText(/Unsaved layout/)).toBeHidden()
  })
})

test('goals: nudge one by hand, make one, delete one', async ({ page }) => {
  await open(page, 'community')
  const goals = page.locator('#community-goals')
  const subs = goals.getByTestId('goal-row').filter({ hasText: 'Sub goal: new mic' })
  await expect(subs).toContainText('38')
  await subs.getByRole('button', { name: 'Add 1 to Sub goal: new mic' }).click()
  await expect(subs).toContainText('39')
  await expect(subs.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '78')

  await goals.getByRole('button', { name: 'New goal' }).click()
  await goals.getByLabel('Title').fill('100 followers')
  await goals.getByLabel('Target').fill('100')
  await goals.getByRole('button', { name: 'Create goal' }).click()
  const made = goals.getByTestId('goal-row').filter({ hasText: '100 followers' })
  await expect(made).toBeVisible()

  await made.getByRole('button', { name: 'Delete 100 followers' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete goal' }).click()
  await expect(made).toHaveCount(0)
})
