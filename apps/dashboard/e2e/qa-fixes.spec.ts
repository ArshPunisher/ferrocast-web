// The QA findings of 18 Oct, each pinned down: confirmations before bans and disconnects,
// the held-message review, the layout editor's leave check, honest backups, plain counts.

import { expect, test, type Page } from '@playwright/test'
import { demo, fault, open } from './helpers'

const chatLog = (page: Page) => page.getByRole('log', { name: 'Merged chat' })

test.describe('confirmations', () => {
  test('the viewer card asks before banning', async ({ page }) => {
    await open(page, 'chat')
    await chatLog(page)
      .getByRole('listitem')
      .filter({ hasNot: page.getByText('Streamer') })
      .last()
      .getByRole('button')
      .first()
      .click()
    const card = page.getByRole('dialog').last()
    await card.getByRole('button', { name: 'Ban…' }).click()
    const ask = page.getByRole('dialog', { name: /^Ban .+\?$/ })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    await expect(page.getByText(/is banned on/)).toHaveCount(0)
    await card.getByRole('button', { name: 'Ban…' }).click()
    await page
      .getByRole('dialog', { name: /^Ban .+\?$/ })
      .getByRole('button', { name: 'Ban everywhere' })
      .click()
    await expect(page.getByText(/is banned on Twitch, YouTube, Kick/)).toBeVisible()
  })

  test('disconnecting an account asks first', async ({ page }) => {
    await open(page, 'settings/accounts')
    const twitch = page.locator('#settings-accounts').getByRole('listitem').filter({
      hasText: 'Twitch',
    })
    await twitch.getByRole('button', { name: 'Disconnect' }).click()
    const ask = page.getByRole('dialog', { name: 'Disconnect Twitch?' })
    await expect(ask).toContainText('Twitch chat and alerts stop.')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(twitch.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    await twitch.getByRole('button', { name: 'Disconnect' }).click()
    await page.getByRole('button', { name: 'Disconnect Twitch' }).click()
    await expect(page.getByText('Twitch disconnected.')).toBeVisible()
    await expect(twitch.getByRole('button', { name: 'Connect' })).toBeVisible()
  })
})

test.describe('held messages', () => {
  test('approve right on the chat line', async ({ page }) => {
    await open(page, 'chat')
    await demo(page, '(d) => d.holdSpam("twitch")')
    const line = chatLog(page).getByRole('listitem').filter({ hasText: 'Held for review' })
    await line.getByRole('button', { name: /^Approve/ }).click()
    await expect(page.getByText(/Approved\. .+ now shows in chat overlays/)).toBeVisible()
    await expect(page.getByText('Held for review')).toHaveCount(0)
  })

  test('the Held filter lists them and Remove deletes one', async ({ page }) => {
    await open(page, 'chat')
    await demo(page, '(d) => { d.holdSpam("twitch"); d.holdSpam("kick") }')
    const filter = page.getByRole('button', { name: /^Held 2/ })
    await filter.click()
    await expect(filter).toHaveAttribute('aria-pressed', 'true')
    await expect(chatLog(page).getByRole('listitem')).toHaveCount(2)
    await chatLog(page)
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /^Remove/ })
      .click()
    await expect(page.getByText(/Removed\. .+ deleted on/)).toBeVisible()
    await expect(chatLog(page).getByRole('listitem')).toHaveCount(1)
  })

  test('Moderation reviews them with the keyboard', async ({ page }) => {
    await open(page, 'moderation')
    const panel = page.locator('#held')
    await expect(panel.getByText('Nothing waiting')).toBeVisible()
    await demo(page, '(d) => d.holdSpam("youtube")')
    const approve = panel.getByRole('button', { name: /^Approve/ })
    await approve.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Approved\./)).toBeVisible()
    await expect(panel.getByText('Nothing waiting')).toBeVisible()
  })

  test('another mod got there first: treated as done, not an error', async ({ page }) => {
    await open(page, 'moderation')
    const id = await demo<string>(page, '(d) => d.holdSpam("twitch").id')
    // The engine already forgot it (another mod's click won the race).
    await fault(page, {
      path: `/api/v1/mod/held/${id}/release`,
      method: 'POST',
      status: 404,
      code: 'held_not_found',
      message: 'Another mod already dealt with that message.',
    })
    await page
      .locator('#held')
      .getByRole('button', { name: /^Approve/ })
      .click()
    await expect(page.getByText('Another mod already dealt with that message.')).toBeVisible()
    await expect(page.locator('#held').getByText('Nothing waiting')).toBeVisible()
  })
})

test.describe('layout editor', () => {
  test('leaving with unsaved changes asks Save, Discard or Stay', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    const w = page.getByRole('button', { name: /Alerts widget at/ })
    await w.focus()
    await w.press('ArrowRight')
    const home = page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', {
      name: 'Home',
    })
    await home.click()
    const ask = page.getByRole('dialog', { name: 'Save your layout first?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Stay' }).click()
    await expect(page).toHaveURL(/#\/overlays\/ov-brb$/)
    await expect(w).toHaveAccessibleName(/at 568, /)

    await home.click()
    await page.getByRole('button', { name: 'Save and leave' }).click()
    await expect(page.getByText('Overlay saved. OBS updates by itself.')).toBeVisible()
    await expect(page).toHaveURL(/#\/home$/)

    await page.goto('./?autoplay=0&latency=0#/overlays/ov-brb')
    await expect(w).toHaveAccessibleName(/at 568, /)
    await w.press('ArrowRight')
    await page.getByRole('link', { name: 'Back to overlays' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
    await expect(page).toHaveURL(/#\/overlays$/)
  })
})

test.describe('bot', () => {
  test('!socials is added off and asks for links before it can go on', async ({ page }) => {
    await open(page, 'bot')
    await page.getByRole('button', { name: 'Add starter commands' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit !socials' })
    await expect(editor).toContainText('stays off until you do')
    await editor.getByRole('button', { name: 'Cancel' }).click()
    const row = page.getByRole('listitem').filter({ hasText: '!socials' })
    await expect(row.getByText('Add your links', { exact: true })).toBeVisible()
    const on = row.getByRole('switch', { name: '!socials on' })
    await expect(on).not.toBeChecked()
    await on.click()
    await expect(page.getByText('Add your links to !socials first.')).toBeVisible()
    const again = page.getByRole('dialog', { name: 'Edit !socials' })
    await again.getByLabel('Reply').fill('Discord: discord.gg/nova · YouTube: youtube.com/@nova')
    await expect(again).toContainText('!socials switches on when you save.')
    await again.getByRole('button', { name: 'Save' }).click()
    await expect(row.getByRole('switch', { name: '!socials on' })).toBeChecked()
    await expect(row.getByText('Add your links', { exact: true })).toHaveCount(0)
  })

  test('cooldowns read "1 minute"', async ({ page }) => {
    await open(page, 'bot')
    await page.getByRole('button', { name: 'Edit !discord' }).click()
    await expect(page.getByRole('option', { name: '1 minute', exact: true })).toBeAttached()
    await expect(page.getByRole('option', { name: '1 minutes' })).toHaveCount(0)
  })
})

test.describe('settings', () => {
  test('backups say why they were taken, and an import adds one', async ({ page }) => {
    await open(page, 'settings/data')
    const data = page.locator('#settings-data')
    await expect(data.getByText(/Daily, and before every update or import/)).toBeVisible()
    await expect(data.getByText(/^Daily · v/)).toBeVisible()
    await expect(data.getByText(/^Before an update · v0\.3\.0/)).toBeVisible()
    await data.locator('input[type=file]').setInputFiles({
      name: 'setup.ferropack',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    })
    await expect(page.getByRole('dialog', { name: 'Import finished' })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(data.getByText(/^Before an import · v/)).toBeVisible()
    await data.getByRole('button', { name: 'Restore' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click()
    // The demo is live: restoring waits for the stream to end, said plainly.
    await expect(page.getByText(/live right now/)).toBeVisible()
  })

  test('export says the same thing in the section and the toast', async ({ page }) => {
    await open(page, 'settings/data')
    const what = 'overlays with their media, alerts, commands, timers, goals, points and viewers'
    await expect(page.locator('#settings-data').getByText(what)).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    await download
    await expect(page.getByText(`Export saved. It has your ${what}.`)).toBeVisible()
  })

  test('"Allow other devices" says it needs a restart, and so does the link', async ({ page }) => {
    await open(page, 'settings/advanced')
    await page.getByRole('switch', { name: 'Allow other devices on my network' }).click()
    await expect(
      page.getByText('Other devices can connect after you restart Ferrocast.'),
    ).toBeVisible()
    await expect(page.getByText('Restart Ferrocast to let other devices in.')).toBeVisible()
    await page.getByRole('button', { name: 'Make a link' }).click()
    await expect(page.getByText(/on this computer only until you restart/)).toBeVisible()
  })
})

test.describe('words', () => {
  test('top-bar counts say they are viewers', async ({ page }) => {
    await open(page, 'home')
    const twitch = page.getByRole('list', { name: 'Connections' }).getByRole('link', {
      name: /^Twitch: Connected/,
    })
    await expect(twitch).toHaveAccessibleName(/\d viewers?/)
    await expect(twitch.locator('[aria-hidden=true]').getByText(/viewers?$/)).toBeVisible()
  })

  test('skipping "Connect" in first run leaves it unticked', async ({ page }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')
    await page.getByRole('button', { name: 'Skip for now' }).click()
    const steps = page.getByRole('list', { name: 'Setup progress' }).getByRole('listitem')
    await expect(steps.first()).toContainText('(skipped)')
    await expect(steps.nth(1)).toContainText('(current step)')
  })

  test('the first connect says Connecting, not Reconnecting', async ({ page }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')
    const kick = page.getByRole('listitem').filter({ hasText: 'Kick' }).first()
    await kick.getByRole('button', { name: 'Connect' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(kick.getByText('Connecting', { exact: true })).toBeVisible()
    await expect(kick.getByText('Reconnecting')).toHaveCount(0)
  })
})

test.describe('home', () => {
  test('keyboard focus on a chat line stays while chat moves', async ({ page }) => {
    await open(page, 'home')
    const log = page.getByRole('log', { name: 'Latest chat' })
    const first = log.getByRole('listitem').first().getByRole('button').first()
    await first.focus()
    const name = await first.textContent()
    await demo(
      page,
      `(d) => { for (let i = 0; i < 40; i++) d.inject({ type: 'chat_message', actor: { platform: 'twitch', id: 'flood' + i, login: 'flood' + i, display_name: 'Flood' + i, avatar_url: null, color: null, roles: 0, badges: [], anonymous: false }, content: { text: 'hi', fragments: [{ type: 'text', text: 'hi' }] }, reply_to: null, is_action: false }, 'twitch') }`,
    )
    await expect(log.getByText('Flood39')).toBeAttached()
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
    expect(focused).toBe(name)
  })
})
